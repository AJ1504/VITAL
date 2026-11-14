#!/usr/bin/env bash
# Build and run the engine-agnostic Unreal C++ core tests (no Unreal Engine needed).
set -euo pipefail
cd "$(dirname "$0")/.."
cmake -S unreal/CoreTests -B build/core-tests -DCMAKE_BUILD_TYPE=Release > /dev/null
cmake --build build/core-tests -j > /dev/null
./build/core-tests/rally_core_tests
