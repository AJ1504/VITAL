# Feature status — running table

Legend: **Implemented** = code exists · **Tested** = covered by an automated test that was actually run
and passed in this environment · **Blocked** = cannot be done/verified here (reason given) · **Planned** = later phase.

_Last updated: 14 Nov 2026, end of implementation pass 1 (P1)._

## Environment inspection (pass 1)

| Item | Found |
| --- | --- |
| OS / CPU / RAM | Linux container, 4 vCPU, 15 GB RAM |
| GPU | **None** (`nvidia-smi` absent) — WebGL only via SwiftShader software rendering |
| Unreal Engine | **Not installed**, and not installable here (Epic account + ~100 GB + GPU required) |
| Toolchain | Node 22.23, npm 10.9, clang/g++, CMake, Python 3, Playwright + Chromium |

Decision (per brief §7): build the engine-agnostic core in TypeScript **and** C++, verify both, render the
P1 slice in a clearly labelled browser harness, and write the Unreal module against the C++ core.

**Unreal version pin: 5.6** (`unreal/RallyClub.uproject`). It is the newest release whose APIs this
pass was written against with confidence (Enhanced Input, Quartz, MetaSounds, Pixel Streaming 2).
The brief cites 5.8/5.9-era references; upgrading the pin is a one-line change to be made on the
Unreal workstation **after** the module compiles there (see Blockers).

## P1 — playable vertical slice

| Feature | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| Regulation pickleball court geometry (20×44 ft, 7 ft NVZ, 36/34 in net) | ✅ | ✅ unit (TS + C++) | `shared/src/court.ts`, `unreal/.../Core/RallyCore.cpp` |
| Ball physics: gravity, quadratic drag, Magnus spin, bounce, net block / net cord | ✅ | ✅ unit (TS + C++) | Rebound from 78 in drop lands in the 30–34 in equipment band |
| Shot solver (serve / drive / dink / drop / lob → launch velocity, net clearance) | ✅ | ✅ unit (TS + C++) | Lands within 5 cm of target; verified with net collision on |
| Rules: side-out scoring, to 11 win by 2, serve court alternation, diagonal service box | ✅ | ✅ unit (TS + C++) | Kitchen line = fault on serve; lines in |
| Rules: two-bounce rule, kitchen (NVZ) volley, out, net, double bounce, double hit | ✅ | ✅ unit (TS + C++) | |
| Game point / saved game point / ace / comeback detection | ✅ | ✅ unit | Feeds commentary + DJ |
| Match loop (fixed 120 Hz), serve setup, point pause, game over | ✅ | ✅ unit + e2e | `MatchSim` |
| Contact model: swing window, sweet-spot timing, quality → error, forehand/backhand | ✅ | ✅ unit (indirect) + e2e | |
| Assist modes casual / classic / precision (auto-move, reach, timing tolerance) | ✅ | ✅ unit (casual never commits 2-bounce/kitchen faults) | |
| Club AI (easy / medium / hard): intercept prediction, line judgement, two-bounce discipline, third-shot drops, dinks, lobs | ✅ | ✅ unit: 4 full AI-vs-AI games to 11 complete with legal scores | Tuning: median rally is short (2–3 shots) — see next tasks |
| **TS ↔ C++ determinism parity** (6 full matches identical) | ✅ | ✅ `npm run test:parity` | |
| Practice mode (ball machine feeds, streaks) | ✅ TS | ✅ unit + e2e | Not yet ported to C++ |
| Sunset Rooftop Club environment (court, net, stands, awnings, clubhouse, gardens, parasols, bunting, string lights, skyline, golden-hour shadows) | ✅ harness | ✅ e2e screenshots | All primitives + procedural textures |
| Two stylised characters with procedural idle/run/swing/serve/celebrate/dejected | ✅ harness | ✅ e2e screenshots | |
| Basic crowd states (idle, murmur, tension, cheer, gasp, applause, ovation), instanced | ✅ harness + UE source | ✅ unit (director cues) / e2e | UE crowd actor not compiled |
| DJ booth + music: original procedural 122 BPM nu-disco loop, 3D panner at the booth, ducking, game-point filter, build/drop/sting | ✅ harness + UE source | ✅ unit (cue logic) | Audio output not verifiable headless; UE Quartz/MetaSounds not compiled |
| Event-based commentary (priorities, cooldowns, repetition avoidance) + subtitles + temporary browser TTS | ✅ | ✅ unit + e2e (subtitle shown) | No recorded VO yet |
| AtmosphereDirector event bus (crowd, DJ, commentary, camera, VFX, haptics, energy) | ✅ TS + UE source | ✅ unit (TS) | |
| Broadcast camera, point sweep, tension push, celebration orbit; confetti, sparkle | ✅ | ✅ e2e screenshot | |
| HUD: scoreboard, server indicator, score call, rally counter, crowd energy, toasts | ✅ | ✅ e2e | |
| Menus HOME / PLAY / SPORTS / MY PLAYER / FRIENDS / COURTS / SETTINGS, pause, results | ✅ | ✅ e2e | Non-P1 items shown as locked with their phase |
| Settings: assist, difficulty, game length, volumes, voice, graphics preset, camera shake, subtitles, reduced motion, high contrast, text size, vibration | ✅ | ✅ e2e (render) | Persisted in localStorage when available |
| Fallback input: keyboard, gamepad, on-screen touch buttons | ✅ | ✅ e2e (keyboard + touch) | Gamepad untested (no device) |
| Unreal C++ core (rules, physics, solver, match loop, AI) | ✅ | ✅ 18/18 CoreTests, `-Werror` | |
| Unreal gameplay module (GameMode, pawn, ball, director subsystem, DJ booth, crowd, camera) | ✅ source | ⛔ **Blocked** | Needs Unreal 5.6 to compile; never claimed to build |
| Unreal Automation tests | ✅ source | ⛔ **Blocked** | Same cases pass in CoreTests |
| Unreal level `L_SunsetRooftop`, meshes, Animation Blueprint, MetaSound DJ set, Input assets | ❌ | ⛔ **Blocked** | Editor-authored binary assets; steps in `unreal/Content/README.md` |

