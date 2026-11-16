# SecondLine

**Your second line. Always answered.**

A receptionist for 1–5 person trade shops (plumbing, HVAC, electrical, roofing, towing, locksmiths). It answers every call in seconds, books the job into the owner's calendar, flags emergencies, texts back missed calls, and texts the owner a summary after every call.

7-day free pilot → $200 one-time setup + $300/month, cancel anytime.

---

## Run it

```bash
npm start        # http://localhost:3000  — no dependencies, Node 20+
npm test         # 25 tests: call script, calendar, phone line, setup, pause/undo
```

With no settings at all, everything works except real phone calls: the landing-page demo, setup, test calls, dashboard, and settings all run, and every text that *would* be sent is printed to the console and saved in `data/db.json` (`outbox`).

Copy `.env.example` to `.env` to connect Twilio and the rest.

## What's in it

| Path | What it is |
|---|---|
| `/` | Landing page. Money-first headline, the live demo (type or tap through a call, see the booking and the owner's text), the math, 3 steps, one price card, FAQ. |
| `/start` | Setup: 7 one-question screens with a progress bar — business name, trade, first name, cell, hours, jobs, receptionist name (hear the greeting) — then a live test call against *their* settings before anything goes live. Progress is saved on the phone. |
| `/app/<link>` | Owner dashboard. Big green numbers (est. work won, calls answered, new jobs), "Needs you" call-back cards with one-tap Call, upcoming jobs, every call as a card with the full conversation. On/off switch at the bottom. |
| `/app/<link>/settings` | Change greeting, hours, jobs, name, cell, average job. Every save shows **Undo**. Pause and cancel are two taps, no retention flow. |
| `/app/<link>/live` | Last step: their second-line number and a one-tap code to forward unanswered calls (Verizon / AT&T / T-Mobile / other), plus how to turn it off. |
| `/cal/<id>.ics` | Calendar feed. "Add to my calendar" subscribes their phone's calendar — new bookings appear on their own. No Google sign-in needed. |
| `/login` | Owner enters their cell, gets their dashboard link by text. No passwords. |
| `/admin?key=…` | Operator view: every shop, its status and pilot day; assign second-line numbers by hand. |
| `/voice/*`, `/sms/*` | The phone line (Twilio). |

Owners can also text their own line: `PAUSE`, `ON`, `LINK`.

## How a call goes

`src/brain.js` is the receptionist. The words are scripted (never generated), so it can't go off-script or call itself an AI.

1. "Hi, this is Riverside Plumbing's office, Jamie speaking. How can I help?"
2. Reads the problem back ("Got it — your kitchen sink is leaking.") and offers: "I can have Mike call you back within the hour, or I can book you in now — which works better?"
3. Name → address → "Is the number you're calling from, ending in 4 3 2 1, the best one to reach you?"
4. "Let me check the book…" → two real open windows from their hours → books it → reads it all back.
5. "Anything else I should pass along to Mike?" → goodbye.

- **Emergencies** (flooding, burst pipe, no heat, sparking, burning smell, gas smell, locked out, roof leaking in, stranded): skips the booking question, texts the owner *during* the call, promises a call back within 15 minutes, gives one safety line (e.g. shut the main valve; for gas, get out and call the gas company).
- **"Are you a robot?"** → "I'm the office assistant here at Riverside Plumbing…" Never claims to be human, never leads with it.
- **"Can I talk to Mike?"** → call-back, always offered, never forced.
- **Price questions** → "Mike gives exact prices after seeing the job."
- **Hang-ups**: nothing said → caller gets a "sorry we missed you, reply here" text; the reply continues the same conversation by text and can book the job. Owner gets told either way.
- **Paused line**: plain voicemail; owner gets a text with the recording link for each one.

After every call: owner summary text (✅ Booked / 🚨 URGENT / 📞 Call back / 🟡 Missed — texted back), plus a booking confirmation text to the customer. A one-minute sweeper wraps up any call Twilio never reported as ended, so no call goes silent.

Gemini is optional and only tidies the one-line job note; if it's missing or slow (2.5s), the caller's own words are used.

## Connecting the phone line

1. Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `PUBLIC_URL` in `.env`.
2. When a shop taps **Turn on my second line**, it gets a number from `TWILIO_NUMBER_POOL`, or a local number in the owner's area code is bought automatically and pointed at this server.
3. For numbers you set up by hand, point them at:
   - A call comes in → `POST {PUBLIC_URL}/voice/incoming`
   - Call status changes → `POST {PUBLIC_URL}/voice/status`
   - A message comes in → `POST {PUBLIC_URL}/sms/incoming`
4. Requests are checked against Twilio's signature whenever `TWILIO_AUTH_TOKEN` is set.
5. US texting needs A2P 10DLC registration on the Twilio account before texts deliver reliably.

**Hosting:** any always-on Node host with a small persistent disk (Render, Fly.io, Railway, a $5 VPS). `data/db.json` is the whole database — fine for dozens of shops; move to Postgres at a few hundred. The repo's existing Netlify setup serves the other app and isn't a fit for this long-running server.

## Cost per shop (unchanged from v0)

Twilio local number ~$1.15/mo + voice ~$0.0085/min in + speech recognition + texts ≈ **$10–12/mo** at typical volume. A 3-minute call costs 2–4 cents. Gemini free tier covers the job notes. ~96% margin at $300/mo.

## The 30-minute setup call (script)

1. **(2 min)** "I'll share my screen / text you a link. Open it on your phone." → `/start`.
2. **(8 min)** Walk the 7 screens together. Accept defaults unless they object. Hours: "Is Mon–Fri 7 to 6, Saturday 8 to 2 about right?" Jobs: "Untick anything you don't do."
3. **(5 min)** Play the greeting. Have *them* do the test call on screen — ask for a job, watch it land, read the text they'll get.
4. **(5 min)** Tap **Turn on my second line**. Pick their carrier, tap **Turn on forwarding**.
5. **(5 min)** Live test: you call their business number, they let it ring. They hear it answer, and the summary text lands on their phone while you're still talking.
6. **(5 min)** Show the dashboard and the off switch. "Pause is one tap. Text PAUSE works too. Seven days free — you'll get a text with your numbers when the week's up."

## Not built yet / decisions for Aakarsh

- **Name**: "SecondLine" is used everywhere and is still pending your approval. Renaming is a find-and-replace of the word plus the logo text in `src/views/index.js`.
- **Payments**: "Keep my second line" (shown after day 7) texts you; send a Stripe payment link by hand for now. No card is ever collected in-app.
- **Google Calendar two-way sync**: bookings flow *out* via the calendar feed. Jobs the owner adds in their own calendar aren't read back yet, so the receptionist only knows about its own bookings.
- **Proof section**: the brief was cut off at "Proof section (". The landing page currently proves it with the live demo, the 62% / 85% stats, and sample texts. No testimonials were invented — add real quotes from pilots.
- **Live transfer** to the owner mid-call isn't offered (call-back only), on purpose: with "forward when I don't answer", dialing the owner back would loop.
