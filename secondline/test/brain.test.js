'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const brain = require('../src/brain');

const NOW = new Date('2026-11-16T15:00:00Z'); // Monday 10am in New York
const biz = { id: 'b1', name: 'Riverside Plumbing', ownerName: 'Mike', agentName: 'Jamie', timezone: 'America/New_York', services: ['Leaks & drips', 'Clogged drains', 'Water heaters'] };

async function talk(lines, { phone = '+15552014321', channel = 'voice' } = {}) {
  const bookings = [];
  const urgent = [];
  const { call, say } = brain.newCall(biz, { channel, callerPhone: phone, now: NOW });
  const said = [say];
  let last;
  for (const l of lines) {
    last = await brain.respond(biz, call, l, { now: NOW, bookings: () => bookings, addBooking: (b) => { b.id = 'j' + bookings.length; bookings.push(b); return b; }, onUrgent: (c) => urgent.push(c.id) });
    said.push(last.say);
  }
  return { call, said, last, bookings, urgent };
}

test('greets with the business name and receptionist name, never as a robot', () => {
  const { say } = brain.newCall(biz, {});
  assert.equal(say, "Hi, this is Riverside Plumbing's office, Jamie speaking. How can I help?");
});

test('books a job end to end and reads the details back', async () => {
  const r = await talk(['My kitchen sink is leaking', 'book me in', "It's Dana Lopez", '42 elm street', 'yes', 'the second one', "no that's it"]);
  assert.equal(r.call.data.outcome, 'booked');
  assert.equal(r.call.data.name, 'Dana Lopez');
  assert.equal(r.call.data.address, '42 Elm Street');
  assert.equal(r.call.data.phone, '5552014321');
  assert.equal(r.bookings.length, 1);
  assert.match(r.said[1], /Got it — your kitchen sink is leaking\./);
  assert.match(r.said[1], /call you back within the hour, or I can book you in now/);
  assert.match(r.said.join(' '), /Let me check the book/);
  assert.match(r.said.join(' '), /you're booked for .* That's Dana, kitchen sink is leaking, at 42 Elm Street/);
  assert.equal(r.last.end, true);
});

test('emergencies fast-track, alert the owner at once, and give a safety tip', async () => {
  const r = await talk(['My basement is flooding!', 'Tom', '9 Oak Ave', 'yes', 'no']);
  assert.equal(r.call.data.outcome, 'urgent');
  assert.equal(r.urgent.length, 1, 'owner alerted mid-call');
  assert.match(r.said[1], /That sounds urgent/);
  assert.match(r.said.join(' '), /shut off the main water valve/);
  assert.match(r.said.join(' '), /within 15 minutes/);
});

test('gas smell gets told to leave the house', async () => {
  const r = await talk(['I smell gas in the kitchen']);
  assert.equal(r.call.data.emergency.label, 'Gas smell');
});

test('never claims to be a robot, answers honestly as the office assistant', async () => {
  const r = await talk(['Are you a robot?']);
  assert.match(r.said[1], /^I'm the office assistant here at Riverside Plumbing/);
  assert.doesNotMatch(r.said.join(' '), /\b(AI|automated|language model|robot)\b/i);
});

test('asking for a person always gets a call-back, never forced to book', async () => {
  const r = await talk(['Can I talk to a real person?', 'Ann Lee', '77 Pine Rd', 'no', '555 444 1234', 'nope']);
  assert.equal(r.call.data.outcome, 'callback');
  assert.equal(r.call.data.phone, '5554441234');
  assert.match(r.said[1], /Mike is out on a job right now, so I'll have Mike call you back within the hour/);
  assert.equal(r.bookings.length, 0);
});

test('caller preference for a day is honored, and "neither" re-offers', async () => {
  const r = await talk(['clogged drain, thursday afternoon if possible', 'book it', 'Bob', '1 Main St', 'yes', 'neither, how about friday morning', 'first', 'no']);
  assert.match(r.said[5], /Thursday between 1 and 3 in the afternoon/);
  assert.match(r.said[6], /Friday between 7 and 9 in the morning/);
  assert.equal(r.call.data.outcome, 'booked');
});

test('silence twice ends politely with a call-back', async () => {
  const r = await talk(['', '']);
  assert.equal(r.last.end, true);
  assert.equal(r.call.data.outcome, 'callback');
});

test('text conversations say texting, not calling', async () => {
  const r = await talk(['do you guys clean drains?', 'book', 'Rob', '5 Cedar Ct', 'yes', 'first', 'no'], { channel: 'sms' });
  assert.match(r.said[1], /^Yes, we handle clogged drains\./);
  assert.match(r.last.say, /Thanks for texting/);
});

test('language helpers', () => {
  assert.equal(brain.extractPhone('five five five, two oh one, four three two one'), '5552014321');
  assert.equal(brain.extractName('my name is dana lopez', {}), 'Dana Lopez');
  assert.equal(brain.extractName("I'm calling about my sink", {}), null);
  assert.equal(brain.cleanNeed("Hi yeah, I've got a toilet that keeps running, and it's driving me nuts"), 'a toilet that keeps running');
  assert.equal(brain.secondPerson('my sink is leaking'), 'your sink is leaking');
});