## Pass 2 — visual quality & regal identity (14 Nov 2026)

| Feature | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| **The Members’ Lawn** venue (default): striped championship lawn with baseline wear, bottle-green backstops with gold lettering, 12-row bowl on four sides under cantilevered canopies, claret Members’ Box, ivy corner towers, hydrangea borders, scoreboard with live score + working clock, garden bandstand DJ | ✅ | ✅ e2e (loads, plays) + reviewed stills | Venue switch in Courts tab |
| Officials & ball crew: chair umpire, line judges, ball kids (seated/crouch poses, heads track the ball) | ✅ | ✅ visual review | |
| Real CC0 assets (Poly Haven): HDRI sky + image-based lighting, PBR grass/concrete/brick/plaster/paving/wood/leather, shrub / potted-plant / planter models | ✅ | ✅ loads without errors (Medium) | ~40 MB in `web/public/assets`; skipped on Low |
| Rendering: soft shadows on all presets (1k/2k/4k maps), GTAO ambient occlusion (High), bloom (Medium/High), SMAA, merged static geometry | ✅ | ✅ stills (Medium) | High (GTAO) frames not captured: too slow on software rendering |
| Realistic body proportions (players, officials, crowd), knee joints, all-white kit with trims, visors, boaters / panamas, summer-party crowd wardrobe | ✅ | ✅ visual review | Still procedural models — see Blockers |
| Regal identity: original crest, Cormorant Garamond / Manrope, ivory–bottle–gold palette, broadcast score bug, restyled menus/toasts/subtitles | ✅ | ✅ e2e + stills | |
| Audio: stadium convolution reverb, FM electric-piano lounge-house DJ set at 120 BPM, wide stereo applause, umpire line/score calls, British voice preference for umpire & commentary | ✅ | ⛔ not audible headless | |

**Remaining visual gap:** characters are still built from primitives. Photoreal or high-end stylised
people need rigged, animated human models (e.g. MetaHumans in the Unreal build, or licensed/CC0 glTF
characters). Fetching third-party character packs from GitHub was not permitted in this session.

## Pass 3 — Unreal in the browser (Pixel Streaming 2)

| Feature | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| Web stream player (`stream.html`, Epic lib 0.3.2 for UE 5.6), club-styled connect screen, autoplay handling | ✅ | ✅ e2e 7: loads, validates host, library attempts connection and reports disconnect | |
| Structured input bridge (`rally.input`, seq/ack, 10 Hz keep-alive, swing edges) + commands | ✅ | ✅ unit (protocol) | Raw device forwarding disabled on purpose |
| Unreal `ARallyStreamBridge` (PixelStreaming2 input component → GameMode; score/commentary responses) | ✅ source | ⛔ no Unreal here | Blueprint fallback documented |
| Signalling/web server + streamer launch scripts (Win/Linux) | ✅ | ⛔ no GPU host | Verify Wilbur flags on first run |

## Pass 4 — Wii-Sports-style presentation & feel (original designs)

