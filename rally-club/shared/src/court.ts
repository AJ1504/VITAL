// Regulation court geometry. Pickleball values follow the USA Pickleball rulebook
// (20 ft x 44 ft court, 7 ft non-volley zone, net 36 in at sidelines / 34 in at centre).
// The Court interface is sport-agnostic so tennis and padel (P4) can plug in their own dimensions.

import type { Vec3 } from './vec.ts';

const FT = 0.3048;
const IN = 0.0254;

export interface Court {
  sport: 'pickleball' | 'tennis' | 'padel';
  /** Full width sideline-to-sideline, measured to the outside edge of the lines (lines are in). */
  width: number;
  /** Full length baseline-to-baseline. */
  length: number;
  /** Non-volley zone ("kitchen") depth from the net. 0 for sports without one. */
  nvzDepth: number;
  lineWidth: number;
  netHeightPost: number;
  netHeightCenter: number;
  /** Net posts sit this far outside each sideline. */
  netPostOffset: number;
  halfWidth: number;
  halfLength: number;
}

export function createPickleballCourt(): Court {
  const width = 20 * FT;
  const length = 44 * FT;
  return {
    sport: 'pickleball',
    width,
    length,
    nvzDepth: 7 * FT,
    lineWidth: 2 * IN,
    netHeightPost: 36 * IN,
    netHeightCenter: 34 * IN,
    netPostOffset: 12 * IN,
    halfWidth: width / 2,
    halfLength: length / 2,
  };
}

/** Net top height at lateral position x (linear sag from post to centre). */
export function netHeightAt(court: Court, x: number): number {
  const span = court.halfWidth + court.netPostOffset;
  const t = Math.min(1, Math.abs(x) / span);
  return court.netHeightCenter + (court.netHeightPost - court.netHeightCenter) * t;
}

export type Side = 0 | 1;

/** +1 for side 0 (z > 0), -1 for side 1 (z < 0). */
export const sideSign = (side: Side): 1 | -1 => (side === 0 ? 1 : -1);
export const otherSide = (side: Side): Side => (side === 0 ? 1 : 0);
/** Which side's half a ground point lies in. A point exactly on z=0 is treated as side 0. */
export const sideOfPoint = (p: Vec3): Side => (p.z >= 0 ? 0 : 1);

const EPS = 1e-9;

/** In bounds for a rally ball: lines are in. */
export function inCourt(court: Court, p: Vec3): boolean {
  return Math.abs(p.x) <= court.halfWidth + EPS && Math.abs(p.z) <= court.halfLength + EPS;
}

/** Inside the non-volley zone (kitchen line counts as kitchen). */
export function inKitchen(court: Court, p: Vec3): boolean {
  return Math.abs(p.z) <= court.nvzDepth + EPS;
}

/**
 * The service court a serve must land in.
 * @param receiverSide side receiving the serve
 * @param xSign sign of x for the target box (+1 or -1)
 * Kitchen line is a fault on the serve; centre line, sideline and baseline are in.
 */
export function inServiceBox(court: Court, p: Vec3, receiverSide: Side, xSign: 1 | -1): boolean {
  const s = sideSign(receiverSide);
  const zAbs = p.z * s; // distance from net into the receiver's half
  if (zAbs <= court.nvzDepth + EPS) return false; // kitchen or kitchen line
  if (zAbs > court.halfLength + EPS) return false; // long
  const halfCenterLine = court.lineWidth / 2;
  const xRel = p.x * xSign; // distance from centre towards target sideline
  if (xRel < -halfCenterLine - EPS) return false; // wrong court
  if (xRel > court.halfWidth + EPS) return false; // wide
  return true;
}
