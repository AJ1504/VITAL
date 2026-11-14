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
