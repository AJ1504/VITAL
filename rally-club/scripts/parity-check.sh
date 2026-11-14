#!/usr/bin/env bash
# Verifies the Unreal C++ core and the TypeScript core produce identical full-match simulations.
set -euo pipefail
cd "$(dirname "$0")/.."
cmake -S unreal/CoreTests -B build/core-tests -DCMAKE_BUILD_TYPE=Release > /dev/null
cmake --build build/core-tests -j > /dev/null
diff <(node scripts/parity.ts) <(./build/core-tests/rally_core_tests --parity) && echo "PARITY OK: TypeScript and C++ cores produce identical matches for 6 seeds"
