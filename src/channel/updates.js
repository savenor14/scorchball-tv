// How an update reaches viewers (the launch, Task 274; docs/live.md §3). A browser has new code only once the page
// loads again, so the channel checks version.json (written by npm run publish) every few minutes. A new version: a
// channel that's hidden or silent reloads by itself (it works out what's on from the clock, so it comes back at the
// same moment, its layout kept); one playing sound shows UPDATE READY instead, never reloading under the viewer, since
// a browser won't play sound after a reload until it's clicked. And switches: a change published early, dormant until
// its moment ("from 2026-11-02 00:00" in settings), on everywhere at once. Pure but for the browser helpers at the end.
import { SWITCH_TIME } from '../util.js';
import { zoneOffsets } from './calendar.js';

/**
 * What to do about a new version.
 * @param {{ hidden: boolean, soundOn: boolean }} o
 * @returns {'reload' | 'notice'}
 */
export const updateAction = ({ hidden, soundOn }) => (hidden || !soundOn ? 'reload' : 'notice');

/** @type {WeakMap<object, Map<string, number>>} Each config's switches as instants, worked out once. */
const instants = new WeakMap();

/**
 * Whether a switch is on at moment `t`: on from its time (settings.switches) in the league's zone; a switch not listed
 * is off. Every screen agrees, since it's the league's clock, not the viewer's.
 * @param {import('../config.js').Config} config @param {string} name @param {number} t  Epoch ms.
 */
export function switchedOn(config, name, t) {
  let map = instants.get(config);
  if (!map) {
    const zone = zoneOffsets(config.settings.live.timeZone);
    map = new Map();
    for (const [key, when] of Object.entries(config.settings.switches ?? {})) {
      if (key.startsWith('_')) continue;
      const m = SWITCH_TIME.exec(when);
      if (!m) throw new Error(`settings.switches.${key}: "${when}" is not a time like "2026-11-02 00:00"`);
      const [, y, mo, d, h, mi] = m.map(Number);
      map.set(key, zone.wallToInstant(Date.UTC(y, mo - 1, d, h, mi)));
    }
    instants.set(config, map);
  }
  const at = map.get(name);
  return at !== undefined && t >= at;
}

/** Where the channel notes what to carry over a reload of its own (sessionStorage: this tab only). */
const RESUME_KEY = 'scorchball.resume';

/**
 * Reload for an update, noting the layout and whether sound was on, so the channel comes back as it was (sound waits
 * for a click: browsers allow it only then).
 * @param {{ layout: 'full' | 'broadcast', sound: boolean }} keep
 */
export function reloadForUpdate(keep) {
  try {
    sessionStorage.setItem(RESUME_KEY, JSON.stringify(keep));
  } catch {
    // Storage blocked (a private window): it comes back in Full, silent.
  }
  location.reload();
}

/**
 * What the last reload for an update kept, once (it's forgotten as it's read); null after an ordinary load.
 * @returns {{ layout: 'full' | 'broadcast', sound: boolean } | null}
 */
export function resumed() {
  try {
    const text = sessionStorage.getItem(RESUME_KEY);
    sessionStorage.removeItem(RESUME_KEY);
    const kept = text ? JSON.parse(text) : null;
    return kept && (kept.layout === 'full' || kept.layout === 'broadcast') ? { layout: kept.layout, sound: Boolean(kept.sound) } : null;
  } catch {
    return null;
  }
}

/** The published version (version.json), or null where there's none (the dev server). */
export async function fetchVersion() {
  try {
    const res = await fetch('version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const { version } = await res.json();
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}
