// Ball flight: gravity, quadratic air drag, simplified Magnus lift, ground bounce and net collision.
// Integrated with fixed substeps (semi-implicit Euler). Deterministic for a given dt.

import { type Court, netHeightAt } from './court.ts';
import { type Vec3, cross, len } from './vec.ts';

export interface BallState {
  p: Vec3; // centre position (m)
  v: Vec3; // velocity (m/s)
  w: Vec3; // spin (rad/s), world axes
}

export interface PhysicsParams {
  gravity: number;
  ballRadius: number;
  /** Drag acceleration = -dragK * |v| * v. dragK = 0.5 * rho * Cd * A / m. */
  dragK: number;
  /** Magnus acceleration = magnusK * (w x v). */
  magnusK: number;
  /** Vertical coefficient of restitution on the court surface. */
  restitution: number;
  /** Fraction of tangential velocity kept per bounce. */
  bounceFriction: number;
  /** Spin decay per second in flight. */
  spinDecay: number;
  /** Fraction of velocity kept after hitting the net mesh. */
  netDamping: number;
}

export function pickleballPhysics(): PhysicsParams {
  const rho = 1.225;
  const r = 0.037;
  const area = Math.PI * r * r;
  const cd = 0.4; // perforated ball: higher drag than a smooth sphere
  const mass = 0.026;
  return {
    gravity: 9.81,
    ballRadius: r,
    dragK: (0.5 * rho * cd * area) / mass,
    magnusK: 0.0006,
    // Spec: dropped from 78 in, rebound 30-34 in -> e ~ 0.64 in vacuum; 0.68 here because air drag also bleeds energy
    restitution: 0.68,
    bounceFriction: 0.8,
    spinDecay: 0.4,
    netDamping: 0.15,
  };
}

export type PhysicsEvent =
  | { type: 'bounce'; p: Vec3; speed: number }
  | { type: 'net'; p: Vec3 }
  | { type: 'netCord'; p: Vec3 }
  | { type: 'crossNet'; p: Vec3 };

export interface StepOptions {
  /** When false the net is ignored (used by the shot solver's drag correction). */
  collideNet?: boolean;
}

/** Advance the ball by dt (seconds), mutating it. Returns events that occurred during the step. */
export function stepBall(
  ball: BallState,
  dt: number,
  params: PhysicsParams,
  court: Court,
  opts: StepOptions = {},
): PhysicsEvent[] {
  const events: PhysicsEvent[] = [];
  const { p, v, w } = ball;
  const speed = len(v);

  // Accelerations
  const drag = -params.dragK * speed;
  const mag = cross(w, v);
  const ax = drag * v.x + params.magnusK * mag.x;
  const ay = drag * v.y + params.magnusK * mag.y - params.gravity;
  const az = drag * v.z + params.magnusK * mag.z;

  v.x += ax * dt;
  v.y += ay * dt;
  v.z += az * dt;

  const prevZ = p.z;
  const prevX = p.x;
  const prevY = p.y;
  p.x += v.x * dt;
  p.y += v.y * dt;
  p.z += v.z * dt;

  const decay = Math.max(0, 1 - params.spinDecay * dt);
  w.x *= decay;
  w.y *= decay;
  w.z *= decay;

  // Net: vertical plane at z = 0 between the posts.
  const r = params.ballRadius;
  if (opts.collideNet !== false && Math.sign(prevZ) !== Math.sign(p.z) && prevZ !== 0) {
    const t = prevZ / (prevZ - p.z);
    const cx = prevX + (p.x - prevX) * t;
    const cy = prevY + (p.y - prevY) * t;
    const span = court.halfWidth + court.netPostOffset;
    const top = netHeightAt(court, cx);
    if (Math.abs(cx) <= span && cy - r < top) {
      if (cy < top + r * 0.25) {
        // Blocked by the net: bounce back weakly onto the hitter's side.
        const back = Math.sign(prevZ) || 1;
        p.z = back * (r + 0.001);
        p.x = cx;
        p.y = Math.max(r, cy);
        v.z = -v.z * params.netDamping;
        v.x *= 0.4;
        v.y = Math.min(v.y, 0) * 0.4;
        events.push({ type: 'net', p: { x: cx, y: cy, z: 0 } });
      } else {
        // Clipped the tape but rolled over: lose pace, pop up slightly.
        v.x *= 0.7;
        v.z *= 0.55;
        v.y = Math.abs(v.y) * 0.3 + 0.6;
        events.push({ type: 'netCord', p: { x: cx, y: cy, z: 0 } });
        events.push({ type: 'crossNet', p: { x: cx, y: cy, z: 0 } });
      }
    } else {
      events.push({ type: 'crossNet', p: { x: cx, y: cy, z: 0 } });
    }
  }

  // Ground
  if (p.y < r && v.y < 0) {
    const impactSpeed = -v.y;
    p.y = r;
    if (impactSpeed > 0.35) {
      events.push({ type: 'bounce', p: { x: p.x, y: 0, z: p.z }, speed: impactSpeed });
      v.y = impactSpeed * params.restitution;
      // Spin transfers into the tangential velocity (topspin kicks forward, slice skids/holds).
      const kick = 0.25 * r;
      v.x = (v.x + w.z * kick) * params.bounceFriction;
      v.z = (v.z - w.x * kick) * params.bounceFriction;
      w.x *= 0.5;
      w.y *= 0.5;
      w.z *= 0.5;
    } else {
      // Rolling: emit a final bounce so rules engines see a "dead" ball, then roll to a stop.
      if (impactSpeed > 0.05) events.push({ type: 'bounce', p: { x: p.x, y: 0, z: p.z }, speed: impactSpeed });
      v.y = 0;
      const roll = Math.max(0, 1 - 1.5 * dt);
      v.x *= roll;
      v.z *= roll;
    }
  }
  return events;
}

export function cloneBall(b: BallState): BallState {
  return { p: { ...b.p }, v: { ...b.v }, w: { ...b.w } };
}

export interface TrajectorySample {
  t: number;
  p: Vec3;
  v: Vec3;
  bounces: number;
}

/**
 * Predict a trajectory without mutating the ball. Stops after maxT seconds,
 * after `maxBounces` bounces, or when the ball is blocked by the net.
 */
export function predictTrajectory(
  ball: BallState,
  params: PhysicsParams,
  court: Court,
  maxT: number,
  dt: number,
  maxBounces = 2,
): TrajectorySample[] {
  const b = cloneBall(ball);
  const out: TrajectorySample[] = [];
  let bounces = 0;
  for (let t = 0; t <= maxT; t += dt) {
    const ev = stepBall(b, dt, params, court);
    for (const e of ev) {
      if (e.type === 'bounce') bounces++;
      if (e.type === 'net') return out;
    }
    out.push({ t: t + dt, p: { ...b.p }, v: { ...b.v }, bounces });
    if (bounces >= maxBounces) break;
  }
  return out;
}
