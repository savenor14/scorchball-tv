// Transitions between pictures (Tasks 95, 97; docs/channel.md §16.10). Pure and DOM-free: worked out from the
// programme's segment edges, so they never move a segment's time and every screen draws the same frame.
//   into_scene    stadium → the scene, the desk or the interview: the glass sweep, over the stadium's last sceneMs
//   out_of_scene  the scene or the interview → stadium: the glass sweep, over the stadium's first sceneMs
//                 (Task 97: both sweeps run on the stadium side of the edge, where the stadium is drawn anyway and the
//                 scene, cheap to draw, is laid over the part the sweep has or hasn't reached yet)
//   cut           the desk ↔ the interview set, and into and out of the opening ident (Task 106): the diagonal band,
//                 cutMs, centred on the edge
//   clip_sting    between two clips of a highlights package: the band, clipStingMs, centred on the cut
//   open_sting    into a highlights package: the band covers just before it starts, holds on the match's name, and
//                 uncovers its first clip, openStingSeconds after the start (no sweep there)
// Sweeps report `p` (0 → 1, the sweep's progress); bands report `q` (0 → 1, fully covering at 0.5).

/**
 * @typedef {import('./programme.js').Segment} Segment
 * @typedef {'stadium' | 'scene' | 'interview' | 'ident'} Picture
 * @typedef {'into_scene' | 'out_of_scene' | 'cut' | 'clip_sting' | 'open_sting'} TransitionKind
 * @typedef {{ kind: TransitionKind, p: number, q: number, edge: number, match: import('./liveLeague.js').LiveMatch | null, title: boolean, reel?: import('./programme.js').Reel }} Transition
 *   p: the sweep's progress (0 → 1); q: how far the band is through (0.5 fully covering, the moment of the cut); edge:
 *   when the picture changes; match: the package's match for an opening sting; title: show its name (the band is down);
 *   reel: a reel's (Task 213), named instead of the match.
 */

/**
 * What a segment puts on screen: the stadium (matches, ceremonies, the pre-match and full-time cards, highlights), the
 * scene (talk, studio cards, ads, the champions, the off-season), the interview set, or the opening ident (its own
 * picture since Task 106, so a band cuts into it and out of it to the welcome).
 * @param {Segment} seg
 * @returns {Picture}
 */
export function pictureOf(seg) {
  switch (seg.kind) {
    case 'talk': case 'studio': case 'ads': case 'champion': case 'award': case 'farewell': case 'lottery': case 'draft': case 'moves': return 'scene';
    // The countdown leads into the ident on the same picture (Task 277b), no band between them.
    case 'ident': case 'countdown': return 'ident';
    case 'potm': return 'interview';
    case 'reair': return seg.part === 'interview' ? 'interview' : 'stadium';
    // OFF THE BALL's day's goals play on the booth's screen (podcastBooth.js), the booth staying on.
    case 'highlights': return seg.podcast ? 'scene' : 'stadium';
    default: return 'stadium';
  }
}

/**
 * The transition from one segment to the next, if their pictures differ. Into highlights there's none: the opening
 * sting covers it.
 * @param {Segment} a @param {Segment} b
 * @returns {'into_scene' | 'out_of_scene' | 'cut' | null}
 */
export function transitionBetween(a, b) {
  const pa = pictureOf(a);
  const pb = pictureOf(b);
  if (pa === pb || b.kind === 'highlights') return null;
  if (pa === 'stadium') return 'into_scene';
  if (pb === 'stadium') return 'out_of_scene';
  return 'cut';
}

/** The band out of OFF THE BALL into the studio (Tom, 2026-10-21), its name up as a package's is. */
const BACK_TO_STUDIO = /** @type {import('./programme.js').Reel} */ ({ kind: 'studio', head: 'OFF THE BALL', title: 'BACK TO THE STUDIO', season: 0, sub: '' });
/**
 * Whether going from `a` to `b` leaves OFF THE BALL for the studio (a talk, cards; an ad break has its own bumper, a
 * match or a re-air its sweep).
 * @param {Segment | null} a @param {Segment | null} b
 */
const backToStudio = (a, b) => Boolean(a && b && 'podcast' in a && a.podcast && a.kind === 'talk' && !('podcast' in b && b.podcast) && pictureOf(b) === 'scene' && b.kind !== 'ads');

