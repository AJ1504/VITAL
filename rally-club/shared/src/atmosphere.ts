// AtmosphereDirector: the single event bus that turns match events into presentation cues —
// crowd energy/state, DJ actions, commentary, camera moves, VFX and controller haptics.
// It contains no rendering or audio code; each front end (browser harness, Unreal) subscribes to cues.

import { type CommentaryCategory, CommentaryEngine, type CommentaryLine, nameSlots } from './commentary.ts';
import type { Side } from './court.ts';
import type { SimEvent } from './match.ts';

export type CrowdState = 'idle' | 'murmur' | 'tension' | 'cheer' | 'gasp' | 'ovation' | 'applause';
export type DjAction = 'duck' | 'unduck' | 'sting' | 'build' | 'drop' | 'filter_down' | 'filter_up';
export type CameraAction = 'serve_view' | 'rally_follow' | 'point_sweep' | 'tension_push' | 'celebrate';
export type HapticPattern = 'impact' | 'perfect' | 'miss' | 'point' | 'win';

export type AtmosphereCue =
  | { kind: 'crowd'; state: CrowdState; intensity: number }
  | { kind: 'dj'; action: DjAction }
  | { kind: 'commentary'; line: CommentaryLine }
  | { kind: 'camera'; action: CameraAction }
  | { kind: 'vfx'; effect: 'confetti' | 'sparkle' | 'dust'; side?: Side }
  | { kind: 'haptic'; side: Side; pattern: HapticPattern }
  | { kind: 'energy'; value: number };

export type CueListener = (cue: AtmosphereCue) => void;

export interface DirectorContext {
  names: [string, string];
  pointsToWin: number;
}

export const LONG_RALLY = 8;
export const EPIC_RALLY = 15;

export class AtmosphereDirector {
  /** Crowd energy 0..1; decays toward a resting level. */
  energy = 0.25;
  private listeners: CueListener[] = [];
  private commentary: CommentaryEngine;
  private ctx: DirectorContext;
  private time = 0;
  private rally = 0;
  private tensionRaised = false;
  private buildSent = false;
  private ducked = false;
  private duckUntil = 0;
  private gamePointPending = false;
  private pendingFault: CommentaryCategory | null = null;

  constructor(ctx: DirectorContext, commentary = new CommentaryEngine()) {
    this.ctx = ctx;
    this.commentary = commentary;
  }

