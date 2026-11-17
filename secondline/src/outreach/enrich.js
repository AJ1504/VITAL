'use strict';
// Find a public contact email on a shop's own website (home + contact page).
// Polite by design: a few pages per site, a timeout, a plain user agent, and
// we skip sites whose robots.txt asks crawlers to stay out.

const UA = 'Mozilla/5.0 (compatible; SecondLineContactFinder/1.0)';
const BAD = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(example|domain|email|yourdomain|sentry|wixpress|sentry-next|godaddy)\.|^(no-?reply|noreply|donotreply|webmaster|postmaster|abuse|privacy)@/i;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

async function get(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain' }, redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (!/text|html/.test(type)) return '';
    return (await res.text()).slice(0, 400000);
  } catch { return ''; } finally { clearTimeout(t); }
}

function blockedByRobots(robots) {
  // Only the blunt case: "User-agent: *" followed by "Disallow: /".
  const blocks = robots.split(/\n(?=\s*user-agent:)/i);
  return blocks.some((b) => /user-agent:\s*\*/i.test(b) && /^\s*disallow:\s*\/\s*$/im.test(b));
}

function pickEmail(emails, website) {
  let host = '';
  try { host = new URL(website).hostname.replace(/^www\./, ''); } catch { /* no site */ }
  const uniq = [...new Set(emails.map((e) => e.toLowerCase().replace(/^mailto:/, '').replace(/[.,;]+$/, '')))].filter((e) => !BAD.test(e));
  const score = (e) => (host && e.endsWith('@' + host) ? 10 : 0) + (/^(info|office|contact|service|hello|admin|owner|sales|support)@/.test(e) ? 3 : 0) + (/gmail|yahoo|outlook|hotmail|aol|icloud/.test(e) ? 1 : 0);
  return uniq.sort((a, b) => score(b) - score(a))[0] || null;
}

function decode(html) {
  return html.replace(/&#64;|&commat;/gi, '@').replace(/&#46;|&period;/gi, '.').replace(/\s*\[at\]\s*|\s*\(at\)\s*/gi, '@').replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/gi, '.');
}

async function findEmail(website) {
  if (!website) return null;
  let base;
  try { base = new URL(website); } catch { return null; }
  const origin = base.origin;
  if (blockedByRobots(await get(`${origin}/robots.txt`, 4000))) return { email: null, note: 'robots.txt asks crawlers to stay out' };
  const found = [];
  for (const path of ['', '/contact', '/contact-us', '/about']) {
    const html = decode(await get(origin + path));
    if (html) found.push(...(html.match(EMAIL) || []));
    const best = pickEmail(found, website);
    if (best && best.endsWith('@' + base.hostname.replace(/^www\./, ''))) return { email: best, source: origin + path };
  }
  const best = pickEmail(found, website);
  return best ? { email: best, source: origin } : { email: null, note: 'no email on site' };
}

module.exports = { findEmail, pickEmail, blockedByRobots };