/**
 * The transition on screen at `t`, if any.
 * @param {(t: number) => Segment} at  The programme.
 * @param {number} t
 * @param {{ sceneMs: number, clipStingMs: number, openStingSeconds: number, cutMs: number }} s  settings.transitions
 * @returns {Transition | null}
 */
export function transitionAt(at, t, s) {
  const now = at(t);
  const half = s.clipStingMs / 2;
  const openMs = s.openStingSeconds * 1000;
  /** @param {TransitionKind} kind @param {Partial<Transition>} o @returns {Transition} */
  const make = (kind, o) => ({ kind, p: 0, q: 0, edge: t, match: null, title: false, ...o });
  /**
   * The opening sting's band, `into` ms from the start of its window (half a sting before the package, to openMs
   * after): sweeping in, holding with the name up, sweeping out.
   * @param {number} into @param {number} edge @param {import('./liveLeague.js').LiveMatch} match @param {import('./programme.js').Reel} [reel]
   */
  const opening = (into, edge, match, reel) => {
    const total = half + openMs;
    const q = into < half ? (0.5 * into) / half : into > total - half ? 0.5 + (0.5 * (into - (total - half))) / half : 0.5;
    return make('open_sting', { q, edge, match, title: into >= half && into <= total - half, ...(reel ? { reel } : {}) });
  };

  // ...and its lift, onto the studio.
  if ('from' in now && half > 0 && t - now.from < half && backToStudio(at(now.from - 1), now)) return opening(openMs + (t - now.from), now.from, /** @type {any} */ (null), BACK_TO_STUDIO);
  if (now.kind === 'highlights' && !now.podcast) {
    if (half > 0 && t - now.from < openMs) return opening(t - now.from + half, now.from, now.match, now.reel);
    if (half > 0 && now.clip > 0 && t - now.clipFrom < half) return make('clip_sting', { q: 0.5 + (t - now.clipFrom) / s.clipStingMs, edge: now.clipFrom });
    if (half > 0 && now.clip < now.clips - 1 && now.clipUntil - t <= half) return make('clip_sting', { q: 0.5 - (now.clipUntil - t) / s.clipStingMs, edge: now.clipUntil });
  }
  if ('until' in now) {
    // Never look past a kick-off: the walk-out runs straight into the match, and until the league reaches the kick-off
    // the programme can't see that match (it hasn't been played), so it would answer with the scene after it and
    // sweep over the end of the walk-out (Tom found this, 2026-10-05).
    const next = now.until > t && now.kind !== 'walk_out' ? at(now.until) : null;
    // Just before a package: its opening sting's band comes down.
    if (next && next.kind === 'highlights' && !next.podcast && half > 0 && now.until - t <= half) return opening(half - (now.until - t), now.until, next.match, next.reel);
    // Leaving OFF THE BALL for the studio: the band down and its name up in the show's last moments, kept quiet for it
    // (podcastScript's outro); it lifts off onto the studio, gone before the studio's first line (Tom, 2026-10-21: held
    // over the studio it cut that line off; lifting off the booth it cut back to the booth).
    if (next && backToStudio(now, next) && half > 0 && now.until - t <= openMs) return opening(openMs - (now.until - t), now.until, /** @type {any} */ (null), BACK_TO_STUDIO);
    const kind = next ? transitionBetween(now, next) : null;
    // The last sceneMs of the stadium before the scene: the sweep lays the scene over it.
    if (kind === 'into_scene' && now.until - t <= s.sceneMs) return make('into_scene', { p: 1 - (now.until - t) / s.sceneMs, edge: now.until });
    if (kind === 'cut' && now.until - t <= s.cutMs / 2) return make('cut', { q: 0.5 - (now.until - t) / s.cutMs, edge: now.until });
  }
  // Just after an edge: the stadium's first sceneMs after the scene, or the second half of a cut.
  const reach = Math.max(s.sceneMs, s.cutMs / 2);
  const before = at(t - reach);
  // (Segments are never shorter than a sweep, so the one `reach` ago is the one just before the edge.)
  if ('until' in before && before.until <= t && before.until > t - reach) {
    const kind = transitionBetween(before, now);
    if (kind === 'out_of_scene' && t - before.until < s.sceneMs) return make('out_of_scene', { p: (t - before.until) / s.sceneMs, edge: before.until });
    if (kind === 'cut' && t - before.until < s.cutMs / 2) return make('cut', { q: 0.5 + (t - before.until) / s.cutMs, edge: before.until });
  }
  return null;
}
