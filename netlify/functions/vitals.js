// vital ○ — cloud vitals relay
// The iPhone Shortcut POSTs the latest heart rate / SpO2 / HRV here.
// The web app GETs from here every ~60s and shows whatever came in last.
// Storage = Netlify Blobs (built into every Netlify site, nothing to sign up for).

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const store = getStore('vitals');

  if (event.httpMethod === 'GET') {
    let data = null;
    try {
      data = await store.get('latest', { type: 'json' });
    } catch (e) {
      data = null;
    }
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(data || {}),
    };
  }

  if (event.httpMethod === 'POST') {
    // Optional shared-secret check. Only enforced if VITALS_SECRET is set
    // as a Netlify environment variable — otherwise anyone with the URL
    // could write fake readings. Highly recommended to set this.
    const secret = process.env.VITALS_SECRET;
    if (secret) {
      const provided = (event.queryStringParameters && event.queryStringParameters.key) || '';
      if (provided !== secret) {
        return { statusCode: 401, headers: CORS, body: 'Unauthorized' };
      }
    }

    let payload = {};
    try {
      payload = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers: CORS, body: 'Bad JSON body' };
    }

    const toNum = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

    const record = {
      hr: toNum(payload.hr),
      spo2: toNum(payload.spo2),
      hrv: toNum(payload.hrv),
      ts: Date.now(),
    };

    await store.setJSON('latest', record);

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, saved: record }),
    };
  }

  return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
};
