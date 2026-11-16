'use strict';
// SecondLine web server: landing page, setup, owner dashboard, and the phone
// line itself (calls + texts from Twilio). Plain Node — no framework.

const http = require('http');
const fs = require('fs');
const path = require('path');

const { Store, digits } = require('./store');
const brain = require('./brain');
const cal = require('./calendar');
const ai = require('./ai');
const twilio = require('./twilio');
const { TRADES } = require('./trades');
const { createNotifier, ownerSummaryText, callerConfirmation } = require('./notify');
const views = require('./views');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
const PILOT_DAYS = 7;
const EDITABLE = ['name', 'ownerName', 'ownerPhone', 'trade', 'services', 'hours', 'agentName', 'greeting', 'timezone', 'jobValue', 'callbackMinutes'];

function createApp(opts = {}) {
  const store = opts.store || new Store(process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'));
  let lastBase = process.env.PUBLIC_URL || '';
  const baseUrl = () => (process.env.PUBLIC_URL || lastBase).replace(/\/$/, '');
  const notify = opts.notify || createNotifier({ store, baseUrl });
  const summarize = opts.summarize || ai.summarize;
  const demoSessions = new Map();
  const hits = new Map();

  ensureDemoBusiness(store);

  function deps(biz, call) {
    return {
      bookings: () => store.bookings(biz.id).filter((b) => !b.test || call.channel === 'test' || call.channel === 'demo'),
      addBooking: (b) => (call.channel === 'demo' ? Object.assign({ id: 'demo' }, b) : store.addBooking(b)),
      onUrgent: (c) => (c.channel === 'voice' || c.channel === 'sms') && !biz.demo ? notify.urgent(biz, c) : null,
      summarize,
    };
  }

  async function finalize(biz, call) {
    if (!call.endedAt) call.endedAt = new Date().toISOString();
    if (!call.data.outcome) call.data.outcome = brain.isMeaningful(call) ? 'incomplete' : 'missed';
    store.putCall(call);
    if (biz.demo) {
      // The phone demo texts the prospect the exact summary an owner would get.
      const to = call.callerPhone;
      if (to && !call.alerts.summary) {
        call.alerts.summary = true;
        await notify.send(biz, to, `Here's the text the owner gets after a call like yours:\n\n${ownerSummaryText(biz, call, '')}\n\nWant this for your shop? ${baseUrl()}/start`, 'demo');
      }
    } else {
      await notify.wrapUp(biz, call);
    }
    store.putCall(call);
  }

  // Safety net: if Twilio never tells us a call ended, wrap it up anyway.
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - 3 * 60000;
    for (const c of Object.values(store.data.calls)) {
      if (c.endedAt || (c.channel !== 'voice' && c.channel !== 'sms')) continue;
      const last = c.transcript.length ? new Date(c.transcript[c.transcript.length - 1].at).getTime() : new Date(c.startedAt).getTime();
      const limit = c.channel === 'sms' ? Date.now() - 6 * 3600000 : cutoff;
      if (last < limit) { const biz = store.business(c.businessId); if (biz) finalize(biz, c).catch(console.error); }
    }
    for (const [k, v] of demoSessions) if (Date.now() - v.touched > 30 * 60000) demoSessions.delete(k);
    // End of the free week: one text with their own numbers, then they decide.
    for (const biz of Object.values(store.data.businesses)) {
      const pi = pilotInfo(biz);
      if (biz.status !== 'pilot' || !pi || !pi.over || biz.pilotEndTextAt || !biz.ownerPhone) continue;
      store.updateBusiness(biz.id, { pilotEndTextAt: new Date().toISOString() });
      const st = stats(store, biz);
      notify.send(biz, biz.ownerPhone, `Your free week with SecondLine is done: ${st.answered} calls answered, ${st.jobs} new jobs (about ${'$' + st.saved.toLocaleString('en-US')} of work). Want to keep it? $200 setup + $300/month, cancel anytime. Tap here: ${baseUrl()}/app/${biz.token}`, 'pilot-end').catch(console.error);
    }
  }, 60000);
  sweeper.unref();

  function limited(req, max = 120) {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const now = Date.now();
    const h = hits.get(ip) || { n: 0, t: now };
    if (now - h.t > 60000) { h.n = 0; h.t = now; }
    h.n++; hits.set(ip, h);
    return h.n > max;
  }

  // ---------- conversation helpers shared by demo + test ----------
  async function chatStart(biz, channel) {
    const { call, say } = brain.newCall(biz, { channel });
    const key = call.id;
    demoSessions.set(key, { call, biz, touched: Date.now() });
    if (channel === 'test') store.putCall(call);
    return { session: key, say };
  }
  async function chatSay(sessionKey, text, bizCheck) {
    const s = demoSessions.get(sessionKey);
    if (!s || (bizCheck && s.biz.id !== bizCheck.id)) return null;
    s.touched = Date.now();
    const biz = bizCheck || s.biz;
    const r = await brain.respond(biz, s.call, String(text || '').slice(0, 400), deps(biz, s.call));
    const out = { say: r.say, end: r.end };
    if (r.end) {
      s.call.endedAt = new Date().toISOString();
      if (s.call.channel === 'test') store.putCall(s.call);
    }
    if (r.end || ['urgent', 'booked', 'callback'].includes(s.call.data.outcome) && s.call.step === 'anything') {
      out.ownerText = ownerSummaryText(biz, s.call, '');
      if (s.call.data.slot) {
        const st = new Date(s.call.data.slot.start);
        out.booking = { mon: new Intl.DateTimeFormat('en-US', { timeZone: biz.timezone, month: 'short' }).format(st).toUpperCase(), day: cal.zonedParts(st, biz.timezone).d, when: cal.shortSlot(s.call.data.slot, biz.timezone), name: s.call.data.name, address: s.call.data.address, need: s.call.data.need };
        out.callerText = callerConfirmation(biz, s.call);
      }
      out.outcome = s.call.data.outcome;
    }
    if (s.call.channel === 'test' && !r.end) store.putCall(s.call);
    return out;
  }

  // ---------- routes ----------
  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (!process.env.PUBLIC_URL && req.headers.host) {
      const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0];
      lastBase = `${proto}://${req.headers.host}`;
    }
    const m = req.method;

    if (m === 'GET' && p.startsWith('/public/')) return serveStatic(res, p.slice(8));
    if (m === 'GET' && p === '/health') return send(res, 200, 'ok', 'text/plain');
    if (m === 'GET' && p === '/') return html(res, views.landing({ demoNumber: process.env.DEMO_NUMBER || '' }));
    if (m === 'GET' && p === '/start') return html(res, views.setup({ trades: TRADES }));
    if (m === 'GET' && p === '/login') return html(res, views.login());

    // --- browser demo (no signup) ---
    if (m === 'POST' && p === '/api/demo/start') {
      if (limited(req, 30)) return json(res, 429, { error: 'Slow down a little and try again in a minute.' });
      const body = await readBody(req);
      const trade = TRADES[body.trade] ? body.trade : 'plumbing';
      return json(res, 200, await chatStart(demoBiz(store, trade), 'demo'));
    }
    if (m === 'POST' && p === '/api/demo/say') {
      if (limited(req)) return json(res, 429, { error: 'Slow down a little and try again in a minute.' });
      const body = await readBody(req);
      const s = demoSessions.get(body.session);
      if (!s || s.call.channel !== 'demo') return json(res, 404, { error: 'That demo ended. Start a new one.' });
      return json(res, 200, await chatSay(body.session, body.text));
    }

    // --- setup ---
    if (m === 'POST' && p === '/api/setup') {
      if (limited(req, 20)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      const body = await readBody(req);
      const err = validateSetup(body);
      if (err) return json(res, 400, { error: err });
      const trade = TRADES[body.trade] ? body.trade : 'other';
      const biz = store.addBusiness({
        name: clean(body.name, 60), ownerName: clean(body.ownerName, 40), ownerPhone: digits(body.ownerPhone),
        trade, services: cleanList(body.services, TRADES[trade].services), hours: cleanHours(body.hours),
        agentName: clean(body.agentName, 20) || 'Jamie', greeting: clean(body.greeting, 200),
        timezone: validTz(body.timezone), jobValue: TRADES[trade].jobValue, callbackMinutes: 60,
        status: 'setup', lineNumber: null,
      });
      return json(res, 200, { token: biz.token, greeting: brain.greeting(biz) });
    }

    // --- login by text ---
    if (m === 'POST' && p === '/api/login') {
      if (limited(req, 10)) return json(res, 429, { error: 'Too many tries. Wait a minute.' });
      const body = await readBody(req);
      for (const biz of store.businessesByOwnerPhone(body.phone)) {
        await notify.send(biz, biz.ownerPhone, `Here's your SecondLine link for ${biz.name}: ${baseUrl()}/app/${biz.token}`, 'login');
      }
      return json(res, 200, { ok: true });
    }

    // --- owner area (the private link is the key) ---
    let mm;
    if ((mm = p.match(/^\/app\/([\w-]+)(\/settings|\/live)?$/)) && m === 'GET') {
      const biz = store.businessByToken(mm[1]);
      if (!biz) return html(res, views.notFound(), 404);
      if (mm[2] === '/settings') return html(res, views.settings({ biz, trades: TRADES, calUrl: calUrl(biz) }));
      if (mm[2] === '/live') return html(res, views.goLive({ biz, calUrl: calUrl(biz) }));
      if (biz.status === 'setup') return redirect(res, `/start?resume=${encodeURIComponent(biz.token)}`);
      return html(res, views.dashboard({ biz, stats: stats(store, biz), calls: store.callsFor(biz.id).slice(0, 50), upcoming: upcoming(store, biz), pilot: pilotInfo(biz), calUrl: calUrl(biz) }));
    }
    if ((mm = p.match(/^\/api\/biz\/([\w-]+)\/([\w-]+)(?:\/([\w-]+))?$/)) && m === 'POST') {
      const biz = store.businessByToken(mm[1]);
      if (!biz) return json(res, 404, { error: 'Link not found.' });
      if (limited(req, 120)) return json(res, 429, { error: 'Slow down a little.' });
      const body = await readBody(req);
      const action = mm[2];
      switch (action) {
        case 'test-start': return json(res, 200, await chatStart(biz, 'test'));
        case 'test-say': {
          const r = await chatSay(body.session, body.text, biz);
          return r ? json(res, 200, r) : json(res, 404, { error: 'That test call ended. Start another.' });
        }
        case 'golive': {
          const patch = { status: biz.status === 'setup' ? 'pilot' : biz.status };
          if (!biz.pilotStartedAt) patch.pilotStartedAt = new Date().toISOString();
          if (!biz.lineNumber) {
            try {
              patch.lineNumber = takeFromPool(store) || await twilio.provisionNumber({ areaCode: digits(biz.ownerPhone).slice(0, 3), baseUrl: baseUrl() });
            } catch (e) { console.error('[number] could not get a number:', e.message); }
          }
          store.updateBusiness(biz.id, patch);
          if (biz.ownerPhone) {
            await notify.send(biz, biz.ownerPhone, `Your second line for ${biz.name} is ready${biz.lineNumber ? ` — ${brain.formatPhone(biz.lineNumber)}` : ''}. Save this link, it's your dashboard: ${baseUrl()}/app/${biz.token}`, 'welcome');
          }
          alertAdmin(`New pilot: ${biz.name} (${brain.formatPhone(biz.ownerPhone)}) — number: ${biz.lineNumber || 'NEEDS ONE'}`);
          return json(res, 200, { ok: true, lineNumber: biz.lineNumber, next: `/app/${biz.token}/live` });
        }
        case 'pause': store.updateBusiness(biz.id, { status: 'paused', pausedFrom: biz.status }); return json(res, 200, { status: 'paused' });
        case 'resume': store.updateBusiness(biz.id, { status: biz.pausedFrom && biz.pausedFrom !== 'paused' ? biz.pausedFrom : 'pilot' }); return json(res, 200, { status: biz.status });
        case 'cancel':
          store.updateBusiness(biz.id, { status: 'cancelled', cancelledFrom: biz.status, cancelledAt: new Date().toISOString() });
          alertAdmin(`Cancelled: ${biz.name}. (No charge going forward.)`);
          return json(res, 200, { status: 'cancelled' });
        case 'reactivate':
          store.updateBusiness(biz.id, { status: biz.cancelledFrom && !['cancelled', 'setup'].includes(biz.cancelledFrom) ? biz.cancelledFrom : 'pilot', cancelledAt: null });
          return json(res, 200, { status: biz.status });
        case 'keep':
          store.updateBusiness(biz.id, { keepRequestedAt: new Date().toISOString() });
          alertAdmin(`${biz.name} wants to keep SecondLine after the pilot. Send them the $200 + $300/mo payment link.`);
          return json(res, 200, { ok: true });
        case 'update': {
          const patch = {};
          for (const k of EDITABLE) if (k in body) patch[k] = body[k];
          const err = validatePatch(patch);
          if (err) return json(res, 400, { error: err });
          const prev = {};
          for (const k of Object.keys(patch)) prev[k] = biz[k] ?? null;
          store.updateBusiness(biz.id, normalizePatch(patch));
          return json(res, 200, { ok: true, previous: prev, greeting: brain.greeting(biz) });
        }
        case 'call-done': {
          const c = store.call(mm[3]);
          if (!c || c.businessId !== biz.id) return json(res, 404, { error: 'Call not found.' });
          c.handled = !c.handled;
          store.putCall(c);
          return json(res, 200, { handled: c.handled });
        }
        default: return json(res, 404, { error: 'Unknown action.' });
      }
    }

    // --- calendar feed ---
    if ((mm = p.match(/^\/cal\/([\w-]+)\.ics$/)) && m === 'GET') {
      const biz = store.businessByCalToken(mm[1]);
      if (!biz) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, cal.icsFeed(biz, store.bookings(biz.id).filter((b) => !b.test)), 'text/calendar; charset=utf-8');
    }

    // --- the phone line (Twilio) ---
    if (m === 'POST' && (p.startsWith('/voice/') || p.startsWith('/sms/'))) {
      const params = await readBody(req, true);
      const fullUrl = (process.env.PUBLIC_URL ? baseUrl() : lastBase) + req.url;
      if (process.env.TWILIO_AUTH_TOKEN && !twilio.validSignature(fullUrl, params, req.headers['x-twilio-signature'])) {
        return send(res, 403, 'Bad signature', 'text/plain');
      }
      return twilioRoute(p, url, params, res);
    }

    // --- operator view for Aakarsh ---
    if (p === '/admin') {
      const key = process.env.ADMIN_KEY;
      if (!key || url.searchParams.get('key') !== key) return html(res, views.notFound(), 404);
      if (m === 'POST') {
        const body = await readBody(req);
        const biz = store.business(body.id);
        if (biz && body.lineNumber !== undefined) store.updateBusiness(biz.id, { lineNumber: digits(body.lineNumber) || null });
        return redirect(res, `/admin?key=${encodeURIComponent(key)}`);
      }
      const list = Object.values(store.data.businesses).filter((b) => !b.demo).map((b) => ({ ...b, stats: stats(store, b), pilot: pilotInfo(b) }));
      return html(res, views.admin({ list, key, twilioOn: twilio.enabled(), pool: process.env.TWILIO_NUMBER_POOL || '' }));
    }

    return html(res, views.notFound(), 404);
  }

  async function twilioRoute(p, url, params, res) {
    const xmlOut = (s) => send(res, 200, s, 'text/xml');
    const base = process.env.PUBLIC_URL ? baseUrl() : lastBase;

    if (p === '/voice/incoming') {
      const biz = store.businessByNumber(params.To);
      if (!biz) return xmlOut(twilio.twiml.sayAndHangUp('Sorry, this number is not set up yet. Goodbye.'));
      if (biz.status === 'paused' || biz.status === 'cancelled' || biz.status === 'setup') {
        return xmlOut(twilio.twiml.voicemail(`Hi, you've reached ${biz.name}. We can't get to the phone right now. Leave your name, number, and what you need after the tone, and we'll call you back.`, `${base}/voice/voicemail`));
      }
      const { call, say } = brain.newCall(biz, { channel: 'voice', callerPhone: params.From, externalId: params.CallSid });
      store.putCall(call);
      return xmlOut(twilio.twiml.ask(say, `${base}/voice/turn?call=${call.id}`));
    }

    if (p === '/voice/turn') {
      const call = store.call(url.searchParams.get('call'));
      const biz = call && store.business(call.businessId);
      if (!call || !biz) return xmlOut(twilio.twiml.sayAndHangUp('Sorry, something went wrong on our end. Please call back.'));
      const r = await brain.respond(biz, call, params.SpeechResult || '', deps(biz, call));
      store.putCall(call);
      if (r.end) {
        finalize(biz, call).catch(console.error);
        return xmlOut(twilio.twiml.sayAndHangUp(r.say));
      }
      return xmlOut(twilio.twiml.ask(r.say, `${base}/voice/turn?call=${call.id}`));
    }

    if (p === '/voice/status') {
      const status = params.CallStatus;
      if (!['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(status)) return xmlOut(twilio.twiml.message(''));
      let call = Object.values(store.data.calls).find((c) => c.externalId && c.externalId === params.CallSid);
      const biz = call ? store.business(call.businessId) : store.businessByNumber(params.To);
      if (!biz) return xmlOut(twilio.twiml.message(''));
      if (!call) {
        if (biz.status === 'paused' || biz.status === 'cancelled') return xmlOut(twilio.twiml.message(''));
        call = brain.newCall(biz, { channel: 'voice', callerPhone: params.From, externalId: params.CallSid }).call;
      }
      call.durationSec = +params.CallDuration || call.durationSec || 0;
      if (!call.endedAt || !call.alerts.summary) await finalize(biz, call);
      return xmlOut(twilio.twiml.message(''));
    }

    if (p === '/voice/voicemail') {
      const biz = store.businessByNumber(params.To);
      if (biz && biz.ownerPhone && params.RecordingUrl) {
        await notify.send(biz, biz.ownerPhone, `🎙 Voicemail from ${brain.formatPhone(params.From) || 'unknown number'} (your line is paused). Listen: ${params.RecordingUrl}.mp3`, 'voicemail');
      }
      return xmlOut(twilio.twiml.sayAndHangUp('Thanks. Goodbye.'));
    }

    if (p === '/sms/incoming') {
      const biz = store.businessByNumber(params.To);
      const text = String(params.Body || '').trim();
      if (!biz) return xmlOut(twilio.twiml.message(''));
      // The owner can text commands to their own line.
      if (digits(params.From) === digits(biz.ownerPhone)) return xmlOut(twilio.twiml.message(ownerCommand(biz, text)));
      if (/^(stop|unsubscribe|cancel|end|quit)$/i.test(text)) return xmlOut(twilio.twiml.message(''));
      if (biz.status === 'paused' || biz.status === 'cancelled') {
        if (biz.ownerPhone) await notify.send(biz, biz.ownerPhone, `💬 Text from ${brain.formatPhone(params.From)}: “${text.slice(0, 300)}”`, 'forward');
        return xmlOut(twilio.twiml.message(`Thanks for texting ${biz.name}. We'll get back to you shortly.`));
      }
      let call = store.openTextThread(biz.id, params.From);
      let prefix = '';
      if (!call) {
        call = brain.newCall(biz, { channel: 'sms', callerPhone: params.From }).call;
        call.transcript = [];
        prefix = `Thanks for texting ${biz.name}! `;
      }
      const r = await brain.respond(biz, call, text, deps(biz, call));
      store.putCall(call);
      if (r.end) finalize(biz, call).catch(console.error);
      return xmlOut(twilio.twiml.message(prefix + r.say));
    }

    return xmlOut(twilio.twiml.message(''));
  }

  function ownerCommand(biz, text) {
    const t = text.toLowerCase().trim();
    if (/^(pause|off|stop answering)$/.test(t)) { store.updateBusiness(biz.id, { status: 'paused', pausedFrom: biz.status === 'paused' ? biz.pausedFrom : biz.status }); return `Paused. Callers will get a voicemail and you'll get a text for each one. Text ON to turn it back on.`; }
    if (/^(on|resume|start|unpause)$/.test(t)) { store.updateBusiness(biz.id, { status: biz.pausedFrom && biz.pausedFrom !== 'paused' ? biz.pausedFrom : 'pilot' }); return `You're back on. Every call gets answered.`; }
    if (/^(link|dashboard|login)$/.test(t)) return `Your dashboard: ${baseUrl()}/app/${biz.token}`;
    return `Text PAUSE to pause your second line, ON to turn it back on, or LINK for your dashboard.`;
  }

  function calUrl(biz) { return `${baseUrl()}/cal/${biz.calToken}.ics`; }

  function alertAdmin(text) {
    const to = process.env.ADMIN_PHONE;
    console.log('[admin]', text);
    if (to) twilio.sendSms({ to, body: `SecondLine: ${text}` }).catch((e) => console.error('[admin text]', e.message));
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Something went wrong. Try again.' });
    });
  });
  server.on('close', () => clearInterval(sweeper));
  return { server, store, handle };
}

