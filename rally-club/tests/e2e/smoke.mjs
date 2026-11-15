// End-to-end smoke / acceptance test for the browser harness, run in headless Chromium.
//   npm run build && npm run test:e2e
// Starts `vite preview`, drives the page with real keyboard input, asserts game state through the
// window.__rally automation hook, and saves screenshots to docs/screenshots/.
//
// P1 ACCEPT ("user can complete a scored rally") is checked by test 2: the human serves with the
// J key and the rally runs to a scored point against the club AI.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');

const root = fileURLToPath(new URL('../..', import.meta.url));
const shots = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));
mkdirSync(shots, { recursive: true });
const PORT = 4174;
const BASE = `http://localhost:${PORT}/`;

const server = spawn('npx', ['vite', 'preview', '--config', 'web/vite.config.ts', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'pipe', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid, 'SIGTERM'); // kill the whole process group (npx + vite)
  } catch {
    /* already gone */
  }
};
process.on('exit', stopServer);
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server did not start')), 20000);
  server.stdout.on('data', (d) => {
    if (String(d).includes(String(PORT))) {
      clearTimeout(t);
      resolve();
    }
  });
});

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const openContexts = [];
// ONLY=5 node tests/e2e/smoke.mjs  -> run just the test whose name starts with "5."
const ONLY = process.env.ONLY;
async function test(name, fn) {
  if (ONLY && !name.startsWith(`${ONLY}.`)) return;
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`ok   - ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, err: String(e?.stack ?? e) });
    console.log(`FAIL - ${name}\n       ${String(e?.message ?? e)}`);
  } finally {
    // Always release contexts: software WebGL is CPU-bound and leaked pages starve later tests.
    for (const c of openContexts.splice(0)) await c.close().catch(() => {});
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
async function openPage(url, opts = { viewport: { width: 1280, height: 720 } }) {
  const ctx = await browser.newContext(opts);
  openContexts.push(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__rally, null, { timeout: 30000 });
  return { page, errors, ctx };
}
const state = (page) => page.evaluate(() => window.__rally.state());
async function waitFor(page, pred, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  let s;
  while (Date.now() < end) {
    s = await state(page);
    if (pred(s)) return s;
    await page.waitForTimeout(250);
  }
  throw new Error(`timeout waiting for ${label}; last state ${JSON.stringify(s)}`);
}

await test('1. menu renders with the harness label and no errors', async () => {
  const { page, errors, ctx } = await openPage(`${BASE}?mute&nointro&gfx=low`);
  await page.waitForTimeout(2500);
  assert((await state(page)).screen === 'menu', 'menu screen');
  const badge = await page.textContent('#harness-badge');
  assert(/not the Unreal build/i.test(badge ?? ''), 'harness badge text');
  for (const tab of ['Courts', 'Members', 'Settings']) {
    assert(await page.isVisible(`.tabs button:has-text("${tab}")`), `tab ${tab}`);
  }
  await page.screenshot({ timeout: 240000, path: `${shots}01-menu.png` });
  await page.click('.tabs button:has-text("Members")');
  await page.waitForTimeout(300);
  assert((await page.locator('#members .member').count()) === 6, 'six members on the roster');
  await page.click('#members .member[data-member="lila"]');
  await page.waitForTimeout(300);
  assert(await page.isVisible('#members .member.active[data-member="lila"]'), 'member selection');
  await page.screenshot({ timeout: 240000, path: `${shots}02-members.png` });
  await page.click('.tabs button:has-text("Settings")');
  await page.waitForTimeout(300);
  await page.screenshot({ timeout: 240000, path: `${shots}02-settings.png` });
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await ctx.close();
});

await test('2. P1 ACCEPT — human serves with the keyboard and completes a scored rally', async () => {
  const { page, errors, ctx } = await openPage(`${BASE}?mute&nointro&seed=11&assist=casual&gfx=low&speed=2`);
  await page.waitForTimeout(1500);
  await page.click('#btn-quick');
  await waitFor(page, (s) => s.screen === 'hud' && s.phase === 'awaiting_serve' && s.server === 0, 10000, 'serve setup');
  await page.waitForTimeout(800);
  await page.keyboard.press('j'); // serve
  const served = await waitFor(page, (s) => s.phase === 'in_play' || s.pointsPlayed > 0, 5000, 'serve in play');
  assert(!served.ballHeld, 'ball left the server');
  await page.waitForTimeout(700);
  await page.screenshot({ timeout: 240000, path: `${shots}03-rally.png` });
  // Keep swinging whenever the ball comes back (casual assist auto-moves and waits for the bounce).
  const end = Date.now() + 180000;
  let s = await state(page);
  while (s.pointsPlayed < 1 && Date.now() < end) {
    await page.keyboard.press('j');
    await page.waitForTimeout(300);
    s = await state(page);
  }
  assert(s.pointsPlayed >= 1, `a point was completed (state ${JSON.stringify(s)})`);
  const scored = s.score[0] + s.score[1] > 0 || s.server === 1;
  assert(scored, 'rally produced a score change or side out');
  await page.waitForTimeout(400);
  await page.screenshot({ timeout: 240000, path: `${shots}04-point.png` });
  console.log(`       rally result: score ${s.score.join('-')}, server ${s.server}, points played ${s.pointsPlayed}`);
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await ctx.close();
});

await test('3. pause menu opens and resumes', async () => {
  const { page, ctx } = await openPage(`${BASE}?mute&nointro&start=match&seed=4&gfx=low`);
  await waitFor(page, (s) => s.screen === 'hud', 10000, 'hud');
  await page.keyboard.press('Escape');
  await waitFor(page, (s) => s.screen === 'pause', 3000, 'pause');
  await page.screenshot({ timeout: 240000, path: `${shots}05-pause.png` });
  await page.click('#btn-resume');
  await waitFor(page, (s) => s.screen === 'hud', 3000, 'resume');
  await ctx.close();
});

await test('4. practice mode feeds balls and records results', async () => {
  const { page, errors, ctx } = await openPage(`${BASE}?mute&nointro&start=practice&seed=5&assist=casual&gfx=low&speed=5`);
  // Software rendering runs the sim slower than real time, so allow generous wall-clock time.
  const end = Date.now() + 300000;
  let s = await state(page);
  while (s.practice?.feeds < 3 && Date.now() < end) {
    await page.keyboard.press('j');
    await page.waitForTimeout(350);
    s = await state(page);
  }
  assert(s.practice.feeds >= 3, `machine fed balls (${JSON.stringify(s.practice)})`);
  await page.screenshot({ timeout: 240000, path: `${shots}06-practice.png` });
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await ctx.close();
});

await test('5. autoplay (AI vs AI) finishes a full game to 3 and shows results + celebration', async () => {
  const { page, errors, ctx } = await openPage(`${BASE}?mute&nointro&autoplay&seed=2&points=3&gfx=low&speed=8`);
  await waitFor(page, (s) => s.phase === 'game_over', 900000, 'game over');
  await page.waitForTimeout(4000); // let the celebration camera settle (software rendering is ~5 fps)
  await page.screenshot({ timeout: 240000, path: `${shots}07-celebration.png` });
  const s = await waitFor(page, (st) => st.screen === 'results', 30000, 'results screen');
  assert(s.winner !== null, 'winner recorded');
  await page.screenshot({ timeout: 240000, path: `${shots}08-results.png` });
  assert(errors.length === 0, `page errors: ${errors.join(' | ')}`);
  await ctx.close();
});

await test('6. phone-sized viewport shows touch fallback controls', async () => {
  const { page, ctx } = await openPage(`${BASE}?mute&nointro&start=match&seed=6&gfx=low`, { ...devices['iPhone 13'] });
  await waitFor(page, (s) => s.screen === 'hud', 10000, 'hud');
  await page.waitForTimeout(1000);
  assert(await page.isVisible('#touch-controls button[data-shot="auto"]'), 'touch swing button visible');
  await page.tap('#touch-controls button[data-shot="auto"]');
  await waitFor(page, (s) => s.phase === 'in_play' || s.pointsPlayed > 0, 5000, 'touch serve');
  await page.screenshot({ timeout: 240000, path: `${shots}09-mobile.png` });
  await ctx.close();
});

await test('7. Unreal Pixel Streaming page loads, validates the host and attempts a connection', async () => {
  const { page, errors, ctx } = await openPage(`${BASE}?mute&nointro&gfx=low`);
  await page.click('.tabs button:has-text("Courts")');
  const href = await page.getAttribute('#card-unreal', 'href');
  assert(href === './stream.html', `Play tab links to the stream page (${href})`);
  await page.goto(`${BASE}stream.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__rallyStream, null, { timeout: 30000 });
  assert(await page.isVisible('#connect'), 'connect screen visible');
  await page.fill('#ss', 'http://not-a-websocket');
  await page.click('#btn-connect');
  assert(/must start with ws/i.test((await page.textContent('#status')) ?? ''), 'rejects non-websocket hosts');
  await page.fill('#ss', 'ws://127.0.0.1:9');
  await page.click('#btn-connect');
  await page.waitForTimeout(1500);
  const st = (await page.textContent('#status')) ?? '';
  assert(/Connecting to ws:\/\/127\.0\.0\.1:9|Disconnected/i.test(st), `attempted connection (status: ${st})`);
  await page.screenshot({ timeout: 240000, path: `${shots}12-unreal-connect.png` });
  const real = errors.filter((e) => !/WebSocket|ERR_CONNECTION_REFUSED|signalling|websocket/i.test(e));
  assert(real.length === 0, `page errors: ${real.join(' | ')}`);
  await ctx.close();
});

await browser.close();
stopServer();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} e2e tests passed`);
process.exit(failed.length ? 1 : 0);
