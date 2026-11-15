// Vital arena system — data model. Every arena is one ArenaConfig: the builder (build.ts) composes the
// shared components (court, bowl, DJ stage, branding, landscaping, lighting) from it. All arenas share
// the same court geometry, collision and rules (shared/src/court.ts); only the environment differs.

export type ArenaId = 'lavender' | 'lemon' | 'azure' | 'terracotta' | 'pistachio' | 'coral';
export type TimeOfDay = 'day' | 'golden' | 'night';

/** Playing-surface finish. */
export type Finish = 'acrylic' | 'clay' | 'microcement';
/** Ground / circulation paving. */
export type Paving = 'travertine' | 'terrazzo' | 'wood' | 'stone';
/** Spectator seating module used for every tier of the bowl. */
export type Seating = 'bleachers' | 'terraces' | 'cushion-steps' | 'grandstand';
export type Architecture = 'amphitheater' | 'garden-pavilion' | 'coastal' | 'courtyard' | 'sculptural-garden' | 'futuristic';
export type DjStyle = 'illuminated' | 'striped-canopy' | 'pavilion' | 'archway' | 'circular' | 'disco';
export type Shade = 'sails' | 'banner-sails' | 'umbrellas' | 'cabanas';
export type Extra = 'fire-lounge' | 'pergola' | 'sculptures' | 'canopy-ring' | 'courtyard-walls' | 'ocean-terrace' | 'lemon-trees';

/** Reusable branding surfaces; each placement is configurable per arena. */
export type LogoSurface =
  | 'court-center' // big script across the middle of the court
  | 'behind-baseline' // script on the surround behind both baselines
  | 'corner-monograms' // laurel-V crests beside the court
  | 'surround-lettering' // "VITAL PICKLEBALL CLUB" lettering at the ends
  | 'arena-wall' // large signage on the walls flanking the DJ
  | 'dj-facade' // the DJ desk front
  | 'net-padding' // the padded net band
  | 'flags' // flag poles around the bowl
  | 'banners' // tall vertical banners at the entrance corners
  | 'entrance' // the entrance arch / canopy
  | 'scoreboard'; // the in-world scoreboard frame

export interface LogoPlacement {
  surface: LogoSurface;
  /** CSS colour of the mark. */
  color: string;
  /** Size multiplier (1 = the surface's default size). */
  scale?: number;
  /** Extra rotation in radians (on the surface plane). */
  rotation?: number;
  /** Offset in metres on the surface plane ([across, along]). */
  offset?: [number, number];
  /** Emissive (luminous) mark. */
  glow?: boolean;
  visible?: boolean;
}

export interface ArenaPalette {
  court: number;
  kitchen: number;
  /** Optional side bands outside the sidelines in a second court colour. */
  alley?: number;
  surround: number;
  accent: number;
  line: number;
  /** Structure (stone / plaster) colour. */
  stone: number;
  paving: number;
  /** Seat, bench or cushion colours (cycled or alternated). */
  seats: number[];
  glow: number;
  /** UI tokens applied to the menu/HUD when this arena is selected. */
  ui: { bg: string; card: string; ink: string; soft: string; accent: string; accentDeep: string; accent2: string };
}

export interface ArenaConfig {
  id: ArenaId;
  number: string;
  name: string;
  tagline: string;
  blurb: string;
  palette: ArenaPalette;
  surfaces: { court: Finish; surround: Finish; paving: Paving };
  architecture: Architecture;
  bowl: {
    /** 'circle' makes a round amphitheatre; 'rounded' a stadium rectangle. */
    shape: 'circle' | 'rounded';
    rows: number;
    seating: Seating;
    /** Rows behind the near baseline (camera end): 0 leaves it open (views, entrance). */
    nearRows: number;
    cushionPattern: 'random' | 'alternate' | 'solid';
    /** LED strips on every riser. */
    illuminated: boolean;
  };
  dj: { style: DjStyle; color: number };
  shades: Shade[];
  planting: { trees: 'palm' | 'olive' | 'lemon'; flowers: number[]; hedges: 'none' | 'clipped' | 'sculptural' };
  extras: Extra[];
  logos: LogoPlacement[];
  lighting: { default: TimeOfDay };
}

/** Regulation court used by every arena (20 × 44 ft; 7 ft kitchens) — mirrors shared/src/court.ts. */
export const COURT_FT = { width: 20, length: 44, kitchen: 7 } as const;
