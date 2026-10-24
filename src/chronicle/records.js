// The record books (It remembers, Task 216): all-time, single-season, playoff and single-match records, team records
// and award counts, worked out from the chronicle. Pure; ids and numbers only (names and words are the channel's).
// Season records count the regular season, as the leaders do (Task 141); the playoffs have their own; all-time
// (career) records count both, and say so on screen (Tom). See docs/simulation.md §12b.
import { withoutComments } from '../util.js';
import { statOf } from './chronicle.js';

/**
 * @typedef {import('./chronicle.js').Chronicle} Chronicle
 * @typedef {import('./chronicle.js').Line} Line
 *
 * @typedef {object} PlayerEntry  One place in a player record list.
 * @property {string} playerId
 * @property {string} teamId  Their team then (a season or match record), or the last they played for (a career).
 * @property {number} value  The stat; save percentage as a share (0–1).
 * @property {number} [season]  A season or match record's season.
 * @property {string} [matchId]  A match record's match.
 * @property {number} [seasons]  A career record's seasons played.
 * @property {number} [faced]  Save percentage: the shots on target faced.
 *
 * @typedef {{ teamId: string, length: number, season: number }} Run
 * @typedef {{ teamId: string, season: number, value: number }} TeamSeasonEntry
 */

/** The player stats with records, career and season. */
export const PLAYER_STATS = /** @type {const} */ (['goals', 'assists', 'scorchers', 'saves', 'savePct', 'stops', 'appearances', 'potm', 'winningGoals', 'burns']);
/** The playoffs' own records (a career's playoffs). */
export const PLAYOFF_STATS = /** @type {const} */ (['goals', 'assists', 'scorchers', 'saves', 'appearances']);
/** Single-match records, from the notable matches the chronicle keeps. */
export const MATCH_STATS = /** @type {const} */ (['goals', 'assists', 'saves']);

/**
 * A line's value for a record, or null when it doesn't qualify (save percentage under its minimum faced).
 * @param {Line} line @param {string} stat @param {number} minFaced
 * @returns {{ value: number, faced?: number } | null}
 */
function valueOf(line, stat, minFaced) {
  if (stat !== 'savePct') return { value: statOf(line, stat) };
  const faced = line.saves + line.conceded;
  return faced >= Math.max(1, minFaced) ? { value: line.saves / faced, faced } : null;
}

/**
 * The best `n`, highest first; ties to the earlier season, then fewer seasons, then id (stable for every screen).
 * @template {{ value: number, season?: number, seasons?: number, playerId?: string, teamId?: string, matchId?: string }} T
 * @param {T[]} list @param {number} n
 */
function top(list, n) {
  return list.filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value || (a.season ?? 0) - (b.season ?? 0) || (a.seasons ?? 0) - (b.seasons ?? 0)
      || String(a.playerId ?? a.teamId).localeCompare(String(b.playerId ?? b.teamId)) || String(a.matchId ?? '').localeCompare(String(b.matchId ?? '')))
    .slice(0, n);
}

/**
 * Every record, as of the end of season `upTo` (the chronicle's latest by default; the channel passes the last season
 * that has aired, since the log runs ahead of the screen).
 * @param {Chronicle} chronicle
 * @param {{ listLength: number, seasonMinFaced: number, careerMinFaced: number }} options  data/chronicle.json records
 * @param {{ upTo?: number }} [o]
 */
