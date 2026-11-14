// Pickleball singles rules engine (traditional side-out scoring).
//
// Implemented:
//  - Only the serving side scores; games to N (default 11), win by 2.
//  - Server serves from the right court when their score is even, left when odd; diagonal serve.
//  - Serve must clear the net and land in the diagonal service court beyond the NVZ
//    (kitchen line = fault; centre line, sideline and baseline = in). Net-touching serves that land in are live.
//  - Two-bounce rule: return of serve and the third shot must each bounce before being struck.
//  - No volleying while standing in the non-volley zone (kitchen line counts as kitchen).
//  - Ball must clear the net and land in bounds (lines in); a second bounce ends the rally.
//
// Not yet implemented (tracked in docs/FEATURE_STATUS.md): doubles server rotation, momentum rule
// after volleys near the kitchen, foot faults on serve, ball hitting a player's body.
//
// The engine is driven purely by events (hit, bounce) so it can sit behind any physics backend
// (the TS harness, the Unreal C++ port, or an authoritative server).

import { type Court, type Side, inCourt, inKitchen, inServiceBox, otherSide, sideOfPoint, sideSign } from '../court.ts';
import type { Vec3 } from '../vec.ts';

export type FaultReason =
  | 'serve_into_net'
  | 'serve_in_kitchen'
  | 'serve_wrong_court'
  | 'serve_out'
  | 'net'
  | 'out'
  | 'double_bounce'
  | 'two_bounce_rule'
  | 'kitchen_volley'
  | 'double_hit';

export type RallyPhase = 'awaiting_serve' | 'in_play' | 'point_over' | 'game_over';

export interface RulesConfig {
  pointsToWin: number;
  winBy: number;
}

export interface RulesState {
  phase: RallyPhase;
  server: Side;
  score: [number, number];
  /** Number of strokes in the current rally (serve = 1). */
  hitCount: number;
  lastHitter: Side | null;
  /** Bounces since the most recent stroke. */
  bouncesSinceHit: number;
  winner: Side | null;
  /** Largest deficit each side has overcome in this game (for comeback commentary). */
  maxDeficit: [number, number];
  pointsPlayed: number;
}

export type RuleEvent =
  | { type: 'serve'; server: Side; fromRight: boolean }
  | { type: 'hit'; side: Side; hitCount: number; volley: boolean }
  | { type: 'bounce'; side: Side; p: Vec3; inBounds: boolean }
  | { type: 'fault'; side: Side; reason: FaultReason }
  | {
      type: 'point';
      /** Side that won the rally. */
      rallyWinner: Side;
      /** True if the rally winner was serving (a point was scored). */
      scored: boolean;
      sideOut: boolean;
      reason: FaultReason;
      rallyLength: number;
      score: [number, number];
      server: Side;
      /** The rally was decided on the serve or the return failed (an ace). */
      ace: boolean;
      /** The next serve is a game point for the server. */
      gamePoint: boolean;
      /** The rally winner had just saved a game point against them. */
      savedGamePoint: boolean;
    }
  | { type: 'game_over'; winner: Side; score: [number, number]; comeback: boolean };

export class PickleballRules {
  readonly court: Court;
  readonly config: RulesConfig;
  state: RulesState;
  private gamePointAgainst: Side | null = null;

  constructor(court: Court, config: Partial<RulesConfig> = {}, firstServer: Side = 0) {
    this.court = court;
    this.config = { pointsToWin: config.pointsToWin ?? 11, winBy: config.winBy ?? 2 };
    this.state = {
      phase: 'awaiting_serve',
      server: firstServer,
      score: [0, 0],
      hitCount: 0,
      lastHitter: null,
      bouncesSinceHit: 0,
      winner: null,
      maxDeficit: [0, 0],
      pointsPlayed: 0,
    };
  }

  get receiver(): Side {
    return otherSide(this.state.server);
  }

  /** Server stands in their right-hand court when their score is even. */
  serverOnRight(): boolean {
    return this.state.score[this.state.server] % 2 === 0;
  }

  /**
   * x-sign of the server's court. Facing the net, side 0 (looking toward -z) has its right at +x;
   * side 1 (looking toward +z) has its right at -x.
   */
  serverCourtXSign(): 1 | -1 {
    const right: 1 | -1 = this.state.server === 0 ? 1 : -1;
    return this.serverOnRight() ? right : (-right as 1 | -1);
  }

  /** x-sign of the diagonal service court the serve must land in. */
  targetCourtXSign(): 1 | -1 {
    return -this.serverCourtXSign() as 1 | -1;
  }

  /** Suggested serving position (feet) for the current point. */
  serverPosition(): Vec3 {
    const s = sideSign(this.state.server);
    return { x: this.serverCourtXSign() * this.court.halfWidth * 0.45, y: 0, z: s * (this.court.halfLength + 0.35) };
  }

  receiverPosition(): Vec3 {
    const s = sideSign(this.receiver);
    return { x: this.targetCourtXSign() * this.court.halfWidth * 0.45, y: 0, z: s * (this.court.halfLength - 0.2) };
  }

  /** Whether `side` must let the ball bounce before striking it (two-bounce rule). */
  mustLetBounce(side: Side): boolean {
    const s = this.state;
    if (s.phase !== 'in_play') return false;
    // Stroke #2 is the return (receiver), stroke #3 the server's third shot.
    const nextStroke = s.hitCount + 1;
    return (nextStroke === 2 || nextStroke === 3) && side !== s.lastHitter;
  }

