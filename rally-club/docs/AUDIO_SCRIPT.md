# Vital Pickleball Club: audio script and sound list

Everything the game needs recorded. Each line or sound has a **file name**. Deliver files with exactly these names and they drop straight into the game. The game picks a random take from each group, avoids repeating itself, and spaces lines out so the commentator never talks over himself.

## Delivery specs

| | Voice (commentary, umpire, names) | Sound effects | Music (DJ) |
| --- | --- | --- | --- |
| Format | WAV, 48 kHz, 24-bit, **mono** | WAV, 48 kHz, 24-bit, mono (stereo only where marked) | WAV, 48 kHz, 24-bit, **stereo** |
| Loudness | Around −16 LUFS, peaks under −1 dBFS | Peaks under −1 dBFS, no fades on hits | Around −14 LUFS, seamless loop |
| Edit | Trim to 50 ms of air before and after. No music or reverb underneath (the game adds the venue reverb) | Tight start: the transient must be on frame 1 | Loop points exact, in bars at the stated BPM |
| Takes | 2–3 takes of each line is ideal (`_a`, `_b`, `_c`) | 3–5 variations where marked | 1 per arena |

**Names and scores are separate clips**, so you never have to record "Theo wins 11–7" in every combination. The game stitches lines together like this: `[name] + [line]`, or `[line] + [score]`.

---

## 1. Commentator (warm, witty, sunny "club broadcast" tone)

Lines in quotes are the script. Where a line refers to a player, record the name-free version shown. The game plays the player's name clip in front of it (section 3).

### `vo_intro_*` — match welcome (plays once at the start)
1. `vo_intro_1`: "Welcome to the Vital Pickleball Club! A full house, the DJ is rolling — let's play some pickleball."
2. `vo_intro_2`: "The sun is out, the music is warm, and the court is ready. Players, the floor is yours."
3. `vo_intro_3`: "What a setting for pickleball. Good luck to both — let's play!"

Arena welcomes (one per arena, played instead of the general intro when that arena is chosen):

4. `vo_arena_lavender`: "Golden hour at Lavender Social — the amphitheatre's full and the DJ's warming up."
5. `vo_arena_lemon`: "A bright morning in the Lemon Grove. Lemonade's poured — let's begin."
6. `vo_arena_azure`: "Sea breeze at the Azure Riviera. What a view for pickleball."
7. `vo_arena_terracotta`: "Sunset in the Terracotta courtyard — the arches are glowing."
8. `vo_arena_pistachio`: "Welcome to the Pistachio Pavilion — sculptures, sunshine and a full house."
9. `vo_arena_coral`: "Lights up at Coral Disco! The ball's spinning — let's party."

### `vo_serve_fault_*` — serve misses
1. "Oh, the serve doesn't find the box."
2. "Fault on the serve — that one wandered."
3. "Not the serve they were looking for."

### `vo_ace_*` — unreturned serve
1. "Unreturnable! Served up and delivered."
2. "Ace! The terrace loved that one."
3. "Straight past them — a serve with a postmark."

### `vo_long_rally_*` — rally reaches 8+ shots
1. "Listen to this crowd — what a rally!"
2. "Neither of them will blink!"
3. "Back and forth, back and forth… someone has to crack."

### `vo_net_*`
1. "Into the tape."
2. "The net says no."
3. "Caught the net — so close."

### `vo_out_*`
1. "Just long!"
2. "Wide — no doubt about that one."
3. "That one sailed off into the sunset."

### `vo_kitchen_*` — volley from inside the non-volley zone
1. "Foot in the kitchen! You can't volley from there."
2. "Kitchen violation — the cardinal sin."
3. "Out of the kitchen, please! Fault."

### `vo_two_bounce_*` — return volleyed before it bounced
1. "Too eager — it had to bounce first!"
2. "Two-bounce rule! Patience is a virtue."
3. "That one needed a bounce. Fault."

### `vo_point_*` — normal point won (played after the winner's name clip)
1. "…takes the point."
2. "…lovely stuff."
3. "…clean finish."
4. "…makes it look easy."

### `vo_side_out_*`
1. "Side out."
2. "Serve changes hands."
3. "Over to the other side to serve."

### `vo_game_point_*`
1. "Game point."
2. "One point from the match — the crowd is on its feet."
3. "Here it is… game point."

### `vo_save_*` — game point saved
1. "Saved! Not done yet!"
2. "Game point erased — what nerve!"
3. "Fought off! We play on."

### `vo_comeback_*` — wins after trailing by 4+
1. "From way back — what a comeback!"
2. "They were buried, and they dug all the way out!"

### `vo_win_*` — match won (played after the winner's name clip)
1. "…takes the match! Cue the confetti!"
2. "…wins it! What an evening!"
3. "Game, set and sunset!"

### `vo_perfect_*` — sweet-spot hit (short, quick)
1. "Sweet spot!"
2. "Pure contact."
3. "Oh, that sounded perfect."

### `vo_practice_*` — practice streaks
1. "Lovely rhythm!"
2. "Grooving now."
3. "The ball machine is running out of ideas!"

### Extra reactions (nice to have)
- `vo_lob_*`: "Up and over!" / "A lob — will it land?"
- `vo_dink_*`: "Soft hands at the net." / "Delicate dink."
- `vo_smash_*`: "Oh, put away!" / "That was a smash!"
- `vo_close_*`: "Ooh, inches!" / "Right on the line!"

---

## 2. Umpire (calm, precise, a little formal)

- Score calls in pickleball are three numbers: server score, receiver score, server number. Singles uses two numbers. Record the numbers as single words, and the game chains them:
  - `ump_num_0` … `ump_num_15`: "Love" (for 0; record a plain "Zero" too as `ump_num_0_alt`), "One", "Two" … "Fifteen".
