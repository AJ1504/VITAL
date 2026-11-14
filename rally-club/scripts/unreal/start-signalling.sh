#!/usr/bin/env bash
# Start Epic's Pixel Streaming signalling + web server (Wilbur, UE 5.6 branch) and serve the
# Rally Club website from it, with the Unreal stream player as the homepage.
#   Players open:   http://<host>/            (stream.html)
#   Unreal connects: ws://<host>:8888          (see run-streamed-game.sh)
# Requires: git, Node.js >= 20. Run `npm run build` in rally-club/ first.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CLUB="$(cd "$HERE/../.." && pwd)"
INFRA="${PS_INFRA_DIR:-$CLUB/.pixelstreaming/PixelStreamingInfrastructure}"
PLAYER_PORT="${PLAYER_PORT:-80}"
STREAMER_PORT="${STREAMER_PORT:-8888}"

[ -f "$CLUB/dist/web/stream.html" ] || { echo "Build the site first: (cd $CLUB && npm run build)"; exit 1; }
if [ ! -d "$INFRA" ]; then
  git clone --depth 1 --branch UE5.6 https://github.com/EpicGamesExt/PixelStreamingInfrastructure.git "$INFRA"
fi
cd "$INFRA/SignallingWebServer"
# Epic's script installs dependencies, builds Wilbur and forwards extra arguments to it.
exec ./platform_scripts/bash/start.sh \
  --serve --http_root "$CLUB/dist/web" --homepage stream.html \
  --player_port "$PLAYER_PORT" --streamer_port "$STREAMER_PORT" "$@"
