'use strict';
// The offer and the three emails. Everything here is plain text: it reads like
// a person wrote it, and lands in the inbox instead of promotions.
//
// The offer stacks every reason to say yes:
//   1. It's already built for them — a personal page where their own
//      receptionist answers with their business name.
//   2. 7 days free, no card.
//   3. Founding-shop deal: no setup fee (normally $200), limited spots.
//   4. A guarantee: no job caught in 30 days → next month free.
//   5. Cancel in two taps.
// Every term is set by an environment variable, so it can be changed without code.

const { TRADES } = require('../trades');

function offer(now = new Date()) {
  const deadlineDays = +process.env.OFFER_DEADLINE_DAYS || 14;
  const deadline = new Date(now.getTime() + deadlineDays * 86400000);
  return {
    setupFee: 200,
    monthly: 300,
    setupWaived: process.env.OFFER_SETUP_WAIVED !== '0',
    spots: +process.env.OFFER_SPOTS || 10,
    guarantee: process.env.OFFER_GUARANTEE === '0' ? null
      : (process.env.OFFER_GUARANTEE || "If it doesn't catch you a job in your first 30 days, your second month is free."),
    deadlineDays,
    deadline,
    deadlineText: deadline.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
  };
}

function sender() {
  return {
    name: process.env.OUTREACH_FROM_NAME || '',
    email: process.env.OUTREACH_FROM_EMAIL || '',
    replyTo: process.env.OUTREACH_REPLY_TO || process.env.OUTREACH_FROM_EMAIL || '',
    company: process.env.OUTREACH_COMPANY || 'SecondLine',
    address: process.env.OUTREACH_ADDRESS || '',
    phone: process.env.OUTREACH_PHONE || '',
  };
}

// CAN-SPAM needs a real sender and a physical postal address before anything goes out.
function senderProblems(s = sender()) {
  const p = [];
  if (!s.name) p.push('OUTREACH_FROM_NAME (your name)');
  if (!s.email) p.push('OUTREACH_FROM_EMAIL (a mailbox you read)');
  if (!s.address) p.push('OUTREACH_ADDRESS (a real postal address — required by law in every cold email)');
  return p;
}

const JOB = { plumbing: 'a $1,200 water heater', hvac: 'a $6,000 furnace', electrical: 'a $2,500 panel upgrade', roofing: 'a $10,000 roof', towing: 'a $300 tow', locksmith: 'a $250 lockout', other: 'a $500 job' };

function offerLines(o) {
  const lines = [
    '- 7 days free. No card.',
    o.setupWaived ? `- No setup fee (normally $${o.setupFee}) — for the first ${o.spots} shops only.` : `- $${o.setupFee} setup, and we do all of it on one 30-minute call.`,
    `- Then $${o.monthly}/month. Cancel anytime in two taps.`,
  ];
  if (o.guarantee) lines.push(`- ${o.guarantee}`);
  return lines.join('\n');
}

function footer(s, unsubUrl) {
  return [
    '',
    `${s.name}`,
    `${s.company}${s.phone ? ' · ' + s.phone : ''}`,
    s.address,
    '',
    `Not interested? ${unsubUrl} and you won't hear from me again.`,
  ].join('\n');
}

// step 1 = first email, 2 = 3 days later, 3 = last note a week in.
function draft(lead, step, { baseUrl, now = new Date() } = {}) {
  const o = offer(now);
  const s = sender();
  const link = `${baseUrl}/d/${lead.slug}`;
  const unsub = `${baseUrl}/u/${lead.unsubToken}`;
  const hi = lead.ownerName ? `Hi ${lead.ownerName},` : 'Hi there,';
  const job = JOB[lead.trade] || JOB.other;
  const biz = lead.name;
  const deadlineText = lead.offerDeadline ? new Date(lead.offerDeadline).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : o.deadlineText;
  let subject, body;

  if (step === 1) {
    subject = lead.quote ? `A customer couldn't reach ${biz}` : `I built ${biz} a receptionist`;
    body = [
      hi,
      '',
      lead.quote
        ? `One of your Google reviews says:\n\n  "${lead.quote}"\n\nEvery call like that is usually ${job} going to the next shop on the list.`
        : `When you're on a job and can't pick up, most callers don't leave a voicemail — they call the next shop. One of those is usually ${job}.`,
      '',
      `So I set up a receptionist for ${biz}. It answers every call in seconds as "${biz}'s office", books the job into your calendar, and texts you the details. Day and night.`,
      '',
      `It's already built. Try it as if you're a customer (takes a minute):`,
      link,
      '',
      'If you want it on your phone line:',
      offerLines(o),
      '',
      'One saved job a month pays for the entire year.',
      footer(s, unsub),
    ].join('\n');
  } else if (step === 2) {
    subject = `Re: ${lead.quote ? `A customer couldn't reach ${biz}` : `I built ${biz} a receptionist`}`;
    body = [
      hi,
      '',
      `Quick follow-up — your receptionist for ${biz} is still set up and waiting:`,
      link,
      '',
      `Pretend you're a customer with ${lead.trade === 'towing' ? 'a dead battery' : 'a problem'}. It'll book you in and show you the text you'd get.`,
      '',
      `A part-time receptionist runs $2,000+ a month and goes home at five. This is $${o.monthly}, picks up at 3am${o.setupWaived ? ', and the setup fee is waived for the first ' + o.spots + ' shops' : ''}.`,
      footer(s, unsub),
    ].join('\n');
  } else {
    subject = `Last note about ${biz}'s receptionist`;
    body = [
      hi,
      '',
      `Last email from me. The free week${o.setupWaived ? ' and the no-setup-fee offer' : ''} for ${biz} hold${o.setupWaived ? '' : 's'} until ${deadlineText}:`,
      link,
      '',
      o.guarantee ? `And the catch-a-job guarantee stands: ${o.guarantee.charAt(0).toLowerCase() + o.guarantee.slice(1)}` : '',
      '',
      `If now's not the time, no worries — just reply "later" and I'll check back in a few months.`,
      footer(s, unsub),
    ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  }
  return { subject, text: body, unsubUrl: unsub, link };
}

function tradeServices(trade) { return (TRADES[trade] || TRADES.other).services; }

module.exports = { offer, sender, senderProblems, draft, offerLines, tradeServices };
