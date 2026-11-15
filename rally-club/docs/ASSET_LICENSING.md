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
| HDRI sky `kloofendal_48d_partly_cloudy_puresky` (2k) | HDRI | Poly Haven — polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | CC0 1.0 | Claude Code pass 2, 2026-11-14 | `web/public/assets/hdri/sky_2k.hdr` |
| PBR textures: `leafy_grass` (2k), `concrete_floor_02`, `white_plaster_02`, `red_brick_03`, `precast_stone_paving`, `wood_table_001`, `leather_red_02` (1k) | Textures | Poly Haven — polyhaven.com/textures | CC0 1.0 | Claude Code pass 2, 2026-11-14 | `web/public/assets/textures/<id>/` (colour, normal-GL, roughness, AO) |
| Models: `shrub_02`, `potted_plant_02`, `planter_box_01` (1k glTF) | 3D | Poly Haven — polyhaven.com/models | CC0 1.0 | Claude Code pass 2, 2026-11-14 | `web/public/assets/models/<id>/`; re-download with `python3 scripts/fetch-assets.py` |
| Members’ Lawn venue, crest, officials, crowd hats, lawn/ivy/backstop/scoreboard/clock textures | 3D + textures (procedural) + SVG | Original — `membersLawn.ts`, `textures.ts`, `index.html` | Project-owned | Claude Code pass 2, 2026-11-14 | Original design; evokes a grass-court championship without using any tournament’s marks |
| UI fonts: Cormorant Garamond, Manrope | Font | Google Fonts | SIL Open Font License 1.1 | Claude Code pass 2, 2026-11-14 | Self-host before ship |
| Resort world: four themed courts (Garden, Clay Terrace, Glass House, Sunset Cliff), stone terraces, sail shades, arched DJ booths, villa, bar, olive/cypress/lemon trees, lavender, parasols, sea and cliffs | 3D (procedural) | Original — `web/src/scene/resort.ts`, `themes.ts` | Project-owned | Claude Code pass 5, 2026-11-15 | Built from primitives; palette inspired by the user's own mood boards |
| Club members Theo, Lila, Jasper, Marcus, Mei, Zara (rig, faces, outfits, animation set) | 3D (procedural) + canvas faces | Original — `web/src/scene/pal.ts`, `members.ts` | Project-owned | Claude Code pass 5, 2026-11-15 | Designed from the user-supplied "Meet the Members" sheet |
| Laurel logo mark | SVG + canvas | Original — `index.html`, `resort.ts` (`drawLaurel`) | Project-owned | Claude Code pass 5, 2026-11-15 | |
| UI fonts: Josefin Sans, Fredoka, Nunito | Font | Google Fonts | SIL Open Font License 1.1 | Claude Code pass 5, 2026-11-15 | Self-host before ship |
| Vital script logo (`web/src/brand/vital-white.png`, `vital-green.png`) | Brand mark (raster, transparent) | Supplied by the project owner (logo image shared in the session, 2026-11-15); background removed in-session | Project-owned brand | Claude Code pass 6, 2026-11-15 | Used in the UI, court paint, banners, DJ booth and crests |
| Vital arenas: Coral Club, Mint Terrace, Lavender Amphitheatre, Rosé Garden (bowls, chairs, DJ booths, disco ball, sails, cabanas, bar, palms) | 3D (procedural) | Original — `web/src/scene/arena.ts`, `kit.ts`, `themes.ts` | Project-owned | Claude Code pass 6, 2026-11-15 | Designed from the owner's mood-board renders; no third-party meshes |
| Member bodies (SDF-sculpted skinned meshes) | 3D (procedural) | Original — `web/src/scene/body.ts` | Project-owned | Claude Code pass 6, 2026-11-15 | Generated at runtime |
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
