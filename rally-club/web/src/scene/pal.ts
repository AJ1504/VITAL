// "Pals" — Rally Club's original toy-like athletes, built for charm and readable animation:
// chunky proportions, a big expressive face (blinks, looks at the ball, grins, gasps, sulks), jointed
// arms/legs, and a keyframed action layer (anticipation → whip → follow-through) blended over
// procedural locomotion. All geometry and faces are procedural; no third-party assets.

import * as THREE from 'three';

export type HairStyle = 'short' | 'ponytail' | 'bob' | 'spiky' | 'bun' | 'bald';
export type Headwear = 'none' | 'visor' | 'headband' | 'panama' | 'cap';
export type Expression = 'neutral' | 'focus' | 'happy' | 'ecstatic' | 'sad' | 'surprised' | 'determined';
export type Action = 'none' | 'swing_fh' | 'swing_bh' | 'serve' | 'celebrate' | 'fistpump' | 'dejected' | 'wave' | 'clap';

export interface PalLook {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  headwear?: Headwear;
  headwearColor?: number;
  shirt: number;
  shorts: number;
  shoes: number;
  trim?: number;
  paddle?: number;
  trousers?: number;
  eye?: number;
  /** 0..1 body build variation (wider torso). */
  build?: number;
  lefty?: boolean;
}

type V3 = [number, number, number];
interface Pose {
  hipsY: number;
  spine: V3;
  head: V3;
  shR: V3;
  elR: number;
  shL: V3;
  elL: number;
  thR: [number, number];
  knR: number;
  thL: [number, number];
  knL: number;
}

const clone = (p: Pose): Pose => ({
  hipsY: p.hipsY,
  spine: [...p.spine] as V3,
  head: [...p.head] as V3,
  shR: [...p.shR] as V3,
  elR: p.elR,
  shL: [...p.shL] as V3,
  elL: p.elL,
  thR: [...p.thR] as [number, number],
  knR: p.knR,
  thL: [...p.thL] as [number, number],
  knL: p.knL,
});

function mix(a: Pose, b: Pose, t: number, out: Pose = clone(a)): Pose {
  const l = (x: number, y: number) => x + (y - x) * t;
  out.hipsY = l(a.hipsY, b.hipsY);
  for (let i = 0; i < 3; i++) {
    out.spine[i] = l(a.spine[i], b.spine[i]);
    out.head[i] = l(a.head[i], b.head[i]);
    out.shR[i] = l(a.shR[i], b.shR[i]);
    out.shL[i] = l(a.shL[i], b.shL[i]);
  }
  out.elR = l(a.elR, b.elR);
  out.elL = l(a.elL, b.elL);
  out.thR = [l(a.thR[0], b.thR[0]), l(a.thR[1], b.thR[1])];
  out.thL = [l(a.thL[0], b.thL[0]), l(a.thL[1], b.thL[1])];
  out.knR = l(a.knR, b.knR);
  out.knL = l(a.knL, b.knL);
  return out;
}

const P = (o: Partial<Pose>, base: Pose): Pose => ({ ...clone(base), ...o });

