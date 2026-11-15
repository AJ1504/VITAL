// Event-driven commentary selection: prioritised categories, per-category cooldowns, a global gap,
// and repetition avoidance. Lines are original placeholder copy for the temporary voice pass
// (see docs/ASSET_LICENSING.md). AI-generated commentary is a later opt-in layer and is never
// required for gameplay.

import { type Rng, createRng } from './rng.ts';

export type CommentaryCategory =
  | 'intro'
  | 'serve_fault'
  | 'ace'
  | 'long_rally'
  | 'net'
  | 'out'
  | 'kitchen'
  | 'two_bounce'
  | 'winner'
  | 'side_out'
  | 'game_point'
  | 'save'
  | 'comeback'
  | 'win'
  | 'perfect'
  | 'practice_streak';

interface CategoryDef {
  priority: number; // higher wins when several requests compete
  cooldown: number; // seconds before the category may speak again
  lines: string[];
}

export const COMMENTARY: Record<CommentaryCategory, CategoryDef> = {
  intro: {
    priority: 9,
    cooldown: 60,
    lines: [
      'Welcome to the Vital Pickleball Club — a full house, the DJ is rolling, and it’s {a} versus {b}.',
      'The sun is out, the music is warm, and the court is ready. {a} and {b}, the floor is yours.',
      'What a setting for pickleball. {a} against {b}, first to {target}. Let’s play!',
    ],
  },
  serve_fault: {
    priority: 4,
    cooldown: 6,
    lines: ['Oh, the serve doesn’t find the box.', 'Fault on the serve — that one wandered.', 'Not the serve {server} {was} looking for.'],
  },
  ace: {
    priority: 6,
    cooldown: 8,
    lines: ['Unreturnable! Served up and delivered.', 'Ace! The terrace loved that one.', 'Straight past them — a serve with a postmark.'],
  },
  long_rally: {
    priority: 5,
    cooldown: 12,
    lines: ['Listen to this crowd — {rally} shots and counting!', 'Neither of them will blink. What a rally!', 'Back and forth, back and forth… someone has to crack.'],
  },
  net: {
    priority: 3,
    cooldown: 6,
    lines: ['Into the tape.', 'The net says no.', 'Caught the net — so close.'],
  },
  out: {
    priority: 3,
    cooldown: 6,
    lines: ['Just long!', 'Wide — the line judge didn’t need long on that.', 'That one sailed with the sunset.'],
  },
  kitchen: {
    priority: 5,
    cooldown: 10,
    lines: ['Foot in the kitchen! You can’t volley from there.', 'Kitchen violation — the cardinal sin.', 'Out of the kitchen, please! Fault.'],
  },
  two_bounce: {
    priority: 5,
    cooldown: 10,
    lines: ['Too eager — it had to bounce first!', 'Two-bounce rule! Patience is a virtue.', 'That one needed a bounce. Fault.'],
  },
  winner: {
    priority: 4,
    cooldown: 5,
    lines: ['That point goes to {winnerObj}.', 'Lovely stuff from {winnerObj}.', '{winner} {takes} it — {score}.', 'Clean finish. {score}.'],
  },
  side_out: {
    priority: 2,
    cooldown: 7,
    lines: ['Side out.', 'Over to {serverObj} to serve.', 'Serve changes hands.'],
  },
  game_point: {
    priority: 7,
    cooldown: 4,
    lines: ['Game point, {serverObj} serving.', 'One point from the match — the terrace is on its feet.', 'Here it is… game point.'],
  },
  save: {
    priority: 7,
    cooldown: 6,
    lines: ['Saved! {winner} {is} not done yet!', 'Game point erased — what nerve!', 'Fought off! We play on.'],
  },
  comeback: {
    priority: 8,
    cooldown: 60,
    lines: ['From way back — what a comeback by {winnerObj}!', 'They were buried, and {winner} dug all the way out!'],
  },
  win: {
    priority: 10,
    cooldown: 30,
    lines: ['Game, set and sunset — {winner} {wins} it {score}!', '{winner} {takes} the match! Cue the confetti!', 'That’s the match! {winner} {wins} {score} — what an evening!'],
  },
  perfect: {
    priority: 1,
    cooldown: 9,
    lines: ['Sweet spot!', 'Pure contact.', 'Oh, that sounded perfect.'],
  },
  practice_streak: {
    priority: 4,
    cooldown: 8,
    lines: ['{streak} in a row — lovely rhythm!', 'Grooving now, {streak} straight.', 'The ball machine is running out of ideas. {streak}!'],
  },
};

/**
 * Template slots for a player name with verb agreement, so the default name "You" reads naturally
 * ("You win it 11-4" / "Rafa wins it 11-4").
 */
export function nameSlots(name: string, prefix: 'winner' | 'server'): Record<string, string> {
  const you = name.toLowerCase() === 'you';
  const slots: Record<string, string> = { [prefix]: name, [`${prefix}Obj`]: you ? 'you' : name };
  if (prefix === 'winner') Object.assign(slots, { wins: you ? 'win' : 'wins', takes: you ? 'take' : 'takes', is: you ? 'are' : 'is' });
  else Object.assign(slots, { was: you ? 'were' : 'was' });
  return slots;
}

export interface CommentaryLine {
  category: CommentaryCategory;
  text: string;
  priority: number;
  /** Estimated speaking duration in seconds (for music ducking). */
  duration: number;
}

export interface CommentaryOptions {
  /** Minimum seconds between any two lines. */
  globalGap?: number;
  /** How many recent lines to avoid repeating. */
  historySize?: number;
  seed?: number;
}

export class CommentaryEngine {
  private lastSpoken = new Map<CommentaryCategory, number>();
  private lastAnyTime = -Infinity;
  private lastPriority = 0;
  private history: string[] = [];
  private rng: Rng;
  private globalGap: number;
  private historySize: number;

  constructor(opts: CommentaryOptions = {}) {
    this.rng = createRng(opts.seed ?? 7);
    this.globalGap = opts.globalGap ?? 2.2;
    this.historySize = opts.historySize ?? 8;
  }

  /**
   * Ask for a line. Returns null if the category is cooling down, or a higher-priority line is still
   * playing (lines of higher priority may interrupt lower-priority ones within the global gap).
   */
  request(category: CommentaryCategory, now: number, ctx: Record<string, string | number> = {}): CommentaryLine | null {
    const def = COMMENTARY[category];
    const last = this.lastSpoken.get(category) ?? -Infinity;
    if (now - last < def.cooldown) return null;
    if (now - this.lastAnyTime < this.globalGap && def.priority <= this.lastPriority) return null;

    const candidates = def.lines.filter((l) => !this.history.includes(l));
    const pool = candidates.length > 0 ? candidates : def.lines;
    const template = pool[Math.floor(this.rng() * pool.length) % pool.length];
    const text = template.replace(/\{(\w+)\}/g, (_, k: string) => String(ctx[k] ?? ''));

    this.lastSpoken.set(category, now);
    this.lastAnyTime = now;
    this.lastPriority = def.priority;
    this.history.push(template);
    if (this.history.length > this.historySize) this.history.shift();
    return { category, text, priority: def.priority, duration: 0.6 + text.split(/\s+/).length * 0.32 };
  }
}
