// The TV guide (Task 115; docs/channel.md §17.2): today's programmes, midnight to midnight, the way a TV guide lists
// them. Pure and DOM-free: built from the same programme as the channel and `npm run rundown`, so every screen lists
// the same day. A live match runs from its pre-match card to the end of its post-match show, a re-air from its intro to
// its interview, a highlights package is one line, and the talk, cards and ads between them are one studio block.
// Nothing is given away: no scores, and the final's teams only once both semifinals have finished on screen.
import { LiveLeague } from './liveLeague.js';
import { createProgramme } from './programme.js';
import { restoreLive } from './snapshot.js';
import { JINGLE_TALKS } from './talk.js';

const DAY_MIN = 1440;
const MIN = 60_000;
/** The parts of a live match before its full-time card (the post-match show's parts carry `show`). */
const MATCH_PARTS = Object.freeze(['pre_match', 'walk_out', 'live', 'handshakes']);

/**
 * @typedef {'live' | 'reair' | 'highlights' | 'studio' | 'opening' | 'champions' | 'awards' | 'offseason' | 'preview' | 'grounds' | 'vault' | 'podcast'} EntryKind
 *   podcast: OFF THE BALL (docs/podcast.md), an episode one line in gold, REP when it airs again.
 *   vault: FROM THE VAULT (Tom's note 14), its cards and reel one line, in the replays' blue.
 *   grounds: AROUND THE GROUNDS (Tom's note 14), the whole tour one line.
 *   preview: the PLAYOFF PREVIEW show (the big matches promoted, Tom 2026-10-17), its cards, desk and reels one line;
 *   FINALS PREVIEW's too (2026-10-18), its title FINALS PREVIEW.
 * @typedef {object} Entry  One line of the guide.
 * @property {EntryKind} kind
 * @property {number} from  Epoch ms.
 * @property {number} until
 * @property {boolean} [repeat]  The off-season show repeated (Task 195): champions, awards and off-season entries; an
 *   OFF THE BALL episode aired again.
 * @property {string} [homeId]  The teams, for a match (live, re-air or highlights).
 * @property {string} [awayId]
 * @property {'regular' | 'semifinal' | 'final'} [stage]
 * @property {number} [played]  When a re-aired or highlighted match was played (its kick-off).
 * @property {number} [kickoff]  A live match's kick-off: the time the guide lists, as the ticker and GAMES do (the entry
 *   itself runs from its pre-match card).
 * @property {string} [matchId]
 * @property {boolean} [round]  A live entry that's the final round's matches at once (listed as the round, not one pairing).
 * @property {string} [title]  A reel's name (Task 213): a highlights entry of the playoffs' moments, not one match's.
 * @typedef {{ from: number, until: number, entries: Entry[] }} GuideDay
 */

/**
 * Midnight to midnight (the league's time zone) around `t`.
 * @param {import('./calendar.js').Calendar} calendar @param {number} t
 */
export function dayAround(calendar, t) {
  const season = calendar.seasonAt(t);
  const day = Math.floor((t - calendar.instant(season, 0)) / (DAY_MIN * MIN));
  // A day of 23 or 25 hours (the clocks changing) still ends at the next midnight.
  let from = calendar.instant(season, day * DAY_MIN);
  let to = calendar.instant(season, (day + 1) * DAY_MIN);
  if (t < from) { to = from; from = calendar.instant(season, (day - 1) * DAY_MIN); }
  if (t >= to) { from = to; to = calendar.instant(season, (day + 2) * DAY_MIN); }
  return { from, until: to };
}

/**
 * Group a day's programme pieces into the guide's entries.
 * @param {{ from: number, until: number, seg: any }[]} pieces  In order, each with the segment it shows.
 * @returns {Entry[]}
 */
