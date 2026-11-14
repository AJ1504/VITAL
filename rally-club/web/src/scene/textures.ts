// Procedurally drawn canvas textures — no third-party image assets (see docs/ASSET_LICENSING.md).
import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeatX = 1, repeatY = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  return t;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Terracotta deck tiles with grout and gentle per-tile variation. */
export function tileTexture(base: number, grout: number, tiles = 8, repeat = 6): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const step = 512 / tiles;
  // Canvas pixels are sRGB: use the raw hex channels (THREE.Color stores linear values).
  const r0 = (base >> 16) & 255;
  const g0 = (base >> 8) & 255;
  const b0 = base & 255;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const k = 0.92 + ((x * 7 + y * 13) % 9) / 60;
      g.fillStyle = `rgb(${Math.round(r0 * k)},${Math.round(g0 * k)},${Math.round(b0 * k)})`;
      g.fillRect(x * step, y * step, step, step);
    }
  }
  g.strokeStyle = hex(grout);
  g.lineWidth = 4;
  for (let i = 0; i <= tiles; i++) {
    g.beginPath();
    g.moveTo(i * step, 0);
    g.lineTo(i * step, 512);
    g.moveTo(0, i * step);
    g.lineTo(512, i * step);
    g.stroke();
  }
  return tex(c, repeat, repeat);
}

/** Subtle sport-surface grain for the court. */
export function courtGrainTexture(base: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = hex(base);
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3500; i++) {
    const a = Math.random() * 0.06;
    g.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return tex(c, 4, 8);
}

/** Awning / parasol stripes. */
export function stripeTexture(a: number, b: number, stripes = 8, repeat = 1): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  const w = 256 / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle = hex(i % 2 === 0 ? a : b);
    g.fillRect(i * w, 0, w, 64);
  }
  return tex(c, repeat, 1);
}

/** Net mesh with alpha. */
export function netTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(30,30,30,0.85)';
  g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  return tex(c, 30, 4);
}

/** Building facade with warm lit windows for the skyline. */
export function windowsTexture(wall: number, lit: number, cols: number, rows: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 512);
  g.fillStyle = hex(wall);
  g.fillRect(0, 0, 256, 512);
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const on = Math.random() < 0.38;
      g.fillStyle = on ? hex(lit) : 'rgba(0,0,0,0.18)';
      g.globalAlpha = on ? 0.6 + Math.random() * 0.4 : 1;
      g.fillRect(x * cw + cw * 0.25, y * rh + rh * 0.25, cw * 0.5, rh * 0.5);
    }
  }
  g.globalAlpha = 1;
  return tex(c);
}

/** Soft radial blob used for contact shadows and glows. */
export function radialTexture(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)'): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Club crest / signage text panel. */
export function signTexture(text: string, sub: string, bg: number, fg: number): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = hex(bg);
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = hex(fg);
  g.textAlign = 'center';
  g.font = 'italic 700 112px Georgia, "Times New Roman", serif';
  g.fillText(text, 512, 140);
  g.font = '600 34px "Helvetica Neue", Arial, sans-serif';
  g.letterSpacing = '10px';
  g.fillText(sub, 512, 205);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
