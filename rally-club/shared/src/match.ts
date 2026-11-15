// MatchSim: the engine-agnostic match loop. Owns the ball, two players, the rules engine and
// contact resolution. Renderers (browser harness, Unreal) feed it ControlInputs and read its state;
// the AtmosphereDirector consumes its events. Runs at a fixed 120 Hz internal step.

import { type Court, type Side, createPickleballCourt, inCourt, inKitchen, otherSide, sideSign } from './court.ts';
import { type BallState, type PhysicsParams, pickleballPhysics, predictTrajectory, stepBall } from './physics.ts';
import { type Rng, createRng, gaussian } from './rng.ts';
import { PickleballRules, type RuleEvent } from './rules/pickleball.ts';
import { type ShotType, shotErrorRadius, solveShot } from './shot.ts';
import { type Vec3, clamp, distXZ, v3 } from './vec.ts';

export const SIM_DT = 1 / 120;

export type GameMode = 'match' | 'practice';
/** casual: auto-move, generous reach, bounce assist. classic: Wii-like auto-move. precision: manual everything. */
export type AssistLevel = 'casual' | 'classic' | 'precision';
export type StrokeShot = Exclude<ShotType, 'serve'>;

export interface SwingRequest {
  shot: StrokeShot;
  /** Lateral aim in the player's own frame: -1 = their left, +1 = their right. */
  aim: number;
  /**
   * Wii-style one-button aiming: direction comes from swing timing instead of `aim`. Swinging early pulls
   * the ball crosscourt (left on a right-hander's forehand), late pushes it down the line.
   */
  timingAim?: boolean;
}

export interface ControlInput {
  /** Desired movement in the player's own frame (x: right, z: toward net), -1..1. */
  moveX: number;
  moveZ: number;
  swing: SwingRequest | null;
}

export const NO_INPUT: ControlInput = { moveX: 0, moveZ: 0, swing: null };

export type Stroke = 'forehand' | 'backhand' | 'serve';
export type PlayerAnim = 'ready' | 'run' | 'swing' | 'celebrate' | 'dejected';

export interface PlayerState {
  side: Side;
  name: string;
  pos: Vec3;
  vel: Vec3;
  handedness: 'right' | 'left';
  assist: AssistLevel;
  /** Multiplier on shot error (1 = human baseline; AI difficulty raises it). */
  errorScale: number;
  /** Seconds left in the current swing window (0 = not swinging). */
  swingWindow: number;
  swingElapsed: number;
  /** Closest ball distance seen during the current swing window (contact waits for the sweet spot). */
  closestDist: number;
  pendingSwing: SwingRequest | null;
  /** 0..1 progress of the visible swing animation. */
  swingAnim: number;
  stroke: Stroke;
  anim: PlayerAnim;
  /** Last frame's auto-position target (for debug overlays). */
  autoTarget: Vec3 | null;
}

export type SimEvent =
  | RuleEvent
  | { type: 'match_start'; server: Side }
  | { type: 'contact'; side: Side; quality: number; perfect: boolean; shot: ShotType; stroke: Stroke; speed: number }
  | { type: 'whiff'; side: Side }
  | { type: 'net_touch'; p: Vec3 }
  | { type: 'net_cord'; p: Vec3 }
  | { type: 'ball_bounce'; p: Vec3; speed: number }
  | { type: 'point_reset'; server: Side }
  | { type: 'practice_feed' }
  | { type: 'practice_result'; good: boolean; streak: number; best: number };

export interface MatchOptions {
  mode?: GameMode;
  assist?: [AssistLevel, AssistLevel];
  pointsToWin?: number;
  firstServer?: Side;
  seed?: number;
  names?: [string, string];
}

const REACH: Record<AssistLevel, number> = { casual: 1.45, classic: 1.15, precision: 0.9 };
const WINDOW: Record<AssistLevel, number> = { casual: 0.7, classic: 0.5, precision: 0.35 };
/** Ideal time between pressing swing and contact, and the tolerance around it. */
export const SWING_IDEAL = 0.15;
const TIMING_TOL: Record<AssistLevel, number> = { casual: 0.35, classic: 0.22, precision: 0.13 };
export const REACH_BY_ASSIST = REACH;
const SPEED: Record<AssistLevel, number> = { casual: 5.6, classic: 5.2, precision: 5.0 };
const POINT_PAUSE = 1.9;

