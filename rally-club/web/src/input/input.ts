// Fallback (non-motion) input: keyboard, gamepad and on-screen touch buttons, mapped to the same
// ControlInput a phone motion controller will produce in P2.
//
// Keyboard: J / Space = drive · K = dink · L = lob · A/D or ←/→ = move & aim · W/S or ↑/↓ = move (precision)
// Gamepad:  A = drive · B = dink · Y = lob · left stick = move & aim

import type { StrokeShot } from '../../../shared/src/match.ts';

export type InputShot = StrokeShot | 'auto';
export interface RawInput {
  moveX: number;
  moveZ: number;
  swing: { shot: InputShot; aim: number; lead?: number } | null;
}

export class InputManager {
  private keys = new Set<string>();
  private queued: InputShot | null = null;
  private queuedLead = 0;
  /** Left-right movement from a paired phone (-1..1). */
  remoteMoveX = 0;
  private touchAim = 0;
  private padPrev: boolean[] = [];
  onPause: (() => void) | null = null;
  enabled = true;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape' || k === 'p') {
        this.onPause?.();
        return;
      }
      if (!this.enabled) return;
      this.keys.add(k);
      if (k === 'j' || k === ' ' || k === 'enter') this.queued = 'auto';
      else if (k === 'k') this.queued = 'dink';
      else if (k === 'l') this.queued = 'lob';
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Wire on-screen touch buttons (shown on touch devices). */
  bindTouch(root: HTMLElement): void {
    root.querySelectorAll<HTMLElement>('[data-shot]').forEach((b) => {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.queued = b.dataset.shot as InputShot;
        navigator.vibrate?.(8);
      });
    });
    root.querySelectorAll<HTMLElement>('[data-aim]').forEach((b) => {
      const v = Number(b.dataset.aim);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.touchAim = v;
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => (this.touchAim = 0));
    });
  }

  /** Tap / click anywhere on the court view = swing (one-button play). */
  bindCanvas(el: HTMLElement): void {
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled || e.button > 0) return;
      this.queued = 'auto';
      navigator.vibrate?.(6);
    });
  }

  /** A swing from the paired phone; `leadSec` is its network delay, credited to the swing timer. */
  remote(shot: InputShot, leadSec: number): void {
    if (!this.enabled) return;
    this.queued = shot;
    this.queuedLead = leadSec;
  }

  /** Programmatic swing (used by automated tests and the on-screen buttons). */
  press(shot: InputShot): void {
    this.queued = shot;
  }

  poll(): RawInput {
    const k = this.keys;
    let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.touchAim + this.remoteMoveX;
    let z = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);

    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const az = -(pad.axes[1] ?? 0);
      if (Math.abs(ax) > 0.2) x += ax;
      if (Math.abs(az) > 0.2) z += az;
      const map: [number, InputShot][] = [
        [0, 'auto'],
        [1, 'dink'],
        [3, 'lob'],
      ];
      for (const [i, shot] of map) {
        const down = !!pad.buttons[i]?.pressed;
        if (down && !this.padPrev[i]) this.queued = shot;
        this.padPrev[i] = down;
      }
    }
    const swing = this.queued && this.enabled ? { shot: this.queued, aim: Math.max(-1, Math.min(1, x)), lead: this.queuedLead } : null;
    this.queued = null;
    this.queuedLead = 0;
    if (!this.enabled) return { moveX: 0, moveZ: 0, swing: null };
    return { moveX: Math.max(-1, Math.min(1, x)), moveZ: Math.max(-1, Math.min(1, z)), swing };
  }
}
