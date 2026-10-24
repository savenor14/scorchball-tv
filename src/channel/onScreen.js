// What the viewer is allowed to know at a moment. Pure and DOM-free. See docs/channel.md §1 ("no spoilers").
// The sim plays each match in full at kick-off and logs standings and playoff seedings straight away; everything the
// channel shows instead comes from matches that have *finished on screen* (kick-off + their on-screen duration).
import { computeStandings, addMatchStats, leaders } from '../sim/standings.js';
import { lotsSeedFor } from '../sim/season.js';

/**
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {(m: LiveMatch) => number} DurationOf  On-screen length of a match in ms (its timeline's duration).
 */

/** @param {LiveMatch} m @param {number} t @param {DurationOf} durationOf */
export const isFinished = (m, t, durationOf) => t >= m.kickoff + durationOf(m);
/** @param {LiveMatch} m @param {number} t @param {DurationOf} durationOf */
export const isLive = (m, t, durationOf) => t >= m.kickoff && t < m.kickoff + durationOf(m);

/**
 * The regular-season table as the viewer knows it: from the season's regular matches that have finished on screen.
 * @param {import('./liveLeague.js').LiveLeague} live
 * @param {number} season
 * @param {number} t
 * @param {DurationOf} durationOf
 */
export function tableAt(live, season, t, durationOf) {
  const teamIds = Object.keys(live.league.teams);
  const done = live.matchesIn(season).filter((m) => m.stage === 'regular' && isFinished(m, t, durationOf));
  return computeStandings(teamIds, done.map((m) => m.summary), live.config.rules, lotsSeedFor(live.league, season));
}

/**
 * @typedef {object} TableViewRow
 * @property {number} position
 * @property {string} teamId
 * @property {number} played
 * @property {number} goalDifference
 * @property {number} points
 * @property {boolean} live  The team is playing right now (highlighted; its standing doesn't change until full time).
 *
 * @typedef {object} TableView
 * @property {string} title   TABLE - S1, or FINAL TABLE - S1 once the regular season has finished on screen.
 * @property {TableViewRow[]} rows
 * @property {number} cut     Rows above the playoff line.
 */

/**
 * What the table panel shows: the standings from matches finished on screen. They only change at full time, even in
 * the simultaneous final round (Tom, 2026-10-03: no live tables). Teams playing right now are marked.
 * @param {import('./liveLeague.js').LiveLeague} live
 * @param {number} season
 * @param {number} t
 * @param {(m: LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @returns {TableView}
 */
export function tableView(live, season, t, timelineOf) {
  const durationOf = (/** @type {LiveMatch} */ m) => timelineOf(m).duration;
  const regular = live.matchesIn(season).filter((m) => m.stage === 'regular');
  const playing = regular.filter((m) => isLive(m, t, durationOf));
  const table = tableAt(live, season, t, durationOf);
  const playingTeams = new Set(playing.flatMap((m) => [m.homeId, m.awayId]));
  const allDone = regular.length === live.calendar.regularCount && regular.every((m) => isFinished(m, t, durationOf));
  return {
    // The season beside it (Tom, after Task 213: nowhere else says which season it is), S1 as the record books write it.
    title: `${allDone ? 'FINAL TABLE' : 'TABLE'} - S${season}`,
    cut: live.config.rules.playoffs.teams,
    rows: table.map((r) => ({
      position: r.position, teamId: r.teamId, played: r.played, goalDifference: r.goalDifference, points: r.points,
      live: playingTeams.has(r.teamId),
    })),
  };
}

/**
 * What each team is still playing for on the final day, from the table before it: the Pennant (first place) and the
 * playoff line (between `cut` and `cut + 1`). A team is "in a race" if one win (points.win) could change its side of
 * that line, either way.
 * @param {import('../sim/standings.js').TableRow[]} table  Ordered, position 1 first.
 * @param {number} cut  Playoff places.
 * @param {number} win  Points for a win.
 * @returns {Map<string, { shield: boolean, playoff: boolean }>}
 */
export function stakesOf(table, cut, win) {
  const pts = (/** @type {number} */ position) => table[position - 1]?.points ?? -Infinity;
  return new Map(table.map((r) => {
    const shield = r.position === 1 ? pts(2) >= r.points - win : r.points >= pts(1) - win;
    const playoff = r.position <= cut ? pts(cut + 1) >= r.points - win : r.points >= pts(cut) - win;
    return [r.teamId, { shield, playoff }];
  }));
}

/**
 * Order matches by what's at stake: one point per team per race it's in. Ties: more combined points, then play order.
 * @template {{ homeId: string, awayId: string, slot: number }} M
 * @param {M[]} matches
 * @param {Map<string, { shield: boolean, playoff: boolean }>} stakes
 * @param {import('../sim/standings.js').TableRow[]} table
 * @returns {M[]} Biggest stakes first.
 */