export interface InterceptPlan {
  /** Ball position where contact is planned. */
  contact: Vec3;
  /** Where the player's feet should be. */
  stand: Vec3;
  timeToContact: number;
  /** sim.time when this plan was computed. */
  computedAt: number;
  afterBounce: boolean;
  /** Predicted first bounce is out of bounds (a smart player lets it go). */
  ballGoingOut: boolean;
}

export class MatchSim {
  readonly court: Court;
  readonly physics: PhysicsParams;
  readonly mode: GameMode;
  readonly rules: PickleballRules;
  readonly players: [PlayerState, PlayerState];
  ball: BallState;
  /** Is the ball being held by the server / machine (not in flight)? */
  ballHeld = true;
  time = 0;
  pointTimer = 0;
  rng: Rng;
  private events: SimEvent[] = [];
  private accumulator = 0;
  private interceptCache: [InterceptPlan | null, InterceptPlan | null] = [null, null];
  private interceptAge: [number, number] = [99, 99];

  // Practice-mode state
  practice = { streak: 0, best: 0, feeds: 0, good: 0, awaitingReturn: false, playerHit: false, bounces: 0, feedTimer: 1.2 };

  constructor(opts: MatchOptions = {}) {
    this.court = createPickleballCourt();
    this.physics = pickleballPhysics();
    this.mode = opts.mode ?? 'match';
    this.rng = createRng(opts.seed ?? 1234);
    this.rules = new PickleballRules(this.court, { pointsToWin: opts.pointsToWin ?? 11 }, opts.firstServer ?? 0);
    const assist = opts.assist ?? ['classic', 'classic'];
    const names = opts.names ?? ['You', 'Rival'];
    this.players = [0, 1].map((i) => {
      const side = i as Side;
      return {
        side,
        name: names[i],
        pos: v3(0, 0, sideSign(side) * (this.court.halfLength - 0.3)),
        vel: v3(),
        handedness: 'right',
        assist: assist[i],
        errorScale: 1,
        swingWindow: 0,
        swingElapsed: 0,
        closestDist: Infinity,
        pendingSwing: null,
        swingAnim: 0,
        stroke: 'forehand',
        anim: 'ready',
        autoTarget: null,
      } satisfies PlayerState;
    }) as [PlayerState, PlayerState];
    this.ball = { p: v3(0, 1, 0), v: v3(), w: v3() };
    if (this.mode === 'match') {
      this.setupServe();
      this.emit({ type: 'match_start', server: this.rules.state.server });
    } else {
      this.players[1].pos = v3(0, 0, -this.court.halfLength - 0.8);
      this.ball.p = this.machinePos();
    }
  }

  // ---------------------------------------------------------------- public API

  /** Advance by real elapsed time; internally runs fixed 120 Hz steps. */
  update(dt: number, inputs: [ControlInput, ControlInput]): void {
    this.accumulator += Math.min(dt, 0.1);
    while (this.accumulator >= SIM_DT) {
      this.fixedStep(inputs);
      this.accumulator -= SIM_DT;
      // Swing requests are edge-triggered: consume after the first substep.
      inputs = [{ ...inputs[0], swing: null }, { ...inputs[1], swing: null }];
    }
  }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  get isOver(): boolean {
    return this.rules.state.phase === 'game_over';
  }

  /** Plan where `side` should be to strike the incoming ball (cached for 0.08 s). */
  intercept(side: Side): InterceptPlan | null {
    if (this.interceptAge[side] < 0.08) return this.interceptCache[side];
    this.interceptAge[side] = 0;
    this.interceptCache[side] = this.computeIntercept(side);
    return this.interceptCache[side];
  }

