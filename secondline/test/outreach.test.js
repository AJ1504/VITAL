'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Store } = require('../src/store');
const { createOutreach, parseCsv } = require('../src/outreach/engine');
const { missedCallQuote, guessTrade } = require('../src/outreach/places');
const { pickEmail, blockedByRobots } = require('../src/outreach/enrich');
const { draft } = require('../src/outreach/offer');

const SENDER = { OUTREACH_FROM_NAME: 'Aakarsh', OUTREACH_FROM_EMAIL: 'a@secondline.test', OUTREACH_ADDRESS: '1 Main St, Austin, TX 78701' };

function setup(start = '2026-11-17T15:00:00Z') {
  let clock = new Date(start);
  const outbox = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-out-'));
  process.env.OUTREACH_OUTBOX_DIR = outbox;
  delete process.env.RESEND_API_KEY;
  const store = new Store(null);
  const alerts = [];
  const o = createOutreach({ store, baseUrl: () => 'https://sl.test', alert: (t) => alerts.push(t), now: () => clock });
  return { o, store, alerts, outbox, tick: (days) => { clock = new Date(clock.getTime() + days * 86400000); } };
}

test('pulls the missed-call line out of Google reviews', () => {
  const q = missedCallQuote([
    { rating: 5, text: { text: 'Great work, fair price.' } },
    { rating: 2, text: { text: 'Good plumber once he shows up. I called three times and nobody ever called me back. Ended up using someone else.' } },
  ]);
  assert.equal(q.quote, 'I called three times and nobody ever called me back.');
  assert.equal(missedCallQuote([{ text: { text: 'Fast and friendly!' } }]), null);
  assert.ok(missedCallQuote([{ text: { text: 'Went straight to voicemail every time.' } }]));
  assert.equal(guessTrade('plumber', 'Joe & Sons'), 'plumbing');
  assert.equal(guessTrade('', 'Ace Heating and Air'), 'hvac');
});

test('picks the business email over junk on the page', () => {
  assert.equal(pickEmail(['logo@2x.png', 'noreply@acme.com', 'joe@gmail.com', 'info@riversideplumbing.com'], 'https://www.riversideplumbing.com'), 'info@riversideplumbing.com');
  assert.equal(blockedByRobots('User-agent: *\nDisallow: /\n'), true);
  assert.equal(blockedByRobots('User-agent: *\nDisallow: /admin\n'), false);
});

test('first email: their review quote, their personal link, the offer, opt-out, address', () => {
  Object.assign(process.env, SENDER);
  const m = draft({ name: 'Riverside Plumbing', trade: 'plumbing', slug: 'riverside-plumbing-ab12', unsubToken: 'tok', quote: 'Nobody ever called me back.' }, 1, { baseUrl: 'https://sl.test' });
  assert.equal(m.subject, "A customer couldn't reach Riverside Plumbing");
  assert.match(m.text, /"Nobody ever called me back\."/);
  assert.match(m.text, /https:\/\/sl\.test\/d\/riverside-plumbing-ab12/);
  assert.match(m.text, /7 days free/);
  assert.match(m.text, /No setup fee \(normally \$200\)/);
  assert.match(m.text, /second month is free/);
  assert.match(m.text, /1 Main St, Austin, TX 78701/);
  assert.match(m.text, /https:\/\/sl\.test\/u\/tok/);
  assert.doesNotMatch(m.text, /\bAI\b/);
});

test('nothing is sent until the sender name, email and postal address are set', async () => {
  for (const k of Object.keys(SENDER)) delete process.env[k];
  const t = setup();
  t.o.importRows([{ name: 'Oak Plumbing', email: 'info@oak.test', trade: 'plumbing' }]);
  const r = await t.o.send({ ignoreWindow: true });
  assert.equal(r.sent, 0);
  assert.match(r.blocked, /OUTREACH_ADDRESS/);
});

test('3-email sequence on day 0, 3 and 7, then stops', async () => {
  Object.assign(process.env, SENDER);
  const t = setup();
  t.o.importRows(parseCsv('name,email,trade,quote\n"Oak Plumbing, LLC",info@oak.test,plumbing,"Never answers the phone."\n'));
  assert.equal((await t.o.send({ ignoreWindow: true })).sent, 1);
  assert.equal((await t.o.send({ ignoreWindow: true })).sent, 0, 'nothing due on day 0 after the first email');
  t.tick(3);
  assert.equal((await t.o.send({ ignoreWindow: true })).results[0].step, 2);
  t.tick(4);
  assert.equal((await t.o.send({ ignoreWindow: true })).results[0].step, 3);
  t.tick(30);
  assert.equal((await t.o.send({ ignoreWindow: true })).sent, 0, 'no fourth email');
  assert.equal(fs.readdirSync(t.outbox).length, 3, 'practice mode wrote 3 emails to the outbox');
});

test('opt-out is permanent, even if the shop is imported again', async () => {
  Object.assign(process.env, SENDER);
  const t = setup();
  const { lead } = t.o.addLead({ name: 'Oak Plumbing', email: 'info@oak.test' });
  t.o.unsubscribe(lead.unsubToken);
  assert.equal((await t.o.send({ ignoreWindow: true })).sent, 0);
  const again = t.o.addLead({ name: 'Oak Plumbing Again', email: 'INFO@oak.test' });
  assert.equal(again.added, false, 'duplicate by email');
  const other = t.o.addLead({ name: 'Different Shop', email: 'info@oak.test', website: 'https://new.test' });
  assert.equal(other.added, false);
  assert.equal(t.o.isSuppressed('info@oak.test'), true);
});

test('daily cap and weekday hours are respected', async () => {
  Object.assign(process.env, SENDER, { OUTREACH_DAILY_CAP: '2' });
  const t = setup('2026-11-17T15:00:00Z'); // Tue 10am New York
  for (let i = 0; i < 5; i++) t.o.addLead({ name: `Shop ${i}`, email: `s${i}@shop${i}.test` });
  assert.equal((await t.o.send({ limit: 10 })).sent, 2);
  assert.match((await t.o.send({ limit: 10 })).blocked, /Daily cap/);
  delete process.env.OUTREACH_DAILY_CAP;
  const weekend = setup('2026-11-21T15:00:00Z'); // Saturday
  weekend.o.addLead({ name: 'Shop', email: 's@s.test' });
  assert.match((await weekend.o.send()).blocked, /weekday/);
});

test('opening the demo page alerts you once a day; follow-ups keep going', async () => {
  Object.assign(process.env, SENDER);
  const t = setup();
  const { lead } = t.o.addLead({ name: 'Oak Plumbing', email: 'info@oak.test', phone: '(555) 201-4321' });
  await t.o.send({ ignoreWindow: true });
  t.o.visited(lead); t.o.visited(lead);
  assert.equal(t.alerts.length, 1);
  assert.match(t.alerts[0], /Oak Plumbing just opened their demo — call them now: \(555\) 201-4321/);
  assert.equal(lead.status, 'visited');
  t.tick(3);
  assert.equal((await t.o.send({ ignoreWindow: true })).sent, 1);
});