// Rotation conventions (character faces -z): +x on a hanging limb swings it forward; +z swings it toward +x
// (outward for the right arm); spine/head -x leans forward; spine +y turns the chest to the left.
const STAND: Pose = { hipsY: 0, spine: [-0.04, 0, 0], head: [0.04, 0, 0], shR: [0.1, 0, 0.12], elR: 0.3, shL: [0.1, 0, -0.12], elL: 0.3, thR: [0, 0.05], knR: -0.05, thL: [0, -0.05], knL: -0.05 };
const READY: Pose = { hipsY: -0.07, spine: [-0.24, 0, 0], head: [0.2, 0, 0], shR: [0.75, 0, 0.35], elR: 0.95, shL: [0.65, 0, -0.32], elL: 1.05, thR: [0.38, 0.14], knR: -0.7, thL: [0.38, -0.14], knL: -0.7 };
const BACK_FH = P({ spine: [-0.18, -1.05, -0.05], head: [0.12, 0.95, 0], shR: [0.35, 0, 1.35], elR: 0.45, shL: [1.25, 0, -0.25], elL: 0.25 }, READY);
const HIT_FH = P({ spine: [-0.2, 0.15, 0], head: [0.12, -0.12, 0], shR: [1.35, 0, 0.55], elR: 0.12, shL: [0.45, 0, -0.65], elL: 0.8 }, READY);
const FOLLOW_FH = P({ spine: [-0.12, 1.05, 0.05], head: [0.1, -0.9, 0], shR: [1.95, 0, -0.95], elR: 1.35, shL: [0.25, 0, -0.55], elL: 1.2 }, READY);
const BACK_BH = P({ spine: [-0.18, 1.0, 0.05], head: [0.12, -0.95, 0], shR: [0.95, 0, -1.15], elR: 1.05, shL: [0.6, 0, -0.15], elL: 1.25 }, READY);
const HIT_BH = P({ spine: [-0.2, -0.1, 0], head: [0.12, 0.1, 0], shR: [1.3, 0, -0.1], elR: 0.12, shL: [0.4, 0, -0.75], elL: 0.5 }, READY);
const FOLLOW_BH = P({ spine: [-0.12, -0.95, -0.05], head: [0.1, 0.9, 0], shR: [1.85, 0, 1.25], elR: 0.25, shL: [0.3, 0, -1.0], elL: 0.35 }, READY);
const SERVE_READY = P({ hipsY: -0.03, spine: [-0.15, -0.25, 0], head: [0.15, 0.2, 0], shR: [-0.45, 0, 0.3], elR: 0.35, shL: [0.95, 0, 0.55], elL: 0.55, thR: [0.15, 0.1], knR: -0.3, thL: [0.25, -0.1], knL: -0.35 }, READY);
const SERVE_HIT = P({ spine: [-0.28, 0.1, 0], head: [0.15, -0.1, 0], shR: [0.95, 0, 0.18], elR: 0.18, shL: [0.5, 0, -0.45], elL: 0.7 }, SERVE_READY);
const SERVE_FOLLOW = P({ hipsY: -0.02, spine: [-0.08, 0.45, 0], head: [0.12, -0.3, 0], shR: [2.3, 0, -0.35], elR: 0.7, shL: [0.3, 0, -0.6], elL: 0.9, thR: [0.3, 0.1], knR: -0.4, thL: [-0.1, -0.1], knL: -0.3 }, SERVE_READY);
const DEJECTED = P({ hipsY: -0.03, spine: [-0.5, 0, 0], head: [-0.45, 0, 0], shR: [0.05, 0, 0.05], elR: 0.1, shL: [0.05, 0, -0.05], elL: 0.1, thR: [0.05, 0.05], knR: -0.15, thL: [0.05, -0.05], knL: -0.15 }, READY);
const ARMS_UP = P({ hipsY: 0, spine: [0.15, 0, 0], head: [0.35, 0, 0], shR: [3.0, 0, 0.35], elR: 0.1, shL: [3.0, 0, -0.35], elL: 0.1, thR: [0.1, 0.1], knR: -0.1, thL: [0.1, -0.1], knL: -0.1 }, READY);
const FIST = P({ hipsY: -0.12, spine: [-0.3, 0.3, 0], head: [0.2, -0.2, 0], shR: [1.0, 0, 0.55], elR: 2.2, shL: [0.6, 0, -0.4], elL: 1.2, thR: [0.6, 0.18], knR: -1.1, thL: [0.5, -0.18], knL: -1.0 }, READY);

interface Key {
  t: number;
  pose: Pose;
  ease?: 'in' | 'out' | 'inout' | 'linear';
}
const easeFn = (e: Key['ease'], t: number) => (e === 'in' ? t * t * t : e === 'out' ? 1 - Math.pow(1 - t, 3) : e === 'linear' ? t : t * t * (3 - 2 * t));

function sampleKeys(keys: Key[], t: number, out: Pose): Pose {
  if (t <= keys[0].t) return mix(keys[0].pose, keys[0].pose, 0, out);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      const k = easeFn(b.ease, (t - a.t) / (b.t - a.t));
      return mix(a.pose, b.pose, k, out);
    }
  }
  return mix(keys[keys.length - 1].pose, keys[keys.length - 1].pose, 0, out);
}

