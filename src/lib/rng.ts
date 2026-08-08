/**
 * Seeded, deterministic randomness.
 *
 * Every item in this app is reproducible from a short seed string: the same seed must
 * yield a byte-identical item forever, so that a shared seed is the same test for two
 * people and a stored session can be replayed for review without storing the items.
 *
 * `pure-rand` v8 is wrapped here so the rest of the codebase never touches it directly.
 * Two of its API details are easy to get wrong (see docs/LIBRARIES.md §2):
 *   - there is no root export, only deep subpaths;
 *   - the generator is MUTABLE and the signature is `uniformInt(rng, from, to)`.
 */
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { uniformInt } from 'pure-rand/distribution/uniformInt';

/** Alphabet for human-shareable seeds: no 0/O/1/I/L to avoid transcription errors. */
const SEED_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const SEED_LENGTH = 8;

export interface Rng {
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  /** Uniform float in [0, 1). */
  float(): number;
  /** True with probability `p`. */
  bool(p?: number): boolean;
  /** Uniformly picks one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** Returns `count` distinct elements, in random order. Throws if `count > items.length`. */
  sample<T>(items: readonly T[], count: number): T[];
  /** Returns a new shuffled array (Fisher-Yates); does not mutate the input. */
  shuffle<T>(items: readonly T[]): T[];
  /** A fresh derived seed string, for spawning sub-generators. */
  seed(): string;
}

/**
 * Hashes an arbitrary seed string to a 32-bit integer (FNV-1a).
 * Deterministic across platforms and JS engines.
 */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range without overflow to double precision.
    h = Math.imul(h, 0x01000193);
  }
  // Force to a non-zero unsigned value; xoroshiro is poor when seeded with 0.
  return (h >>> 0) || 0x9e3779b9;
}

export function createRng(seed: string): Rng {
  const gen = xoroshiro128plus(hashSeed(seed));

  const int = (min: number, max: number): number => {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`rng.int requires integer bounds, got (${min}, ${max})`);
    }
    if (max < min) throw new RangeError(`rng.int: max (${max}) < min (${min})`);
    return uniformInt(gen, min, max);
  };

  const rng: Rng = {
    int,
    // 2^30 buckets: plenty of resolution, and stays inside exact integer arithmetic.
    float: () => int(0, 0x3fffffff) / 0x40000000,
    bool: (p = 0.5) => rng.float() < p,

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('rng.pick: empty array');
      return items[int(0, items.length - 1)]!;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },

    sample<T>(items: readonly T[], count: number): T[] {
      if (count > items.length) {
        throw new RangeError(`rng.sample: need ${count} of ${items.length}`);
      }
      return rng.shuffle(items).slice(0, count);
    },

    seed(): string {
      let out = '';
      for (let i = 0; i < SEED_LENGTH; i++) {
        out += SEED_ALPHABET[int(0, SEED_ALPHABET.length - 1)];
      }
      return out;
    },
  };

  return rng;
}

/**
 * A fresh random seed for a new session. Uses `crypto` where available so two users
 * starting at the same millisecond do not collide; falls back to `Math.random`.
 */
export function randomSeed(): string {
  const n = SEED_LENGTH;
  const bytes = new Uint8Array(n);
  const c: Crypto | undefined = globalThis.crypto;
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = '';
  for (let i = 0; i < n; i++) {
    out += SEED_ALPHABET[bytes[i]! % SEED_ALPHABET.length];
  }
  return out;
}

/** Normalises user-typed seeds so `abc-def` and `ABCDEF` are the same test. */
export function normaliseSeed(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Deterministically derives a child seed. Used to give each item in a test its own
 * reproducible seed from the session seed, without consuming the session RNG.
 */
export function deriveSeed(parent: string, ...parts: (string | number)[]): string {
  return `${parent}:${parts.join(':')}`;
}
