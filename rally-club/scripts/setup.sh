#!/usr/bin/env bash
# One-time setup for the Rally Club monorepo (browser harness + core tests).
# Requirements: Node >= 22.18 (runs .ts tests natively), npm, CMake >= 3.16 and a C++17 compiler.
# Optional: Playwright Chromium for the e2e suite (`npx playwright install chromium` if not preinstalled).
set -euo pipefail
cd "$(dirname "$0")/.."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<18)){console.error("Node >= 22.18 required (found "+process.versions.node+")");process.exit(1)}'
npm ci || npm install
command -v cmake >/dev/null && bash scripts/test-unreal-core.sh >/dev/null && echo "C++ core: OK" || echo "CMake/C++ toolchain not found — skipping C++ core build"
echo
echo "Setup complete. Next:"
echo "  npm run dev        # play the browser harness at http://localhost:5173"
echo "  npm run check      # typecheck + unit tests + C++ core tests"
echo "  npm run build && npm run test:e2e"
