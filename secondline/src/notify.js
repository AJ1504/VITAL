'use strict';
// Every text SecondLine sends. Owner gets a summary within a minute of every
// handled call — silence is failure. Every message is logged even when Twilio
// isn't configured, so nothing disappears.

const twilio = require('./twilio');
const cal = require('./calendar');
const { formatPhone } = require('./brain');

function first(name) { return name && name !== 'Caller' ? name.split(' ')[0] : ''; }

function urgentAlertText(biz, call) {
  const d = call.data;
  const who = call.callerPhone ? formatPhone(call.callerPhone) : 'a caller';
  return `🚨 URGENT call right now — ${d.emergency ? d.emergency.label : 'emergency'}. From ${who}. Your receptionist is taking their details; full summary in a minute.`;
}

function ownerSummaryText(biz, call, link) {
  const d = call.data;
  const phone = formatPhone(d.phone || call.callerPhone) || 'no number';
  const name = d.name && d.name !== 'Caller' ? d.name : 'Caller';
  const lines = [];
  const via = call.channel === 'sms' ? ' (by text)' : '';
  if (d.outcome === 'booked' || (d.outcome === 'urgent' && d.bookingId)) {
    lines.push(`${d.emergency ? '🚨 URGENT & booked' : '✅ Booked'}${via}: ${name} — ${cal.shortSlot(d.slot, biz.timezone)}`);
  } else if (d.outcome === 'urgent') {
    lines.push(`🚨 URGENT${via} — call ${name === 'Caller' ? '' : name + ' '}back now: ${phone}`);
  } else if (d.outcome === 'callback') {
    lines.push(`📞 Call back${via} ${(biz.callbackMinutes || 60) <= 60 ? 'within the hour' : 'today'}: ${name}, ${phone}`);
  } else if (!d.needRaw && !d.name) {
    return `🟡 Missed call from ${phone} — they hung up before saying much. We texted them back so they can reply.${link ? `\n${link}` : ''}`;
  } else {
    lines.push(`🟡 Hung up before booking${via}: ${name}, ${phone}. We texted them to finish up.`);
  }
  if (d.need) lines.push(d.need);
  if (d.address) lines.push(d.address);
  if ((d.outcome === 'booked' || d.bookingId) && phone) lines.push(phone);
  for (const n of d.notes || []) lines.push(`Note: “${n}”`);
  if (link) lines.push(link);
  return lines.join('\n');
}

function callerTextBack(biz) {
  return `Hi, this is ${biz.name}. Sorry we missed you! Reply here with what you need and we'll get you booked — or tell us a good time to call you back.`;
}

function callerConfirmation(biz, call) {
  const d = call.data;
  return `You're booked with ${biz.name}: ${cal.shortSlot(d.slot, biz.timezone)} at ${d.address}. ${biz.ownerName || 'We'} will text before heading over. Reply here if anything changes.`;
}

function createNotifier({ store, baseUrl }) {
  async function send(biz, to, body, kind) {
    const from = biz.lineNumber || undefined;
    const entry = { at: new Date().toISOString(), businessId: biz.id, to, body, kind, sent: false };
    try {
      const r = await twilio.sendSms({ to, from, body });
      entry.sent = r.sent; entry.reason = r.reason; entry.sid = r.sid;
    } catch (e) {
      entry.error = e.message;
      console.error('[text] failed:', e.message);
    }
    if (!entry.sent && !entry.error) console.log(`[text → ${to}] ${body.replace(/\n/g, ' | ')}`);
    store.logText(entry);
    return entry;
  }

  const live = (call) => call.channel === 'voice' || call.channel === 'sms';
  const dash = (biz) => (baseUrl() ? `${baseUrl()}/app/${biz.token}` : '');

  return {
    async urgent(biz, call) {
      if (!live(call) || !biz.ownerPhone) return;
      return send(biz, biz.ownerPhone, urgentAlertText(biz, call), 'urgent');
    },
    // Called once per handled call, when it ends.
    async wrapUp(biz, call) {
      if (!live(call) || call.alerts.summary) return;
      call.alerts.summary = true;
      const d = call.data;
      const meaningfulOutcome = ['booked', 'urgent', 'callback'].includes(d.outcome);
      const caller = call.callerPhone || d.phone;
      if (!meaningfulOutcome && caller && call.channel === 'voice') {
        await send(biz, caller, callerTextBack(biz), 'textback');
        call.textedBack = true;
      }
      if (d.slot && (d.phone || caller)) await send(biz, d.phone || caller, callerConfirmation(biz, call), 'confirmation');
      if (biz.ownerPhone) await send(biz, biz.ownerPhone, ownerSummaryText(biz, call, dash(biz)), 'summary');
    },
    send,
  };
}

module.exports = { createNotifier, ownerSummaryText, urgentAlertText, callerTextBack, callerConfirmation };
