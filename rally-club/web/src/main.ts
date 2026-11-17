// Entry point for the temporary browser harness: wires menus, settings and HUD to the Game.
import type { Side } from '../../shared/src/court.ts';
import { otherSide } from '../../shared/src/court.ts';
import type { MatchSim } from '../../shared/src/match.ts';
import { Game, type GameUi, type MatchConfig, type MatchStats } from './game.ts';
import { type Settings, loadSettings, saveSettings } from './settings.ts';
import { MEMBERS } from './scene/members.ts';
import type { ArenaId } from './arenas/config.ts';
import { ARENAS, ARENA_IDS } from './arenas/presets.ts';
import { drawArenaPreview } from './arenas/preview.ts';
import qrcode from 'qrcode-generator';
import { type PadCommand, PhoneLink } from './phone/link.ts';
import type { InputShot } from './input/input.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(document.querySelectorAll(sel)) as T[];

const params = new URLSearchParams(location.search);
const settings = loadSettings();
if (params.get('points')) settings.pointsToWin = Number(params.get('points'));
if (params.get('assist')) settings.assist = params.get('assist') as Settings['assist'];
if (params.has('mute')) settings.voice = false;
// QA / automation params: graphics preset override and simulation speed multiplier.
if (params.get('arena')) settings.arena = params.get('arena') as Settings['arena'];
if (params.get('time')) settings.timeOfDay = params.get('time') as Settings['timeOfDay'];
if (params.get('cam')) settings.camera = params.get('cam') as Settings['camera'];
if (params.get('gfx')) settings.graphics = params.get('gfx') as Settings['graphics'];

const game = new Game($('#stage'), settings);
// QA capture: fixed timestep per rendered frame, e.g. ?fixedstep=60 for frame-perfect animation video.
if (params.has('capture')) game.captureMode();
if (params.get('fixedstep')) game.setFixedStep(1 / Math.max(1, Number(params.get('fixedstep'))));
if (params.get('speed')) game.timeScale = Math.max(1, Math.min(8, Number(params.get('speed'))));
let lastConfig: MatchConfig = { mode: 'match' };

// ---------------------------------------------------------------- HUD
let toastTimer = 0;
let subTimer = 0;
const ui: GameUi = {
  score(sim: MatchSim, names: [string, string]) {
    const st = sim.rules.state;
    for (const side of [0, 1] as Side[]) {
      const row = $(`.sb-row[data-side="${side}"]`);
      row.querySelector('.sb-name')!.textContent = names[side];
      row.querySelector('.sb-score')!.textContent = String(st.score[side]);
      row.classList.toggle('serving', st.server === side && sim.mode === 'match');
    }
    $('#sb-call').textContent = st.phase === 'game_over' ? 'Final' : `Call ${sim.rules.scoreCall()}`;
  },
  rally(n: number) {
    $('#sb-rally').textContent = n > 1 ? `Rally ${n}` : '';
  },
  toast(text: string, tone = 'neutral') {
    const t = $('#toast');
    t.textContent = text;
    t.className = `show ${tone}`;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (t.className = ''), 1100);
  },
  subtitle(text: string) {
    $('#subtitle-text').textContent = text;
    $('#subtitle').classList.add('show');
    clearTimeout(subTimer);
    subTimer = window.setTimeout(() => $('#subtitle').classList.remove('show'), 1500 + text.length * 55);
  },
  energy(v: number) {
    $('#energy-fill').style.width = `${Math.round(v * 100)}%`;
  },
  practice(streak, best, good, feeds) {
    $('#pp-streak').textContent = String(streak);
    $('#pp-best').textContent = String(best);
    $('#pp-good').textContent = String(good);
    $('#pp-feeds').textContent = String(feeds);
  },
  results(winner: Side, names: [string, string], score: [number, number], stats: MatchStats) {
    $('#res-title').textContent = winner === 0 ? `${names[0] === 'You' ? 'You win' : `${names[0]} wins`}!` : `${names[1]} wins`;
    $('#res-score').textContent = `${score[winner]} – ${score[otherSide(winner)]}`;
    $('#res-rally').textContent = String(stats.longestRally);
    $('#res-perfect').textContent = `${stats.perfect[0]} – ${stats.perfect[1]}`;
    $('#res-aces').textContent = `${stats.aces[0]} – ${stats.aces[1]}`;
    const m = Math.floor(stats.durationS / 60);
    $('#res-time').textContent = `${m}:${String(Math.floor(stats.durationS % 60)).padStart(2, '0')}`;
    show('results');
  },
  banner(text, kind, sub) {
    const b = $('#banner');
    $('#banner-text').textContent = text;
    $('#banner-sub').textContent = sub ?? '';
    b.className = '';
    void b.offsetWidth; // restart the CSS animation
    b.className = `show ${kind}`;
    if (kind === 'ready' || kind === 'play') game.audio.jingle('ready');
  },
  titleCard(card) {
    const el = $('#title-card');
    if (!card) {
      el.hidden = true;
      return;
    }
    $('#tc-title').textContent = card.title;
    $('#tc-sub').textContent = card.sub;
    $('#tc-p0').textContent = card.names[0];
    $('#tc-p1').textContent = card.names[1];
    el.hidden = false;
  },
  scoreCard(card) {
    const el = $('#score-card');
    if (!card) {
      el.hidden = true;
      return;
    }
    for (const side of [0, 1]) {
      const row = $(`.scd-row[data-side="${side}"]`);
      row.querySelector('.scd-name')!.textContent = card.names[side];
      row.querySelector('.scd-score')!.textContent = String(card.score[side]);
      row.classList.toggle('serving', card.server === side);
      row.classList.toggle('won', card.winner === side);
    }
    $('#scd-call').textContent = `SCORE CALL  ${card.call}`;
    el.hidden = false;
  },
  popup(text, x, y, tone) {
    const p = document.createElement('div');
    p.className = `popup ${tone}`;
    p.textContent = text;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    $('#popups').appendChild(p);
    window.setTimeout(() => p.remove(), 1200);
  },
  coach(step) {
    const el = $('#coach');
    if (!step) {
      el.hidden = true;
      return;
    }
    const touch = matchMedia('(pointer: coarse)').matches;
    const press = touch ? 'Tap' : 'Press Space';
    const copy: Record<string, [string, string]> = {
      serve: [`${press} to serve`, 'Your member tosses and serves for you'],
      swing: [`${press} as the ball reaches the ring`, 'Your feet move themselves. Just time the swing.'],
      aim: ['Swing early to go crosscourt, late to go down the line', 'Watch your opponent and aim away from them'],
    };
    const [a, b] = copy[step];
    $('#coach-text').innerHTML = `${a}<small>${b}</small>`;
    el.hidden = false;
  },
  courtLabels() {
    $('#court-labels').replaceChildren();
  },
};
game.ui = ui;
game.input.bindTouch($('#touch-controls'));
game.input.bindCanvas($('#stage'));

