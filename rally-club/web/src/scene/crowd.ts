// Instanced spectators with reactive states (idle, murmur, tension, cheer, gasp, ovation, applause).
// One InstancedMesh per body part keeps draw calls tiny; density scales with the graphics preset.

import * as THREE from 'three';
import type { CrowdState } from '../../../shared/src/atmosphere.ts';
import { HAIR_COLORS, OUTFIT_COLORS, PALETTE, SKIN_TONES } from './palette.ts';

interface Spectator {
  base: THREE.Vector3;
  yaw: number;
  standing: boolean;
  excitability: number;
  phase: number;
  /** Seconds left of an individual flourish (e.g. phone photo / wave). */
  flourish: number;
}

export class Crowd {
  readonly group = new THREE.Group();
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private people: Spectator[] = [];
  state: CrowdState = 'idle';
  intensity = 0.2;
  private stateAge = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3(1, 1, 1);
  private v = new THREE.Vector3();

  constructor(seats: { pos: THREE.Vector3; yaw: number; standing: boolean }[], density: number) {
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const seat of seats) {
      if (rnd() > density) continue;
      this.people.push({ base: seat.pos.clone(), yaw: seat.yaw + (rnd() - 0.5) * 0.4, standing: seat.standing, excitability: 0.6 + rnd() * 0.8, phase: rnd() * 10, flourish: 0 });
    }
    const n = this.people.length;
    const std = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    this.bodies = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.2, 0.35, 4, 8), std, n);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 14, 10), std.clone(), n);
    this.hair = new THREE.InstancedMesh(new THREE.SphereGeometry(0.178, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), std.clone(), n);
    this.arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), std.clone(), n * 2);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const outfit = OUTFIT_COLORS[Math.floor(rnd() * OUTFIT_COLORS.length)];
      this.bodies.setColorAt(i, c.setHex(outfit));
      this.heads.setColorAt(i, c.setHex(SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)]));
      this.hair.setColorAt(i, c.setHex(rnd() < 0.15 ? PALETTE.cream : HAIR_COLORS[Math.floor(rnd() * HAIR_COLORS.length)]));
      this.arms.setColorAt(i * 2, c.setHex(outfit));
      this.arms.setColorAt(i * 2 + 1, c.setHex(outfit));
    }
    for (const im of [this.bodies, this.heads, this.hair, this.arms]) {
      im.castShadow = true;
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
    const motion = reducedMotion ? 0.3 : 1;
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
      this.bodies.setMatrixAt(i, this.m);
      // Head sits above the body along the body's local up.
      const hx = p.base.x - Math.sin(p.yaw) * Math.sin(lean) * 0.45;
      const hz = p.base.z - Math.cos(p.yaw) * Math.sin(lean) * 0.45;
      this.m.compose(this.v.set(hx, baseY + y + 0.48, hz), this.q, this.s);
      this.heads.setMatrixAt(i, this.m);
      this.m.compose(this.v.set(hx, baseY + y + 0.5, hz), this.q, this.s);
      this.hair.setMatrixAt(i, this.m);
      for (const side of [-1, 1]) {
        const ax = p.base.x + Math.cos(p.yaw) * side * 0.26;
        const az = p.base.z - Math.sin(p.yaw) * side * 0.26;
        this.e.set(0, p.yaw, side * (0.15 + armUp * 1.2));
        this.q.setFromEuler(this.e);
        const up = armUp > 0.6 ? 0.3 : 0;
        this.m.compose(this.v.set(ax, baseY + y + 0.12 + up, az), this.q, this.s);
        this.arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), this.m);
      }
    }
    for (const im of [this.bodies, this.heads, this.hair, this.arms]) im.instanceMatrix.needsUpdate = true;
  }
}