  /** Is the ball currently travelling toward / playable by `side`? */
  ballIncomingFor(side: Side): boolean {
    if (this.ballHeld) return false;
    if (this.mode === 'practice') return side === 0 && !this.practice.playerHit && this.practice.awaitingReturn;
    const st = this.rules.state;
    return st.phase === 'in_play' && st.lastHitter !== side;
  }

  readyPosition(side: Side): Vec3 {
    const s = sideSign(side);
    const st = this.rules.state;
    const p = this.players[side];
    // After the third shot, classic/casual players drift toward the kitchen line.
    const atNet = this.mode === 'match' && st.hitCount >= 3 && p.assist !== 'precision';
    const depth = atNet ? this.court.nvzDepth + 0.5 : this.court.halfLength - 0.4;
    return v3(clamp(this.ball.p.x * 0.35, -1.2, 1.2), 0, s * depth);
  }

  // ---------------------------------------------------------------- simulation

  private fixedStep(inputs: [ControlInput, ControlInput]): void {
    const dt = SIM_DT;
    this.time += dt;
    this.interceptAge[0] += dt;
    this.interceptAge[1] += dt;

    if (this.mode === 'match') this.updateMatchPhase(dt);
    else this.updatePracticeFeed(dt);

    for (const p of this.players) {
      if (this.mode === 'practice' && p.side === 1) continue; // side 1 is the ball machine
      this.updatePlayer(p, inputs[p.side], dt);
    }

    if (this.ballHeld) {
      this.ball.p = this.mode === 'match' ? this.serveBallPos() : this.machinePos();
      this.ball.v = v3();
    } else {
      for (const e of stepBall(this.ball, dt, this.physics, this.court)) {
        if (e.type === 'bounce') {
          this.emit({ type: 'ball_bounce', p: e.p, speed: e.speed });
          if (this.mode === 'match') this.emitAll(this.rules.bounce(e.p));
          else this.practiceBounce(e.p);
        } else if (e.type === 'net') this.emit({ type: 'net_touch', p: e.p });
        else if (e.type === 'netCord') this.emit({ type: 'net_cord', p: e.p });
      }
      // Ball has left the venue entirely: treat as a bounce far out so the rules resolve it.
      if (Math.abs(this.ball.p.z) > 40 || Math.abs(this.ball.p.x) > 30) {
        const p = v3(this.ball.p.x, 0, this.ball.p.z);
        if (this.mode === 'match') this.emitAll(this.rules.bounce(p));
        this.ball.v = v3();
        this.ball.p = v3(0, -5, 0);
      }
    }

    for (const p of this.players) this.resolveContact(p);
  }

  private updateMatchPhase(dt: number): void {
    const st = this.rules.state;
    if (st.phase === 'point_over') {
      this.pointTimer -= dt;
      if (this.pointTimer <= 0) {
        this.rules.nextPoint();
        this.setupServe();
        this.emit({ type: 'point_reset', server: st.server });
      }
    }
  }

  private setupServe(): void {
    const st = this.rules.state;
    this.players[st.server].pos = this.rules.serverPosition();
    this.players[otherSide(st.server)].pos = this.rules.receiverPosition();
    for (const p of this.players) {
      p.vel = v3();
      p.swingWindow = 0;
      p.pendingSwing = null;
      p.anim = 'ready';
    }
    this.ballHeld = true;
    this.ball.w = v3();
    this.interceptAge = [99, 99];
  }

  private serveBallPos(): Vec3 {
    const sp = this.players[this.rules.state.server];
    const s = sideSign(sp.side);
    return v3(sp.pos.x + 0.35 * s * (sp.handedness === 'right' ? 1 : -1), 0.75, sp.pos.z - s * 0.35);
  }

  private machinePos(): Vec3 {
    return v3(0, 0.9, -this.court.halfLength - 0.6);
  }

