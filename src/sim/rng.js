// Seeded random numbers. The ONLY source of randomness in the simulation (never use Math.random).
// Generator: sfc32, seeded from a string via the cyrb128 hash. See docs/simulation.md §2.
import { cos, log } from './fmath.js';

/**
 * Hash a string into four 32-bit seeds.
 * @param {string} str
 * @returns {[number, number, number, number]}
 */
function cyrb128(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Draws discarded after seeding, so similar seeds diverge quickly. */
const WARM_UP = 15;

export class Rng {
  /** @type {number} */ #a;
  /** @type {number} */ #b;
  /** @type {number} */ #c;
  /** @type {number} */ #d;

  /**
   * Use `createRng(seed)` or `Rng.fromState(state)` rather than calling this directly.
   * @param {[number, number, number, number]} state
   */
  constructor([a, b, c, d]) {
    this.#a = a | 0;
    this.#b = b | 0;
    this.#c = c | 0;
    this.#d = d | 0;
  }

  /** @param {[number, number, number, number]} state  From `getState()`. */
  static fromState(state) {
    return new Rng(state);
  }

  /** Snapshot of the generator, so a running league can be saved and resumed exactly. */
  getState() {
    return /** @type {[number, number, number, number]} */ ([this.#a, this.#b, this.#c, this.#d]);
  }

  /** A float in [0, 1). */
  next() {
    const t = (((this.#a + this.#b) | 0) + this.#d) | 0;
    this.#d = (this.#d + 1) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#c = (this.#c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  /** A float in [min, max). @param {number} min @param {number} max */
  float(min, max) {
    return min + this.next() * (max - min);
  }

  /** A whole number in [min, max], both inclusive. @param {number} min @param {number} max */
  int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
      throw new RangeError(`int(${min}, ${max}): need whole numbers with min ≤ max`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p. @param {number} p */
  chance(p) {
    return this.next() < p;
  }

  /** A normally distributed number (Box–Muller). @param {number} [mean] @param {number} [sd] */
  normal(mean = 0, sd = 1) {
    const u = 1 - this.next(); // (0, 1], avoids log(0)
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * log(u)) * cos(2 * Math.PI * v);
  }

  /** A uniformly random item. @template T @param {readonly T[]} items @returns {T} */
  pick(items) {
    if (items.length === 0) throw new RangeError('pick() from an empty list');
    return items[Math.floor(this.next() * items.length)];
  }

  /**
   * An item chosen with probability proportional to its weight.
   * @template T
   * @param {readonly T[]} items
   * @param {(item: T) => number} weightOf
   * @returns {T}
   */
  weighted(items, weightOf) {
    const weights = items.map(weightOf);
    let total = 0;
    for (const w of weights) {
      if (!(w >= 0) || !Number.isFinite(w)) throw new RangeError(`weighted(): invalid weight ${w}`);
      total += w;
    }
    if (total <= 0) throw new RangeError('weighted(): all weights are zero');
    let roll = this.next() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0 && weights[i] > 0) return items[i];
    }
    // Floating-point leftovers: fall back to the last item with weight.
    for (let i = items.length - 1; i >= 0; i--) if (weights[i] > 0) return items[i];
    throw new Error('unreachable');
  }

  /**
   * A key of `{ key: weight }` chosen in proportion to its weight. Keys starting with "_" (comments) are ignored.
   * @param {Readonly<Record<string, number>>} weights
   * @returns {string}
   */
  weightedKey(weights) {
    const keys = Object.keys(weights).filter((k) => !k.startsWith('_'));
    return this.weighted(keys, (k) => weights[k]);
  }

  /** A shuffled copy (Fisher–Yates). The input is not changed. @template T @param {readonly T[]} items @returns {T[]} */
  shuffle(items) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

/**
 * A generator seeded from any string. The same seed always gives the same sequence.
 * @param {string} seed
 */
export function createRng(seed) {
  const rng = new Rng(cyrb128(seed));
  for (let i = 0; i < WARM_UP; i++) rng.next();
  return rng;
}

// Streams (one per match or off-season step, each from the league seed and its name) are in streams.js (Task 271).
