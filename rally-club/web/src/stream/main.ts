// Rally Club over Pixel Streaming 2: Unreal renders on a GPU host; this page shows the video and
// sends the player's controls back as structured `rally.input` messages (same ControlInput as every
// other input source), and renders Unreal's scoreboard/commentary messages in the club HUD.

import { Config, Flags, PixelStreaming } from '@epicgames-ps/lib-pixelstreamingfrontend-ue5.6';
import { STREAM_PROTOCOL_VERSION, type StreamCommandMessage, type StreamInputMessage, parseStreamMessage, shouldSendInput } from '../../../shared/src/streamProtocol.ts';
import { InputManager } from '../input/input.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const params = new URLSearchParams(location.search);
const STORE_KEY = 'rally-club.stream.ss';

function defaultHost(): string {
  const fromUrl = params.get('ss');
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved) return saved;
  } catch {
    /* storage unavailable */
  }
  const env = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PS_SIGNALLING_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.hostname || 'localhost'}:80`;
}

const status = (text: string, error = false) => {
  const el = $('#status');
  el.textContent = text;
  el.classList.toggle('error', error);
};

let stream: PixelStreaming | null = null;
let connected = false;
const input = new InputManager();
input.bindTouch($('#touch-controls'));
let seq = 0;
let last: StreamInputMessage | null = null;
let lastSentAt = 0;
let ackSeq = 0;
let subTimer = 0;

function connect(url: string): void {
  try {
    localStorage.setItem(STORE_KEY, url);
  } catch {
    /* ignore */
  }
  stream?.disconnect();
  const config = new Config({
    useUrlParams: false,
    initialSettings: {
      [Flags.AutoConnect]: false,
      [Flags.AutoPlayVideo]: true,
      [Flags.StartVideoMuted]: false,
      [Flags.MatchViewportResolution]: true,
      [Flags.HoveringMouseMode]: true,
      // Rally Club sends its own structured input (rally.input), so raw key/mouse/touch/pad forwarding is off:
      // Unreal never needs per-device mappings and phones/touch work exactly like the browser edition.
      [Flags.KeyboardInput]: false,
      [Flags.MouseInput]: false,
      [Flags.TouchInput]: false,
      [Flags.GamepadInput]: false,
      [Flags.WaitForStreamer]: true,
      ss: url,
    },
  });
  stream = new PixelStreaming(config, { videoElementParent: $('#video') });
  stream.addEventListener('webRtcConnecting', () => status('Negotiating with the club host…'));
  stream.addEventListener('webRtcConnected', () => status('Connected — starting video…'));
  stream.addEventListener('webRtcFailed', () => status('Could not establish the stream (check TURN / firewall).', true));
  stream.addEventListener('webRtcDisconnected', () => {
    connected = false;
    $('#hud').hidden = true;
    $('#connect').hidden = false;
    status('Disconnected from the Unreal host.', true);
  });
  stream.addEventListener('playStreamRejected', () => {
    // Browser autoplay policy: needs a tap.
    const b = $('#click-to-play');
    b.hidden = false;
    b.onclick = () => {
      b.hidden = true;
      stream?.play();
    };
  });
  stream.addEventListener('playStream', () => {
    connected = true;
    $('#connect').hidden = true;
    $('#hud').hidden = false;
    send({ type: 'rally.command', v: STREAM_PROTOCOL_VERSION, command: 'start_match', settings: { assist: 'classic', difficulty: 'medium', pointsToWin: 11 } });
  });
  stream.addResponseEventListener('rally', (raw) => onResponse(raw));
  status(`Connecting to ${url} …`);
  stream.connect();
}

function send(msg: StreamInputMessage | StreamCommandMessage): void {
  if (!stream) return;
  stream.emitUIInteraction(msg);
}

function onResponse(raw: string): void {
  const m = parseStreamMessage(raw);
  if (!m) return;
  if (m.type === 'rally.state') {
    ackSeq = m.ackSeq;
    for (const side of [0, 1]) {
      const row = $(`.sb-row[data-side="${side}"]`);
      row.querySelector('.sb-name')!.textContent = m.names[side];
      row.querySelector('.sb-score')!.textContent = String(m.score[side]);
      row.classList.toggle('serving', m.server === side);
    }
    $('#sb-call').textContent = m.gameOver ? 'Final' : m.call;
    $('#sb-rally').textContent = m.rally > 1 ? `Rally ${m.rally}` : '';
  } else if (m.type === 'rally.commentary') {
    $('#subtitle-text').textContent = m.text;
    $('#subtitle').classList.add('show');
    clearTimeout(subTimer);
    subTimer = window.setTimeout(() => $('#subtitle').classList.remove('show'), 1500 + m.text.length * 55);
  }
}

// Input pump: 60 Hz poll, send on change / swing / 10 Hz keep-alive.
function pump(): void {
  if (connected) {
    const c = input.poll();
    const now = performance.now();
    const body = { moveX: c.moveX, moveZ: c.moveZ, swing: c.swing ? { shot: c.swing.shot as 'drive' | 'dink' | 'lob', aim: c.swing.aim } : null };
    if (shouldSendInput(last, body, now - lastSentAt)) {
      const msg: StreamInputMessage = { type: 'rally.input', v: STREAM_PROTOCOL_VERSION, seq: ++seq, t: Date.now(), ...body };
      send(msg);
      last = msg;
      lastSentAt = now;
    }
    $('#net-stats').textContent = `SENT ${seq} · ACK ${ackSeq} · IN FLIGHT ${Math.max(0, seq - ackSeq)}`;
  }
  requestAnimationFrame(pump);
}
requestAnimationFrame(pump);

input.onPause = () => {
  if (connected) send({ type: 'rally.command', v: STREAM_PROTOCOL_VERSION, command: 'pause' });
};

const ssInput = $<HTMLInputElement>('#ss');
ssInput.value = defaultHost();
$('#connect-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const url = ssInput.value.trim();
  if (!/^wss?:\/\//.test(url)) {
    status('The stream host must start with ws:// or wss://', true);
    return;
  }
  connect(url);
});
if (params.get('ss')) connect(params.get('ss')!);

declare global {
  interface Window {
    __rallyStream: unknown;
  }
}
window.__rallyStream = { connect, status: () => $('#status').textContent, isConnected: () => connected };