// Swings start from the current anticipation pose, whip through contact fast, then follow through.
const ACTIONS: Record<Exclude<Action, 'none' | 'celebrate' | 'wave' | 'clap'>, { keys: Key[]; dur: number }> = {
  swing_fh: { dur: 0.75, keys: [{ t: 0, pose: BACK_FH }, { t: 0.09, pose: HIT_FH, ease: 'in' }, { t: 0.3, pose: FOLLOW_FH, ease: 'out' }, { t: 0.42, pose: FOLLOW_FH }, { t: 0.75, pose: READY, ease: 'inout' }] },
  swing_bh: { dur: 0.75, keys: [{ t: 0, pose: BACK_BH }, { t: 0.09, pose: HIT_BH, ease: 'in' }, { t: 0.3, pose: FOLLOW_BH, ease: 'out' }, { t: 0.42, pose: FOLLOW_BH }, { t: 0.75, pose: READY, ease: 'inout' }] },
  serve: { dur: 1.0, keys: [{ t: 0, pose: SERVE_READY }, { t: 0.07, pose: SERVE_HIT, ease: 'in' }, { t: 0.32, pose: SERVE_FOLLOW, ease: 'out' }, { t: 0.5, pose: SERVE_FOLLOW }, { t: 1.0, pose: READY, ease: 'inout' }] },
  fistpump: { dur: 1.3, keys: [{ t: 0, pose: READY }, { t: 0.18, pose: FIST, ease: 'out' }, { t: 0.4, pose: P({ elR: 1.4, shR: [0.6, 0, 0.5] }, FIST) }, { t: 0.55, pose: FIST, ease: 'out' }, { t: 0.95, pose: FIST }, { t: 1.3, pose: STAND, ease: 'inout' }] },
  dejected: { dur: 1.6, keys: [{ t: 0, pose: READY }, { t: 0.35, pose: DEJECTED, ease: 'out' }, { t: 1.2, pose: DEJECTED }, { t: 1.6, pose: STAND, ease: 'inout' }] },
};

// ------------------------------------------------------------------ face

