// Vital arenas: four pickleball venues, each with its own pastel palette, light and architecture,
// designed from the club's mood boards. The 3D arena and the UI both read from the active theme.

export type CourtId = 'coral' | 'terrace' | 'lavender' | 'rose';
export const ARENA_IDS: CourtId[] = ['coral', 'terrace', 'lavender', 'rose'];

export type Seating = 'chairs' | 'steps' | 'benches';
export type TimeOfDay = 'morning' | 'golden' | 'dusk';

export interface CourtTheme {
  id: CourtId;
  name: string;
  sport: 'Pickleball';
  blurb: string;
  playable: boolean;
  court: number;
  kitchen: number;
  /** Optional side panels (outside the sidelines) in a second court colour. */
  alley?: number;
  surround: number;
  line: number;
  /** Colour of the painted Vital script on the court and surround. */
  logo: string;
  /** Glossy acrylic finish (reflects the sky). */
  gloss: boolean;
  seating: Seating;
  seatColors: number[];
  rows: number;
  time: TimeOfDay;
  /** Plaza / terrace paving around the bowl. */
  paving: number;
  /** Structure (stone, plaster) colour. */
  stone: number;
  flowers: number[];
  trees: 'palm' | 'olive' | 'mixed';
  glow: number;
  accent: number;
  accentDeep: number;
  /** CSS tokens for the UI when this arena is selected. */
  ui: { bg: string; card: string; ink: string; soft: string; accent: string; accentDeep: string; accent2: string };
}

export const COURTS: Record<CourtId, CourtTheme> = {
  coral: {
    id: 'coral',
    name: 'The Coral Club',
    sport: 'Pickleball',
    blurb: 'Coral court and blush seats at golden hour, palms throwing long shadows. The DJ plays under a disco ball.',
    playable: true,
    court: 0xe39a7f,
    kitchen: 0xe39a7f,
    surround: 0xa9c2a6,
    line: 0xfffaf2,
    logo: '#fff8ee',
    gloss: false,
    seating: 'chairs',
    seatColors: [0xf1b9bd, 0x9fbf9f, 0xf6e9dc, 0xe9a4ad, 0xb7cdb1],
    rows: 5,
    time: 'golden',
    paving: 0xf3e2cf,
    stone: 0xfbf1e6,
    flowers: [0xe0478e, 0xf06aa6, 0xd93e86],
    trees: 'palm',
    glow: 0xffc98a,
    accent: 0xe39a7f,
    accentDeep: 0xb9644b,
    ui: { bg: '#fbefe8', card: '#fffaf6', ink: '#4a3a38', soft: '#9a8a86', accent: '#e39a7f', accentDeep: '#b9644b', accent2: '#9fbf9f' },
  },
  terrace: {
    id: 'terrace',
    name: 'The Mint Terrace',
    sport: 'Pickleball',
    blurb: 'A glossy mint court with a butter-yellow kitchen on a cream stone terrace. Morning light, loungers and lemonade.',
    playable: true,
    court: 0x9fd8cf,
    kitchen: 0xf2e7a0,
    surround: 0xb9e0c4,
    line: 0xffffff,
    logo: '#1c3d24',
    gloss: true,
    seating: 'benches',
    seatColors: [0xf8f4ea, 0xa8d8bf, 0xf8f4ea],
    rows: 2,
    time: 'morning',
    paving: 0xf2e9dc,
    stone: 0xf7f0e4,
    flowers: [0xfbf8f1, 0xf5f2ea],
    trees: 'olive',
    glow: 0xfff0c8,
    accent: 0x8fcfb3,
    accentDeep: 0x2f6b4a,
    ui: { bg: '#f1f6ef', card: '#fffdf8', ink: '#24392c', soft: '#7d8f82', accent: '#8fcfb3', accentDeep: '#2f6b4a', accent2: '#f2e7a0' },
  },
  lavender: {
    id: 'lavender',
    name: 'The Lavender Amphitheatre',
    sport: 'Pickleball',
    blurb: 'Lavender and powder-blue court in a white amphitheatre at dusk, with glowing steps and fire-pit lounges.',
    playable: true,
    court: 0x9fb4dc,
    kitchen: 0x9fb4dc,
    alley: 0xb9a3d8,
    surround: 0x93a6cf,
    line: 0xffffff,
    logo: '#ffffff',
    gloss: false,
    seating: 'steps',
    seatColors: [0xa8b9e0, 0xc9bce6, 0xf6f3fb],
    rows: 5,
    time: 'dusk',
    paving: 0xeeeaf3,
    stone: 0xf8f6fb,
    flowers: [0xa279c9, 0xc8a2e0, 0x8f6cc0],
    trees: 'olive',
    glow: 0xffd7a8,
    accent: 0xb9a3d8,
    accentDeep: 0x6f5aa6,
    ui: { bg: '#f3f0f9', card: '#fdfbff', ink: '#3b3456', soft: '#8b86a0', accent: '#b9a3d8', accentDeep: '#6f5aa6', accent2: '#9fb4dc' },
  },
  rose: {
    id: 'rose',
    name: 'The Rosé Garden',
    sport: 'Pickleball',
    blurb: 'Sage court on a blush surround, with sail shades, striped cabanas and bougainvillea in the evening glow.',
    playable: true,
    court: 0xa9c9ad,
    kitchen: 0xa9c9ad,
    surround: 0xdcc4d6,
    line: 0xffffff,
    logo: '#fffaf6',
    gloss: false,
    seating: 'chairs',
    seatColors: [0xc8b8e3, 0xa9c9ad, 0xf6e9e4, 0xe8c3d3],
    rows: 4,
    time: 'golden',
    paving: 0xf3e3df,
    stone: 0xfbf2ef,
    flowers: [0xe0478e, 0xd955a0, 0xf27bb5],
    trees: 'palm',
    glow: 0xffd2a0,
    accent: 0xa9c9ad,
    accentDeep: 0x5f8466,
    ui: { bg: '#f8eff2', card: '#fffafb', ink: '#3f3a40', soft: '#958a92', accent: '#a9c9ad', accentDeep: '#5f8466', accent2: '#dcc4d6' },
  },
};

/** Shared palette (foliage, fabrics). */
export const RESORT = {
  wood: 0xc8a37a,
  woodDark: 0x9a7552,
  olive: 0x9aa877,
  trunk: 0x8a7458,
  palmTrunk: 0xb59a78,
  palm: 0x6f9a52,
  cypress: 0x56704a,
  lawn: 0xa7bf86,
  lavender: 0xa88fd0,
  fabric: 0xfbf7f0,
  sage: 0x8fab83,
  lemon: 0xf2d55c,
  hills: 0xb7c495,
  hillsFar: 0xc9d3b0,
} as const;
