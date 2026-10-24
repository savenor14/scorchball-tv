// Highlights packages: the clips that tell a finished match's story. Pure and DOM-free. See docs/channel.md §7.
// Every goal and any shootout are always in; the biggest other moments (hot shots, saves, burns, blocks, misses) fill
// up to settings.highlights.maxClips. Each clip runs from leadMs before its moment to tailMs after (on screen, so ×speed
// in match time), never reaching back past the start of its half. Overlapping clips merge. Clips play in match order.

/**
 * @typedef {object} Clip
 * @property {number} from  Match elapsed ms where the clip starts.
 * @property {number} to    Where it ends.
 */

/** How much each kind of moment matters (lower first). */
const RANK = Object.freeze({ goal: 0, shootout: 0, hotShot: 1, save: 2, burn: 3, block: 4, miss: 5 });

/**
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ speed: number, maxClips: number, leadMs: number, tailMs: number }} options  settings.highlights
 * @returns {Clip[]}  In match order; empty only for a match with no moments at all.
 */
export function highlightClips(timeline, { speed, maxClips, leadMs, tailMs }) {
  const ev = timeline.events;
  /** @type {{ at: number, rank: number, from?: number }[]} */
  const moments = [];
  ev.forEach(({ event, at }) => {
    if (event.type === 'goal') moments.push({ at, rank: RANK.goal });
    else if (event.type === 'burn') moments.push({ at, rank: RANK.burn });
    else if (event.type === 'save' || event.type === 'block' || event.type === 'miss') {
      const shot = ev.find((t) => t.at === at && t.event.type === 'shot');
      const hot = Boolean(/** @type {any} */ (shot?.event.data)?.hot);
      moments.push({ at, rank: hot ? RANK.hotShot : RANK[event.type] });
    }
  });
  // A shootout is one clip, from just before the first kick to just after the last.
  const kicks = ev.filter((t) => t.event.type === 'shootout_kick');
  if (kicks.length) moments.push({ at: kicks[kicks.length - 1].at, rank: RANK.shootout, from: kicks[0].at - leadMs * speed });

  const kickoffs = ev.filter((t) => t.event.type === 'kickoff').map((t) => t.at);
  const halfStart = (/** @type {number} */ at) => kickoffs.filter((k) => k <= at).at(-1) ?? 0;
  const always = moments.filter((m) => m.rank === RANK.goal).length; // goals and the shootout
  const chosen = [...moments].sort((a, b) => a.rank - b.rank || a.at - b.at).slice(0, Math.max(maxClips, always));
  const clips = chosen
    .map((m) => ({
      from: Math.max(m.from ?? m.at - leadMs * speed, m.from !== undefined ? 0 : halfStart(m.at)),
      to: Math.min(m.at + tailMs * speed, timeline.duration),
    }))
    .sort((a, b) => a.from - b.from);

  /** @type {Clip[]} */
  const merged = [];
  for (const c of clips) {
    const last = merged.at(-1);
    if (last && c.from <= last.to) last.to = Math.max(last.to, c.to);
    else merged.push({ ...c });
  }
  return merged;
}

/** A package's length on screen, in real ms. @param {Clip[]} clips @param {number} speed */
export const packageMs = (clips, speed) => clips.reduce((s, c) => s + (c.to - c.from), 0) / speed;

/**
 * `n` of `list` spread evenly through it, in its order (all of it if it has no more).
 * @template T @param {T[]} list @param {number} n @returns {T[]}
 */
export function spread(list, n) {
  if (list.length <= n) return list;
  return Array.from({ length: n }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / n)]);
}

/**
 * The PLAYOFF PREVIEW show's GOALS OF THE SEASON reel (the big matches promoted, Tom 2026-10-17): scorchers first, then
 * the other goals, each spread through the season so it isn't all one week, `n` clips at most.
 * @template M
 * @param {M[]} matches  The regular season, in play order. @param {number} n
 * @param {(m: M) => import('./timeline.js').Timeline} timelineOf @param {{ speed: number, leadMs: number, tailMs: number }} options
 */
export function seasonReelClips(matches, n, timelineOf, options) {
  const scorchers = reelClips(matches, 'scorchers', timelineOf, options);
  const key = (/** @type {{ match: M, from: number }} */ c) => `${/** @type {any} */ (c.match).id}|${c.from}`;
  const taken = new Set(scorchers.map(key));
  // Other goals: those not already in a scorcher's clip.
  const others = reelClips(matches, 'goals', timelineOf, options).filter((c) => !taken.has(key(c)) && !scorchers.some((s) => s.match === c.match && c.from < s.to && s.from < c.to));
  const first = spread(scorchers, n);
  return [...first, ...spread(others, n - first.length)];
}

/**
 * @typedef {'goals' | 'saves' | 'scorchers'} ReelKind
 * @typedef {{ match: any, from: number, to: number }} ReelClip  A clip of one of the reel's matches.
 */

/**
 * A reel's clips (Task 213, Tom): one kind of moment across several matches (the night after the final: the
 * playoffs'), in the matches' order and each match's own. goals: every goal, golden goals included; saves: the saves
 * off hot shots (the big ones: there are about sixty saves in a playoffs); scorchers: every scorcher, golden or not.
 * Each clip as in a package (leadMs before, tailMs after, never back past the start of its half); a match's
 * overlapping clips merge.
 * @template M
 * @param {M[]} matches  In the order they were played.
 * @param {ReelKind} kind
 * @param {(m: M) => import('./timeline.js').Timeline} timelineOf
 * @param {{ speed: number, leadMs: number, tailMs: number }} options  settings.highlights
 * @returns {{ match: M, from: number, to: number }[]}
 */
export function reelClips(matches, kind, timelineOf, { speed, leadMs, tailMs }) {
  return matches.flatMap((match) => {
    const timeline = timelineOf(match);
    const ev = timeline.events;
    const kickoffs = ev.filter((t) => t.event.type === 'kickoff').map((t) => t.at);
    const halfStart = (/** @type {number} */ at) => kickoffs.filter((k) => k <= at).at(-1) ?? 0;
    const moments = ev.filter(({ event, at }) => {
      const data = /** @type {any} */ (event.data);
      if (kind === 'goals') return event.type === 'goal';
      if (kind === 'scorchers') return event.type === 'goal' && Boolean(data?.scorcher);
      return event.type === 'save' && Boolean(/** @type {any} */ (ev.find((t) => t.at === at && t.event.type === 'shot')?.event.data)?.hot);
    }).map(({ at }) => at);
    /** @type {{ match: M, from: number, to: number }[]} */
    const merged = [];
    for (const at of moments) {
      const from = Math.max(at - leadMs * speed, halfStart(at));
      const to = Math.min(at + tailMs * speed, timeline.duration);
      const last = merged.at(-1);
      if (last && from <= last.to) last.to = Math.max(last.to, to);
      else merged.push({ match, from, to });
    }
    return merged;
  });
}
