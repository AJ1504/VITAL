# Tests

* `unit/*.test.ts` — `node --test` (Node ≥ 22.18 runs TypeScript directly). `npm test`.
* `e2e/smoke.mjs` — Playwright acceptance suite against the production build. `npm run build && npm run test:e2e`.
  Uses SwiftShader WebGL and QA URL params (`gfx=low`, `speed=N`) because software rendering runs the sim
  slower than real time. Writes screenshots to `docs/screenshots/`.
* C++ core: `unreal/CoreTests` (`npm run test:core-cpp`), TS↔C++ parity (`npm run test:parity`).
