'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { Store } = require('../src/store');

async function start() {
  const store = new Store(null);
  const texts = [];
  const notify = {
    urgent: async (biz, call) => texts.push({ kind: 'urgent', to: biz.ownerPhone }),
    wrapUp: async (biz, call) => { if (call.alerts.summary) return; call.alerts.summary = true; texts.push({ kind: 'summary', to: biz.ownerPhone, outcome: call.data.outcome }); if (!['booked', 'urgent', 'callback'].includes(call.data.outcome)) { texts.push({ kind: 'textback', to: call.callerPhone }); call.textedBack = true; } },
    send: async (biz, to, body, kind) => texts.push({ kind, to, body }),
  };
  const app = createApp({ store, notify, summarize: async () => null });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = async (path, body, form = false) => {
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' }, body: form ? new URLSearchParams(body).toString() : JSON.stringify(body) });
    const text = await res.text();
    try { return { status: res.status, body: JSON.parse(text) }; } catch { return { status: res.status, body: text }; }
  };
  return { app, store, texts, base, post, stop: () => new Promise((r) => app.server.close(r)) };
}

const SETUP = { name: 'Oak Street Plumbing', trade: 'plumbing', ownerName: 'Mike', ownerPhone: '(555) 867-5309', timezone: 'America/New_York' };

test('pages load with plain-language copy (no tech words)', async () => {
  const t = await start();
  try {
    for (const p of ['/', '/start', '/login']) {
      const res = await fetch(t.base + p);
      assert.equal(res.status, 200, p);
      const html = (await res.text()).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
      assert.doesNotMatch(html, /\b(AI|API|webhook|TwiML|latency|LLM|agent)\b/, p);
    }
  } finally { await t.stop(); }
});

test('browser demo works with no signup', async () => {
  const t = await start();
  try {
    const s = await t.post('/api/demo/start', { trade: 'hvac' });
    assert.match(s.body.say, /Northside Heating & Air/);
    const r = await t.post('/api/demo/say', { session: s.body.session, text: "We've got no heat" });
    assert.match(r.body.say, /urgent/);
    assert.equal(t.texts.length, 0, 'demo never texts anyone');
  } finally { await t.stop(); }
});

test('setup → test call → go live → dashboard', async () => {
  const t = await start();
  try {
    const bad = await t.post('/api/setup', { ...SETUP, ownerPhone: '123' });
    assert.equal(bad.status, 400);
    const r = await t.post('/api/setup', SETUP);
    const token = r.body.token;
    assert.ok(token);
    const s = await t.post(`/api/biz/${token}/test-start`, {});
    for (const line of ['leaking faucet', 'book me', 'Dana', '42 Elm St', '5552014321']) await t.post(`/api/biz/${token}/test-say`, { session: s.body.session, text: line });
    const done = await t.post(`/api/biz/${token}/test-say`, { session: s.body.session, text: 'first' });
    assert.ok(done.body.booking, 'test booking lands');
    assert.match(done.body.ownerText, /Booked: Dana/);
    const live = await t.post(`/api/biz/${token}/golive`, {});
    assert.equal(live.body.next, `/app/${token}/live`);
    const dash = await fetch(`${t.base}/app/${token}`);
    assert.equal(dash.status, 200);
    assert.match(await dash.text(), /Free pilot — day 1 of 7/);
    const ics = await (await fetch(`${t.base}/cal/${t.store.businessByToken(token).calToken}.ics`)).text();
    assert.doesNotMatch(ics, /VEVENT/, 'test bookings stay out of the real calendar');
  } finally { await t.stop(); }
});

