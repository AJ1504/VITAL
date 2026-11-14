# QA checklist

Run before every merge. Automated items list their command; manual items need a person and real hardware.

## Automated (must all pass)

- [ ] `npm run typecheck`
- [ ] `npm test` — rules, physics, solver, match loop, director, commentary
- [ ] `npm run test:core-cpp` — C++ core, warnings as errors
- [ ] `npm run test:parity` — TS and C++ cores identical
- [ ] `npm run build && npm run test:e2e` — includes **P1 ACCEPT** (keyboard serve → scored rally)
- [ ] Unreal (workstation): `UnrealEditor-Cmd RallyClub.uproject -ExecCmds="Automation RunTests RallyClub; Quit" -unattended -nullrhi`

## Gameplay (manual, browser harness and Unreal)

- [ ] Serve from the right at even score, left at odd; serve lands diagonally; serve into kitchen is called
- [ ] Return of serve and third shot must bounce (try volleying them in Classic: fault is called)
- [ ] Volley while standing in the kitchen → "KITCHEN!" fault; hit from the kitchen after a bounce → legal
- [ ] Only the server scores; side-out swaps the server indicator; score call reads server-first
- [ ] Game ends at 11 with a 2-point margin (play 10–10 → 12–10)
- [ ] Ball visibly clears / clips / is stopped by the net; line balls are in
- [ ] Casual: auto-move reaches most balls, timing forgiving; Precision: manual movement required
- [ ] Practice: ball machine alternates forehand/backhand; streak counter and best update

## Atmosphere

- [ ] DJ music audible from the booth side; pans as the camera moves
- [ ] Commentary ducks the music and recovers afterwards; subtitles match speech
- [ ] Rally ≥ 8 → crowd murmur; ≥ 15 → tension, DJ riser, camera push, long-rally call
- [ ] Game point → music filters down; saved game point → "Saved!" call; game won → ovation, sting, confetti, celebration camera, results screen
- [ ] No repeated commentary line back-to-back; no commentary spam during quick points

## Accessibility & settings

- [ ] Reduced motion: no camera sweeps/orbits, no confetti, minimal crowd bounce
- [ ] Subtitles toggle; text size 115% / 130% scales HUD and menus
- [ ] High-contrast HUD readable on the sunset background
- [ ] Every action reachable by keyboard only and by touch only; gamepad A/B/Y + stick
- [ ] Settings persist across reloads (and the game still works in a private window with storage blocked)

## Devices

| Device / browser | Load | Touch play | Audio | 30+ fps | Notes |
| --- | --- | --- | --- | --- | --- |
| Desktop Chrome (GPU) | | n/a | | | |
| Desktop Safari | | n/a | | | |
| Desktop Firefox | | n/a | | | |
| iPhone Safari (iOS 17+) | | | | | Audio starts only after a tap |
| Android Chrome | | | | | Vibration haptics |
| iPad Safari | | | | | |

## P2 controller matrix (when implemented)

- [ ] iOS Safari: motion permission prompt appears only after a tap; denial falls back to touch controls
- [ ] Android Chrome: no permission prompt; sensor rate ≥ 60 Hz
- [ ] Sensor-to-shot latency (swing peak → contact event) p95 ≤ 80 ms on LAN
- [ ] Reconnect after Wi-Fi drop resumes the same player slot within 3 s
- [ ] Calibration: left-handed players' forehand/backhand detected correctly
