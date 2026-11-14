// Headless AI-vs-AI soak: plays full games through the shared core and prints score / rally stats.
// Run: node scripts/soak.ts
import { MatchSim } from '../shared/src/match.ts';
import { AiController, AI_PROFILES } from '../shared/src/ai.ts';
for (const seed of [1,2,3]) {
const sim = new MatchSim({ seed, assist: ['classic','classic'] });
const ais = [new AiController(0, AI_PROFILES.medium, seed*7), new AiController(1, AI_PROFILES.medium, seed*13)];
const reasons: Record<string,number> = {}; const lens:number[]=[];
let t=0;
while(!sim.isOver && t<3600){ const dt=1/60; sim.update(dt,[ais[0].think(sim,dt),ais[1].think(sim,dt)]); t+=dt;
 for(const e of sim.drainEvents()){ if(e.type==='point'){reasons[e.reason]=(reasons[e.reason]??0)+1; lens.push(e.rallyLength);} } }
console.log(seed, sim.rules.state.score, 'time', t.toFixed(0), 'points', lens.length, 'avgRally', (lens.reduce((a,b)=>a+b,0)/lens.length).toFixed(2), reasons);
}