  private updatePlayer(p: PlayerState, input: ControlInput, dt: number): void {
    const st = this.rules.state;
    const s = sideSign(p.side);
    const locked = this.mode === 'match' && (st.phase === 'awaiting_serve' || st.phase === 'game_over');

    if (input.swing && p.swingWindow <= 0) {
      p.pendingSwing = input.swing;
      p.swingWindow = WINDOW[p.assist];
      p.swingElapsed = 0;
      p.closestDist = Infinity;
    }

    // Serve: the server's swing request launches the serve immediately.
    if (this.mode === 'match' && st.phase === 'awaiting_serve' && p.side === st.server && p.pendingSwing) {
      this.performServe(p, p.pendingSwing);
      p.pendingSwing = null;
      p.swingWindow = 0;
      p.swingAnim = 0.001;
      p.stroke = 'serve';
    }

    if (p.swingWindow > 0) {
      p.swingElapsed += dt;
      p.swingWindow -= dt;
      if (p.swingWindow <= 0 && p.pendingSwing) {
        p.pendingSwing = null;
        p.swingAnim = 0.001; // play a whiff animation
        this.emit({ type: 'whiff', side: p.side });
      }
    }
    if (p.swingAnim > 0) {
      p.swingAnim += dt / 0.35;
      if (p.swingAnim >= 1) p.swingAnim = 0;
    }

    if (locked) {
      p.vel = v3();
      p.anim = st.phase === 'game_over' ? (st.winner === p.side ? 'celebrate' : 'dejected') : 'ready';
      return;
    }

    // Desired velocity: manual input (player frame -> world) plus auto-positioning.
    const speed = SPEED[p.assist];
    let wx = input.moveX * s; // side 0 faces -z: their right is +x
    let wz = -input.moveZ * s; // "toward net" is -z for side 0
    const manual = Math.hypot(wx, wz) > 0.05;
    p.autoTarget = null;
    if (p.assist !== 'precision' && !manual) {
      const target = this.autoTarget(p);
      if (target) {
        p.autoTarget = target;
        const dx = target.x - p.pos.x;
        const dz = target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.04) {
          const k = Math.min(1, d / 0.6);
          wx = (dx / d) * k;
          wz = (dz / d) * k;
        }
      }
    }
    const mag = Math.hypot(wx, wz);
    if (mag > 1) {
      wx /= mag;
      wz /= mag;
    }
    const accel = 1 - Math.exp(-14 * dt);
    p.vel.x += (wx * speed - p.vel.x) * accel;
    p.vel.z += (wz * speed - p.vel.z) * accel;
    p.pos.x += p.vel.x * dt;
    p.pos.z += p.vel.z * dt;
    // Stay on our own half (can approach the net but not cross it).
    const hw = this.court.halfWidth + 2.2;
    p.pos.x = clamp(p.pos.x, -hw, hw);
    const zMin = 0.25;
    const zMax = this.court.halfLength + 2.5;
    p.pos.z = s * clamp(p.pos.z * s, zMin, zMax);

