// Player settings (brief §8). Persisted per browser as a convenience; everything works without storage.
import type { AssistLevel } from '../../shared/src/match.ts';

export type Difficulty = 'easy' | 'medium' | 'hard';
export type GraphicsPreset = 'low' | 'medium' | 'high';

export type VenueId = 'lawn' | 'rooftop';

export interface Settings {
  playerName: string;
  venue: VenueId;
  assist: AssistLevel;
  difficulty: Difficulty;
  pointsToWin: number;
  graphics: GraphicsPreset;
  cameraShake: boolean;
  master: number;
  music: number;
  crowd: number;
  sfx: number;
  voice: boolean;
  subtitles: boolean;
  reducedMotion: boolean;
  textScale: number;
  highContrast: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: 'You',
  venue: 'lawn',
  assist: 'classic',
  difficulty: 'medium',
  pointsToWin: 11,
  graphics: 'high',
  cameraShake: true,
  master: 0.8,
  music: 0.7,
  crowd: 0.6,
  sfx: 0.8,
  voice: true,
  subtitles: true,
  reducedMotion: false,
  textScale: 1,
  highContrast: false,
  haptics: true,
};

const KEY = 'rally-club.settings.v1';

export function loadSettings(): Settings {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(s, JSON.parse(raw));
  } catch {
    /* storage unavailable: defaults */
  }
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches && !localStorage.getItem(KEY)) s.reducedMotion = true;
  } catch {
    /* ignore */
  }
  return s;
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
