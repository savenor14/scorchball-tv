// Players: overall rating, attribute generation and names. See docs/simulation.md §5–6.
import { clamp, withoutComments } from '../util.js';

/**
 * @typedef {object} Player
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} region
 * @property {number} birthSeason     Age = current season − birthSeason.
 * @property {string} position        K | D | P | S
 * @property {Record<string, number>} attributes  1–99 each.
 * @property {number} potential       Hidden target peak overall.
 * @property {number} peakAge
 * @property {string | null} teamId   null = free agent.
 * @property {{ matchesOut: number, seasonEnding: boolean } | null} injury
 * @property {{ season: number, round: number, pick: number, teamId: string } | null} draft
 * @property {'active' | 'retired'} status
 * @property {number} joinedSeason      First season in the league (1 for the original players). Career length = last season − joinedSeason + 1.
 * @property {number} seasonsUnsigned   Consecutive off-seasons spent as a free agent.
 * @property {number | null} reserveUntil  In their team's reserves (the Kindling League, Task 194b), the last season
 *   the team holds their rights; null otherwise. A reserve keeps `teamId` but isn't on the roster.
 * @property {number | null} debutSeason  The season of their first League match (started or came on); null until then (Task 230).
 * @property {{ money: number, winning: number, home: number }} motives  Their hidden personality (Task 232): three weights
 *   drawn once; age nudges them and the strongest is what they want (motiveOf). Never on screen.
 * @property {{ wage: number, until: number } | null} contract  Their deal (Task 231): the wage a season, in thousands, and the
 *   last season it covers. null for a free agent. A reserve keeps their rookie deal (off the cap).
 */

/**
 * A rookie (Task 230, Tom): a drafted player in their first League season, who had never played a League match before
 * it. A Kindling League call-up who hasn't played counts; a founding or made-up player, never drafted, never does.
 * @param {Pick<Player, 'draft' | 'debutSeason'>} p @param {number} season
 */
export function isRookie(p, season) {
  return p.draft !== null && (p.debutSeason === null || p.debutSeason === season);
}

/**
 * A player's overall rating at their position: the position-weighted average of attributes (not rounded).
 * @param {Pick<Player, 'position' | 'attributes'>} player
 * @param {any} positions  data/positions.json
 */
export function overall(player, positions) {
  return weightedSum(player.attributes, withoutComments(positions.overallWeights[player.position]));
}

/**
 * What a player wants this season (Task 232, Tom): money (the biggest offer), winning (a team going places) or home (their
 * region's team). Their personality's three weights, nudged by age: every season past `pivotAge` takes `agePerSeason`
 * from money and gives it to winning (before it, the other way); home has `homeBias`. The strongest wins. So a strong
 * home-lover stays one, a balanced player tips from money to winning in his late twenties, a born money-chaser may never.
 * @param {Pick<Player, 'motives' | 'birthSeason'>} p @param {number} season @param {any} rules
 * @returns {'money' | 'winning' | 'home'}
 */
export function motiveOf(p, season, rules) {
  const m = rules.motives;
  const nudge = m.agePerSeason * (season - p.birthSeason - m.pivotAge);
  const money = p.motives.money - nudge;
  const winning = p.motives.winning + nudge;
  const home = p.motives.home + m.homeBias;
  return money >= winning && money >= home ? 'money' : winning >= home ? 'winning' : 'home';
}

/**
 * How much a team wants a player: current overall, plus half the remaining growth for players still developing.
 * Also what a player is paid on the market (finances.js marketWage).
 * @param {Player} p @param {number} season @param {any} positions
 */
export function playerValue(p, season, positions) {
  const now = overall(p, positions);
  const age = season - p.birthSeason;
  return age < p.peakAge ? now + Math.max(0, p.potential - now) / 2 : now;
}

/**
 * Generate attributes for a position whose overall lands on `target` (within rounding).
 * Attributes the position cares about cluster around the target; the rest sit lower.
 * @param {import('./rng.js').Rng} rng
 * @param {string} position
 * @param {number} target
 * @param {{ positions: any, rules: any }} config
 * @returns {Record<string, number>}
 */
export function generateAttributes(rng, position, target, { positions, rules }) {
  const g = rules.generation;
  const weights = withoutComments(positions.overallWeights[position]);
  const specialists = withoutComments(g.specialists);
  /** @type {Record<string, number>} */
  const raw = {};
  for (const a of positions.attributes) {
    const specialist = specialists[a];
    if (specialist && specialist.position !== position) raw[a] = rng.normal(specialist.othersMean, specialist.othersSd);
    else if (weights[a] > 0) raw[a] = rng.normal(target, g.weightedSd);
    else raw[a] = rng.normal(target - g.unweightedGap, g.unweightedSd);
  }
  /** @type {Record<string, number>} */
  const attrs = {};
  // Weights sum to 1, so shifting every weighted attribute by d shifts the overall by d.
  // Repeat a few times because clamping to 1–99 and rounding can leave a small gap.
  for (let pass = 0; pass < 4; pass++) {
    for (const a of positions.attributes) attrs[a] = Math.round(clamp(raw[a], 1, 99));
    const diff = target - weightedSum(attrs, weights);
    if (Math.abs(diff) < 0.5) break;
    for (const a of Object.keys(weights)) raw[a] += diff;
  }
  return attrs;
}

/**
 * Pick a first and last name from a region that no active player already has. Given the surnames in use (Task 201,
 * Tom: the screens write "C. Penhallow", so two Penhallows looked alike), it keeps drawing for a surname nobody active
 * has, up to SURNAME_TRIES; then any full name not in use. With about 70 surnames a region and about 35 active players
 * from each, a free one nearly always turns up.
 * @param {import('./rng.js').Rng} rng
 * @param {{ id: string, firstNames: string[], lastNames: string[] }} region
 * @param {Set<string>} taken  Full names in use; the chosen name is added to it.
 * @param {Set<string>} [surnames]  Surnames in use; the chosen one is added to it.
 * @returns {{ firstName: string, lastName: string }}
 */
export function pickName(rng, region, taken, surnames) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const firstName = rng.pick(region.firstNames);
    const lastName = rng.pick(region.lastNames);
    const full = `${firstName} ${lastName}`;
    if (surnames && attempt < SURNAME_TRIES && surnames.has(lastName)) continue;
    if (!taken.has(full)) {
      taken.add(full);
      surnames?.add(lastName);
      return { firstName, lastName };
    }
  }
  throw new Error(`Ran out of unused names in region "${region.id}"; add more names to data/regions.json`);
}

/** How many draws pickName makes for a surname no active player has before settling for any unused full name. */
const SURNAME_TRIES = 100;

/** @param {Record<string, number>} attrs @param {Record<string, number>} weights */
function weightedSum(attrs, weights) {
  let total = 0;
  for (const [a, w] of Object.entries(weights)) total += w * attrs[a];
  return total;
}
