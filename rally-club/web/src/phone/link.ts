// Game side of the phone controller. The game and the phone both open the same artifact page; they
// meet in a named real-time room ("pad-<code>") provided by the claude.ai runtime. The phone sends
// swings as messages and its movement as presence; the game answers pings (so the phone can measure
// latency) and sends hit feedback for haptics. Outside claude.ai there is no room: pairing is hidden.

export const PAD_COMMANDS = ['match', 'practice', 'arena-next', 'arena-prev', 'pause', 'resume', 'rematch', 'menu', 'camera'] as const;
export type PadCommand = (typeof PAD_COMMANDS)[number];

export interface PadSwing {
  shot: 'auto' | 'dink' | 'lob' | 'drive';
  /** One-way latency estimate in ms, measured on the phone. */
  lat: number;
}

type Room = {
  emit(topic: string, data?: unknown): Promise<void>;
  on(topic: string, h: (m: { isMe: boolean; data?: unknown }) => void, onError?: (e: unknown) => void): () => void;
  presence(patch: Record<string, unknown>): Promise<void>;
  onPeers(h: (c: { peers: readonly { isMe: boolean; presence: Readonly<Record<string, unknown>> }[] }) => void, onError?: (e: unknown) => void): () => void;
  leave?: () => Promise<void> | void;
};

/** Where the phone should open the game (the published artifact link). */
export const GAME_URL = 'https://claude.ai/artifact/TWbzMdECKcrgvUPz7sh5h9';

export class PhoneLink {
  /** Kept across reloads so a paired phone reconnects by itself. */
  readonly code = PhoneLink.savedCode();
  connected = false;
  available = false;
  latencyMs = 0;
  moveX = 0;
  onSwing: ((s: PadSwing) => void) | null = null;
  onStatus: ((connected: boolean) => void) | null = null;
  /** Remote commands from the phone (start a match, change arena, pause…). */
  onCommand: ((cmd: PadCommand) => void) | null = null;
  private state: Record<string, unknown> = { role: 'game' };

  private static savedCode(): string {
    try {
      const c = localStorage.getItem('vital.padCode');
      if (c && /^\d{4}$/.test(c)) return c;
      const n = String(1000 + Math.floor(Math.random() * 9000));
      localStorage.setItem('vital.padCode', n);
      return n;
    } catch {
      return String(1000 + Math.floor(Math.random() * 9000));
    }
  }
  private room: Room | null = null;
  private starting: Promise<boolean> | null = null;

  /** Join the pairing room (idempotent). Resolves false where the runtime has no rooms. */
  start(): Promise<boolean> {
    this.starting ??= this.doStart();
    return this.starting;
  }

  get padUrl(): string {
    const inArtifact = typeof window !== 'undefined' && !!(window as { claude?: unknown }).claude;
    const base = inArtifact ? GAME_URL : location.href.split('#')[0];
    return `${base}#pad-${this.code}`;
  }

  private async doStart(): Promise<boolean> {
    const c = (window as { claude?: { use(n: string): Promise<unknown> } }).claude;
    if (!c?.use) return false;
    const lobby = (await c.use('room')) as { join(name: string): Promise<Room> } | null;
    if (!lobby) return false;
    try {
      this.room = await lobby.join(`pad-${this.code}`);
    } catch {
      return false;
    }
    this.available = true;
    const room = this.room;
    void room.presence(this.state).catch(() => {});
    room.on('cmd', (m) => {
      if (m.isMe) return;
      const d = (m.data ?? {}) as { do?: string };
      if (typeof d.do === 'string' && PAD_COMMANDS.includes(d.do as PadCommand)) this.onCommand?.(d.do as PadCommand);
    });
    room.on('swing', (m) => {
      if (m.isMe) return;
      const d = (m.data ?? {}) as Partial<PadSwing>;
      const shot = d.shot === 'dink' || d.shot === 'lob' || d.shot === 'drive' ? d.shot : 'auto';
      const lat = typeof d.lat === 'number' && Number.isFinite(d.lat) ? Math.max(0, Math.min(250, d.lat)) : 0;
      this.latencyMs = lat;
      this.onSwing?.({ shot, lat });
    });
    room.on('ping', (m) => {
      if (m.isMe) return;
      void room.emit('pong', m.data).catch(() => {});
    });
    room.onPeers((ch) => {
      const pads = ch.peers.filter((p) => !p.isMe && p.presence?.role === 'pad');
      const was = this.connected;
      this.connected = pads.length > 0;
      const mx = Number(pads[0]?.presence?.mx ?? 0);
      this.moveX = Number.isFinite(mx) ? Math.max(-1, Math.min(1, mx)) : 0;
      if (was !== this.connected) this.onStatus?.(this.connected);
    });
    return true;
  }

  /**
   * Share what the phone should show (screen, score, arena…) as presence: late joiners get it too.
   * Only changed fields are sent.
   */
  setState(patch: Record<string, unknown>): void {
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      if (this.state[k] !== v) {
        this.state[k] = v;
        changed = true;
      }
    }
    if (changed && this.room) void this.room.presence(this.state).catch(() => {});
  }

  /** "Get ready" pulse: the ball reaches you in `inSec` seconds (+ the ideal swing lead). */
  cue(inSec: number): void {
    if (this.connected) void this.room?.emit('cue', { in: Math.round(inSec * 1000) }).catch(() => {});
  }

  /** Hit / point feedback for the phone (label + haptic). Fire-and-forget. */
  feedback(data: { q?: 'perfect' | 'good' | 'ok' | 'miss'; text?: string; score?: string }): void {
    if (this.connected) void this.room?.emit('fb', data).catch(() => {});
  }
}