test('a real phone call is answered, booked, and summarized to the owner', async () => {
  const t = await start();
  try {
    const { body } = await t.post('/api/setup', SETUP);
    const biz = t.store.businessByToken(body.token);
    t.store.updateBusiness(biz.id, { status: 'pilot', lineNumber: '5550001111' });
    const xml = (await t.post('/voice/incoming', { To: '+15550001111', From: '+15552014321', CallSid: 'CA1' }, true)).body;
    assert.match(xml, /<Gather input="speech"/);
    assert.match(xml, /Oak Street Plumbing's office, Jamie speaking/);
    const turnUrl = xml.match(/action="([^"]+)"/)[1].replace(/&amp;/g, '&');
    const path = new URL(turnUrl).pathname + new URL(turnUrl).search;
    for (const s of ['toilet keeps running', 'book me in', 'Carla Diaz', '18 Birch Lane', 'yes', 'first one']) await t.post(path, { SpeechResult: s }, true);
    const bye = (await t.post(path, { SpeechResult: 'no thanks' }, true)).body;
    assert.match(bye, /<Hangup\/>/);
    await new Promise((r) => setTimeout(r, 20));
    const summary = t.texts.find((x) => x.kind === 'summary');
    assert.equal(summary.outcome, 'booked');
    assert.equal(summary.to, '5558675309');
    await t.post('/voice/status', { CallSid: 'CA1', CallStatus: 'completed', To: '+15550001111' }, true);
    assert.equal(t.texts.filter((x) => x.kind === 'summary').length, 1, 'one summary per call');
  } finally { await t.stop(); }
});

test('a hang-up with nothing said gets a text-back', async () => {
  const t = await start();
  try {
    const { body } = await t.post('/api/setup', SETUP);
    const biz = t.store.businessByToken(body.token);
    t.store.updateBusiness(biz.id, { status: 'pilot', lineNumber: '5550001111' });
    await t.post('/voice/status', { CallSid: 'CA9', CallStatus: 'completed', To: '+15550001111', From: '+15557776666' }, true);
    assert.ok(t.texts.find((x) => x.kind === 'textback' && x.to === '5557776666'));
  } finally { await t.stop(); }
});

test('pause is reversible, and paused lines take voicemail', async () => {
  const t = await start();
  try {
    const { body } = await t.post('/api/setup', SETUP);
    const biz = t.store.businessByToken(body.token);
    t.store.updateBusiness(biz.id, { status: 'pilot', lineNumber: '5550001111' });
    await t.post(`/api/biz/${body.token}/pause`, {});
    assert.match((await t.post('/voice/incoming', { To: '+15550001111', From: '+15552014321', CallSid: 'CA2' }, true)).body, /<Record/);
    await t.post(`/api/biz/${body.token}/resume`, {});
    assert.equal(biz.status, 'pilot');
    // owner can also pause by text
    const reply = (await t.post('/sms/incoming', { To: '+15550001111', From: '+15558675309', Body: 'PAUSE' }, true)).body;
    assert.match(reply, /Paused/);
    await t.post('/sms/incoming', { To: '+15550001111', From: '+15558675309', Body: 'on' }, true);
    assert.equal(biz.status, 'pilot');
    // cancel and come back
    await t.post(`/api/biz/${body.token}/cancel`, {});
    assert.equal(biz.status, 'cancelled');
    await t.post(`/api/biz/${body.token}/reactivate`, {});
    assert.equal(biz.status, 'pilot');
  } finally { await t.stop(); }
});

test('settings edits return the previous value for undo', async () => {
  const t = await start();
  try {
    const { body } = await t.post('/api/setup', SETUP);
    const r = await t.post(`/api/biz/${body.token}/update`, { name: 'Oak St Plumbing & Drain' });
    assert.equal(r.body.previous.name, 'Oak Street Plumbing');
    const bad = await t.post(`/api/biz/${body.token}/update`, { ownerPhone: '12' });
    assert.equal(bad.status, 400);
  } finally { await t.stop(); }
});

test('unknown links and bad tokens are 404s', async () => {
  const t = await start();
  try {
    assert.equal((await fetch(`${t.base}/app/nope`)).status, 404);
    assert.equal((await t.post('/api/biz/nope/pause', {})).status, 404);
    assert.equal((await fetch(`${t.base}/public/../src/server.js`)).status, 404);
  } finally { await t.stop(); }
});
