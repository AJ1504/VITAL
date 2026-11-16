'use strict';
// The receptionist. A scripted conversation that sounds like a person checking
// the book: greet → understand the problem → book or call back → name, address,
// number → confirm everything back → goodbye. The words are always ours (never
// free-form generated), so the receptionist can't wander off-script.

const cal = require('./calendar');
const { detectEmergency } = require('./trades');
const { id, digits } = require('./store');

// ---------- language helpers ----------

const FILLER = /^(hi|hello|hey|yeah|yes|yep|um+|uh+|er+|so|well|okay|ok|oh|good (morning|afternoon|evening)|hi there|hey there|how are you|yes hi|hi yes)[\s,.!?-]+/i;
const LEADS = [
  /^(i'?m|i am) (calling|ringing) (because|about|cause|'cause|to see if|for|since)\s*/i,
  /^(i was|i'?m) (wondering|hoping) if (you|someone|somebody) (could|can|might)( come( out)?( and)?)?\s*/i,
  /^(i|we) (need|want|would like) (someone|somebody|a (plumber|guy|tech|technician|electrician|roofer|tow|locksmith)) to (come (out )?(and |to )?)?/i,
  /^(can|could) (you|someone|somebody) (come (out )?(and |to )?)?/i,
  /^(i|we) (need|want) (help with|a quote (on|for)|an estimate (on|for))\s*/i,
  /^(i'?ve|i have|we'?ve|we have) got\s+/i,
  /^(i|we) (have|got)\s+/i,
  /^there'?s\s+/i,
  /^((i|we) )?(need|want|would like|looking for) (some )?help (with|on)\s+/i,
  /^(take a look at|have a look at|look at|check( out)?|fix|repair|come (out )?(and )?(look at|fix|check))\s+/i,
  /^(on |this |next )?(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)( (morning|afternoon|evening))?\s+/i,
  /^(for|about|with|regarding)\s+/i,
];
const TIME_ONLY = /^(as soon as possible|asap|soon|(on |this |next )?(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|weekend)( (morning|afternoon|evening))?)$/i;
const TIME_TAIL = /[,\s]+(on |this |next )?(today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week)( (morning|afternoon|evening))?( if (you can|possible))?$/i;

function cleanNeed(text) {
  let t = String(text || '').trim();
  for (let i = 0; i < 6; i++) {
    const before = t;
    t = t.replace(FILLER, '');
    for (const re of LEADS) t = t.replace(re, '');
    t = t.replace(/[\s,.!?]+$/, '').replace(TIME_TAIL, '').replace(TIME_ONLY, '');
    if (t === before) break;
  }
  const clause = t.split(/\s*(?:,|;|\.|\band (?:it'?s|its|i'?m|we'?re|now)\b|\bbut\b|\bso\b)\s+/i)[0];
  if (clause && clause.split(/\s+/).length >= 3) t = clause;
  const words = t.split(/\s+/);
  if (words.length > 16) t = words.slice(0, 16).join(' ').replace(/[,;:]$/, '') + '…';
  return t;
}

// "my sink is leaking" -> "your sink is leaking"
function secondPerson(text) {
  const map = { i: 'you', me: 'you', my: 'your', mine: 'yours', "i'm": "you're", im: "you're", "i've": "you've", "i'll": "you'll", "i'd": "you'd", our: 'your', we: 'you', "we're": "you're", "we've": "you've", us: 'you', myself: 'yourself' };
  return text.replace(/\b(i'm|i've|i'll|i'd|we're|we've|im|i|me|my|mine|our|we|us|myself)\b/gi, (w) => map[w.toLowerCase()] || w);
}
// "my sink is leaking" -> "Sink is leaking" (for the owner's text)
function ownerView(text) {
  const t = text.replace(/^(my|our|the|a|an)\s+/i, '').replace(/\b(my|our)\b/gi, 'the');
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

const NUM_WORDS = { zero: '0', oh: '0', o: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
function extractPhone(text) {
  const t = String(text || '').toLowerCase().replace(/\b(zero|oh|o|one|two|three|four|five|six|seven|eight|nine)\b/g, (w) => NUM_WORDS[w]);
  const d = t.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') return d.slice(1);
  if (d.length === 10) return d;
  return null;
}
function formatPhone(p) {
  const d = digits(p);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : (p || '');
}
function lastFourSpoken(p) { return digits(p).slice(-4).split('').join(' '); }

const NAME_STOP = new Set(['calling', 'looking', 'having', 'trying', 'wondering', 'not', 'just', 'at', 'in', 'the', 'a', 'an', 'about', 'urgent', 'my', 'here', 'sure', 'yes', 'yeah', 'no', 'ok', 'okay', 'hoping', 'going', 'with', 'from', 'on', 'so', 'really', 'very', 'locked', 'stuck', 'out', 'having', 'getting', 'still', 'it', 'is', 'um', 'uh', 'well', 'this', 'that', 'good', 'fine', 'great', 'there']);
function titleCase(s) { return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()); }

function extractName(text, { asked = false } = {}) {
  const t = String(text || '').trim().replace(/[.!?,]+$/, '');
  const pat = asked
    ? /\b(?:my name is|my name's|name is|name's|this is|it's|it is|i'm|i am|im|call me|it's uh|this is uh)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?)/i
    : /\b(?:my name is|my name's|name's)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?)/i;
  const m = t.match(pat);
  if (m) {
    const words = m[1].split(/\s+/).filter((w) => !NAME_STOP.has(w.toLowerCase()));
    if (words.length && !NAME_STOP.has(m[1].split(/\s+/)[0].toLowerCase())) return titleCase(words.join(' '));
  }
  if (!asked) return null;
  const words = t.replace(FILLER, '').split(/[\s,]+/).filter((w) => /^[a-z][a-z'-]*$/i.test(w) && !NAME_STOP.has(w.toLowerCase()));
  if (words.length >= 1 && words.length <= 4) return titleCase(words.slice(0, 3).join(' '));
  return null;
}

const YES = /\b(yes|yeah|yep|yup|ya|sure|correct|right|ok|okay|sounds good|that works|perfect|please|go ahead|absolutely|definitely|it is|that's right|thats right|uh huh|mhm|that's me|that one)\b/i;
const NO = /\b(no|nope|nah|not really|that's all|thats all|that's it|thats it|i'm good|im good|all set|nothing( else)?|we're good|that's everything|i think that's it|that'll do|that will do)\b/i;
const CALLBACK = /\b(call (me )?back|callback|call back|have (him|her|them|\w+) (call|ring|phone)|call me|ring me|phone me|talk to (him|her|them|\w+)|speak (to|with) (him|her|them|\w+))\b/i;
const BOOK = /\b(book|schedule|come out|send (someone|somebody)|appointment|get (me )?on the (schedule|calendar|books?)|book me|in now|now is (good|fine)|first available|soonest|asap|yes)\b/i;
const ROBOT = /\b(robot|a bot|bot\b|\bai\b|a\.i\.|artificial|automated|real person|a human|human being|machine|computer|recording|are you real|is this a person|answering service)\b/i;
const HANDOFF = /\b(talk|speak) (to|with) (a |an )?(real |actual )?(person|human|someone|somebody|the owner|the boss|owner|manager|a live person)\b/i;
const PRICE = /\b(how much|price|pricing|cost|charge|quote|estimate|rates?|fees?)\b/i;
const HOURS = /\b(your hours|what time (do|are) you|when (are|do) you (open|close)|are you open|open (today|tomorrow|on))\b/i;

const ASKS = /^(do|does|can|could|would|will|are|is) (you|ya|y'all|your|u)\b/i;
const DOW = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
function parsePref(text) {
  const t = String(text || '').toLowerCase();
  const p = {};
  if (/\btoday\b|\bthis (morning|afternoon|evening)\b|\btonight\b/.test(t)) p.dayOffset = 0;
  else if (/\btomorrow\b/.test(t)) p.dayOffset = 1;
  else {
    for (const [name, n] of Object.entries(DOW)) if (new RegExp(`\\b${name}\\b`).test(t)) { p.dow = n; break; }
  }
  if (/\bmorning\b|\bearly\b|\bbefore (noon|lunch)\b|\bam\b/.test(t)) p.part = 'morning';
  else if (/\bafternoon\b|\bafter (noon|lunch)\b|\bpm\b|\blater in the day\b/.test(t)) p.part = 'afternoon';
  else if (/\bevening\b|\btonight\b|\bafter work\b/.test(t)) p.part = 'evening';
  return p;
}
function prefEmpty(p) { return p.dayOffset == null && p.dow == null && !p.part; }

function slotMatches(slot, pref, tz, now) {
  const s = cal.zonedParts(new Date(slot.start), tz);
  const n = cal.zonedParts(now, tz);
  if (pref.dow != null && s.dow !== pref.dow) return false;
  if (pref.dayOffset != null && (Date.UTC(s.y, s.m - 1, s.d) - Date.UTC(n.y, n.m - 1, n.d)) / 86400000 !== pref.dayOffset) return false;
  if (pref.part === 'morning' && s.h >= 12) return false;
  if (pref.part === 'afternoon' && (s.h < 12 || s.h >= 17)) return false;
  if (pref.part === 'evening' && s.h < 16) return false;
  return true;
}

// Returns 0/1 for a chosen slot, -1 for "neither", null if unclear.
function pickSlot(text, offered, tz, now) {
  const t = String(text || '').toLowerCase();
  if (/\b(first|1st|former|earlier|sooner|earliest|the one)\b/.test(t) && !/\b(second|2nd|latter)\b/.test(t)) return 0;
  if (/\b(second|2nd|latter|later one|other one|last one|the other)\b/.test(t)) return offered.length > 1 ? 1 : 0;
  const pref = parsePref(t);
  if (!prefEmpty(pref)) {
    const i = offered.findIndex((s) => slotMatches(s, pref, tz, now));
    if (i >= 0) return i;
    return -1;
  }
  if (/\b(neither|none|no|nope|can't|cannot|doesn't work|don't work|won't work|not good|busy)\b/.test(t)) return -1;
  if (/\b(either|any|whichever|doesn't matter|don't care|whatever|whenever|both)\b/.test(t)) return 0;
  if (YES.test(t)) return 0;
  return null;
}

const GENERIC = new Set(['water', 'repair', 'repairs', 'service', 'services', 'system', 'systems', 'full', 'with', 'installations', 'maintenance']);
function matchService(text, services) {
  const t = String(text || '').toLowerCase();
  for (const s of services || []) {
    const stems = s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 4 && !GENERIC.has(w)).map((w) => w.slice(0, 4));
    if (stems.some((st) => new RegExp(`\\b${st}`).test(t))) return s;
  }
  return null;
}

function contentWords(text) {
  return cleanNeed(text).split(/\s+/).filter((w) => w.length > 2 && !/^(hi|hello|hey|yes|yeah|okay|the|and|um|uh|there|how|are|you|doing)$/i.test(w));
}

// ---------- the conversation ----------

function ctxFor(biz) {
  const owner = biz.ownerName || 'the owner';
  const cbm = biz.callbackMinutes || 60;
  return {
    owner,
    biz: biz.name,
    agent: biz.agentName || 'Jamie',
    callbackWindow: cbm <= 60 ? 'within the hour' : `within ${Math.round(cbm / 60)} hours`,
    urgentWindow: 'within 15 minutes',
    tz: biz.timezone,
  };
}

function greeting(biz) {
  if (biz.greeting && biz.greeting.trim()) return biz.greeting.trim();
  const c = ctxFor(biz);
  return `Hi, this is ${c.biz}'s office, ${c.agent} speaking. How can I help?`;
}

function question(step, call, c) {
  const d = call.data;
  switch (step) {
    case 'need': return 'What can we help you with today?';
    case 'choice': return `I can have ${c.owner} call you back ${c.callbackWindow}, or I can book you in now — which works better?`;
    case 'name': return 'Can I get your name?';
    case 'address': return `What's the address for the job?`;
    case 'phone': return call.callerPhone && call.channel === 'sms'
      ? 'Is this number the best one to reach you?'
      : call.callerPhone
      ? `Is the number you're calling from, ending in ${lastFourSpoken(call.callerPhone)}, the best one to reach you?`
      : `What's the best number to reach you?`;
    case 'phoneNew': return `What's the best number to reach you?`;
    case 'slot': return 'Which works better?';
    case 'slotPref': return 'What day and time suit you best?';
    case 'anything': return `Anything else I should pass along to ${c.owner}?`;
    default: return '';
  }
}

function newCall(biz, { channel = 'voice', callerPhone = null, externalId = null, now = new Date() } = {}) {
  const call = {
    id: id('call'), externalId, businessId: biz.id, channel,
    callerPhone: callerPhone && digits(callerPhone).length >= 10 ? digits(callerPhone) : null,
    startedAt: now.toISOString(), endedAt: null,
    step: 'need', misses: 0, notesAsked: 0,
    data: { need: null, needRaw: null, service: null, emergency: null, name: null, address: null, phone: null, outcome: null, bookingId: null, slot: null, notes: [] },
    offered: [],
    transcript: [],
    alerts: { urgent: false, summary: false },
  };
  const say = greeting(biz);
  call.transcript.push({ who: 'agent', text: say, at: now.toISOString() });
  return { call, say };
}

// deps: { bookings: () => [], addBooking(b), onUrgent(call), summarize(text) -> Promise<string|null>, now }
async function respond(biz, call, rawText, deps = {}) {
  deps = { services: biz.services, ...deps };
  const now = deps.now || new Date();
  const c = ctxFor(biz);
  const text = String(rawText || '').trim();
  const d = call.data;
  if (text) call.transcript.push({ who: 'caller', text, at: now.toISOString() });

  const out = (say, end = false) => {
    call.transcript.push({ who: 'agent', text: say, at: new Date().toISOString() });
    if (end) { call.step = 'done'; }
    return { say, end };
  };

  if (call.step === 'done') return { say: '', end: true };

  // Nothing heard.
  if (!text) {
    call.misses++;
    if (call.misses >= 2) {
      if (!d.outcome) d.outcome = call.callerPhone ? 'callback' : 'incomplete';
      return out(call.callerPhone
        ? `Sorry, the line's not great. I'll have ${c.owner} call you back at this number. Thanks for calling ${c.biz}.`
        : `Sorry, I'm having trouble hearing you. Please try us again in a moment. Thanks for calling ${c.biz}.`, true);
    }
    return out(`Sorry, I didn't catch that. ${question(call.step, call, c)}`);
  }
  call.misses = 0;

  // Emergencies jump the queue in the open-ended steps.
  const freeSteps = ['need', 'choice', 'anything', 'slot', 'slotPref'];
  if (!d.emergency && freeSteps.includes(call.step)) {
    const e = detectEmergency(text);
    if (e) {
      d.emergency = { label: e.label, tip: e.tip };
      if (!d.needRaw) await captureNeed(call, text, deps);
      d.outcome = 'urgent';
      if (deps.onUrgent) await deps.onUrgent(call);
      call.alerts.urgent = true;
      const next = nextMissing(call);
      call.step = next;
      if (next === 'finish') return finish(biz, call, c, out, deps);
      return out(`That sounds urgent — I'm getting ${c.owner} on it right away. ${question(next, call, c)}`);
    }
  }

  // Asking if we're a robot, or asking for a person.
  if (HANDOFF.test(text) || (/\b(owner|boss)\b/.test(text.toLowerCase()) && /\b(talk|speak)\b/i.test(text))) {
    if (d.outcome !== 'urgent' && d.outcome !== 'booked') d.outcome = 'callback';
    if (!d.needRaw && call.step === 'need') d.needRaw = '';
    const next = nextMissing(call);
    call.step = next;
    const lead = `${c.owner} is out on a job right now, so I'll have ${c.owner} call you back ${d.outcome === 'urgent' ? c.urgentWindow : c.callbackWindow}.`;
    if (next === 'finish') return finish(biz, call, c, out, deps);
    return out(`${lead} ${question(next, call, c)}`);
  }
  if (ROBOT.test(text) && /\?|\b(are you|is this|am i)\b/i.test(text)) {
    return out(`I'm the office assistant here at ${c.biz}. I can get you booked in, or have ${c.owner} call you back. ${question(call.step, call, c)}`);
  }

  switch (call.step) {
    case 'need': {
      if (PRICE.test(text) && contentWords(text).length < 6) {
        return out(`${c.owner} gives exact prices after seeing the job. What's going on — I can get you on the schedule.`);
      }
      if (HOURS.test(text)) {
        return out(`We're out on jobs ${cal.spokenHours(biz.hours)}, and I answer the phone any time. What can we help you with?`);
      }
      d.pref = Object.assign({}, d.pref, parsePref(text));
      if (!cleanNeed(text) && !matchService(text, biz.services)) {
        call.vague = (call.vague || 0) + 1;
        if (call.vague < 2) return out(`Sure, we can get someone out. What's the job?`);
      }
      if (contentWords(text).length < 2 && !matchService(text, biz.services) && (call.vague || 0) < 2) {
        const name = extractName(text);
        if (name) d.name = name;
        return out(`Sure${d.name ? ', ' + d.name.split(' ')[0] : ''}. What's going on — what can we help you with?`);
      }
      const nm = extractName(text);
      if (nm) d.name = nm;
      await captureNeed(call, text, deps);
      call.step = 'choice';
      let readback = d.needSpoken ? `Got it — ${d.needSpoken}.` : 'Got it.';
      if (ASKS.test(text.replace(FILLER, ''))) {
        const svc = d.service;
        readback = svc ? `Yes, we handle ${svc.toLowerCase().replace(/ & /g, ' and ')}.` : `Let me get the details over to ${c.owner}.`;
        if (svc) d.need = svc;
        d.needSpoken = null;
      }
      let priceNote = '';
      if (PRICE.test(text)) priceNote = ` ${c.owner} gives exact prices after seeing the job.`;
      return out(`${readback}${priceNote} ${question('choice', call, c)}`);
    }

    case 'choice': {
      if (CALLBACK.test(text)) d.outcome = 'callback';
      else if (BOOK.test(text)) d.outcome = 'booked';
      else if (PRICE.test(text)) return out(`${c.owner} gives exact prices after seeing the job. ${question('choice', call, c)}`);
      else if (NO.test(text)) d.outcome = 'callback';
      else {
        call.choiceAsks = (call.choiceAsks || 0) + 1;
        if (call.choiceAsks < 2) return out(`No problem. Would you like a call back from ${c.owner}, or should I book a visit?`);
        d.outcome = 'booked';
      }
      const next = nextMissing(call);
      call.step = next;
      if (next === 'finish') return finish(biz, call, c, out, deps);
      return out(`${d.outcome === 'callback' ? 'Sure thing.' : 'Great, let’s get you on the schedule.'} ${question(next, call, c)}`);
    }

    case 'name': {
      const name = extractName(text, { asked: true });
      if (!name) {
        call.nameAsks = (call.nameAsks || 0) + 1;
        if (call.nameAsks < 2) return out(`Sorry, could you tell me your name one more time?`);
        d.name = 'Caller';
      } else d.name = name;
      return advance(biz, call, c, out, deps, `Thanks, ${d.name.split(' ')[0]}.`);
    }

    case 'address': {
      const t = text.replace(FILLER, '').replace(/^(it's|it is|the address is|we're at|i'm at|i am at|we are at|at)\s+/i, '').replace(/[.!?]+$/, '');
      if (t.split(/\s+/).length < 2 && !/\d/.test(t)) {
        call.addrAsks = (call.addrAsks || 0) + 1;
        if (call.addrAsks < 2) return out('Sorry, what was the street address?');
      }
      d.address = titleCase(t).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (m, n, s) => n + s.toLowerCase());
      return advance(biz, call, c, out, deps, `${d.address}, got it.`);
    }

    case 'phone': {
      const p = extractPhone(text);
      if (p) { d.phone = p; return advance(biz, call, c, out, deps, 'Perfect.'); }
      if (call.callerPhone && YES.test(text) && !/\bno\b/i.test(text)) { d.phone = call.callerPhone; return advance(biz, call, c, out, deps, 'Perfect.'); }
      if (call.callerPhone && NO.test(text)) { call.step = 'phoneNew'; return out(question('phoneNew', call, c)); }
      return out(call.callerPhone ? `Sorry — should ${c.owner} reach you at the number ending in ${lastFourSpoken(call.callerPhone)}?` : 'Sorry, what was that number? Just the digits is fine.');
    }

    case 'phoneNew': {
      const p = extractPhone(text);
      if (!p) return out('Sorry, could you say the full number with the area code?');
      d.phone = p;
      return advance(biz, call, c, out, deps, 'Got it.');
    }

    case 'slot': {
      const i = pickSlot(text, call.offered, c.tz, now);
      if (i === null) return out(`Sorry — was that ${cal.speakSlot(call.offered[0], c.tz, now)}${call.offered[1] ? `, or ${cal.speakSlot(call.offered[1], c.tz, now)}` : ''}?`);
      if (i === -1) {
        const pref = parsePref(text);
        if (!prefEmpty(pref)) return offer(biz, call, c, out, deps, pref, 'Let me look…');
        call.step = 'slotPref';
        return out(`No problem. ${question('slotPref', call, c)}`);
      }
      return book(biz, call, c, out, deps, call.offered[i]);
    }

    case 'slotPref': {
      const pref = parsePref(text);
      if (prefEmpty(pref) && /\b(any|whenever|soon|asap|first)\b/i.test(text)) return offer(biz, call, c, out, deps, {}, 'Okay, let me check…');
      return offer(biz, call, c, out, deps, pref, 'Let me check the book…');
    }

    case 'anything': {
      if (NO.test(text) && contentWords(text).length < 5) return goodbye(call, c, out);
      if (PRICE.test(text)) { call.notesAsked++; d.notes.push(text); return out(`${c.owner} will go over pricing with you. Anything else?`); }
      d.notes.push(text);
      call.notesAsked++;
      if (call.notesAsked >= 2) return goodbye(call, c, out, `Got it, I'll pass that along to ${c.owner}.`);
      return out(`Got it, I'll pass that along to ${c.owner}. Anything else?`);
    }

    default:
      return goodbye(call, c, out);
  }
}

async function captureNeed(call, text, deps) {
  const d = call.data;
  const cleaned = cleanNeed(text) || text;
  d.needRaw = text;
  d.pref = Object.assign({}, d.pref, parsePref(text));
  d.service = matchService(text, deps.services) || null;
  let summary = null;
  if (deps.summarize) {
    try { summary = await deps.summarize(text); } catch { summary = null; }
  }
  const base = summary || cleaned;
  d.need = ownerView(base);
  d.needSpoken = secondPerson(base.charAt(0).toLowerCase() + base.slice(1));
  if (d.needSpoken.split(/\s+/).length > 14) d.needSpoken = null;
}

function nextMissing(call) {
  const d = call.data;
  if (!d.name) return 'name';
  if (!d.address) return 'address';
  if (!d.phone) return 'phone';
  if (d.outcome === 'booked' && !d.bookingId) return 'slot';
  return 'finish';
}

async function advance(biz, call, c, out, deps, ack) {
  const next = nextMissing(call);
  if (next === 'slot') return offer(biz, call, c, out, deps, {}, `${ack} Let me check the book…`);
  if (next === 'finish') return finish(biz, call, c, out, deps, ack);
  call.step = next;
  return out(`${ack} ${question(next, call, c)}`);
}

async function offer(biz, call, c, out, deps, pref, lead) {
  const now = deps.now || new Date();
  const bookings = deps.bookings ? deps.bookings() : [];
  if (prefEmpty(pref) && call.data.pref && !call.offered.length) pref = call.data.pref;
  const { slots, matchedPreference } = cal.offerSlots(biz, bookings, pref, now);
  if (!slots.length) {
    call.data.outcome = 'callback';
    return finish(biz, call, c, out, deps, `${lead} The book's full this week, so I'll have ${c.owner} call you to find a time.`);
  }
  call.offered = slots;
  call.step = 'slot';
  const sorry = !prefEmpty(pref) && !matchedPreference ? ' That time’s taken, but' : '';
  const opts = slots.length === 2
    ? `I've got ${cal.speakSlot(slots[0], c.tz, now)}, or ${cal.speakSlot(slots[1], c.tz, now)}. Which works better?`
    : `I've got ${cal.speakSlot(slots[0], c.tz, now)}. Does that work?`;
  return out(`${lead}${sorry} ${opts}`.replace(/\s+/g, ' '));
}

async function book(biz, call, c, out, deps, slot) {
  const d = call.data;
  const booking = {
    businessId: biz.id, callId: call.id, start: slot.start, end: slot.end,
    customerName: d.name, phone: d.phone, address: d.address, need: d.need, emergency: !!d.emergency,
    test: call.channel === 'test' || call.channel === 'demo',
  };
  const saved = deps.addBooking ? deps.addBooking(booking) : Object.assign({ id: id('job') }, booking);
  d.bookingId = saved.id;
  d.slot = slot;
  d.outcome = d.emergency ? 'urgent' : 'booked';
  const now = deps.now || new Date();
  return finish(biz, call, c, out, deps,
    `Great — you're booked for ${cal.speakSlot(slot, c.tz, now)}. That's ${d.name.split(' ')[0]}${d.needSpoken && d.needSpoken.split(' ').length <= 7 ? ', ' + d.needSpoken.replace(/^your /, '') : ''}, at ${d.address}. ${c.owner} will text you before heading over.`);
}

function finish(biz, call, c, out, deps, lead = '') {
  const d = call.data;
  let msg = lead;
  if (d.outcome === 'urgent' && !d.bookingId) {
    msg += ` Okay${d.name && d.name !== 'Caller' ? ' ' + d.name.split(' ')[0] : ''}, I've marked this urgent and texted ${c.owner} — expect a call back ${c.urgentWindow}.`;
    if (d.emergency && d.emergency.tip) msg += ` In the meantime: ${d.emergency.tip}`;
  } else if (d.outcome === 'callback') {
    msg += ` ${c.owner} will call you back ${c.callbackWindow}${d.phone ? ' at that number' : ''}.`;
  }
  call.step = 'anything';
  return out(`${msg} ${question('anything', call, c)}`.replace(/\s+/g, ' ').trim());
}

function goodbye(call, c, out, lead = '') {
  return out(`${lead} Thanks for ${call.channel === 'sms' ? 'texting' : 'calling'} ${c.biz}. Take care.`.trim(), true);
}

// Was there anything worth acting on? (Decides "handled" vs "missed".)
function isMeaningful(call) {
  const d = call.data;
  return !!(d.needRaw || d.name || d.address || d.phone || d.bookingId);
}

module.exports = {
  newCall, respond, greeting, isMeaningful, formatPhone,
  // exported for tests
  cleanNeed, secondPerson, extractName, extractPhone, parsePref, pickSlot, matchService,
};