export function groupEntries(pieces) {
  /** @type {Entry[]} */
  const entries = [];
  /** The live match whose post-match show may follow. @type {string | null} */
  let liveId = null;
  for (const { from, until, seg } of pieces) {
    const m = seg.match ?? seg.fixture ?? null;
    /** @type {Entry} */
    let e;
    // The PLAYOFF PREVIEW show (Tom: its own line, not STUDIO and HL), whatever its piece; FINALS PREVIEW likewise, named.
    if (seg.preview) e = { kind: 'preview', from, until, ...(seg.finals ? { title: 'FINALS PREVIEW' } : {}) };
    else if (seg.vault) e = { kind: 'vault', from, until };
    else if (seg.podcast) e = { kind: 'podcast', from, until, matchId: `podcast|${seg.podcast.season}|${seg.podcast.n}`, ...(seg.repeat ? { repeat: true } : {}) };
    else if (MATCH_PARTS.includes(seg.kind)) {
      // The final round's matches at once are one programme, whichever of them a piece names.
      const round = (seg.group?.length ?? 1) > 1;
      liveId = round ? `round|${m.kickoff}` : m.id;
      e = { kind: 'live', from, until, homeId: m.homeId, awayId: m.awayId, stage: m.stage, matchId: liveId, kickoff: m.kickoff, ...(round ? { round: true } : {}) };
    } else if (seg.show && liveId) e = { kind: 'live', from, until, matchId: liveId };
    else if (guideKind(seg) === 'reair') e = { kind: 'reair', from, until, homeId: m.homeId, awayId: m.awayId, stage: m.stage, played: m.kickoff, matchId: m.id };
    else if (seg.kind === 'highlights' && seg.reel) e = { kind: 'highlights', from, until, title: seg.reel.title, matchId: `reel|${seg.reel.kind}|${seg.from}` };
    else if (seg.kind === 'highlights') e = { kind: 'highlights', from, until, homeId: m.homeId, awayId: m.awayId, stage: m.stage, played: m.kickoff, matchId: m.id };
    else if (seg.kind === 'ident' || seg.kind === 'countdown' || (seg.kind === 'talk' && seg.topic === 'welcome')) e = { kind: 'opening', from, until };
    else if (seg.kind === 'champion') e = { kind: 'champions', from, until };
    else if (seg.kind === 'grounds') e = { kind: 'grounds', from, until };
    else if (guideKind(seg) === 'awards') e = { kind: 'awards', from, until };
    else if (guideKind(seg) === 'offseason') e = { kind: 'offseason', from, until };
    else e = { kind: 'studio', from, until };
    // The off-season show repeated through the night after it (Task 195): its parts listed as repeats.
    if (seg.repeat && (e.kind === 'champions' || e.kind === 'awards' || e.kind === 'offseason')) e.repeat = true;
    if (e.kind !== 'live') liveId = null;
    const last = entries.at(-1);
    if (last && last.kind === e.kind && Boolean(last.repeat) === Boolean(e.repeat) && (e.matchId === undefined || last.matchId === e.matchId)) last.until = e.until;
    else entries.push(e);
  }
  return entries;
}

/**
 * Which kind of TV guide entry a segment belongs to (Task 137: the studio jingle plays as a studio or opening entry
 * begins). A live match's parts and its post-match show are the live entry; the ident and the welcome are the opening;
 * the talk, cards and ads between programmes are studio.
 * @param {any} seg @returns {EntryKind}
 */
export function guideKind(seg) {
  if (seg.preview) return 'preview';
  if (seg.vault) return 'vault';
  if (seg.podcast) return 'podcast';
  if (MATCH_PARTS.includes(seg.kind) || seg.show) return 'live';
  if (seg.kind === 'reair') return 'reair';
  if (seg.kind === 'highlights') return 'highlights';
  if (seg.kind === 'ident' || seg.kind === 'countdown' || (seg.kind === 'talk' && seg.topic === 'welcome')) return 'opening';
  if (seg.kind === 'champion') return 'champions';
  if (seg.kind === 'grounds') return 'grounds';
  // The awards (Task 191), their intro talk included.
  if (seg.kind === 'award' || (seg.kind === 'talk' && seg.topic === 'awards')) return 'awards';
  // The off-season (Tasks 192–194): the farewells, the lottery, the draft, the moves, the sign-off, its talk and its cards.
  if (seg.kind === 'farewell' || seg.kind === 'lottery' || seg.kind === 'draft' || seg.kind === 'moves' || (seg.kind === 'talk' && seg.topic === 'signoff')) return 'offseason';
  return 'studio';
}