| Feature | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| "Pal" characters: chunky toy proportions, canvas faces with blink, ball-tracking eyes and 7 expressions, elbows/knees, hair & headwear styles | ✅ | ✅ video + stills | `web/src/scene/pal.ts` |
| Animation: ready stance, split-step hop, auto backswing timed to the incoming ball, whip + follow-through FH/BH, underhand serve, run cycle, fist-pump, dejected slump, celebration jumps, wave, clap | ✅ | ✅ video | Keyframed poses blended over procedural locomotion |
| Game feel: hit-stop, slow-mo on perfect contact, ball squash & stretch, speed-coloured ribbon trail, impact ring, camera kick, "NICE SHOT!/PERFECT!/WHIFF!/GREAT RALLY!" pop-ups | ✅ | ✅ video | Reduced-motion turns these off |
| Presentation: intro fly-in + title card, "Ready? / Play!", winner close-up + score card each point, "Game Point" banner, celebration orbit (loser claps), trophy results | ✅ | ✅ video + e2e | Any key/tap skips the intro |
| Follow camera behind the player; friendly rounded UI (Fredoka/Nunito, tiles, bouncy buttons, outlined pop text); cute crowd with eyes; brighter grade; jingles | ✅ | ✅ stills | |
| QA video capture (virtual time, one frame per step) | ✅ | ✅ produced a 42 s gameplay video | `?capture` + scratch script |

## Later phases

| Phase | Feature | Status |
| --- | --- | --- |
| P2 | QR pairing, motion permission, calibration, filtered swing detection, diagnostics, haptics | Planned — design in `controller/README.md`, `server/README.md` |
| P3 | Two phones, shared broadcast view, local social match | Planned (MatchSim already takes two `ControlInput`s) |
| P4 | Tennis, padel (glass walls), Azure Coast | Planned (`Court.sport` is sport-agnostic; rules engine per sport) |
| P5 | Accounts (Supabase), rooms, matchmaking, authoritative server, WebRTC video/voice, Pixel Streaming 2 | Planned |
| P6 | Crowd variety, clubhouses, VO, DJ transitions, replays, cosmetics, optimisation | Planned |

## Test results (pass 1 — actual runs)

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript typecheck | `npm run typecheck` | ✅ no errors |
| Unit tests (TS core) | `npm test` | ✅ 56 / 56 passed |
| C++ core tests | `npm run test:core-cpp` | ✅ 18 / 18 passed (GCC, `-Wall -Wextra -Wpedantic -Werror`) |
| TS ↔ C++ parity | `npm run test:parity` | ✅ identical results for 6 seeds |
| Browser e2e (headless Chromium, SwiftShader) | `npm run build && npm run test:e2e` | ✅ 6 / 6 passed |
| Unreal build / Automation | — | ⛔ not run (no Unreal Engine) |

e2e cases: (1) menu renders with harness label, no console errors; (2) **P1 ACCEPT** — keyboard serve →
scored rally; (3) pause/resume; (4) practice feeds & results; (5) AI-vs-AI game to 3 → celebration → results;
(6) phone viewport shows touch controls and a touch swing serves.

## Blockers (precise)

1. **No Unreal Engine / no GPU in this environment.** The UE module and Automation tests are uncompiled.
   Unblock: on a Windows/Linux workstation with UE 5.6 and an RTX-class GPU, run the commands in
   `unreal/README.md`; fix any compile errors (expect minor API drift), then author the assets listed in
   `unreal/Content/README.md`.
2. **No real phones** — P2 motion work cannot be validated here (iOS Safari + Android Chrome matrix needed).
3. **Audio output cannot be heard headless** — music/crowd/SFX scheduling is code-reviewed and cue logic is
   unit-tested, but the mix needs a listening pass on real hardware.
4. **Real-GPU frame rate unmeasured** — SwiftShader (CPU) gives 2–6 fps, which says nothing about GPUs;
   draw-call/triangle counts were measured (see `PERFORMANCE_BUDGETS.md`).
5. **External reference pages were not fetched** in this pass; work used the brief's descriptions and the
   attached screenshot only.

## Next concrete coding tasks

1. Compile the UE module on the Unreal workstation; fix API drift; create `L_SunsetRooftop` and BP subclasses; run `Automation RunTests RallyClub`.
2. AI tuning: lengthen rallies (median 2–3 → 5–7): better third-shot drop success, fewer unforced return errors, add a "reset" shot when out of position.
3. Port practice mode to the C++ core; extend parity script to practice feeds.
4. Merge static venue geometry in the harness (≈250 → <90 draw calls).
5. P2: `server/` WebSocket relay with room codes + `controller/` mobile web app (QR pairing, `DeviceMotionEvent.requestPermission`, calibration, swing detector → `ControlInput`).
6. Record temporary VO for the commentary table; replace browser TTS.

