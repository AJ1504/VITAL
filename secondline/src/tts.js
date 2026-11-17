'use strict';
// Natural voice through VoiceStudio (github.com/debpalash/VoiceStudio), a free,
// self-hosted voice server with an OpenAI-style POST /v1/audio/speech endpoint.
//
// We run VoiceStudio as its own service and only call it over HTTP. Every
// sentence is rendered once and cached on disk, so common lines ("Can I get your
// name?") cost nothing after the first call. If VoiceStudio is off, slow, or
// down, callers hear the standard phone voice instead. A call never waits on it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const inflight = new Map();

function config() {
  return {
    url: (process.env.VOICESTUDIO_URL || '').replace(/\/$/, ''),
    key: process.env.VOICESTUDIO_API_KEY || '',
    model: process.env.VOICESTUDIO_MODEL || 'omnivoice',
    voice: process.env.VOICESTUDIO_VOICE || 'default',
    speed: +process.env.VOICESTUDIO_SPEED || 1.0,
    format: process.env.VOICESTUDIO_FORMAT || 'mp3',
    dir: process.env.AUDIO_DIR || path.join(__dirname, '..', 'data', 'audio'),
    timeoutMs: +process.env.VOICESTUDIO_TIMEOUT_MS || 2500,
  };
}
function enabled() { return !!config().url; }

// "Got it. Let me check the book… I've got…" -> sentences, so each is cached alone.
function sentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
    .split(/(?<=[.?!…])\s+(?=[A-Z0-9"“'])/)
    .map((s) => s.trim()).filter(Boolean);
}

function keyFor(text, voice) {
  const c = config();
  return crypto.createHash('sha256').update([c.model, voice || c.voice, c.speed, c.format, text].join('\u0000')).digest('hex').slice(0, 32);
}

function fileFor(key) {
  const c = config();
  return path.join(c.dir, `${key}.${c.format}`);
}

// Phone-friendly text: no dashes or ellipses the voice might read literally.
function clean(text) {
  return text.replace(/\s—\s/g, ', ').replace(/—/g, ', ').replace(/…/g, '...').replace(/’/g, "'");
}

async function renderOne(text, voice, timeoutMs) {
  const c = config();
  const key = keyFor(text, voice);
  const file = fileFor(key);
  if (fs.existsSync(file)) return key;
  if (!inflight.has(key)) {
    const job = (async () => {
      const res = await fetch(`${c.url}/v1/audio/speech`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(c.key ? { Authorization: `Bearer ${c.key}` } : {}) },
        body: JSON.stringify({ model: c.model, input: clean(text), voice: voice || c.voice, response_format: c.format, speed: c.speed, language: 'en' }),
      });
      if (!res.ok) throw new Error(`VoiceStudio ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 200) throw new Error('VoiceStudio returned empty audio');
      fs.mkdirSync(c.dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, buf);
      fs.renameSync(tmp, file);
      return key;
    })().finally(() => inflight.delete(key));
    job.catch(() => {}); // a slow render still finishes and fills the cache
    inflight.set(key, job);
  }
  let timer;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), timeoutMs); });
  try { return await Promise.race([inflight.get(key), timeout]); } finally { clearTimeout(timer); }
}

// All sentences, or nothing (never mix two voices inside one reply).
// Returns an array of audio keys, or null to fall back to the standard voice.
async function speak(text, { voice, timeoutMs } = {}) {
  if (!enabled() || !text) return null;
  const parts = sentences(text);
  try {
    return await Promise.all(parts.map((s) => renderOne(s, voice, timeoutMs ?? config().timeoutMs)));
  } catch (e) {
    if (e.message !== 'timeout') console.error('[voice]', e.message);
    return null;
  }
}

// Render a business's fixed lines ahead of time so the first caller hears them instantly.
function prewarm(lines, voice) {
  if (!enabled()) return;
  (async () => {
    for (const line of lines) {
      for (const s of sentences(line)) {
        try { await renderOne(s, voice, 60000); } catch (e) { console.error('[voice] prewarm:', e.message); return; }
      }
    }
  })();
}

function audioPath(key) {
  if (!/^[a-f0-9]{32}$/.test(key)) return null;
  const f = fileFor(key);
  return fs.existsSync(f) ? f : null;
}

const MIME = { mp3: 'audio/mpeg', wav: 'audio/wav', opus: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac' };
function mime() { return MIME[config().format] || 'application/octet-stream'; }
function ext() { return config().format; }

module.exports = { enabled, speak, prewarm, sentences, audioPath, mime, ext, keyFor, config };
