# SecondLine

**Your second line. Always answered.**

A receptionist for 1–5 person trade shops (plumbing, HVAC, electrical, roofing, towing, locksmiths). It answers every call in seconds, books the job into the owner's calendar, flags emergencies, texts back missed calls, and texts the owner a summary after every call.

7-day free pilot → $200 one-time setup + $300/month, cancel anytime.

---

## Run it

```bash
npm start        # http://localhost:3000  — no dependencies, Node 20+
npm test         # 41 tests: call script, calendar, phone line, setup, pause/undo, voice, outreach, campaign
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

**Going live on Render (about 10 minutes):**
1. render.com → New → **Blueprint** → pick this GitHub repo. It reads `render.yaml` at the repo root and builds `secondline/Dockerfile`, with a 1 GB disk for the database (Starter plan, about $7/month plus about $0.25/month for the disk).
2. Fill in the settings it asks for (see `.env.example`). Set `PUBLIC_URL` to the address Render gives you, or to your own domain once it's connected.
3. Open `/admin/leads?key=<ADMIN_KEY>` (Render generated the key; it's under Environment).

**Hosting:** any always-on Node host with a small persistent disk (Render, Fly.io, Railway, a $5 VPS). `data/db.json` is the whole database — fine for dozens of shops; move to Postgres at a few hundred. The repo's existing Netlify setup serves the other app and isn't a fit for this long-running server.

## Natural voice (VoiceStudio — free, self-hosted)

By default callers hear Twilio's neural voice. For a more natural voice, run [VoiceStudio](https://github.com/debpalash/VoiceStudio) beside SecondLine and set `VOICESTUDIO_URL`.

```bash
# On a machine with an NVIDIA GPU (CPU works too, slower). Pin an exact release.
docker run -d --name voicestudio --gpus all -p 127.0.0.1:3900:3900 \
  -e OMNIVOICE_API_KEY=<long random key> \
  -v voicestudio-data:/app/omnivoice_data ghcr.io/debpalash/voicestudio:0.5.6
