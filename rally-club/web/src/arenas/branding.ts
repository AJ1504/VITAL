// Branding surfaces: everything that carries the Vital wordmark or crest. Placements come from the arena
// config (surface, colour, scale, rotation, offset, glow, visibility); the supplied logo asset is used
// everywhere (scene/kit.ts drawLogo), never a substitute font.
import * as THREE from 'three';
import { drawCrest, drawLaurel, drawLogo, liveTex, spacedText } from '../scene/kit.ts';
import type { ArenaConfig, LogoPlacement, LogoSurface } from './config.ts';

export function placement(cfg: ArenaConfig, surface: LogoSurface): LogoPlacement | null {
  const p = cfg.logos.find((l) => l.surface === surface);
  return p && p.visible !== false ? p : null;
}

const glowMat = (tex: THREE.Texture, color: string, glow: boolean, glowK: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    roughness: 0.6,
    emissive: glow ? new THREE.Color(color) : new THREE.Color(0x000000),
    emissiveMap: glow ? tex : null,
    emissiveIntensity: glow ? 1.2 * glowK : 0,
    ...opts,
  });

/**
 * Court + surround decal: one transparent canvas over the surround carrying the baseline scripts,
 * lettering and corner monograms (whichever the config enables).
 */
export function surroundDecal(cfg: ArenaConfig, w: number, h: number, court: { width: number; length: number }, gloss: boolean): THREE.Mesh | null {
  const base = placement(cfg, 'behind-baseline');
  const letters = placement(cfg, 'surround-lettering');
  const crests = placement(cfg, 'corner-monograms');
  if (!base && !letters && !crests) return null;
  const PX = 64;
  const tex = liveTex(Math.round(w * PX), Math.round(h * PX), (g, cw, ch) => {
    const m = (v: number) => v * PX;
    const cx = cw / 2;
    const cy = ch / 2;
    const end = court.length / 2;
    if (base) {
      for (const s of [1, -1]) {
        g.save();
        g.translate(cx + m(base.offset?.[0] ?? 0), cy + s * m(end + 1.55 + (base.offset?.[1] ?? 0)));
        if (s < 0) g.rotate(Math.PI);
        g.rotate(base.rotation ?? 0);
        drawLogo(g, 0, 0, m(3.9 * (base.scale ?? 1)), base.color);
        g.strokeStyle = base.color;
        g.lineWidth = m(0.035);
        g.beginPath();
        g.moveTo(-m(5.4), m(0.32));
        g.lineTo(-m(2.6), m(0.32));
        g.moveTo(m(2.6), m(0.32));
        g.lineTo(m(5.4), m(0.32));
        g.stroke();
        g.restore();
      }
    }
    if (letters) {
      g.fillStyle = letters.color;
      g.strokeStyle = letters.color;
      g.font = `600 ${m(0.32 * (letters.scale ?? 1))}px "Josefin Sans", "Nunito", sans-serif`;
      for (const s of [1, -1]) {
        g.save();
        g.translate(cx, cy + s * m(end + (base ? 3.0 : 1.3)));
        if (s < 0) g.rotate(Math.PI);
        spacedText(g, 'VITAL  PICKLEBALL  CLUB', 0, 0, m(0.15));
        g.lineWidth = m(0.022);
        g.beginPath();
        g.moveTo(-m(5.2), 0);
        g.lineTo(-m(3.3), 0);
        g.moveTo(m(3.3), 0);
        g.lineTo(m(5.2), 0);
        g.stroke();
        g.restore();
      }
    }
    if (crests) {
      const k = crests.scale ?? 1;
      for (const [sx, sz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as [number, number][]) {
        g.save();
        g.translate(cx + sx * m(court.width / 2 - 1.1), cy + sz * m(court.length / 4 + 0.6));
        g.globalAlpha = 0.9;
        drawCrest(g, 0, 0, m(1.05 * k), crests.color);
        g.restore();
      }
    }
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: gloss ? 0.25 : 0.8, polygonOffset: true, polygonOffsetFactor: -2 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.142;
  mesh.receiveShadow = true;
  return mesh;
}

/** The big script across the middle of the court. */
export function courtCenterLogo(cfg: ArenaConfig): THREE.Mesh | null {
  const p = placement(cfg, 'court-center');
  if (!p) return null;
  const tex = liveTex(1024, 420, (g, w, h) => {
    g.globalAlpha = 0.93;
    drawLogo(g, w / 2, h / 2, w * 0.96, p.color);
  });
  const k = p.scale ?? 1;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0 * k, 1.64 * k), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3 }));
  mesh.rotation.set(-Math.PI / 2, 0, Math.PI / 2 + (p.rotation ?? 0));
  mesh.position.set(p.offset?.[0] ?? 0, 0.143, p.offset?.[1] ?? 0);
  mesh.receiveShadow = true;
  return mesh;
}

