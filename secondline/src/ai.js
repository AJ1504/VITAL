'use strict';
// Optional: Gemini turns a rambling caller sentence into a crisp 3–7 word job
// note ("Kitchen sink leaking under cabinet"). Only ever used for that note —
// the receptionist's spoken words stay scripted. Without a key, or if it is
// slow, we fall back to the caller's own words.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

async function summarize(text, { timeoutMs = 2500 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !text) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text:
          'A customer called a home-service business. Rewrite what they need as a short job note of 3 to 7 words, '
          + 'written from the customer\'s side using "my" (e.g. "my kitchen sink is leaking"). No names, no times, no punctuation at the end. '
          + 'Reply with the note only.\n\nCustomer said: ' + JSON.stringify(String(text).slice(0, 500)) }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 30, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const out = json?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
    if (!out || out.length > 80 || /\b(ai|assistant|language model)\b/i.test(out)) return null;
    return out.replace(/^["']|["'.]$/g, '');
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

module.exports = { summarize };
