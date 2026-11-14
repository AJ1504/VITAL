// Original stylised "toy diorama" athletes: oversized heads, rounded limbs, clean silhouettes.
// Procedurally animated (idle, run, forehand/backhand/serve swing, celebrate, dejected) so the
// harness needs no external animation assets.

import * as THREE from 'three';
import type { PlayerState } from '../../../shared/src/match.ts';
import { PALETTE } from './palette.ts';

export interface Look {
  skin: number;
  hair: number;
  shirt: number;
  shorts: number;
  shoes: number;
  paddle: number;
  hairStyle: 'short' | 'ponytail' | 'cap' | 'bun' | 'visor' | 'panama';
  /** Collar / sock / headwear trim colour. */
  trim?: number;
  /** Full-length trousers in this colour (officials) instead of bare legs. */
  trousers?: number;
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  armR: THREE.Group;
  armL: THREE.Group;
  legR: THREE.Group;
  legL: THREE.Group;
  /** Knee joints (children of the legs). */
  shinR: THREE.Group;
  shinL: THREE.Group;
  paddle: THREE.Group;
  shadow: THREE.Mesh;
  phase: number;
}

const mat = (c: number, rough = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });

function limb(radius: number, length: number, m: THREE.Material): THREE.Group {
  // Pivot at the top; limb hangs down along -y.
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length - radius * 2, 4, 10), m);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