## Pass 5 — the resort, the members, Wii-style feel (15 Nov 2026)

Response to play-test feedback ("slow, laggy, instant aces, not intuitive, boring"). This pass replaces the
Members' Lawn as the default world. The Lawn and Rooftop venues remain in the code but are not reachable from the menu.

| Feature | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| **Resort world**: four themed courts on one hillside — Garden Court (sage/sand pickleball, playable), Clay Terrace (powder-blue tennis), Glass House (lavender padel), Sunset Cliff (peach pickleball). Each has a terraced crowd, sail shades, laurel banners and its own DJ booth. Also: villa with bougainvillea, a cocktail bar with a bartender, a walking waiter, the sea and cliffs | ✅ | ✅ stills + e2e | Only the Garden Court is playable; the others are visible and labelled "soon" |
| Pastel per-court UI themes (`body[data-court]`), new logo and the tag line "The club is yours", Courts / Members / Settings tabs, floating court labels over the club map | ✅ | ✅ e2e tab check + stills | |
| **Members**: six original characters with expressive canvas faces (8 expressions), hairstyles, headwear and outfits. Action set: forehand, backhand, serve, ready, fist pump, celebrate, laugh, dejected, wave, clap. Includes a side-shuffle footwork cycle and pose smoothing | ✅ | ✅ visual review + e2e member selection | Still procedural primitives; no skinned meshes |
| **One-button play**: Space, a click, a tap or gamepad A swings. Shot choice (dink, drive, lob) is automatic, and swing timing aims the shot (early = crosscourt, late = down the line). There is a timing ring under the player and a three-step first-match coach | ✅ | ✅ unit (timingAim) + e2e | K/L still force a dink or lob |
| **Fixed-tick AI** at the sim rate, so returns don't depend on frame rate. This fixes the "instant ace" on slow devices | ✅ | ✅ unit + headless return-rate check | |
| Performance: Medium is the default; no GTAO; capped DPR; crowd re-posed at 30 Hz; crowd geometry slimmed (~1.0M → ~0.5M triangles at Medium, ~310 draw calls) | ✅ | ✅ `renderer.info` under SwiftShader | Not yet profiled on a real phone |
| C++ port of `timingAim` | ❌ | — | Parity tests don't exercise it yet (the field is optional) |

## Pass 6 — Vital arenas and sculpted members (15 Nov 2026)

Built from the owner's Vital logo and four arena mood boards. This replaces the hillside resort from pass 5.

| Feature | Implemented | Tested | Notes |
| --- | --- | --- | --- |
| **Four playable arenas**, chosen on the Courts tab and rebuilt live behind the menu. **Coral Club**: coral court, sage surround, blush/sage chair bowl, disco-ball arch DJ, Vital sail banners, golden hour. **Mint Terrace**: glossy mint court with a yellow kitchen, stone arches, loungers and lemonade, morning light. **Lavender Amphitheatre**: lavender/powder-blue court, white steps with LED risers, shell-canopy DJ with stage beams, fire-pit lounges, dusk. **Rosé Garden**: sage court, blush surround, sail shades, striped crest cabanas | ✅ | ✅ stills of every arena (menu + gameplay); e2e on the default | Each has its own sky, light, exposure and pastel UI theme |
| Vital branding: script logo in the menu, painted on court and surround, on banners, DJ desk, bar menu and crests (laurel + script V) | ✅ | ✅ stills | Logo extracted from the supplied image |
| **Sculpted member bodies**: one continuous skinned mesh per member (signed-distance sculpt with smooth unions, meshed with surface nets, coloured per clothing region, skin-weighted to the rig), replacing separate primitives. Shoulders, elbows, hips and knees deform smoothly | ✅ | ✅ close-up stills (ready, forehand, backhand); unit/e2e | About 0.25 s per distinct outfit cut at load; cached per cut |
| Broadcast hard cuts for the point-winner and celebration cameras (no sweep through the player) | ✅ | ✅ camera trace | |
| Performance: about 150–180 draw calls and 0.23–0.43M triangles at Medium (was about 310 and 0.5M) | ✅ | ✅ `renderer.info` | Not yet profiled on a phone |
| Free CC0 character packs evaluated (Kenney Mini Characters): rejected, because the 6-bone rig has no elbows or knees. AI 3D generation (Higgsfield/Meshy) needs paid credits | — | — | See the session notes |
