'use strict';
// Find trade shops with Google Places (New) Text Search, and pull the review
// lines where customers complain they couldn't get through. Those quotes are
// the hook: "a customer of yours wrote this".
//
// Requesting `places.reviews` bills at Google's higher "Enterprise + Atmosphere"
// rate. Per Google's terms, show review text with attribution to Google and
// don't keep it longer than you need for outreach (we drop quotes after 30 days).

const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber',
  'places.websiteUri', 'places.rating', 'places.userRatingCount', 'places.reviews',
  'places.types', 'places.businessStatus', 'nextPageToken',
].join(',');

// Reviews that mean "they didn't pick up".
const MISSED = /\b(never|didn'?t|did not|don'?t|do not|no one|nobody|couldn'?t|could not|wouldn'?t|won'?t|hard to|impossible to|tried to|kept|unable to)\b[^.!?]{0,40}?\b(call(ed|ing|s)? (me |us )?back|answer(ed|ing|s)?|pick(ed|s)? up|reach(ed)?|get (a ?hold|through)|return(ed)? (my |our |the )?(call|message|voicemail)s?|respond(ed)?)\b|\b(straight to voicemail|no answer|unanswered|never heard back|full voicemail|voicemail (was |is )?full)\b/i;

const TRADE_WORDS = [
  [/plumb|drain|sewer|septic|water heater/i, 'plumbing'],
  [/hvac|heating|cooling|air condition|furnace|\bac\b/i, 'hvac'],
  [/electric/i, 'electrical'],
  [/roof|gutter/i, 'roofing'],
  [/tow|wrecker|roadside/i, 'towing'],
  [/locksmith|lock/i, 'locksmith'],
];
function guessTrade(...texts) {
  const t = texts.filter(Boolean).join(' ');
  for (const [re, trade] of TRADE_WORDS) if (re.test(t)) return trade;
  return 'other';
}

// The one sentence that shows the problem, trimmed to fit in an email.
function missedCallQuote(reviews = []) {
  const hits = [];
  for (const r of reviews) {
    const text = r?.text?.text || r?.originalText?.text || '';
    if (!MISSED.test(text)) continue;
    const sentence = text.split(/(?<=[.!?])\s+/).find((s) => MISSED.test(s)) || text;
    let q = sentence.replace(/\s+/g, ' ').trim();
    if (q.length > 170) q = q.slice(0, 167).replace(/\s+\S*$/, '') + '…';
    hits.push({ quote: q, rating: r.rating || null, publishTime: r.publishTime || null });
  }
  hits.sort((a, b) => (a.rating || 5) - (b.rating || 5));
  return hits[0] || null;
}

async function searchShops({ query, location, apiKey = process.env.GOOGLE_PLACES_API_KEY, max = 40 }) {
  if (!apiKey) throw new Error('Set GOOGLE_PLACES_API_KEY to search for shops (or import a CSV instead).');
  const out = [];
  let pageToken;
  do {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery: `${query} in ${location}`, pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Places ${res.status}: ${json?.error?.message || 'request failed'}`);
    for (const p of json.places || []) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      const name = p.displayName?.text || '';
      const hit = missedCallQuote(p.reviews);
      out.push({
        placeId: p.id, name, address: p.formattedAddress || '', city: location,
        phone: p.nationalPhoneNumber || '', website: p.websiteUri || '',
        rating: p.rating || null, reviewsCount: p.userRatingCount || 0,
        trade: guessTrade(query, name, (p.types || []).join(' ')),
        quote: hit ? hit.quote : null, quoteRating: hit ? hit.rating : null,
        source: 'google',
      });
      if (out.length >= max) break;
    }
    pageToken = json.nextPageToken;
    if (pageToken) await new Promise((r) => setTimeout(r, 1500)); // Google needs a beat before the next page
  } while (pageToken && out.length < max);
  return out;
}

module.exports = { searchShops, missedCallQuote, guessTrade, MISSED };
