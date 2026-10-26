// Draft lottery, draft class and picks. See docs/simulation.md §8.
import { clamp, withoutComments } from '../util.js';
import { addPlayer } from './league.js';
import { overall } from './players.js';

/**
 * The draft order for one round.
 * - Teams that missed the playoffs are drawn for the top picks, weighted by `lotteryWeights` (worst record first).
 * - Playoff teams follow in reverse order of the regular season's table, however the playoffs went (Tom, 2026-10-18,
 *   for parity: until then the losing semifinalists, the runner-up and the champion, so an underdog that won its
 *   semifinal picked late).
 * @param {import('./rng.js').Rng} rng
 * @param {import('./season.js').SeasonRecord} record
 * @param {any} rules
 * @returns {string[]}
 */
export function draftOrder(rng, record, rules) {
  const tableOrder = record.table.map((r) => r.teamId);
  const nonPlayoff = tableOrder.filter((id) => !record.seeds.includes(id)).reverse(); // worst first
  /** @type {{ teamId: string, weight: number }[]} */
  let pool = nonPlayoff.map((teamId, i) => ({ teamId, weight: rules.draft.lotteryWeights[i] }));
  const lottery = [];
  while (pool.length > 0) {
    const picked = pool.some((p) => p.weight > 0) ? rng.weighted(pool, (p) => p.weight) : pool[0];
    lottery.push(picked.teamId);
    pool = pool.filter((p) => p !== picked);
  }

  const playoffTeams = tableOrder.filter((id) => record.seeds.includes(id)).reverse(); // the lowest seed first
  return [...lottery, ...playoffTeams];
}

/**
 * Generate a draft class of young prospects as free agents (they join the pool if undrafted).
 * Age is relative to `league.season`, which should already be the coming season.
 * @param {import('./league.js').League} league
 * @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @returns {import('./players.js').Player[]}
 */
export function createDraftClass(league, config, rng, emit) {
  const { rules } = config;
  const d = rules.draft;
  const size = Object.keys(league.teams).length * d.rounds + d.extraProspects;
  const minimums = withoutComments(rules.roster.minimums);
  // The class's headline prospects first (Task 175, Tom: the top picks should be good), each from its own ranges, then
  // the raw prospects. Every headliner's numbers are drawn, so some years' No. 1 is better than others'.
  /** @type {{ overall: { min: number, max: number }, potential: { min: number, max: number } }[]} */
  const headliners = d.headliners.slice(0, size);
  return Array.from({ length: size }, (_, i) => addPlayer(league, config, rng, emit, {
    position: rng.weightedKey(minimums),
    age: rng.int(d.prospectAge.min, d.prospectAge.max),
    teamId: null,
    homeRegion: null,
    ratings: () => {
      const h = headliners[i];
      if (h) {
        const potential = rng.int(h.potential.min, h.potential.max);
        return { potential, current: Math.min(rng.float(h.overall.min, h.overall.max), potential) };
      }
      const potential = Math.round(clamp(rng.normal(d.potential.mean, d.potential.sd), d.potential.min, d.potential.max));
      const current = Math.min(rng.float(d.prospectOverall.min, d.prospectOverall.max), potential);
      return { potential, current };
    },
  }));
}

/**
 * Run the draft: each team in `order` picks once per round. Picks are logged as `draft_pick`.
 * @param {import('./league.js').League} league
 * @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {string[]} order  The first round's order.
 * @param {import('./players.js').Player[]} prospects  Removed from the free-agent pool when picked.
 * @param {Map<string, Record<string, number>>} [needs]  Each team's statistical need (statNeeds), rating points by position.
 * @param {string[]} [laterOrder]  The later rounds' order (rules.draft.laterRounds); the first round's by default.
 * @returns {{ teamId: string, playerId: string, round: number, pick: number }[]}
 */
