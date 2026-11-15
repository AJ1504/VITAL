# Vital arena system

Six real-time 3D pickleball arenas built from **one shared system**. Each arena is a data config. The builder composes it from reusable components. Every arena uses the same regulation court, collision and rules, so gameplay is identical everywhere.

## Folder structure

```
web/src/arenas/
  config.ts     data model: ArenaConfig, palettes, surfaces, seating, DJ styles, logo placements
  presets.ts    the six arenas (pure data); add an arena by adding a config here
  build.ts      builder: environment, court, bowl, architecture, DJ stage, decor, scoreboard
  branding.ts   logo surfaces (court decals, net padding, walls, DJ façade, flags, banners, entrance, scoreboard)
  lighting.ts   time-of-day presets: day · golden · night
  preview.ts    top-down plans drawn from each config for the arena-select cards
web/src/scene/
  island.ts     island, ocean shader, clouds, distant islands, boats (shared environment)
  surfaces.ts   stylised textures (lawn, sand, paving, microcement, plaster, grain, timber) + rim light
  kit.ts        merged-geometry batching, canvas textures, the Vital logo/crest drawing, path sampling
  crowd.ts      instanced spectators (sculpted seated/standing bodies, reactions)
  body.ts, pal.ts, members.ts   players, DJ and staff
web/src/brand/  vital-white.png, vital-green.png (the supplied wordmark, background removed)
```

## Court (shared by all arenas)

From `shared/src/court.ts`, which is the same as the C++ core: **20 × 44 ft (6.10 × 13.41 m)**, 7 ft (2.13 m) kitchens, centre lines, net 36 in at the posts and 34 in at the centre. The court is always axis-aligned at the origin. Cameras move; court geometry is never rotated. Clear space: the surround runs 3.35 m beyond each sideline and 3.9 m beyond each baseline, and the seating starts a further 1.15 m out.

## ArenaConfig (abridged)

```ts
{
  id, number, name, tagline, blurb,
  palette:   { court, kitchen, alley?, surround, accent, line, stone, paving, seats[], glow, ui{…} },
  surfaces:  { court: 'acrylic'|'clay'|'microcement', surround: …, paving: 'travertine'|'terrazzo'|'wood'|'stone' },
  architecture: 'amphitheater'|'garden-pavilion'|'coastal'|'courtyard'|'sculptural-garden'|'futuristic',
  bowl:      { shape: 'circle'|'rounded', rows, seating: 'bleachers'|'terraces'|'cushion-steps'|'grandstand',
               nearRows, cushionPattern: 'random'|'alternate'|'solid', illuminated },
  dj:        { style: 'illuminated'|'striped-canopy'|'pavilion'|'archway'|'circular'|'disco', color },
  shades:    ['sails'|'banner-sails'|'umbrellas'|'cabanas'],
  planting:  { trees: 'palm'|'olive'|'lemon', flowers[], hedges: 'none'|'clipped'|'sculptural' },
  extras:    ['fire-lounge'|'pergola'|'sculptures'|'canopy-ring'|'courtyard-walls'|'ocean-terrace'|'lemon-trees'],
  logos:     [{ surface, color, scale?, rotation?, offset?, glow?, visible? }],
  lighting:  { default: 'day'|'golden'|'night' },
}
```

**Logo surfaces:** `court-center`, `behind-baseline`, `corner-monograms`, `surround-lettering`, `arena-wall`, `dj-facade`, `net-padding`, `flags`, `banners`, `entrance`, `scoreboard`. Every placement takes colour, scale, rotation, offset, glow and visibility. All marks use the supplied wordmark image, never a script font.

## The six presets

| # | Arena | Court / surround / accent | Architecture | Seating | DJ | Default light |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Lavender Social | lavender / pale mint / ivory | circular amphitheatre | multicolour bleachers, LED risers | illuminated lavender shell, stage beams | golden |
| 02 | Lemon Grove | butter yellow / sage / forest green | garden pavilion, pergola, lemon trees | cream travertine terraces | striped canopy pavilion | day |
| 03 | Azure Riviera | powder blue / blush / white | coastal, open sea view, glass balustrade | ivory steps, blue cushions | elevated white pavilion | day |
| 04 | Terracotta Sunset | peach clay / dusty rose / cream | arcaded courtyard walls | terraced stone | sunset archway with bougainvillea | golden |
| 05 | Pistachio Pavilion | pistachio / pale pink / ivory | sculptural garden (rings, topiary) | alternating green and rose cushions | circular stage with ring truss | day |
| 06 | Coral Disco | coral / lilac / cream | futuristic amphitheatre, floating roof ring | illuminated grandstand chairs | integrated booth, disco ball, luminous logo | night |

## Lighting

`lighting.ts` holds `day`, `golden` and `night`. Each sets the sky gradient, key light (sun, or a high floodlight key at night), hemisphere fill, fog, exposure and an **emissive multiplier** for LED strips and signage. Night adds stars, a moon and floodlight masts. Players choose **Settings → Time of day**: the arena default, or day, golden or night for every arena.

## Cameras

| View | Where |
| --- | --- |
| Elevated isometric (arena select) | menu: slow aerial sweep in front of the DJ |
| Cinematic fly-through | match intro, with a path scaled to the arena's size |
| Broadcast (default gameplay) | behind and above the near baseline, following the play |
| Bird's-eye | true top-down, court long axis horizontal on screen |
| Spectator | from the side stands, tracking the ball |

Press **C** (or the ◎ button) to cycle the gameplay views. The default is set under **Settings → Camera**. URL parameters: `?arena=<id>&time=<day|golden|night>&cam=<broadcast|birdseye|spectator>`.

## Crowd and DJ

Spectators are instanced (one draw call per body part) and spawned on every seat the bowl generates. They idle, watch, chat-sway, clap (applause), cheer and stand (ovation), and react to rallies, winners and match points through the atmosphere director. **Settings → Crowd size** (Empty / Light / Busy / Full) and **Crowd animation** (15 / 30 / 60 updates per second) trade quality for speed. The DJ loops a performance animation on the beat. LED strips, stage beams and pendants pulse with the music's beat phase, and the turntables spin.

## Performance

Static geometry is merged per material and repeated props are instanced. All textures are generated in code: no downloads and no texture memory beyond a few small canvases.

Measured in headless software rendering at the Balanced preset:
- gameplay view: about 100–200 draw calls and 0.55–0.7 million triangles;
- aerial menu view: about 220–300 draw calls.

The **Graphics** preset sets pixel ratio, shadow resolution, post-processing and crowd density.

Not yet done:
- crowd level-of-detail by distance;
- compressed (KTX2) textures, which only matter once real bitmap textures are added;
- profiling on a real phone.

## Adding an arena (or another sport)

1. Add an `ArenaConfig` in `presets.ts`, reusing any seating, DJ, shade or extra modules.
2. The card preview, UI theme and menu entry follow automatically.
3. For tennis or padel, swap the court component's line set and dimensions. The bowl, branding, lighting and crowd systems are sport-agnostic.