  on(listener: CueListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Advance time (seconds): energy decay and music un-ducking. */
  tick(dt: number): void {
    this.time += dt;
    const rest = this.gamePointPending ? 0.55 : 0.25;
    this.energy += (rest - this.energy) * Math.min(1, dt * 0.35);
    if (this.ducked && this.time >= this.duckUntil) {
      this.ducked = false;
      this.emit({ kind: 'dj', action: 'unduck' });
    }
  }

  handle(e: SimEvent): void {
    const n = this.ctx.names;
    switch (e.type) {
      case 'match_start':
        this.say('intro', { a: n[0], b: n[1], target: this.ctx.pointsToWin });
        this.crowd('applause', 0.6);
        this.emit({ kind: 'camera', action: 'serve_view' });
        break;
      case 'serve':
        this.rally = 1;
        this.tensionRaised = false;
        this.buildSent = false;
        this.emit({ kind: 'camera', action: 'rally_follow' });
        this.crowd(this.gamePointPending ? 'tension' : 'idle', this.gamePointPending ? 0.7 : 0.2);
        break;
      case 'contact':
        this.emit({ kind: 'haptic', side: e.side, pattern: e.perfect ? 'perfect' : 'impact' });
        if (e.perfect) {
          this.emit({ kind: 'vfx', effect: 'sparkle', side: e.side });
          this.say('perfect', {});
        }
        break;
      case 'hit':
        this.rally = e.hitCount;
        this.bump(0.02);
        if (e.hitCount >= LONG_RALLY && !this.tensionRaised) {
          this.tensionRaised = true;
          this.bump(0.15);
          this.crowd('murmur', 0.5);
        }
        if (e.hitCount >= EPIC_RALLY && !this.buildSent) {
          this.buildSent = true;
          this.bump(0.2);
          this.crowd('tension', 0.85);
          this.emit({ kind: 'dj', action: 'build' });
          this.emit({ kind: 'camera', action: 'tension_push' });
          this.say('long_rally', { rally: e.hitCount });
        }
        break;
      case 'whiff':
        this.emit({ kind: 'haptic', side: e.side, pattern: 'miss' });
        break;
      case 'fault':
        this.onFault(e.side, e.reason);
        break;
      case 'point':
        this.onPoint(e);
        break;
      case 'game_over': {
        const winner = n[e.winner];
        const score = `${e.score[e.winner]}-${e.score[e.winner === 0 ? 1 : 0]}`;
        this.energy = 1;
        this.gamePointPending = false;
        this.crowd('ovation', 1);
        this.emit({ kind: 'dj', action: 'sting' });
        this.emit({ kind: 'dj', action: 'drop' });
        this.emit({ kind: 'vfx', effect: 'confetti' });
        this.emit({ kind: 'camera', action: 'celebrate' });
        this.emit({ kind: 'haptic', side: e.winner, pattern: 'win' });
        if (e.comeback) this.say('comeback', nameSlots(winner, 'winner'));
        this.say('win', { ...nameSlots(winner, 'winner'), score });
        break;
      }
      case 'practice_result':
        if (e.good && e.streak > 0 && e.streak % 5 === 0) {
          this.say('practice_streak', { streak: e.streak });
          this.crowd('applause', 0.5);
        }
        break;
      default:
        break;
    }
    this.emit({ kind: 'energy', value: this.energy });
  }

  private onFault(side: Side, reason: string): void {
    const cat: Record<string, CommentaryCategory> = {
      serve_into_net: 'serve_fault',
      serve_in_kitchen: 'serve_fault',
      serve_wrong_court: 'serve_fault',
      serve_out: 'serve_fault',
      net: 'net',
      out: 'out',
      kitchen_volley: 'kitchen',
      two_bounce_rule: 'two_bounce',
    };
    const c = cat[reason];
    if (c) this.pendingFault = c;
    this.emit({ kind: 'haptic', side, pattern: 'miss' });
  }

  private onPoint(e: Extract<SimEvent, { type: 'point' }>): void {
    const n = this.ctx.names;
    const winner = n[e.rallyWinner];
    const server = n[e.sideOut ? e.rallyWinner : e.server];
    const score = `${e.score[e.sideOut ? e.rallyWinner : e.server]}-${e.score[e.sideOut ? e.server : e.rallyWinner === 0 ? 1 : 0]}`;
    const long = e.rallyLength >= LONG_RALLY;
    const ctx = { ...nameSlots(winner, 'winner'), ...nameSlots(server, 'server'), score, rally: e.rallyLength };
    this.emit({ kind: 'haptic', side: e.rallyWinner, pattern: 'point' });

    // Crowd: big rallies get big reactions; unforced errors in long rallies get a gasp first.
    if (long && (e.reason === 'net' || e.reason === 'out')) this.crowd('gasp', 0.8);
    const cheer = Math.min(1, 0.45 + e.rallyLength * 0.04 + (e.savedGamePoint ? 0.3 : 0));
    this.bump(0.1 + e.rallyLength * 0.015);
    this.crowd('cheer', cheer);
    this.emit({ kind: 'camera', action: 'point_sweep' });

    let spoke = false;
    if (e.savedGamePoint) spoke = !!this.say('save', ctx);
    if (!spoke && e.ace) spoke = !!this.say('ace', ctx);
    if (!spoke && this.pendingFault && !(e.reason === 'double_bounce')) spoke = !!this.say(this.pendingFault, ctx);
    if (!spoke && long) spoke = !!this.say('long_rally', ctx);
    if (!spoke && e.sideOut) spoke = !!this.say('side_out', ctx);
    if (!spoke) this.say('winner', ctx);
    this.pendingFault = null;

    if (this.tensionRaised || this.buildSent) this.emit({ kind: 'dj', action: 'drop' });

    const wasPending = this.gamePointPending;
    this.gamePointPending = e.gamePoint;
    if (e.gamePoint) {
      this.emit({ kind: 'dj', action: 'filter_down' });
      this.say('game_point', ctx);
    } else if (wasPending) {
      this.emit({ kind: 'dj', action: 'filter_up' });
    }
  }

  private say(cat: CommentaryCategory, ctx: Record<string, string | number>): CommentaryLine | null {
    const line = this.commentary.request(cat, this.time, ctx);
    if (!line) return null;
    this.emit({ kind: 'commentary', line });
    if (!this.ducked) this.emit({ kind: 'dj', action: 'duck' });
    this.ducked = true;
    this.duckUntil = Math.max(this.duckUntil, this.time + line.duration);
    return line;
  }

  private crowd(state: CrowdState, intensity: number): void {
    this.emit({ kind: 'crowd', state, intensity: Math.max(0, Math.min(1, intensity * (0.6 + this.energy * 0.6))) });
  }

  private bump(x: number): void {
    this.energy = Math.min(1, this.energy + x);
  }

  private emit(cue: AtmosphereCue): void {
    for (const l of this.listeners) l(cue);
  }
}
