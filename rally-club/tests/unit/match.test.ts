import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AI_PROFILES, AiController } from '../../shared/src/ai.ts';
import { MatchSim, NO_INPUT, type SimEvent } from '../../shared/src/match.ts';

function playOut(seed: number, assist: 'casual' | 'classic' | 'precision' = 'classic', pointsToWin = 11, maxSeconds = 1800) {
  const sim = new MatchSim({ seed, assist: [assist, assist], pointsToWin });
  const ais = [new AiController(0, AI_PROFILES.medium, seed * 7 + 1), new AiController(1, AI_PROFILES.medium, seed * 13 + 5)];
  const events: SimEvent[] = [];
  let t = 0;
  const dt = 1 / 60;
  while (!sim.isOver && t < maxSeconds) {
    sim.update(dt, [ais[0].think(sim, dt), ais[1].think(sim, dt)]);
    events.push(...sim.drainEvents());
    t += dt;
  }
  return { sim, events, t };
}

describe('match loop (AI vs AI, headless)', () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`seed ${seed}: plays a complete game to 11 with a legal final score`, () => {
      const { sim, events, t } = playOut(seed);
      assert.equal(sim.isOver, true, `game did not finish in ${t.toFixed(0)}s, score ${sim.rules.state.score}`);
      const [a, b] = sim.rules.state.score;
      const w = Math.max(a, b);
      assert.ok(w >= 11 && Math.abs(a - b) >= 2, `final ${a}-${b}`);
      const points = events.filter((e) => e.type === 'point');
      const scored = points.filter((e) => e.type === 'point' && e.scored).length;
      assert.equal(scored, a + b, 'every scored point is accounted for');
      const rallies = points.map((e) => (e.type === 'point' ? e.rallyLength : 0));
      assert.ok(Math.max(...rallies) >= 4, 'at least one multi-shot rally happened');
      assert.equal(events.filter((e) => e.type === 'game_over').length, 1);
    });
  }

  it('is deterministic for a given seed', () => {
    const a = playOut(42, 'classic', 5);
    const b = playOut(42, 'classic', 5);
    assert.deepEqual(a.sim.rules.state.score, b.sim.rules.state.score);
    assert.equal(a.events.length, b.events.length);
  });

  it('casual assist never commits two-bounce or kitchen faults for an assisted player', () => {
    const { events } = playOut(9, 'casual', 7);
    const bad = events.filter((e) => e.type === 'fault' && (e.reason === 'two_bounce_rule' || e.reason === 'kitchen_volley'));
    assert.equal(bad.length, 0);
  });

  it('the server is locked until they swing; a swing launches a legal serve', () => {
    const sim = new MatchSim({ seed: 3 });
    sim.update(1, [NO_INPUT, NO_INPUT]);
    assert.equal(sim.rules.state.phase, 'awaiting_serve');
    assert.equal(sim.ballHeld, true);
    sim.update(1 / 60, [{ moveX: 0, moveZ: 0, swing: { shot: 'drive', aim: 0 } }, NO_INPUT]);
    assert.equal(sim.rules.state.phase, 'in_play');
    assert.equal(sim.ballHeld, false);
    // Let it fly with no return: receiver lets it double bounce -> server scores (an ace).
    let ev: SimEvent[] = [];
    for (let i = 0; i < 300 && sim.rules.state.phase === 'in_play'; i++) {
      sim.update(1 / 60, [NO_INPUT, NO_INPUT]);
      ev = ev.concat(sim.drainEvents());
    }
    const p = ev.find((e) => e.type === 'point');
    assert.ok(p && p.type === 'point');
    assert.equal(p.reason, 'double_bounce');
    assert.deepEqual(sim.rules.state.score, [1, 0]);
  });

  it('practice mode feeds balls and scores good returns', () => {
    const sim = new MatchSim({ mode: 'practice', seed: 5, assist: ['casual', 'casual'] });
    const ai = new AiController(0, AI_PROFILES.hard, 3);
    const results: SimEvent[] = [];
    for (let t = 0; t < 90; t += 1 / 60) {
      sim.update(1 / 60, [ai.think(sim, 1 / 60), NO_INPUT]);
      results.push(...sim.drainEvents().filter((e) => e.type === 'practice_result'));
    }
    assert.ok(results.length >= 8, `results ${results.length}`);
    assert.ok(sim.practice.good >= 3, `good returns ${sim.practice.good}`);
  });
});
