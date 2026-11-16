'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cal = require('../src/calendar');

const biz = { id: 'b1', name: 'Test', timezone: 'America/New_York', hours: cal.DEFAULT_HOURS };
const NOW = new Date('2026-11-16T15:00:00Z'); // Mon 10:00 EST

test('converts wall-clock time in the business time zone', () => {
  assert.equal(cal.zonedToUtc(2026, 11, 16, 8, 0, 'America/New_York').toISOString(), '2026-11-16T13:00:00.000Z');
  assert.equal(cal.zonedToUtc(2026, 7, 1, 8, 0, 'America/Los_Angeles').toISOString(), '2026-07-01T15:00:00.000Z');
});

test('offers open windows inside business hours, with lead time', () => {
  const slots = cal.openSlots(biz, [], { now: NOW });
  const first = cal.zonedParts(new Date(slots[0].start), biz.timezone);
  assert.equal(first.h, 13, 'first window starts after the 2-hour lead time');
  for (const s of slots) {
    const p = cal.zonedParts(new Date(s.start), biz.timezone);
    assert.notEqual(p.dow, 0, 'closed Sundays');
  }
});

test('booked windows are not offered again', () => {
  const slots = cal.openSlots(biz, [], { now: NOW });
  const taken = [{ businessId: 'b1', start: slots[0].start, end: slots[0].end }];
  assert.notEqual(cal.openSlots(biz, taken, { now: NOW })[0].start, slots[0].start);
});

test('speaks and writes windows the way people do', () => {
  const slot = { start: '2026-11-17T13:00:00Z', end: '2026-11-17T15:00:00Z' };
  assert.equal(cal.speakSlot(slot, biz.timezone, NOW), 'tomorrow between 8 and 10 in the morning');
  assert.equal(cal.shortSlot(slot, biz.timezone), 'Tue, Nov 17, 8–10am');
  assert.equal(cal.formatHours(cal.DEFAULT_HOURS), 'Mon–Fri 7am–6pm, Sat 8am–2pm, Sun Closed');
});

test('calendar feed has the booking', () => {
  const ics = cal.icsFeed(biz, [{ id: 'j1', businessId: 'b1', createdAt: NOW.toISOString(), start: '2026-11-17T13:00:00Z', end: '2026-11-17T15:00:00Z', customerName: 'Dana', need: 'Sink, leaking', address: '42 Elm', phone: '5552014321' }]);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:20261117T130000Z/);
  assert.match(ics, /SUMMARY:Dana — Sink\\, leaking/);
});
