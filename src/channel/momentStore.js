// Where MOMENTS are kept (Milestone 5¾; docs/channel.md §25), and Fan Coins (§29, with their own data's shape): this browser's localStorage, under
// settings.moments.storageKey, as JSON (moments.js MomentData). Every read and write is guarded: in a private window or
// with site data blocked the channel runs on with moments kept for the visit only (Tom, 2026-10-12: the pane says so).
// Saves are gathered (at most one a few seconds) and made at once when the page is hidden or closed. The browser isn't
// asked to keep the site's data for good (navigator.storage.persist): Firefox turns that into a permission pop-up on
// arrival, which looks suspicious, for a rare case (Tom, 2026-10-12: removed).
import { normalizeData } from './moments.js';

/** How long changes wait before they're saved, ms. */
const SAVE_MS = 3000;

/**
 * @param {string} key
 * @param {{ storage?: Storage | null, doc?: Document | null, win?: Window | null, normalize?: (raw: any) => any }} [env]  For tests: the storage, and
 *   the page whose hiding saves at once. normalize: what's kept, made safe (Fan Coins' own, fanCoins.js; MOMENTS' by default).
 */
export function createMomentStore(key, env = {}) {
  const storage = 'storage' in env ? env.storage : browserStorage();
  const doc = 'doc' in env ? env.doc : globalThis.document ?? null;
  const win = 'win' in env ? env.win : globalThis.window ?? null;
  const normalize = env.normalize ?? normalizeData;
  const data = normalize(read());
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;

  function read() {
    try {
      const text = storage?.getItem(key);
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  /** Save now. @returns {boolean} Whether it was kept. */
  function save() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    try {
      if (!storage) return false;
      storage.setItem(key, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  doc?.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden' && timer !== null) save(); });
  win?.addEventListener('pagehide', () => { if (timer !== null) save(); });

  return {
    data,
    /** Whether this browser keeps them (false in a private window or with storage blocked). */
    get kept() { return !!storage; },
    /** Something changed: save soon. */
    changed() {
      if (timer === null) timer = setTimeout(save, SAVE_MS);
    },
    save,
    /** Start afresh (the dev tools). */
    reset() {
      const fresh = normalize(null);
      for (const k of /** @type {(keyof typeof data)[]} */ (Object.keys(data))) /** @type {any} */ (data)[k] = fresh[k];
      save();
    },
  };
}

/** localStorage, or null where it's blocked (a private window, cleared site data). */
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
