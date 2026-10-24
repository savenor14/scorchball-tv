// The side panel (right of the pitch, Task 32): what each tab shows at a moment. Pure and DOM-free; drawn by
// overlays/sidePanel.js. See docs/channel.md §6.
//
//   STATS  the match on screen, live, re-aired or in highlights, as it stands at the moment shown (matchStats.js);
//          around a match (handshakes, the post-match show) its full-time stats; before kick-off the coming match at
//          zero; in the studio and other gaps the last match to finish, at full time.
//   TABLE      the league table (onScreen.js tableView, drawn by overlays/tablePanel.js).
//   TOP    the season's top scorers so far.
//   WEEK   recent results, the match live or being re-aired, and the next fixtures. A re-aired match's score is hidden.
import { matchStatsAt, statRows, zero } from './matchStats.js';
import { isFinished, isLive, topScorersAt, upcomingAt } from './onScreen.js';

/** The tabs, in order, with the key that opens each. */
export const TABS = Object.freeze([
  { id: 'stats', label: 'STATS', key: 's' },
  { id: 'table', label: 'TABLE', key: 't' },
  { id: 'top', label: 'TOP', key: 'g' },
  { id: 'week', label: 'WEEK', key: 'w' },
]);

/**
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {(m: LiveMatch) => import('./timeline.js').Timeline} TimelineOf
 * @typedef {object} StatsView
 * @property {string} homeId @property {string} awayId
 * @property {string} status  e.g. "LIVE 12'", "REPLAY", "S1 REPLAY", "HIGHLIGHTS", "FULL TIME", "UP NEXT"
 * @property {number} [played]  A re-air's or highlights' kick-off, when the match was played (Tom, 2026-10-19: under
 *   REPLAY / HIGHLIGHTS, since a replay keeps the light of its kick-off).
 * @property {[string, string, string][]} rows  label, home, away
 * @property {{ minute: number, playerId: string, teamId: string, scorcher: boolean }[]} scorers
 */

/**
 * A re-air's label (Task 277b, Tom): REPLAY, or S1 REPLAY for an earlier season's match (last season's final and playoffs
 * re-aired at the start of the next), on the scorebug and at the head of STATS.
 * @param {{ season: number }} m @param {number} season  The season now.
 */
export const replayLabel = (m, season) => (m.season < season ? `S${m.season} REPLAY` : 'REPLAY');

/**
 * The STATS tab at a moment.
 * @param {import('./programme.js').Segment} seg  What's on screen.
 * @param {LiveMatch | null} shown  The match on the pitch (the viewer's pick in the final round).
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} t @param {TimelineOf} timelineOf
 * @returns {StatsView | null}
 */
export function statsView(seg, shown, live, t, timelineOf) {
  /** @param {LiveMatch} m @param {number} elapsed @param {string} status */
  const of = (m, elapsed, status) => {
    const s = matchStatsAt(timelineOf(m), elapsed);
    return { homeId: m.homeId, awayId: m.awayId, status, rows: statRows(s), scorers: s.scorers };
  };
  /** @param {LiveMatch} m @param {number} elapsed @param {string} status */
  const replayed = (m, elapsed, status) => ({ ...of(m, elapsed, status), played: m.kickoff });
  const end = (/** @type {LiveMatch} */ m) => timelineOf(m).duration;
  if (seg.kind === 'live' && shown) {
    const elapsed = t - shown.kickoff;
    return of(shown, elapsed, `LIVE ${Math.floor(timelineOf(shown).stateAt(elapsed).clock / 60) + 1}'`);
  }
  if (seg.kind === 'highlights') return replayed(seg.match, seg.elapsed, 'HIGHLIGHTS');
  if (seg.kind === 'reair') return replayed(seg.match, seg.part === 'match' ? seg.elapsed : seg.part === 'intro' || seg.part === 'lineup' ? 0 : end(seg.match), replayLabel(seg.match, live.calendar.seasonAt(t)));
  if (seg.kind === 'handshakes' || seg.kind === 'full_time' || seg.kind === 'potm' || seg.kind === 'champion') return of(seg.match, end(seg.match), 'FULL TIME');
  if (seg.kind === 'pre_match' || seg.kind === 'walk_out') {
    const f = seg.fixture;
    const blank = { home: zero(), away: zero(), scorers: [] };
    return { homeId: f.homeId, awayId: f.awayId, status: 'UP NEXT', rows: statRows(blank), scorers: [] };
  }
  // In the gaps: the last match to finish on screen.
  const done = [...live.matches.values()].filter((m) => m.kickoff + end(m) <= t).sort((a, b) => a.kickoff + end(a) - (b.kickoff + end(b)));
  const last = done.at(-1);
  return last ? of(last, end(last), 'FULL TIME') : null;
}

/**
 * The TOP tab: the season's top scorers from matches finished on screen, the regular season's (the season's leaders)
 * or, for the playoffs block under them (Task 141, Tom's A), the playoffs' (none until a playoff goal is on screen).
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} t @param {TimelineOf} timelineOf @param {number} n
 * @param {'regular' | 'playoffs'} [part]
 * @returns {{ playerId: string, teamId: string, goals: number }[]}
 */
export function topView(live, t, timelineOf, n, part = 'regular') {
  const season = live.calendar.seasonAt(t);
  return topScorersAt(live, season, t, (m) => timelineOf(m).duration, n, part)
    .filter((r) => r.goals > 0)
    .map((r) => ({ playerId: r.playerId, teamId: r.teamId, goals: r.goals }));
}

/**
 * @typedef {object} WeekRow
 * @property {string} key
 * @property {'result' | 'live' | 'replay' | 'next'} kind
 * @property {number} kickoff
 * @property {string | null} homeId @property {string | null} awayId  Null for a playoff place not decided yet.
 * @property {[number, number] | null} score  Null when hidden (a re-air) or not played.
 * @property {string} stage
 */

/**
 * The WEEK tab: the last few results (newest first), any match live now, and the next fixtures.
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} t @param {TimelineOf} timelineOf
 * @param {{ results: number, upcoming: number, reairId: string | null }} opts  reairId: a match being re-aired, whose score stays hidden.
 * @returns {WeekRow[]}
 */
export function weekView(live, t, timelineOf, { results, upcoming, reairId }) {
  const durationOf = (/** @type {LiveMatch} */ m) => timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  const played = live.matchesIn(season);
  /** @type {WeekRow[]} */
  const rows = [];
  for (const m of played.filter((x) => isLive(x, t, durationOf))) {
    const s = timelineOf(m).stateAt(t - m.kickoff).score;
    rows.push({ key: m.id, kind: 'live', kickoff: m.kickoff, homeId: m.homeId, awayId: m.awayId, score: [s[0], s[1]], stage: m.stage });
  }
  for (const m of played.filter((x) => isFinished(x, t, durationOf)).slice(-results).reverse()) {
    const r = m.summary.result;
    const hidden = m.id === reairId;
    rows.push({ key: m.id, kind: hidden ? 'replay' : 'result', kickoff: m.kickoff, homeId: m.homeId, awayId: m.awayId, score: hidden ? null : [r.homeGoals, r.awayGoals], stage: m.stage });
  }
  for (const f of upcomingAt(live, t, durationOf, upcoming)) {
    rows.push({ key: f.key, kind: 'next', kickoff: f.kickoff, homeId: f.homeId, awayId: f.awayId, score: null, stage: f.stage });
  }
  return rows;
}
