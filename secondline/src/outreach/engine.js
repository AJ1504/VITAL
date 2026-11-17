'use strict';
// The outreach pipeline: find shops → find their email → send a 3-email
// sequence (day 0, 3, 7) → stop the moment they opt out, reply, or sign up.
// Hot leads (someone opens their personal demo) get flagged to you right away.
//
// Guardrails, all enforced here:
//   - nothing sends until sender name, email and postal address are set (CAN-SPAM)
//   - every email has an opt-out link; opted-out addresses are never emailed again
//   - daily cap (default 25) and weekday daytime only, to protect your domain
//   - email only — no automated texts or calls to shops (TCPA)

const { id, secret, digits } = require('../store');
const { searchShops } = require('./places');
const { findEmail } = require('./enrich');
const { draft, sender, senderProblems, offer } = require('./offer');
const mailer = require('./mailer');

const FOLLOW_UP_DAYS = [0, 3, 4]; // after step 1: +3 days, then +4 more (day 7)
const QUOTE_MAX_AGE_DAYS = 30;

function slugify(s) {
  return String(s || 'shop').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'shop';
}
function domainOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }

function createOutreach({ store, baseUrl, alert = () => {}, now = () => new Date() }) {
  const leads = () => Object.values(store.data.leads);

  function findDuplicate(l) {
    return leads().find((x) => (l.placeId && x.placeId === l.placeId)
      || (l.website && domainOf(x.website) && domainOf(x.website) === domainOf(l.website))
      || (l.phone && digits(x.phone).length >= 10 && digits(x.phone) === digits(l.phone))
      || (l.email && x.email && x.email.toLowerCase() === l.email.toLowerCase()));
  }

  function addLead(data) {
    const dup = findDuplicate(data);
    if (dup) return { lead: dup, added: false };
    let slug = `${slugify(data.name)}-${secret().slice(0, 4).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`;
    while (leads().some((x) => x.slug === slug)) slug += 'x';
    const lead = {
      id: id('lead'), slug, unsubToken: secret(),
      name: String(data.name || '').trim().slice(0, 80), ownerName: data.ownerName ? String(data.ownerName).trim().split(/\s+/)[0].slice(0, 30) : null,
      trade: data.trade || 'other', phone: data.phone || '', website: data.website || '', address: data.address || '', city: data.city || '',
      rating: data.rating || null, reviewsCount: data.reviewsCount || 0,
      quote: data.quote || null, quoteAt: data.quote ? now().toISOString() : null,
      placeId: data.placeId || null, source: data.source || 'import',
      email: data.email ? String(data.email).trim().toLowerCase() : null, emailSource: data.email ? 'import' : null,
      status: data.email ? 'ready' : 'new', step: 0, nextSendAt: null, lastSentAt: null,
      offerDeadline: null, visits: 0, events: [{ at: now().toISOString(), what: 'added' }],
      createdAt: now().toISOString(),
    };
    if (lead.email && isSuppressed(lead.email)) lead.status = 'unsubscribed';
    store.data.leads[lead.id] = lead;
    store.save();
    return { lead, added: true };
  }

  function log(lead, what) { lead.events.push({ at: now().toISOString(), what }); if (lead.events.length > 50) lead.events.shift(); store.save(); }
  function isSuppressed(email) { return !!store.data.suppressed[String(email || '').toLowerCase()]; }

  async function find({ query, location, max = 40 }) {
    const shops = await searchShops({ query, location, max });
    let added = 0, withQuote = 0;
    for (const s of shops) {
      const r = addLead(s);
      if (r.added) { added++; if (s.quote) withQuote++; }
    }
    return { found: shops.length, added, withQuote };
  }

  async function enrich({ limit = 50 } = {}) {
    let found = 0, missing = 0;
    for (const lead of leads().filter((l) => l.status === 'new').slice(0, limit)) {
      const r = await findEmail(lead.website);
      if (r && r.email) {
        lead.email = r.email; lead.emailSource = r.source;
        lead.status = isSuppressed(r.email) ? 'unsubscribed' : 'ready';
        found++;
      } else {
        lead.status = 'no-email'; missing++;
      }
      log(lead, r && r.email ? `email found: ${r.email}` : `no email (${(r && r.note) || 'no website'})`);
    }
    return { found, missing };
  }

  function importRows(rows) {
    let added = 0, skipped = 0;
    for (const row of rows) {
      if (!row.name) { skipped++; continue; }
      const r = addLead({ ...row, source: 'import' });
      r.added ? added++ : skipped++;
    }
    return { added, skipped };
  }

  function sentToday() {
    const start = new Date(now()); start.setHours(0, 0, 0, 0);
    return leads().reduce((n, l) => n + l.events.filter((e) => e.what.startsWith('sent email') && new Date(e.at) >= start).length, 0);
  }

  function inSendingWindow(d = now()) {
    const tz = process.env.OUTREACH_TZ || 'America/New_York';
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', hour: 'numeric' }).formatToParts(d);
    const wd = p.find((x) => x.type === 'weekday').value;
    const h = +p.find((x) => x.type === 'hour').value;
    return !['Sat', 'Sun'].includes(wd) && h >= 8 && h < 17;
  }

  // Which leads are due an email right now, in order.
  function due() {
    const t = now();
    return leads().filter((l) => {
      if (!l.email || isSuppressed(l.email)) return false;
      if (l.status === 'ready' && l.step === 0) return true;
      return (l.status === 'contacted' || l.status === 'visited') && l.step < 3 && l.nextSendAt && new Date(l.nextSendAt) <= t;
    }).sort((a, b) => (b.quote ? 1 : 0) - (a.quote ? 1 : 0) || new Date(a.createdAt) - new Date(b.createdAt));
  }

  // Send what's due, within the daily cap. `ignoreWindow` is for a manual "send now".
  async function send({ limit = 1, ignoreWindow = false } = {}) {
    const problems = senderProblems();
    if (problems.length) return { sent: 0, blocked: `Set ${problems.join(', ')} before sending.` };
    if (!ignoreWindow && !inSendingWindow()) return { sent: 0, blocked: 'Outside weekday sending hours (8am–5pm).' };
    const cap = +process.env.OUTREACH_DAILY_CAP || 25;
    const room = Math.max(0, cap - sentToday());
    if (!room) return { sent: 0, blocked: `Daily cap of ${cap} reached.` };
    const s = sender();
    const results = [];
    for (const lead of due().slice(0, Math.min(limit, room))) {
      // Google review text isn't kept past 30 days.
      if (lead.quote && lead.quoteAt && now() - new Date(lead.quoteAt) > QUOTE_MAX_AGE_DAYS * 86400000) { lead.quote = null; }
      const step = lead.step + 1;
      if (step === 1) lead.offerDeadline = offer(now()).deadline.toISOString();
      const mail = draft(lead, step, { baseUrl: baseUrl(), now: now() });
      try {
        const r = await mailer.sendEmail({ to: lead.email, subject: mail.subject, text: mail.text, from: `${s.name} <${s.email}>`, replyTo: s.replyTo, unsubUrl: mail.unsubUrl });
        lead.step = step;
        if (lead.status !== 'visited') lead.status = 'contacted';
        lead.lastSentAt = now().toISOString();
        lead.nextSendAt = step < 3 ? new Date(now().getTime() + FOLLOW_UP_DAYS[step] * 86400000).toISOString() : null;
        log(lead, `sent email ${step}${r.dryRun ? ' (dry run — saved to outbox)' : ''}: ${mail.subject}`);
        results.push({ lead: lead.name, step, dryRun: !!r.dryRun, file: r.file });
      } catch (e) {
        log(lead, `send failed: ${e.message}`);
        if (/invalid|not.*valid|bounce/i.test(e.message)) lead.status = 'bounced';
        results.push({ lead: lead.name, step, error: e.message });
      }
    }
    store.save();
    return { sent: results.filter((r) => !r.error).length, results };
  }

  function bySlug(slug) { return leads().find((l) => l.slug === slug) || null; }

  function visited(lead) {
    lead.visits = (lead.visits || 0) + 1;
    const last = lead.lastVisitAlertAt ? new Date(lead.lastVisitAlertAt) : null;
    if (!lead.firstVisitAt) lead.firstVisitAt = now().toISOString();
    if (!['signed-up', 'unsubscribed'].includes(lead.status) && (!last || now() - last > 86400000)) {
      lead.lastVisitAlertAt = now().toISOString();
      alert(`🔥 ${lead.name} just opened their demo${lead.phone ? ` — call them now: ${lead.phone}` : ''}.`);
    }
    if (lead.status === 'contacted') lead.status = 'visited';
    log(lead, 'opened demo page');
  }

  function signedUp(slug, bizId) {
    const lead = bySlug(slug);
    if (!lead) return null;
    lead.status = 'signed-up'; lead.businessId = bizId; lead.nextSendAt = null;
    log(lead, 'signed up');
    alert(`✅ ${lead.name} signed up for the free week.`);
    return lead;
  }

  function unsubscribe(token) {
    const lead = leads().find((l) => l.unsubToken === token);
    if (!lead) return null;
    if (lead.email) store.data.suppressed[lead.email.toLowerCase()] = now().toISOString();
    lead.status = 'unsubscribed'; lead.nextSendAt = null;
    log(lead, 'opted out');
    return lead;
  }

  function mark(leadId, status) {
    const lead = store.data.leads[leadId];
    if (!lead || !['replied', 'not-interested', 'ready'].includes(status)) return null;
    lead.status = status;
    if (status !== 'ready') lead.nextSendAt = null;
    log(lead, `marked ${status}`);
    return lead;
  }

  function summary() {
    const by = {};
    for (const l of leads()) by[l.status] = (by[l.status] || 0) + 1;
    return { total: leads().length, by, sentToday: sentToday(), due: due().length, senderProblems: senderProblems(), live: mailer.enabled() && process.env.OUTREACH_DRY_RUN !== '1' };
  }

  return { addLead, find, enrich, importRows, send, due, bySlug, visited, signedUp, unsubscribe, mark, summary, isSuppressed, inSendingWindow };
}

// Minimal CSV reader (handles quoted fields) for "name,email,phone,website,trade,city,ownerName,quote".
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim().replace(/^﻿/, ''));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || '').trim()])));
}

module.exports = { createOutreach, parseCsv, slugify };
