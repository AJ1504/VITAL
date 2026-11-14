# Performance budgets

## Targets

| Platform | Frame rate | Frame budget | Notes |
| --- | --- | --- | --- |
| Unreal, desktop RTX 3060-class, 1440p | 60 fps (stretch 120) | 16.6 ms | Lumen + VSM on "High"; ball must never drop frames |
| Unreal, Pixel Streaming 2 host (P5) | 60 fps per stream | 16.6 ms incl. encode | One render instance per distinct camera |
| Browser harness, desktop integrated GPU | 60 fps | 16.6 ms | "High" preset |
| Browser harness, mid-range phone | 30–60 fps | 33 ms | "Medium"/"Low" preset |

| Budget | Value |
| --- | --- |
| Simulation step | fixed 120 Hz; ≤ 0.5 ms CPU per step (two players, ball, rules) |
| Phone sensor → shot (P2) | p95 ≤ 80 ms on LAN (sensor 60–100 Hz, WebSocket, sim contact window) |
| Input → visible swing (fallback input) | ≤ 2 frames |
| Draw calls, harness | ≤ 120 (High), ≤ 80 (Low) |
| Triangles, harness | ≤ 250 k (High), ≤ 100 k (Low) |
| Spectators | High 156 · Medium ~105 · Low ~57 (harness); Unreal target 400–1,000 via HISM + material WPO, CPU re-pose only within 35 m |
| Audio voices | ≤ 48 concurrent (music ≈ 12, crowd ≤ 16, SFX ≤ 12, VO 1) |
| Initial download, harness | ≤ 250 kB gzipped JS (current: 153 kB) |

## Measured (pass 1, headless Chromium, 1280×720, SwiftShader)

| Preset | Draw calls | Triangles | Geometries | Textures | Spectators | FPS* |
| --- | --- | --- | --- | --- | --- | --- |
| High | 253 | 185,813 | 341 | 47 | 156 | 2.0 |
| Medium | 253 | 133,997 | 341 | 47 | 105 | 6.3 |
| Low | 249 | 85,149 | 311 | 46 | 57 | 5.0 |

\* SwiftShader is CPU software rendering; these FPS numbers are **not** representative of any GPU and are
recorded only so later passes can compare like with like. Real-device frame times have not been measured.

**Over budget:** draw calls (≈250 vs ≤ 120). Cause: hundreds of small unmerged static meshes (stand risers,
balustrade posts, flags, trees). Fix (next pass): merge static venue geometry by material
(`BufferGeometryUtils.mergeGeometries`) and instance flags/posts — expected < 90 calls.

Unreal-side budgets are untested until the module compiles on a GPU workstation.
