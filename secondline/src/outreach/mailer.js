'use strict';
// Sends one email through Resend (resend.com — free tier: 100/day). Without a
// key nothing is sent: emails are written to data/outreach-outbox/ so you can
// read every one before going live.

const fs = require('fs');
const path = require('path');

function enabled() { return !!process.env.RESEND_API_KEY; }

async function sendEmail({ to, subject, text, from, replyTo, unsubUrl }) {
  if (!enabled() || process.env.OUTREACH_DRY_RUN === '1') {
    const dir = process.env.OUTREACH_OUTBOX_DIR || path.join(__dirname, '..', '..', 'data', 'outreach-outbox');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 7)}-${String(to).replace(/[^a-z0-9@.]/gi, '_')}.txt`);
    fs.writeFileSync(file, `From: ${from}\nTo: ${to}\nReply-To: ${replyTo}\nSubject: ${subject}\nList-Unsubscribe: <${unsubUrl}>\n\n${text}\n`);
    return { sent: false, dryRun: true, file };
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from, to: [to], subject, text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Email ${res.status}: ${json.message || 'send failed'}`);
  return { sent: true, id: json.id };
}

module.exports = { sendEmail, enabled };
