import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type AtmosphereCue, AtmosphereDirector } from '../../shared/src/atmosphere.ts';
import { COMMENTARY, CommentaryEngine } from '../../shared/src/commentary.ts';
import type { SimEvent } from '../../shared/src/match.ts';

describe('commentary engine', () => {
  it('respects per-category cooldowns', () => {
    const c = new CommentaryEngine({ globalGap: 0 });
    assert.ok(c.request('net', 0));
    assert.equal(c.request('net', 1), null);
    assert.ok(c.request('net', COMMENTARY.net.cooldown + 0.01));
  });

  it('never repeats a line while alternatives exist', () => {
    const c = new CommentaryEngine({ globalGap: 0, historySize: 8 });
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) seen.push(c.request('winner', i * 10, { winner: 'A', winnerObj: 'A', takes: 'takes', score: '1-0' })!.text);
    assert.equal(new Set(seen).size, 3);
  });

  it('lower/equal priority lines wait for the global gap; higher priority can interrupt', () => {
    const c = new CommentaryEngine({ globalGap: 3 });
    assert.ok(c.request('net', 0));
    assert.equal(c.request('out', 1), null); // same priority
    assert.ok(c.request('win', 1.5, { winner: 'A', score: '11-3' })); // higher priority
  });

  it('agrees verbs with the default name "You"', () => {
    const d = new AtmosphereDirector({ names: ['You', 'Bo'], pointsToWin: 11 }, new CommentaryEngine({ globalGap: 0 }));
    const lines: string[] = [];
    d.on((c) => c.kind === 'commentary' && lines.push(c.line.text));
    d.handle({ type: 'game_over', winner: 0, score: [11, 4], comeback: false });
    assert.equal(lines.length, 1);
    assert.ok(!/You (wins|takes)/.test(lines[0]), lines[0]);
  });

  it('fills template slots', () => {
    const c = new CommentaryEngine();
    const l = c.request('intro', 0, { a: 'Ana', b: 'Bo', target: 11 })!;
    assert.ok(!l.text.includes('{'));
  });
});

describe('atmosphere director', () => {
  const make = () => {
    const d = new AtmosphereDirector({ names: ['Ana', 'Bo'], pointsToWin: 11 }, new CommentaryEngine({ globalGap: 0 }));
    const cues: AtmosphereCue[] = [];
    d.on((c) => cues.push(c));
    return { d, cues };
  };
  const point = (over: Partial<Extract<SimEvent, { type: 'point' }>> = {}): SimEvent => ({
    type: 'point',
    rallyWinner: 0,
    scored: true,
    sideOut: false,
    reason: 'out',
    rallyLength: 3,
    score: [1, 0],
    server: 0,
    ace: false,
    gamePoint: false,
    savedGamePoint: false,
    ...over,
  });

  it('long rally raises tension, sends a DJ build and commentary', () => {
    const { d, cues } = make();
    d.handle({ type: 'serve', server: 0, fromRight: true });
    for (let i = 2; i <= 16; i++) d.handle({ type: 'hit', side: (i % 2) as 0 | 1, hitCount: i, volley: false });
    assert.ok(cues.some((c) => c.kind === 'crowd' && c.state === 'murmur'));
    assert.ok(cues.some((c) => c.kind === 'crowd' && c.state === 'tension'));
    assert.ok(cues.some((c) => c.kind === 'dj' && c.action === 'build'));
    assert.ok(cues.some((c) => c.kind === 'commentary' && c.line.category === 'long_rally'));
    assert.ok(d.energy > 0.5);
  });

  it('game point triggers a DJ filter and game-point call', () => {
    const { d, cues } = make();
    d.handle(point({ gamePoint: true, score: [10, 4] }));
    assert.ok(cues.some((c) => c.kind === 'dj' && c.action === 'filter_down'));
    assert.ok(cues.some((c) => c.kind === 'commentary' && c.line.category === 'game_point'));
  });

  it('victory: ovation, DJ sting, confetti, celebration camera, win haptic and win call', () => {
    const { d, cues } = make();
    d.handle({ type: 'game_over', winner: 1, score: [6, 11], comeback: false });
    assert.ok(cues.some((c) => c.kind === 'crowd' && c.state === 'ovation'));
    assert.ok(cues.some((c) => c.kind === 'dj' && c.action === 'sting'));
    assert.ok(cues.some((c) => c.kind === 'vfx' && c.effect === 'confetti'));
    assert.ok(cues.some((c) => c.kind === 'camera' && c.action === 'celebrate'));
    assert.ok(cues.some((c) => c.kind === 'haptic' && c.side === 1 && c.pattern === 'win'));
    const win = cues.find((c) => c.kind === 'commentary');
    assert.ok(win && win.kind === 'commentary' && win.line.text.includes('Bo') && win.line.text.length > 0);
  });

  it('commentary ducks the music and un-ducks after the line', () => {
    const { d, cues } = make();
    d.handle({ type: 'match_start', server: 0 });
    assert.ok(cues.some((c) => c.kind === 'dj' && c.action === 'duck'));
    for (let i = 0; i < 200; i++) d.tick(0.1);
    assert.ok(cues.some((c) => c.kind === 'dj' && c.action === 'unduck'));
  });

  it('kitchen fault gets its own call; contact sends impact haptics', () => {
    const { d, cues } = make();
    d.handle({ type: 'contact', side: 0, quality: 0.5, perfect: false, shot: 'drive', stroke: 'forehand', speed: 12 });
    d.handle({ type: 'fault', side: 1, reason: 'kitchen_volley' });
    d.handle(point({ reason: 'kitchen_volley', rallyLength: 5 }));
    assert.ok(cues.some((c) => c.kind === 'haptic' && c.pattern === 'impact'));
    assert.ok(cues.some((c) => c.kind === 'commentary' && c.line.category === 'kitchen'));
  });
});
