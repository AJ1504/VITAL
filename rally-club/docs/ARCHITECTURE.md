# Architecture

## One gameplay core, three hosts

```
                ┌──────────────────────────── shared gameplay core ────────────────────────────┐
                │ Court · BallPhysics (120 Hz) · ShotSolver · PickleballRules · MatchSim · AI    │
                │ AtmosphereDirector (event bus) · CommentaryEngine                              │
                │   TypeScript: /shared/src          C++17 port: /unreal/Source/RallyClub/Core   │
                │   (identical results — scripts/parity-check.sh)                                │
                └───────────────▲───────────────────────────────▲───────────────────────────────┘
                                │                               │
     ControlInput (move, swing{shot, aim})            SimEvents → AtmosphereDirector cues
                                │                               │
   ┌────────────────────────────┴───┐   ┌───────────────────────┴──────────────────────────────┐
   │ Input sources                  │   │ Presentation hosts                                    │
   │ • keyboard / gamepad / touch   │   │ • /unreal — production client (UE5: GameMode, pawn,   │
   │   (fallback, P1)               │   │   ball, Quartz/MetaSounds DJ, HISM crowd, camera)     │
   │ • phone motion controller (P2) │   │ • /web — TEMPORARY browser harness (Three.js, WebAudio)│
   │ • AI controller                │   │ • /server — authoritative headless sim (P5)           │
   └────────────────────────────────┘   └──────────────────────────────────────────────────────┘
```

* **Determinism.** The core advances in fixed 1/120 s steps from seeded RNG (mulberry32). The TS and C++
  implementations produce bit-identical matches for the same seed (6-seed parity check in CI). This is the
  foundation for P5: an authoritative server can run the same core, clients can predict, and replays are
  input logs.
* **Input abstraction.** Everything that plays — keyboard, touch, AI, and in P2 the phone — produces a
  `ControlInput { moveX, moveZ, swing: { shot, aim } }` in the player's own frame. The sim decides contact
  (closest approach inside the swing window), quality (timing + distance from the sweet spot, minus a pace
  penalty) and execution error. **The phone never asserts racket position** (brief §5): IMU data is mapped
  to swing timing, approximate speed, face/stroke and aim only.
* **Presentation is event-driven.** The sim emits `SimEvent`s (rule events, contact, bounce, net, whiff,
  point reset). The AtmosphereDirector turns them into cues (crowd state + intensity, DJ duck/filter/build/
  drop/sting, prioritised commentary with cooldowns, camera moves, confetti/sparkle, per-side haptics, crowd
  energy). Hosts subscribe; nothing in the core knows about rendering or audio.

## Coordinates

Core: metres, right-handed, **y up**, x across the court, z along it, net plane z = 0, side 0 owns z > 0
(faces −z; its right is +x). Unreal: centimetres, left-handed, Z up. Conversion
(`unreal/.../Public/RallyTypes.h`): `UE = (z, −x, y) × 100` — a reflection, so physical handedness (a
player's forehand side) is preserved.

## Unreal module map

| Class | Role |
| --- | --- |
| `ARallyMatchGameMode` | Owns `RallyCore::MatchSim` + AI, ticks it, mirrors ball/players onto actors, forwards events to the director |
| `ARallyPlayerPawn` | Render-only player; Enhanced Input fallback → `ControlInput`; exposes Anim BP variables (speed, swing alpha, backhand, serving, celebrate) |
| `ARallyBall` | Render-only ball with 1.6× visual scale (physics stays regulation) + impact sounds |
| `UAtmosphereDirectorSubsystem` | Port of `atmosphere.ts` + `commentary.ts`; Blueprint-assignable cue delegates |
| `ARallyDJBooth` | MetaSound DJ set from the booth's attenuated speakers; Quartz clock (122 BPM, 4/4); cues quantised to bars; `DuckGain` / `FilterCutoff` / `Build` / `Drop` / `Sting` parameters |
| `ARallyCrowd` | HISM spectators from seat rows, per-instance custom data, CPU re-pose only within an animation-LOD radius |
| `ARallyBroadcastCamera` | Elevated broadcast view; point sweep, tension push, celebration orbit; reduced-motion aware |

## Delivery & multiplayer (forward plan, P2–P5)

* **Phones (P2):** controller page served by `/controller`; phones connect over **WebSocket** to `/server`
  (room code from the QR). Messages carry `seq`, client timestamp, smoothed sensor features and a detected
  swing event; the relay timestamps on receipt, tracks RTT/jitter/loss for the diagnostics panel, and
  forwards `ControlInput` to the host (Unreal locally, or the authoritative sim online).
* **Local match (P3):** two phones → one host; the shared broadcast camera already frames both players.
* **Online (P5):** authoritative headless core on the server (same deterministic sim), Supabase Auth/Postgres
  for accounts, cosmetics and match history, WebRTC for opt-in video/voice (STUN/TURN), and **Pixel
  Streaming 2** for browser delivery of Unreal rendering. One stream is one rendered viewport: separate
  per-player cameras need one UE render instance (and GPU encoder session) per viewer, or a shared
  broadcast view. Budget GPU encoder sessions, bandwidth (~5–10 Mbps per 1080p stream) and added latency
  before committing; do not assume one stream solves multiplayer.
