# Playing the Unreal build in the browser (Pixel Streaming 2)

Unreal renders Rally Club on a GPU machine; Epic's **Pixel Streaming 2** sends the video and audio to the
browser over WebRTC; the website sends the player's controls back. Everything visual — Lumen lighting,
virtual shadow maps, MetaHuman-grade characters — comes from Unreal, so the browser only needs to play video.

```
 Browser (rally-club/web/stream.html)                 GPU host
 ┌─────────────────────────────────────┐   WebRTC   ┌──────────────────────────────┐
 │ Epic player lib (video + audio)  ◀──┼────────────┼── RallyClub (UE 5.6) streamer │
 │ Club HUD (score, subtitles)      ◀──┼─ response ─┼── ARallyStreamBridge          │
 │ Keyboard / touch / gamepad ──────┼──┼─ UI msg ──▶┼── → ARallyMatchGameMode       │
 └─────────────────────────────────────┘            └──────────────▲───────────────┘
                     ▲  ws://host:80 (players)                       │ ws://host:8888 (streamer)
                     └──────────── Wilbur signalling / web server ────┘
```

## What is in the repo

| Part | File |
| --- | --- |
| Web player page (Epic `@epicgames-ps/lib-pixelstreamingfrontend-ue5.6` 0.3.2, club styling, connect screen, input bridge, HUD) | `web/stream.html`, `web/src/stream/` |
| Message protocol (browser ↔ Unreal), shared by both sides | `shared/src/streamProtocol.ts` |
| Unreal receiver / sender (`UPixelStreaming2Input` + JSON → `ARallyMatchGameMode`) | `unreal/Source/RallyClub/{Public,Private}/RallyStreamBridge.*` |
| Plugin + module dependencies | `unreal/RallyClub.uproject` (PixelStreaming2 enabled), `RallyClub.Build.cs` (`PixelStreaming2Input`, `Json`) |
| Signalling/web server launcher (serves our site, stream page as homepage) | `scripts/unreal/start-signalling.{sh,ps1}` |
| Streamed game launcher | `scripts/unreal/run-streamed-game.{sh,ps1}` |
| Entry point from the browser edition | Play tab → **Play on Unreal Engine** |

Rally Club sends **structured input** (`rally.input` = the same `ControlInput` every input source produces),
not raw keystrokes, so Unreal needs no per-device mappings and touch/gamepad/keyboard all behave like the
browser edition. Raw key/mouse/touch forwarding in the Epic library is deliberately turned off.

## Run it (GPU workstation, Windows shown; Linux scripts are equivalent)

1. **Build the website:** `cd rally-club && npm install && npm run build` (creates `dist/web` with `stream.html`).
2. **Compile & package Unreal 5.6:** open `unreal/RallyClub.uproject` (accept the plugin prompt), build
   `RallyClubEditor`, create the level per `unreal/Content/README.md`, then package Shipping for Win64 into
   `unreal/Packaged`.
3. **Start signalling + website:** `powershell scripts/unreal/start-signalling.ps1`
   (clones Epic's `PixelStreamingInfrastructure` UE5.6 branch on first run).
4. **Start the streamer:** `powershell scripts/unreal/run-streamed-game.ps1`
5. **Play:** open `http://<workstation-ip>/` on any device on the network → **Connect**.
   Or from the browser edition: Play → **Play on Unreal Engine**, enter `ws://<workstation-ip>:80`.

Quick test without packaging: in the editor, Play-in-Editor with **Level Editor → Pixel Streaming 2 →
Stream Level Editor/Viewport**, pointing at `ws://127.0.0.1:8888`.

## Internet deployment notes

* A site served over HTTPS (e.g. Netlify) must use **`wss://`**: run Wilbur with `--https` and a certificate,
  or put it behind a TLS reverse proxy.
* Players outside the LAN need a **TURN** server (coturn) — pass it to Wilbur with `--peer_options`.
* One Unreal instance renders **one** camera. Separate cameras per remote player means one streamer
  (and one GPU encoder session) each; budget ~5–10 Mbps per 1080p60 stream. A shared broadcast view can be
  sent to many viewers via Epic's SFU.

## Status (honest)

| Item | Status |
| --- | --- |
| Web player page builds (TypeScript strict, Vite) | ✅ built in this environment |
| Web player connects to a live stream | ⛔ untested — no Unreal/GPU here |
| `ARallyStreamBridge` compiles | ⛔ untested — written against the UE 5.6 PixelStreaming2 API (`UPixelStreaming2Input`, `OnInputEvent`, `SendPixelStreamingResponse`); if the names differ in your engine, use the Blueprint fallback described in `RallyStreamBridge.h` |
| Launch scripts | ⛔ untested — verify Wilbur flags (`--serve --http_root --homepage --player_port --streamer_port`) against the cloned branch's `--help` |