// ---------- data helpers ----------

function stats(store, biz, now = new Date()) {
  const since = now.getTime() - 7 * 86400000;
  const recent = store.callsFor(biz.id).filter((c) => (c.channel === 'voice' || c.channel === 'sms') && new Date(c.startedAt) >= since);
  const answered = recent.filter((c) => c.data.outcome !== 'missed').length;
  const booked = recent.filter((c) => c.data.bookingId).length;
  const urgent = recent.filter((c) => c.data.outcome === 'urgent').length;
  const callbacks = recent.filter((c) => c.data.outcome === 'callback').length;
  const recovered = recent.filter((c) => c.textedBack).length;
  const jobs = booked + recent.filter((c) => c.data.outcome === 'urgent' && !c.data.bookingId).length;
  return { answered, booked, urgent, callbacks, recovered, jobs, saved: jobs * (biz.jobValue || 300), total: recent.length };
}

function upcoming(store, biz, now = new Date()) {
  return store.bookings(biz.id).filter((b) => !b.test && b.status !== 'cancelled' && new Date(b.end) > now)
    .sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 5);
}

function pilotInfo(biz, now = new Date()) {
  if (!biz.pilotStartedAt) return null;
  const day = Math.floor((now - new Date(biz.pilotStartedAt)) / 86400000) + 1;
  return { day: Math.min(day, PILOT_DAYS), daysLeft: Math.max(0, PILOT_DAYS - day + 1), over: day > PILOT_DAYS };
}

