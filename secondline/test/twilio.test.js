'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const twilio = require('../src/twilio');

test('validates Twilio request signatures', () => {
  process.env.TWILIO_AUTH_TOKEN = 'secret';
  const url = 'https://example.com/voice/incoming';
  const params = { To: '+15550001111', From: '+15552014321' };
  const sig = crypto.createHmac('sha1', 'secret').update(url + 'From+15552014321To+15550001111').digest('base64');
  assert.equal(twilio.validSignature(url, params, sig), true);
  assert.equal(twilio.validSignature(url, params, 'nope'), false);
  delete process.env.TWILIO_AUTH_TOKEN;
});

test('call XML escapes what callers say', () => {
  const x = twilio.twiml.ask('Got it — <b>& "stuff"', 'https://x/voice/turn?call=1&a=2');
  assert.match(x, /&lt;b&gt;&amp; &quot;stuff&quot;/);
  assert.match(x, /call=1&amp;a=2/);
});
