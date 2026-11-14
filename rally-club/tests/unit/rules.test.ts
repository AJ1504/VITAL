import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPickleballCourt, inCourt, inServiceBox, netHeightAt } from '../../shared/src/court.ts';
import { PickleballRules, type RuleEvent } from '../../shared/src/rules/pickleball.ts';
import { v3 } from '../../shared/src/vec.ts';

const court = createPickleballCourt();
const FT = 0.3048;
const faultOf = (ev: RuleEvent[]) => ev.find((e) => e.type === 'fault') as Extract<RuleEvent, { type: 'fault' }> | undefined;
const pointOf = (ev: RuleEvent[]) => ev.find((e) => e.type === 'point') as Extract<RuleEvent, { type: 'point' }> | undefined;

/** A legal serve landing point for the current state (centre of the diagonal box). */
function goodServeSpot(r: PickleballRules) {
  const recvSign = r.receiver === 0 ? 1 : -1;
  return v3(r.targetCourtXSign() * court.halfWidth * 0.5, 0, recvSign * (court.nvzDepth + 2));
}
const deepOn = (side: 0 | 1, x = 0) => v3(x, 0, (side === 0 ? 1 : -1) * (court.halfLength - 1));
const baselinePos = (side: 0 | 1) => v3(0, 0, (side === 0 ? 1 : -1) * court.halfLength);

/** Server wins the rally by the receiver letting the serve double-bounce. */
function serverWinsPoint(r: PickleballRules) {
  r.serve();
  r.bounce(goodServeSpot(r));
  const ev = r.bounce(goodServeSpot(r));
  r.nextPoint();
  return ev;
}

describe('court geometry', () => {
  it('uses regulation pickleball dimensions', () => {
    assert.ok(Math.abs(court.width - 20 * FT) < 1e-9);
    assert.ok(Math.abs(court.length - 44 * FT) < 1e-9);
    assert.ok(Math.abs(court.nvzDepth - 7 * FT) < 1e-9);
    assert.ok(Math.abs(netHeightAt(court, 0) - 34 * 0.0254) < 1e-9);
    assert.ok(Math.abs(netHeightAt(court, court.halfWidth + court.netPostOffset) - 36 * 0.0254) < 1e-9);
  });
  it('treats lines as in', () => {
    assert.equal(inCourt(court, v3(court.halfWidth, 0, court.halfLength)), true);
    assert.equal(inCourt(court, v3(court.halfWidth + 0.01, 0, 0)), false);
    assert.equal(inCourt(court, v3(0, 0, -court.halfLength - 0.01)), false);
  });
  it('service box: kitchen line is a fault, centre line and baseline are in', () => {
    assert.equal(inServiceBox(court, v3(1, 0, -court.nvzDepth), 1, 1), false);
    assert.equal(inServiceBox(court, v3(1, 0, -court.nvzDepth - 0.01), 1, 1), true);
    assert.equal(inServiceBox(court, v3(0, 0, -4), 1, 1), true); // centre line
    assert.equal(inServiceBox(court, v3(-0.2, 0, -4), 1, 1), false); // wrong court
    assert.equal(inServiceBox(court, v3(1, 0, -court.halfLength), 1, 1), true); // baseline
  });
});

describe('serving', () => {
  it('server serves from the right at even score and diagonally', () => {
    const r = new PickleballRules(court, {}, 0);
    assert.equal(r.serverOnRight(), true);
    assert.equal(r.serverCourtXSign(), 1); // side 0 faces -z, right = +x
    assert.equal(r.targetCourtXSign(), -1);
    assert.ok(r.serverPosition().x > 0 && r.receiverPosition().x < 0);
  });

  it('alternates court with the server score (odd -> left)', () => {
    const r = new PickleballRules(court, {}, 0);
    serverWinsPoint(r);
    assert.deepEqual(r.state.score, [1, 0]);
    assert.equal(r.serverOnRight(), false);
    assert.equal(r.serverCourtXSign(), -1);
  });

  it('serve into the kitchen (including the kitchen line) is a fault and a side out', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    const ev = r.bounce(v3(-1, 0, -court.nvzDepth)); // exactly on kitchen line
    assert.equal(faultOf(ev)?.reason, 'serve_in_kitchen');
    const p = pointOf(ev)!;
    assert.equal(p.sideOut, true);
    assert.deepEqual(p.score, [0, 0]);
    assert.equal(r.state.server, 1);
  });

  it('serve to the wrong court is a fault', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    assert.equal(faultOf(r.bounce(v3(1.5, 0, -4)))?.reason, 'serve_wrong_court');
  });

  it('serve long is a fault', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    assert.equal(faultOf(r.bounce(v3(-1.5, 0, -court.halfLength - 0.2)))?.reason, 'serve_out');
  });

  it('serve that does not cross the net is a fault', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    assert.equal(faultOf(r.bounce(v3(1, 0, 3)))?.reason, 'serve_into_net');
  });

  it('a serve the receiver cannot return is scored as an ace', () => {
    const r = new PickleballRules(court, {}, 0);
    const p = pointOf(serverWinsPoint(r))!;
    assert.equal(p.ace, true);
    assert.equal(p.reason, 'double_bounce');
  });
});

