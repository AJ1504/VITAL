'use strict';
// Talking to Twilio with plain HTTPS — no SDK. Sending texts, buying a local
// number, checking request signatures, and building the call XML.

const crypto = require('crypto');

const API = 'https://api.twilio.com/2010-04-01';

function config() {
  return {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
    voice: process.env.TWILIO_VOICE || 'Polly.Joanna-Neural',
  };
}
function enabled() { const c = config(); return !!(c.sid && c.token); }

async function api(method, path, params) {
  const c = config();
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(`${API}/Accounts/${c.sid}${path}`, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.sid}:${c.token}`).toString('base64'),
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${json.message || 'request failed'}`);
  return json;
}

function e164(num) {
  const d = String(num || '').replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return d ? '+' + d : '';
}

async function sendSms({ to, from, body }) {
  const c = config();
  if (!enabled()) return { sent: false, reason: 'not-configured' };
  const msg = await api('POST', '/Messages.json', { To: e164(to), From: e164(from || c.from), Body: body });
  return { sent: true, sid: msg.sid };
}

// Buy a local number near the owner and point it at this server.
async function provisionNumber({ areaCode, baseUrl }) {
  if (!enabled() || !baseUrl) return null;
  let list = await api('GET', `/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&SmsEnabled=true${areaCode ? `&AreaCode=${areaCode}` : ''}`);
  if (!list.available_phone_numbers?.length && areaCode) list = await api('GET', '/AvailablePhoneNumbers/US/Local.json?VoiceEnabled=true&SmsEnabled=true');
  const pick = list.available_phone_numbers?.[0];
  if (!pick) return null;
  const bought = await api('POST', '/IncomingPhoneNumbers.json', {
    PhoneNumber: pick.phone_number,
    VoiceUrl: `${baseUrl}/voice/incoming`, VoiceMethod: 'POST',
    StatusCallback: `${baseUrl}/voice/status`, StatusCallbackMethod: 'POST',
    SmsUrl: `${baseUrl}/sms/incoming`, SmsMethod: 'POST',
    FriendlyName: 'SecondLine',
  });
  return bought.phone_number;
}

// https://www.twilio.com/docs/usage/security#validating-requests
function validSignature(url, params, signature) {
  const { token } = config();
  if (!token) return true; // local development without Twilio
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', token).update(data).digest('base64');
  const a = Buffer.from(expected), b = Buffer.from(String(signature || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function xml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const twiml = {
  // Say something and listen for the caller's answer.
  ask(text, action) {
    const v = config().voice;
    return `<?xml version="1.0" encoding="UTF-8"?><Response>`
      + `<Gather input="speech" action="${xml(action)}" method="POST" speechTimeout="auto" speechModel="phone_call" enhanced="true" language="en-US" actionOnEmptyResult="true">`
      + `<Say voice="${xml(v)}">${xml(text)}</Say></Gather>`
      + `<Redirect method="POST">${xml(action)}</Redirect></Response>`;
  },
  sayAndHangUp(text) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${xml(config().voice)}">${xml(text)}</Say><Hangup/></Response>`;
  },
  // Used while the owner has paused their second line: a plain voicemail.
  voicemail(text, action) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="${xml(config().voice)}">${xml(text)}</Say>`
      + `<Record maxLength="120" playBeep="true" action="${xml(action)}" method="POST"/><Hangup/></Response>`;
  },
  message(text) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${xml(text)}</Message>` : ''}</Response>`;
  },
};

module.exports = { enabled, sendSms, provisionNumber, validSignature, twiml, e164, config };