// ---------------------------------------------------------------- screens
type Screen = 'menu' | 'hud' | 'pause' | 'results';
function show(screen: Screen): void {
  $('#menu').hidden = screen !== 'menu';
  $('#hud').hidden = screen === 'menu';
  $('#pause').hidden = screen !== 'pause';
  $('#results').hidden = screen !== 'results';
  game.paused = screen === 'pause';
  game.input.enabled = screen === 'hud' && !lastConfig.autoplay;
}

async function start(cfg: MatchConfig): Promise<void> {
  if (params.has('nointro')) cfg = { ...cfg, skipIntro: true };
  lastConfig = { ...cfg, skipIntro: true }; // rematches go straight to "Ready?"
  $('#score-card').hidden = true;
  await game.startMatch(cfg);
  $('#scoreboard').hidden = cfg.mode === 'practice';
  $('#practice-panel').hidden = cfg.mode !== 'practice';
  ui.practice(0, 0, 0, 0);
  show('hud');
}

function toMenu(): void {
  game.exitToMenu();
  show('menu');
}

// Any key or tap skips the intro fly-in.
for (const ev of ['keydown', 'pointerdown'] as const) window.addEventListener(ev, () => game.skipIntro());

game.input.onPause = () => {
  if (!game.sim) return;
  if (!$('#results').hidden) return;
  show(game.paused ? 'hud' : 'pause');
};