describe('two-bounce rule', () => {
  it('receiver volleying the serve is a fault', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    assert.equal(r.mustLetBounce(1), true);
    assert.equal(faultOf(r.hit(1, baselinePos(1)))?.reason, 'two_bounce_rule');
    assert.deepEqual(r.state.score, [1, 0]);
  });

  it('server volleying the return (third shot) is a fault', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    r.bounce(goodServeSpot(r));
    r.hit(1, baselinePos(1));
    assert.equal(r.mustLetBounce(0), true);
    const ev = r.hit(0, baselinePos(0));
    assert.equal(faultOf(ev)?.reason, 'two_bounce_rule');
    assert.equal(pointOf(ev)!.sideOut, true);
  });

  it('volleys are legal from the fourth shot on', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    r.bounce(goodServeSpot(r));
    r.hit(1, baselinePos(1));
    r.bounce(deepOn(0));
    r.hit(0, baselinePos(0));
    assert.equal(r.mustLetBounce(1), false);
    const ev = r.hit(1, v3(0, 0, -4)); // volley from outside the kitchen
    assert.equal(faultOf(ev), undefined);
    assert.equal(ev[0].type === 'hit' && ev[0].volley, true);
  });
});

describe('rally faults', () => {
  function rallyToShot4() {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    r.bounce(goodServeSpot(r));
    r.hit(1, baselinePos(1));
    r.bounce(deepOn(0));
    r.hit(0, baselinePos(0));
    return r;
  }

  it('volleying from inside the kitchen is a fault', () => {
    const r = rallyToShot4();
    const ev = r.hit(1, v3(0, 0, -court.nvzDepth + 0.1));
    assert.equal(faultOf(ev)?.reason, 'kitchen_volley');
    assert.deepEqual(r.state.score, [1, 0]); // server (side 0) scores
  });

  it('standing on the kitchen line counts as the kitchen', () => {
    const r = rallyToShot4();
    assert.equal(faultOf(r.hit(1, v3(0, 0, -court.nvzDepth)))?.reason, 'kitchen_volley');
  });

  it('hitting from the kitchen after a bounce is legal', () => {
    const r = rallyToShot4();
    r.bounce(v3(0, 0, -1));
    assert.equal(faultOf(r.hit(1, v3(0, 0, -1))), undefined);
  });

  it('ball out is a fault on the hitter; line ball is in', () => {
    const r = rallyToShot4();
    assert.equal(faultOf(r.bounce(v3(court.halfWidth, 0, -3))), undefined);
    const r2 = rallyToShot4();
    const ev = r2.bounce(v3(court.halfWidth + 0.05, 0, -3));
    assert.equal(faultOf(ev)?.reason, 'out');
    assert.equal(faultOf(ev)?.side, 0);
  });

  it('ball landing on the hitter side (into the net) is a fault on the hitter', () => {
    const r = rallyToShot4();
    assert.equal(faultOf(r.bounce(v3(0, 0, 1)))?.reason, 'net');
  });

  it('a second bounce is a fault on the receiving side', () => {
    const r = rallyToShot4();
    r.bounce(v3(0, 0, -3));
    const ev = r.bounce(v3(0, 0, -5));
    assert.equal(faultOf(ev)?.reason, 'double_bounce');
    assert.equal(faultOf(ev)?.side, 1);
  });

  it('the same side striking twice is a fault', () => {
    const r = rallyToShot4();
    assert.equal(faultOf(r.hit(0, v3(0, 0, 4)))?.reason, 'double_hit');
  });
});

describe('scoring', () => {
  it('only the serving side scores; receiver winning the rally is a side out', () => {
    const r = new PickleballRules(court, {}, 0);
    r.serve();
    r.bounce(v3(1, 0, -court.nvzDepth)); // serve fault
    assert.deepEqual(r.state.score, [0, 0]);
    assert.equal(r.state.server, 1);
  });

  it('game is to 11, win by 2', () => {
    const r = new PickleballRules(court, { pointsToWin: 11 }, 0);
    r.state.score = [10, 10];
    let ev = serverWinsPoint(r);
    assert.deepEqual(r.state.score, [11, 10]);
    assert.equal(r.state.phase, 'awaiting_serve');
    assert.equal(pointOf(ev)!.gamePoint, true); // 11-10, serving for the game
    ev = (() => {
      r.serve();
      r.bounce(goodServeSpot(r));
      return r.bounce(goodServeSpot(r));
    })();
    assert.deepEqual(r.state.score, [12, 10]);
    assert.equal(r.state.phase, 'game_over');
    assert.equal(r.state.winner, 0);
    assert.ok(ev.some((e) => e.type === 'game_over'));
  });

  it('flags a saved game point and a side out', () => {
    const r = new PickleballRules(court, { pointsToWin: 11 }, 0);
    r.state.score = [9, 3];
    const gp = pointOf(serverWinsPoint(r))!;
    assert.equal(gp.gamePoint, true);
    r.serve();
    const ev = r.bounce(v3(0.5, 0, 2)); // serve into own side: fault, side out
    const p = pointOf(ev)!;
    assert.equal(p.sideOut, true);
    assert.equal(p.savedGamePoint, true);
  });

  it('reports a comeback when the winner overcame a 4+ point deficit', () => {
    const r = new PickleballRules(court, { pointsToWin: 5 }, 1);
    // Side 1 serves first and loses rallies; side 0 builds a lead.
    r.state.score = [4, 0];
    r.state.maxDeficit = [0, 4];
    r.state.score = [4, 4];
    r.state.server = 1;
    serverWinsPoint(r);
    const ev = (() => {
      r.serve();
      r.bounce(goodServeSpot(r));
      return r.bounce(goodServeSpot(r));
    })();
    const over = ev.find((e) => e.type === 'game_over') as Extract<RuleEvent, { type: 'game_over' }>;
    assert.equal(over.winner, 1);
    assert.equal(over.comeback, true);
  });

  it('score call puts the server first', () => {
    const r = new PickleballRules(court, {}, 1);
    r.state.score = [3, 7];
    assert.equal(r.scoreCall(), '7-3');
  });
});
