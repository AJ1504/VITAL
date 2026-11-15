// The phone controller view: opened as the same page with "#pad-<code>" in the link. Big swing pad
// (tap = swing, timing aims), Lob / Dink buttons, a left-right move strip, connection + latency
// readout, and hit feedback with vibration where the phone supports it. Motion swings are used when
// the browser delivers device motion (not inside the claude.ai frame today), otherwise taps.

type Room = {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, h: (m: { isMe: boolean; data?: unknown }) => void, onError?: (e: { code?: string }) => void): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  onPeers(h: (c: { peers: readonly { isMe: boolean; presence: Readonly<Record<string, unknown>> }[] }) => void): () => void;
  connected(): boolean;
};

const CSS = `
:root { --bg:#f6f1e8; --card:#fffcf6; --ink:#213a2b; --soft:#6f7d72; --accent:#2f6b4a; --pad:#8fcfb3; --hit:#e9b949; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#17201b; --card:#1f2b24; --ink:#eef3ec; --soft:#a3b2a7; --accent:#8fd1a8; --pad:#2f6b4a; color-scheme:dark; } }
:root[data-theme="dark"] { --bg:#17201b; --card:#1f2b24; --ink:#eef3ec; --soft:#a3b2a7; --accent:#8fd1a8; --pad:#2f6b4a; color-scheme:dark; }
html, body { height: 100%; margin: 0; overflow: hidden; background: var(--bg); color: var(--ink); font-family: Nunito, system-ui, sans-serif; touch-action: none; -webkit-user-select: none; user-select: none; }
#stage, #menu, #hud, .screen, #banner, #title-card, #score-card, #popups, #court-labels, #harness-badge { display: none !important; }
.pad-wrap { position: fixed; inset: 0; display: flex; flex-direction: column; gap: 12px; padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); }
.pad-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.pad-brand { font-family: "Josefin Sans", system-ui, sans-serif; font-weight: 700; letter-spacing: .22em; font-size: 12px; text-transform: uppercase; color: var(--soft); }
.pad-conn { font-size: 13px; font-weight: 800; padding: 6px 12px; border-radius: 99px; background: var(--card); }
.pad-conn.on { color: var(--accent); }
.pad-zone { flex: 1; border-radius: 28px; background: var(--pad); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: #fff; position: relative; overflow: hidden; transition: transform .08s; box-shadow: inset 0 -8px 0 rgba(0,0,0,.08); }
.pad-zone.hit { transform: scale(.97); }
.pad-zone b { font-family: Fredoka, Nunito, sans-serif; font-size: clamp(38px, 12vw, 64px); text-shadow: 0 3px 0 rgba(0,0,0,.12); }
.pad-zone span { font-weight: 800; opacity: .9; }
.pad-fb { position: absolute; top: 18%; font-family: Fredoka, Nunito, sans-serif; font-size: 34px; font-weight: 700; opacity: 0; transition: opacity .15s; }
.pad-fb.show { opacity: 1; }
.pad-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pad-row button, .pad-code button { font: inherit; font-weight: 800; border: 0; border-radius: 20px; min-height: 64px; background: var(--card); color: var(--ink); font-size: 18px; }
.pad-row button:active { transform: scale(.97); }
.pad-move { position: relative; height: 64px; border-radius: 20px; background: var(--card); }
.pad-move i { position: absolute; top: 8px; bottom: 8px; width: 64px; left: calc(50% - 32px); border-radius: 14px; background: var(--accent); opacity: .85; }
.pad-move small { position: absolute; inset: 0; display: grid; place-items: center; color: var(--soft); font-weight: 700; pointer-events: none; }
.pad-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--soft); }
.pad-code { margin: auto 0; display: flex; flex-direction: column; gap: 12px; align-items: stretch; text-align: center; }
.pad-code input { font: inherit; font-size: 40px; letter-spacing: .3em; text-align: center; padding: 12px; border-radius: 18px; border: 2px solid var(--soft); background: var(--card); color: var(--ink); }
`;

export async function startPad(codeFromHash: string | null): Promise<void> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const wrap = document.createElement('div');
  wrap.className = 'pad-wrap';
  document.body.append(wrap);
  if (codeFromHash) return run(wrap, codeFromHash);
  // No code in the link: ask for the 4 digits shown on the game screen.
  wrap.innerHTML = `<div class="pad-top"><span class="pad-brand">Vital · phone controller</span></div>
    <div class="pad-code"><label for="pad-code-in"><b>Enter the code on the game screen</b></label>
    <input id="pad-code-in" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="0000" />
    <button id="pad-go" type="button">Connect</button></div>`;
  const input = wrap.querySelector<HTMLInputElement>('#pad-code-in')!;
  wrap.querySelector('#pad-go')!.addEventListener('click', () => {
    const v = input.value.replace(/\D/g, '');
    if (v.length === 4) {
      wrap.innerHTML = '';
      void run(wrap, v);
    }
  });
}

