# Content to author in the Unreal Editor (P1)

Binary assets cannot be generated in the authoring environment; create these on the workstation.
Record every imported third-party asset in `docs/ASSET_LICENSING.md` first.

1. **Map `/Game/Maps/L_SunsetRooftop`** — court at world origin (net centre on the ground), playing surface
   9.14 × 18.29 m emerald with 6.10 × 13.41 m court, cream 5 cm lines, 2.13 m kitchens; net 86.4 cm centre /
   91.4 cm posts. Dress to match the browser harness (`web/src/scene/venue.ts` is the layout reference):
   stands on both sidelines, striped awnings, clubhouse façade + sign, DJ booth at (−5.2, 0, −12.6) core
   coordinates → Unreal (−1260, 520, 0) cm, gardens, parasols, bunting, string lights, skyline cards.
   Directional light low (golden hour, ~10–15° elevation) raking across the court; Sky Atmosphere + warm fog.
2. Place `ARallyBroadcastCamera`, `ARallyCrowd` (seat rows along the stands), `ARallyDJBooth`.
3. **Input:** `IA_Move` (Axis2D), `IA_Drive`, `IA_Dink`, `IA_Lob`, `IA_Pause`; `IMC_Rally` mapping
   J/Space, K, L, WASD/arrows, gamepad A/B/Y + left stick. Assign on `BP_RallyPlayerPawn`.
4. **Characters:** stylised skeletal mesh with a `hand_r` socket; `ABP_RallyPlayer` reading `GroundSpeed`,
   `SwingAlpha`, `bBackhand`, `bServing`, `bCelebrating`, `bDejected`.
5. **Audio:** `MS_SunsetDJSet` MetaSound Source with inputs `DuckGain`, `FilterCutoff`, triggers `Build`,
   `Drop`, `Sting`; assign to `BP_RallyDJBooth` with a speaker attenuation asset. Paddle/bounce/perfect
   one-shots on `BP_RallyBall`.
6. Crowd materials: base colour from per-instance custom data 0–2, idle sway WPO using custom data 3 (phase).
