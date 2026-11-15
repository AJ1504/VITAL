// Smooth skinned bodies for the club members. Each body is sculpted as one signed-distance field
// (tapered limbs, chest, pelvis, hands and sneakers blended with smooth unions, plus clothing flares for
// sleeves and shorts), meshed with surface nets, coloured per clothing region and skin-weighted to the
// member's joints. The result is a single continuous mesh that bends at the shoulders, elbows, hips and
// knees, driven by the existing pose/animation system. Geometry is cached per outfit cut.

import * as THREE from 'three';

export type BodyTop = 'polo' | 'tank' | 'cardigan' | 'crop' | 'tee';
export type BodyBottom = 'shorts' | 'skirt' | 'trousers';

export interface BodyLook {
  skin: number;
  shirt: number;
  lower: number;
  trim: number;
  shoes: number;
  sole?: number;
  sock?: number;
  wristband?: number;
  top: BodyTop;
  bottom: BodyBottom;
  build: number;
}

/** Joint objects (any Object3D) in the member's rig, used directly as skeleton bones. */
export interface BodyJoints {
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  head: THREE.Object3D;
  shR: THREE.Object3D;
  elR: THREE.Object3D;
  hand: THREE.Object3D;
  shL: THREE.Object3D;
  elL: THREE.Object3D;
  handL: THREE.Object3D;
  thR: THREE.Object3D;
  knR: THREE.Object3D;
  thL: THREE.Object3D;
  knL: THREE.Object3D;
}

const BONES = ['hips', 'spine', 'head', 'shR', 'elR', 'hand', 'shL', 'elL', 'handL', 'thR', 'knR', 'thL', 'knL'] as const;
type BoneName = (typeof BONES)[number];
const BI = Object.fromEntries(BONES.map((b, i) => [b, i])) as Record<BoneName, number>;
const ADJ_SRC: Record<BoneName, BoneName[]> = {
  hips: ['hips', 'spine', 'thR', 'thL'],
  spine: ['spine', 'hips', 'head', 'shR', 'shL'],
  head: ['head', 'spine'],
  shR: ['shR', 'spine', 'elR'],
  elR: ['elR', 'shR', 'hand'],
  hand: ['hand', 'elR'],
  shL: ['shL', 'spine', 'elL'],
  elL: ['elL', 'shL', 'handL'],
  handL: ['handL', 'elL'],
  thR: ['thR', 'hips', 'knR'],
  knR: ['knR', 'thR'],
  thL: ['thL', 'hips', 'knL'],
  knL: ['knL', 'thL'],
};

const ADJ = ADJ_SRC;
const ADJ_I: number[][] = BONES.map((b) => ADJ_SRC[b].map((x) => BONES.indexOf(x)));

// Clothing regions (resolved to colours per member).
const R = { Skin: 0, Shirt: 1, Trim: 2, Lower: 3, Sock: 4, Shoe: 5, Sole: 6, Wrist: 7 } as const;
type R = (typeof R)[keyof typeof R];

type V3 = [number, number, number];
interface Prim {
  kind: 'cap' | 'ell';
  a: V3;
  b: V3;
  r0: number;
  r1: number;
  /** Ellipsoid radii (kind 'ell'). */
  rad?: V3;
  /** z squash for torso parts (cross-section ellipse). */
  sz?: number;
  group: number;
  region: (t: number, p: V3) => R;
}