- `ump_fault`: "Fault."
- `ump_out`: "Out."
- `ump_net`: "Net."
- `ump_kitchen`: "Kitchen."
- `ump_side_out`: "Side out."
- `ump_let`: "Let. Replay the serve."
- `ump_game`: "Game."
- `ump_match`: "Game, set and match."
- `ump_quiet`: "Quiet, please." (before the first serve)
- `ump_play`: "Play."

---

## 3. Names (the commentator says them, two reads each)

Neutral read (`_n`) and excited read (`_x`):
- `name_theo`, `name_lila`, `name_jasper`, `name_marcus`, `name_mei`, `name_zara`
- `name_you`: "You!" (used when the player keeps the default name)

---

## 4. Sound effects

| File | What it is | Variations | Notes |
| --- | --- | --- | --- |
| `sfx_paddle_soft_*` | Pickleball paddle on ball, soft dink | 4 | Hollow "pock", short |
| `sfx_paddle_med_*` | Normal drive | 4 | |
| `sfx_paddle_hard_*` | Smash / hard drive | 4 | Sharper crack |
| `sfx_paddle_perfect` | Sweet-spot hit | 1 | Hit + a tiny bright "ding" layer |
| `sfx_bounce_court_*` | Ball bounce on hard court | 4 | |
| `sfx_bounce_soft_*` | Bounce on surround / grass | 2 | |
| `sfx_net_*` | Ball into net | 3 | Rattle of mesh |
| `sfx_net_cord` | Ball clips tape and goes over | 1 | |
| `sfx_post` | Ball hits net post | 1 | |
| `sfx_footstep_court_*` | Sneaker steps / quick shuffles | 6 | Light squeak on 2 of them |
| `sfx_shoe_squeak_*` | Sharp sneaker squeak on stopping | 3 | |
| `sfx_swing_whoosh_*` | Paddle swoosh through air | 3 | For misses / big swings |
| `sfx_ball_machine` | Practice ball machine launch | 2 | Soft pneumatic "thup" |
| `sfx_ui_click` | Menu tap | 1 | Soft wooden click |
| `sfx_ui_select` | Choose arena / member | 1 | Light bell |
| `sfx_ui_back` | Back / cancel | 1 | |
| `sfx_confetti` | Confetti cannon pop + flutter | 1 | Stereo |
| `sfx_disco_sparkle` | Tiny shimmer when the disco ball catches light | 1 | Optional |
| `sfx_glass_clink_*` | Drinks clinking at the bar | 3 | Ambient one-shots |
| `sfx_seagull_*` | Distant gulls | 3 | Island ambience |
| `sfx_waves_loop` | Gentle shore waves | loop 30–60 s | **Stereo**, seamless |
| `sfx_wind_palms_loop` | Soft breeze through palms | loop 30–60 s | **Stereo**, seamless |

### Crowd (all **stereo**, as wide as possible)
| File | Use | Length |
| --- | --- | --- |
| `crowd_bed_idle_loop` | Murmur, chatter, glasses, between points | 60 s loop |
| `crowd_bed_tense_loop` | Hushed, expectant (long rally / game point) | 30 s loop |
| `crowd_applause_short_*` (3) | Polite applause after a normal point | 2–3 s |
| `crowd_applause_big_*` (2) | Big applause after a great point | 4–5 s |
| `crowd_cheer_*` (3) | Cheer + whoops (ace, winner) | 2–4 s |
| `crowd_ooh_*` (3) | "Ooooh" (near miss, net cord) | 1–2 s |
| `crowd_gasp_*` (2) | Sharp gasp (close line call) | 1 s |
| `crowd_aww_*` (2) | Disappointed "awww" (player loses point) | 1–2 s |
| `crowd_laugh_*` (2) | Warm laugh (funny miss) | 1–2 s |
| `crowd_ovation` | Standing ovation for match win | 8–10 s |
| `crowd_chant_vital` | Optional rhythmic clap-chant ("Vi-tal! Vi-tal!") | 6–8 s |

---

## 5. Music (the DJ, one set per arena)

Each arena has its own resident DJ sound. Deliver a seamless loop (16 or 32 bars) plus short stingers.

| Arena | Style | BPM | Files |
| --- | --- | --- | --- |
| Lavender Social | Melodic / deep house, soft pads | 118 | `music_lavender_loop`, `music_lavender_stinger_point`, `music_lavender_stinger_win` |
| Lemon Grove | Balearic / bossa house, acoustic guitar, shaker | 110 | `music_lemon_loop` + stingers |
| Azure Riviera | Sunny tropical house, steel pan, marimba | 116 | `music_azure_loop` + stingers |
| Terracotta Sunset | Mediterranean lounge, Spanish guitar, warm bass | 112 | `music_terracotta_loop` + stingers |
| Pistachio Pavilion | Bright French-touch house, filtered chords | 120 | `music_pistachio_loop` + stingers |
| Coral Disco | Nu-disco / funky house, strings, horns | 122 | `music_coral_loop` + stingers |
| Menu | Lounge version of the Vital theme | 100 | `music_menu_loop` |

Jingles (short, 1–3 s, bright and toy-like):
- `jingle_ready`: before the serve
- `jingle_point_win` / `jingle_point_lose`
- `jingle_victory` / `jingle_defeat`
- `jingle_intro`: the arena title card (about 4 s)

DJ scratches/drops for big moments (optional): `dj_drop_*` (3), `dj_scratch_*` (3), `dj_rewind` (1).

---

## 6. Hooking it up

Put the files in `web/public/audio/` with the names above. I'll swap the synthesised sounds and the browser voice for your recordings. The trigger points already exist in the game: hits, bounces, net, crowd states, every commentary category, umpire calls and the DJ.
