// Shot solver: turns "hit from here to land there with this kind of shot" into a launch velocity.
// Starts from the analytic ballistic solution, then corrects for drag by shooting-method iteration,
// lengthening flight time until the arc clears the net with the requested margin.

import { type Court, netHeightAt } from './court.ts';
import { type BallState, type PhysicsParams, stepBall } from './physics.ts';
import { type Vec3, distXZ, v3 } from './vec.ts';

export type ShotType = 'serve' | 'drive' | 'dink' | 'lob' | 'drop';

export interface ShotProfile {
  /** Horizontal speed used to pick the initial flight time (m/s). */
  pace: number;
  minFlightTime: number;
  /** Required height of the ball above the net tape when crossing (m). */
  netClearance: number;
  /** Spin applied (rad/s around the across-court axis; + = topspin toward the target). */
  topspin: number;
}

export const SHOT_PROFILES: Record<ShotType, ShotProfile> = {
  serve: { pace: 12, minFlightTime: 0.9, netClearance: 0.3, topspin: 20 },
  drive: { pace: 15, minFlightTime: 0.55, netClearance: 0.12, topspin: 60 },
  dink: { pace: 4.5, minFlightTime: 0.8, netClearance: 0.1, topspin: 5 },
  drop: { pace: 7, minFlightTime: 1.1, netClearance: 0.2, topspin: -15 },
  lob: { pace: 7, minFlightTime: 1.7, netClearance: 2.0, topspin: 25 },
};

export interface ShotSolution {
  velocity: Vec3;
  spin: Vec3;
  flightTime: number;
  /** Predicted landing point with drag & spin (ignoring the net). */
  landing: Vec3;
  netClearance: number;
}

function ballistic(from: Vec3, to: Vec3, t: number, g: number): Vec3 {
  return v3((to.x - from.x) / t, (to.y - from.y + 0.5 * g * t * t) / t, (to.z - from.z) / t);
}

/** Simulate (no net) until the ball returns to ground level; returns landing point and net crossing height. */
function simulateLanding(
  from: Vec3,
  vel: Vec3,
  spin: Vec3,
  params: PhysicsParams,
  court: Court,
): { landing: Vec3; crossHeight: number | null; crossX: number; t: number } {
  const b: BallState = { p: { ...from }, v: { ...vel }, w: { ...spin } };
  const dt = 1 / 120; // must match the match simulation step for accurate landings
  let crossHeight: number | null = null;
  let crossX = 0;
  for (let t = 0; t < 6; t += dt) {
    const pz = b.p.z;
    const py = b.p.y;
    const px = b.p.x;
    const ev = stepBall(b, dt, params, court, { collideNet: false });
    if (crossHeight === null && Math.sign(pz) !== Math.sign(b.p.z) && pz !== 0) {
      const k = pz / (pz - b.p.z);
      crossHeight = py + (b.p.y - py) * k;
      crossX = px + (b.p.x - px) * k;
    }
    if (ev.some((e) => e.type === 'bounce')) {
      return { landing: { x: b.p.x, y: 0, z: b.p.z }, crossHeight, crossX, t: t + dt };
    }
  }
  return { landing: { x: b.p.x, y: 0, z: b.p.z }, crossHeight, crossX, t: 6 };
}

export function solveShot(
  from: Vec3,
  target: Vec3,
  type: ShotType,
  params: PhysicsParams,
  court: Court,
): ShotSolution {
  const profile = SHOT_PROFILES[type];
  const dist = distXZ(from, target);
  const dirZ = Math.sign(target.z - from.z) || 1;
  // Topspin axis: rotation about x such that the top of the ball moves toward the target.
  const spin = v3(-dirZ * profile.topspin, 0, 0);
  const groundTarget = v3(target.x, params.ballRadius, target.z);

  let t = Math.max(profile.minFlightTime, dist / profile.pace);
  let best: ShotSolution | null = null;
  for (let attempt = 0; attempt < 25; attempt++) {
    // Shooting method: aim point is adjusted by the landing error to compensate for drag/spin.
    let aim = { ...groundTarget };
    let vel = ballistic(from, aim, t, params.gravity);
    let sim = simulateLanding(from, vel, spin, params, court);
    for (let i = 0; i < 6; i++) {
      const ex = groundTarget.x - sim.landing.x;
      const ez = groundTarget.z - sim.landing.z;
      if (Math.hypot(ex, ez) < 0.005) break;
      aim = v3(aim.x + ex, aim.y, aim.z + ez);
      vel = ballistic(from, aim, t, params.gravity);
      sim = simulateLanding(from, vel, spin, params, court);
    }
    const clearance =
      sim.crossHeight === null ? Infinity : sim.crossHeight - params.ballRadius - netHeightAt(court, sim.crossX);
    best = { velocity: vel, spin, flightTime: sim.t, landing: sim.landing, netClearance: clearance };
    if (clearance >= profile.netClearance) return best;
    t *= 1.08; // higher, slower arc
  }
  return best!;
}

/** Contact quality 0..1 -> landing error standard deviation (m). */
export function shotErrorRadius(quality: number, precisionMode: boolean): number {
  const base = precisionMode ? 2.0 : 1.3;
  const q = Math.max(0, Math.min(1, quality));
  return base * (1 - q) + (precisionMode ? 0.12 : 0.08);
}
