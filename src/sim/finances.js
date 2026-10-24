// Finances (Task 231, Parity and finances): wages, payroll, the cap and contracts. See docs/finances.md §3 and
// docs/simulation.md §9d. Money is in thousands a season; the currency's name is the channel's business.
import { pow } from './fmath.js';
import { motiveOf, overall, playerValue } from './players.js';

/**
 * A player's market wage: `wageAt60` at a value of 60, times `wagePerPoint` for each point above or below, never under
 * the minimum wage nor over the maximum contract (`maxContractShare` of the cap). Value is players.playerValue (current
 * overall plus half the growth to come for the young).
 * @param {import('./players.js').Player} p @param {number} season @param {import('../config.js').Config} config
 */
export function marketWage(p, season, { rules, positions }) {
  const f = rules.finances;
  const raw = f.wageAt60 * pow(f.wagePerPoint, playerValue(p, season, positions) - 60);
  return Math.round(Math.min(f.maxContractShare * f.cap, Math.max(f.minWage, raw)));
}

/**
 * A team's payroll: its roster's wages (the reserves are off the cap).
 * @param {import('./league.js').League} league @param {string} teamId
 */
export function payroll(league, teamId) {
  let total = 0;
  for (const id of league.teams[teamId].roster) total += league.players[id].contract?.wage ?? 0;
  return total;
}

/** Room under the cap. @param {import('./league.js').League} league @param {string} teamId @param {any} rules */
export function capRoom(league, teamId, rules) {
  return rules.finances.cap - payroll(league, teamId);
}

/**
 * Wages fitted under the cap (Task 251, the founding squads): if they add up to more than the cap, every wage above the
 * minimum is cut by the same share until they fit, none under the minimum wage; otherwise they're left as they are.
 * @param {number[]} wages @param {any} rules @returns {number[]}
 */
export function fitToCap(wages, rules) {
  const { cap, minWage } = rules.finances;
  let fitted = wages;
  for (let pass = 0; pass < 10; pass++) {
    const total = fitted.reduce((a, b) => a + b, 0);
    if (total <= cap) break;
    const above = fitted.filter((w) => w > minWage).reduce((a, b) => a + b, 0);
    const floored = total - above;
    if (above === 0) break;
    const share = Math.max(0, (cap - floored) / above);
    fitted = fitted.map((w) => (w > minWage ? Math.max(minWage, Math.floor(w * share)) : w));
  }
  return fitted;
}

/**
 * How many seasons a deal runs, by age: the first band whose `maxAge` covers them.
 * @param {import('./rng.js').Rng} rng @param {number} age @param {any} rules
 */
export function contractSeasons(rng, age, rules) {
  const band = rules.finances.contractSeasons.find((/** @type {any} */ b) => age <= b.maxAge) ?? rules.finances.contractSeasons.at(-1);
  return rng.int(band.min, band.max);
}

/**
 * A rookie deal's wage by overall pick (1 = the first pick): straight down from `rookieScale.first` to
 * `rookieScale.last` over the draft's picks.
 * @param {number} pick @param {number} picks  How many picks the draft has. @param {any} rules
 */
export function rookieWage(pick, picks, rules) {
  const { first, last } = rules.finances.rookieScale;
  return Math.round(picks <= 1 ? first : first + ((last - first) * (pick - 1)) / (picks - 1));
}

/**
 * How far each team is going (Task 232): its best five's average overall as its roster stands now, from 0 (the league's
 * weakest) to 1 (its strongest). Not last season's table, so a rising team draws winning-minded players too.
 * @param {import('./league.js').League} league @param {any} positions
 * @returns {Map<string, number>}
 */
export function outlooks(league, positions) {
  const strength = Object.keys(league.teams).map((id) => {
    const best = league.teams[id].roster.map((/** @type {string} */ pid) => overall(league.players[pid], positions))
      .sort((/** @type {number} */ a, /** @type {number} */ b) => b - a).slice(0, 5);
    return /** @type {[string, number]} */ ([id, best.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / Math.max(1, best.length)]);
  });
  const lo = Math.min(...strength.map((x) => x[1]));
  const hi = Math.max(...strength.map((x) => x[1]));
  return new Map(strength.map(([id, v]) => [id, hi > lo ? (v - lo) / (hi - lo) : 0.5]));
}

/**
 * What a team offers a player (Task 232): the market wage if it has the room; with less, what room it has down to
 * `offerFloor` of the market; otherwise nothing (null). A team with `overMarket.roomShare` of the cap free offers up to
 * `overMarket.premium` above the market for a player worth at least `overMarket.fromWage`, never over the maximum contract.
 * @param {number} market @param {number} room @param {any} rules
 * @returns {number | null}
 */
export function offerFor(market, room, rules) {
  const { offerFloor, overMarket } = rules.motives;
  const f = rules.finances;
  if (overMarket.premium > 0 && market >= overMarket.fromWage && room >= overMarket.roomShare * f.cap) {
    return Math.round(Math.min(room, f.maxContractShare * f.cap, market * (1 + overMarket.premium)));
  }
  if (room >= market) return market;
  if (room >= offerFloor * market) return Math.round(room);
  return null;
}

/**
 * How a player rates an offer (Task 232): the wage, raised by what he wants. Winning-minded: `winningPremium` times how
 * far the team is going; home-minded: `homePremium` for their region's team; anyone: `familiarity` for the club he's
 * just left. So a bonus is worth a pay cut of up to that share.
 * @param {import('./players.js').Player} p @param {{ teamId: string, region: string, wage: number }} offer
 * @param {{ season: number, outlook: Map<string, number>, formerTeamId: string | undefined, rules: any }} ctx
 */
export function offerScore(p, offer, { season, outlook, formerTeamId, rules }) {
  const m = rules.motives;
  const motive = motiveOf(p, season, rules);
  let lift = 0;
  if (motive === 'winning') lift += m.winningPremium * (outlook.get(offer.teamId) ?? 0);
  if (motive === 'home' && offer.region === p.region) lift += m.homePremium;
  if (offer.teamId === formerTeamId) lift += m.familiarity;
  return offer.wage * (1 + lift);
}
