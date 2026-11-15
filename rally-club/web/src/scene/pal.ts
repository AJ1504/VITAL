// Rally Club members — original stylised athletes (see "Meet the Members"): friendly 1:5 proportions,
// big expressive faces (blink, ball-tracking eyes, grin, laugh, gasp, pout), pastel club wear (polos with
// striped trims, tanks, cardigans, crop sweaters, pleated skirts, shorts, trousers), striped socks and chunky
// sneakers, and six hairstyles. Animation: keyframed actions (anticipation → whip → follow-through) layered
// over procedural locomotion (run, side-shuffle, split-step), with a smoothing filter so nothing ever pops.

import * as THREE from 'three';
import { createBody } from './body.ts';

export type HairStyle = 'quiff' | 'ponytail' | 'wavy' | 'afro' | 'bun' | 'curly' | 'short' | 'bob' | 'spiky' | 'bald';
export type Headwear = 'none' | 'visor' | 'headband' | 'cap' | 'panama' | 'headphones';
export type Top = 'polo' | 'tank' | 'cardigan' | 'crop' | 'tee';
export type Bottom = 'shorts' | 'skirt' | 'trousers';
export type Expression = 'neutral' | 'focus' | 'happy' | 'ecstatic' | 'laugh' | 'sad' | 'surprised' | 'determined';
export type Action = 'none' | 'swing_fh' | 'swing_bh' | 'serve' | 'celebrate' | 'fistpump' | 'dejected' | 'wave' | 'clap' | 'laugh';

export interface PalLook {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  headwear?: Headwear;
  headwearColor?: number;
  /** Scrunchie / ribbon colour for ponytails and buns. */
  hairAccent?: number;
  top?: Top;
  shirt: number;
  /** Under-layer for cardigans (polo collar colour). */
  shirtInner?: number;
  shorts: number;
  bottom?: Bottom;
  shoes: number;
  /** Stripe colour for sleeves, hems, socks and sneaker accents. */
  trim?: number;
  paddle?: number;
  trousers?: number;
  eye?: number;
  build?: number;
  freckles?: boolean;
  lashes?: boolean;
  beard?: boolean;
  wristband?: number;
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
const STAND: Pose = { hipsY: 0, spine: [-0.03, 0, 0], head: [0.04, 0, 0], shR: [0.12, 0, 0.14], elR: 0.25, shL: [0.12, 0, -0.14], elL: 0.25, thR: [0, 0.06], knR: -0.04, thL: [0, -0.06], knL: -0.04 };
// Ready (from the action studies): wide, low athletic stance, paddle held out in front with both hands.
const READY: Pose = { hipsY: -0.13, spine: [-0.3, 0, 0], head: [0.26, 0, 0], shR: [0.85, 0, 0.18], elR: 1.05, shL: [0.8, 0, -0.08], elL: 1.25, thR: [0.45, 0.24], knR: -0.85, thL: [0.45, -0.24], knL: -0.85 };
const BACK_FH = P({ spine: [-0.2, -1.1, -0.06], head: [0.15, 1.0, 0], shR: [0.4, 0, 1.4], elR: 0.45, shL: [1.3, 0, -0.2], elL: 0.25, thR: [0.3, 0.3], knR: -0.95, thL: [0.55, -0.2], knL: -0.6 }, READY);
const HIT_FH = P({ spine: [-0.24, 0.2, 0], head: [0.15, -0.15, 0], shR: [1.35, 0, 0.6], elR: 0.1, shL: [0.5, 0, -0.7], elL: 0.8, thR: [0.4, 0.25], knR: -0.7, thL: [0.4, -0.25], knL: -0.8 }, READY);
const FOLLOW_FH = P({ spine: [-0.12, 1.1, 0.06], head: [0.12, -0.95, 0], shR: [2.0, 0, -1.0], elR: 1.4, shL: [0.25, 0, -0.6], elL: 1.2 }, READY);
const BACK_BH = P({ spine: [-0.2, 1.05, 0.06], head: [0.15, -1.0, 0], shR: [1.0, 0, -1.2], elR: 1.1, shL: [0.65, 0, -0.1], elL: 1.3, thR: [0.55, 0.2], knR: -0.6, thL: [0.3, -0.3], knL: -0.95 }, READY);
const HIT_BH = P({ spine: [-0.24, -0.15, 0], head: [0.15, 0.12, 0], shR: [1.3, 0, -0.1], elR: 0.1, shL: [0.4, 0, -0.8], elL: 0.5 }, READY);
const FOLLOW_BH = P({ spine: [-0.12, -1.0, -0.06], head: [0.12, 0.95, 0], shR: [1.9, 0, 1.3], elR: 0.25, shL: [0.3, 0, -1.05], elL: 0.35 }, READY);
const SERVE_READY = P({ hipsY: -0.05, spine: [-0.18, -0.3, 0], head: [0.18, 0.25, 0], shR: [-0.5, 0, 0.3], elR: 0.35, shL: [1.0, 0, 0.55], elL: 0.55, thR: [0.15, 0.12], knR: -0.35, thL: [0.3, -0.12], knL: -0.4 }, READY);
const SERVE_HIT = P({ spine: [-0.3, 0.12, 0], head: [0.18, -0.1, 0], shR: [1.0, 0, 0.18], elR: 0.15, shL: [0.5, 0, -0.45], elL: 0.7 }, SERVE_READY);
const SERVE_FOLLOW = P({ hipsY: -0.03, spine: [-0.08, 0.5, 0], head: [0.14, -0.35, 0], shR: [2.35, 0, -0.35], elR: 0.7, shL: [0.3, 0, -0.6], elL: 0.9, thR: [0.35, 0.12], knR: -0.45, thL: [-0.12, -0.12], knL: -0.3 }, SERVE_READY);
// Disappointed (action studies): bent over, hands on knees, head hanging.
const DEJECTED = P({ hipsY: -0.12, spine: [-0.85, 0, 0], head: [-0.25, 0, 0], shR: [1.25, 0, 0.12], elR: 0.25, shL: [1.25, 0, -0.12], elL: 0.25, thR: [0.45, 0.14], knR: -0.65, thL: [0.45, -0.14], knL: -0.65 }, READY);
const ARMS_UP = P({ hipsY: 0, spine: [0.15, 0, 0], head: [0.35, 0, 0], shR: [3.0, 0, 0.4], elR: 0.1, shL: [3.0, 0, -0.4], elL: 0.1, thR: [0.1, 0.1], knR: -0.1, thL: [0.1, -0.1], knL: -0.1 }, READY);
// Fist pump (action studies): free arm cocked up, paddle low, knee lifted.
const FIST = P({ hipsY: -0.05, spine: [-0.1, 0.25, 0.1], head: [0.3, -0.2, 0], shR: [0.4, 0, 0.35], elR: 0.5, shL: [2.2, 0, -0.5], elL: 2.1, thR: [0.1, 0.12], knR: -0.15, thL: [0.9, -0.12], knL: -1.3 }, READY);
// Laughing (action studies): leaning back, hand to belly.
const LAUGH = P({ hipsY: 0, spine: [0.3, 0.1, 0], head: [0.45, 0, 0.1], shR: [0.2, 0, 0.3], elR: 0.4, shL: [0.6, 0, 0.3], elL: 1.9, thR: [0, 0.08], knR: -0.08, thL: [0, -0.08], knL: -0.08 }, READY);

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
      return mix(a.pose, b.pose, easeFn(b.ease, (t - a.t) / (b.t - a.t)), out);
    }
  }
  return mix(keys[keys.length - 1].pose, keys[keys.length - 1].pose, 0, out);
}