function takeFromPool(store) {
  const pool = (process.env.TWILIO_NUMBER_POOL || '').split(',').map((s) => digits(s)).filter(Boolean);
  const used = new Set(Object.values(store.data.businesses).map((b) => digits(b.lineNumber)));
  return pool.find((n) => !used.has(n)) || null;
}

const DEMO_PEOPLE = { plumbing: ['Riverside Plumbing', 'Mike'], hvac: ['Northside Heating & Air', 'Dave'], electrical: ['Brightline Electric', 'Carlos'], roofing: ['Summit Roofing', 'Jen'], towing: ['Route 9 Towing', 'Rick'], locksmith: ['Keystone Locksmith', 'Tony'], other: ['Hometown Repair', 'Sam'] };
function demoBiz(store, trade) {
  const [name, owner] = DEMO_PEOPLE[trade] || DEMO_PEOPLE.plumbing;
  return {
    id: `demo-${trade}`, demo: true, name, ownerName: owner, agentName: 'Jamie', trade,
    services: TRADES[trade].services, hours: cal.DEFAULT_HOURS, timezone: process.env.DEMO_TZ || 'America/New_York',
    jobValue: TRADES[trade].jobValue, status: 'active',
  };
}
function ensureDemoBusiness(store) {
  const num = process.env.DEMO_NUMBER;
  if (!num) return;
  const existing = store.business('demo-line');
  const biz = Object.assign(demoBiz(store, 'plumbing'), { id: 'demo-line', lineNumber: digits(num), token: existing?.token, calToken: existing?.calToken });
  store.addBusiness(biz);
}