  isGamePointFor(side: Side): boolean {
    const me = this.state.score[side];
    const them = this.state.score[otherSide(side)];
    return me + 1 >= this.config.pointsToWin && me + 1 - them >= this.config.winBy;
  }

  /** Serve struck by the server. */
  serve(): RuleEvent[] {
    const s = this.state;
    if (s.phase !== 'awaiting_serve') return [];
    s.phase = 'in_play';
    s.hitCount = 1;
    s.lastHitter = s.server;
    s.bouncesSinceHit = 0;
    return [{ type: 'serve', server: s.server, fromRight: this.serverOnRight() }];
  }

  /**
   * A player on `side` struck the ball. `playerPos` is the player's feet, used for the NVZ volley rule.
   */
  hit(side: Side, playerPos: Vec3): RuleEvent[] {
    const s = this.state;
    if (s.phase !== 'in_play') return [];
    if (s.lastHitter === side) return this.fault(side, 'double_hit');
    const volley = s.bouncesSinceHit === 0;
    if (volley && this.mustLetBounce(side)) return this.fault(side, 'two_bounce_rule');
    if (volley && inKitchen(this.court, playerPos)) return this.fault(side, 'kitchen_volley');
    s.hitCount++;
    s.lastHitter = side;
    s.bouncesSinceHit = 0;
    return [{ type: 'hit', side, hitCount: s.hitCount, volley }];
  }

  /** The ball touched the ground at p. */
  bounce(p: Vec3): RuleEvent[] {
    const s = this.state;
    if (s.phase !== 'in_play' || s.lastHitter === null) return [];
    const landedSide = sideOfPoint(p);
    const hitter = s.lastHitter;
    const isServe = s.hitCount === 1;
    s.bouncesSinceHit++;

    if (s.bouncesSinceHit === 1) {
      let inBounds: boolean;
      if (isServe) inBounds = inServiceBox(this.court, p, this.receiver, this.targetCourtXSign());
      else inBounds = inCourt(this.court, p);
      const ev: RuleEvent = { type: 'bounce', side: landedSide, p: { ...p }, inBounds };
      if (landedSide === hitter) {
        return [ev, ...this.fault(hitter, isServe ? 'serve_into_net' : 'net')];
      }
      if (!inBounds) {
        let reason: FaultReason = 'out';
        if (isServe) {
          if (inKitchen(this.court, p) && Math.abs(p.x) <= this.court.halfWidth) reason = 'serve_in_kitchen';
          else if (p.x * this.targetCourtXSign() < 0 && inCourt(this.court, p)) reason = 'serve_wrong_court';
          else reason = 'serve_out';
        }
        return [ev, ...this.fault(hitter, reason)];
      }
      return [ev];
    }
    // Second bounce before the receiving side returned it.
    const ev: RuleEvent = { type: 'bounce', side: landedSide, p: { ...p }, inBounds: inCourt(this.court, p) };
    return [ev, ...this.fault(otherSide(hitter), 'double_bounce')];
  }

  /** Advance from point_over to the next serve. */
  nextPoint(): void {
    if (this.state.phase !== 'point_over') return;
    const s = this.state;
    s.phase = 'awaiting_serve';
    s.hitCount = 0;
    s.lastHitter = null;
    s.bouncesSinceHit = 0;
  }

  private fault(side: Side, reason: FaultReason): RuleEvent[] {
    const s = this.state;
    const rallyWinner = otherSide(side);
    const serverBefore = s.server;
    const scored = rallyWinner === s.server;
    const rallyLength = s.hitCount;
    const savedGamePoint = this.gamePointAgainst !== null && this.gamePointAgainst === rallyWinner;
    if (scored) s.score[rallyWinner]++;
    else s.server = rallyWinner; // side out
    s.pointsPlayed++;
    for (const side of [0, 1] as Side[]) {
      const deficit = s.score[otherSide(side)] - s.score[side];
      if (deficit > s.maxDeficit[side]) s.maxDeficit[side] = deficit;
    }
    const events: RuleEvent[] = [{ type: 'fault', side, reason }];

    const winner = this.checkWinner();
    const gamePoint = winner === null && this.isGamePointFor(s.server);
    this.gamePointAgainst = gamePoint ? otherSide(s.server) : null;
    events.push({
      type: 'point',
      rallyWinner,
      scored,
      sideOut: !scored,
      reason,
      rallyLength,
      score: [s.score[0], s.score[1]],
      server: serverBefore,
      ace: rallyLength === 1 && rallyWinner === serverBefore && reason !== 'double_hit',
      gamePoint,
      savedGamePoint,
    });
    if (winner !== null) {
      s.phase = 'game_over';
      s.winner = winner;
      events.push({
        type: 'game_over',
        winner,
        score: [s.score[0], s.score[1]],
        comeback: s.maxDeficit[winner] >= 4,
      });
    } else {
      s.phase = 'point_over';
    }
    return events;
  }

  private checkWinner(): Side | null {
    const [a, b] = this.state.score;
    const { pointsToWin, winBy } = this.config;
    if (a >= pointsToWin && a - b >= winBy) return 0;
    if (b >= pointsToWin && b - a >= winBy) return 1;
    return null;
  }

  /** Conventional singles score call: server score first. */
  scoreCall(): string {
    const s = this.state;
    return `${s.score[s.server]}-${s.score[otherSide(s.server)]}`;
  }
}
