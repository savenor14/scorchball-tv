// A league's fingerprint (the launch, Task 270): a few seasons from a seed, every event hashed in order. Two engines
// that give the same fingerprint played the same league to the last event. The publish step writes Node's into
// dist/check.json and check.html compares the browser's with it (docs/live.md §6). Browser-safe.
import { EventLog } from '../chronicle/eventLog.js';
import { createLeague } from './league.js';
import { runOffseason } from './offseason.js';
import { runSeason } from './season.js';

/** The check's seed and length: a throwaway seed, never the live one. */
export const CHECK = { seed: 'every-browser-alike', seasons: 6 };

/**
 * @param {import('../config.js').Config} config
 * @param {{ seed: string, seasons: number }} [options]
 * @returns {{ seed: string, seasons: number, events: number, hash: string }}
 */
export function leagueFingerprint(config, { seed, seasons } = CHECK) {
  // FNV-1a, 32 bits twice (two offsets), over each event as JSON: JSON's numbers are exact in every engine.
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  let events = 0;
  const log = new EventLog({
    sinks: [(event) => {
      const s = JSON.stringify(event);
      for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193);
        b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 15);
      }
      events += 1;
    }],
  });
  const league = createLeague(config, seed, log);
  for (let i = 0; i < seasons; i++) runOffseason(league, config, log, runSeason(league, config, log));
  const hex = (/** @type {number} */ n) => (n >>> 0).toString(16).padStart(8, '0');
  return { seed, seasons, events, hash: hex(a) + hex(b) };
}
