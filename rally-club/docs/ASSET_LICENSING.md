# Asset licensing ledger

Every shipped asset must have a row here **before** it is imported. "Original" means created for Rally Club
by the project; anything else needs a licence reference and the person who verified it.

| Asset | Type | Source | Licence | Verified by / date | Notes |
| --- | --- | --- | --- | --- | --- |
| Venue geometry (court, net, stands, clubhouse, planters, parasols, skyline) | 3D (procedural) | Original — `web/src/scene/venue.ts` | Project-owned | Claude Code pass 1, 2026-11-14 | Three.js primitives only |
| Tile, stripe, net, window, sign, grain, radial textures | Textures (procedural canvas) | Original — `web/src/scene/textures.ts` | Project-owned | Claude Code pass 1, 2026-11-14 | Generated at runtime |
| Player, DJ and spectator characters | 3D (procedural) | Original — `character.ts`, `crowd.ts` | Project-owned | Claude Code pass 1, 2026-11-14 | Original stylised designs; no third-party likeness |
| DJ music loop (122 BPM, Fmaj7–Em7–Dm7–Cmaj7) | Audio (synthesised) | Original — `web/src/audio/audio.ts` | Project-owned | Claude Code pass 1, 2026-11-14 | Synthesised at runtime; no samples |
| Crowd bed, cheer, applause, gasp; paddle, bounce, net SFX | Audio (synthesised) | Original — `audio.ts` | Project-owned | Claude Code pass 1, 2026-11-14 | |
| Commentary script (all lines) | Text | Original — `shared/src/commentary.ts` | Project-owned | Claude Code pass 1, 2026-11-14 | Voice in the harness is the **browser's built-in TTS** (temporary, not shipped) |
| UI fonts: Fraunces, DM Sans | Font | Google Fonts | SIL Open Font License 1.1 | Claude Code pass 1, 2026-11-14 | Loaded from fonts.googleapis.com; self-host before ship |
| Three.js 0.170.0 | Library | npm | MIT | Claude Code pass 1, 2026-11-14 | |
| Vite 6.3.5, TypeScript 5.8.3 | Dev tooling | npm | MIT / Apache-2.0 | Claude Code pass 1, 2026-11-14 | Not shipped |
| `/Engine/BasicShapes/Sphere` (ball placeholder in UE) | 3D | Unreal Engine | Unreal EULA | — | Replace with project ball mesh |

## Reference material (not shipped, not copied)

| Reference | Use | Status |
| --- | --- | --- |
| *Rooftop Rally* screenshot (posted by @morenicksaraev, credit @chongdashu) | Mood only: camera height, court readability, warm shadows | Not a source of assets or code; no ownership/licence implied |
| Alexis Dornier Bali Tennis Club; MVRDV "The Couch" (Designboom) | Architectural inspiration for later venues | Individual projects need separate review if referenced closely |
| Epic MetaHuman Crowd / City Sample | Technical inspiration (crowd LOD, scene layering) | Do not import their assets without checking the sample licence |

## To be licensed / produced before shipping

- French house / nu-disco / funky house / lounge / sunset deep-house **DJ sets** (original commissions or licensed stems with sync rights)
- Commentator **voice-over** recordings (session contract with game-usage rights)
- Final character, outfit, racket, emote and venue art; animation set (original or licensed)
