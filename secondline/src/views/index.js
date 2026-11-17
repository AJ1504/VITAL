'use strict';
// Server-rendered pages. Plain words only — no "AI", "API", "webhook" anywhere
// an owner or caller can see.

const cal = require('../calendar');
const { formatPhone } = require('../brain');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const money = (n) => '$' + Math.round(n).toLocaleString('en-US');

const MARK = `<span class="brand-mark" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6.6 10.8a15.2 15.2 0 006.6 6.6l2.2-2.2a1 1 0 011-.25c1.1.37 2.3.57 3.6.57a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.57a1 1 0 01-.25 1L6.6 10.8z" fill="#fff"/><path d="M15 3.5a6 6 0 015.5 5.5M15 7a2.5 2.5 0 012 2" stroke="#4ADE80" stroke-width="2" stroke-linecap="round"/></svg></span>`;
const brand = (href = '/') => `<a class="brand" href="${href}">${MARK}SecondLine</a>`;

function page({ title, body, display = false, scripts = [], desc = 'Your second line. Always answered.' }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#0F1B2D">
<link rel="icon" href="/public/icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800${display ? '&family=Sora:wght@600;700;800' : ''}&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/public/styles.css">
</head>
<body>
${body}
${scripts.map((s) => `<script src="/public/${s}"></script>`).join('\n')}
</body>
</html>`;
}

// ---------- the conversation widget (landing demo + setup test call) ----------
function convoWidget({ id, name, agent, suggestions, mode }) {
  return `<div class="phone" id="${id}" data-mode="${mode}">
  <div class="phone-head">
    <div class="avatar" aria-hidden="true">${esc(agent[0])}</div>
    <div><div class="who" data-biz-name>${esc(name)}</div><div class="sub"><span class="dot live"></span><span>${esc(agent)} answering</span></div></div>
    <div class="spacer"></div>
    <button class="icon-btn" type="button" data-voice aria-pressed="false" aria-label="Hear it out loud" title="Hear it out loud">🔈</button>
    <button class="icon-btn" type="button" data-restart aria-label="Start over" title="Start over">↻</button>
  </div>
  <div class="convo" data-convo aria-live="polite"></div>
  <div class="suggest" data-suggest>${suggestions.map((s) => `<button class="chip" type="button">${esc(s)}</button>`).join('')}</div>
  <form class="composer" data-form autocomplete="off">
    <label class="sr" for="${id}-in">What you'd say on the phone</label>
    <input id="${id}-in" data-input placeholder="Type what you'd say…" maxlength="300" enterkeyhint="send">
    <button class="btn" type="submit" aria-label="Send">Send</button>
  </form>
</div>
<div class="result" data-result></div>`;
}

const DEMO_TRADES = [['plumbing', '🔧 Plumbing'], ['hvac', '❄️ Heating & AC'], ['electrical', '⚡ Electrical'], ['roofing', '🏠 Roofing'], ['towing', '🚛 Towing'], ['locksmith', '🔑 Locksmith']];

function landing({ demoNumber }) {
  const body = `
<header class="wrap-wide topbar">
  ${brand()}
  <a class="btn sm" href="/start">Try it free</a>
</header>

<main>
<section class="wrap-wide l-hero">
  <div class="l-grid">
    <div>
      <h1>Never miss another <span class="money">$10,000</span> job.</h1>
      <p class="hero-sub">It answers every call in seconds, books the job into your calendar, and texts you the details. Day and night.</p>
      <a class="btn go big" href="/start">Try it free for 7 days</a>
      <div class="trust"><span>No card to start</span><span>Keep your number</span><span>Cancel anytime</span></div>
    </div>
    <div id="demo">
      <p class="kicker" style="font-weight:800;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);margin-bottom:10px">Try it now — you're the customer</p>
      <div class="trade-pick" role="group" aria-label="Pick a trade">
        ${DEMO_TRADES.map(([k, l], i) => `<button class="chip" type="button" data-trade="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}
      </div>
      ${convoWidget({ id: 'demo-phone', name: 'Riverside Plumbing', agent: 'Jamie', mode: 'demo', suggestions: ['My basement is flooding!', 'My water heater stopped working', 'Can I talk to Mike?', 'How much do you charge?'] })}
      ${demoNumber ? `<a class="call-demo" href="tel:${esc(demoNumber)}"><span class="ic" aria-hidden="true">📞</span><span><span class="muted small">Or call it from your phone</span><b>${esc(formatPhone(demoNumber))}</b></span></a>` : ''}
    </div>
  </div>
</section>

<section class="band section">
  <div class="wrap-wide">
    <p class="kicker" style="color:var(--amber)">The phone is where you lose money</p>
    <h2>Every call you can't pick up is a job for someone else.</h2>
    <div class="stat-row">
      <div class="stat"><div class="num">62%</div><p>of calls to small businesses go <strong>unanswered</strong>.</p></div>
      <div class="stat"><div class="num">85%</div><p>of those callers <strong>never call back</strong>. They call the next shop on the list.</p></div>
    </div>
  </div>
</section>

<section class="section">
  <div class="wrap-wide">
    <p class="kicker">The math</p>
    <h2>It pays for itself the first time it picks up.</h2>
    <div class="math">
      <div class="card"><div><h3>One missed job pays for months.</h3><p>A <span class="big">$1,200</span> water heater. A <span class="big">$10,000</span> roof. Catch one call you'd have missed and you're ahead.</p></div></div>
      <div class="card"><div><h3>A receptionist costs $2,000+ a month.</h3><p>And goes home at five. Your second line is $300 a month and picks up at 3am.</p></div></div>
      <div class="card"><div><h3>$200 setup means we build it for you.</h3><p>Your services, your hours, your calendar — then we make live test calls together. About 30 minutes.</p></div></div>
      <div class="card"><div><h3>You pay only after you've seen it work.</h3><p>7 days free. Real calls, real bookings. Then decide.</p></div></div>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="wrap-wide">
    <p class="kicker">How it works</p>
    <h2>Three steps. No tech.</h2>
    <div class="steps">
      <div class="card"><span class="n">1</span><div><h3>We set up your second line.</h3><p class="muted">Takes one 30-minute call. You keep your number.</p></div></div>
      <div class="card"><span class="n">2</span><div><h3>It answers every call, day and night.</h3><p class="muted">Books jobs, flags emergencies, takes messages.</p></div></div>
      <div class="card"><span class="n">3</span><div><h3>You get a text after every call.</h3><p class="muted">Who called, what they need, what's booked.</p></div></div>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0">
  <div class="wrap">
    <p class="kicker center">What lands on your phone</p>
    <h2 class="center">A text within a minute of every call.</h2>
    <div class="sms" style="margin-top:20px">
      <div class="head">💬 SecondLine · just now</div>
      <div class="text">✅ Booked: Dana Lopez — Tue, 8–10am
Kitchen sink leaking under the cabinet
42 Elm Street
(555) 201-4321</div>
    </div>
    <div class="sms" style="margin-top:12px">
      <div class="head">💬 SecondLine · 2:14am</div>
      <div class="text" style="background:var(--red)">🚨 URGENT — call Tom back now: (555) 201-9999
Basement flooding
9 Oak Ave</div>
    </div>
  </div>
</section>

<section class="section" style="padding-top:0" id="pricing">
  <div class="wrap">
    <p class="kicker center">Pricing</p>
    <div class="card price">
      <div class="amt">$300<small>/month</small></div>
      <p class="muted" style="margin-top:8px">plus $200 one-time setup</p>
      <ul>
        <li>7 days free — pay nothing until it's proven itself</li>
        <li>Every call answered, day and night</li>
        <li>Jobs booked straight into your calendar</li>
        <li>A text after every call</li>
        <li>Cancel anytime. Two taps. No phone call.</li>
      </ul>
      <a class="btn go big block" href="/start">Try it free for 7 days</a>
    </div>
    <p class="quote-line" style="margin-top:36px">One saved job a month <em>pays for the entire year.</em></p>
  </div>
</section>

<section class="section faq" style="padding-top:0">
  <div class="wrap">
    <h2 style="margin-bottom:18px">Questions owners ask</h2>
    <details><summary>Do I need a new phone number?</summary><p>No. Keep your number. When you can't pick up, your phone sends the call to your second line. We set that up together — it's one code you dial.</p></details>
    <details><summary>What do callers hear?</summary><p>A friendly office assistant who answers with your business name, takes the details, and books the job. If someone asks, it tells them it's the office assistant. Try the demo above — that's exactly it.</p></details>
    <details><summary>What about emergencies?</summary><p>Flooding, no heat, sparking, gas smell, locked out — your second line spots it, keeps the call short, and texts you right away marked URGENT.</p></details>
    <details><summary>Can callers still reach me?</summary><p>Always. Every caller is offered a call back from you. You get their number in a text.</p></details>
    <details><summary>Can I turn it off?</summary><p>Anytime. One tap to pause in your dashboard, or text PAUSE. Cancel in two taps — no retention call.</p></details>
  </div>
</section>
</main>

<div class="sticky-cta"><a class="btn go big block" href="/start">Try it free for 7 days</a></div>
<footer class="foot"><div class="wrap-wide" style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">${brand()}<span>Your second line. Always answered. · <a href="/login">Owner login</a></span></div></footer>`;
  return page({ title: 'SecondLine — Never miss another job', body, display: true, scripts: ['convo.js', 'landing.js'], desc: 'Your second line answers every call, books the job, and texts you the details. 7 days free.' });
}

// ---------- setup ----------
function setup({ trades }) {
  const tradeTiles = Object.entries(trades).map(([k, t]) => `<button class="tile" type="button" data-trade="${k}" aria-pressed="false"><span class="emoji" aria-hidden="true">${t.icon}</span>${esc(t.label)}</button>`).join('');
  const body = `
<div class="flow">
  <div class="wrap">
    <div class="topbar">${brand()}<span class="tiny muted" data-saved></span></div>
    <div class="progress" aria-hidden="true"><i data-bar style="width:0%"></i></div>
    <p class="step-label" data-step-label>Step 1 of 7</p>

    <section class="screen" data-screen="name">
      <h1>What's your business called?</h1>
      <p class="lead">This is how your receptionist answers the phone.</p>
      <div class="field"><label class="sr" for="f-name">Business name</label><input class="input" id="f-name" data-k="name" placeholder="Riverside Plumbing" autocomplete="organization" maxlength="60"></div>
      <p class="error" data-error></p>
      <div class="actions"><button class="btn big block" data-next>Next</button></div>
    </section>

    <section class="screen" data-screen="trade">
      <h1>What kind of work do you do?</h1>
      <p class="lead">We'll fill in the usual jobs for you.</p>
      <div class="tiles">${tradeTiles}</div>
      <div class="actions"><button class="link" data-back>Back</button></div>
    </section>

    <section class="screen" data-screen="owner">
      <h1>What's your first name?</h1>
      <p class="lead">Callers hear “I can have <b data-echo="ownerName">you</b> call you back.”</p>
      <div class="field"><label class="sr" for="f-owner">Your first name</label><input class="input" id="f-owner" data-k="ownerName" placeholder="Mike" autocomplete="given-name" maxlength="40"></div>
      <p class="error" data-error></p>
      <div class="actions"><button class="btn big block" data-next>Next</button><button class="link" data-back>Back</button></div>
    </section>

    <section class="screen" data-screen="phone">
      <h1>Your cell number</h1>
      <p class="lead">We text you here after every call. Nobody else sees it.</p>
      <div class="field"><label class="sr" for="f-phone">Cell number</label><input class="input" id="f-phone" data-k="ownerPhone" type="tel" inputmode="tel" placeholder="(555) 123-4567" autocomplete="tel-national" maxlength="20"></div>
      <p class="error" data-error></p>
      <div class="actions"><button class="btn big block" data-next>Next</button><button class="link" data-back>Back</button></div>
    </section>

    <section class="screen" data-screen="hours">
      <h1>When do you take jobs?</h1>
      <p class="lead">Your receptionist answers 24/7 — this is just when it books visits.</p>
      <div class="card"><div class="hours-summary" data-hours-summary></div></div>
      <div class="card" data-hours-editor hidden></div>
      <div class="actions"><button class="btn big block" data-next>Looks right</button><button class="btn ghost block" type="button" data-edit-hours>Change hours</button><button class="link" data-back>Back</button></div>
    </section>

    <section class="screen" data-screen="services">
      <h1>What jobs do you do?</h1>
      <p class="lead">Tap to turn off anything you don't do.</p>
      <div class="chips" data-services></div>
      <div class="actions"><button class="btn big block" data-next>Looks right</button><button class="link" data-back>Back</button></div>
    </section>

    <section class="screen" data-screen="voice">
      <h1>Meet your receptionist</h1>
      <p class="lead">Pick a name. Tap play to hear how your phone gets answered.</p>
      <div class="chips" data-agent-names role="group" aria-label="Receptionist name"></div>
      <div class="card" style="margin-top:16px">
        <p class="tiny muted" style="font-weight:700;margin-bottom:6px">YOUR CALLERS HEAR</p>
        <p style="font-size:20px;font-weight:600;color:var(--ink)" data-greeting></p>
        <button class="btn ghost sm" type="button" style="margin-top:14px" data-play>▶ Play greeting</button>
      </div>
      <p class="error" data-error></p>
      <div class="actions"><button class="btn big block" data-next>Next: try a test call</button><button class="link" data-back>Back</button></div>
    </section>

    <section class="screen" data-screen="test">
      <h1>Try a test call</h1>
      <p class="lead">You're the customer. Ask for a job and watch it get booked. Nothing goes live yet.</p>
      <div data-test-slot></div>
      <div class="actions">
        <button class="btn go big block" data-golive>Turn on my second line</button>
        <p class="tiny muted center">Free for 7 days. You can pause or cancel anytime.</p>
        <button class="link" data-back>Back</button>
      </div>
    </section>
  </div>
</div>
<template id="test-widget">${convoWidget({ id: 'test-phone', name: '', agent: 'Jamie', mode: 'test', suggestions: ['I need someone to come out this week', 'My basement is flooding!', 'Can I talk to the owner?'] })}</template>
<script type="application/json" id="trades">${JSON.stringify(trades).replace(/</g, '\\u003c')}</script>`;
  return page({ title: 'Set up SecondLine', body, scripts: ['hours.js', 'convo.js', 'setup.js'] });
}

// ---------- dashboard ----------
const OUTCOME = {
  booked: { ico: '✓', label: 'Booked', pill: 'green' },
  urgent: { ico: '!', label: 'Urgent', pill: 'red' },
  callback: { ico: '↩', label: 'Call back', pill: 'amber' },
  incomplete: { ico: '↺', label: 'Texted back', pill: 'amber' },
  missed: { ico: '↺', label: 'Texted back', pill: 'amber' },
};

function ago(iso, now = new Date()) {
  const s = Math.max(0, (now - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 172800) return 'yesterday';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function callTitle(c) {
  const d = c.data;
  const who = d.name && d.name !== 'Caller' ? d.name : formatPhone(d.phone || c.callerPhone) || 'Unknown caller';
  return who;
}

function callCard(c, biz) {
  const d = c.data;
  const o = OUTCOME[d.outcome] || OUTCOME.missed;
  const outcome = d.outcome === 'urgent' && d.bookingId ? 'booked' : d.outcome;
  const sub = d.need || (d.outcome === 'missed' ? 'Hung up before saying much' : 'No details');
  const phone = d.phone || c.callerPhone;
  return `<details class="callcard">
  <summary>
    <span class="ico ${esc(outcome)}" aria-hidden="true">${o.ico}</span>
    <span><span class="t1">${esc(callTitle(c))}</span><span class="t2" style="display:block">${esc(sub)}</span></span>
    <span class="when">${ago(c.startedAt)}<br><span class="pill ${o.pill}" style="margin-top:4px">${c.channel === 'test' ? 'Test' : esc(o.label)}</span></span>
  </summary>
  <div class="body">
    <div class="facts">
      ${d.slot ? `<div>📅 <b>${esc(cal.shortSlot(d.slot, biz.timezone))}</b></div>` : ''}
      ${d.address ? `<div>📍 ${esc(d.address)}</div>` : ''}
      ${phone ? `<div>📱 <a href="tel:${esc(phone)}">${esc(formatPhone(phone))}</a></div>` : ''}
      ${c.channel === 'sms' ? '<div>💬 By text</div>' : ''}
      ${(d.notes || []).map((n) => `<div>📝 “${esc(n)}”</div>`).join('')}
    </div>
    ${c.transcript.length ? `<p class="tiny muted" style="font-weight:700">WHAT WAS SAID</p><div class="transcript">${c.transcript.map((t) => `<p class="${t.who}"><b>${t.who === 'agent' ? esc(biz.agentName || 'Receptionist') : 'Caller'}</b>${esc(t.text)}</p>`).join('')}</div>` : ''}
  </div>
</details>`;
}

function dashboard({ biz, stats, calls, upcoming, pilot, calUrl }) {
  const on = biz.status === 'pilot' || biz.status === 'active';
  const real = calls.filter((c) => c.channel !== 'test');
  const needs = real.filter((c) => !c.handled && (c.data.outcome === 'urgent' && !c.data.bookingId || c.data.outcome === 'callback' || c.data.outcome === 'incomplete'));
  const feed = (real.length ? real : calls).slice(0, 30);
  const num = (n, label, cls = '') => `<div class="num-card ${cls}"><div class="n ${n ? '' : 'zero'}">${n}</div><div class="l">${label}</div></div>`;
  const webcal = calUrl.replace(/^https?:/, 'webcal:');

  let banner = '';
  if (biz.status === 'cancelled') banner = `<div class="banner paused"><span class="grow">Your second line is cancelled. You won't be charged again.</span><button class="btn sm" data-action="reactivate">Turn it back on</button></div>`;
  else if (biz.status === 'paused') banner = `<div class="banner paused"><span aria-hidden="true">⏸</span><span class="grow">Paused. Callers get a voicemail and you get a text for each one.</span></div>`;
  else if (pilot && pilot.over && !biz.keepRequestedAt && biz.status === 'pilot') banner = `<div class="banner over"><span class="grow"><b>Your free week is done.</b><br><span style="opacity:.8">Keep it for ${(biz.setupFee ?? 200) ? `$${biz.setupFee ?? 200} setup + $300/month` : '$300/month — no setup fee'}. Cancel anytime.</span></span><button class="btn go sm" data-action="keep">Keep my second line</button></div>`;
  else if (pilot && pilot.over && biz.keepRequestedAt && biz.status === 'pilot') banner = `<div class="banner pilot"><span aria-hidden="true">👍</span><span class="grow">Thanks! We'll text you a payment link. Your line stays on.</span></div>`;
  else if (pilot && biz.status === 'pilot') banner = `<div class="banner pilot"><span aria-hidden="true">🎁</span><span class="grow">Free pilot — day ${pilot.day} of 7. Nothing to pay until you've seen it work.</span></div>`;

  const body = `
<div class="dash">
<div class="wrap">
  <div class="topbar">
    <div style="min-width:0">
      <div style="font-weight:800;color:var(--ink);font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(biz.name)}</div>
      <div class="status ${on ? 'green' : 'amber'}"><span class="dot ${on ? 'live' : ''}"></span>${on ? 'Answering your calls' : biz.status === 'paused' ? 'Paused' : 'Off'}</div>
    </div>
    <a class="btn ghost sm" href="/app/${esc(biz.token)}/settings" aria-label="Settings">⚙︎ Settings</a>
  </div>

  ${banner}

  <p class="tiny muted" style="font-weight:700;margin-top:18px;letter-spacing:.04em">LAST 7 DAYS</p>
  <div class="hero-nums">
    ${num(money(stats.saved), `est. work won <span class="muted">· ${money(biz.jobValue || 300)} avg job</span>`, 'wide')}
    ${num(stats.answered, 'calls answered')}
    ${num(stats.jobs, 'new jobs')}
  </div>
  ${stats.recovered ? `<p class="small" style="margin-top:10px"><span class="pill amber">🟡 ${stats.recovered} missed ${stats.recovered === 1 ? 'call' : 'calls'} recovered by text</span></p>` : ''}

  ${needs.length ? `<div class="sec-title"><h2>Needs you</h2><span class="pill amber">${needs.length}</span></div>
  ${needs.map((c) => `<div class="callcard needs ${c.data.outcome === 'urgent' ? 'urgent' : ''}" data-call="${esc(c.id)}">
    <div style="padding:14px 16px 10px">
      <div class="t1">${c.data.outcome === 'urgent' ? '<span class="pill red" style="margin-right:6px">Urgent</span>' : ''}${esc(callTitle(c))}</div>
      <div class="t2">${esc(c.data.need || 'Wants a call back')}${c.data.address ? ' · ' + esc(c.data.address) : ''}</div>
      <div class="tiny muted" style="margin-top:4px">${ago(c.startedAt)}</div>
    </div>
    <div class="need-actions">
      <a class="btn go" href="tel:${esc(c.data.phone || c.callerPhone || '')}">📞 Call back</a>
      <button class="btn ghost" data-done="${esc(c.id)}">Done</button>
    </div>
  </div>`).join('')}` : ''}

  <div class="sec-title"><h2>Coming up</h2><a class="small" href="${esc(webcal)}">Add to my calendar</a></div>
  ${upcoming.length ? `<div class="card jobs" style="padding:6px 16px">${upcoming.map((b) => {
    const p = cal.zonedParts(new Date(b.start), biz.timezone);
    const mon = new Intl.DateTimeFormat('en-US', { timeZone: biz.timezone, month: 'short' }).format(new Date(b.start)).toUpperCase();
    return `<div class="job" style="padding:10px 0"><div class="cal"><b>${mon}</b><span>${p.d}</span></div><div style="min-width:0"><div class="t1" style="font-weight:700;color:var(--ink)">${esc(cal.shortSlot(b, biz.timezone).split(', ')[1])} · ${esc(b.customerName || 'Customer')}</div><div class="muted small">${esc(b.need || '')}${b.address ? ' · ' + esc(b.address) : ''}</div></div></div>`;
  }).join('')}</div>` : `<div class="card muted small">No jobs booked yet. New bookings show up here and in your phone's calendar.</div>`}

  <div class="sec-title"><h2>All calls</h2></div>
  ${feed.length ? feed.map((c) => callCard(c, biz)).join('') : `<div class="card empty"><div class="big" aria-hidden="true">📞</div><p style="font-weight:700;color:var(--ink);margin-top:8px">No calls yet.</p><p class="muted small" style="margin-top:6px">Call your business from another phone and let it ring. Your receptionist will pick up, and you'll get a text.</p></div>`}
</div>
</div>

${biz.status !== 'cancelled' ? `<div class="dock"><div class="wrap">
  <div class="grow" data-dock-text>${on ? 'Your second line is ON' : 'Your second line is paused'}<small>${on ? 'Every call gets answered' : 'Calls go to voicemail'}</small></div>
  <button class="switch" role="switch" aria-checked="${on}" aria-label="Second line on or off" data-switch></button>
</div></div>` : ''}

<div class="sheet-bg" data-sheet="pause" role="dialog" aria-modal="true" aria-labelledby="pause-h">
  <div class="sheet">
    <h2 id="pause-h">Pause your second line?</h2>
    <p>Callers will get a voicemail instead, and you'll get a text for each one. Turn it back on anytime with one tap.</p>
    <div class="actions"><button class="btn block big" data-confirm="pause">Pause it</button><button class="btn ghost block" data-close>Keep it on</button></div>
  </div>
</div>
<div class="toast" data-toast role="status"><span data-toast-text></span><button data-toast-undo hidden>Undo</button></div>
<script>window.SL = { token: ${JSON.stringify(biz.token)} };</script>`;
  return page({ title: `${biz.name} — SecondLine`, body, scripts: ['dash.js'] });
}

// ---------- settings ----------
function settings({ biz, trades, calUrl }) {
  const row = (key, label, value, editor) => `<details class="row" data-row="${key}"><summary><span class="k"><b>${label}</b><span data-val="${key}">${esc(value)}</span></span></summary><div class="edit">${editor}<p class="error" data-error></p></div></details>`;
  const text = (k, v, attrs = '') => `<input class="input" data-k="${k}" value="${esc(v)}" ${attrs}><div class="actions"><button class="btn block" data-save="${k}">Save</button></div>`;
  const webcal = calUrl.replace(/^https?:/, 'webcal:');
  const on = biz.status === 'pilot' || biz.status === 'active';
  const body = `
<div class="wrap" style="padding-bottom:48px">
  <div class="topbar"><a class="btn ghost sm" href="/app/${esc(biz.token)}">← Back</a><span style="font-weight:800;color:var(--ink)">Settings</span><span style="width:80px"></span></div>

  <p class="tiny muted" style="font-weight:700;margin:8px 0 8px;letter-spacing:.04em">YOUR RECEPTIONIST</p>
  <div class="rows">
    ${row('greeting', 'Greeting', greetingOf(biz), `<p class="small muted" style="margin-bottom:8px">Receptionist name</p><input class="input" data-k="agentName" value="${esc(biz.agentName || 'Jamie')}" maxlength="20"><p class="small muted" style="margin:14px 0 8px">What callers hear first</p><textarea class="input" data-k="greeting" rows="3" style="font-size:18px" maxlength="200">${esc(greetingOf(biz))}</textarea><div class="actions"><button class="btn ghost block" type="button" data-play>▶ Play it</button><button class="btn block" data-save="agentName,greeting">Save</button></div>`)}
    ${row('hours', 'Hours for booking jobs', cal.formatHours(biz.hours), `<div data-hours-editor></div><div class="actions"><button class="btn block" data-save="hours">Save</button></div>`)}
    ${row('services', 'Jobs you do', (biz.services || []).join(', '), `<div class="chips" data-services></div><div class="actions"><button class="btn block" data-save="services">Save</button></div>`)}
  </div>

  <p class="tiny muted" style="font-weight:700;margin:24px 0 8px;letter-spacing:.04em">YOUR BUSINESS</p>
  <div class="rows">
    ${row('name', 'Business name', biz.name, text('name', biz.name, 'maxlength="60"'))}
    ${row('ownerName', 'Your first name', biz.ownerName, text('ownerName', biz.ownerName, 'maxlength="40"'))}
    ${row('ownerPhone', 'Where we text you', formatPhone(biz.ownerPhone), text('ownerPhone', formatPhone(biz.ownerPhone), 'type="tel" inputmode="tel"'))}
    ${row('jobValue', 'Average job', '$' + (biz.jobValue || 300), `<p class="small muted" style="margin-bottom:8px">Used for “est. work won” on your dashboard.</p><input class="input" data-k="jobValue" inputmode="numeric" value="${esc(biz.jobValue || 300)}"><div class="actions"><button class="btn block" data-save="jobValue">Save</button></div>`)}
  </div>

  <p class="tiny muted" style="font-weight:700;margin:24px 0 8px;letter-spacing:.04em">YOUR LINE</p>
  <div class="rows">
    <div class="row"><a href="/app/${esc(biz.token)}/live" style="display:flex;align-items:center;min-height:64px;padding:14px 16px;text-decoration:none;gap:12px"><span class="k" style="flex:1"><b style="color:var(--ink);display:block">Your second line number</b><span class="muted small">${biz.lineNumber ? esc(formatPhone(biz.lineNumber)) : 'On its way'} · how to send calls here</span></span><span style="font-weight:700;color:var(--ink)">›</span></a></div>
    <div class="row"><a href="${esc(webcal)}" style="display:flex;align-items:center;min-height:64px;padding:14px 16px;text-decoration:none;gap:12px"><span class="k" style="flex:1"><b style="color:var(--ink);display:block">Add bookings to my phone's calendar</b><span class="muted small">New jobs show up on their own</span></span><span style="font-weight:700;color:var(--ink)">›</span></a></div>
  </div>

  <div class="actions" style="margin-top:28px">
    ${biz.status === 'cancelled'
      ? `<button class="btn go block big" data-action="reactivate">Turn my second line back on</button>`
      : `${on ? `<button class="btn ghost block" data-action="pause">Pause my second line</button>` : `<button class="btn go block" data-action="resume">Turn my second line back on</button>`}
         <button class="link" data-open="cancel" style="color:var(--red)">Cancel service</button>`}
  </div>
</div>

<div class="sheet-bg" data-sheet="cancel" role="dialog" aria-modal="true" aria-labelledby="cancel-h">
  <div class="sheet">
    <h2 id="cancel-h">Cancel your second line?</h2>
    <p>It stops answering today and you won't be charged again. Your call history stays here, and you can turn it back on anytime.</p>
    <div class="actions"><button class="btn danger block big" data-confirm="cancel">Yes, cancel</button><button class="btn ghost block" data-close>Keep it</button></div>
  </div>
</div>
<div class="toast" data-toast role="status"><span data-toast-text></span><button data-toast-undo hidden>Undo</button></div>
<script>window.SL = ${JSON.stringify({ token: biz.token, hours: biz.hours || cal.DEFAULT_HOURS, services: biz.services || [], allServices: [...new Set([...(trades[biz.trade]?.services || []), ...(biz.services || [])])], name: biz.name, agentName: biz.agentName || 'Jamie' }).replace(/</g, '\\u003c')};</script>`;
  return page({ title: 'Settings — SecondLine', body, scripts: ['hours.js', 'dash.js'] });
}

function greetingOf(biz) {
  return biz.greeting && biz.greeting.trim() ? biz.greeting : `Hi, this is ${biz.name}'s office, ${biz.agentName || 'Jamie'} speaking. How can I help?`;
}

// ---------- go live (call forwarding) ----------
function goLive({ biz }) {
  const n = biz.lineNumber;
  const d = (n || '').replace(/\D/g, '').slice(-10);
  const carriers = n ? [
    { k: 'verizon', label: 'Verizon', on: `*71${d}`, off: '*73' },
    { k: 'att', label: 'AT&T', on: `**004*1${d}#`, off: '##004#' },
    { k: 'tmobile', label: 'T-Mobile', on: `**004*1${d}#`, off: '##004#' },
    { k: 'other', label: 'Other / not sure', on: `**004*1${d}#`, off: '##004#' },
  ] : [];
  const tel = (code) => 'tel:' + code.replace(/#/g, '%23');
  const body = `
<div class="wrap" style="padding-bottom:48px">
  <div class="topbar">${brand(`/app/${esc(biz.token)}`)}</div>
  <div class="progress" aria-hidden="true"><i style="width:100%"></i></div>
  <p class="step-label">Last step</p>
  ${n ? `
  <h1 style="font-size:30px;margin:16px 0 10px">Send missed calls to your second line</h1>
  <p class="muted" style="margin-bottom:18px">Keep your number. When you don't pick up, your phone passes the call here and your receptionist answers.</p>
  <div class="card center"><p class="tiny muted" style="font-weight:700;letter-spacing:.04em">YOUR SECOND LINE</p><div class="bignum">${esc(formatPhone(n))}</div></div>
  <p class="label" style="margin-top:24px">Who's your phone company?</p>
  <div class="carrier-list" role="group">${carriers.map((c) => `<button class="tile" style="min-height:64px" type="button" data-carrier="${c.k}" aria-pressed="false">${esc(c.label)}</button>`).join('')}</div>
  ${carriers.map((c) => `<div class="card" data-carrier-steps="${c.k}" hidden style="margin-top:14px">
    <p style="font-weight:700;color:var(--ink);font-size:19px">Tap the button. Your phone dials a short code. That's it.</p>
    <a class="btn go big block" style="margin-top:14px" href="${tel(c.on)}">📞 Turn on forwarding</a>
    <p class="small muted center" style="margin-top:6px">Dials ${esc(c.on)}</p>
    <p class="small muted" style="margin-top:12px">To turn it off later, dial <b>${esc(c.off)}</b>. ${c.k === 'other' ? 'If that code doesn’t work, we’ll sort it out together on your setup call.' : ''}</p>
  </div>`).join('')}
  <div class="card" style="margin-top:18px"><p style="font-weight:700;color:var(--ink)">Check it works</p><p class="small muted" style="margin-top:4px">Call your business from another phone and don't answer. Your receptionist picks up — and you get a text.</p></div>
  ` : `
  <h1 style="font-size:30px;margin:16px 0 10px">Your second line is on its way</h1>
  <p class="muted">We're getting your number ready. We'll text it to you at ${esc(formatPhone(biz.ownerPhone))} shortly, with one code to dial.</p>`}
  <div class="actions"><a class="btn big block" href="/app/${esc(biz.token)}">Go to my dashboard</a></div>
</div>
<script>
document.querySelectorAll('[data-carrier]').forEach(function (b) {
  b.addEventListener('click', function () {
    document.querySelectorAll('[data-carrier]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    document.querySelectorAll('[data-carrier-steps]').forEach(function (s) { s.hidden = s.getAttribute('data-carrier-steps') !== b.getAttribute('data-carrier'); });
  });
});
</script>`;
  return page({ title: 'Turn it on — SecondLine', body });
}

function login() {
  const body = `<div class="wrap"><div class="topbar">${brand()}</div>
  <h1 style="font-size:30px;margin:24px 0 10px">Get your dashboard link</h1>
  <p class="muted" style="margin-bottom:20px">Enter your cell. We'll text you your link.</p>
  <form id="lf"><label class="sr" for="lp">Cell number</label><input class="input" id="lp" type="tel" inputmode="tel" placeholder="(555) 123-4567" autocomplete="tel-national">
  <div class="actions"><button class="btn big block">Text me my link</button></div><p class="hint" id="lm" role="status"></p></form></div>
  <script>
  document.getElementById('lf').addEventListener('submit', function (e) {
    e.preventDefault();
    var m = document.getElementById('lm');
    fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: document.getElementById('lp').value }) })
      .then(function () { m.textContent = 'If that number has a second line, your link is on its way by text.'; })
      .catch(function () { m.textContent = 'No signal? Try again in a moment.'; });
  });
  </script>`;
  return page({ title: 'Owner login — SecondLine', body });
}

function admin({ list, key, twilioOn, pool }) {
  const body = `<div class="wrap-wide" style="padding-bottom:40px"><div class="topbar">${brand()}<span class="pill ${twilioOn ? 'green' : 'amber'}">${twilioOn ? 'Phone service connected' : 'Phone service not connected — texts are logged only'}</span></div>
  <h1 style="font-size:28px;margin-bottom:16px">Shops (${list.length})</h1>
  ${pool ? `<p class="small muted">Number pool: ${esc(pool)}</p>` : ''}
  ${list.map((b) => `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b style="color:var(--ink);font-size:19px">${esc(b.name)}</b><span class="pill ${b.status === 'cancelled' ? 'red' : b.status === 'paused' || b.status === 'setup' ? 'amber' : 'green'}">${esc(b.status)}${b.pilot && b.status === 'pilot' ? ` · day ${b.pilot.day}/7` : ''}${b.keepRequestedAt ? ' · WANTS TO KEEP' : ''}</span></div>
    <p class="small muted">${esc(b.ownerName)} · ${esc(formatPhone(b.ownerPhone))} · ${esc(b.trade)} · ${b.stats.answered} answered / ${b.stats.jobs} jobs (7d)</p>
    <form method="post" action="/admin?key=${encodeURIComponent(key)}" style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><input type="hidden" name="id" value="${esc(b.id)}"><input class="input" style="min-height:44px;font-size:16px;max-width:240px" name="lineNumber" placeholder="Second line number" value="${esc(b.lineNumber || '')}"><button class="btn sm">Save number</button><a class="btn ghost sm" href="/app/${esc(b.token)}">Open dashboard</a></form>
  </div>`).join('')}</div>`;
  return page({ title: 'Admin — SecondLine', body });
}

function notFound() {
  return page({ title: 'Not found — SecondLine', body: `<div class="wrap"><div class="topbar">${brand()}</div><h1 style="font-size:30px;margin:24px 0 10px">We couldn't find that page.</h1><p class="muted">If you're an owner looking for your dashboard, we can text you the link.</p><div class="actions"><a class="btn big block" href="/login">Text me my link</a></div></div>` });
}

// ---------- outreach: one personal page per shop ----------
const LEAD_SUGGEST = {
  plumbing: ['My basement is flooding!', 'My water heater stopped working', 'Can I talk to the owner?'],
  hvac: ["We've got no heat and it's freezing", 'Need a furnace tune-up', 'Can I talk to the owner?'],
  electrical: ['An outlet is sparking!', 'I want an EV charger put in', 'Can I talk to the owner?'],
  roofing: ['My roof is leaking into the bedroom', 'Need an inspection after the storm', 'How much is a new roof?'],
  towing: ["I'm stranded on the highway", 'Need a jump start', 'Can I talk to the owner?'],
  locksmith: ["I'm locked out of my house", 'Want my locks rekeyed', 'Can I talk to the owner?'],
  septic: ['My septic is backing up into the house!', 'Need my tank pumped', 'Can I talk to the owner?'],
  well: ['We have no water — the pump quit', 'Want our water tested', 'Can I talk to the owner?'],
  garage: ["My garage door won't close", 'Need a new opener put in', 'How much is a spring?'],
  appliance: ['My fridge stopped cooling', 'Washer is leaking', 'Can I talk to the owner?'],
  tree: ['A tree fell on my house!', 'Need a big oak taken down', 'How much for stump grinding?'],
  pest: ['There’s a wasp nest by the front door', 'We have mice', 'Can I talk to the owner?'],
  restoration: ['My basement is flooded!', 'There’s mold in the bathroom', 'Do you work with insurance?'],
  chimney: ['Need my chimney swept before winter', 'Smoke is coming into the room', 'Can I talk to the owner?'],
  mechanic: ["My car won't start in the driveway", 'Need brakes done', 'Can you come to my work?'],
  other: ['I need something fixed this week', 'Is this an emergency line?', 'Can I talk to the owner?'],
};

function personal({ lead, offer, demoNumber }) {
  const deadline = lead.offerDeadline ? new Date(lead.offerDeadline) : offer.deadline;
  const deadlineText = deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const owner = lead.ownerName || 'the owner';
  const body = `
<header class="wrap topbar">${brand()}<span class="pill green"><span class="dot live"></span>Built for ${esc(lead.name)}</span></header>
<main class="wrap" style="padding-bottom:48px">
  <h1 style="font-family:var(--display);font-size:clamp(32px,8vw,44px);font-weight:800;letter-spacing:-0.03em;margin:8px 0 12px">${esc(lead.name)}, your receptionist is ready.</h1>
  <p style="font-size:18px">It answers your phone as “${esc(lead.name)}'s office,” books the job, and texts ${lead.ownerName ? esc(owner) : 'you'} the details. Try it — you're the customer.</p>

  ${lead.quote ? `<div class="card" style="margin-top:20px;border-left:5px solid var(--amber)">
    <p class="tiny" style="font-weight:800;letter-spacing:.06em;color:var(--amber-ink)">FROM YOUR GOOGLE REVIEWS</p>
    <p style="font-size:19px;font-weight:600;color:var(--ink);margin-top:6px">“${esc(lead.quote)}”</p>
    <p class="small muted" style="margin-top:8px">Every call like that is a job for the next shop on the list. This one picks up every time.</p>
  </div>` : ''}

  <div style="margin-top:20px">
    ${convoWidget({ id: 'lead-phone', name: lead.name, agent: 'Jamie', mode: 'lead', suggestions: LEAD_SUGGEST[lead.trade] || LEAD_SUGGEST.other })}
  </div>
  ${demoNumber ? `<a class="call-demo" href="tel:${esc(demoNumber)}"><span class="ic" aria-hidden="true">📞</span><span><span class="muted small">Or hear it on a real phone call</span><b>${esc(formatPhone(demoNumber))}</b></span></a>` : ''}

  <div class="card price" style="margin-top:28px">
    <p class="kicker" style="font-weight:800;font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--green);margin-bottom:8px">Your offer</p>
    <div class="amt">$0<small> to start</small></div>
    <ul>
      <li>7 days free on your real phone line. No card.</li>
      ${offer.setupWaived ? `<li>No setup fee — normally $${offer.setupFee}. First ${offer.spots} shops only.</li>` : `<li>$${offer.setupFee} setup — we do it all on one 30-minute call.</li>`}
      <li>Then $${offer.monthly}/month. Cancel in two taps, no phone call.</li>
      ${offer.guarantee ? `<li>${esc(offer.guarantee)}</li>` : ''}
      <li>Keep your number. Nothing to install.</li>
    </ul>
    <a class="btn go big block" href="/start?lead=${esc(lead.slug)}">Turn it on for ${esc(lead.name)}</a>
    <p class="small muted" style="margin-top:10px">Offer holds until ${esc(deadlineText)}.</p>
  </div>
  <p class="quote-line" style="margin-top:32px">One saved job a month <em>pays for the entire year.</em></p>
  ${lead.quote ? '<p class="tiny muted center" style="margin-top:24px">Review excerpt from Google Maps.</p>' : ''}
</main>
<script>window.SL_LEAD = ${JSON.stringify({ slug: lead.slug, owner: lead.ownerName || 'the owner', trade: lead.trade }).replace(/</g, '\\u003c')};</script>`;
  const html = page({ title: `${lead.name} — your receptionist`, body, display: true, scripts: ['convo.js', 'personal.js'], desc: `A receptionist built for ${lead.name}.` });
  return html.replace('<meta name="theme-color"', '<meta name="robots" content="noindex, nofollow">\n<meta name="theme-color"');
}

function unsubscribeConfirm({ token }) {
  return page({ title: 'Stop emails — SecondLine', body: `<div class="wrap"><div class="topbar">${brand()}</div>
  <h1 style="font-size:28px;margin:24px 0 10px">Stop these emails?</h1>
  <p class="muted">One tap and you won't hear from us again.</p>
  <form method="post" action="/u/${esc(token)}"><div class="actions"><button class="btn big block">Yes, stop emailing me</button></div></form></div>` });
}
function unsubscribed({ ok }) {
  return page({ title: 'Done — SecondLine', body: `<div class="wrap"><div class="topbar">${brand()}</div>
  <h1 style="font-size:28px;margin:24px 0 10px">${ok ? "Done. You won't hear from us again." : 'That link has expired.'}</h1>
  <p class="muted">${ok ? 'Sorry for the bother, and good luck out there.' : 'If you still get emails, just reply "stop" and we\'ll take you off by hand.'}</p></div>` });
}

const LEAD_STATUS = { new: ['Needs email', 'amber'], ready: ['Ready to send', 'ink'], 'no-email': ['No email found', ''], contacted: ['Emailed', ''], visited: ['Opened demo 🔥', 'green'], 'signed-up': ['Signed up', 'green'], replied: ['Replied', 'green'], 'not-interested': ['Not interested', ''], unsubscribed: ['Opted out', 'red'], bounced: ['Bounced', 'red'], 'has-automation': ['Already has answering — skipped', ''] };

function adminLeads({ list, key, summary, flash, auto, campaign }) {
  const k = encodeURIComponent(key);
  const counts = Object.entries(summary.by).map(([st, n]) => `<span class="pill ${(LEAD_STATUS[st] || [])[1] || ''}">${esc((LEAD_STATUS[st] || [st])[0])}: ${n}</span>`).join(' ');
  const mode = summary.senderProblems.length ? `<span class="pill red">Can't send yet — set ${esc(summary.senderProblems.join(', '))}</span>`
    : summary.live ? `<span class="pill green">Sending real emails${auto ? ' automatically (weekdays 8–5)' : ''}</span>` : '<span class="pill amber">Practice mode — emails are saved to data/outreach-outbox, not sent</span>';
  const body = `<div class="wrap-wide" style="padding-bottom:40px">
  <div class="topbar">${brand()}<a class="btn ghost sm" href="/admin?key=${k}">Shops</a></div>
  <h1 style="font-size:28px">Outreach</h1>
  <p style="margin:10px 0" class="wrap-pills">${mode}</p>
  <p class="small" style="display:flex;gap:6px;flex-wrap:wrap">${counts || '<span class="muted">No leads yet.</span>'} <span class="pill">Sent today: ${summary.sentToday}</span> <span class="pill">Due now: ${summary.due}</span></p>
  ${flash ? `<div class="banner pilot" style="margin-top:12px">${esc(flash)}</div>` : ''}
  ${campaign ? `<div class="card" style="margin-top:16px">
    <p style="font-weight:800;color:var(--ink)">Nationwide campaign</p>
    <p class="small muted">${campaign.done} of ${campaign.total} searches done (niche trades × small and mid-size markets, all 50 states)${campaign.auto ? ' · runs every morning by itself' : ''}.</p>
    ${campaign.next.length ? `<p class="small" style="margin-top:6px">Next: ${campaign.next.map(esc).join(' · ')}</p>` : ''}
    <form method="post" action="/admin/leads?key=${k}" style="margin-top:10px"><input type="hidden" name="do" value="campaign"><input type="hidden" name="count" value="5"><button class="btn sm">Run next 5 searches</button></form>
  </div>` : ''}
  <div class="card" style="margin-top:16px">
    <form method="post" action="/admin/leads?key=${k}" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input type="hidden" name="do" value="find">
      <input class="input" style="min-height:44px;font-size:16px;max-width:200px" name="query" placeholder="plumber" required>
      <span class="muted">in</span>
      <input class="input" style="min-height:44px;font-size:16px;max-width:220px" name="location" placeholder="Austin, TX" required>
      <button class="btn sm">Find shops</button>
    </form>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <form method="post" action="/admin/leads?key=${k}"><input type="hidden" name="do" value="enrich"><button class="btn ghost sm">Look up emails</button></form>
      <form method="post" action="/admin/leads?key=${k}"><input type="hidden" name="do" value="send"><input type="hidden" name="count" value="5"><button class="btn go sm">Send next 5 now</button></form>
    </div>
  </div>
  ${list.map((l) => {
    const [label, color] = LEAD_STATUS[l.status] || [l.status, ''];
    return `<div class="card">
    <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><b style="color:var(--ink);font-size:18px">${esc(l.name)}</b><span class="pill ${color}">${esc(label)}${l.step ? ` · email ${l.step}/3` : ''}${l.visits ? ` · ${l.visits} visit${l.visits > 1 ? 's' : ''}` : ''}</span></div>
    <p class="small muted">${esc(l.trade)} · ${esc(l.city || l.address)}${l.phone ? ` · <a href="tel:${esc(l.phone)}">${esc(l.phone)}</a>` : ''}${l.email ? ` · ${esc(l.email)}` : ''}${l.rating ? ` · ★ ${esc(l.rating)} (${esc(l.reviewsCount)})` : ''}</p>
    ${l.quote ? `<p class="small" style="margin-top:6px">“${esc(l.quote)}”</p>` : ''}
    ${l.signals && (l.signals.answering.length || l.signals.online.length) ? `<p class="tiny muted" style="margin-top:4px">On their site: ${esc([...l.signals.answering, ...l.signals.online].join(', '))}</p>` : ''}
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <a class="btn ghost sm" href="/d/${esc(l.slug)}" target="_blank" rel="noopener">Their demo page</a>
      ${['contacted', 'visited'].includes(l.status) ? `<form method="post" action="/admin/leads?key=${k}"><input type="hidden" name="do" value="mark"><input type="hidden" name="id" value="${esc(l.id)}"><input type="hidden" name="status" value="replied"><button class="btn ghost sm">They replied — stop emails</button></form>` : ''}
    </div>
  </div>`;
  }).join('')}
  </div>`;
  return page({ title: 'Outreach — SecondLine', body });
}

module.exports = { landing, setup, dashboard, settings, goLive, login, admin, notFound, esc, personal, unsubscribeConfirm, unsubscribed, adminLeads };
