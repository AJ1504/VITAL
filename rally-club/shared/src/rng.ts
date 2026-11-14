// Deterministic seeded RNG (mulberry32) so simulations and tests are reproducible.
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Approximately normal sample (mean 0, sd 1) via sum of uniforms. */
export function gaussian(rng: Rng): number {
  return rng() + rng() + rng() + rng() + rng() + rng() - 3;
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}
