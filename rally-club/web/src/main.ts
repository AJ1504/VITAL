// Entry point for the temporary browser harness: wires menus, settings and HUD to the Game.
import type { Side } from '../../shared/src/court.ts';
import { otherSide } from '../../shared/src/court.ts';
import type { MatchSim } from '../../shared/src/match.ts';
import { Game, type GameUi, type MatchConfig, type MatchStats } from './game.ts';
import { type Settings, loadSettings, saveSettings } from './settings.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(document.querySelectorAll(sel)) as T[];

const params = new URLSearchParams(location.search);
const settings = loadSettings();
if (params.get('points')) settings.pointsToWin = Number(params.get('points'));
if (params.get('assist')) settings.assist = params.get('assist') as Settings['assist'];
if (params.has('mute')) settings.voice = false;
// QA / automation params: graphics preset override and simulation speed multiplier.
if (params.get('gfx')) settings.graphics = params.get('gfx') as Settings['graphics'];

const game = new Game($('#stage'), settings);
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
};
game.ui = ui;
game.input.bindTouch($('#touch-controls'));

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
  lastConfig = cfg;
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
$('#btn-quick').addEventListener('click', () => start({ mode: 'match' }));
$('#card-match').addEventListener('click', () => start({ mode: 'match' }));
$('#btn-practice').addEventListener('click', () => start({ mode: 'practice' }));
$('#card-practice').addEventListener('click', () => start({ mode: 'practice' }));
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
  if (heavy) game.applySettings(game.settings);
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
  press: (shot: 'drive' | 'dink' | 'lob') => game.input.press(shot),
  state: () => {
    const sim = game.sim;
    if (!sim) return { screen: 'menu' };
    const st = sim.rules.state;
    return {
      screen: !$('#results').hidden ? 'results' : game.paused ? 'pause' : 'hud',
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
      crowdCount: game.crowd.count,
    };
  },
};

if (params.has('autoplay')) start({ mode: 'match', autoplay: true, seed: Number(params.get('seed') ?? 1) });
else if (params.get('start') === 'match') start({ mode: 'match', seed: params.get('seed') ? Number(params.get('seed')) : undefined });
else if (params.get('start') === 'practice') start({ mode: 'practice', seed: params.get('seed') ? Number(params.get('seed')) : undefined });