export function byStakes(matches, stakes, table) {
  const score = (/** @type {string} */ id) => { const s = stakes.get(id); return s ? Number(s.shield) + Number(s.playoff) : 0; };
  const points = (/** @type {string} */ id) => table.find((r) => r.teamId === id)?.points ?? 0;
  return [...matches].sort((a, b) =>
    (score(b.homeId) + score(b.awayId)) - (score(a.homeId) + score(a.awayId))
    || (points(b.homeId) + points(b.awayId)) - (points(a.homeId) + points(a.awayId))
    || a.slot - b.slot);
}

/**
 * @typedef {object} UpcomingFixture
 * @property {string} key
 * @property {number} kickoff
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {string | null} homeId  Null while the teams aren't known on screen (playoffs).
 * @property {string | null} awayId
 */

/**
 * The next fixtures after a moment, this season. Playoff opponents stay unknown (null) until the matches that decide
 * them have finished on screen, even though the sim already knows them.
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} t @param {DurationOf} durationOf @param {number} n
 * @returns {UpcomingFixture[]}
 */
export function upcomingAt(live, t, durationOf, n) {
  const { calendar } = live;
  const pos = calendar.at(t);
  if (!pos.next) return [];
  const played = live.matchesIn(pos.season);
  const sameSeason = live.state.season === pos.season;
  const regularDone = played.filter((m) => m.stage === 'regular' && isFinished(m, t, durationOf)).length === calendar.regularCount;
  const semisDone = played.filter((m) => m.stage === 'semifinal' && isFinished(m, t, durationOf)).length === 2;
  return calendar.slots(pos.season).slice(pos.started, pos.started + n).map((slot) => {
    /** @type {[string | null, string | null]} */
    let teams = [null, null];
    if (slot.stage === 'regular' && sameSeason) {
      const perRound = live.state.schedule[0].matches.length;
      const f = live.state.schedule[/** @type {number} */ (slot.round) - 1].matches[slot.index % perRound];
      teams = [f.homeId, f.awayId];
    } else if (slot.stage === 'semifinal' && regularDone && sameSeason) {
      const s = live.state.seeds;
      teams = slot.index === calendar.regularCount ? [s[0], s[3]] : [s[1], s[2]];
    } else if (slot.stage === 'final' && semisDone && sameSeason) {
      const winners = live.state.playoffs.filter((p) => p.stage === 'semifinal').map((p) => p.winnerId);
      // At the better seed's ground, as the sim plays it (season.js nextFixture; it was the semifinals' order, Task 161).
      if (winners.length === 2) teams = /** @type {[string, string]} */ ([...winners].sort((a, b) => live.state.seeds.indexOf(a) - live.state.seeds.indexOf(b)));
    }
    return { key: `${pos.season}-${slot.index}`, kickoff: slot.kickoff, stage: slot.stage, homeId: teams[0] ?? null, awayId: teams[1] ?? null };
  });
}

/**
 * Which matches a season's leaders count (Task 141, Tom): the regular season (the season's leaders, as in the record),
 * the playoffs (shown apart), or both.
 * @typedef {'regular' | 'playoffs' | 'all'} StatPart
 */

/**
 * The season's top scorers from matches finished on screen: the regular season unless `part` says otherwise.
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} season @param {number} t @param {DurationOf} durationOf
 * @param {number} [n] @param {StatPart} [part]
 */
export function topScorersAt(live, season, t, durationOf, n = 1, part = 'regular') {
  return leadersAt(live, season, t, durationOf, 'goals', n, part);
}

/**
 * The season's leaders in a stat from matches finished on screen: the regular season unless `part` says otherwise
 * (Task 141: it was every match, so the channel and the season's record could name different top scorers).
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} season @param {number} t @param {DurationOf} durationOf
 * @param {'goals' | 'assists' | 'scorchers' | 'saves' | 'tackles' | 'burns'} stat @param {number} [n] @param {StatPart} [part]
 */
export function leadersAt(live, season, t, durationOf, stat, n = 1, part = 'regular') {
  return leaders(seasonTotalsAt(live, season, t, durationOf, part), stat, n);
}

/**
 * Every player's totals this season from matches finished on screen (the regular season unless `part` says otherwise).
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} season @param {number} t @param {DurationOf} durationOf
 * @param {StatPart} [part] @returns {Record<string, import('../sim/standings.js').SeasonPlayerStats>}
 */
export function seasonTotalsAt(live, season, t, durationOf, part = 'regular') {
  const counts = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => part === 'all' || (part === 'regular') === (m.stage === 'regular');
  /** @type {Record<string, import('../sim/standings.js').SeasonPlayerStats>} */
  const totals = {};
  for (const m of live.matchesIn(season)) if (counts(m) && isFinished(m, t, durationOf)) addMatchStats(totals, m.summary);
  return totals;
}