    if (st.phase === 'point_over' && this.mode === 'match') {
      p.anim = 'ready';
    } else {
      p.anim = Math.hypot(p.vel.x, p.vel.z) > 0.6 ? 'run' : 'ready';
    }
    if (p.swingAnim > 0) p.anim = 'swing';
  }

  private autoTarget(p: PlayerState): Vec3 | null {
    if (this.mode === 'match' && this.rules.state.phase !== 'in_play') return null;
    if (this.ballIncomingFor(p.side)) {
      const plan = this.intercept(p.side);
      if (plan) return plan.stand;
    }
    if (this.mode === 'practice') return v3(0, 0, this.court.halfLength - 0.6);
    return this.readyPosition(p.side);
  }

  private computeIntercept(side: Side): InterceptPlan | null {
    if (!this.ballIncomingFor(side)) return null;
    const s = sideSign(side);
    const mustBounce = this.mode === 'match' ? this.rules.mustLetBounce(side) : true;
    const traj = predictTrajectory(this.ball, this.physics, this.court, 3.5, SIM_DT * 2, 2);
    const p = this.players[side];
    let firstBounce: Vec3 | null = null;
    let choice: (typeof traj)[number] | null = null;
    let volleyChoice: (typeof traj)[number] | null = null;
    for (const smp of traj) {
      if (smp.bounces >= 1 && !firstBounce) firstBounce = smp.p;
      if (smp.p.z * s < 0.3) continue;
      if (smp.bounces === 0 && !mustBounce && !volleyChoice) {
        // Volley opportunity: comfortable height, outside the kitchen.
        if (smp.p.y > 0.45 && smp.p.y < 1.5 && smp.p.z * s > this.court.nvzDepth + 0.35) volleyChoice = smp;
      }
      if (smp.bounces === 1 && !choice) {
        // After the bounce: first moment the ball is above knee height (stable as the ball approaches).
        if (smp.p.y > 0.4 || (smp.v.y <= 0 && smp.p.y > 0.15)) choice = smp;
      }
    }
    const going = firstBounce ? !inCourt(this.court, firstBounce) : false;
    let pick = choice ?? traj[traj.length - 1] ?? null;
    if (volleyChoice) {
      // Volley if the bounce point is deep behind us (would force us far back) or we're already forward.
      const bounceDepth = firstBounce ? firstBounce.z * s : 99;
      if (bounceDepth > this.court.halfLength - 0.5 || p.pos.z * s < this.court.halfLength - 2) pick = volleyChoice;
    }
    if (!pick) return null;
    // Stand so the ball is beside us at a comfortable reach on the nearest stroke side.
    const off = 0.55;
    const left = v3(pick.p.x - off, 0, pick.p.z + s * 0.25);
    const right = v3(pick.p.x + off, 0, pick.p.z + s * 0.25);
    const stand = distXZ(left, p.pos) < distXZ(right, p.pos) ? left : right;
    // Never plan a volley from inside the non-volley zone.
    if (pick.bounces === 0) stand.z = s * Math.max(stand.z * s, this.court.nvzDepth + 0.2);
    return {
      contact: { ...pick.p },
      stand,
      timeToContact: pick.t,
      computedAt: this.time,
      afterBounce: pick.bounces >= 1,
      ballGoingOut: going,
    };
  }

  private canStrike(p: PlayerState): boolean {
    if (this.ballHeld || !this.ballIncomingFor(p.side)) return false;
    const b = this.ball.p;
    const s = sideSign(p.side);
    if (b.z * s < -0.02) return false; // still on the other side of the net
    if (b.y < 0.04 || b.y > 2.1) return false;
    if (distXZ(b, p.pos) > REACH[p.assist]) return false;
    if (this.mode === 'match' && p.assist === 'casual' && this.rules.mustLetBounce(p.side) && this.rules.state.bouncesSinceHit === 0) {
      return false; // assist: wait for the bounce the rules require
    }
    if (this.mode === 'match' && p.assist === 'casual' && this.rules.state.bouncesSinceHit === 0 && inKitchen(this.court, p.pos)) {
      return false; // assist: never volley from inside the kitchen
    }
    return true;
  }

  private resolveContact(p: PlayerState): void {
    if (p.swingWindow <= 0 || !p.pendingSwing || !this.canStrike(p)) return;
    // Wait for the sweet spot: strike at the ball's closest approach (or before it dies / the window ends).
    const d = distXZ(this.ball.p, p.pos);
    const closing = d < p.closestDist - 1e-4;
    p.closestDist = Math.min(p.closestDist, d);
    const lowBall = this.ball.p.y < 0.18 && this.ball.v.y < 0;
    if (closing && !lowBall && p.swingWindow > SIM_DT * 1.5) return;
    const req = p.pendingSwing;
    p.pendingSwing = null;
    p.swingWindow = 0;
    p.swingAnim = 0.001;
    const s = sideSign(p.side);

    // Contact quality: ball distance from the sweet spot + swing timing (pressing ~0.15 s before contact is ideal).
    const reach = REACH[p.assist];
    const lateral = Math.abs(this.ball.p.x - p.pos.x);
    const distQ = clamp(1 - Math.abs(d - 0.5) / reach, 0, 1);
    const dt = (p.swingElapsed - SWING_IDEAL) / TIMING_TOL[p.assist];
    const timeQ = clamp(1 - Math.abs(dt), 0, 1);
    // Fast incoming balls are harder to control (reaction penalty, halved for casual assist).
    const incoming = Math.hypot(this.ball.v.x, this.ball.v.y, this.ball.v.z);
    const pacePenalty = clamp((incoming - 11) / 14, 0, 0.5) * (p.assist === 'casual' ? 0.5 : 1);
    const quality = clamp((0.35 * distQ + 0.65 * timeQ) * (1 - pacePenalty) + (p.assist === 'casual' ? 0.1 : 0), 0, 1);
    const perfect = quality > 0.88;
    // Forehand if the ball is on the hand side (in the player's own frame).
    const handSign = p.handedness === 'right' ? 1 : -1;
    const ballRight = (this.ball.p.x - p.pos.x) * s; // + = player's right
    p.stroke = ballRight * handSign >= -0.05 || lateral < 0.1 ? 'forehand' : 'backhand';

    // Two-bounce rule: classic/precision players who volley too early commit the fault.
    if (this.mode === 'match') {
      const ev = this.rules.hit(p.side, p.pos);
      this.emitAll(ev);
    } else {
      this.practice.playerHit = true;
      this.practice.bounces = 0;
    }

    let shot: ShotType = req.shot;
    if (shot === 'dink' && this.ball.p.y > 1.2) shot = 'drive'; // can't dink a high ball softly
    let aim = req.aim;
    if (req.timingAim) {
      const early = clamp((p.swingElapsed - SWING_IDEAL) / TIMING_TOL[p.assist], -1, 1); // + = early
      const pull = p.stroke === 'backhand' ? 1 : -1;
      aim = clamp(early * pull * 0.95 + (this.rng() - 0.5) * 0.2, -1, 1);
    }
    const target = this.chooseTarget(p, shot, aim, quality);
    const sol = solveShot({ ...this.ball.p }, target, shot, this.physics, this.court);
    // Execution error on the launch angle: mistimed swings find the net or sail long.
    const launchErr = shotErrorRadius(quality, p.assist === 'precision') * (p.assist === 'casual' ? 0.4 : 1) * p.errorScale;
    sol.velocity.y += gaussian(this.rng) * launchErr * (shot === 'dink' || shot === 'drop' ? 0.35 : 0.8);
    this.ball.v = sol.velocity;
    this.ball.w = sol.spin;
    this.interceptAge = [99, 99];
    const speed = Math.hypot(sol.velocity.x, sol.velocity.y, sol.velocity.z);
    this.emit({ type: 'contact', side: p.side, quality, perfect, shot, stroke: p.stroke, speed });
  }

  private chooseTarget(p: PlayerState, shot: ShotType, aim: number, quality: number): Vec3 {
    const c = this.court;
    const opp = -sideSign(p.side);
    const margin = p.assist === 'casual' ? 0.75 : p.assist === 'classic' ? 0.5 : 0.25;
    const aimWorld = clamp(aim, -1, 1) * sideSign(p.side); // player's right -> world x
    let x = aimWorld * (c.halfWidth - margin);
    let depth: number;
    switch (shot) {
      case 'dink':
        depth = c.nvzDepth * 0.6;
        x *= 0.7;
        break;
      case 'drop':
        depth = c.nvzDepth * 0.75;
        break;
      case 'lob':
        depth = c.halfLength - margin - 0.3;
        break;
      default:
        depth = c.halfLength - margin - 0.9;
    }
    const err = shotErrorRadius(quality, p.assist === 'precision') * (p.assist === 'casual' ? 0.5 : 1) * p.errorScale;
    x += gaussian(this.rng) * err * 0.8;
    depth += gaussian(this.rng) * err * (shot === 'dink' || shot === 'drop' ? 0.45 : 0.9);
    depth = Math.max(0.4, depth);
    return v3(x, 0, opp * depth);
  }

  private performServe(p: PlayerState, req: SwingRequest): void {
    const c = this.court;
    const ev = this.rules.serve();
    if (ev.length === 0) return;
    this.emitAll(ev);
    const recv = otherSide(p.side);
    const tx = this.rules.targetCourtXSign();
    const margin = p.assist === 'casual' ? 0.5 : p.assist === 'classic' ? 0.35 : 0.15;
    const boxDepth = c.halfLength - c.nvzDepth;
    const aimWorld = clamp(req.aim, -1, 1) * sideSign(p.side);
    // Aim shifts the serve within the target box.
    const boxCentreX = tx * c.halfWidth * 0.5;
    let x = boxCentreX + aimWorld * (c.halfWidth * 0.5 - margin);
    let depth = c.nvzDepth + boxDepth * (req.shot === 'lob' ? 0.85 : 0.68);
    const err = p.assist === 'precision' ? 0.35 : p.assist === 'classic' ? 0.18 : 0.08;
    x += gaussian(this.rng) * err;
    depth += gaussian(this.rng) * err;
    const target = v3(x, 0, sideSign(recv) * depth);
    this.ballHeld = false;
    const from = this.serveBallPos();
    this.ball.p = from;
    const sol = solveShot(from, target, 'serve', this.physics, c);
    this.ball.v = sol.velocity;
    this.ball.w = sol.spin;
    this.interceptAge = [99, 99];
    this.emit({ type: 'contact', side: p.side, quality: 1, perfect: false, shot: 'serve', stroke: 'serve', speed: Math.hypot(sol.velocity.x, sol.velocity.y, sol.velocity.z) });
  }

  // ---------------------------------------------------------------- practice mode

  private updatePracticeFeed(dt: number): void {
    const pr = this.practice;
    if (!this.ballHeld) {
      pr.feedTimer -= dt;
      if (pr.feedTimer <= 0) this.finishPracticeBall(false);
      return;
    }
    pr.feedTimer -= dt;
    if (pr.feedTimer > 0) return;
    // Feed a ball to a random spot in the player's half, alternating forehand/backhand.
    const c = this.court;
    const sideX = pr.feeds % 2 === 0 ? 1 : -1;
    const target = v3(sideX * (0.6 + this.rng() * (c.halfWidth - 1.2)), 0, c.nvzDepth + 1.5 + this.rng() * (c.halfLength - c.nvzDepth - 2.5));
    const from = this.machinePos();
    const sol = solveShot(from, target, this.rng() < 0.2 ? 'lob' : 'drive', this.physics, c);
    this.ball.p = from;
    this.ball.v = sol.velocity;
    this.ball.w = sol.spin;
    this.ballHeld = false;
    pr.feeds++;
    pr.awaitingReturn = true;
    pr.playerHit = false;
    pr.bounces = 0;
    pr.feedTimer = 6;
    this.interceptAge = [99, 99];
    this.emit({ type: 'practice_feed' });
  }

  private practiceBounce(p: Vec3): void {
    const pr = this.practice;
    if (!pr.awaitingReturn) return;
    pr.bounces++;
    if (pr.playerHit) {
      // First bounce after the player's stroke decides the result.
      this.finishPracticeBall(p.z < 0 && inCourt(this.court, p));
    } else if (pr.bounces >= 2) {
      this.finishPracticeBall(false);
    }
  }

  private finishPracticeBall(good: boolean): void {
    const pr = this.practice;
    if (!pr.awaitingReturn) return;
    pr.awaitingReturn = false;
    if (good) {
      pr.good++;
      pr.streak++;
      pr.best = Math.max(pr.best, pr.streak);
    } else pr.streak = 0;
    this.emit({ type: 'practice_result', good, streak: pr.streak, best: pr.best });
    // Reload the machine; the next feed comes after a short pause.
    this.ballHeld = true;
    pr.feedTimer = 1.0;
  }

  // ---------------------------------------------------------------- events

  private emit(e: SimEvent): void {
    this.events.push(e);
    if (e.type === 'point') this.pointTimer = POINT_PAUSE;
  }

  private emitAll(es: RuleEvent[]): void {
    for (const e of es) this.emit(e);
  }
}
