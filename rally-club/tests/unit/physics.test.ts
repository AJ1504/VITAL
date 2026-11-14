import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPickleballCourt, netHeightAt } from '../../shared/src/court.ts';
import { type BallState, type PhysicsEvent, pickleballPhysics, stepBall } from '../../shared/src/physics.ts';
import { SHOT_PROFILES, type ShotType, solveShot } from '../../shared/src/shot.ts';
import { v3 } from '../../shared/src/vec.ts';

const court = createPickleballCourt();
const params = pickleballPhysics();
const DT = 1 / 120;

function run(ball: BallState, seconds: number, onEvent?: (e: PhysicsEvent, t: number) => boolean | void) {
  for (let t = 0; t < seconds; t += DT) {
    for (const e of stepBall(ball, DT, params, court)) if (onEvent?.(e, t)) return;
  }
}

describe('ball physics', () => {
  it('free fall from 2 m lands in ~sqrt(2h/g) seconds (drag is small at low speed)', () => {
    const ball: BallState = { p: v3(0, 2, 3), v: v3(), w: v3() };
    let landed = -1;
    run(ball, 3, (e, t) => {
      if (e.type === 'bounce') {
        landed = t;
        return true;
      }
    });
    const ideal = Math.sqrt((2 * (2 - params.ballRadius)) / 9.81);
    assert.ok(Math.abs(landed - ideal) < 0.03, `landed at ${landed}, ideal ${ideal}`);
  });

  it('rebound from a 78 in drop is within the 30–34 in equipment spec', () => {
    const r = params.ballRadius;
    const ball: BallState = { p: v3(0, 78 * 0.0254 + r, 3), v: v3(), w: v3() };
    let bounced = false;
    let apex = 0;
    run(ball, 3, (e) => {
      if (e.type === 'bounce') {
        if (bounced) return true;
        bounced = true;
      }
    });
    // Re-run tracking apex after first bounce.
    const b2: BallState = { p: v3(0, 78 * 0.0254 + r, 3), v: v3(), w: v3() };
    let n = 0;
    for (let t = 0; t < 3; t += DT) {
      for (const e of stepBall(b2, DT, params, court)) if (e.type === 'bounce') n++;
      if (n === 1) apex = Math.max(apex, b2.p.y - r);
      if (n >= 2) break;
    }
    const inches = apex / 0.0254;
    assert.ok(bounced);
    assert.ok(inches >= 29 && inches <= 35, `rebound ${inches.toFixed(1)} in`);
  });

  it('air drag reduces horizontal speed', () => {
    const ball: BallState = { p: v3(0, 50, 6), v: v3(0, 0, -20), w: v3() };
    run(ball, 0.5);
    assert.ok(Math.abs(ball.v.z) < 19.5);
  });

  it('a low ball is stopped by the net and drops on the hitter side', () => {
    const ball: BallState = { p: v3(0, 0.5, 3), v: v3(0, 0.5, -12), w: v3() };
    let hitNet = false;
    run(ball, 2, (e) => {
      if (e.type === 'net') hitNet = true;
    });
    assert.ok(hitNet);
    assert.ok(ball.p.z > 0, `ball should remain on side 0, z=${ball.p.z}`);
  });

  it('a ball above the tape crosses the net', () => {
    const ball: BallState = { p: v3(0, 1.4, 3), v: v3(0, 1, -10), w: v3() };
    let crossed = false;
    run(ball, 0.6, (e) => {
      if (e.type === 'crossNet') crossed = true;
      assert.notEqual(e.type, 'net');
    });
    assert.ok(crossed);
    assert.ok(ball.p.z < 0);
  });

  it('a ball outside the posts passes around the net', () => {
    const ball: BallState = { p: v3(court.halfWidth + 0.6, 0.4, 2), v: v3(0, 1, -10), w: v3() };
    let netted = false;
    run(ball, 0.4, (e) => {
      if (e.type === 'net') netted = true;
    });
    assert.equal(netted, false);
  });
});

describe('shot solver', () => {
  const cases: [ShotType, ReturnType<typeof v3>, ReturnType<typeof v3>][] = [
    ['serve', v3(1.5, 0.75, 7.0), v3(-1.5, 0, -5.0)],
    ['drive', v3(-1, 0.6, 6.5), v3(2, 0, -5.5)],
    ['drive', v3(0, 0.25, 6.0), v3(0, 0, -5.8)], // low contact must still clear the net
    ['dink', v3(0.5, 0.4, 2.4), v3(-0.8, 0, -1.2)],
    ['drop', v3(0, 0.5, 6.4), v3(1, 0, -1.6)],
    ['lob', v3(0, 0.9, 2.5), v3(-1, 0, -6.0)],
  ];
  for (const [type, from, target] of cases) {
    it(`${type} from z=${from.z} y=${from.y} lands within 5 cm of target and clears the net`, () => {
      const sol = solveShot(from, target, type, params, court);
      const err = Math.hypot(sol.landing.x - target.x, sol.landing.z - target.z);
      assert.ok(err < 0.05, `landing error ${err.toFixed(3)} m`);
      assert.ok(sol.netClearance >= SHOT_PROFILES[type].netClearance - 1e-6, `clearance ${sol.netClearance}`);
      // Verify with the full simulation including net collision.
      const ball: BallState = { p: { ...from }, v: { ...sol.velocity }, w: { ...sol.spin } };
      let first: ReturnType<typeof v3> | null = null;
      run(ball, 6, (e) => {
        assert.notEqual(e.type, 'net');
        if (e.type === 'bounce') {
          first = e.p;
          return true;
        }
      });
      assert.ok(first, 'ball landed');
      const f = first as unknown as ReturnType<typeof v3>;
      assert.ok(Math.hypot(f.x - target.x, f.z - target.z) < 0.08);
    });
  }

  it('net height used by the solver matches regulation sag', () => {
    assert.ok(netHeightAt(court, 0) < netHeightAt(court, court.halfWidth));
  });
});
