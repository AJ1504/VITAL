// Cross-language determinism check: prints the same summary line per seed as
// `rally_core_tests --parity` (the Unreal C++ core). scripts/parity-check.sh diffs the two.
import { AI_PROFILES, AiController } from '../shared/src/ai.ts';
import { MatchSim } from '../shared/src/match.ts';

for (const seed of [1, 2, 3, 4, 5, 6]) {
  const sim = new MatchSim({ seed, assist: ['classic', 'classic'] });
  const a = new AiController(0, AI_PROFILES.medium, seed * 7 + 1);
  const b = new AiController(1, AI_PROFILES.medium, seed * 13 + 5);
  let points = 0;
  let maxRally = 0;
  let steps = 0;
  while (!sim.isOver && steps < 1800 * 60) {
    const dt = 1 / 60;
    sim.update(dt, [a.think(sim, dt), b.think(sim, dt)]);
    steps++;
    for (const e of sim.drainEvents()) {
      if (e.type === 'point') {
        points++;
        maxRally = Math.max(maxRally, e.rallyLength);
      }
    }
  }
  const [s0, s1] = sim.rules.state.score;
  console.log(`seed=${seed} score=${s0}-${s1} points=${points} maxRally=${maxRally} frames=${steps}`);
}