# then in SecondLine's .env:
VOICESTUDIO_URL=http://127.0.0.1:3900
VOICESTUDIO_API_KEY=<same key>
```

How it works (`src/tts.js`):
- Every reply is split into sentences. Each sentence is rendered once through VoiceStudio's `POST /v1/audio/speech` and cached in `data/audio/`, so lines like "Can I get your name?" are instant after the first call. When a shop goes live, its greeting and common questions are rendered ahead of time.
- On a live call, if any sentence isn't ready within `VOICESTUDIO_TIMEOUT_MS` (2.5s), that reply uses the standard Twilio voice instead — callers never wait on silence, and one reply never switches voices halfway.
- The landing-page demo, each shop's personal demo, and the "Play greeting" button in setup use the same voice when it's on (tap 🔈 in the demo).
- To give a shop its own voice, create a voice profile in VoiceStudio and set that business's `voice` field (or `VOICESTUDIO_VOICE` for everyone).

**License:** VoiceStudio is AGPL-3.0. SecondLine only calls it over HTTP as a separate, unmodified service, which keeps SecondLine's code separate. If you modify VoiceStudio and expose it to others over a network, you must publish your changes. Each voice *model* (OmniVoice, CosyVoice, etc.) has its own license. Check that the model you pick allows commercial use before going live.

**Never use cloned or AI voices to cold-call shops.** The FCC (ruling 24-17) treats AI voices as "artificial" under the TCPA: that needs prior written consent, with fines of $500–$1,500 per call. SecondLine uses the voice only to answer calls *to* a customer's own line.

## Outreach: finding shops and making the offer

The flow is: find shops, then find their email, then send a 3-email sequence. Each shop gets a **personal demo page** where its own receptionist answers with its name. When a shop opens that page, you get a text right away so you can call them while they're interested. If they sign up, the founding offer is locked in on their account.

```bash
node src/outreach/cli.js find "plumber" "Austin, TX" 40   # Google Maps search; keeps reviews that say they couldn't get through
node src/outreach/cli.js import leads.csv                 # or bring your own list: name,email,phone,website,trade,city,ownerName,quote
node src/outreach/cli.js enrich                           # find a contact email on each shop's own website
node src/outreach/cli.js preview                          # read the first email before anything goes out
node src/outreach/cli.js send 10                          # send what's due (or set OUTREACH_AUTO=1)
```

Or use the web page at `/admin/leads?key=ADMIN_KEY`. From there you can find shops, look up emails and send the next batch. It shows each shop's status, the review quote, and who opened their demo. There's also a "They replied — stop emails" button.

**The offer** (each term can be changed with a setting in `.env`):
1. **It's already built.** Each email links to `/d/<shop>`, where a receptionist answers as "Riverside Plumbing's office", books a job, and shows the text the owner would get.
2. **The hook is their own review:** "One of your Google reviews says: 'Called four times and it went straight to voicemail.'"
3. 7 days free, no card.
4. **No setup fee** (normally $200) for the first 10 shops, until a deadline (14 days).
5. **Guarantee:** no job caught in the first 30 days means the second month is free.
6. $300/month after that, cancel in two taps.

**The sequence:** the first email goes out on day 0, then a follow-up on day 3 and a last note on day 7. It stops the moment a shop opts out, replies (mark it), or signs up.

**Rules built into the code:**
- Nothing sends until `OUTREACH_FROM_NAME`, `OUTREACH_FROM_EMAIL` and a real `OUTREACH_ADDRESS` are set. CAN-SPAM requires all three.
- Every email has a one-tap opt-out link and a `List-Unsubscribe` header. Opted-out addresses are never emailed again, even if the shop is imported again.
- The subject lines are honest and the emails are plain text.
- There's a daily cap (25 by default). Emails only go out on weekdays, 8am–5pm, at most one a minute when automatic.
- **Email only.** Cold texts or automated calls to shop owners' cell phones would break the TCPA, so the code doesn't do them.
- Google review quotes are dropped after 30 days, and the demo page credits them to Google Maps (both are Google Places terms).
- Without `RESEND_API_KEY`, it's in **practice mode**: every email is written to `data/outreach-outbox/` for you to read.

### Nationwide campaign

`src/outreach/campaign.js` works through a grid of **15 trades × 100 small and mid-size markets** (two in each of the 50 states, e.g. Salina KS, Bozeman MT, Hattiesburg MS). That's 1,500 searches. It aims where call answering is least likely to exist yet:
- **Niche trades go first:** septic, well & pump, garage doors, tree service, water/fire restoration, pest control, appliance repair, chimney, mobile mechanics. These are mostly owner-operators who are under a truck or up a tree when the phone rings. The usual trades (plumbing, HVAC, electrical, roofing, towing, locksmith) come after.
- **Small markets, not big metros.** The order hops between states, so the list fills in across the country, never two searches in a row in one state.
- **Shops that already answer their phones are skipped.** When it reads a shop's website, it looks for answering services and AI receptionists (Smith.ai, Ruby, Goodcall, Numa, PATLive, "virtual receptionist"…). Those shops are marked "already has answering" and never emailed. Chat or booking tools (Podium, Housecall Pro, Jobber…) are noted but not skipped, because those shops still miss calls.
- Shops whose Google reviews say they didn't pick up are emailed first.

```bash
node src/outreach/cli.js campaign status   # how far through the country, and what's next
node src/outreach/cli.js campaign 10       # run the next 10 searches, then look up emails
```

Set `CAMPAIGN_AUTO=1` to run `CAMPAIGN_SEARCHES_PER_DAY` (8) searches every morning. Combined with `OUTREACH_AUTO=1`, the whole loop runs by itself:
- finds new shops every morning
- emails up to 25 a day on weekdays
- sends follow-ups on day 3 and day 7
- texts you when someone opens their demo

Add your own towns with `CAMPAIGN_EXTRA_MARKETS="Lafayette, LA;Lafayette, IN"`. Each search costs about $0.04 at Google's reviews rate. 8 a day is about $10/month, and Google's monthly free credit covers early volume.

**Before sending real email:** send from a separate domain (e.g. `trysecondline.com`, not your main one). Verify it in Resend and set up SPF/DKIM/DMARC. Warm it up for about 2 weeks at 10–20 emails a day.

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
