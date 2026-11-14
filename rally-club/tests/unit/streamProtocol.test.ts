import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { STREAM_PROTOCOL_VERSION, type StreamInputMessage, parseStreamMessage, shouldSendInput } from '../../shared/src/streamProtocol.ts';

const msg = (over: Partial<StreamInputMessage> = {}): StreamInputMessage => ({ type: 'rally.input', v: STREAM_PROTOCOL_VERSION, seq: 1, t: 0, moveX: 0, moveZ: 0, swing: null, ...over });

describe('Pixel Streaming protocol', () => {
  it('always sends the first input and every swing', () => {
    assert.equal(shouldSendInput(null, { moveX: 0, moveZ: 0, swing: null }, 0), true);
    assert.equal(shouldSendInput(msg(), { moveX: 0, moveZ: 0, swing: { shot: 'drive', aim: 0 } }, 1), true);
  });
  it('sends on meaningful movement change, otherwise only as a 10 Hz keep-alive', () => {
    assert.equal(shouldSendInput(msg(), { moveX: 0.01, moveZ: 0, swing: null }, 16), false);
    assert.equal(shouldSendInput(msg(), { moveX: 0.5, moveZ: 0, swing: null }, 16), true);
    assert.equal(shouldSendInput(msg(), { moveX: 0, moveZ: 0, swing: null }, 100), true);
  });
  it('parses Unreal responses and ignores anything else', () => {
    const s = parseStreamMessage(JSON.stringify({ type: 'rally.state', names: ['You', 'Rafa'], score: [3, 1], server: 0, call: 'Call 3-1', rally: 4, gameOver: false, winner: -1, ackSeq: 9 }));
    assert.ok(s && s.type === 'rally.state' && s.score[0] === 3);
    assert.equal(parseStreamMessage('{"type":"other"}'), null);
    assert.equal(parseStreamMessage('not json'), null);
  });
});
