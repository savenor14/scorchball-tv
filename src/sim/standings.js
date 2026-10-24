// League table and season stats. See docs/sport.md §12.
import { createRng } from './rng.js';

/**
 * @typedef {object} TableRow
 * @property {number} position
 * @property {string} teamId
 * @property {number} played
 * @property {number} won
 * @property {number} drawn
 * @property {number} lost
 * @property {number} goalsFor
 * @property {number} goalsAgainst
 * @property {number} goalDifference
 * @property {number} points
 * @property {('W' | 'D' | 'L')[]} form  Last five results, oldest first.
 */

/**
 * @typedef {{ homeId: string, awayId: string, result: { homeGoals: number, awayGoals: number } }} PlayedMatch
 */

const FORM_LENGTH = 5;

/**
 * The league table from a list of played regular-season matches, ranked by the tiebreakers in rules.json.
 * Recomputed from scratch each time: the results list is the source of truth.
 * @param {string[]} teamIds
 * @param {PlayedMatch[]} results  In the order they were played (used for form).
 * @param {any} rules              data/rules.json
 * @param {string} lotsSeed        e.g. "<leagueSeed>|s3". Drawing lots for a given set of tied teams always
 *                                 gives the same order, however many times the table is recomputed.
 * @returns {TableRow[]}
 */
export function computeStandings(teamIds, results, rules, lotsSeed) {
  /** @type {Map<string, TableRow>} */
  const rows = new Map(teamIds.map((teamId) => [teamId, {
    position: 0, teamId, played: 0, won: 0, drawn: 0, lost: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0, form: [],
  }]));

  for (const m of results) {
    const home = rows.get(m.homeId);
    const away = rows.get(m.awayId);
    if (!home || !away) throw new Error(`Result for unknown team: ${m.homeId} v ${m.awayId}`);
    record(home, m.result.homeGoals, m.result.awayGoals, rules.points);
    record(away, m.result.awayGoals, m.result.homeGoals, rules.points);
  }

  const ranked = rank([...rows.values()], rules.tiebreakers, { results, points: rules.points, lotsSeed });
  ranked.forEach((row, i) => { row.position = i + 1; });
  return ranked;
}

/** @param {TableRow} row @param {number} scored @param {number} conceded @param {any} points */
function record(row, scored, conceded, points) {
  row.played++;
  row.goalsFor += scored;
  row.goalsAgainst += conceded;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  const outcome = scored > conceded ? 'W' : scored < conceded ? 'L' : 'D';
  if (outcome === 'W') row.won++;
  else if (outcome === 'D') row.drawn++;
  else row.lost++;
  row.points += outcome === 'W' ? points.win : outcome === 'D' ? points.draw : points.loss;
  row.form = [...row.form, outcome].slice(-FORM_LENGTH);
}

/**
 * Sort by the first criterion; teams still level are ranked by the remaining criteria among themselves.
 * Head-to-head criteria only count matches between the teams still level at that point.
 * @param {TableRow[]} group
 * @param {string[]} criteria
 * @param {{ results: PlayedMatch[], points: any, lotsSeed: string }} ctx
 * @returns {TableRow[]}
 */
function rank(group, criteria, ctx) {
  if (group.length <= 1 || criteria.length === 0) return group;
  const [criterion, ...rest] = criteria;

  if (criterion === 'lots') {
    const ids = group.map((r) => r.teamId).sort();
    const order = createRng(`${ctx.lotsSeed}|lots|${ids.join(',')}`).shuffle(ids);
    return order.map((id) => /** @type {TableRow} */ (group.find((r) => r.teamId === id)));
  }

  const value = criterionValues(group, criterion, ctx);
  /** @type {Map<number, TableRow[]>} */
  const buckets = new Map();
  for (const row of group) {
    const v = /** @type {number} */ (value.get(row.teamId));
    buckets.set(v, [...(buckets.get(v) ?? []), row]);
  }
  return [...buckets.keys()]
    .sort((a, b) => b - a)
    .flatMap((v) => rank(/** @type {TableRow[]} */ (buckets.get(v)), rest, ctx));
}

