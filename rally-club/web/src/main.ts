// Entry point for the temporary browser harness: wires menus, settings and HUD to the Game.
import type { Side } from '../../shared/src/court.ts';
import { otherSide } from '../../shared/src/court.ts';
import type { MatchSim } from '../../shared/src/match.ts';
import { Game, type GameUi, type MatchConfig, type MatchStats } from './game.ts';
import { type Settings, loadSettings, saveSettings } from './settings.ts';
import { MEMBERS } from './scene/members.ts';
import { COURTS, type CourtId } from './scene/themes.ts';
import type { InputShot } from './input/input.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string) => Array.from(document.querySelectorAll(sel)) as T[];

const params = new URLSearchParams(location.search);
const settings = loadSettings();
if (params.get('points')) settings.pointsToWin = Number(params.get('points'));
if (params.get('assist')) settings.assist = params.get('assist') as Settings['assist'];
if (params.has('mute')) settings.voice = false;
// QA / automation params: graphics preset override and simulation speed multiplier.
if (params.get('venue')) settings.venue = params.get('venue') as Settings['venue'];
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
  courtLabels(list) {
    const root = $('#court-labels');
    if (!list.length || $('#menu').hidden) {
      root.replaceChildren();
      return;
    }
    if (root.childElementCount !== list.length) {
      root.replaceChildren(
        ...list.map((c) => {
          const t = COURTS[c.id as CourtId];
          const d = document.createElement('div');
          d.className = 'court-label';
          const dot = document.createElement('i');
          dot.style.background = `#${t.court.toString(16).padStart(6, '0')}`;
          d.append(dot, `${t.name}${t.playable ? '' : ' · soon'}`);
          return d;
        }),
      );
    }
    list.forEach((c, i) => {
      const d = root.children[i] as HTMLElement;
      d.style.display = c.visible ? '' : 'none';
      d.style.left = `${c.x}px`;
      d.style.top = `${c.y}px`;
    });
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
// Court cards: hovering a card re-tints the UI in that court's pastel family.
$$('.court-card').forEach((c) => {
  c.addEventListener('pointerenter', () => (document.body.dataset.court = c.dataset.court));
  c.addEventListener('pointerleave', () => (document.body.dataset.court = 'garden'));
});
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
