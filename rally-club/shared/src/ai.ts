// Computer opponent. Produces the same ControlInput a human or phone controller would, so it can be
// swapped for a real player at any time (and used to drive both sides in automated soak tests).

import { type Side, inKitchen, sideSign } from './court.ts';
import { type ControlInput, type MatchSim, type StrokeShot, NO_INPUT, REACH_BY_ASSIST, SWING_IDEAL } from './match.ts';
import { type Rng, createRng } from './rng.ts';
import { clamp, distXZ } from './vec.ts';

export interface AiProfile {
  /** Seconds before serving once the point is set up. */
  serveDelay: number;
  /** Probability of letting an out-bound ball go (vs. playing it). */
  judgement: number;
  /** Fraction of the reach at which the AI commits to a swing. */
  commitReach: number;
  /** Mean timing offset in seconds (adds error to contact quality). */
  timingJitter: number;
  aggression: number;
  /** Shot error multiplier applied to the AI's player. */
  errorScale: number;
}

export const AI_PROFILES: Record<'easy' | 'medium' | 'hard', AiProfile> = {
  easy: { serveDelay: 1.4, judgement: 0.4, commitReach: 0.75, timingJitter: 0.22, aggression: 0.2, errorScale: 2.2 },
  medium: { serveDelay: 1.1, judgement: 0.7, commitReach: 0.7, timingJitter: 0.15, aggression: 0.45, errorScale: 1.6 },
  hard: { serveDelay: 0.9, judgement: 0.92, commitReach: 0.65, timingJitter: 0.08, aggression: 0.7, errorScale: 1.15 },
};

export class AiController {
  readonly side: Side;
  readonly profile: AiProfile;
  private rng: Rng;
  private serveClock = 0;
  private swungThisBall = false;
  private lastHitCount = -1;
  private decidedLetGo: boolean | null = null;
  private lead: number | null = null;
  private kitchenLapse: boolean | null = null;

  constructor(side: Side, profile: AiProfile = AI_PROFILES.medium, seed = 99) {
    this.side = side;
    this.profile = profile;
    this.rng = createRng(seed);
  }

  /** Call once per rendered frame (or per fixed step) with the elapsed time. */
  think(sim: MatchSim, dt: number): ControlInput {
    const st = sim.rules.state;
    const me = sim.players[this.side];
    me.errorScale = this.profile.errorScale;

    if (sim.mode === 'match' && st.phase === 'awaiting_serve') {
      this.swungThisBall = false;
      this.decidedLetGo = null;
      if (st.server !== this.side) return NO_INPUT;
      this.serveClock += dt;
      if (this.serveClock >= this.profile.serveDelay) {
        this.serveClock = 0;
        const aim = (this.rng() * 2 - 1) * 0.7;
        return { moveX: 0, moveZ: 0, swing: { shot: this.rng() < 0.15 ? 'lob' : 'drive', aim } };
      }
      return NO_INPUT;
    }
    this.serveClock = 0;

    // New stroke by the opponent: re-arm.
    const hc = sim.mode === 'match' ? st.hitCount : sim.practice.feeds;
    if (hc !== this.lastHitCount) {
      this.lastHitCount = hc;
      this.swungThisBall = false;
      this.decidedLetGo = null;
      this.lead = null;
      this.kitchenLapse = null;
    }

    if (!sim.ballIncomingFor(this.side) || this.swungThisBall) return NO_INPUT; // auto-positioning handles movement

    const plan = sim.intercept(this.side);
    if (!plan) return NO_INPUT;

    // Line judgement: let a ball that will land out go by (if it hasn't bounced yet).
    if (plan.ballGoingOut && st.bouncesSinceHit === 0) {
      if (this.decidedLetGo === null) this.decidedLetGo = this.rng() < this.profile.judgement;
      if (this.decidedLetGo) return NO_INPUT;
    }

    // Don't volley from inside the kitchen (an occasional lapse is human).
    if (sim.mode === 'match' && st.bouncesSinceHit === 0 && inKitchen(sim.court, me.pos)) {
      if (this.kitchenLapse === null) this.kitchenLapse = this.rng() < 0.08;
      if (!this.kitchenLapse) return NO_INPUT;
    }

    // Respect the two-bounce rule.
    if (sim.mode === 'match' && sim.rules.mustLetBounce(this.side) && st.bouncesSinceHit === 0) return NO_INPUT;

    // Press swing slightly before the planned contact (ideal lead = SWING_IDEAL), with human-like jitter.
    const remaining = plan.timeToContact - (sim.time - plan.computedAt);
    if (this.lead === null) this.lead = SWING_IDEAL + (this.rng() - 0.5) * 2 * this.profile.timingJitter;
    const near = distXZ(sim.ball.p, me.pos) < REACH_BY_ASSIST[me.assist] * this.profile.commitReach;
    if (remaining <= this.lead || (near && remaining < 0.3)) {
      this.swungThisBall = true;
      this.lead = null;
      return { moveX: 0, moveZ: 0, swing: { shot: this.chooseShot(sim), aim: this.chooseAim(sim) } };
    }
    return NO_INPUT;
  }

  private chooseShot(sim: MatchSim): StrokeShot {
    const st = sim.rules.state;
    const c = sim.court;
    const me = sim.players[this.side];
    me.errorScale = this.profile.errorScale;
    const opp = sim.players[this.side === 0 ? 1 : 0];
    const s = sideSign(this.side);
    const oppAtNet = Math.abs(opp.pos.z) < c.nvzDepth + 1.2;
    const meAtNet = me.pos.z * s < c.nvzDepth + 1.0;
    const r = this.rng();
    if (sim.mode === 'match' && st.hitCount === 2 && r < 0.45) return 'drop'; // classic third-shot drop
    if (meAtNet && sim.ball.p.y < 0.95 && r < 0.75) return 'dink';
    if (meAtNet && sim.ball.p.y >= 0.95) return 'drive'; // put it away
    if (oppAtNet && r < 0.12 + this.profile.aggression * 0.08) return 'lob';
    return 'drive';
  }

  private chooseAim(sim: MatchSim): number {
    // Aim away from the opponent, in our own frame (+ = our right).
    const opp = sim.players[this.side === 0 ? 1 : 0];
    const s = sideSign(this.side);
    const oppRight = clamp((opp.pos.x * s) / sim.court.halfWidth, -1, 1);
    const away = -Math.sign(oppRight || this.rng() - 0.5);
    return clamp(away * (0.3 + this.profile.aggression * 0.5) + (this.rng() - 0.5) * 0.6, -1, 1);
  }
}
