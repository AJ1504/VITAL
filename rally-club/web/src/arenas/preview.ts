// Arena selection previews: a crisp top-down plan of each arena drawn from its config (court, surround,
// seating bowl colours, DJ stage, logo), so the cards show the real layout without rendering six 3D
// scenes up front.
import { drawCrest, drawLogo } from '../scene/kit.ts';
import type { ArenaConfig } from './config.ts';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Draw the plan into a canvas (landscape: court long axis horizontal, DJ on the left). */
export function drawArenaPreview(canvas: HTMLCanvasElement, cfg: ArenaConfig): void {
  const g = canvas.getContext('2d')!;
  const W = canvas.width;
  const H = canvas.height;
  const P = cfg.palette;
  g.clearRect(0, 0, W, H);
  // Plaza.
  g.fillStyle = hex(P.paving);
  g.fillRect(0, 0, W, H);
  // Greenery border.
  g.fillStyle = cfg.planting.trees === 'palm' ? '#9cc77d' : '#a9c98e';
  for (let i = 0; i < 26; i++) {
    const t = i / 26;
    for (const y of [6, H - 6]) {
      g.beginPath();
      g.arc(t * W + 6, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  const cx = W / 2;
  const cy = H / 2;
  const s = Math.min(W / 30, H / 18); // px per metre (bowl ~30 × 18 m in plan)
  const circle = cfg.bowl.shape === 'circle';
  // Seating bowl rows (outer to inner).
  for (let k = cfg.bowl.rows; k >= 0; k--) {
    const d = 1.2 + k * 0.95;
    const bw = (10.6 + d + (circle ? 1.2 : 0)) * 2 * s;
    const bh = (6.4 + d) * 2 * s;
    roundRect(g, cx - bw / 2, cy - bh / 2, bw, bh, circle ? bh / 2 : (2.6 + d) * s);
    if (k === cfg.bowl.rows) g.fillStyle = hex(P.stone);
    else g.fillStyle = hex(P.seats[k % P.seats.length]);
    g.fill();
    if (cfg.bowl.illuminated && k < cfg.bowl.rows) {
      g.strokeStyle = hex(P.glow);
      g.lineWidth = 1;
      g.stroke();
    }
  }
  // Openings: DJ (left) and entrance (right, if no near rows).
  g.fillStyle = hex(P.paving);
  const gapH = 7.4 * s;
  g.fillRect(0, cy - gapH / 2, cx - (10.6 + 1.0) * s, gapH);
  if (cfg.bowl.nearRows === 0) g.fillRect(cx + 11.4 * s, cy - (6.4 + 6) * s, W, (6.4 + 6) * 2 * s);
  else g.fillRect(cx + 11.4 * s, cy - gapH / 2, W, gapH);
  // Surround + court.
  roundRect(g, cx - 10.6 * s, cy - 6.4 * s, 21.2 * s, 12.8 * s, 2.6 * s);
  g.fillStyle = hex(P.surround);
  g.fill();
  g.fillStyle = hex(P.court);
  g.fillRect(cx - 6.7 * s, cy - 3.05 * s, 13.4 * s, 6.1 * s);
  g.strokeStyle = hex(P.line);
  g.lineWidth = Math.max(1, s * 0.08);
  g.strokeRect(cx - 6.7 * s, cy - 3.05 * s, 13.4 * s, 6.1 * s);
  g.beginPath();
  for (const x of [-2.13, 2.13]) {
    g.moveTo(cx + x * s, cy - 3.05 * s);
    g.lineTo(cx + x * s, cy + 3.05 * s);
  }
  g.moveTo(cx - 6.7 * s, cy);
  g.lineTo(cx - 2.13 * s, cy);
  g.moveTo(cx + 2.13 * s, cy);
  g.lineTo(cx + 6.7 * s, cy);
  g.stroke();
  g.strokeStyle = '#2b2a2e';
  g.lineWidth = Math.max(1, s * 0.12);
  g.beginPath();
  g.moveTo(cx, cy - 3.4 * s);
  g.lineTo(cx, cy + 3.4 * s);
  g.stroke();
  const center = cfg.logos.find((l) => l.surface === 'court-center');
  if (center) drawLogo(g, cx, cy, 3.8 * s, center.color);
  const base = cfg.logos.find((l) => l.surface === 'behind-baseline');
  if (base) for (const x of [-8.4, 8.4]) {
    g.save();
    g.translate(cx + x * s, cy);
    g.rotate(x < 0 ? Math.PI / 2 : -Math.PI / 2);
    drawLogo(g, 0, 0, 3.6 * s, base.color);
    g.restore();
  }
  if (cfg.logos.some((l) => l.surface === 'corner-monograms')) {
    const c = cfg.logos.find((l) => l.surface === 'corner-monograms')!.color;
    for (const [x, y] of [
      [-4.4, -1.7],
      [4.4, 1.7],
    ])
      drawCrest(g, cx + x * s, cy + y * s, 1.2 * s, c);
  }
  // DJ stage.
  const djx = cx - 12.4 * s;
  g.fillStyle = '#fbf8f3';
  g.beginPath();
  g.arc(djx, cy, 2.6 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = hex(cfg.palette.glow);
  g.beginPath();
  g.arc(djx, cy, 1.3 * s, -Math.PI / 2, Math.PI / 2);
  g.fill();
  g.fillStyle = '#2b2a2e';
  g.fillRect(djx - 0.3 * s, cy - 0.9 * s, 0.6 * s, 1.8 * s);
}