$$('.tabs button').forEach((b) =>
  b.addEventListener('click', () => {
    game.audio.uiClick();
    $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
    $$('.panel').forEach((p) => (p.hidden = p.dataset.panel !== b.dataset.tab));
  }),
);
// Arena cards: picking one rebuilds the stadium behind the menu and re-tints the UI.
function buildArenaCards(): void {
  const timeLabel = { day: 'Day', golden: 'Golden hour', night: 'Night' } as const;
  const previews: [HTMLCanvasElement, ArenaId][] = [];
  $('#arena-cards').replaceChildren(
    ...ARENA_IDS.map((id) => {
      const t = ARENAS[id];
      const card = document.createElement('button');
      card.className = 'court-card';
      card.dataset.court = id;
      card.classList.toggle('active', id === game.arenaId);
      const cv = document.createElement('canvas');
      cv.className = 'cc-preview';
      cv.width = 300;
      cv.height = 170;
      drawArenaPreview(cv, t);
      previews.push([cv, id]);
      const sport = document.createElement('div');
      sport.className = 'cc-sport';
      sport.textContent = `${t.number} · ${t.tagline} · ${timeLabel[t.lighting.default]}`;
      const h = document.createElement('h3');
      h.textContent = t.name;
      const para = document.createElement('p');
      para.textContent = t.blurb;
      card.append(cv, sport, h, para);
      card.addEventListener('click', () => selectArena(id));
      return card;
    }),
  );
  // Redraw once the logo image and web fonts are ready (the plans include the script).
  const redraw = () => previews.forEach(([cv, id]) => drawArenaPreview(cv, ARENAS[id]));
  window.setTimeout(redraw, 600);
  void document.fonts?.ready.then(redraw);
}
/** Apply the arena's UI palette to the menu and HUD (data-driven, no per-arena CSS). */
function applyArenaTheme(id: ArenaId): void {
  const u = ARENAS[id].palette.ui;
  const st = document.body.style;
  st.setProperty('--bg', u.bg);
  st.setProperty('--card', u.card);
  st.setProperty('--ink', u.ink);
  st.setProperty('--soft', u.soft);
  st.setProperty('--accent', u.accent);
  st.setProperty('--accent-deep', u.accentDeep);
  st.setProperty('--accent2', u.accent2);
  st.setProperty('--team0', u.accent);
  st.setProperty('--team1', u.accent2);
  document.body.dataset.court = id;
}
function selectArena(id: ArenaId): void {
  game.audio.uiClick();
  game.setArena(id);
  game.settings.arena = id;
  saveSettings(game.settings);
  applyArenaTheme(id);
  $$('.court-card').forEach((c) => c.classList.toggle('active', c.dataset.court === id));
}
buildArenaCards();
applyArenaTheme(game.arenaId);

// Camera: C key or the HUD button cycles broadcast → bird's-eye → spectator.
const camLabel = { broadcast: 'Broadcast', birdseye: "Bird's-eye", spectator: 'Spectator' } as const;
function cycleCam(): void {
  const v = game.cycleCamera();
  game.settings.camera = v;
  saveSettings(game.settings);
  $('#cam-btn').title = `Camera: ${camLabel[v]} (C)`;
  ui.toast(camLabel[v]);
}
game.setCameraView(settings.camera ?? 'broadcast');
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'c' && !e.repeat && game.sim && !$('#hud').hidden) cycleCam();
});
$('#cam-btn').addEventListener('click', cycleCam);