// ---------- validation ----------

function clean(s, max) { return String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max); }
function cleanList(list, fallback) {
  const out = Array.isArray(list) ? list.map((s) => clean(s, 40)).filter(Boolean).slice(0, 20) : [];
  return out.length ? out : fallback;
}
function cleanHours(h) {
  if (!h || typeof h !== 'object') return cal.DEFAULT_HOURS;
  const out = {};
  for (const d of cal.DAYS) {
    const v = h[d];
    out[d] = Array.isArray(v) && v.length === 2 && Number.isInteger(+v[0]) && Number.isInteger(+v[1]) && +v[0] >= 0 && +v[1] <= 24 && +v[0] < +v[1] ? [+v[0], +v[1]] : null;
  }
  return out;
}
function validTz(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz || 'America/New_York'; } catch { return 'America/New_York'; }
}
function validateSetup(b) {
  if (!clean(b.name, 60)) return 'What’s your business called?';
  if (!clean(b.ownerName, 40)) return 'What’s your first name?';
  if (digits(b.ownerPhone).length !== 10) return 'That cell number doesn’t look right — 10 digits, please.';
  return null;
}
function validatePatch(p) {
  if ('name' in p && !clean(p.name, 60)) return 'Business name can’t be empty.';
  if ('ownerName' in p && !clean(p.ownerName, 40)) return 'Your name can’t be empty.';
  if ('ownerPhone' in p && digits(p.ownerPhone).length !== 10) return 'That cell number doesn’t look right — 10 digits, please.';
  if ('jobValue' in p && !(+p.jobValue > 0 && +p.jobValue < 100000)) return 'Pick an average job amount in dollars.';
  return null;
}
function normalizePatch(p) {
  const o = {};
  for (const [k, v] of Object.entries(p)) {
    if (k === 'services') o[k] = cleanList(v, []);
    else if (k === 'hours') o[k] = cleanHours(v);
    else if (k === 'ownerPhone') o[k] = digits(v);
    else if (k === 'timezone') o[k] = validTz(v);
    else if (k === 'jobValue' || k === 'callbackMinutes') o[k] = Math.round(+v);
    else if (k === 'greeting') o[k] = clean(v, 200);
    else o[k] = clean(v, 60);
  }
  return o;
}