export function runDraft(league, config, rng, emit, order, prospects, needs = new Map(), laterOrder = order) {
  const { rules, positions } = config;
  const d = rules.draft;
  let available = [...prospects];
  let pick = 0;
  /** @type {{ teamId: string, playerId: string, round: number, pick: number }[]} */
  const picks = [];
  for (let round = 1; round <= d.rounds; round++) {
    for (const teamId of round === 1 ? order : laterOrder) {
      if (available.length === 0) return picks;
      pick++;
      const short = shortPositions(league, teamId, rules);
      // Teams lean towards players from their own region (Task 176, Tom: a local academy, so identities hold).
      const home = league.teams[teamId].region;
      let best = available[0];
      let bestValue = -Infinity;
      for (const p of available) {
        const scouted = p.potential + rng.normal(0, d.scoutingNoise);
        const value = d.potentialWeight * scouted + (1 - d.potentialWeight) * overall(p, positions)
          + (short.has(p.position) ? d.needBonus : 0) + (p.region === home ? rules.roster.localBonus : 0)
          + rules.roster.styleWeight * styleFit(p, league.teams[teamId], positions) + (needs.get(teamId)?.[p.position] ?? 0);
        if (value > bestValue) {
          best = p;
          bestValue = value;
        }
      }
      available = available.filter((p) => p !== best);
      league.freeAgents = league.freeAgents.filter((id) => id !== best.id);
      best.teamId = teamId;
      best.draft = { season: league.season - 1, round, pick, teamId };
      league.teams[teamId].roster.push(best.id);
      picks.push({ teamId, playerId: best.id, round, pick });
      emit('draft_pick', {
        teamId,
        playerId: best.id,
        data: { round, pick, position: best.position, overall: Math.round(overall(best, positions)) },
      });
    }
  }
  return picks;
}

/**
 * How well an outfield player suits a team's style (Task 177): their style attributes against their own average,
 * leaning by the team's personality. Tempo above 0.5 favours shooting and pace (direct), below it passing and
 * composure (patient); aggression above 0.5 favours tackling, below it composure. Keepers: 0. Rating points,
 * typically within ±20; teams add `roster.styleWeight` times it to a player's value when drafting or signing.
 * @param {import('./players.js').Player} p @param {{ personality: { tempo: number, aggression: number } }} team @param {any} positions
 */
export function styleFit(p, team, positions) {
  if (p.position === positions.keeper) return 0;
  const a = p.attributes;
  const outfield = /** @type {string[]} */ (positions.attributes).filter((k) => k !== 'keeping');
  const mean = outfield.reduce((s, k) => s + a[k], 0) / outfield.length;
  const tempo = 2 * team.personality.tempo - 1;
  const aggression = 2 * team.personality.aggression - 1;
  const lean = (/** @type {string[]} */ ks) => ks.reduce((s, k) => s + a[k] - mean, 0) / ks.length;
  return tempo * (lean(['shooting', 'pace']) - lean(['passing', 'composure'])) / 2
    + (aggression > 0 ? aggression * lean(['tackling']) : -aggression * lean(['composure']));
}

/**
 * Positions where a team has fewer active players than the roster minimum.
 * @param {import('./league.js').League} league @param {string} teamId @param {any} rules
 * @returns {Set<string>}
 */
export function shortPositions(league, teamId, rules) {
  const counts = positionCounts(league, teamId);
  const short = new Set();
  for (const [pos, min] of Object.entries(withoutComments(rules.roster.minimums))) {
    if ((counts.get(pos) ?? 0) < min) short.add(pos);
  }
  return short;
}

/**
 * A statistical need (Tom's note 7, 2026-10-18): the teams that scored least last season lean to rules.draft.statNeed's
 * attack positions, the ones that conceded most to its defence positions. The worst gets the whole bonus, each place
 * better a share less, none from the middle of the table on. Empty while the bonus is 0.
 * @param {import('./season.js').SeasonRecord} record @param {any} rules
 * @returns {Map<string, Record<string, number>>}
 */
export function statNeeds(record, rules) {
  const { bonus, attack, defence } = rules.draft.statNeed;
  /** @type {Map<string, Record<string, number>>} */
  const needs = new Map();
  if (!bonus) return needs;
  const half = record.table.length / 2;
  const lean = (/** @type {import('./standings.js').TableRow[]} */ rows, /** @type {string[]} */ at) => rows.forEach((r, i) => {
    const b = bonus * Math.max(0, 1 - i / half);
    if (b <= 0) return;
    const need = needs.get(r.teamId) ?? {};
    for (const pos of at) need[pos] = (need[pos] ?? 0) + b;
    needs.set(r.teamId, need);
  });
  // Ties by the table (the worse team first).
  const worstFirst = [...record.table].reverse();
  lean([...worstFirst].sort((a, b) => a.goalsFor - b.goalsFor), attack);
  lean([...worstFirst].sort((a, b) => b.goalsAgainst - a.goalsAgainst), defence);
  return needs;
}

/** @param {import('./league.js').League} league @param {string} teamId */
export function positionCounts(league, teamId) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const id of league.teams[teamId].roster) {
    const pos = league.players[id].position;
    counts.set(pos, (counts.get(pos) ?? 0) + 1);
  }
  return counts;
}
