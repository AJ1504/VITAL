'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A stand-in for VoiceStudio's POST /v1/audio/speech.
function fakeVoiceStudio({ delayMs = 0 } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(body), url: req.url });
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'audio/mpeg' }); res.end(Buffer.alloc(1000, 7)); }, delayMs);
    });
  });
  return new Promise((r) => server.listen(0, () => r({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

function freshTts(env) {
  for (const k of Object.keys(require.cache)) if (k.includes(`${path.sep}src${path.sep}`)) delete require.cache[k];
  Object.assign(process.env, env);
  return require('../src/tts');
}

test('renders each sentence through VoiceStudio once, then serves it from cache', async () => {
  const vs = await fakeVoiceStudio();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-audio-'));
  const tts = freshTts({ VOICESTUDIO_URL: vs.url, VOICESTUDIO_API_KEY: 'k', AUDIO_DIR: dir });
  try {
    const keys = await tts.speak('Got it — your sink is leaking. Can I get your name?');
    assert.equal(keys.length, 2);
    assert.equal(vs.seen.length, 2);
    assert.equal(vs.seen[0].url, '/v1/audio/speech');
    assert.equal(vs.seen[0].auth, 'Bearer k');
    assert.equal(vs.seen[0].body.input, 'Got it, your sink is leaking.');
    assert.ok(tts.audioPath(keys[1]));
    await tts.speak('Thanks, Dana. Can I get your name?');
    assert.equal(vs.seen.length, 3, 'the repeated sentence came from cache');
  } finally {
    vs.server.close();
    delete process.env.VOICESTUDIO_URL; delete process.env.VOICESTUDIO_API_KEY; delete process.env.AUDIO_DIR;
  }
});

test('slow or missing voice falls back to the standard phone voice', async () => {
  const vs = await fakeVoiceStudio({ delayMs: 300 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-audio-'));
  const tts = freshTts({ VOICESTUDIO_URL: vs.url, AUDIO_DIR: dir });
  try {
    assert.equal(await tts.speak('Hello there.', { timeoutMs: 50 }), null);
    const twilio = require('../src/twilio');
    assert.match(twilio.twiml.ask('Hello there.', 'https://x/t', null), /<Say voice=/);
    assert.match(twilio.twiml.ask('Hello there.', 'https://x/t', ['https://x/audio/a.mp3']), /<Play>https:\/\/x\/audio\/a.mp3<\/Play>/);
  } finally {
    vs.server.close();
    delete process.env.VOICESTUDIO_URL; delete process.env.AUDIO_DIR;
  }
});

test('phone calls play the natural voice when VoiceStudio is up', async () => {
  const vs = await fakeVoiceStudio();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-audio-'));
  freshTts({ VOICESTUDIO_URL: vs.url, AUDIO_DIR: dir });
  const { createApp } = require('../src/server');
  const { Store } = require('../src/store');
  const store = new Store(null);
  const app = createApp({ store, notify: { urgent: async () => {}, wrapUp: async () => {}, send: async () => {} }, summarize: async () => null });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  try {
    store.addBusiness({ name: 'Oak Plumbing', ownerName: 'Mike', ownerPhone: '5558675309', trade: 'plumbing', services: [], timezone: 'America/New_York', status: 'pilot', lineNumber: '5550001111' });
    const xml = await (await fetch(base + '/voice/incoming', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'To=%2B15550001111&From=%2B15552014321&CallSid=CA1' })).text();
    const urls = [...xml.matchAll(/<Play>([^<]+)<\/Play>/g)].map((m) => m[1]);
    assert.ok(urls.length >= 1, xml);
    const audio = await fetch(urls[0].replace(/^https?:\/\/[^/]+/, base));
    assert.equal(audio.status, 200);
    assert.equal(audio.headers.get('content-type'), 'audio/mpeg');
  } finally {
    await new Promise((r) => app.server.close(r));
    vs.server.close();
    delete process.env.VOICESTUDIO_URL; delete process.env.AUDIO_DIR;
  }
});
