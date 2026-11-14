// Fallback (non-motion) input: keyboard, gamepad and on-screen touch buttons, mapped to the same
// ControlInput a phone motion controller will produce in P2.
//
// Keyboard: J / Space = drive · K = dink · L = lob · A/D or ←/→ = move & aim · W/S or ↑/↓ = move (precision)
// Gamepad:  A = drive · B = dink · Y = lob · left stick = move & aim

import type { ControlInput, StrokeShot } from '../../../shared/src/match.ts';

export class InputManager {
  private keys = new Set<string>();
  private queued: StrokeShot | null = null;
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
      if (k === 'j' || k === ' ') this.queued = 'drive';
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
        this.queued = b.dataset.shot as StrokeShot;
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

  /** Programmatic swing (used by automated tests and the on-screen buttons). */
  press(shot: StrokeShot): void {
    this.queued = shot;
  }

  poll(): ControlInput {
    const k = this.keys;
    let x = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0) + this.touchAim;
    let z = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);

    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      const az = -(pad.axes[1] ?? 0);
      if (Math.abs(ax) > 0.2) x += ax;
      if (Math.abs(az) > 0.2) z += az;
      const map: [number, StrokeShot][] = [
        [0, 'drive'],
        [1, 'dink'],
        [3, 'lob'],
      ];
      for (const [i, shot] of map) {
        const down = !!pad.buttons[i]?.pressed;
        if (down && !this.padPrev[i]) this.queued = shot;
        this.padPrev[i] = down;
      }
    }
    const swing = this.queued && this.enabled ? { shot: this.queued, aim: Math.max(-1, Math.min(1, x)) } : null;
    this.queued = null;
    if (!this.enabled) return { moveX: 0, moveZ: 0, swing: null };
    return { moveX: Math.max(-1, Math.min(1, x)), moveZ: Math.max(-1, Math.min(1, z)), swing };
  }
}
