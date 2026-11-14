#!/usr/bin/env bash
# Linux: launch the packaged Rally Club build as a Pixel Streaming 2 streamer (offscreen).
set -euo pipefail
EXE="${1:-$(dirname "$0")/../../unreal/Packaged/Linux/RallyClub.sh}"
SIGNALLING="${SIGNALLING:-ws://127.0.0.1:8888}"
exec "$EXE" -PixelStreamingConnectionURL="$SIGNALLING" -RenderOffScreen -ForceRes -ResX=1920 -ResY=1080 -Unattended -AudioMixer -PixelStreamingEncoderCodec=H264 -log