/** Padded net band (top tape) printed with the logo. */
export function netPaddingTexture(cfg: ArenaConfig, bg: string): THREE.Texture {
  const p = placement(cfg, 'net-padding');
  return liveTex(1024, 64, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    if (p) for (const x of [0.25, 0.75]) drawLogo(g, w * x, h / 2, h * 2.1 * (p.scale ?? 1), p.color);
  });
}

/** A logo panel (flat), e.g. wall signage, desk front, entrance sign. */
export function logoPanel(p: LogoPlacement, w: number, h: number, bg: string | null, glowK: number, crest = false): THREE.Mesh {
  const tw = 512;
  const th = Math.max(64, Math.round((512 * h) / w));
  const tex = liveTex(tw, th, (g) => {
    if (bg) {
      g.fillStyle = bg;
      g.fillRect(0, 0, tw, th);
    }
    if (crest) drawCrest(g, tw / 2, th / 2, Math.min(tw, th) * 0.8, p.color);
    else drawLogo(g, tw / 2, th / 2, Math.min(tw * 0.86, th * 2.2) * (p.scale ?? 1), p.color);
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat(tex, p.color, !!p.glow, glowK, { transparent: !bg, side: THREE.DoubleSide }));
  return mesh;
}

/** Vertical banner: rotated script over a laurel. */
export function bannerTexture(p: LogoPlacement, bg: string): THREE.Texture {
  return liveTex(256, 640, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h * 0.42);
    g.rotate(-Math.PI / 2);
    drawLogo(g, 0, 0, h * 0.62, p.color);
    g.restore();
    drawLaurel(g, w / 2, h * 0.84, w * 0.45, p.color);
  });
}

/** Flag cloth: crest on the accent colour. */
export function flagTexture(p: LogoPlacement, bg: string): THREE.Texture {
  return liveTex(256, 160, (g, w, h) => {
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    drawLogo(g, w / 2, h / 2, w * 0.78, p.color);
  });
}

/** In-world scoreboard: crest header + two score rows, redrawn on every score change. */
export class Scoreboard {
  readonly mesh: THREE.Group;
  private canvas: HTMLCanvasElement;
  private tex: THREE.CanvasTexture;
  private color: string;
  private accent: string;
  private last = '';
  constructor(p: LogoPlacement, accent: string, glowK: number) {
    this.color = p.color;
    this.accent = accent;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 288;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.95, 0.16), new THREE.MeshStandardMaterial({ color: 0xfbf8f3, roughness: 0.5 }));
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(3.05, 1.72),
      new THREE.MeshStandardMaterial({ map: this.tex, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.55 + 0.25 * glowK, roughness: 0.4 }),
    );
    screen.position.z = 0.085;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.2, 10), new THREE.MeshStandardMaterial({ color: 0xfbf8f3, roughness: 0.5 }));
    post.position.y = -2.4;
    frame.castShadow = post.castShadow = true;
    this.mesh.add(frame, screen, post);
    this.set(['Home', 'Away'], [0, 0], 0, '0-0-2');
  }
  set(names: [string, string], score: [number, number], server: number, call: string): void {
    const key = `${names}|${score}|${server}|${call}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.canvas.getContext('2d')!;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.fillStyle = '#1f2233';
    g.fillRect(0, 0, w, h);
    g.fillStyle = this.accent;
    g.fillRect(0, 0, w, 64);
    drawLogo(g, w / 2, 33, 150, '#ffffff');
    g.font = '700 46px Fredoka, Nunito, sans-serif';
    g.textBaseline = 'middle';
    names.forEach((n, i) => {
      const y = 112 + i * 70;
      g.fillStyle = server === i ? '#e5f04a' : 'rgba(255,255,255,0.15)';
      g.beginPath();
      g.arc(34, y, 9, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffffff';
      g.textAlign = 'left';
      g.fillText(n.slice(0, 12), 58, y);
      g.textAlign = 'right';
      g.fillStyle = this.color === '#ffffff' ? '#ffd6ec' : '#ffffff';
      g.fillText(String(score[i]), w - 30, y);
    });
    g.font = '600 24px "Josefin Sans", Nunito, sans-serif';
    g.textAlign = 'center';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(`SCORE  ${call}`, w / 2, h - 22);
    this.tex.needsUpdate = true;
  }
}