class Face {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private key = '';
  private eyeColor: number;
  constructor(eyeColor: number) {
    this.eyeColor = eyeColor;
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(expr: Expression, blink: boolean, gx: number, gy: number): void {
    const key = `${expr}|${blink}|${Math.round(gx * 4)}|${Math.round(gy * 4)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 256);
    const cx = 384;
    const eyeY = 116;
    const ink = '#2a1f1c';
    const iris = `#${this.eyeColor.toString(16).padStart(6, '0')}`;
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Blush
    for (const s of [-1, 1]) {
      const grd = g.createRadialGradient(cx + s * 44, 146, 0, cx + s * 44, 146, 14);
      grd.addColorStop(0, 'rgba(255,120,120,0.55)');
      grd.addColorStop(1, 'rgba(255,120,120,0)');
      g.fillStyle = grd;
      g.fillRect(cx + s * 44 - 16, 130, 32, 32);
    }

    const closedHappy = expr === 'happy' || expr === 'ecstatic';
    for (const s of [-1, 1]) {
      const ex = cx + s * 27;
      if (blink || closedHappy) {
        g.strokeStyle = ink;
        g.lineWidth = 5;
        g.beginPath();
        if (closedHappy) g.arc(ex, eyeY + 6, 10, Math.PI * 1.1, Math.PI * 1.9);
        else {
          g.moveTo(ex - 10, eyeY + 2);
          g.lineTo(ex + 10, eyeY + 2);
        }
        g.stroke();
      } else {
        const big = expr === 'surprised' ? 1.25 : 1;
        const lid = expr === 'sad' ? 0.35 : expr === 'focus' || expr === 'determined' ? 0.2 : 0;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(ex, eyeY, 12 * big, 16 * big, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = iris;
        g.beginPath();
        g.ellipse(ex + gx * 4, eyeY + gy * 4 + 1, 8 * big, 11 * big, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(ex + gx * 4.5, eyeY + gy * 4.5 + 1, 4.5 * big, 6.5 * big, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex + gx * 4 - 3, eyeY + gy * 4 - 4, 2.6, 0, Math.PI * 2);
        g.fill();
        if (lid > 0) {
          // Upper eyelid in skin tone is drawn by the head behind; use a soft dark lid line instead.
          g.fillStyle = 'rgba(0,0,0,0)';
          g.strokeStyle = ink;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(ex - 12, eyeY - 16 + lid * 22);
          g.lineTo(ex + 12, eyeY - 16 + lid * 22 + (expr === 'sad' ? -s * 4 : s * 4));
          g.stroke();
        }
      }
      // Brows
      g.strokeStyle = ink;
      g.lineWidth = 4;
      g.beginPath();
      const by = eyeY - 26;
      if (expr === 'focus' || expr === 'determined') {
        g.moveTo(ex - s * 12, by - 4);
        g.lineTo(ex + s * 10, by + 4);
      } else if (expr === 'sad') {
        g.moveTo(ex - s * 12, by + 4);
        g.lineTo(ex + s * 10, by - 5);
      } else if (expr === 'surprised' || expr === 'ecstatic') {
        g.arc(ex, by + 4, 11, Math.PI * 1.15, Math.PI * 1.85);
      } else {
        g.moveTo(ex - 10, by);
        g.quadraticCurveTo(ex, by - 4, ex + 10, by);
      }
      g.stroke();
    }

    // Mouth
    const my = 158;
    g.strokeStyle = ink;
    g.fillStyle = '#7a2b2b';
    g.lineWidth = 4;
    g.beginPath();
    switch (expr) {
      case 'happy':
        g.moveTo(cx - 14, my - 3);
        g.quadraticCurveTo(cx, my + 16, cx + 14, my - 3);
        g.closePath();
        g.fill();
        g.stroke();
        break;
      case 'ecstatic':
        g.ellipse(cx, my + 2, 14, 12, 0, 0, Math.PI);
        g.closePath();
        g.fill();
        g.stroke();
        g.fillStyle = '#ff8a8a';
        g.beginPath();
        g.ellipse(cx, my + 9, 7, 4, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'surprised':
        g.ellipse(cx, my + 2, 6, 8, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
        break;
      case 'sad':
        g.moveTo(cx - 11, my + 6);
        g.quadraticCurveTo(cx, my - 5, cx + 11, my + 6);
        g.stroke();
        break;
      case 'focus':
      case 'determined':
        g.moveTo(cx - 8, my + 2);
        g.lineTo(cx + 8, my + 1);
        g.stroke();
        break;
      default:
        g.moveTo(cx - 10, my);
        g.quadraticCurveTo(cx, my + 8, cx + 10, my);
        g.stroke();
    }
    this.texture.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ the character

const mat = (c: number, rough = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });

function capsule(r: number, len: number, m: THREE.Material, hang = true): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 6, 14), m);
  mesh.position.y = hang ? -len / 2 : len / 2;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

export interface PalState {
  x: number;
  z: number;
  /** World yaw the body should face (0 = facing -z). */
  yaw: number;
  /** Horizontal speed m/s. */
  speed: number;
}

export class Pal {
  readonly root = new THREE.Group();
  readonly hips = new THREE.Group();
  readonly spine = new THREE.Group();
  readonly head = new THREE.Group();
  readonly shR = new THREE.Group();
  readonly elR = new THREE.Group();
  readonly shL = new THREE.Group();
  readonly elL = new THREE.Group();
  readonly thR = new THREE.Group();
  readonly knR = new THREE.Group();
  readonly thL = new THREE.Group();
  readonly knL = new THREE.Group();
  readonly hand = new THREE.Group();
  readonly paddle = new THREE.Group();
  readonly shadow: THREE.Mesh;
  private face: Face;
  private expression: Expression = 'neutral';
  private exprTimer = 0;
  private blinkTimer = 2 + Math.random() * 2;
  private blinking = 0;
  private gaze = new THREE.Vector3();
  private hasGaze = false;
  private action: Action = 'none';
  private actionT = 0;
  private actionFrom: Pose = clone(READY);
  private anticipation = 0;
  private antSide: 'fh' | 'bh' = 'fh';
  private hop = 0;
  private phase = Math.random() * 10;
  private pose: Pose = clone(STAND);
  private scratch: Pose = clone(STAND);
  /** 0 = relaxed standing, 1 = athletic ready stance. */
  ready = 1;
  serving = false;
  seated = 0;
  crouch = false;
  private readonly HIPS_H = 0.47;

  constructor(look: PalLook, shadowTex?: THREE.Texture) {
    const skin = mat(look.skin, 0.55);
    const shirt = mat(look.shirt, 0.75);
    const shorts = mat(look.shorts, 0.8);
    const legM = mat(look.trousers ?? look.skin, look.trousers ? 0.8 : 0.55);
    const shoe = mat(look.shoes, 0.5);
    const trim = look.trim !== undefined ? mat(look.trim, 0.6) : null;
    const build = look.build ?? 0.5;

    this.root.add(this.hips);
    this.hips.position.y = this.HIPS_H;
    this.hips.add(this.spine);

    // Torso: soft pear shape with shorts at the bottom.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.2, 8, 18), shirt);
    torso.scale.set(1 + build * 0.15, 1, 0.85 + build * 0.1);
    torso.position.y = 0.26;
    torso.castShadow = true;
    this.spine.add(torso);
    const pants = new THREE.Mesh(new THREE.CylinderGeometry(0.165 + build * 0.02, 0.17 + build * 0.02, 0.14, 20), shorts);
    pants.scale.z = 0.88;
    pants.position.y = 0.06;
    pants.castShadow = true;
    this.spine.add(pants);
    if (trim) {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.02, 8, 20), trim);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = 0.5;
      this.spine.add(collar);
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.168, 0.168, 0.025, 20, 1, true), trim);
      stripe.scale.z = 0.86;
      stripe.position.y = 0.14;
      this.spine.add(stripe);
    }

    // Head
    this.head.position.y = 0.53;
    this.spine.add(this.head);
    const R = 0.23;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), skin);
    skull.scale.set(1, 0.96, 0.98);
    skull.position.y = 0.19;
    skull.castShadow = true;
    this.head.add(skull);
    this.face = new Face(look.eye ?? 0x3b2a20);
    const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.004, 48, 32), new THREE.MeshStandardMaterial({ map: this.face.texture, transparent: true, roughness: 0.6, depthWrite: false }));
    faceMesh.scale.copy(skull.scale);
    faceMesh.position.copy(skull.position);
    faceMesh.renderOrder = 2;
    this.head.add(faceMesh);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 10), skin);
    nose.position.set(0, 0.17, -R * 0.985);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skin);
      ear.scale.set(0.6, 1, 0.8);
      ear.position.set(s * R * 0.98, 0.17, 0.01);
      this.head.add(ear);
    }
    this.buildHair(look, R, skull.position.y);

    // Arms
    const armR = look.shirt;
    for (const [sh, el, s] of [
      [this.shR, this.elR, 1],
      [this.shL, this.elL, -1],
    ] as const) {
      sh.position.set(s * 0.19, 0.43, 0);
      this.spine.add(sh);
      const sleeve = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), mat(armR, 0.75));
      sleeve.castShadow = true;
      sh.add(sleeve);
      sh.add(capsule(0.048, 0.17, skin));
      el.position.y = -0.16;
      sh.add(el);
      el.add(capsule(0.045, 0.16, skin));
      const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), skin);
      mitt.position.y = -0.17;
      mitt.castShadow = true;
      el.add(mitt);
      if (s === 1) {
        this.hand.position.y = -0.17;
        el.add(this.hand);
      }
    }
    // Paddle (face normal along the swing direction).
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.022, 28), mat(look.paddle ?? 0x1c2a44, 0.35));
    face.scale.set(1, 1, 1.22);
    face.rotation.x = Math.PI / 2;
    face.position.set(0, -0.2, -0.02);
    face.castShadow = true;
    const edge = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.012, 8, 28), mat(0xf5efe1, 0.4));
    edge.scale.set(1, 1.22, 1);
    edge.position.copy(face.position);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.12, 10), mat(0x222222, 0.6));
    grip.position.y = -0.06;
    this.paddle.add(face, edge, grip);
    this.paddle.rotation.x = 0.35;
    this.hand.add(this.paddle);

    // Legs
    for (const [th, kn, s] of [
      [this.thR, this.knR, 1],
      [this.thL, this.knL, -1],
    ] as const) {
      th.position.set(s * 0.085, 0, 0);
      this.hips.add(th);
      th.add(capsule(0.065, 0.21, legM));
      kn.position.y = -0.2;
      th.add(kn);
      kn.add(capsule(0.058, 0.2, legM));
      if (!look.trousers) {
        const sock = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.058, 0.06, 12), mat(0xffffff, 0.9));
        sock.position.y = -0.16;
        kn.add(sock);
      }
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), shoe);
      foot.scale.set(0.85, 0.6, 1.45);
      foot.position.set(0, -0.215, -0.035);
      foot.castShadow = true;
      kn.add(foot);
    }

    const sh = shadowTex ?? null;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: sh, color: sh ? 0xffffff : 0x000000, transparent: true, opacity: sh ? 1 : 0.25, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.015;
    this.root.add(this.shadow);
    this.applyPose(STAND);
    this.face.draw('neutral', false, 0, 0);
  }

  private buildHair(look: PalLook, R: number, cy: number): void {
    const hm = mat(look.hair, 0.85);
    const add = (m: THREE.Mesh) => {
      m.castShadow = true;
      this.head.add(m);
    };
    if (look.hairStyle !== 'bald') {
      const capDepth = look.hairStyle === 'bob' ? 0.62 : 0.47;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 32, 20, 0, Math.PI * 2, 0, Math.PI * capDepth), hm);
      cap.position.y = cy + 0.005;
      cap.rotation.x = 0.32; // swept back: forehead shows, more hair at the back
      add(cap);
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(R * 0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), hm);
      fringe.scale.set(1.5, 0.45, 0.8);
      fringe.position.set(0.04, cy + R * 0.78, -R * 0.55);
      fringe.rotation.x = -0.6;
      add(fringe);
    }
    if (look.hairStyle === 'ponytail') {
      const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.16, 6, 10), hm);
      tail.position.set(0, cy + 0.02, R * 1.05);
      tail.rotation.x = 0.5;
      add(tail);
    } else if (look.hairStyle === 'bun') {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), hm);
      bun.position.set(0, cy + R * 0.95, R * 0.45);
      add(bun);
    } else if (look.hairStyle === 'spiky') {
      for (let i = 0; i < 7; i++) {
        const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 8), hm);
        const a = (i / 7) * Math.PI * 2;
        sp.position.set(Math.cos(a) * R * 0.5, cy + R * 0.95, Math.sin(a) * R * 0.5 + 0.03);
        sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        add(sp);
      }
    }
    const hw = look.headwear ?? 'none';
    const hc = mat(look.headwearColor ?? 0xffffff, 0.6);
    if (hw === 'visor' || hw === 'headband') {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.075, R * 1.075, 0.045, 32, 1, true), hc);
      band.position.y = cy + R * 0.42;
      band.rotation.x = 0.1;
      add(band);
      if (hw === 'visor') {
        const peak = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.016, 24, 1, false, Math.PI / 2, Math.PI), hc);
        peak.position.set(0, cy + R * 0.4, -R * 0.62);
        peak.rotation.x = 0.12;
        add(peak);
      }
    } else if (hw === 'cap') {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(R * 1.09, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hc);
      crown.position.y = cy + 0.01;
      add(crown);
      const bill = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.85, R * 0.85, 0.02, 24, 1, false, Math.PI / 2, Math.PI), hc);
      bill.position.set(0, cy + R * 0.12, -R * 0.75);
      add(bill);
    } else if (hw === 'panama') {
      const prof = [new THREE.Vector2(0, 0.14), new THREE.Vector2(R * 0.95, 0.13), new THREE.Vector2(R * 1.05, 0.0), new THREE.Vector2(R * 1.75, -0.02), new THREE.Vector2(R * 1.75, -0.04), new THREE.Vector2(0, -0.04)];
      const hat = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), mat(0xeadfbf, 0.9));
      hat.position.y = cy + R * 0.62;
      add(hat);
      const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.04, R * 1.06, 0.04, 28, 1, true), hc);
      ribbon.position.y = cy + R * 0.66;
      add(ribbon);
    }
  }

  // ---------------------------------------------------------------- control API

  setExpression(e: Expression, hold = 1.8): void {
    this.expression = e;
    this.exprTimer = hold;
  }

  /** Eyes (and head a little) track this world point. */
  lookAt(p: THREE.Vector3 | null): void {
    if (p) {
      this.gaze.copy(p);
      this.hasGaze = true;
    } else this.hasGaze = false;
  }

  /** Pre-swing coil as the ball approaches (amount 0..1). */
  anticipate(side: 'fh' | 'bh', amount: number): void {
    if (this.action === 'swing_fh' || this.action === 'swing_bh' || this.action === 'serve') {
      this.anticipation = 0;
      return;
    }
    this.antSide = side;
    this.anticipation = amount;
  }

  /** Small split-step hop (when the opponent strikes). */
  splitStep(): void {
    if (this.hop <= 0) this.hop = 0.28;
  }

  play(a: Action): void {
    this.actionFrom = clone(this.pose);
    this.action = a;
    this.actionT = 0;
    this.anticipation = 0;
  }

  get currentAction(): Action {
    return this.action;
  }

  // ---------------------------------------------------------------- per-frame

  update(dt: number, st: PalState): void {
    this.root.position.set(st.x, 0, st.z);
    // Turn smoothly toward the desired yaw.
    let dy = st.yaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * Math.min(1, dt * 10);
    this.phase += dt * (5 + st.speed * 2.6);

    // Base layer: stand / ready / serve stance, then locomotion.
    const base = mix(STAND, this.serving ? SERVE_READY : READY, this.ready, this.scratch);
    const run = Math.min(1, st.speed / 3.2);
    if (run > 0.02) {
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      base.thR[0] += s * 0.95 * run;
      base.thL[0] -= s * 0.95 * run;
      base.knR += -Math.max(0, -s) * 1.3 * run - 0.1 * run;
      base.knL += -Math.max(0, s) * 1.3 * run - 0.1 * run;
      base.hipsY += (Math.abs(c) * 0.05 - 0.02) * run;
      base.spine[0] -= 0.12 * run;
      base.spine[2] += c * 0.05 * run;
      base.shL[0] += -s * 0.7 * run;
      if (this.anticipation < 0.2 && this.action === 'none') base.shR[0] += s * 0.4 * run;
    } else if (this.ready > 0.5 && this.action === 'none') {
      // Bouncy weight shift on the toes.
      const b = Math.sin(this.phase * 0.9);
      base.hipsY += b * 0.012;
      base.spine[2] += b * 0.025;
    }

    // Anticipation coil.
    if (this.anticipation > 0) mix(base, this.antSide === 'fh' ? BACK_FH : BACK_BH, this.anticipation * this.anticipation * (3 - 2 * this.anticipation), base);

    // Action layer.
    let pose = base;
    if (this.action !== 'none') {
      this.actionT += dt;
      pose = this.sampleAction(base);
    }

    // Split-step hop.
    if (this.hop > 0) {
      this.hop -= dt;
      const k = Math.max(0, this.hop) / 0.28;
      pose.hipsY += Math.sin(k * Math.PI) * 0.09;
      pose.knR -= Math.sin(k * Math.PI) * 0.3;
      pose.knL -= Math.sin(k * Math.PI) * 0.3;
    }

    // Seated / crouch overrides (officials, ball kids).
    if (this.seated > 0) {
      pose.hipsY = this.seated - this.HIPS_H;
      pose.thR = [Math.PI / 2, 0.08];
      pose.thL = [Math.PI / 2, -0.08];
      pose.knR = pose.knL = -Math.PI / 2;
      pose.spine[0] = -0.05;
      pose.shR = [0.7, 0, 0.15];
      pose.shL = [0.7, 0, -0.15];
      pose.elR = pose.elL = 1.0;
    } else if (this.crouch) {
      pose.hipsY = -0.2;
      pose.thR = [1.25, 0.15];
      pose.thL = [1.25, -0.15];
      pose.knR = pose.knL = -1.7;
      pose.spine[0] = -0.55;
      pose.shR = [1.0, 0, 0.25];
      pose.shL = [1.0, 0, -0.25];
      pose.elR = pose.elL = 0.3;
    }

    // Head turns toward the gaze target (relative to the body).
    if (this.hasGaze) {
      const local = this.root.worldToLocal(this.gaze.clone());
      const yaw = Math.atan2(-local.x, -local.z);
      const pitch = Math.atan2(local.y - 1.4, Math.hypot(local.x, local.z));
      pose.head[1] += THREE.MathUtils.clamp(yaw - pose.spine[1], -1.1, 1.1) * 0.6;
      pose.head[0] += THREE.MathUtils.clamp(pitch, -0.5, 0.5) * 0.5;
    }

    this.applyPose(pose);
    this.pose = clone(pose);

    // Face.
    if (this.exprTimer > 0) {
      this.exprTimer -= dt;
      if (this.exprTimer <= 0) this.expression = this.anticipation > 0.3 ? 'focus' : 'neutral';
    } else if (this.anticipation > 0.3 && this.expression === 'neutral') this.expression = 'focus';
    else if (this.anticipation <= 0.3 && this.expression === 'focus') this.expression = 'neutral';
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinking = 0.12;
      this.blinkTimer = 2.2 + Math.random() * 3;
    }
    if (this.blinking > 0) this.blinking -= dt;
    let gx = 0;
    let gy = 0;
    if (this.hasGaze) {
      const lp = this.head.worldToLocal(this.gaze.clone());
      // Canvas +x is the character's left, so a target on their right (+x) moves the pupils to -x.
      gx = THREE.MathUtils.clamp(-lp.x / Math.max(0.5, -lp.z), -1, 1);
      gy = THREE.MathUtils.clamp(-(lp.y - 0.2) / 3, -1, 1);
    }
    this.face.draw(this.expression, this.blinking > 0, gx, gy);

    // Shadow stays on the ground and shrinks while airborne.
    const lift = Math.max(0, pose.hipsY);
    this.shadow.position.y = 0.015;
    this.shadow.scale.setScalar(1 - lift * 1.5);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.seated > 0 ? 0 : 1;
  }

  private sampleAction(base: Pose): Pose {
    const a = this.action;
    const t = this.actionT;
    if (a === 'celebrate') {
      // Bouncy jumps with arms up, tucked knees in the air.
      const j = Math.abs(Math.sin(t * 6));
      const up = mix(base, ARMS_UP, Math.min(1, t * 5));
      up.hipsY += j * 0.32;
      up.knR = up.knL = -0.2 - j * 0.9;
      up.thR[0] = up.thL[0] = j * 0.6;
      up.shR[2] += Math.sin(t * 12) * 0.25;
      up.shL[2] -= Math.sin(t * 12) * 0.25;
      return up;
    }
    if (a === 'wave') {
      const w = mix(base, STAND, 1);
      w.shR = [2.7, 0, 0.55 + Math.sin(t * 10) * 0.35];
      w.elR = 0.4 + Math.sin(t * 10) * 0.3;
      w.head[2] = Math.sin(t * 3) * 0.1;
      if (t > 2.5) this.action = 'none';
      return w;
    }
    if (a === 'clap') {
      const c = mix(base, STAND, 1);
      const k = Math.abs(Math.sin(t * 9));
      c.shR = [1.2, 0, -0.25 + k * 0.45];
      c.shL = [1.2, 0, 0.25 - k * 0.45];
      c.elR = c.elL = 1.1;
      if (t > 2) this.action = 'none';
      return c;
    }
    const def = ACTIONS[a as keyof typeof ACTIONS];
    if (!def) return base;
    if (t >= def.dur) {
      this.action = a === 'dejected' || a === 'fistpump' ? 'none' : 'none';
      return base;
    }
    const out = sampleKeys(def.keys, t, clone(base));
    // Blend in from where we were for the first frames so actions never pop.
    const k = Math.min(1, t / 0.05);
    return mix(this.actionFrom, out, k, out);
  }

  private applyPose(p: Pose): void {
    this.hips.position.y = this.HIPS_H + p.hipsY;
    this.spine.rotation.set(p.spine[0], p.spine[1], p.spine[2]);
    this.head.rotation.set(p.head[0], p.head[1] * 0.85, p.head[2]);
    this.shR.rotation.set(p.shR[0], p.shR[1], p.shR[2]);
    this.shL.rotation.set(p.shL[0], p.shL[1], p.shL[2]);
    this.elR.rotation.x = p.elR;
    this.elL.rotation.x = p.elL;
    this.thR.rotation.set(p.thR[0], 0, p.thR[1]);
    this.thL.rotation.set(p.thL[0], 0, p.thL[1]);
    this.knR.rotation.x = p.knR;
    this.knL.rotation.x = p.knL;
  }

  /** World position of the paddle face (for impact effects). */
  paddleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.paddle.children[0].getWorldPosition(out);
  }
}
