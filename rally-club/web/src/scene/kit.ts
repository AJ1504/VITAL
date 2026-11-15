// Shared building kit for the arenas: merged-geometry batching, canvas textures and the Vital brand marks.
import * as THREE from 'three';
import vitalWhiteUrl from '../brand/vital-white.png';

export const std = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });

export const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

export const M4 = (x: number, y: number, z: number, ry = 0, s: number | [number, number, number] = 1, rx = 0, rz = 0) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s),
  );

function toNonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (!n.attributes.normal) n.computeVertexNormals();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
  return n;
}

export function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = geos.map(toNonIndexed);
  const total = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Collects geometry per material and builds one mesh per material (keeps draw calls low). */
export class Batches {
  private map = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private shadows = new Map<THREE.Material, boolean>();
  add(material: THREE.Material, geo: THREE.BufferGeometry, m?: THREE.Matrix4, castShadow = true): void {
    const g = geo.clone();
    if (m) g.applyMatrix4(m);
    const list = this.map.get(material) ?? [];
    list.push(g);
    this.map.set(material, list);
    if (castShadow) this.shadows.set(material, true);
  }
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, cast = true): void {
    this.add(material, new THREE.BoxGeometry(w, h, d), M4(x, y, z, ry), cast);
  }
  build(parent: THREE.Object3D): void {
    for (const [mat, list] of this.map) {
      const mesh = new THREE.Mesh(merge(list), mat);
      mesh.castShadow = !!this.shadows.get(mat);
      mesh.receiveShadow = true;
      parent.add(mesh);
    }
    this.map.clear();
  }
}

// ------------------------------------------------------------------ brand

let logoImg: HTMLImageElement | null = null;
const logoWaiters: (() => void)[] = [];
if (typeof Image !== 'undefined') {
  const img = new Image();
  img.onload = () => {
    logoImg = img;
    logoWaiters.splice(0).forEach((f) => f());
  };
  img.src = vitalWhiteUrl;
}
const fontsReady: Promise<unknown> = typeof document !== 'undefined' && document.fonts ? document.fonts.ready : Promise.resolve();

/** Draw the Vital script logo tinted `color`, centred at (cx, cy), `w` wide. No-op until the image loads. */
export function drawLogo(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, color: string, part: 'full' | 'v' = 'full'): void {
  if (!logoImg) return;
  const src = part === 'v' ? { x: 0, w: logoImg.width * 0.42 } : { x: 0, w: logoImg.width };
  const h = (w * logoImg.height) / src.w;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  const t = c.getContext('2d')!;
  t.drawImage(logoImg, src.x, 0, src.w, logoImg.height, 0, 0, c.width, c.height);
  t.globalCompositeOperation = 'source-in';
  t.fillStyle = color;
  t.fillRect(0, 0, c.width, c.height);
  g.drawImage(c, cx - w / 2, cy - h / 2);
}

/** Two laurel branches (the club crest), drawn into a canvas context centred at (cx, cy). */
export function drawLaurel(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  g.save();
  g.translate(cx, cy);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = size * 0.035;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.save();
    g.scale(s, 1);
    g.beginPath();
    g.moveTo(size * 0.08, size * 0.44);
    g.quadraticCurveTo(size * 0.5, size * 0.25, size * 0.42, -size * 0.36);
    g.stroke();
    for (let i = 0; i < 7; i++) {
      const t = i / 7;
      const px = size * (0.16 + 0.32 * Math.sin(t * 1.5));
      const py = size * (0.38 - 0.72 * t);
      g.save();
      g.translate(px, py);
      g.rotate(-0.95 + t * 0.55);
      g.beginPath();
      g.ellipse(size * 0.06, 0, size * 0.085, size * 0.032, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.restore();
  }
  g.restore();
}

/** Laurel wreath with the script V inside: the club crest. */
export function drawCrest(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  drawLaurel(g, cx, cy + size * 0.04, size, color);
  drawLogo(g, cx + size * 0.02, cy - size * 0.02, size * 0.42, color, 'v');
}

/** A canvas texture that redraws itself once the brand logo and web fonts have loaded. */
export function liveTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const paint = () => {
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
  };
  paint();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  const again = () => {
    paint();
    t.needsUpdate = true;
  };
  if (!logoImg) logoWaiters.push(again);
  void fontsReady.then(again);
  return t;
}

/** Letter-spaced capitals (canvas letterSpacing is not universal). */
export function spacedText(g: CanvasRenderingContext2D, text: string, cx: number, cy: number, spacing: number): void {
  const chars = [...text];
  const widths = chars.map((ch) => g.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - total / 2;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  chars.forEach((ch, i) => {
    g.fillText(ch, x, cy);
    x += widths[i] + spacing;
  });
}

// ------------------------------------------------------------------ rounded-rectangle paths (stands, rims)

export interface PathSample {
  x: number;
  z: number;
  /** Outward normal. */
  nx: number;
  nz: number;
}

/** Sample the perimeter of a rounded rectangle (half extents a × b, corner radius r) every `step` metres. */
export function roundedRectSamples(a: number, b: number, r: number, step: number): PathSample[] {
  const out: PathSample[] = [];
  const segs: ((t: number) => PathSample)[] = [];
  const lens: number[] = [];
  const line = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    segs.push((t) => ({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, nx, nz }));
    lens.push(Math.hypot(x1 - x0, z1 - z0));
  };
  const arc = (cx: number, cz: number, a0: number, a1: number) => {
    segs.push((t) => {
      const ang = a0 + (a1 - a0) * t;
      return { x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r, nx: Math.cos(ang), nz: Math.sin(ang) };
    });
    lens.push(Math.abs(a1 - a0) * r);
  };
  line(-(a - r), -b, a - r, -b, 0, -1);
  arc(a - r, -b + r, -Math.PI / 2, 0);
  line(a, -b + r, a, b - r, 1, 0);
  arc(a - r, b - r, 0, Math.PI / 2);
  line(a - r, b, -(a - r), b, 0, 1);
  arc(-(a - r), b - r, Math.PI / 2, Math.PI);
  line(-a, b - r, -a, -b + r, -1, 0);
  arc(-(a - r), -b + r, Math.PI, Math.PI * 1.5);
  const total = lens.reduce((s, l) => s + l, 0);
  const n = Math.max(4, Math.round(total / step));
  for (let i = 0; i < n; i++) {
    let d = ((i + 0.5) / n) * total;
    let k = 0;
    while (k < lens.length - 1 && d > lens[k]) d -= lens[k++];
    out.push(segs[k](lens[k] > 0 ? d / lens[k] : 0));
  }
  return out;
}

export function roundedRectShape(a: number, b: number, r: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-a + r, -b);
  s.lineTo(a - r, -b);
  s.absarc(a - r, -b + r, r, -Math.PI / 2, 0, false);
  s.lineTo(a, b - r);
  s.absarc(a - r, b - r, r, 0, Math.PI / 2, false);
  s.lineTo(-a + r, b);
  s.absarc(-a + r, b - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-a, -b + r);
  s.absarc(-a + r, -b + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}
