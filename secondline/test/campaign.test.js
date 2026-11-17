'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Store } = require('../src/store');
const { createCampaign, grid, MARKETS } = require('../src/outreach/campaign');
const { automationSignals } = require('../src/outreach/enrich');

test('covers all 50 states, niche trades first, never the same state twice in a row', () => {
  assert.equal(new Set(MARKETS.map((m) => m.split(', ')[1])).size, 50);
  const g = grid();
  assert.equal(g.length, MARKETS.length * 15);
  const firstTrades = new Set(g.slice(0, 40).map((c) => c.trade));
  for (const big of ['electrical', 'roofing', 'locksmith']) assert.ok(!firstTrades.has(big), `${big} should wait behind niche trades`);
  for (let i = 1; i < 200; i++) assert.notEqual(g[i].state, g[i - 1].state);
});

test('each search runs once, and a bad key stops the day early', async () => {
  const store = new Store(null);
  const calls = [];
  let fail = false;
  const outreach = {
    find: async ({ query, location }) => { calls.push(`${query} in ${location}`); if (fail) throw new Error('Google Places 403: API key not valid'); return { found: 5, added: 5, withQuote: 1 }; },
    enrich: async () => ({ found: 3, missing: 2 }),
  };
  const c = createCampaign({ store, outreach, log: () => {} });
  const r1 = await c.run({ searches: 3 });
  assert.equal(r1.results.length, 3);
  const r2 = await c.run({ searches: 3 });
  assert.equal(new Set(calls).size, 6, 'no search repeated');
  assert.equal(r2.progress.done, 6);
  fail = true;
  const r3 = await c.run({ searches: 5 });
  assert.equal(r3.results.length, 1, 'stopped after the key error');
  assert.equal(c.progress().done, 6, 'failed search stays in the queue');
});

test('runs once a day, after 6am', async () => {
  const store = new Store(null);
  let n = 0;
  let clock = new Date('2026-11-17T10:00:00Z'); // 5am New York
  const c = createCampaign({ store, outreach: { find: async () => { n++; return { found: 0, added: 0, withQuote: 0 }; }, enrich: async () => ({ found: 0, missing: 0 }) }, now: () => clock, log: () => {} });
  process.env.CAMPAIGN_SEARCHES_PER_DAY = '2';
  assert.equal(await c.daily(), null);
  clock = new Date('2026-11-17T12:00:00Z');
  await c.daily(); await c.daily();
  assert.equal(n, 2);
  delete process.env.CAMPAIGN_SEARCHES_PER_DAY;
});

test('spots shops that already have their phones covered', () => {
  assert.deepEqual(automationSignals('<script src="https://widget.smith.ai/x.js"></script>').answering, ['Smith.ai']);
  assert.deepEqual(automationSignals('We install intercoms and doorbells').online, []);
  const s = automationSignals('<script src="https://book.housecallpro.com/w.js"></script>');
  assert.deepEqual(s.answering, []);
  assert.deepEqual(s.online, ['Housecall Pro']);
});