// ---------------------------------------------------------------- phone controller
let phone: PhoneLink | null = null;
function drawQr(text: string): void {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const cv = $<HTMLCanvasElement>('#pair-qr');
  const g = cv.getContext('2d')!;
  const n = qr.getModuleCount();
  const cell = Math.floor(cv.width / (n + 2));
  const off = Math.floor((cv.width - cell * n) / 2);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#213a2b';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(off + c * cell, off + r * cell, cell, cell);
}
function setPairStatus(): void {
  const st = $('#pair-status');
  if (!phone) return;
  if (!phone.available) {
    st.textContent = 'Phone pairing works when the game is open on claude.ai while signed in.';
    st.className = 'pair-status';
  } else if (phone.connected) {
    st.textContent = `Phone connected${phone.latencyMs ? ` · ${Math.round(phone.latencyMs)} ms delay, made up for` : ''}`;
    st.className = 'pair-status on';
  } else {
    st.textContent = 'Waiting for your phone…';
    st.className = 'pair-status';
  }
  $('#phone-chip').hidden = !phone.connected;
}
/** Which screen is showing, for the phone. */
function screenName(): string {
  if (!$('#results').hidden) return 'results';
  if (!$('#pause').hidden) return 'pause';
  if (!$('#menu').hidden) return 'menu';
  return 'play';
}
/** Commands from the phone: the phone works as a full remote, not just a paddle. */
function onPadCommand(cmd: PadCommand): void {
  const screen = screenName();
  const ids = ARENA_IDS;
  switch (cmd) {
    case 'match':
    case 'practice':
      if (screen === 'menu') void start({ mode: cmd });
      break;
    case 'arena-next':
    case 'arena-prev':
      if (screen === 'menu') {
        const i = ids.indexOf(game.arenaId);
        selectArena(ids[(i + (cmd === 'arena-next' ? 1 : ids.length - 1)) % ids.length]);
      }
      break;
    case 'pause':
      if (screen === 'play' && game.sim) show('pause');
      break;
    case 'resume':
      if (screen === 'pause') show('hud');
      break;
    case 'rematch':
      if (screen === 'results' || screen === 'pause') void start(lastConfig);
      break;
    case 'menu':
      if (screen !== 'menu') toMenu();
      break;
    case 'camera':
      if (screen === 'play') cycleCam();
      break;
  }
}
/** Set up the phone link once (the room is joined only when pairing is asked for or was used before). */
function ensurePhone(): PhoneLink {
  if (phone) return phone;
  phone = new PhoneLink();
  game.phone = phone;
  phone.onSwing = (sw) => {
    const lead = game.settings.latencyComp === false ? 0 : sw.lat / 1000;
    game.input.remote(sw.shot === 'drive' ? 'auto' : sw.shot, lead);
  };
  phone.onCommand = onPadCommand;
  phone.onStatus = () => {
    setPairStatus();
    if (phone?.connected) {
      ui.toast('Phone connected');
      try {
        localStorage.setItem('vital.padUsed', '1');
      } catch {
        /* ignore */
      }
    }
  };
  window.setInterval(() => {
    if (!phone) return;
    game.input.remoteMoveX = phone.connected ? phone.moveX : 0;
    // What the phone shows: screen, arena, score and who serves (only changes are sent).
    const sim = game.sim;
    const st = sim?.rules.state;
    phone.setState({
      screen: screenName(),
      arena: ARENAS[game.arenaId].name,
      score: st ? `${st.score[0]}-${st.score[1]}` : '',
      serving: st ? st.server === 0 : false,
      names: game.sim ? `${$('.sb-row[data-side="0"] .sb-name').textContent}|${$('.sb-row[data-side="1"] .sb-name').textContent}` : '',
    });
  }, 250);
  $('#pair-code').textContent = phone.code.split('').join(' ');
  drawQr(phone.padUrl);
  return phone;
}
// A phone that was paired before reconnects automatically after a reload (same code is kept).
try {
  if (localStorage.getItem('vital.padUsed') === '1') void ensurePhone().start().then(setPairStatus);
} catch {
  /* ignore */
}
async function openPair(): Promise<void> {
  game.audio.uiClick();
  $('#pair').hidden = false;
  if (!phone) {
    ensurePhone();
  }
  $('#pair-status').textContent = 'Starting…';
  await phone!.start();
  setPairStatus();
}
$('#btn-pair').addEventListener('click', () => void openPair());
$('#btn-pair-menu').addEventListener('click', () => void openPair());
$('#btn-pair-close').addEventListener('click', () => ($('#pair').hidden = true));
$('#btn-quick').addEventListener('click', () => start({ mode: 'match' }));
$('#btn-practice').addEventListener('click', () => start({ mode: 'practice' }));
$('#btn-coach-reset').addEventListener('click', (e) => {
  try {
    localStorage.setItem('rally-club.coached', '0');
  } catch {
    /* ignore */
  }
  (e.currentTarget as HTMLElement).textContent = 'Tutorial will show next match';
});

// Members roster.
function buildMembers(): void {
  const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
  $('#members').replaceChildren(
    ...MEMBERS.map((m) => {
      const b = document.createElement('button');
      b.className = 'member';
      b.dataset.member = m.id;
      b.classList.toggle('active', m.id === game.settings.memberId);
      const sw = document.createElement('span');
      sw.className = 'swatches';
      for (const c of [m.look.shirt, m.look.trousers ?? m.look.shorts, m.look.hair]) {
        const i = document.createElement('i');
        i.style.background = hex(c);
        sw.append(i);
      }
      const name = document.createElement('b');
      name.textContent = m.name;
      const tag = document.createElement('small');
      tag.textContent = m.tagline;
      b.append(sw, name, tag);
      b.addEventListener('click', () => {
        game.audio.uiClick();
        game.settings.memberId = m.id;
        saveSettings(game.settings);
        game.setMember(m.id);
        $$('.member').forEach((x) => x.classList.toggle('active', x === b));
      });
      return b;
    }),
  );
}
buildMembers();
$('#pause-btn').addEventListener('click', () => game.input.onPause?.());
$('#btn-resume').addEventListener('click', () => show('hud'));
$('#btn-restart').addEventListener('click', () => start(lastConfig));
$('#btn-quit').addEventListener('click', toMenu);
$('#btn-rematch').addEventListener('click', () => start(lastConfig));
$('#btn-menu').addEventListener('click', toMenu);

