'use strict';
// Nationwide targeting. The grid is trade × market. It aims where phone
// automation hasn't arrived yet:
//   - small and mid-size markets in all 50 states, not the big tech-heavy metros
//   - niche trades first (septic, wells, garage doors, tree work, pest, restoration…),
//     usually owner-operators who are on a job when the phone rings
// Each search ("septic service in Bozeman, MT") runs once, in an order that
// hops between states and trades, so the list fills in across the whole country
// instead of one town at a time.

const crypto = require('crypto');

// Search terms per trade, niche trades first. Weight = how often that trade comes up.
const TRADES = [
  { trade: 'septic', query: 'septic service', weight: 3 },
  { trade: 'well', query: 'well pump repair', weight: 3 },
  { trade: 'garage', query: 'garage door repair', weight: 3 },
  { trade: 'tree', query: 'tree service', weight: 3 },
  { trade: 'restoration', query: 'water damage restoration', weight: 2 },
  { trade: 'pest', query: 'pest control', weight: 2 },
  { trade: 'appliance', query: 'appliance repair', weight: 2 },
  { trade: 'chimney', query: 'chimney sweep', weight: 2 },
  { trade: 'mechanic', query: 'mobile mechanic', weight: 1 },
  { trade: 'towing', query: 'towing service', weight: 2 },
  { trade: 'locksmith', query: 'locksmith', weight: 1 },
  { trade: 'plumbing', query: 'plumber', weight: 2 },
  { trade: 'hvac', query: 'heating and air conditioning', weight: 2 },
  { trade: 'electrical', query: 'electrician', weight: 1 },
  { trade: 'roofing', query: 'roofing contractor', weight: 1 },
];

// Two small or mid-size markets per state.
const MARKETS = [
  'Dothan, AL', 'Florence, AL', 'Fairbanks, AK', 'Wasilla, AK', 'Prescott, AZ', 'Lake Havasu City, AZ',
  'Jonesboro, AR', 'Hot Springs, AR', 'Redding, CA', 'Visalia, CA', 'Grand Junction, CO', 'Pueblo, CO',
  'Torrington, CT', 'Norwich, CT', 'Dover, DE', 'Georgetown, DE', 'Ocala, FL', 'Panama City, FL',
  'Valdosta, GA', 'Rome, GA', 'Hilo, HI', 'Kahului, HI', 'Idaho Falls, ID', 'Twin Falls, ID',
  'Peoria, IL', 'Carbondale, IL', 'Terre Haute, IN', 'Kokomo, IN', 'Dubuque, IA', 'Sioux City, IA',
  'Salina, KS', 'Hutchinson, KS', 'Bowling Green, KY', 'Owensboro, KY', 'Lake Charles, LA', 'Houma, LA',
  'Bangor, ME', 'Lewiston, ME', 'Hagerstown, MD', 'Salisbury, MD', 'Pittsfield, MA', 'Fitchburg, MA',
  'Traverse City, MI', 'Marquette, MI', 'St. Cloud, MN', 'Mankato, MN', 'Hattiesburg, MS', 'Tupelo, MS',
  'Joplin, MO', 'Cape Girardeau, MO', 'Bozeman, MT', 'Great Falls, MT', 'Kearney, NE', 'Grand Island, NE',
  'Elko, NV', 'Carson City, NV', 'Keene, NH', 'Laconia, NH', 'Vineland, NJ', 'Toms River, NJ',
  'Las Cruces, NM', 'Farmington, NM', 'Watertown, NY', 'Elmira, NY', 'Hickory, NC', 'Greenville, NC',
  'Minot, ND', 'Bismarck, ND', 'Mansfield, OH', 'Zanesville, OH', 'Enid, OK', 'Lawton, OK',
  'Medford, OR', 'Bend, OR', 'Altoona, PA', 'Williamsport, PA', 'Westerly, RI', 'Woonsocket, RI',
  'Florence, SC', 'Rock Hill, SC', 'Rapid City, SD', 'Aberdeen, SD', 'Jackson, TN', 'Cookeville, TN',
  'Tyler, TX', 'Abilene, TX', 'St. George, UT', 'Logan, UT', 'Rutland, VT', 'St. Johnsbury, VT',
  'Lynchburg, VA', 'Winchester, VA', 'Yakima, WA', 'Wenatchee, WA', 'Beckley, WV', 'Parkersburg, WV',
  'Wausau, WI', 'Eau Claire, WI', 'Casper, WY', 'Sheridan, WY',
];

const state = (m) => m.split(', ')[1];

// Deterministic order: trades by weight, markets hopping across states.
function grid(extraMarkets = []) {
  const markets = [...MARKETS, ...extraMarkets];
  const cells = [];
  for (const t of TRADES) for (const m of markets) {
    const h = crypto.createHash('sha1').update(t.query + '|' + m).digest().readUInt32BE(0) / 0xffffffff;
    cells.push({ key: `${t.trade}|${m}`, trade: t.trade, query: t.query, market: m, state: state(m), score: t.weight * 10 + h * 10 });
  }
  cells.sort((a, b) => b.score - a.score);
  // Never two searches in a row from the same state.
  const out = [];
  while (cells.length) {
    const last = out[out.length - 1];
    const i = cells.findIndex((c) => !last || c.state !== last.state);
    out.push(cells.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

function createCampaign({ store, outreach, now = () => new Date(), log = console.log }) {
  function data() {
    if (!store.data.campaign) store.data.campaign = { done: {}, lastRunDay: null };
    return store.data.campaign;
  }
  function extraMarkets() {
    return (process.env.CAMPAIGN_EXTRA_MARKETS || '').split(';').map((s) => s.trim()).filter((s) => /^[^,]+, [A-Z]{2}$/.test(s));
  }
  function next(n) {
    const done = data().done;
    return grid(extraMarkets()).filter((c) => !done[c.key]).slice(0, n);
  }
  function progress() {
    const total = grid(extraMarkets()).length;
    const done = Object.keys(data().done).length;
    return { total, done, left: total - done };
  }

  // Run the next N searches, then look up emails for what we found.
  async function run({ searches = +process.env.CAMPAIGN_SEARCHES_PER_DAY || 8, perSearch = 20 } = {}) {
    const results = [];
    for (const c of next(searches)) {
      try {
        const r = await outreach.find({ query: c.query, location: c.market, max: perSearch });
        data().done[c.key] = { at: now().toISOString(), found: r.found, added: r.added, withQuote: r.withQuote };
        results.push({ search: `${c.query} in ${c.market}`, ...r });
        log(`[campaign] ${c.query} in ${c.market}: ${r.added} new (${r.withQuote} with a missed-call review)`);
      } catch (e) {
        results.push({ search: `${c.query} in ${c.market}`, error: e.message });
        log(`[campaign] ${c.query} in ${c.market}: ${e.message}`);
        if (/API key|403|PERMISSION|quota|429/i.test(e.message)) break; // stop the day on key or quota problems
      }
    }
    store.save();
    const enriched = await outreach.enrich({ limit: 200 });
    return { results, enriched, progress: progress() };
  }

  // Called every minute by the server; runs once a day in the early morning.
  async function daily() {
    const d = now();
    const tz = process.env.OUTREACH_TZ || 'America/New_York';
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
    const day = `${p.year}-${p.month}-${p.day}`;
    if (+p.hour < 6 || data().lastRunDay === day) return null;
    data().lastRunDay = day;
    store.save();
    return run();
  }

  return { run, daily, next, progress };
}

module.exports = { createCampaign, grid, MARKETS, TRADES };
