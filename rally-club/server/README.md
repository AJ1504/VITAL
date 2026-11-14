# /server — controller relay and session authority (P2 → P5, planned)

**Not implemented yet.** Responsibilities, in order of phases:

* **P2:** room codes; WebSocket relay between phones (`/controller`) and the host game (Unreal or the
  browser harness); per-connection seq tracking, RTT/jitter/loss stats, reconnect into the same player slot.
* **P3:** two (later four) phone slots per room; local match orchestration.
* **P5:** authoritative headless match simulation using the shared deterministic core
  (`shared/src/match.ts`; C++ twin in `unreal/Source/RallyClub/Core`), Supabase Auth/Postgres for accounts,
  cosmetics and match history, matchmaking/private rooms, spectators, WebRTC signalling (STUN/TURN) for
  opt-in video/voice with privacy defaults, Pixel Streaming 2 signalling/orchestration.

Environment variables are listed in `../.env.example`.