/**
 * Whether the studio jingle plays as `seg` begins (Task 137, Tom: only as a STUDIO or OPENING entry in the TV guide
 * begins, so not at every return to the scene), after a segment of guide kind `before` (null: nothing seen before it,
 * as on loading). Task 180: never over the desk: of the talks only those that wait for it (JINGLE_TALKS: the welcome,
 * the champions, the off-season), so not the tee-up after the welcome (the opening's has just played); and not as an
 * ad break begins (the bumper has its own sound, Task 168).
 * @param {any} seg @param {EntryKind | null} before
 */
export function studioJingle(seg, before) {
  if (before === null || seg.kind === 'ads') return false;
  const kind = guideKind(seg);
  // OFF THE BALL (2026-10-21): as its first talk begins (its first line waits for the jingle, podcastScript).
  if (seg.podcast) return seg.kind === 'talk' && before !== 'podcast';
  if (seg.kind === 'talk') return JINGLE_TALKS.has(seg.topic) && kind !== 'live' && (kind !== before || kind === 'opening');
  // The PLAYOFF PREVIEW show as it begins, as a studio entry does (not between its pieces).
  return (kind === 'studio' || kind === 'preview') && before !== 'studio' && before !== 'opening' && before !== 'preview';
}

/**
 * Work out the day around `t` from a league of its own (the channel's own league only reaches the present; the rest of
 * the day needs the matches after it). Takes a moment (about a second late in a season), so it's done once a day.
 * @param {import('../config.js').Config} config @param {number} t @param {string} seed
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @param {import('../sim/streams.js').Streams} [streams]  The day keys' streams, on the live channel (Task 271): a day's
 *   key holds everything its guide needs.
 * @param {import('./snapshot.js').Snapshot} [snapshot]  The latest snapshot (Task 272), to start from.
 * @returns {GuideDay}
 */
export function buildDay(config, t, seed, timelineOf, streams, snapshot) {
  const live = snapshot ? restoreLive(config, snapshot, { now: snapshot.at, streams }) : new LiveLeague(config, { now: 0, seed, streams });
  const { from, until: to } = dayAround(live.calendar, t);
  live.advanceTo(from);
  const programme = createProgramme(live, timelineOf);
  /** @type {{ from: number, until: number, seg: any }[]} */
  const pieces = [];
  for (let at = from; at < to;) {
    live.advanceTo(at);
    const p = programme.pieceAt(at);
    pieces.push({ from: Math.max(p.from, from), until: Math.min(p.until, to), seg: programme.at(Math.max(p.from, at)) });
    at = p.until > at ? p.until : at + 1000;
  }
  return { from, until: to, entries: groupEntries(pieces) };
}

/**
 * What the guide shows at `now`: the entries (all, or the matches only), each marked past, now (with how far in) or to
 * come, with the final's teams hidden until both semifinals have finished on screen.
 * @param {GuideDay} day @param {number} now
 * @param {{ filter: 'all' | 'matches', semisDone: boolean }} o  semisDone: both of this season's semifinals have finished
 *   on screen (or there are none).
 * @returns {(Entry & { state: 'past' | 'now' | 'next', progress: number })[]}
 */
export function guideAt(day, now, { filter, semisDone }) {
  return day.entries
    .filter((e) => filter === 'all' || e.kind === 'live' || e.kind === 'reair' || e.kind === 'highlights')
    .map((e) => {
      const hide = e.stage === 'final' && e.kind === 'live' && !semisDone;
      const shown = hide ? { ...e, homeId: undefined, awayId: undefined } : e;
      const state = /** @type {'past' | 'now' | 'next'} */ (now >= e.until ? 'past' : now >= e.from ? 'now' : 'next');
      return { ...shown, state, progress: state === 'now' ? (now - e.from) / (e.until - e.from) : state === 'past' ? 1 : 0 };
    });
}