const ACTIONS: Record<'swing_fh' | 'swing_bh' | 'serve' | 'fistpump' | 'dejected' | 'laugh', { keys: Key[]; dur: number }> = {
  swing_fh: { dur: 0.8, keys: [{ t: 0, pose: BACK_FH }, { t: 0.1, pose: HIT_FH, ease: 'in' }, { t: 0.32, pose: FOLLOW_FH, ease: 'out' }, { t: 0.46, pose: FOLLOW_FH }, { t: 0.8, pose: READY, ease: 'inout' }] },
  swing_bh: { dur: 0.8, keys: [{ t: 0, pose: BACK_BH }, { t: 0.1, pose: HIT_BH, ease: 'in' }, { t: 0.32, pose: FOLLOW_BH, ease: 'out' }, { t: 0.46, pose: FOLLOW_BH }, { t: 0.8, pose: READY, ease: 'inout' }] },
  serve: { dur: 1.0, keys: [{ t: 0, pose: SERVE_READY }, { t: 0.08, pose: SERVE_HIT, ease: 'in' }, { t: 0.34, pose: SERVE_FOLLOW, ease: 'out' }, { t: 0.52, pose: SERVE_FOLLOW }, { t: 1.0, pose: READY, ease: 'inout' }] },
  fistpump: { dur: 1.4, keys: [{ t: 0, pose: READY }, { t: 0.2, pose: FIST, ease: 'out' }, { t: 0.42, pose: P({ elL: 1.5, shL: [1.7, 0, -0.5] }, FIST) }, { t: 0.58, pose: FIST, ease: 'out' }, { t: 1.0, pose: FIST }, { t: 1.4, pose: STAND, ease: 'inout' }] },
  dejected: { dur: 1.7, keys: [{ t: 0, pose: READY }, { t: 0.4, pose: DEJECTED, ease: 'out' }, { t: 1.3, pose: DEJECTED }, { t: 1.7, pose: STAND, ease: 'inout' }] },
  laugh: { dur: 1.8, keys: [{ t: 0, pose: STAND }, { t: 0.3, pose: LAUGH, ease: 'out' }, { t: 1.4, pose: LAUGH }, { t: 1.8, pose: STAND, ease: 'inout' }] },
};

