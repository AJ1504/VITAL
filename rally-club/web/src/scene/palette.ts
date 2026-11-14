// Rally Club art-direction palette (brief §1): warm terracotta, deep emerald, cream, coral,
// cobalt, lavender and sunset gold.
export const PALETTE = {
  terracotta: 0xc4633d,
  terracottaDark: 0x9a4a2c,
  terracottaLight: 0xd9825c,
  emerald: 0x1f5e4a,
  emeraldDeep: 0x174a3a,
  emeraldKitchen: 0x2a7259,
  cream: 0xf4ead5,
  coral: 0xf07a5f,
  cobalt: 0x2b4fa8,
  lavender: 0xb59fd8,
  gold: 0xf2b544,
  sky0: 0xffd9a0,
  sky1: 0xf49a6c,
  sky2: 0x9a7cc0,
  ball: 0xe8f53c,
  ink: 0x2b2420,
} as const;

export const SKIN_TONES = [0xf6d3b3, 0xe8b38f, 0xc98e66, 0xa4704b, 0x7a4f33, 0x5a3825];
export const HAIR_COLORS = [0x2b1d14, 0x5a3a22, 0x9c6a3a, 0xd9b26a, 0x1b1b1b, 0xb34a2c];
export const OUTFIT_COLORS = [PALETTE.coral, PALETTE.cobalt, PALETTE.lavender, PALETTE.gold, PALETTE.cream, PALETTE.emerald, 0xffffff, 0x6fb3a8];

/** "Members' Lawn" — the regal country-club palette: bottle green, ivory, antique gold, claret. */
export const ROYAL = {
  bottle: 0x123d2f,
  bottleDeep: 0x0b2a20,
  ivory: 0xf5efe1,
  stone: 0xd9cfb8,
  gold: 0xc9a45c,
  goldDeep: 0x9c7a36,
  claret: 0x6b1f2e,
  navy: 0x1c2a44,
  lawnLight: 0x6b9450,
  lawnDark: 0x557d3f,
  lawnWorn: 0xa59f72,
  hydrangea: 0x8e86c9,
  hydrangeaWhite: 0xeeeaf6,
  ivy: 0x2f5a2c,
} as const;

/** Summer-garden-party spectator wardrobe: whites, pastels, navy, linen. */
export const SUMMER_OUTFITS = [0xffffff, 0xf5efe1, 0xe9e2cf, 0xbcd3e8, 0xf2c9c4, 0xd9e5c3, 0x1c2a44, 0x6b1f2e, 0xc9a45c, 0x9fb6cf, 0xe8d6a8, 0xffffff];