// Start the DJ on the first interaction (browsers require a gesture for audio).
const kick = () => {
  void game.audio.resume().catch(() => {});
  game.audio.startMusic();
  window.removeEventListener('pointerdown', kick);
  window.removeEventListener('keydown', kick);
};
window.addEventListener('pointerdown', kick);
window.addEventListener('keydown', kick);

// ---------------------------------------------------------------- settings
function bindSettings(): void {
  const s = game.settings;
  const sel = (id: string, key: keyof Settings, num = false) => {
    const el = $<HTMLSelectElement>(id);
    el.value = String(s[key]);
    el.addEventListener('change', () => {
      (s as unknown as Record<string, unknown>)[key] = num ? Number(el.value) : el.value;
      commit();
    });
  };
  const range = (id: string, key: keyof Settings) => {
    const el = $<HTMLInputElement>(id);
    el.value = String(s[key]);
    el.addEventListener('input', () => {
      (s as unknown as Record<string, unknown>)[key] = Number(el.value);
      commit(false);
    });
  };
  const check = (id: string, key: keyof Settings) => {
    const el = $<HTMLInputElement>(id);
    el.checked = Boolean(s[key]);
    el.addEventListener('change', () => {
      (s as unknown as Record<string, unknown>)[key] = el.checked;
      commit();
    });
  };
  sel('#set-assist', 'assist');
  sel('#set-difficulty', 'difficulty');
  sel('#set-points', 'pointsToWin', true);
  sel('#set-graphics', 'graphics');
  sel('#set-time', 'timeOfDay');
  sel('#set-camera', 'camera');
  sel('#set-crowd-density', 'crowdDensity', true);
  sel('#set-crowd-rate', 'crowdRate', true);
  sel('#set-text', 'textScale', true);
  range('#set-master', 'master');
  range('#set-music', 'music');
  range('#set-crowd', 'crowd');
  range('#set-sfx', 'sfx');
  check('#set-voice', 'voice');
  check('#set-shake', 'cameraShake');
  check('#set-subtitles', 'subtitles');
  check('#set-reduced', 'reducedMotion');
  check('#set-contrast', 'highContrast');
  check('#set-haptics', 'haptics');
  check('#set-ring', 'timingRing');
  check('#set-latency', 'latencyComp');
  check('#set-autores', 'autoResolution');
  const name = $<HTMLInputElement>('#set-name');
  name.value = s.playerName;
  name.addEventListener('change', () => {
    s.playerName = name.value.trim() || 'You';
    commit(false);
  });
  applyDom();
}

function applyDom(): void {
  const s = game.settings;
  document.documentElement.style.setProperty('--text-scale', String(s.textScale));
  document.body.classList.toggle('high-contrast', s.highContrast);
  $$('.pts').forEach((e) => (e.textContent = String(s.pointsToWin)));
}

function commit(heavy = true): void {
  saveSettings(game.settings);
  if (heavy) {
    game.setCameraView(game.settings.camera ?? 'broadcast');
    if (!game.sim && game.timeFor(game.arenaId) !== game.arenaTime) game.setArena(game.arenaId, true);
    game.applySettings(game.settings);
  }
  else game.audio.setVolumes({ master: game.settings.master, music: game.settings.music, crowd: game.settings.crowd, sfx: game.settings.sfx });
  applyDom();
}
bindSettings();
show('menu');

// ---------------------------------------------------------------- automation hooks (tests / QA)
declare global {
  interface Window {
    __rally: unknown;
  }
}
window.__rally = {
  game,
  start,
  toMenu,
  press: (shot: InputShot = 'auto') => game.input.press(shot),
  step: () => game.step(),
  state: () => {
    const sim = game.sim;
    if (!sim) return { screen: 'menu', assetsReady: game.assetsReady };
    const st = sim.rules.state;
    return {
      screen: !$('#results').hidden ? 'results' : game.paused ? 'pause' : 'hud',
      presentation: game.phase,
      mode: sim.mode,
      phase: st.phase,
      score: [...st.score],
      server: st.server,
      hitCount: st.hitCount,
      pointsPlayed: st.pointsPlayed,
      winner: st.winner,
      ballHeld: sim.ballHeld,
      practice: { ...sim.practice },
      crowd: game.crowd.state,
      assetsReady: game.assetsReady,
      crowdCount: game.crowd.count,
    };
  },
};

if (params.has('autoplay')) start({ mode: 'match', autoplay: true, seed: Number(params.get('seed') ?? 1) });
else if (params.get('start') === 'match') start({ mode: 'match', seed: params.get('seed') ? Number(params.get('seed')) : undefined });
else if (params.get('start') === 'practice') start({ mode: 'practice', seed: params.get('seed') ? Number(params.get('seed')) : undefined });