// ------------------------------------------------------------------ face

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

class Face {
  readonly canvas = document.createElement('canvas');
  readonly texture: THREE.CanvasTexture;
  private key = '';
  private look: PalLook;
  constructor(look: PalLook) {
    this.look = look;
    this.canvas.width = 512;
    this.canvas.height = 256;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
  }

  draw(expr: Expression, blink: boolean, gx: number, gy: number): void {
    const key = `${expr}|${blink}|${Math.round(gx * 3)}|${Math.round(gy * 3)}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 256);
    const cx = 384;
    const eyeY = 120;
    const ink = '#2b201c';
    const brow = hex(this.look.hair === 0xf2d9a0 ? 0xb08a50 : this.look.hair);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Cheeks
    for (const s of [-1, 1]) {
      const grd = g.createRadialGradient(cx + s * 40, 148, 0, cx + s * 40, 148, 14);
      grd.addColorStop(0, expr === 'laugh' || expr === 'ecstatic' ? 'rgba(255,110,110,0.6)' : 'rgba(255,130,120,0.38)');
      grd.addColorStop(1, 'rgba(255,130,120,0)');
      g.fillStyle = grd;
      g.fillRect(cx + s * 40 - 16, 132, 32, 32);
    }
    if (this.look.freckles) {
      g.fillStyle = 'rgba(150,90,60,0.55)';
      for (const s of [-1, 1]) for (const [dx, dy] of [[-6, 0], [2, -4], [6, 5], [-1, 7]]) {
        g.beginPath();
        g.arc(cx + s * 40 + dx, 142 + dy, 1.4, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.look.beard) {
      g.fillStyle = 'rgba(30,20,15,0.32)';
      g.beginPath();
      g.ellipse(cx, 168, 30, 16, 0, 0, Math.PI);
      g.fill();
    }

    const closed = expr === 'happy' || expr === 'ecstatic' || expr === 'laugh';
    for (const s of [-1, 1]) {
      const ex = cx + s * 24;
      if (blink || closed) {
        g.strokeStyle = ink;
        g.lineWidth = 4.5;
        g.beginPath();
        if (closed) g.arc(ex, eyeY + 6, 9, Math.PI * 1.12, Math.PI * 1.88);
        else {
          g.moveTo(ex - 9, eyeY + 2);
          g.quadraticCurveTo(ex, eyeY + 5, ex + 9, eyeY + 2);
        }
        g.stroke();
      } else {
        const big = expr === 'surprised' ? 1.2 : 1;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(ex, eyeY, 10 * big, 13 * big, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = hex(this.look.eye ?? 0x4a3426);
        g.beginPath();
        g.ellipse(ex + gx * 3.5, eyeY + gy * 3.5 + 1, 7.5 * big, 9.5 * big, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = ink;
        g.beginPath();
        g.ellipse(ex + gx * 4, eyeY + gy * 4 + 1, 4.2 * big, 5.6 * big, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex + gx * 3.5 - 2.8, eyeY + gy * 3.5 - 3.5, 2.4, 0, Math.PI * 2);
        g.fill();
        // Upper lid line (+ lashes)
        g.strokeStyle = ink;
        g.lineWidth = 3;
        g.beginPath();
        const lid = expr === 'sad' ? 3 : expr === 'focus' || expr === 'determined' ? 4 : 0;
        g.ellipse(ex, eyeY + lid, 10.5 * big, 13.5 * big, 0, Math.PI * 1.08, Math.PI * 1.92);
        g.stroke();
        if (this.look.lashes) {
          g.beginPath();
          g.moveTo(ex + s * 9, eyeY - 8);
          g.lineTo(ex + s * 14, eyeY - 12);
          g.stroke();
        }
      }
      // Brows (hair-coloured, thick)
      g.strokeStyle = brow;
      g.lineWidth = 5;
      g.beginPath();
      const by = eyeY - 24;
      if (expr === 'focus' || expr === 'determined') {
        g.moveTo(ex - s * 11, by - 4);
        g.lineTo(ex + s * 9, by + 3);
      } else if (expr === 'sad') {
        g.moveTo(ex - s * 11, by + 4);
        g.lineTo(ex + s * 9, by - 4);
      } else if (expr === 'surprised' || expr === 'ecstatic' || expr === 'laugh') {
        g.arc(ex, by + 2, 10, Math.PI * 1.15, Math.PI * 1.85);
      } else {
        g.moveTo(ex - 10, by + 1);
        g.quadraticCurveTo(ex, by - 4, ex + 10, by + 1);
      }
      g.stroke();
    }

    // Mouth
    const my = 160;
    g.strokeStyle = ink;
    g.lineWidth = 3.5;
    g.beginPath();
    const mouthFill = '#8a3a3a';
    switch (expr) {
      case 'happy':
      case 'neutral': {
        const w = expr === 'happy' ? 15 : 11;
        g.moveTo(cx - w, my - 2);
        g.quadraticCurveTo(cx, my + (expr === 'happy' ? 15 : 8), cx + w, my - 2);
        if (expr === 'happy') {
          g.closePath();
          g.fillStyle = mouthFill;
          g.fill();
          g.fillStyle = '#ffffff';
          g.fillRect(cx - w + 4, my - 1, (w - 4) * 2, 4); // teeth
        }
        g.stroke();
        break;
      }
      case 'ecstatic':
      case 'laugh':
        g.ellipse(cx, my + 1, 15, 13, 0, 0, Math.PI);
        g.closePath();
        g.fillStyle = mouthFill;
        g.fill();
        g.stroke();
        g.fillStyle = '#ffffff';
        g.fillRect(cx - 11, my + 1, 22, 4);
        g.fillStyle = '#f08a8a';
        g.beginPath();
        g.ellipse(cx, my + 9, 7, 3.5, 0, 0, Math.PI * 2);
        g.fill();
        break;
      case 'surprised':
        g.ellipse(cx, my + 3, 6, 8, 0, 0, Math.PI * 2);
        g.fillStyle = mouthFill;
        g.fill();
        g.stroke();
        break;
      case 'sad':
        g.moveTo(cx - 10, my + 6);
        g.quadraticCurveTo(cx, my - 4, cx + 10, my + 6);
        g.stroke();
        break;
      default:
        g.moveTo(cx - 8, my + 2);
        g.quadraticCurveTo(cx + 2, my + 4, cx + 9, my);
        g.stroke();
    }
    this.texture.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ geometry helpers

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(c: number, rough = 0.7): THREE.MeshStandardMaterial {
  const k = `${c}|${rough}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 });
    matCache.set(k, m);
  }
  return m;
}