// ---------- http helpers ----------

function readBody(req, form = false) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 100000) req.destroy(); });
    req.on('end', () => {
      const type = req.headers['content-type'] || '';
      if (type.includes('application/json')) { try { return resolve(JSON.parse(data || '{}')); } catch { return resolve({}); } }
      resolve(Object.fromEntries(new URLSearchParams(data)));
    });
    req.on('error', () => resolve({}));
  });
}
const SECURITY = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
};
function send(res, code, body, type) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY }); res.end(body); }
function html(res, body, code = 200) { send(res, code, body, 'text/html; charset=utf-8'); }
function json(res, code, obj) { send(res, code, JSON.stringify(obj), 'application/json'); }
function redirect(res, to) { res.writeHead(302, { Location: to }); res.end(); }
function serveStatic(res, rel) {
  const file = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 404, 'Not found', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=300', ...SECURITY });
    res.end(buf);
  });
}

if (require.main === module) {
  loadDotEnv();
  const { server } = createApp();
  const port = +process.env.PORT || 3000;
  server.listen(port, () => console.log(`SecondLine running on http://localhost:${port}`));
}

function loadDotEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const mt = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (mt && !(mt[1] in process.env)) process.env[mt[1]] = mt[2].replace(/^["']|["']$/g, '');
  }
}

module.exports = { createApp, stats, pilotInfo };
