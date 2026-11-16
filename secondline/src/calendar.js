'use strict';
// Scheduling: business hours, open arrival windows, bookings, and the .ics feed
// the owner subscribes to on their phone. All times are stored in UTC and shown
// in the business's own time zone.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WINDOW_HOURS = 2;

const DEFAULT_HOURS = {
  mon: [7, 18], tue: [7, 18], wed: [7, 18], thu: [7, 18], fri: [7, 18],
  sat: [8, 14], sun: null,
};

function zonedParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
  });
  const p = {};
  for (const { type, value } of f.formatToParts(date)) p[type] = value;
  return {
    y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute,
    dow: DAYS.indexOf(p.weekday.slice(0, 3).toLowerCase()),
  };
}

// Wall-clock time in `tz` -> real Date.
function zonedToUtc(y, m, d, h, mi, tz) {
  let guess = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi);
    guess -= asUtc - Date.UTC(y, m - 1, d, h, mi);
  }
  return new Date(guess);
}

function hour12(h) {
  const v = h % 12 === 0 ? 12 : h % 12;
  return String(v);
}
function partOfDay(h) {
  if (h < 12) return 'in the morning';
  if (h < 17) return 'in the afternoon';
  return 'in the evening';
}

function dayLabel(start, tz, now = new Date()) {
  const a = zonedParts(start, tz);
  const n = zonedParts(now, tz);
  const dayNum = (p) => Date.UTC(p.y, p.m - 1, p.d) / 86400000;
  const diff = dayNum(a) - dayNum(n);
  if (diff === 0) return 'today';
  if (diff === 1) return 'tomorrow';
  if (diff < 7) return DAY_NAMES[a.dow];
  return `${DAY_NAMES[a.dow]} the ${ordinal(a.d)}`;
}
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Spoken: "tomorrow between 8 and 10 in the morning"
function speakSlot(slot, tz, now) {
  const s = zonedParts(new Date(slot.start), tz);
  const e = zonedParts(new Date(slot.end), tz);
  return `${dayLabel(new Date(slot.start), tz, now)} between ${hour12(s.h)} and ${hour12(e.h)} ${partOfDay(s.h)}`;
}

// Written: "Tue Nov 17, 8–10am"
function shortSlot(slot, tz) {
  const start = new Date(slot.start);
  const s = zonedParts(start, tz);
  const e = zonedParts(new Date(slot.end), tz);
  const date = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(start);
  const ap = (h) => (h < 12 ? 'am' : 'pm');
  const range = ap(s.h) === ap(e.h)
    ? `${hour12(s.h)}–${hour12(e.h)}${ap(e.h)}`
    : `${hour12(s.h)}${ap(s.h)}–${hour12(e.h)}${ap(e.h)}`;
  return `${date}, ${range}`;
}

function overlaps(a, b) {
  return new Date(a.start) < new Date(b.end) && new Date(b.start) < new Date(a.end);
}

// All open arrival windows for the next `days` days.
function openSlots(biz, bookings, { now = new Date(), days = 10, leadHours = 2 } = {}) {
  const tz = biz.timezone;
  const hours = biz.hours || DEFAULT_HOURS;
  const earliest = new Date(now.getTime() + leadHours * 3600000);
  const taken = bookings.filter((b) => b.businessId === biz.id && b.status !== 'cancelled');
  const out = [];
  const today = zonedParts(now, tz);
  for (let i = 0; i < days; i++) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + i, 12));
    const y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
    const range = hours[DAYS[base.getUTCDay()]];
    if (!range) continue;
    const [open, close] = range;
    for (let h = open; h + WINDOW_HOURS <= close; h += WINDOW_HOURS) {
      const slot = {
        start: zonedToUtc(y, m, d, h, 0, tz).toISOString(),
        end: zonedToUtc(y, m, d, h + WINDOW_HOURS, 0, tz).toISOString(),
      };
      if (new Date(slot.start) < earliest) continue;
      if (taken.some((b) => overlaps(b, slot))) continue;
      out.push(slot);
    }
  }
  return out;
}

// Pick two windows to offer. Honors a preference like { day: 2, part: 'morning' }.
function offerSlots(biz, bookings, pref = {}, now = new Date()) {
  const tz = biz.timezone;
  let slots = openSlots(biz, bookings, { now });
  const matches = (s) => {
    const p = zonedParts(new Date(s.start), tz);
    if (pref.dow != null && p.dow !== pref.dow) return false;
    if (pref.dayOffset != null) {
      const n = zonedParts(now, tz);
      const diff = (Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(n.y, n.m - 1, n.d)) / 86400000;
      if (diff !== pref.dayOffset) return false;
    }
    if (pref.part === 'morning' && p.h >= 12) return false;
    if (pref.part === 'afternoon' && (p.h < 12 || p.h >= 17)) return false;
    if (pref.part === 'evening' && p.h < 16) return false;
    return true;
  };
  const preferred = slots.filter(matches);
  const pool = preferred.length ? preferred : slots;
  if (pool.length <= 2) return { slots: pool, matchedPreference: preferred.length > 0 };
  // Offer the first window plus one on a different half-day so the choice is real.
  const first = pool[0];
  const fp = zonedParts(new Date(first.start), tz);
  const second = pool.find((s) => {
    const p = zonedParts(new Date(s.start), tz);
    return p.d !== fp.d || (p.h < 12) !== (fp.h < 12);
  }) || pool[1];
  return { slots: [first, second], matchedPreference: preferred.length > 0 };
}

function formatHours(hours) {
  const h = hours || DEFAULT_HOURS;
  const t = (x) => `${hour12(x)}${x < 12 ? 'am' : 'pm'}`;
  const groups = [];
  for (const day of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
    const v = h[day] ? `${t(h[day][0])}–${t(h[day][1])}` : 'Closed';
    const last = groups[groups.length - 1];
    if (last && last.v === v) last.days.push(day); else groups.push({ v, days: [day] });
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  return groups.map((g) => `${cap(g.days[0])}${g.days.length > 1 ? '–' + cap(g.days[g.days.length - 1]) : ''} ${g.v}`).join(', ');
}

function spokenHours(hours) {
  const h = hours || DEFAULT_HOURS;
  const wk = h.mon;
  const sat = h.sat;
  let s = wk ? `weekdays ${hour12(wk[0])} to ${hour12(wk[1])}` : 'by appointment';
  if (sat) s += `, and Saturdays ${hour12(sat[0])} to ${hour12(sat[1])}`;
  return s;
}

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsDate(iso) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsFeed(biz, bookings) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SecondLine//Bookings//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(biz.name + ' — SecondLine')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
  ];
  for (const b of bookings) {
    if (b.businessId !== biz.id || b.status === 'cancelled') continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.id}@secondline`,
      `DTSTAMP:${icsDate(b.createdAt)}`,
      `DTSTART:${icsDate(b.start)}`,
      `DTEND:${icsDate(b.end)}`,
      `SUMMARY:${icsEscape(`${b.customerName || 'New job'} — ${b.need || 'service call'}`)}`,
      `LOCATION:${icsEscape(b.address)}`,
      `DESCRIPTION:${icsEscape(`Call ${b.phone || ''}\n${b.need || ''}\nBooked by your second line.`)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

module.exports = {
  DAYS, DAY_NAMES, DEFAULT_HOURS, zonedParts, zonedToUtc, openSlots, offerSlots,
  speakSlot, shortSlot, formatHours, spokenHours, icsFeed, hour12,
};
