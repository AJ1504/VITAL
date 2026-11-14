// Messages exchanged between the Rally Club website and the Unreal build over Pixel Streaming 2.
//  Browser -> Unreal: sent with PixelStreaming.emitUIInteraction (arrives in UE as a JSON "descriptor").
//  Unreal -> Browser: sent with the PixelStreaming2 Input component's SendPixelStreamingResponse,
//                     received with PixelStreaming.addResponseEventListener.
// The C++ side lives in unreal/Source/RallyClub/{Public,Private}/RallyStreamBridge.*. Keep both in sync.

export const STREAM_PROTOCOL_VERSION = 1;

/** Browser -> Unreal: the same ControlInput every input source produces (see shared/src/match.ts). */
export interface StreamInputMessage {
  type: 'rally.input';
  v: number;
  /** Monotonic sequence id (drop out-of-order packets). */
  seq: number;
  /** Client timestamp, ms (for latency diagnostics). */
  t: number;
  moveX: number;
  moveZ: number;
  swing: { shot: 'drive' | 'dink' | 'lob'; aim: number } | null;
}

/** Browser -> Unreal: lobby / match commands. */
export interface StreamCommandMessage {
  type: 'rally.command';
  v: number;
  command: 'start_match' | 'start_practice' | 'pause' | 'resume' | 'rematch' | 'menu';
  settings?: { assist?: 'casual' | 'classic' | 'precision'; difficulty?: 'easy' | 'medium' | 'hard'; pointsToWin?: number; playerName?: string };
}

/** Unreal -> Browser: scoreboard snapshot (sent ~5 Hz and on every change). */
export interface StreamStateMessage {
  type: 'rally.state';
  names: [string, string];
  score: [number, number];
  server: number;
  call: string;
  rally: number;
  gameOver: boolean;
  winner: number;
  /** Last input seq Unreal applied (round-trip diagnostics). */
  ackSeq: number;
}

/** Unreal -> Browser: commentary line for subtitles (audio is in the video stream). */
export interface StreamCommentaryMessage {
  type: 'rally.commentary';
  text: string;
}

export type StreamToBrowser = StreamStateMessage | StreamCommentaryMessage;
export type BrowserToStream = StreamInputMessage | StreamCommandMessage;

export function parseStreamMessage(raw: string): StreamToBrowser | null {
  try {
    const m = JSON.parse(raw);
    if (m && (m.type === 'rally.state' || m.type === 'rally.commentary')) return m as StreamToBrowser;
  } catch {
    /* ignore malformed */
  }
  return null;
}

/** Only send input when it changed, when a swing happens, or as a 10 Hz keep-alive. */
export function shouldSendInput(prev: StreamInputMessage | null, next: Omit<StreamInputMessage, 'seq' | 't' | 'type' | 'v'>, msSinceLast: number): boolean {
  if (!prev) return true;
  if (next.swing) return true;
  if (Math.abs(prev.moveX - next.moveX) > 0.02 || Math.abs(prev.moveZ - next.moveZ) > 0.02) return true;
  return msSinceLast >= 100;
}