const smin = (a: number, b: number, k: number) => {
  if (a === Infinity) return b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

function capT(p: V3, a: V3, b: V3): number {
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const pax = p[0] - a[0];
  const pay = p[1] - a[1];
  const paz = p[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  return l2 > 0 ? Math.max(0, Math.min(1, (pax * bax + pay * bay + paz * baz) / l2)) : 0;
}

function primDist(pr: Prim, p: V3): number {
  return primDistXYZ(pr, p[0], p[1], p[2]);
}

function primDistXYZ(pr: Prim, px: number, py: number, pz: number): number {
  const a = pr.a;
  if (pr.kind === 'ell') {
    const r = pr.rad!;
    const x = (px - a[0]) / r[0];
    const y = (py - a[1]) / r[1];
    const z = (pz - a[2]) / r[2];
    return (Math.sqrt(x * x + y * y + z * z) - 1) * Math.min(r[0], r[1], r[2]);
  }
  const sz = pr.sz ?? 1;
  const qz = sz === 1 ? pz : a[2] + (pz - a[2]) / sz;
  const b = pr.b;
  const bax = b[0] - a[0];
  const bay = b[1] - a[1];
  const baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  let t = l2 > 0 ? ((px - a[0]) * bax + (py - a[1]) * bay + (qz - a[2]) * baz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + bax * t);
  const dy = py - (a[1] + bay * t);
  const dz = qz - (a[2] + baz * t);
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) - (pr.r0 + (pr.r1 - pr.r0) * t);
  return sz < 1 ? d * sz : d;
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

interface BodyGeo {
  geo: THREE.BufferGeometry;
  regions: Uint8Array;
}
const cache = new Map<string, BodyGeo>();

/** Bind pose: arms 43° out, legs slightly apart (keeps limbs separate while sculpting). */
const ARM_OUT = 0.75;
const LEG_OUT = 0.09;

function bindPose(j: BodyJoints, on: boolean): void {
  for (const k of BONES) j[k].rotation.set(0, 0, 0);
  if (on) {
    j.shR.rotation.z = ARM_OUT;
    j.shL.rotation.z = -ARM_OUT;
    j.thR.rotation.z = LEG_OUT;
    j.thL.rotation.z = -LEG_OUT;
  }
}

function sculpt(look: BodyLook, P: Record<string, V3>): BodyGeo {
  // Polo and tee share a cut; builds are quantised so members and staff reuse geometry.
  const cut = look.top === 'tee' ? 'polo' : look.top;
  const key = `${cut}|${look.bottom}|${(Math.round(look.build * 4) / 4).toFixed(2)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = Math.round(look.build * 4) / 4;
  const sleeves = look.top === 'polo' || look.top === 'tee' || look.top === 'crop';
  const longSleeves = look.top === 'cardigan';
  const prims: Prim[] = [];
  const torsoRegion = (_t: number, p: V3): R => {
    if (look.top === 'crop' && p[1] > 0.99 && p[1] < 1.07) return R.Skin;
    if (p[1] < 0.95) return R.Lower;
    return R.Shirt;
  };
  // ---- torso (group 0)
  prims.push({ kind: 'ell', a: [0, 0.86, 0.01], b: [0, 0, 0], r0: 0, r1: 0, rad: [0.152 + b * 0.012, 0.125, 0.112], group: 0, region: () => R.Lower });
  prims.push({ kind: 'cap', a: [0, 0.93, 0], b: [0, 1.05, 0], r0: 0.128 + b * 0.01, r1: 0.132 + b * 0.012, sz: 0.78, group: 0, region: torsoRegion });
  prims.push({ kind: 'ell', a: [0, 1.17, -0.004], b: [0, 0, 0], r0: 0, r1: 0, rad: [0.168 + b * 0.022, 0.15, 0.118 + b * 0.008], group: 0, region: torsoRegion });
  prims.push({ kind: 'cap', a: [-0.145, 1.275, 0.01], b: [0.145, 1.275, 0.01], r0: 0.068, r1: 0.068, sz: 0.85, group: 0, region: () => (look.top === 'tank' ? R.Skin : R.Shirt) });
  prims.push({ kind: 'cap', a: [0, 1.3, 0.012], b: [0, 1.5, 0.018], r0: 0.056, r1: 0.05, group: 0, region: (_t, p) => (p[1] < 1.33 && look.top !== 'tank' && look.top !== 'crop' ? R.Trim : R.Skin) });
  // ---- arms (groups 1, 2)
  for (const [s, g] of [
    ['R', 1],
    ['L', 2],
  ] as const) {
    const S = P[`sh${s}`];
    const E = P[`el${s}`];
    const W = P[`wr${s}`];
    const dir = norm([W[0] - E[0], W[1] - E[1], W[2] - E[2]]);
    const wristBand = s === 'R' && look.wristband !== undefined;
    prims.push({ kind: 'cap', a: S, b: E, r0: 0.05 + b * 0.008, r1: 0.041, group: g, region: () => (longSleeves ? R.Shirt : R.Skin) });
    prims.push({ kind: 'cap', a: E, b: W, r0: 0.041, r1: 0.031, group: g, region: (t) => (longSleeves ? (t > 0.8 ? R.Trim : R.Shirt) : wristBand && t > 0.72 ? R.Wrist : R.Skin) });
    // Hand: palm + fingers block + thumb.
    prims.push({ kind: 'cap', a: add(W, dir, 0.03), b: add(W, dir, 0.085), r0: 0.036, r1: 0.031, sz: 1, group: g, region: () => R.Skin });
    prims.push({ kind: 'cap', a: add(add(W, dir, 0.035), [0, 0, -0.03]), b: add(add(W, dir, 0.06), [0, 0, -0.045]), r0: 0.015, r1: 0.013, group: g, region: () => R.Skin });
    if (sleeves) prims.push({ kind: 'cap', a: lerp3(S, E, -0.08), b: lerp3(S, E, 0.48), r0: 0.07, r1: 0.062, group: g, region: () => R.Shirt });
    if (longSleeves) prims.push({ kind: 'cap', a: lerp3(S, E, -0.05), b: E, r0: 0.064, r1: 0.054, group: g, region: () => R.Shirt });
  }
  // ---- legs (groups 3, 4)
  for (const [s, g] of [
    ['R', 3],
    ['L', 4],
  ] as const) {
    const H = P[`hip${s}`];
    const K = P[`kn${s}`];
    const A = P[`an${s}`];
    const trousers = look.bottom === 'trousers';
    prims.push({ kind: 'cap', a: H, b: K, r0: 0.079 + b * 0.01, r1: 0.054, group: g, region: () => (trousers ? R.Lower : R.Skin) });
    prims.push({ kind: 'cap', a: K, b: A, r0: 0.053, r1: 0.036, group: g, region: (t) => (trousers ? R.Lower : t > 0.86 ? (t > 0.9 && t < 0.94 ? R.Trim : R.Sock) : R.Skin) });
    // Calf bulge.
    prims.push({ kind: 'ell', a: add(lerp3(K, A, 0.3), [0, 0, 0.018]), b: [0, 0, 0], r0: 0, r1: 0, rad: [0.05, 0.09, 0.05], group: g, region: () => (trousers ? R.Lower : R.Skin) });
    if (look.bottom === 'shorts') prims.push({ kind: 'cap', a: lerp3(H, K, -0.15), b: lerp3(H, K, 0.47), r0: 0.094, r1: 0.088, group: g, region: () => R.Lower });
    if (trousers) prims.push({ kind: 'cap', a: H, b: lerp3(K, A, 0.92), r0: 0.086, r1: 0.06, group: g, region: () => R.Lower });
    // Sneaker: toe box + heel + sole.
    prims.push({ kind: 'ell', a: add(A, [0, -0.07, -0.05]), b: [0, 0, 0], r0: 0, r1: 0, rad: [0.058, 0.052, 0.118], group: g, region: (_t, p) => (p[1] < 0.028 ? R.Sole : p[1] < 0.042 && Math.abs(p[0] - A[0]) > 0.045 ? R.Trim : R.Shoe) });
    prims.push({ kind: 'cap', a: add(A, [0, -0.1, 0.03]), b: add(A, [0, -0.1, -0.14]), r0: 0.03, r1: 0.032, sz: 1, group: g, region: () => R.Sole });
  }

  const groups: Prim[][] = [[], [], [], [], []];
  for (const pr of prims) groups[pr.group].push(pr);
  // Group bounding boxes (for cheap lower-bound distances far from a limb).
  const boxes = groups.map((list) => {
    const lo: V3 = [Infinity, Infinity, Infinity];
    const hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const pr of list) {
      const r = pr.kind === 'ell' ? Math.max(...pr.rad!) : Math.max(pr.r0, pr.r1) / Math.min(1, pr.sz ?? 1);
      for (const q of pr.kind === 'ell' ? [pr.a] : [pr.a, pr.b])
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], q[k] - r);
          hi[k] = Math.max(hi[k], q[k] + r);
        }
    }
    return { lo, hi };
  });
  const gd = new Float64Array(5);
  const field = (p: V3): number => {
    const px = p[0];
    const py = p[1];
    const pz = p[2];
    for (let gi = 0; gi < 5; gi++) {
      const bx = boxes[gi];
      const ox = Math.max(bx.lo[0] - px, 0, px - bx.hi[0]);
      const oy = Math.max(bx.lo[1] - py, 0, py - bx.hi[1]);
      const oz = Math.max(bx.lo[2] - pz, 0, pz - bx.hi[2]);
      const out = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (out > 0.07) {
        gd[gi] = out;
        continue;
      }
      const list = groups[gi];
      const k = gi === 0 ? 0.05 : 0.022;
      let d = Infinity;
      for (let i = 0; i < list.length; i++) d = smin(d, primDistXYZ(list[i], px, py, pz), k);
      gd[gi] = d;
    }
    let d = smin(gd[0], gd[1], 0.03);
    d = smin(d, gd[2], 0.03);
    return smin(d, Math.min(gd[3], gd[4]), 0.035);
  };

  // ---- surface nets
  const h = 0.0145;
  const min: V3 = [-0.68, -0.02, -0.26];
  const max: V3 = [0.68, 1.53, 0.2];
  const nx = Math.ceil((max[0] - min[0]) / h) + 1;
  const ny = Math.ceil((max[1] - min[1]) / h) + 1;
  const nz = Math.ceil((max[2] - min[2]) / h) + 1;
  const F = new Float32Array(nx * ny * nz);
  const idx = (x: number, y: number, z: number) => x + nx * (y + ny * z);
  const p: V3 = [0, 0, 0];
  // Coarse pass (every C cells): blocks whose corners are all far from the surface are filled without
  // evaluating the field at every fine point (the field is distance-like, so it cannot cross zero there).
  const C = 4;
  const cx = Math.ceil((nx - 1) / C) + 1;
  const cy = Math.ceil((ny - 1) / C) + 1;
  const cz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let z = 0; z < cz; z++)
    for (let y = 0; y < cy; y++)
      for (let x = 0; x < cx; x++) {
        p[0] = min[0] + x * C * h;
        p[1] = min[1] + y * C * h;
        p[2] = min[2] + z * C * h;
        coarse[x + cx * (y + cy * z)] = field(p);
      }
  const margin = C * h * 1.8;
  for (let bz = 0; bz < cz - 1; bz++)
    for (let by = 0; by < cy - 1; by++)
      for (let bx = 0; bx < cx - 1; bx++) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let c = 0; c < 8; c++) {
          const v = coarse[bx + (c & 1) + cx * (by + ((c >> 1) & 1) + cy * (bz + ((c >> 2) & 1)))];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        const far = lo > margin ? lo : hi < -margin ? hi : 0;
        for (let z = bz * C; z <= Math.min(nz - 1, bz * C + C); z++)
          for (let y = by * C; y <= Math.min(ny - 1, by * C + C); y++)
            for (let x = bx * C; x <= Math.min(nx - 1, bx * C + C); x++) {
              const i = idx(x, y, z);
              if (far !== 0) {
                F[i] = far;
                continue;
              }
              p[0] = min[0] + x * h;
              p[1] = min[1] + y * h;
              p[2] = min[2] + z * h;
              F[i] = field(p);
            }
      }
  const cellIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cid = (x: number, y: number, z: number) => x + (nx - 1) * (y + (ny - 1) * z);
  const verts: number[] = [];
  const corners = [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [1, 1, 0],
    [0, 0, 1],
    [1, 0, 1],
    [0, 1, 1],
    [1, 1, 1],
  ];
  const edges = [
    [0, 1],
    [2, 3],
    [4, 5],
    [6, 7],
    [0, 2],
    [1, 3],
    [4, 6],
    [5, 7],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = F[idx(x + corners[c][0], y + corners[c][1], z + corners[c][2])];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [e0, e1] of edges) {
          const a = cv[e0];
          const bb = cv[e1];
          if (a < 0 === bb < 0) continue;
          const t = a / (a - bb);
          sx += corners[e0][0] + (corners[e1][0] - corners[e0][0]) * t;
          sy += corners[e0][1] + (corners[e1][1] - corners[e0][1]) * t;
          sz += corners[e0][2] + (corners[e1][2] - corners[e0][2]) * t;
          n++;
        }
        cellIdx[cid(x, y, z)] = verts.length / 3;
        verts.push(min[0] + (x + sx / n) * h, min[1] + (y + sy / n) * h, min[2] + (z + sz / n) * h);
      }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  for (let z = 1; z < nz - 1; z++)
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const v0 = F[idx(x, y, z)] < 0;
        // x-edge: cells sharing it vary in y, z.
        if (x < nx - 1 && v0 !== F[idx(x + 1, y, z)] < 0) quad(cellIdx[cid(x, y, z)], cellIdx[cid(x, y - 1, z)], cellIdx[cid(x, y - 1, z - 1)], cellIdx[cid(x, y, z - 1)], v0);
        if (y < ny - 1 && v0 !== F[idx(x, y + 1, z)] < 0) quad(cellIdx[cid(x, y, z)], cellIdx[cid(x, y, z - 1)], cellIdx[cid(x - 1, y, z - 1)], cellIdx[cid(x - 1, y, z)], v0);
        if (z < nz - 1 && v0 !== F[idx(x, y, z + 1)] < 0) quad(cellIdx[cid(x, y, z)], cellIdx[cid(x - 1, y, z)], cellIdx[cid(x - 1, y - 1, z)], cellIdx[cid(x, y - 1, z)], v0);
      }

  // Smooth the vertex positions slightly (one Laplacian pass), then normals from the field gradient.
  const vc = verts.length / 3;
  const pos = new Float32Array(verts);
  {
    const acc = new Float32Array(vc * 3);
    const cnt = new Uint16Array(vc);
    for (let i = 0; i < index.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        const a = index[i + k];
        const c = index[i + ((k + 1) % 3)];
        acc[a * 3] += verts[c * 3];
        acc[a * 3 + 1] += verts[c * 3 + 1];
        acc[a * 3 + 2] += verts[c * 3 + 2];
        cnt[a]++;
      }
    }
    for (let v = 0; v < vc; v++)
      if (cnt[v]) for (let k = 0; k < 3; k++) pos[v * 3 + k] = verts[v * 3 + k] * 0.5 + (acc[v * 3 + k] / cnt[v]) * 0.5;
  }
  const nor = new Float32Array(vc * 3);
  const regions = new Uint8Array(vc);
  const e = 0.004;
  for (let v = 0; v < vc; v++) {
    const q: V3 = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    const gx = field([q[0] + e, q[1], q[2]]) - field([q[0] - e, q[1], q[2]]);
    const gy = field([q[0], q[1] + e, q[2]]) - field([q[0], q[1] - e, q[2]]);
    const gz = field([q[0], q[1], q[2] + e]) - field([q[0], q[1], q[2] - e]);
    const l = Math.hypot(gx, gy, gz) || 1;
    nor[v * 3] = gx / l;
    nor[v * 3 + 1] = gy / l;
    nor[v * 3 + 2] = gz / l;
    // Region: the nearest primitive's clothing zone (clothing flares sit slightly outside the skin).
    let best = Infinity;
    let reg: R = R.Skin;
    for (const pr of prims) {
      const d = primDist(pr, q);
      if (d < best - 0.002) {
        best = d;
        reg = pr.region(pr.kind === 'cap' ? capT(pr.sz && pr.sz !== 1 ? [q[0], q[1], pr.a[2] + (q[2] - pr.a[2]) / pr.sz] : q, pr.a, pr.b) : 0, q);
      }
    }
    regions[v] = reg;
  }

  {
    const nbr: number[][] = Array.from({ length: vc }, () => []);
    for (let i = 0; i < index.length; i += 3)
      for (let k = 0; k < 3; k++) {
        const a = index[i + k];
        const c = index[i + ((k + 1) % 3)];
        nbr[a].push(c);
        nbr[c].push(a);
      }
    const counts = new Uint16Array(8);
    for (let pass = 0; pass < 3; pass++) {
      const next = regions.slice();
      for (let v = 0; v < vc; v++) {
        counts.fill(0);
        counts[regions[v]] += 2;
        for (const u of nbr[v]) counts[regions[u]]++;
        let bestR = regions[v];
        for (let r = 0; r < 8; r++) if (counts[r] > counts[bestR]) bestR = r;
        next[v] = bestR;
      }
      regions.set(next);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(index);
  const out = { geo, regions };
  cache.set(key, out);
  return out;
}

/** Bone segments in the bind pose, for skin weights. */
function boneSegments(P: Record<string, V3>): Record<BoneName, [V3, V3]> {
  return {
    hips: [[0, 0.78, 0.01], [0, 0.94, 0.01]],
    spine: [[0, 0.98, 0], [0, 1.3, 0.01]],
    head: [[0, 1.45, 0.02], [0, 1.62, 0.02]],
    shR: [P.shR, P.elR],
    elR: [P.elR, P.wrR],
    hand: [add(P.wrR, P.dirR, 0.03), add(P.wrR, P.dirR, 0.09)],
    shL: [P.shL, P.elL],
    elL: [P.elL, P.wrL],
    handL: [add(P.wrL, P.dirL, 0.03), add(P.wrL, P.dirL, 0.09)],
    thR: [P.hipR, P.knR],
    knR: [P.knR, add(P.anR, [0, -0.06, -0.12])],
    thL: [P.hipL, P.knL],
    knL: [P.knL, add(P.anL, [0, -0.06, -0.12])],
  };
}

function segDist(p: V3, s: [V3, V3]): number {
  const a = s[0];
  const b = s[1];
  const t = capT(p, a, b);
  const dx = p[0] - (a[0] + (b[0] - a[0]) * t);
  const dy = p[1] - (a[1] + (b[1] - a[1]) * t);
  const dz = p[2] - (a[2] + (b[2] - a[2]) * t);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Build the skinned body for a member. `root` must be the rig's root (at the origin, unrotated) so the
 * joints' current world matrices are the bind pose.
 */
export function createBody(look: BodyLook, root: THREE.Object3D, j: BodyJoints): THREE.SkinnedMesh {
  bindPose(j, true);
  root.updateMatrixWorld(true);
  const wp = (o: THREE.Object3D, local?: THREE.Vector3): V3 => {
    const v = (local ?? new THREE.Vector3()).clone().applyMatrix4(o.matrixWorld);
    return [v.x, v.y, v.z];
  };
  const P: Record<string, V3> = {
    shR: wp(j.shR),
    elR: wp(j.elR),
    wrR: wp(j.hand, new THREE.Vector3(0, 0.04, 0)),
    shL: wp(j.shL),
    elL: wp(j.elL),
    wrL: wp(j.handL, new THREE.Vector3(0, 0.04, 0)),
    hipR: wp(j.thR),
    knR: wp(j.knR),
    anR: wp(j.knR, new THREE.Vector3(0, -0.325, 0)),
    hipL: wp(j.thL),
    knL: wp(j.knL),
    anL: wp(j.knL, new THREE.Vector3(0, -0.325, 0)),
  };
  P.dirR = norm([P.wrR[0] - P.elR[0], P.wrR[1] - P.elR[1], P.wrR[2] - P.elR[2]]);
  P.dirL = norm([P.wrL[0] - P.elL[0], P.wrL[1] - P.elL[1], P.wrL[2] - P.elL[2]]);

  const { geo: base, regions } = sculpt(look, P);
  const geo = base.clone();
  const n = geo.attributes.position.count;
  const pos = geo.attributes.position.array as Float32Array;

  // Colours.
  const col = new Float32Array(n * 3);
  const palette: Record<number, THREE.Color> = {
    [R.Skin]: new THREE.Color(look.skin),
    [R.Shirt]: new THREE.Color(look.shirt),
    [R.Trim]: new THREE.Color(look.trim),
    [R.Lower]: new THREE.Color(look.lower),
    [R.Sock]: new THREE.Color(look.sock ?? 0xffffff),
    [R.Shoe]: new THREE.Color(look.shoes),
    [R.Sole]: new THREE.Color(look.sole ?? 0xf6f2ea),
    [R.Wrist]: new THREE.Color(look.wristband ?? look.trim),
  };
  for (let v = 0; v < n; v++) {
    const c = palette[regions[v]];
    col[v * 3] = c.r;
    col[v * 3 + 1] = c.g;
    col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  // Skin weights: nearest bone decides the neighbourhood; neighbours blend by inverse distance.
  const segs = boneSegments(P);
  const segList = BONES.map((b) => segs[b]);
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const q: V3 = [0, 0, 0];
  for (let v = 0; v < n; v++) {
    q[0] = pos[v * 3];
    q[1] = pos[v * 3 + 1];
    q[2] = pos[v * 3 + 2];
    let primary: BoneName = 'spine';
    let best = Infinity;
    for (const bn of BONES) {
      const d = segDist(q, segs[bn]);
      if (d < best) {
        best = d;
        primary = bn;
      }
    }
    const adj = ADJ_I[BI[primary]];
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      if (k < adj.length) {
        const d = segDist(q, segList[adj[k]]) + 0.012;
        const w = 1 / (d * d * d * d * d);
        si[v * 4 + k] = adj[k];
        sw[v * 4 + k] = w;
        sum += w;
      } else {
        si[v * 4 + k] = 0;
        sw[v * 4 + k] = 0;
      }
    }
    for (let k = 0; k < 4; k++) sw[v * 4 + k] /= sum;
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  root.add(mesh);
  mesh.updateMatrixWorld(true);
  const bones = BONES.map((b) => j[b]) as unknown as THREE.Bone[];
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton, new THREE.Matrix4());
  bindPose(j, false);
  return mesh;
}