/**
 * @param {TableRow[]} group @param {string} criterion
 * @param {{ results: PlayedMatch[], points: any }} ctx
 * @returns {Map<string, number>}
 */
function criterionValues(group, criterion, ctx) {
  switch (criterion) {
    case 'points':
    case 'goalDifference':
    case 'goalsFor':
      return new Map(group.map((r) => [r.teamId, r[criterion]]));
    case 'h2hPoints':
    case 'h2hGoalDifference': {
      const ids = new Set(group.map((r) => r.teamId));
      const mini = new Map(group.map((r) => [r.teamId, { points: 0, gd: 0 }]));
      for (const m of ctx.results) {
        if (!ids.has(m.homeId) || !ids.has(m.awayId)) continue;
        const h = /** @type {{ points: number, gd: number }} */ (mini.get(m.homeId));
        const a = /** @type {{ points: number, gd: number }} */ (mini.get(m.awayId));
        const { homeGoals, awayGoals } = m.result;
        h.gd += homeGoals - awayGoals;
        a.gd += awayGoals - homeGoals;
        h.points += homeGoals > awayGoals ? ctx.points.win : homeGoals === awayGoals ? ctx.points.draw : ctx.points.loss;
        a.points += awayGoals > homeGoals ? ctx.points.win : homeGoals === awayGoals ? ctx.points.draw : ctx.points.loss;
      }
      const key = criterion === 'h2hPoints' ? 'points' : 'gd';
      return new Map([...mini].map(([id, v]) => [id, v[key]]));
    }
    default:
      throw new Error(`Unknown tiebreaker "${criterion}"`);
  }
}

// ------------------------------------------------------------------ player season stats

/**
 * @typedef {object} SeasonPlayerStats
 * @property {string} playerId
 * @property {string} teamId       The team they last played for.
 * @property {number} appearances
 * @property {number} starts
 * @property {number} minutes       Game-minutes played (not rounded).
 * @property {number} goals
 * @property {number} assists
 * @property {number} scorchers
 * @property {number} shots
 * @property {number} shotsOnTarget
 * @property {number} saves
 * @property {number} tackles
 * @property {number} fouls
 * @property {number} burns
 * @property {number} blocks
 * @property {number} conceded     Goals let in while in goal.
 */

/** Counting stats copied straight from a match's player stats. */
const COUNTING = /** @type {const} */ (['goals', 'assists', 'scorchers', 'shots', 'shotsOnTarget', 'saves', 'tackles', 'fouls', 'burns', 'blocks', 'conceded']);

/**
 * Add one match's player stats into a running season total (changed in place).
 * Keep separate totals for the regular season and the playoffs.
 * @param {Record<string, SeasonPlayerStats>} totals
 * @param {{ playerStats: Record<string, import('./match.js').PlayerStats> }} summary
 */
export function addMatchStats(totals, summary) {
  for (const [playerId, s] of Object.entries(summary.playerStats)) {
    const t = (totals[playerId] ??= {
      playerId, teamId: s.teamId, appearances: 0, starts: 0, minutes: 0,
      goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0,
    });
    t.teamId = s.teamId;
    t.appearances++;
    if (s.started) t.starts++;
    t.minutes += s.secondsPlayed / 60;
    for (const k of COUNTING) t[k] += s[k];
  }
  return totals;
}

/**
 * The top `n` players for a stat. Ties go to fewer appearances (more efficient), then player id for stability.
 * Players with zero of the stat are left out.
 * @param {Record<string, SeasonPlayerStats>} totals
 * @param {typeof COUNTING[number] | 'minutes' | 'appearances'} stat
 * @param {number} [n]
 */
export function leaders(totals, stat, n = 10) {
  return Object.values(totals)
    .filter((t) => t[stat] > 0)
    .sort((a, b) => b[stat] - a[stat] || a.appearances - b.appearances || a.playerId.localeCompare(b.playerId))
    .slice(0, n);
}
