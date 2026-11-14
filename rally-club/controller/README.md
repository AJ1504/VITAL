# /controller — phone motion controller (P2, planned)

Mobile web app that turns a phone into a Wii-style paddle. **Not implemented yet** — P1 shipped the
fallback input path first, as the brief requires. Output is the same `ControlInput` the keyboard produces
(`shared/src/match.ts`), so the game needs no changes to accept phones.

## Flow
create/join room on the TV → scan QR (room code + relay URL) → tap "Enable motion" (iOS:
`DeviceMotionEvent.requestPermission()` must follow a user gesture) → choose player → calibrate
(hold paddle-face toward the screen, select handedness, practice swing) → play → feedback (haptics where
`navigator.vibrate` exists; iOS has none in the browser — optional native companion app later).

## Signal pipeline
`devicemotion` (accel + rotationRate, 60–100 Hz) → gravity removal + low-pass/high-pass filtering →
swing detector (angular-speed peak over threshold with refractory period) → features: peak time,
peak angular speed → approximate swing speed, rotation sign → forehand/backhand (handedness-aware),
device roll at peak → face angle → aim. Never claims absolute racket position from IMU data.

## Messages (WebSocket JSON)
`hello {room, player, deviceInfo}` · `calib {handedness, neutralQuat}` · `swing {seq, tClient, speed, stroke, aim}` ·
`move {seq, x, z}` (tilt-to-move in Precision) · `ping {seq, tClient}` / `pong` · `haptic {pattern}` from host.
Every message carries a sequence id; the relay timestamps on receipt for latency/jitter/loss diagnostics.

## UI
Identity colour, connection health, calibrate, serve, sensitivity, pause, haptics toggle, touch fallback, quick emotes.
