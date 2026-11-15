// Rally Club court themes — each court in the resort has its own clean pastel palette (like Vital's
// per-theme colour families). The 3D court and the UI both read from the active theme.

export type CourtId = 'garden' | 'clay' | 'glass' | 'sunset';

export interface CourtTheme {
  id: CourtId;
  name: string;
  sport: 'Pickleball' | 'Tennis' | 'Padel';
  blurb: string;
  playable: boolean;
  /** World placement of the court centre and its yaw (radians). The playable court sits at the origin. */
  x: number;
  z: number;
  yaw: number;
  court: number;
  kitchen: number;
  surround: number;
  line: number;
  accent: number;
  accentDeep: number;
  /** CSS tokens for the UI when this court is selected. */
  ui: { bg: string; card: string; ink: string; soft: string; accent: string; accentDeep: string; accent2: string };
}

export const COURTS: Record<CourtId, CourtTheme> = {
  garden: {
    id: 'garden',
    name: 'The Garden Court',
    sport: 'Pickleball',
    blurb: 'Sage and sand among the olive trees, with the DJ under the stone arch.',
    playable: true,
    x: 0,
    z: 0,
    yaw: 0,
    court: 0x9db592,
    kitchen: 0xb1c6a4,
    surround: 0xe9d6ad,
    line: 0xffffff,
    accent: 0xb7a3d9,
    accentDeep: 0x7e6aa8,
    ui: { bg: '#f6efe3', card: '#fffaf2', ink: '#3f4a3c', soft: '#8b947f', accent: '#8fab83', accentDeep: '#5f7d55', accent2: '#b7a3d9' },
  },
  clay: {
    id: 'clay',
    name: 'The Clay Terrace',
    sport: 'Tennis',
    blurb: 'Powder-blue hard court on a terracotta terrace above the valley.',
    playable: false,
    x: 46,
    z: -6,
    yaw: Math.PI / 2,
    court: 0x9fbbd8,
    kitchen: 0x9fbbd8,
    surround: 0xd99c86,
    line: 0xffffff,
    accent: 0xe7b9a6,
    accentDeep: 0xb4705a,
    ui: { bg: '#f8eee8', card: '#fffaf6', ink: '#3d4552', soft: '#8a8f99', accent: '#8fb0d4', accentDeep: '#5b7fa8', accent2: '#e2a48d' },
  },
  glass: {
    id: 'glass',
    name: 'The Glass House',
    sport: 'Padel',
    blurb: 'A lavender padel cage wrapped in glass, wisteria and lavender beds.',
    playable: false,
    x: -42,
    z: -4,
    yaw: Math.PI / 2,
    court: 0xbcaadd,
    kitchen: 0xbcaadd,
    surround: 0xe4dbef,
    line: 0xffffff,
    accent: 0xbcaadd,
    accentDeep: 0x7f6aa9,
    ui: { bg: '#f3eff8', card: '#fdfbff', ink: '#41395a', soft: '#8e88a0', accent: '#a996d2', accentDeep: '#7462a3', accent2: '#e8c6d8' },
  },
  sunset: {
    id: 'sunset',
    name: 'The Sunset Cliff',
    sport: 'Pickleball',
    blurb: 'Peach court on the cliff edge, lanterns and lounges as the sun sets over the sea.',
    playable: false,
    x: 4,
    z: -50,
    yaw: 0,
    court: 0xeaa58f,
    kitchen: 0xf0b8a3,
    surround: 0xf5d2bf,
    line: 0xffffff,
    accent: 0xf2b8a2,
    accentDeep: 0xc4705a,
    ui: { bg: '#fbefe8', card: '#fffaf6', ink: '#4a3a38', soft: '#9a8a86', accent: '#eaa58f', accentDeep: '#c4705a', accent2: '#f6d6a8' },
  },
};

/** Resort-wide palette (stone, foliage, fabrics). */
export const RESORT = {
  stone: 0xf1e6d2,
  stoneShade: 0xe2d3b8,
  stoneWarm: 0xe8d8bd,
  plaster: 0xf6eee0,
  wood: 0xc8a37a,
  woodDark: 0x9a7552,
  olive: 0x9aa877,
  oliveDeep: 0x7f8f5e,
  trunk: 0x8a7458,
  cypress: 0x56704a,
  lawn: 0xa7bf86,
  lawnDeep: 0x8faa70,
  lavender: 0xa88fd0,
  lavenderDeep: 0x8a70b8,
  hydrangea: 0xf4f1ea,
  fabric: 0xf5ecdb,
  sage: 0x8fab83,
  sea: 0x7fb3cf,
  hills: 0xb7c495,
  hillsFar: 0xc9d3b0,
  terracotta: 0xd9a083,
  lemon: 0xf2d55c,
} as const;
