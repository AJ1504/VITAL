// Time-of-day presets shared by every arena: sky gradient, sun (or floodlight key at night), hemisphere
// fill, fog, exposure and how strongly the emissive accents (LED strips, signage) glow.
import type { TimeOfDay } from './config.ts';

export interface LightPreset {
  stops: [number, string][];
  sun: number;
  sunI: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiI: number;
  fog: number;
  exposure: number;
  /** Multiplier for emissive accents. */
  glow: number;
  night: boolean;
  dusk: boolean;
}

export const LIGHTING: Record<TimeOfDay, LightPreset> = {
  day: {
    stops: [[0, '#2a86e2'], [0.28, '#62b4f2'], [0.44, '#bfe4fb'], [0.5, '#eaf7fc'], [1, '#eaf7fc']],
    sun: 0xfff3e0,
    sunI: 2.8,
    sunPos: [-14, 28, 12],
    hemiSky: 0xeaf4ff,
    hemiGround: 0xe6dbc6,
    hemiI: 1.3,
    fog: 0xeef4f2,
    exposure: 1.0,
    glow: 0.3,
    night: false,
    dusk: false,
  },
  golden: {
    stops: [[0, '#4f8fd8'], [0.26, '#9cc4ea'], [0.4, '#fbcfb4'], [0.47, '#ffc48f'], [0.5, '#ffd9a8'], [1, '#ffd9a8']],
    sun: 0xffe0bf,
    sunI: 2.8,
    sunPos: [20, 13, -7],
    hemiSky: 0xfff1e6,
    hemiGround: 0xeed8c6,
    hemiI: 1.45,
    fog: 0xf6dcc6,
    exposure: 1.04,
    glow: 0.9,
    night: false,
    dusk: true,
  },
  night: {
    stops: [[0, '#0b1433'], [0.3, '#1d2a5c'], [0.45, '#4a4b8a'], [0.5, '#7a5f9a'], [1, '#2a2348']],
    // At night the "sun" is the stadium floodlight key: high, cool-white, casting crisp shadows.
    sun: 0xf3f0ff,
    sunI: 2.4,
    sunPos: [6, 30, 8],
    hemiSky: 0x6b6fb8,
    hemiGround: 0x3a3456,
    hemiI: 1.25,
    fog: 0x2a2a52,
    exposure: 1.12,
    glow: 2.2,
    night: true,
    dusk: true,
  },
};
