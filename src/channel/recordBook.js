// The Record book's pages (Task 167, mock-ups; It remembers builds on them): worked out from the chronicle (Task 216:
// src/chronicle/chronicle.js keeps every season, src/chronicle/records.js the records), so they work for a live league
// whose old match events are gone. Pure: no DOM. Names are formatted here; the chronicle and records hold ids.
import { records } from '../chronicle/records.js';

/**
 * @typedef {import('../chronicle/chronicle.js').Chronicle} Chronicle
 * @typedef {{ id: string, name: string, shortName: string, abbr: string }} TeamInfo
 * @typedef {{ playerId: string, name: string, teamId: string, value: number }} Leader
 */

/** "R. Guidoni". @param {{ firstName: string, lastName: string }} p */
export const shortName = (p) => `${p.firstName[0]}. ${p.lastName}`;

/**
 * The top `n` of a season's players by one stat (ties: fewer appearances first, then id).
 * @param {Record<string, { playerId: string, teamId: string, appearances: number } & Record<string, any>>} stats  A season's lines (chronicle.seasonStats).
 * @param {'goals' | 'assists' | 'scorchers' | 'saves' | 'tackles' | 'burns'} stat @param {Record<string, any>} players @param {number} n
 * @returns {Leader[]}
 */
export function leaders(stats, stat, players, n) {
  return Object.values(stats)
    .filter((s) => s[stat] > 0)
    .sort((a, b) => b[stat] - a[stat] || a.appearances - b.appearances || (a.playerId < b.playerId ? -1 : 1))
    .slice(0, n)
    .map((s) => ({ playerId: s.playerId, name: shortName(players[s.playerId]), teamId: s.teamId, value: s[stat] }));
}

/**
 * One season's page: the champions, the final table, the playoffs, the leaders (regular season and playoffs apart).
 * @param {Chronicle} chronicle @param {number} season  A finished season. @param {Record<string, any>} players
 */
export function seasonPage(chronicle, season, players) {
  const s = chronicle.season(season);
  const playoffs = chronicle.playoffs(season);
  /** A playoff's score, home first, or the winner's side first. @param {import('../chronicle/chronicle.js').MatchRecord} p @param {boolean} [winnerFirst] */
  const score = (p, winnerFirst = false) => {
    const flip = winnerFirst && p.winnerId !== p.homeId;
    const pair = (/** @type {number} */ h, /** @type {number} */ a) => (flip ? `${a}-${h}` : `${h}-${a}`);
    // A shootout as one more goal to its winner, marked (SO) (Tom: "2-2 (1-0 SO)" didn't fit the pane): "3-2 (SO)".
    if (p.shootout) {
      const homeWon = p.winnerId === p.homeId;
      return `${pair(p.homeGoals + (homeWon ? 1 : 0), p.awayGoals + (homeWon ? 0 : 1))} (SO)`;
    }
    return `${pair(p.homeGoals, p.awayGoals)}${p.decidedBy === 'overtime' ? ' GG' : ''}`;
  };
  const final = playoffs.find((p) => p.stage === 'final');
  const regular = chronicle.seasonStats(season, 'regular');
  return {
    season,
    cupId: /** @type {string} */ (s.championId),
    runnerUpId: /** @type {string} */ (s.runnerUpId),
    /** The final's score from the champion's side ("5-2", "4-3 (SO)"). */
    finalScore: final ? score(final, true) : '',
    pennantId: /** @type {string} */ (s.shieldId),
    pennantPoints: s.table[0].points,
    table: s.table.map((row, i) => ({ pos: i + 1, ...row })),
    // The final first (Tom), then the semifinals.
    playoffs: [...playoffs].sort((a, b) => Number(b.stage === 'final') - Number(a.stage === 'final')).map((p) => ({ stage: p.stage, homeId: p.homeId, awayId: p.awayId, score: score(p), winnerId: p.winnerId })),
    regular: { goals: leaders(regular, 'goals', players, 3), assists: leaders(regular, 'assists', players, 3), scorchers: leaders(regular, 'scorchers', players, 3), burns: leaders(regular, 'burns', players, 3) },
    playoffLeaders: { goals: leaders(chronicle.seasonStats(season, 'playoffs'), 'goals', players, 3) },
  };
}

/**
 * The all-time records the mock-up shows, from records.js, with names. "(SEASON)" lists count the regular season (as
 * the leaders do, Task 141); "(CAREER)" lists count the playoffs too.
 * @param {Chronicle} chronicle @param {Record<string, any>} players
 * @param {{ listLength: number, seasonMinFaced: number, careerMinFaced: number, careerMinFacedPerSeason: number }} options  data/chronicle.json records
 * @param {{ n?: number }} [o]  How many of each to list.
 */
export function allTimeRecords(chronicle, players, options, { n = 5 } = {}) {
  const r = records(chronicle, options);
  /** @param {import('../chronicle/records.js').PlayerEntry[]} list */
  const named = (list) => list.slice(0, n).map((x) => ({ ...x, name: shortName(players[x.playerId]), active: players[x.playerId].status === 'active' }));
  return {
    seasons: r.seasons,
    teamHistory: r.teams.history,
    seasonGoals: named(r.season.goals),
    careerGoals: named(r.career.goals),
    seasonScorchers: named(r.season.scorchers),
    careerScorchers: named(r.career.scorchers),
    seasonBurns: named(r.season.burns),
    careerBurns: named(r.career.burns),
    winningGoals: named(r.career.winningGoals),
    winningRuns: r.teams.winningRuns.slice(0, n),
    mostPoints: r.teams.mostPoints.slice(0, n),
  };
}
