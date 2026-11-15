// Instanced spectators with reactive states (idle, murmur, tension, cheer, gasp, ovation, applause).
// One InstancedMesh per body part keeps draw calls tiny; density scales with the graphics preset.

import * as THREE from 'three';
import type { CrowdState } from '../../../shared/src/atmosphere.ts';
import { surfaceNets, type V3 } from './body.ts';
import { addRim } from './surfaces.ts';
import { HAIR_COLORS, OUTFIT_COLORS, PALETTE, SKIN_TONES } from './palette.ts';

interface Spectator {
  base: THREE.Vector3;
  yaw: number;
  standing: boolean;
  excitability: number;
  phase: number;
  /** Seconds left of an individual flourish (e.g. phone photo / wave). */
  flourish: number;
  hat: boolean;
}

export interface CrowdOptions {
  outfits?: readonly number[];
  /** Fraction of spectators wearing straw boaters / sun hats. */
  hatChance?: number;
  /** Outfit colours for seats flagged `members` (blazers). */
  memberOutfits?: readonly number[];
}


// ------------------------------------------------------------------ sculpted spectator bodies
// One smooth body (torso + legs) per posture, sculpted from a distance field and meshed once; vertex
// shades keep shirts bright and legs a deeper tone of the same outfit colour (instance colour).
const smin = (a: number, b: number, k: number) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
function cap(p: V3, a: V3, b: V3, r0: number, r1: number, sz = 1): number {
  const qz = a[2] + (p[2] - a[2]) / sz;
  const bx = b[0] - a[0];
  const by = b[1] - a[1];
  const bz = b[2] - a[2];
  const l2 = bx * bx + by * by + bz * bz;
  let t = l2 ? ((p[0] - a[0]) * bx + (p[1] - a[1]) * by + (qz - a[2]) * bz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const d = Math.hypot(p[0] - a[0] - bx * t, p[1] - a[1] - by * t, qz - a[2] - bz * t) - (r0 + (r1 - r0) * t);
  return sz < 1 ? d * sz : d;
}
function ell(p: V3, c: V3, r: V3): number {
  const x = (p[0] - c[0]) / r[0];
  const y = (p[1] - c[1]) / r[1];
  const z = (p[2] - c[2]) / r[2];
  return (Math.sqrt(x * x + y * y + z * z) - 1) * Math.min(r[0], r[1], r[2]);
}
function spectatorGeometry(seated: boolean): THREE.BufferGeometry {
  const torso = (p: V3) => {
    let d = ell(p, [0, -0.1, 0.02], [0.15, 0.1, 0.12]);
    d = smin(d, cap(p, [0, -0.05, 0.02], [0, 0.22, 0.01], 0.135, 0.145, 0.8), 0.05);
    d = smin(d, ell(p, [0, 0.2, 0], [0.165, 0.13, 0.11]), 0.05);
    d = smin(d, cap(p, [-0.14, 0.29, 0.01], [0.14, 0.29, 0.01], 0.06, 0.06, 0.85), 0.05);
    return smin(d, cap(p, [0, 0.3, 0.01], [0, 0.43, 0.015], 0.048, 0.044), 0.04);
  };
  const legs = (p: V3) => {
    let d = Infinity;
    for (const sx of [-1, 1]) {
      const hip: V3 = [sx * 0.08, -0.12, 0.0];
      const knee: V3 = seated ? [sx * 0.09, -0.13, -0.38] : [sx * 0.085, -0.5, -0.02];
      const ankle: V3 = seated ? [sx * 0.09, -0.52, -0.41] : [sx * 0.085, -0.86, 0.0];
      let l = cap(p, hip, knee, 0.072, 0.055);
      l = smin(l, cap(p, knee, ankle, 0.052, 0.04), 0.02);
      l = smin(l, ell(p, [ankle[0], ankle[1] - 0.04, ankle[2] - 0.05], [0.048, 0.04, 0.095]), 0.02);
      d = Math.min(d, l);
    }
    return d;
  };
  const field = (p: V3) => smin(torso(p), legs(p), 0.035);
  const { pos, index } = surfaceNets(field, [-0.3, seated ? -0.62 : -0.96, seated ? -0.56 : -0.22], [0.3, 0.5, 0.2], 0.045);
  const n = pos.length / 3;
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const e = 0.004;
  for (let v = 0; v < n; v++) {
    const q: V3 = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const gx = field([q[0] + e, q[1], q[2]]) - field([q[0] - e, q[1], q[2]]);
    const gy = field([q[0], q[1] + e, q[2]]) - field([q[0], q[1] - e, q[2]]);
    const gz = field([q[0], q[1], q[2] + e]) - field([q[0], q[1], q[2] - e]);
    const l = Math.hypot(gx, gy, gz) || 1;
    nor.set([gx / l, gy / l, gz / l], v * 3);
    // Shade: shirt (1.0), legs/shorts (0.62), shoes (near white tint 0.95), neck (skin-ish warm).
    const isLeg = legs(q) < torso(q);
    const isShoe = isLeg && q[1] < (seated ? -0.5 : -0.84);
    const isNeck = q[1] > 0.33;
    const k = isShoe ? 0.95 : isLeg ? 0.62 : 1;
    if (isNeck) col.set([0.93, 0.76, 0.62], v * 3);
    else col.set([k, k, k], v * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(index);
  return g;
}
let seatedGeo: THREE.BufferGeometry | null = null;
let standingGeo: THREE.BufferGeometry | null = null;

export class Crowd {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private standers: THREE.InstancedMesh;
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private heads: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private hats: THREE.InstancedMesh;
  private eyes: THREE.InstancedMesh;
  private drinks: THREE.InstancedMesh;
  private hasDrink: boolean[] = [];
  private acc = 1;
  private off = new THREE.Vector3();
  private people: Spectator[] = [];
  state: CrowdState = 'idle';
  /** Animation updates per second (performance setting). */
  rate = 30;
  intensity = 0.2;
  private stateAge = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3(1, 1, 1);
  private v = new THREE.Vector3();

  constructor(seats: { pos: THREE.Vector3; yaw: number; standing: boolean; members?: boolean }[], density: number, opts: CrowdOptions = {}) {
    const outfits = opts.outfits ?? OUTFIT_COLORS;
    const memberOutfits = opts.memberOutfits ?? outfits;
    const hatChance = opts.hatChance ?? 0;
    const memberFlags: boolean[] = [];
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const seat of seats) {
      if (rnd() > density) continue;
      memberFlags.push(!!seat.members);
      this.people.push({ base: seat.pos.clone(), yaw: seat.yaw + (rnd() - 0.5) * 0.3, standing: seat.standing, excitability: 0.6 + rnd() * 0.8, phase: rnd() * 10, flourish: 0, hat: rnd() < (seat.members ? hatChance * 1.6 : hatChance) });
      this.hasDrink.push(rnd() < 0.35);
    }
    const n = this.people.length;
    const std = addRim(new THREE.MeshStandardMaterial({ roughness: 0.8 }), 0xfff2e2, 0.12);
    // Realistic adult proportions: tapered torso, small head (scaled geometry, shared by all instances).
    seatedGeo ??= spectatorGeometry(true);
    standingGeo ??= spectatorGeometry(false);
    const bodyMat = addRim(new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true }), 0xfff2e2, 0.12);
    this.bodies = new THREE.InstancedMesh(seatedGeo, bodyMat, n);
    this.standers = new THREE.InstancedMesh(standingGeo, bodyMat, n);
    // Friendly, big-headed spectators (same family as the player characters) with simple dot eyes.
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.155, 12, 8), std.clone(), n);
    this.hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.163, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(0.35), std.clone(), n);
    // Drinks in hand (spritz, lemonade, iced matcha) for about a third of the guests.
    this.drinks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.03, 0.12, 6), new THREE.MeshStandardMaterial({ roughness: 0.25 }), n);
    {
      const dc = new THREE.Color();
      const drinkCols = [0xf6b58f, 0xf7d98a, 0xb9dcb0, 0xf2a9b8];
      for (let i = 0; i < n; i++) this.drinks.setColorAt(i, dc.setHex(drinkCols[i % drinkCols.length]));
    }
    this.eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.024, 5, 3).scale(0.8, 1.25, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a1f1c, roughness: 0.4 }), n * 2);
    this.arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.048, 0.34, 2, 8), std.clone(), n * 2);
    // Straw boater: crown + brim (lathe profile).
    const hatProfile = [new THREE.Vector2(0, 0.09), new THREE.Vector2(0.15, 0.09), new THREE.Vector2(0.155, 0.0), new THREE.Vector2(0.27, 0.0), new THREE.Vector2(0.27, -0.015), new THREE.Vector2(0, -0.015)];
    this.hats = new THREE.InstancedMesh(new THREE.LatheGeometry(hatProfile, 12).scale(0.85, 0.8, 0.85), new THREE.MeshStandardMaterial({ roughness: 0.9 }), n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const pool = memberFlags[i] ? memberOutfits : outfits;
      const outfit = pool[Math.floor(rnd() * pool.length)];
      this.hats.setColorAt(i, c.setHex(rnd() < 0.75 ? 0xe6cf98 : rnd() < 0.5 ? 0xffffff : 0x1c2a44));
      this.bodies.setColorAt(i, c.setHex(outfit));
      this.standers.setColorAt(i, c);
      this.heads.setColorAt(i, c.setHex(SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)]));
      this.hair.setColorAt(i, c.setHex(rnd() < 0.15 ? PALETTE.cream : HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)]));
      this.arms.setColorAt(i * 2, c.setHex(outfit));
      this.arms.setColorAt(i * 2 + 1, c.setHex(outfit));
    }
    for (const im of [this.bodies, this.standers, this.heads, this.hair, this.arms, this.hats, this.eyes, this.drinks]) {
      im.castShadow = im !== this.eyes;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }
    this.update(0, 0);
  }

  get count(): number {
    return this.people.length;
  }

  setState(state: CrowdState, intensity: number): void {
    // Transient reactions (gasp) are short; cheers/ovations override calmer states.
    this.state = state;
    this.intensity = intensity;
    this.stateAge = 0;
  }

  /** @param beat 0..1 phase within the current musical beat */
  update(dt: number, beat: number, reducedMotion = false): void {
    this.stateAge += dt;
    // Decay transient states back to a resting murmur.
    const transientLen: Partial<Record<CrowdState, number>> = { cheer: 2.6, gasp: 0.9, applause: 3, ovation: 8 };
    const len = transientLen[this.state];
    if (len !== undefined && this.stateAge > len) {
      this.state = this.state === 'gasp' ? 'cheer' : 'idle';
      this.stateAge = 0;
      if (this.state === 'idle') this.intensity = 0.2;
    }
    // Re-pose at 30 Hz (crowd motion is slow; halves the CPU cost on high-refresh screens).
    this.acc += dt;
    if (this.acc < 1 / this.rate) return;
    dt = Math.min(this.acc, 0.1);
    this.acc = 0;
    const motion = reducedMotion ? 0.3 : 1;
    let anyStand = false;
    let anySit = false;
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      p.phase += dt * (1 + p.excitability);
      let y = 0;
      let lean = 0;
      let armUp = 0;
      let sway = Math.sin(p.phase * 0.7) * 0.04;
      const stand = p.standing || this.state === 'ovation' || (this.state === 'cheer' && this.intensity * p.excitability > 0.75);
      switch (this.state) {
        case 'idle':
          sway += Math.sin(beat * Math.PI * 2 + p.phase) * 0.02;
          break;
        case 'murmur':
          lean = 0.12;
          break;
        case 'tension':
          lean = 0.25 * this.intensity;
          sway *= 0.3;
          break;
        case 'gasp':
          lean = -0.25;
          armUp = 0.4;
          break;
        case 'applause':
          armUp = 0.5 + Math.abs(Math.sin(p.phase * 9)) * 0.3;
          break;
        case 'cheer':
        case 'ovation': {
          const k = this.state === 'ovation' ? 1 : this.intensity;
          y = Math.max(0, Math.sin(p.phase * 5)) * 0.18 * k * p.excitability;
          armUp = 1.2 + Math.sin(p.phase * 6) * 0.6 * k;
          break;
        }
      }
      if (p.flourish > 0) {
        p.flourish -= dt;
        armUp = Math.max(armUp, 1.4);
      } else if (Math.random() < dt * 0.01) p.flourish = 1.2; // the odd photo / wave
      y *= motion;
      sway *= motion;
      const baseY = p.base.y + (stand ? 0.42 : 0.18);
      this.e.set(lean, p.yaw, sway);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(p.base.x, baseY + y, p.base.z), this.q, this.s);
      if (stand) anyStand = true;
      else anySit = true;
      this.bodies.setMatrixAt(i, stand ? this.zero : this.m);
      this.standers.setMatrixAt(i, stand ? this.m : this.zero);
      // Head sits above the body along the body's local up.
      const hx = p.base.x - Math.sin(p.yaw) * Math.sin(lean) * 0.45;
      const hz = p.base.z - Math.cos(p.yaw) * Math.sin(lean) * 0.45;
      const hy = baseY + y + 0.52;
      this.m.compose(this.v.set(hx, hy, hz), this.q, this.s);
      this.heads.setMatrixAt(i, this.m);
      this.m.compose(this.v.set(hx, hy + 0.012, hz), this.q, this.s);
      this.hair.setMatrixAt(i, this.m);
      // Eyes on the front of the head (local -z), following the head's lean/yaw.
      for (const es of [-1, 1]) {
        this.off.set(es * 0.052, 0.012, -0.143).applyQuaternion(this.q);
        this.m.compose(this.v.set(hx + this.off.x, hy + this.off.y, hz + this.off.z), this.q, this.s);
        this.eyes.setMatrixAt(i * 2 + (es > 0 ? 1 : 0), this.m);
      }
      if (p.hat) this.m.compose(this.v.set(hx, hy + 0.1, hz), this.q, this.s);
      else this.m.makeScale(0, 0, 0);
      this.hats.setMatrixAt(i, this.m);
      if (this.hasDrink[i] && armUp < 0.6) {
        this.off.set(0.16, -0.05, -0.2).applyQuaternion(this.q);
        this.m.compose(this.v.set(p.base.x + this.off.x, baseY + y + this.off.y + 0.1, p.base.z + this.off.z), this.q, this.s);
      } else this.m.makeScale(0, 0, 0);
      this.drinks.setMatrixAt(i, this.m);
      for (const side of [-1, 1]) {
        const ax = p.base.x + Math.cos(p.yaw) * side * 0.215;
        const az = p.base.z - Math.sin(p.yaw) * side * 0.215;
        this.e.set(0, p.yaw, side * (0.15 + armUp * 1.2));
        this.q.setFromEuler(this.e);
        const up = armUp > 0.6 ? 0.3 : 0;
        this.m.compose(this.v.set(ax, baseY + y + 0.12 + up, az), this.q, this.s);
        this.arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), this.m);
      }
    }
    for (const im of [this.bodies, this.standers, this.heads, this.hair, this.arms, this.hats, this.eyes, this.drinks]) im.instanceMatrix.needsUpdate = true;
    // Only draw the posture meshes in use (zero-scaled instances still cost vertex work).
    this.standers.visible = anyStand;
    this.bodies.visible = anySit;
  }
}