function capsule(r: number, len: number, m: THREE.Material, hang = true): THREE.Group {
  const g = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.001, len - r * 2), 6, 14), m);
  mesh.position.y = hang ? -len / 2 : len / 2;
  mesh.castShadow = true;
  g.add(mesh);
  return g;
}

function ring(r: number, h: number, m: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 18, 1, true), m);
  mesh.position.y = y;
  return mesh;
}

export interface PalState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /** World-space velocity (for side-shuffle footwork). */
  vx?: number;
  vz?: number;
}

const tmpV = new THREE.Vector3();

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
  readonly handL = new THREE.Group();
  readonly paddle = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly body: THREE.SkinnedMesh;
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
  private shown: Pose = clone(STAND);
  private scratch: Pose = clone(STAND);
  ready = 1;
  serving = false;
  seated = 0;
  crouch = false;
  readonly HIPS_H = 0.8;

  constructor(look: PalLook, shadowTex?: THREE.Texture) {
    const skin = mat(look.skin, 0.55);
    const top = look.top ?? 'polo';
    const bottom = look.bottom ?? (look.trousers ? 'trousers' : 'shorts');
    const trim = mat(look.trim ?? 0xffffff, 0.7);
    const build = look.build ?? 0.5;

    this.root.add(this.hips);
    this.hips.position.y = this.HIPS_H;
    this.hips.add(this.spine);

    // ---- collar details on the shirt (the body itself is one smooth skinned mesh, built below)
    if (top === 'polo' || top === 'cardigan') {
      const collarM = top === 'cardigan' ? mat(look.shirtInner ?? 0xfbf8f2, 0.7) : trim;
      for (const s of [-1, 1]) {
        const flap = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.014, 0.06), collarM);
        flap.position.set(s * 0.04, 0.515, -0.07);
        flap.rotation.set(-0.55, s * -0.5, s * 0.25);
        this.spine.add(flap);
      }
      const placket = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.1, 0.01), collarM);
      placket.position.set(0, 0.46, -0.118);
      placket.rotation.x = 0.12;
      this.spine.add(placket);
      if (top === 'cardigan') {
        const open = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.01), mat(look.shirtInner ?? 0xfbf8f2, 0.7));
        open.position.set(0, 0.32, -0.124);
        this.spine.add(open);
        for (let k = 0; k < 3; k++) {
          const bt = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), mat(0xfbf8f2));
          bt.position.set(-0.042, 0.4 - k * 0.08, -0.13);
          this.spine.add(bt);
        }
      }
    }
    if (bottom === 'skirt') {
      const sk = new THREE.CylinderGeometry(0.16, 0.27, 0.25, 20, 1, true);
      const sp = sk.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sp.count; i++) {
        if (sp.getY(i) < 0) {
          const ang = Math.atan2(sp.getZ(i), sp.getX(i));
          const k = 1 + (Math.round((ang / (Math.PI * 2)) * 40) % 2 ? 0.05 : -0.02);
          sp.setX(i, sp.getX(i) * k);
          sp.setZ(i, sp.getZ(i) * k);
        }
      }
      sk.computeVertexNormals();
      const skirt = new THREE.Mesh(sk, new THREE.MeshStandardMaterial({ color: look.shorts, roughness: 0.8, side: THREE.DoubleSide }));
      skirt.scale.z = 0.85;
      skirt.position.y = -0.02;
      skirt.castShadow = true;
      this.hips.add(skirt);
      const hemStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.262, 0.272, 0.02, 20, 1, true), trim);
      hemStripe.scale.z = 0.85;
      hemStripe.position.y = -0.13;
      this.hips.add(hemStripe);
    }

    // ---- head
    this.head.position.y = 0.63;
    this.spine.add(this.head);
    const R = 0.165;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(R, 40, 28), skin);
    skull.scale.set(1, 1.04, 0.98);
    skull.position.y = 0.15;
    skull.castShadow = true;
    this.head.add(skull);
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(R * 0.82, 24, 16), skin);
    jaw.scale.set(1, 0.8, 0.95);
    jaw.position.set(0, 0.09, -0.012);
    this.head.add(jaw);
    this.face = new Face(look);
    const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.006, 48, 32), new THREE.MeshStandardMaterial({ map: this.face.texture, transparent: true, roughness: 0.6, depthWrite: false }));
    faceMesh.scale.copy(skull.scale);
    faceMesh.position.copy(skull.position);
    faceMesh.renderOrder = 2;
    this.head.add(faceMesh);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), skin);
    nose.scale.set(1, 0.9, 1.1);
    nose.position.set(0, 0.135, -R * 1.0);
    this.head.add(nose);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), skin);
      ear.scale.set(0.55, 1, 0.8);
      ear.position.set(s * R * 0.99, 0.135, 0.01);
      this.head.add(ear);
    }
    this.buildHair(look, R, skull.position.y);

    // ---- joints: shoulders, elbows, hands, hips, knees
    for (const [sh, el, hd, s] of [
      [this.shR, this.elR, this.hand, 1],
      [this.shL, this.elL, this.handL, -1],
    ] as const) {
      sh.position.set(s * 0.2, 0.5, 0);
      this.spine.add(sh);
      el.position.y = -0.21;
      sh.add(el);
      hd.position.y = -0.22;
      el.add(hd);
    }
    for (const [th, kn, s] of [
      [this.thR, this.knR, 1],
      [this.thL, this.knL, -1],
    ] as const) {
      th.position.set(s * 0.085, 0, 0);
      this.hips.add(th);
      kn.position.y = -0.34;
      th.add(kn);
    }

    // ---- paddle (crest-marked face; normal along the swing direction)
    const paddleFace = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.016), mat(look.paddle ?? 0x8fab83, 0.45));
    paddleFace.position.set(0, -0.23, -0.02);
    paddleFace.castShadow = true;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.012), mat(0xfbf8f2, 0.5));
    rim.position.copy(paddleFace.position);
    rim.position.z += 0.001;
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), mat(0xf3e7c9, 0.6));
    mark.position.set(0, -0.24, -0.029);
    mark.rotation.y = Math.PI;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.12, 10), mat(0xf5efe3, 0.7));
    grip.position.y = -0.06;
    this.paddle.add(rim, paddleFace, mark, grip);
    this.paddle.rotation.x = 0.35;
    this.hand.add(this.paddle);

    // ---- the body: one smooth skinned mesh over the joints
    this.body = createBody(
      { skin: look.skin, shirt: look.shirt, lower: look.trousers ?? look.shorts, trim: look.trim ?? 0xffffff, shoes: look.shoes, wristband: look.wristband, top, bottom, build },
      this.root,
      { hips: this.hips, spine: this.spine, head: this.head, shR: this.shR, elR: this.elR, hand: this.hand, shL: this.shL, elL: this.elL, handL: this.handL, thR: this.thR, knR: this.knR, thL: this.thL, knL: this.knL },
    );

    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), new THREE.MeshBasicMaterial({ map: shadowTex ?? null, color: shadowTex ? 0xffffff : 0x000000, transparent: true, opacity: shadowTex ? 1 : 0.2, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.root.add(this.shadow);
    this.applyPose(STAND);
    this.face.draw('neutral', false, 0, 0);
  }

  private buildHair(look: PalLook, R: number, cy: number): void {
    const hm = mat(look.hair, 0.85);
    const add = (m: THREE.Mesh) => {
      m.castShadow = true;
      this.head.add(m);
      return m;
    };
    const style = look.hairStyle;
    const cap = (depth: number, tilt: number, scale = 1.07) => {
      const c = add(new THREE.Mesh(new THREE.SphereGeometry(R * scale, 32, 20, 0, Math.PI * 2, 0, Math.PI * depth), hm));
      c.position.y = cy + 0.004;
      c.rotation.x = tilt;
      return c;
    };
    const blob = (x: number, y: number, z: number, r: number, sx = 1, sy = 1, sz = 1) => {
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), hm));
      b.position.set(x, y, z);
      b.scale.set(sx, sy, sz);
      return b;
    };
    switch (style) {
      case 'bald':
        break;
      case 'quiff':
        cap(0.5, 0.35);
        blob(0.02, cy + R * 0.9, -R * 0.55, R * 0.55, 1.5, 0.55, 0.9).rotation.x = -0.5;
        for (let i = 0; i < 5; i++) blob(-0.07 + i * 0.035, cy + R * 1.05, -R * 0.25 + (i % 2) * 0.03, R * 0.25, 0.7, 1.1, 0.7).rotation.z = (i - 2) * 0.2;
        break;
      case 'ponytail': {
        cap(0.55, 0.3);
        const tie = add(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.018, 8, 14), mat(look.hairAccent ?? 0xc8b8e3, 0.8)));
        tie.position.set(0, cy + R * 0.85, R * 0.55);
        tie.rotation.x = 0.9;
        const tail = blob(0, cy + R * 0.25, R * 1.05, R * 0.42, 0.85, 2.2, 0.9);
        tail.rotation.x = 0.35;
        blob(0.02, cy - R * 0.4, R * 1.15, R * 0.32, 0.8, 1.4, 0.8);
        blob(0.01, cy + R * 0.8, -R * 0.55, R * 0.45, 1.6, 0.5, 0.8).rotation.x = -0.4;
        break;
      }
      case 'wavy':
        cap(0.58, 0.25, 1.1);
        blob(0.03, cy + R * 0.85, -R * 0.45, R * 0.55, 1.6, 0.6, 0.9).rotation.set(-0.5, 0, 0.2);
        for (const s of [-1, 1]) blob(s * R * 0.85, cy + R * 0.2, R * 0.1, R * 0.4, 0.8, 1.2, 1);
        blob(0, cy + R * 0.3, R * 0.75, R * 0.6, 1.4, 1.1, 0.8);
        break;
      case 'afro':
        cap(0.55, 0.15, 1.04);
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2 * 3.1;
          const el = 0.15 + (i / 26) * 1.1;
          blob(Math.cos(a) * Math.sin(el) * R * 1.05, cy + Math.cos(el) * R * 1.05, Math.sin(a) * Math.sin(el) * R * 1.05 + 0.01, R * 0.24);
        }
        break;
      case 'bun':
        cap(0.55, 0.15);
        blob(0, cy + R * 1.15, R * 0.15, R * 0.48);
        for (let i = 0; i < 5; i++) blob(Math.cos(i * 1.2) * R * 0.3, cy + R * 1.2 + (i % 2) * 0.02, R * 0.15 + Math.sin(i * 1.2) * R * 0.3, R * 0.2);
        blob(0.0, cy + R * 0.75, -R * 0.62, R * 0.3, 1.8, 0.4, 0.6);
        break;
      case 'curly':
        cap(0.6, 0.2, 1.08);
        for (let i = 0; i < 34; i++) {
          const a = (i / 34) * Math.PI * 2 * 2.3;
          const r2 = R * (1.15 + (i % 3) * 0.12);
          const y = cy + R * (0.9 - (i / 34) * 1.4);
          blob(Math.cos(a) * r2, y, Math.sin(a) * r2 + R * 0.25, R * 0.3);
        }
        break;
      case 'bob':
        cap(0.66, 0.2, 1.1);
        break;
      case 'spiky':
        cap(0.48, 0.3);
        for (let i = 0; i < 7; i++) {
          const sp = add(new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.1, 8), hm));
          const a = (i / 7) * Math.PI * 2;
          sp.position.set(Math.cos(a) * R * 0.45, cy + R * 0.95, Math.sin(a) * R * 0.45 + 0.02);
          sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        }
        break;
      default:
        cap(0.5, 0.32);
        blob(0.03, cy + R * 0.82, -R * 0.55, R * 0.45, 1.5, 0.45, 0.8).rotation.x = -0.6;
    }
    const hw = look.headwear ?? 'none';
    const hc = mat(look.headwearColor ?? 0xffffff, 0.6);
    if (hw === 'visor' || hw === 'headband') {
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 1.1, R * 1.1, 0.04, 32, 1, true), hc));
      band.position.y = cy + R * 0.45;
      band.rotation.x = 0.12;
      if (hw === 'visor') {
        const peak = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R * 0.95, 0.014, 24, 1, false, Math.PI / 2, Math.PI), hc));
        peak.position.set(0, cy + R * 0.42, -R * 0.65);
        peak.rotation.x = 0.15;
      }
    } else if (hw === 'cap') {
      const crown = add(new THREE.Mesh(new THREE.SphereGeometry(R * 1.12, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hc));
      crown.position.y = cy + 0.012;
      const bill = add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.9, R * 0.9, 0.016, 24, 1, false, Math.PI / 2, Math.PI), hc));
      bill.position.set(0, cy + R * 0.14, -R * 0.78);
      bill.rotation.x = 0.1;
    } else if (hw === 'panama') {
      const prof = [new THREE.Vector2(0, 0.1), new THREE.Vector2(R * 0.95, 0.09), new THREE.Vector2(R * 1.06, 0.0), new THREE.Vector2(R * 1.75, -0.015), new THREE.Vector2(R * 1.75, -0.03), new THREE.Vector2(0, -0.03)];
      const hat = add(new THREE.Mesh(new THREE.LatheGeometry(prof, 28), mat(0xeadfbf, 0.9)));
      hat.position.y = cy + R * 0.66;
    } else if (hw === 'headphones') {
      const arc = add(new THREE.Mesh(new THREE.TorusGeometry(R * 1.1, 0.015, 8, 24, Math.PI), hc));
      arc.position.y = cy;
      for (const s of [-1, 1]) {
        const cup = add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), hc));
        cup.rotation.z = Math.PI / 2;
        cup.position.set(s * R * 1.08, cy, 0);
      }
    }
  }

  // ---------------------------------------------------------------- control API

  setExpression(e: Expression, hold = 1.8): void {
    this.expression = e;
    this.exprTimer = hold;
  }

  lookAt(p: THREE.Vector3 | null): void {
    if (p) {
      this.gaze.copy(p);
      this.hasGaze = true;
    } else this.hasGaze = false;
  }

  anticipate(side: 'fh' | 'bh', amount: number): void {
    if (this.action === 'swing_fh' || this.action === 'swing_bh' || this.action === 'serve') {
      this.anticipation = 0;
      return;
    }
    this.antSide = side;
    // Ease the coil in/out instead of snapping when the plan updates.
    this.anticipation += (amount - this.anticipation) * 0.35;
  }

  splitStep(): void {
    if (this.hop <= 0) this.hop = 0.3;
  }

  play(a: Action): void {
    this.actionFrom = clone(this.shown);
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
    let dy = st.yaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * Math.min(1, dt * 10);
    this.phase += dt * (5.5 + st.speed * 2.4);

    const base = mix(STAND, this.serving ? SERVE_READY : READY, this.ready, this.scratch);
    const run = Math.min(1, st.speed / 3.0);
    // Footwork: side-shuffle when moving mostly sideways relative to facing, else a run cycle.
    let lateral = 0;
    if (st.vx !== undefined && st.vz !== undefined && st.speed > 0.05) {
      const yaw = this.root.rotation.y;
      const right = Math.cos(yaw) * st.vx - Math.sin(yaw) * st.vz; // velocity along the body's right axis
      lateral = Math.min(1, Math.abs(right) / Math.max(0.01, st.speed));
    }
    if (run > 0.02) {
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      const fwd = run * (1 - lateral * 0.85);
      const side = run * lateral;
      base.thR[0] += s * 0.95 * fwd;
      base.thL[0] -= s * 0.95 * fwd;
      base.knR += -Math.max(0, -s) * 1.3 * fwd - 0.1 * fwd;
      base.knL += -Math.max(0, s) * 1.3 * fwd - 0.1 * fwd;
      // Shuffle: feet slide apart/together, knees stay bent, little hops.
      base.thR[1] += Math.max(0, s) * 0.35 * side;
      base.thL[1] -= Math.max(0, -s) * 0.35 * side;
      base.hipsY += (Math.abs(c) * 0.05 - 0.02) * run;
      base.spine[0] -= 0.1 * fwd;
      base.spine[2] += c * 0.05 * run;
      base.shL[0] += -s * 0.7 * fwd;
      if (this.anticipation < 0.2 && this.action === 'none') base.shR[0] += s * 0.35 * fwd;
    } else if (this.ready > 0.5 && this.action === 'none') {
      const b = Math.sin(this.phase * 0.9);
      base.hipsY += b * 0.012;
      base.spine[2] += b * 0.02;
    }

    if (this.anticipation > 0.01) {
      const a = this.anticipation;
      mix(base, this.antSide === 'fh' ? BACK_FH : BACK_BH, a * a * (3 - 2 * a), base);
    }

    let pose = base;
    if (this.action !== 'none') {
      this.actionT += dt;
      pose = this.sampleAction(base);
    }
    if (this.hop > 0) {
      this.hop -= dt;
      const k = Math.sin((Math.max(0, this.hop) / 0.3) * Math.PI);
      pose.hipsY += k * 0.08;
      pose.knR -= k * 0.25;
      pose.knL -= k * 0.25;
    }
    if (this.seated > 0) {
      pose.hipsY = this.seated - this.HIPS_H;
      pose.thR = [Math.PI / 2, 0.1];
      pose.thL = [Math.PI / 2, -0.1];
      pose.knR = pose.knL = -Math.PI / 2;
      pose.spine[0] = -0.04;
      pose.shR = [0.6, 0, 0.12];
      pose.shL = [0.6, 0, -0.12];
      pose.elR = pose.elL = 1.0;
    } else if (this.crouch) {
      pose.hipsY = -0.36;
      pose.thR = [1.3, 0.18];
      pose.thL = [1.3, -0.18];
      pose.knR = pose.knL = -1.8;
      pose.spine[0] = -0.55;
    }

    if (this.hasGaze) {
      const local = this.root.worldToLocal(tmpV.copy(this.gaze));
      const yaw = Math.atan2(-local.x, -local.z);
      const pitch = Math.atan2(local.y - 1.5, Math.hypot(local.x, local.z));
      pose.head[1] += THREE.MathUtils.clamp(yaw - pose.spine[1], -1.1, 1.1) * 0.55;
      pose.head[0] += THREE.MathUtils.clamp(pitch, -0.5, 0.5) * 0.45;
    }

    // Smoothing filter: snappy during swing contact, soft otherwise — removes every pop and jitter.
    const swinging = (this.action === 'swing_fh' || this.action === 'swing_bh' || this.action === 'serve') && this.actionT < 0.4;
    const k = 1 - Math.exp(-dt * (swinging ? 60 : 16));
    mix(this.shown, pose, dt <= 0.0002 ? 0 : k, this.shown);
    this.applyPose(this.shown);

    // Face
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
      const lp = this.head.worldToLocal(tmpV.copy(this.gaze));
      gx = THREE.MathUtils.clamp(-lp.x / Math.max(0.5, -lp.z), -1, 1);
      gy = THREE.MathUtils.clamp(-(lp.y - 0.15) / 3, -1, 1);
    }
    this.face.draw(this.expression, this.blinking > 0, gx, gy);

    const lift = Math.max(0, this.shown.hipsY);
    this.shadow.scale.setScalar(1 - lift * 1.4);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = this.seated > 0 ? 0 : 1;
  }

  private sampleAction(base: Pose): Pose {
    const a = this.action;
    const t = this.actionT;
    if (a === 'celebrate') {
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
      if (t > 2.2) this.action = 'none';
      return c;
    }
    const def = ACTIONS[a as keyof typeof ACTIONS];
    if (!def || t >= def.dur) {
      this.action = 'none';
      return base;
    }
    const out = sampleKeys(def.keys, t, clone(base));
    if (a === 'laugh') {
      out.spine[0] += Math.sin(t * 18) * 0.04;
      out.hipsY += Math.abs(Math.sin(t * 18)) * 0.01;
    }
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

  paddleWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.paddle.children[1].getWorldPosition(out);
  }
}