export function records(chronicle, options, { upTo = Infinity } = {}) {
  const { listLength: n, seasonMinFaced, careerMinFaced } = withoutComments(options);
  const seasons = [...chronicle.seasons.values()].filter((s) => s.season <= upTo);
  const matches = seasons.flatMap((s) => s.matchIds.map((id) => /** @type {import('./chronicle.js').MatchRecord} */ (chronicle.matches.get(id))));
  const players = [...chronicle.players.values()];

  // Players: careers (both parts), seasons (the regular season), the playoffs, single matches.
  const careers = players.map((p) => ({ p, all: chronicle.career(p.id, 'all', upTo), playoffs: chronicle.career(p.id, 'playoffs', upTo) })).filter((c) => c.all.seasons > 0);
  /** @param {string} stat */
  const careerList = (stat) => top(careers.flatMap(({ p, all }) => {
    const v = valueOf(all, stat, careerMinFaced);
    return v ? [{ playerId: p.id, teamId: all.teamId, seasons: all.seasons, ...v }] : [];
  }), n);
  /** @param {string} stat */
  const seasonList = (stat) => top(players.flatMap((p) => Object.entries(p.seasons).flatMap(([season, s]) => {
    const v = s.regular && Number(season) <= upTo ? valueOf(s.regular, stat, seasonMinFaced) : null;
    return v ? [{ playerId: p.id, teamId: /** @type {Line} */ (s.regular).teamId, season: Number(season), ...v }] : [];
  })), n);
  /** @param {string} stat */
  const playoffList = (stat) => top(careers.filter((c) => c.playoffs.seasons > 0).map(({ p, playoffs }) => ({ playerId: p.id, teamId: playoffs.teamId, seasons: playoffs.seasons, value: statOf(playoffs, stat) })), n);
  /** @param {'goals' | 'assists' | 'saves'} stat */
  const matchList = (stat) => top(chronicle.performances.filter((x) => x.season <= upTo).map((x) => ({ playerId: x.playerId, teamId: x.teamId, season: x.season, matchId: x.matchId, value: x[stat] })), n);

  // Teams: honours and all-time results (shootouts count as a win or a loss), seasons from the tables, runs.
  const teamIds = [...chronicle.teams.keys()];
  const teams = teamIds.map((id) => {
    const t = /** @type {NonNullable<ReturnType<Chronicle['teams']['get']>>} */ (chronicle.teams.get(id));
    let won = 0;
    let drawn = 0;
    let lost = 0;
    for (const m of matches) {
      if (m.homeId !== id && m.awayId !== id) continue;
      if (m.winnerId === id) won++;
      else if (m.winnerId) lost++;
      else drawn++;
    }
    return { teamId: id, cups: t.cups.filter((s) => s <= upTo), pennants: t.pennants.filter((s) => s <= upTo), won, drawn, lost };
  }).sort((a, b) => b.cups.length - a.cups.length || b.pennants.length - a.pennants.length || b.won - a.won || a.teamId.localeCompare(b.teamId));
  // Final tables only (a season in progress has no team season records yet).
  const finished = seasons.filter((s) => s.championId);
  /** @param {(row: import('./chronicle.js').TableRow) => number} value */
  const teamSeasons = (value) => top(finished.flatMap((s) => s.table.map((row) => ({ teamId: row.teamId, season: s.season, value: value(row) }))), n);
  // Fewest conceded: the lowest first (stored as a negative to share the ordering, then turned back).
  const fewestConceded = teamSeasons((row) => 1000 - row.goalsAgainst).map((x) => ({ ...x, value: 1000 - x.value }));
  const biggestWins = top(matches.filter((m) => m.homeGoals !== m.awayGoals).map((m) => ({
    teamId: /** @type {string} */ (m.winnerId), season: m.season, matchId: m.id, value: Math.abs(m.homeGoals - m.awayGoals),
    score: m.homeId === m.winnerId ? [m.homeGoals, m.awayGoals] : [m.awayGoals, m.homeGoals], opponentId: m.homeId === m.winnerId ? m.awayId : m.homeId,
  })), n);

  // Most games for each club (Tom, Task 218): its all-time appearances leader, the playoffs included.
  /** @type {Map<string, Map<string, number>>} */
  const games = new Map(teamIds.map((id) => [id, new Map()]));
  for (const p of players) {
    for (const [season, s] of Object.entries(p.seasons)) {
      if (Number(season) > upTo) continue;
      for (const line of [s.regular, s.playoffs]) {
        const club = line && games.get(line.teamId);
        if (club && line) club.set(p.id, (club.get(p.id) ?? 0) + line.appearances);
      }
    }
  }
  const clubGames = teamIds.flatMap((id) => {
    const best = top([.../** @type {Map<string, number>} */ (games.get(id))].map(([playerId, value]) => ({ playerId, teamId: id, value })), 1)[0];
    return best ? [best] : [];
  }).sort((a, b) => b.value - a.value || a.teamId.localeCompare(b.teamId));

  // Runs within a season (Tom, Task 167), the playoffs included, in the order played: wins, unbeaten, without a win.
  /** @type {Record<'won' | 'unbeaten' | 'winless', Run[]>} */
  const runs = { won: [], unbeaten: [], winless: [] };
  for (const s of seasons) {
    for (const id of teamIds) {
      const run = { won: 0, unbeaten: 0, winless: 0 };
      const close = (/** @type {keyof typeof run} */ k) => {
        if (run[k]) runs[k].push({ teamId: id, length: run[k], season: s.season });
        run[k] = 0;
      };
      for (const mid of s.matchIds) {
        const m = /** @type {import('./chronicle.js').MatchRecord} */ (chronicle.matches.get(mid));
        if (m.homeId !== id && m.awayId !== id) continue;
        const outcome = m.winnerId === id ? 'W' : m.winnerId ? 'L' : 'D';
        if (outcome === 'W') run.won++; else close('won');
        if (outcome !== 'L') run.unbeaten++; else close('unbeaten');
        if (outcome !== 'W') run.winless++; else close('winless');
      }
      close('won');
      close('unbeaten');
      close('winless');
    }
  }
  /** @param {Run[]} list */
  const longest = (list) => top(list.map((r) => ({ ...r, value: r.length })), n).map(({ value, ...r }) => r);

  // Awards: how many times each player has won each, and the most in all.
  /** @type {Record<string, Map<string, number[]>>} */
  const byAward = {};
  /** @type {Map<string, number[]>} */
  const allAwards = new Map();
  for (const s of seasons) {
    for (const a of s.awards) {
      const m = (byAward[a.award] ??= new Map());
      m.set(a.playerId, [...(m.get(a.playerId) ?? []), s.season]);
      allAwards.set(a.playerId, [...(allAwards.get(a.playerId) ?? []), s.season]);
    }
  }
  /** @param {Map<string, number[]>} m */
  const counted = (m) => top([...m].map(([playerId, won]) => ({ playerId, value: won.length, seasonsWon: won, season: won[won.length - 1] })), n);

  return {
    seasons: finished.length,
    career: Object.fromEntries(PLAYER_STATS.map((k) => [k, careerList(k)])),
    season: Object.fromEntries(PLAYER_STATS.map((k) => [k, seasonList(k)])),
    playoffs: Object.fromEntries(PLAYOFF_STATS.map((k) => [k, playoffList(k)])),
    match: Object.fromEntries(MATCH_STATS.map((k) => [k, matchList(k)])),
    teams: {
      history: teams,
      mostPoints: teamSeasons((row) => row.points),
      mostGoals: teamSeasons((row) => row.goalsFor),
      fewestConceded,
      biggestWins,
      clubGames,
      winningRuns: longest(runs.won),
      unbeatenRuns: longest(runs.unbeaten),
      winlessRuns: longest(runs.winless),
    },
    awards: {
      byAward: Object.fromEntries(Object.entries(byAward).map(([award, m]) => [award, counted(m)])),
      most: counted(allAwards),
    },
  };
}
