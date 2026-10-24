// Viewers on the Director's desk (Task 277e; docs/director.md §8): the channel's hellos (a visit's random id, its viewer
// a short tag of a salted hash of the connection) turned into the desk's figures: unique viewers each day and over the
// week, how many are watching now, and how long a visit typically lasts. Pure; no DOM.

/**
 * @typedef {{ viewer: string, firstAt: string, lastAt: string, from?: string | null }} Visit  One page load: when it was first
 *   and last heard, and the link it came in by (`?from=`; docs/launch-plan.md), if tagged.
 * @typedef {object} ViewerStats
 * @property {number} watching  Viewers heard from within watchingMinutes.
 * @property {{ day: string, viewers: number, visits: number }[]} days  The last `days` days, newest first, in the league's
 *   time zone ("MON 12 OCT"), each visit on the day it began.
 * @property {number} week  Unique viewers over those days.
 * @property {number} visits  Visits over those days.
 * @property {number | null} typicalMinutes  The median visit's length, whole minutes (null without visits).
 * @property {SourceRow[]} sources  Where the week's visits came in, the most visits first (getting the word out).
 * @typedef {object} SourceRow
 * @property {string} from  The link's tag, or "direct" for an untagged visit.
 * @property {number} visits
 * @property {number} viewers  Households.
 * @property {number | null} typicalMinutes  The median visit's length, whole minutes.
 * @property {number} cameBack  Of those households, how many came back on a later day (any way in).
 */

/**
 * The dev server's hellos (output/audience/hellos.jsonl) as visits: grouped by visit, first and last heard.
 * @param {{ at: string, session: string, viewer: string, from?: string }[]} hellos
 * @returns {Visit[]}
 */
export function visitsFromHellos(hellos) {
  /** @type {Map<string, Visit>} */
  const bySession = new Map();
  for (const h of hellos) {
    const v = bySession.get(h.session);
    if (!v) bySession.set(h.session, { viewer: h.viewer, firstAt: h.at, lastAt: h.at, from: h.from ?? null });
    else {
      if (h.at < v.firstAt) v.firstAt = h.at;
      if (h.at > v.lastAt) v.lastAt = h.at;
      v.from ??= h.from ?? null;
    }
  }
  return [...bySession.values()];
}

/**
 * The desk's figures.
 * @param {Visit[]} visits @param {number} now  Epoch ms.
 * @param {{ timeZone: string, watchingMinutes: number, days?: number }} o
 * @returns {ViewerStats}
 */
export function viewerStats(visits, now, { timeZone, watchingMinutes, days = 7 }) {
  const dayOf = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
  const label = (/** @type {number} */ t) => dayOf.format(t).replace(',', '').toUpperCase();
  const labels = Array.from({ length: days }, (_, i) => label(now - i * 86_400_000));
  // Only visits begun on one of those days (by their label: daylight saving can't misplace one).
  const inWeek = visits.filter((v) => labels.includes(label(Date.parse(v.firstAt))) && Date.parse(v.firstAt) > now - (days + 1) * 86_400_000);
  const perDay = labels.map((day) => {
    const those = inWeek.filter((v) => label(Date.parse(v.firstAt)) === day);
    return { day, viewers: new Set(those.map((v) => v.viewer)).size, visits: those.length };
  });
  const watching = new Set(visits.filter((v) => now - Date.parse(v.lastAt) <= watchingMinutes * 60_000).map((v) => v.viewer)).size;
  const lengths = inWeek.map((v) => (Date.parse(v.lastAt) - Date.parse(v.firstAt)) / 60_000).sort((a, b) => a - b);
  const median = medianOf(lengths);
  return {
    watching,
    days: perDay,
    week: new Set(inWeek.map((v) => v.viewer)).size,
    visits: inWeek.length,
    typicalMinutes: median === null ? null : Math.round(median),
    sources: sourcesOf(inWeek, visits, label),
  };
}

/** The middle of sorted numbers, or null for none. @param {number[]} sorted */
function medianOf(sorted) {
  const mid = sorted.length >> 1;
  return sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Where the week's visits came in (`?from=`; docs/launch-plan.md): by tag, untagged as "direct", with the households,
 * a typical visit and how many of those households came back on a later day (by any way in, any visit kept).
 * @param {Visit[]} inWeek @param {Visit[]} all @param {(t: number) => string} label  A day's label in the league's zone.
 * @returns {SourceRow[]}
 */
function sourcesOf(inWeek, all, label) {
  /** @type {Map<string, Visit[]>} */
  const by = new Map();
  for (const v of inWeek) {
    const from = v.from ?? 'direct';
    by.set(from, [...(by.get(from) ?? []), v]);
  }
  return [...by].map(([from, vs]) => {
    const lengths = vs.map((v) => (Date.parse(v.lastAt) - Date.parse(v.firstAt)) / 60_000).sort((a, b) => a - b);
    const median = medianOf(lengths);
    // A household came back if any visit of theirs began on a later day than their first visit this way.
    const first = new Map();
    for (const v of vs) if (!first.has(v.viewer) || v.firstAt < first.get(v.viewer)) first.set(v.viewer, v.firstAt);
    const cameBack = [...first].filter(([viewer, at]) => all.some((w) => w.viewer === viewer && w.firstAt > at && label(Date.parse(w.firstAt)) !== label(Date.parse(at)))).length;
    return { from, visits: vs.length, viewers: first.size, typicalMinutes: median === null ? null : Math.round(median), cameBack };
  }).sort((a, b) => b.visits - a.visits || a.from.localeCompare(b.from));
}

/**
 * @typedef {object} ViewerRow  One viewer over the week, for the desk's list (Task 278: Tom marks his own).
 * @property {string} viewer  The tag.
 * @property {number} visits
 * @property {number} minutes  Their visits' lengths added up, whole minutes.
 * @property {string} lastAt  Last heard.
 * @property {boolean} watching  Heard from within watchingMinutes.
 */

/**
 * The week's viewers, most watched first: the same visits viewerStats counts (begun in the last `days` days).
 * @param {Visit[]} visits @param {number} now @param {{ watchingMinutes: number, days?: number }} o
 * @returns {ViewerRow[]}
 */
export function viewerList(visits, now, { watchingMinutes, days = 7 }) {
  /** @type {Map<string, ViewerRow>} */
  const rows = new Map();
  for (const v of visits) {
    if (Date.parse(v.lastAt) <= now - (days + 1) * 86_400_000) continue;
    const row = rows.get(v.viewer) ?? { viewer: v.viewer, visits: 0, minutes: 0, lastAt: v.lastAt, watching: false };
    row.visits++;
    row.minutes += (Date.parse(v.lastAt) - Date.parse(v.firstAt)) / 60_000;
    if (v.lastAt > row.lastAt) row.lastAt = v.lastAt;
    row.watching ||= now - Date.parse(v.lastAt) <= watchingMinutes * 60_000;
    rows.set(v.viewer, row);
  }
  return [...rows.values()].map((r) => ({ ...r, minutes: Math.round(r.minutes) })).sort((a, b) => b.minutes - a.minutes);
}

/**
 * The live site's figures without Tom's own tags (Task 278), and the week's list with his marked.
 * @param {Visit[]} visits @param {Set<string>} me @param {number} now
 * @param {{ timeZone: string, watchingMinutes: number, days?: number }} o
 */
export function withoutMine(visits, me, now, o) {
  return {
    stats: viewerStats(visits.filter((v) => !me.has(v.viewer)), now, o),
    list: viewerList(visits, now, o).map((r) => ({ ...r, me: me.has(r.viewer) })),
  };
}
