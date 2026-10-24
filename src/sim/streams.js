// Where the sim's randomness comes from (the launch, Task 271; docs/live.md §5). Every random stream (a match, the
// schedule, the draft, a player's motives...) is named by its season and key, and the sim asks the league's streams
// for it. Two kinds answer:
//   seedStreams(seed): works each stream out from the seed (SHA-256 of seed|season|key). Dev, the CLI tools, and the
//     day keys' maker, which holds the live league's secret seed.
//   keyStreams(keys): looks each stream up in the published day keys, so a browser can play only the days published.
//     A stream not there throws MissingKeyError, and the channel shows a "back soon" card.
// recordingStreams wraps one to note every stream and value used, which is how a day's key is made: play the day from
// the seed and keep what it asked for.
//
// A value is a stream's outcome published in its place, where the stream itself would give away more than the day
// needs: a team's keeper rests are one shuffle a season, so a day's key carries only "does it rest today".
import { createRng } from './rng.js';
import { sha256 } from './sha256.js';

/**
 * @typedef {object} Streams
 * @property {'seed' | 'keys'} kind
 * @property {(season: number, key: string) => import('./rng.js').Rng} rng  A fresh generator for the stream.
 * @property {<T>(season: number, key: string, compute: (from: Streams) => T) => T} value  A published outcome (see above):
 *   computed from `from` (never recorded) by seedStreams, looked up by keyStreams.
 */

/** A stream or value's name in a key: "s3|s3-r7-m2". @param {number} season @param {string} key */
export const streamId = (season, key) => `s${season}|${key}`;

/** A stream's seed: one-way, so it reveals neither the league's seed nor any other stream. @param {string} seed @param {number} season @param {string} key */
export const streamHash = (seed, season, key) => sha256(`${seed}|${streamId(season, key)}`);

/** @param {string} seed @returns {Streams} */
export function seedStreams(seed) {
  /** @type {Streams} */
  const s = {
    kind: 'seed',
    rng: (season, key) => createRng(streamHash(seed, season, key)),
    value: (season, key, compute) => compute(s),
  };
  return s;
}

export class MissingKeyError extends Error {
  /** @param {string} id */
  constructor(id) {
    super(`No day key yet for ${id}`);
    this.name = 'MissingKeyError';
    this.id = id;
  }
}

/**
 * @typedef {{ streams: Record<string, string>, values: Record<string, any> }} KeyBook  Day keys merged: stream id → its
 *   seed (hex), value id → its value.
 */

/** @param {KeyBook} book @returns {Streams} */
export function keyStreams(book) {
  return {
    kind: 'keys',
    rng: (season, key) => {
      const id = streamId(season, key);
      const hex = book.streams[id];
      if (hex === undefined) throw new MissingKeyError(id);
      return createRng(hex);
    },
    value: (season, key) => {
      const id = streamId(season, key);
      if (!(id in book.values)) throw new MissingKeyError(id);
      return book.values[id];
    },
  };
}

/**
 * @param {Streams & { kind: 'seed' }} inner  Only a seed's streams can be recorded (they're what a key publishes).
 * @param {string} seed  The same seed, to write each stream's hash.
 * @param {(kind: 'stream' | 'value', id: string, published: any) => void} onUse
 * @returns {Streams}
 */
export function recordingStreams(inner, seed, onUse) {
  return {
    kind: 'seed',
    rng: (season, key) => {
      onUse('stream', streamId(season, key), streamHash(seed, season, key));
      return inner.rng(season, key);
    },
    value: (season, key, compute) => {
      const v = inner.value(season, key, compute);
      onUse('value', streamId(season, key), v);
      return v;
    },
  };
}

/** The league's streams, kept beside it so the league itself stays plain data (saved, sent, diffed). @type {WeakMap<object, Streams>} */
const attached = new WeakMap();

/** @param {object} league @param {Streams} streams */
export function attachStreams(league, streams) {
  attached.set(league, streams);
}

/**
 * The streams a league was made with. A league copied as plain data (a test's clone, a snapshot) has none attached: one
 * with a seed gets its seed's streams back; one played from day keys must have them attached again.
 * @param {{ seed?: string }} league @returns {Streams}
 */
export function streamsOf(league) {
  let s = attached.get(league);
  if (!s) {
    if (!league.seed || league.seed === 'keys') throw new Error('This league was played from day keys: attach them again (attachStreams)');
    attached.set(league, (s = seedStreams(league.seed)));
  }
  return s;
}

/** Merge day keys into one book. @param {{ streams?: Record<string, string>, values?: Record<string, any> }[]} keys @returns {KeyBook} */
export function mergeKeys(keys) {
  /** @type {KeyBook} */
  const book = { streams: {}, values: {} };
  for (const k of keys) {
    Object.assign(book.streams, k.streams);
    Object.assign(book.values, k.values);
  }
  return book;
}
