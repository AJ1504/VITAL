#!/usr/bin/env node
'use strict';
// Outreach from the command line.
//
//   node src/outreach/cli.js find "plumber" "Austin, TX" [max]   find shops on Google (needs GOOGLE_PLACES_API_KEY)
//   node src/outreach/cli.js import leads.csv                    add your own list (name,email,phone,website,trade,city,ownerName,quote)
//   node src/outreach/cli.js enrich                              look up emails on shop websites
//   node src/outreach/cli.js preview [slug]                      print the first email for a lead
//   node src/outreach/cli.js send [count]                        send what's due now (within the daily cap)
//   node src/outreach/cli.js campaign [searches]                 next nationwide searches (niche trades, small markets), then emails
//   node src/outreach/cli.js campaign status                     how far through the country we are
//   node src/outreach/cli.js status                              counts by status

const fs = require('fs');
const path = require('path');
const { Store } = require('../store');
const { createOutreach, parseCsv } = require('./engine');
const { draft } = require('./offer');
const { createCampaign } = require('./campaign');

function loadDotEnv() {
  const f = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

(async () => {
  loadDotEnv();
  const store = new Store(process.env.DATA_FILE || path.join(__dirname, '..', '..', 'data', 'db.json'));
  const base = () => (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
  const o = createOutreach({ store, baseUrl: base, alert: (t) => console.log(t) });
  const [cmd, a, b, c] = process.argv.slice(2);
  try {
    if (cmd === 'campaign') {
      const c = createCampaign({ store, outreach: o });
      if (a === 'status') console.log(c.progress(), '\nNext up:', c.next(10).map((x) => `${x.query} in ${x.market}`));
      else console.log(JSON.stringify(await c.run({ searches: +a || 8 }), null, 2));
    } else if (cmd === 'find') {
      if (!a || !b) throw new Error('Usage: find "plumber" "Austin, TX" [max]');
      console.log(await o.find({ query: a, location: b, max: +c || 40 }));
    } else if (cmd === 'import') {
      console.log(o.importRows(parseCsv(fs.readFileSync(a, 'utf8'))));
    } else if (cmd === 'enrich') {
      console.log(await o.enrich({ limit: +a || 50 }));
    } else if (cmd === 'preview') {
      const lead = a ? o.bySlug(a) : Object.values(store.data.leads).find((l) => l.email) || Object.values(store.data.leads)[0];
      if (!lead) throw new Error('No leads yet. Run find or import first.');
      const m = draft(lead, +b || 1, { baseUrl: base() });
      console.log(`To: ${lead.email || '(no email yet)'}\nSubject: ${m.subject}\n\n${m.text}`);
    } else if (cmd === 'send') {
      console.log(JSON.stringify(await o.send({ limit: +a || 10, ignoreWindow: true }), null, 2));
    } else {
      console.log(o.summary());
      if (cmd && cmd !== 'status') console.log('\nCommands: campaign, find, import, enrich, preview, send, status');
    }
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
  store.flush();
})();