async function run(wrap: HTMLElement, code: string): Promise<void> {
  wrap.innerHTML = `
    <div class="pad-top"><span class="pad-brand">Vital · pad ${code}</span><span class="pad-conn" id="pad-conn">Connecting…</span></div>
    <div class="pad-zone" id="pad-zone" role="button" aria-label="Swing"><div class="pad-fb" id="pad-fb"></div><b>SWING</b><span>Tap as the ball reaches you</span></div>
    <div class="pad-row"><button id="pad-dink" type="button">Dink</button><button id="pad-lob" type="button">Lob</button></div>
    <div class="pad-move" id="pad-move" aria-label="Move left or right"><i id="pad-knob"></i><small>◀ slide to move ▶</small></div>
    <div class="pad-meta"><span id="pad-lat">Latency —</span><span id="pad-motion"></span></div>`;
  const $ = (id: string) => wrap.querySelector<HTMLElement>('#' + id)!;
  const conn = $('pad-conn');
  const c = (window as { claude?: { use(n: string): Promise<unknown> } }).claude;
  const lobby = c?.use ? ((await c.use('room')) as { join(n: string): Promise<Room> } | null) : null;
  if (!lobby) {
    conn.textContent = 'Open this link in claude.ai, signed in';
    return;
  }
  let room: Room;
  try {
    room = await lobby.join(`pad-${code}`);
  } catch {
    conn.textContent = 'Could not join';
    return;
  }
  let lat = 60;
  let gamePresent = false;
  void room.presence({ role: 'pad', mx: 0 }).catch(() => {});
  room.onPeers((ch) => {
    gamePresent = ch.peers.some((p) => !p.isMe && p.presence?.role === 'game');
    conn.textContent = gamePresent ? 'Connected' : 'Waiting for the game…';
    conn.classList.toggle('on', gamePresent);
  });
  // Latency: round trip / 2, smoothed.
  room.on('pong', (m) => {
    if (m.isMe) return;
    const t = Number((m.data as { t?: number })?.t);
    if (!Number.isFinite(t)) return;
    const rtt = performance.now() - t;
    if (rtt > 0 && rtt < 2000) lat = lat * 0.7 + (rtt / 2) * 0.3;
    $('pad-lat').textContent = `Latency ${Math.round(lat)} ms (compensated)`;
  });
  setInterval(() => void room.emit('ping', { t: performance.now() }).catch(() => {}), 2000);

  const vibrate = (ms: number | number[]) => {
    try {
      navigator.vibrate?.(ms);
    } catch {
      /* not supported */
    }
  };
  const fbEl = $('pad-fb');
  let fbTimer = 0;
  room.on('fb', (m) => {
    if (m.isMe) return;
    const d = (m.data ?? {}) as { q?: string; text?: string };
    const label = d.text ?? (d.q === 'perfect' ? 'Perfect!' : d.q === 'good' ? 'Nice!' : d.q === 'miss' ? 'Miss' : '');
    if (d.q === 'perfect') vibrate([30, 40, 60]);
    else if (d.q === 'good' || d.q === 'ok') vibrate(35);
    else if (d.q === 'miss') vibrate([10, 30, 10]);
    if (!label) return;
    fbEl.textContent = label;
    fbEl.classList.add('show');
    clearTimeout(fbTimer);
    fbTimer = window.setTimeout(() => fbEl.classList.remove('show'), 900);
  });

  const zone = $('pad-zone');
  const swing = (shot: 'auto' | 'dink' | 'lob') => {
    void room.emit('swing', { shot, lat: Math.round(lat) }).catch(() => {});
    vibrate(12);
    zone.classList.add('hit');
    setTimeout(() => zone.classList.remove('hit'), 90);
  };
  // Swing fires on touch-down: no gesture delay on top of the network.
  zone.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    swing('auto');
  });
  $('pad-dink').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    swing('dink');
  });
  $('pad-lob').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    swing('lob');
  });

  // Move strip → presence (high-rate state), throttled to ~15 Hz.
  const move = $('pad-move');
  const knob = $('pad-knob');
  let mx = 0;
  let sent = 0;
  const push = () => {
    const now = performance.now();
    if (now - sent < 66) return;
    sent = now;
    void room.presence({ role: 'pad', mx: Math.round(mx * 100) / 100 }).catch(() => {});
  };
  const setFrom = (clientX: number) => {
    const r = move.getBoundingClientRect();
    mx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1));
    knob.style.left = `calc(${((mx + 1) / 2) * 100}% - 32px)`;
    push();
  };
  move.addEventListener('pointerdown', (e) => {
    move.setPointerCapture(e.pointerId);
    setFrom(e.clientX);
  });
  move.addEventListener('pointermove', (e) => {
    if (move.hasPointerCapture(e.pointerId)) setFrom(e.clientX);
  });
  const release = () => {
    mx = 0;
    knob.style.left = 'calc(50% - 32px)';
    sent = 0;
    push();
  };
  move.addEventListener('pointerup', release);
  move.addEventListener('pointercancel', release);

  // Motion swings where the browser provides device motion (a sharp rotation spike = swing).
  let lastSwing = 0;
  let motionSeen = false;
  window.addEventListener('devicemotion', (ev) => {
    const r = ev.rotationRate;
    if (!r) return;
    if (!motionSeen) {
      motionSeen = true;
      $('pad-motion').textContent = 'Motion swing on';
    }
    const speed = Math.hypot(r.alpha ?? 0, r.beta ?? 0, r.gamma ?? 0);
    const now = performance.now();
    if (speed > 420 && now - lastSwing > 450) {
      lastSwing = now;
      swing('auto');
    }
  });

  // Keep the phone awake while playing.
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request('screen');
  } catch {
    /* optional */
  }
}
