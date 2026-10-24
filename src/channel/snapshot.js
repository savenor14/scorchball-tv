// Snapshots (the launch, Task 272; docs/live.md §5): the live league as it stands the moment a season starts (Monday
// 00:00), saved, so a browser loads the latest and plays only the current week instead of every season since the
// first. snapshots/s<season>.json, made by npm run daykey with the day keys. Viewers see no difference: the chronicle,
// the records, the facts and last season's matches (Monday's re-airs) are all in it. Pure; no DOM.
import { pack, unpack } from '../pack.js';
import { sha256 } from '../sim/sha256.js';
import { LiveLeague } from './liveLeague.js';

/** The format; a snapshot of another is refused (the channel then builds from the day keys). */
export const SNAPSHOT_VERSION = 1;

/** A season's snapshot file. @param {number} season */
export const snapshotPath = (season) => `snapshots/s${season}.json`;

/**
 * @typedef {object} Snapshot
 * @property {number} version
 * @property {number} season  The season it starts.
 * @property {number} at  The moment it was taken (epoch ms): just before the season's first day.
 * @property {import('../sim/streams.js').KeyBook} keys  The day keys' entries for this season and the last made before it
 *   (the season's lots, its schedule): what the week asks for that its own days' keys don't hold.
 * @property {import('../pack.js').Packed} state  LiveLeague.saveState, packed; the league's seed scrubbed.
 */

/**
 * The live league as a snapshot. Taken from a league played from its seed (npm run daykey), so the seed is scrubbed.
 * @param {LiveLeague} live @param {number} season  The season starting at the moment the league stands at.
 * @param {import('../sim/streams.js').KeyBook} [keys]  This season's and last season's day-key entries, published so far.
 * @returns {Snapshot}
 */
export function takeSnapshot(live, season, keys = { streams: {}, values: {} }) {
  const state = live.saveState();
  return { version: SNAPSHOT_VERSION, season, at: live.now, keys, state: pack({ ...state, league: { ...state.league, seed: 'keys' } }) };
}

/**
 * A live league carried on from a snapshot to `now`.
 * @param {import('../config.js').Config} config @param {Snapshot} snap
 * @param {{ now: number, streams?: import('../sim/streams.js').Streams, seed?: string }} o  The day keys' streams (or a
 *   seed's, in the tests).
 */
export function restoreLive(config, snap, { now, streams, seed }) {
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`Snapshot version ${snap.version}, not ${SNAPSHOT_VERSION}`);
  return new LiveLeague(config, { now, streams, seed, restore: unpack(snap.state) });
}

/**
 * A match's fingerprint (Task 272, the history check): a hash of every event in it. The day keys record each match's as
 * it's first played; a publish plays them again with its code and must get the same.
 * @param {{ events: readonly any[] }} m
 */
export const matchFingerprint = (m) => sha256(JSON.stringify(m.events)).slice(0, 24);

/**
 * The entries of a key book for the given seasons (a snapshot's `keys`).
 * @param {import('../sim/streams.js').KeyBook} book @param {number[]} seasons
 * @returns {import('../sim/streams.js').KeyBook}
 */
export function keysForSeasons(book, seasons) {
  const keep = (/** @type {string} */ id) => seasons.some((s) => id.startsWith(`s${s}|`));
  return {
    streams: Object.fromEntries(Object.entries(book.streams).filter(([id]) => keep(id))),
    values: Object.fromEntries(Object.entries(book.values).filter(([id]) => keep(id))),
  };
}