export function createCharacter(look: Look, shadowTex: THREE.Texture): Rig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = mat(look.skin, 0.6);

  const legMat = mat(look.trousers ?? look.skin, look.trousers ? 0.8 : 0.6);
  // Two-segment legs: thigh (hip pivot) + shin (knee pivot) so sitting, crouching and running read properly.
  const legR = limb(0.08, 0.38, legMat);
  const legL = limb(0.08, 0.38, legMat);
  legR.position.set(0.11, 0.78, 0);
  legL.position.set(-0.11, 0.78, 0);
  const shins: THREE.Group[] = [];
  for (const leg of [legR, legL]) {
    const shin = limb(0.07, 0.38, legMat);
    shin.position.y = -0.36;
    leg.add(shin);
    shins.push(shin);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), mat(look.shoes, 0.5));
    shoe.position.set(0, -0.36, -0.04);
    shoe.castShadow = true;
    shin.add(shoe);
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.26, 12), mat(look.shorts));
    shorts.position.y = -0.1;
    shorts.castShadow = true;
    leg.add(shorts);
    if (!look.trousers) {
      const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.075, 0.12, 12), mat(0xffffff, 0.9));
      sock.position.y = -0.26;
      shin.add(sock);
      if (look.trim) {
        const band = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 12), mat(look.trim));
        band.position.y = -0.2;
        shin.add(band);
      }
    }
  }
  body.add(legR, legL);

  // Athletic torso: broader shoulders, flatter chest (scaled capsule), and a neck.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 8, 18), mat(look.shirt, 0.85));
  torso.scale.set(1.12, 1, 0.72);
  torso.position.y = 1.1;
  torso.castShadow = true;
  body.add(torso);
  if (look.trim) {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 20), mat(look.trim, 0.6));
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 1.4;
    body.add(collar);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.14, 12), skin);
  neck.position.y = 1.5;
  body.add(neck);
  const head = new THREE.Group();
  // Realistic proportions (~1:7.5): the head detail below is modelled at 2x and scaled down.
  head.position.y = 1.64;
  head.scale.setScalar(0.47);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.25, 32, 24), skin);
  skull.scale.set(0.92, 1.1, 1);
  skull.castShadow = true;
  head.add(skull);
  const hairMat = mat(look.hair, 0.9);
  if (look.hairStyle === 'visor' || look.hairStyle === 'panama') {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.265, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    hair.rotation.x = 0.2;
    head.add(hair);
    if (look.hairStyle === 'visor') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.268, 0.268, 0.07, 24, 1, true), mat(0xffffff, 0.6));
      band.position.y = 0.08;
      head.add(band);
      const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 20, 1, false, Math.PI / 2, Math.PI), mat(look.trim ?? 0xffffff, 0.5));
      peak.position.set(0, 0.06, -0.14);
      head.add(peak);
    } else {
      const prof = [new THREE.Vector2(0, 0.16), new THREE.Vector2(0.2, 0.15), new THREE.Vector2(0.23, 0.02), new THREE.Vector2(0.4, -0.01), new THREE.Vector2(0.4, -0.03), new THREE.Vector2(0, -0.03)];
      const hat = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), mat(0xe9dcb8, 0.9));
      hat.position.y = 0.17;
      hat.castShadow = true;
      head.add(hat);
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.232, 0.232, 0.05, 24, 1, true), mat(look.trim ?? 0x1c2a44));
      ribbon.position.y = 0.21;
      head.add(ribbon);
    }
  } else if (look.hairStyle === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.262, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.shirt === PALETTE.cream ? PALETTE.coral : PALETTE.cream, 0.6));
    cap.position.y = 0.02;
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, Math.PI / 2, Math.PI), cap.material);
    brim.position.set(0, 0.04, -0.18);
    head.add(brim);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.265, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hair.position.y = 0.01;
    hair.rotation.x = 0.25;
    head.add(hair);
    if (look.hairStyle === 'ponytail') {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), hairMat);
      tail.position.set(0, -0.02, 0.27);
      tail.rotation.x = 0.6;
      head.add(tail);
    } else if (look.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), hairMat);
      bun.position.set(0, 0.24, 0.12);
      head.add(bun);
    }
  }
  // Simple face: eyes facing local -z (forward).
  const eyeMat = mat(PALETTE.ink, 0.4);
  for (const x of [-0.08, 0.08]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), eyeMat);
    eye.position.set(x, 0.0, -0.235);
    eye.scale.z = 0.5;
    head.add(eye);
  }
  const blush = mat(PALETTE.coral, 0.9);
  for (const x of [-0.14, 0.14]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), blush);
    b.position.set(x, -0.06, -0.225);
    b.rotation.y = Math.PI + x * 2.5;
    head.add(b);
  }
  body.add(head);

  const armR = limb(0.06, 0.58, mat(look.shirt));
  const armL = limb(0.06, 0.58, mat(look.shirt));
  armR.position.set(0.24, 1.38, 0);
  armL.position.set(-0.24, 1.38, 0);
  for (const arm of [armR, armL]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), skin);
    hand.position.y = -0.58;
    arm.add(hand);
  }
  body.add(armR, armL);

  // Paddle in the right hand.
  const paddle = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.025, 20), mat(look.paddle, 0.4));
  face.scale.z = 1.25;
  face.rotation.z = Math.PI / 2;
  face.position.y = -0.22;
  face.castShadow = true;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.14, 8), mat(PALETTE.ink));
  handle.position.y = -0.06;
  paddle.add(face, handle);
  paddle.position.y = -0.6;
  armR.add(paddle);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  return { root, body, torso, head, armR, armL, legR, legL, shinR: shins[0], shinL: shins[1], paddle, shadow, phase: Math.random() * 10 };
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** Pose the rig from simulation state. `facingYaw` points the character toward the net. */
export function animateCharacter(rig: Rig, p: PlayerState, facingYaw: number, dt: number, beat: number, reducedMotion: boolean): void {
  rig.root.position.set(p.pos.x, 0, p.pos.z);
  rig.root.rotation.y = facingYaw;
  const speed = Math.hypot(p.vel.x, p.vel.z);
  rig.phase += dt * (4 + speed * 2.4);
  const ph = rig.phase;

  // Defaults (ready stance).
  let legSwing = 0;
  let bob = Math.sin(ph * 0.8) * 0.015;
  let lean = 0.12;
  let twist = 0;
  // Rotation conventions (rig faces -z): +x rotation swings a hanging limb forward,
  // +z rotation swings it toward +x (outward for the right arm, inward for the left).
  let armRx = 0.5;
  let armRz = 0.25;
  let armLx = 0.3;
  let armLz = -0.2;
  let jump = 0;

  if (p.anim === 'run') {
    legSwing = Math.sin(ph) * Math.min(0.9, speed * 0.2);
    bob = Math.abs(Math.sin(ph)) * 0.06;
    lean = 0.25;
    armLx = Math.sin(ph) * 0.6;
  }
  if (p.swingAnim > 0) {
    const t = p.swingAnim;
    const isServe = p.stroke === 'serve';
    const back = p.stroke === 'backhand';
    if (isServe) {
      // Underhand serve: pendulum from back to front.
      const s = t < 0.35 ? -ease(t / 0.35) : -1 + ease((t - 0.35) / 0.65) * 2.6;
      armRx = s * 1.2;
      armRz = 0.15;
      twist = -s * 0.2;
    } else {
      // Wind-up then follow-through across the body.
      const k = t < 0.3 ? ease(t / 0.3) : 1 - ease((t - 0.3) / 0.7) * 2;
      twist = (back ? 1 : -1) * k * 0.9;
      armRx = 1.2;
      armRz = back ? -1.0 * k - 0.2 : 1.3 * k + 0.2;
      lean = 0.3;
    }
  }
  if (p.anim === 'celebrate') {
    jump = reducedMotion ? 0.05 : Math.max(0, Math.sin(ph * 1.6)) * 0.35;
    armRx = Math.PI * 0.95;
    armLx = Math.PI * 0.95;
    armRz = 0.3;
    armLz = -0.3;
    lean = 0;
  } else if (p.anim === 'dejected') {
    lean = 0.45;
    armRx = 0.1;
    armLx = 0.1;
    bob = 0;
  } else if (p.anim === 'ready' && p.swingAnim === 0) {
    bob += Math.sin(beat * Math.PI * 2) * 0.012; // a little groove to the DJ
  }

  rig.body.position.y = bob + jump;
  rig.body.rotation.x = -lean * 0.4;
  rig.body.rotation.y = twist;
  rig.legR.rotation.x = legSwing;
  rig.legL.rotation.x = -legSwing;
  // Knees: bend on the back-swing of each stride, a slight athletic flex when ready.
  const flex = p.anim === 'run' ? 0 : p.anim === 'celebrate' ? 0.2 : 0.18;
  rig.shinR.rotation.x = -(flex + Math.max(0, -Math.sin(ph)) * (p.anim === 'run' ? 1.1 : 0));
  rig.shinL.rotation.x = -(flex + Math.max(0, Math.sin(ph)) * (p.anim === 'run' ? 1.1 : 0));
  rig.armR.rotation.x = armRx;
  rig.armR.rotation.z = armRz;
  rig.armL.rotation.x = armLx;
  rig.armL.rotation.z = armLz;
  rig.head.rotation.y = -twist * 0.5;
  rig.shadow.position.y = 0.02 - (bob + jump);
  rig.shadow.scale.setScalar(1 - jump * 0.6);
}

/** Seated pose (officials, DJ stool): thighs forward, shins down. Call after animateCharacter or alone. */
export function poseSeated(rig: Rig, seatHeight: number): void {
  rig.body.position.y = seatHeight - 0.78 + 0.05;
  rig.legR.rotation.x = rig.legL.rotation.x = Math.PI / 2;
  rig.shinR.rotation.x = rig.shinL.rotation.x = -Math.PI / 2;
  rig.body.rotation.x = 0;
  rig.shadow.visible = seatHeight < 0.6;
}

/** Ball-kid crouch: knees bent, hands on knees, ready to sprint. */
export function poseCrouch(rig: Rig, t: number): void {
  // Hips drop, thighs forward, shins back: a coiled ready crouch with hands on knees.
  rig.body.position.y = -0.24 + Math.sin(t * 1.3) * 0.005;
  rig.body.rotation.x = -0.5;
  rig.legR.rotation.x = rig.legL.rotation.x = 1.25;
  rig.shinR.rotation.x = rig.shinL.rotation.x = -1.6;
  rig.armR.rotation.x = rig.armL.rotation.x = 1.0;
}
