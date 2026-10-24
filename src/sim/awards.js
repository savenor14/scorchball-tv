// The season's awards (the off-season show, Task 188; docs/simulation.md §6a): who led each award's stat over the
// regular season, among the positions it's open to. The awards are data (rules.awards.list); the off-season show
// presents them and It remembers keeps them, both reading the `award` events rather than working them out again.
// The Spark (Task 252) is the one that isn't a stat's leader: the best rookie, each against the regulars at their own
// position on a blend of what that position does.
import { isRookie } from './players.js';

/** The stats a blend can weigh (Task 252). savesAdded: saves above what the league's average keeper would have made. */
export const BLEND_STATS = Object.freeze(['goals', 'assists', 'scorchers', 'stops', 'tackles', 'blocks', 'savesAdded']);

/**
 * @typedef {object} Award
 * @property {string} award  Its id (rules.awards.list).
 * @property {string} playerId
 * @property {string} teamId  The team they last played for.
 * @property {number} value  The stat: a count, or for savePct a share (0–1).
 * @property {number} appearances
 * @property {number} [saves]  savePct only, with `faced`.
 * @property {number} [faced]  Shots on target faced: saves plus goals conceded.
 * @property {{ playerId: string, teamId: string, value: number, line?: SeasonLine }[]} shortlist  The next two in the stat,
 *   best first (Task 191: the plinth's card names them).
 * @property {string} [position]  rookieBlend only (the Spark), with `line`: the winner's position.
 * @property {SeasonLine} [line]  rookieBlend only: the winner's season in the stats a card shows by position. `value` is
 *   then their standing among the regulars at their position (0–1), kept but never shown.
 */

/**
 * A season in the stats the Spark's card picks from by position (Task 252).
 * @typedef {{ position: string, goals: number, assists: number, scorchers: number, stops: number, saves: number, faced: number }} SeasonLine
 */

/** @param {import('./standings.js').SeasonPlayerStats} t */
const facedOf = (t) => t.saves + t.conceded;

/**
 * An award's stat for a player's season.
 * @param {import('./standings.js').SeasonPlayerStats} t @param {string} stat
 */
function statOf(t, stat, leagueSavePct = 0) {
  if (stat === 'stops') return t.tackles + t.blocks;
  if (stat === 'savesAdded') return t.saves - leagueSavePct * facedOf(t);
  if (stat === 'savePct') return facedOf(t) > 0 ? t.saves / facedOf(t) : 0;
  return /** @type {number} */ (t[/** @type {keyof typeof t} */ (stat)]);
}

/**
 * The season's awards, in the list's order: each to the player with the most of its stat (above zero) among the
 * positions it's open to; for save percentage, only keepers who faced at least `minFacedShare` of the busiest keeper's
 * shots. Ties go to fewer appearances, then a seeded draw.
 * @param {Record<string, import('./standings.js').SeasonPlayerStats>} totals  The regular season's.
 * @param {Record<string, Pick<import('./players.js').Player, 'position' | 'draft' | 'debutSeason'>>} players
 * @param {{ list: AwardSpec[] }} awards  rules.awards
 * @param {import('./rng.js').Rng} rng  The season's awards stream (only drawn on for a tie).
 * @param {number} season  Who's a rookie (the Spark).
 * @returns {Award[]}
 */
export function seasonAwards(totals, players, awards, rng, season) {
  const all = Object.values(totals).sort((a, b) => a.playerId.localeCompare(b.playerId));
  const busiest = Math.max(0, ...all.map(facedOf));
  /** @type {Award[]} */
  const out = [];
  for (const a of awards.list) {
    if (a.stat === 'rookieBlend') {
      const spark = rookieAward(a, all, players, rng, season);
      if (spark) out.push(spark);
      continue;
    }
    const open = all.filter((t) => (!a.positions || a.positions.includes(players[t.playerId]?.position))
      && (a.minFacedShare === undefined || facedOf(t) >= a.minFacedShare * busiest));
    const scored = open.map((t) => ({ t, value: statOf(t, a.stat) })).filter((x) => x.value > 0);
    if (scored.length === 0) continue;
    const best = Math.max(...scored.map((x) => x.value));
    const top = scored.filter((x) => x.value === best);
    const fewest = Math.min(...top.map((x) => x.t.appearances));
    const tied = top.filter((x) => x.t.appearances === fewest);
    const { t, value } = tied.length === 1 ? tied[0] : rng.pick(tied);
    // A share to four places (its saves and shots faced are kept for the exact figure).
    const shown = (/** @type {number} */ v) => (a.stat === 'savePct' ? Math.round(v * 10_000) / 10_000 : v);
    const rest = scored.filter((x) => x.t !== t)
      .sort((x, y) => y.value - x.value || x.t.appearances - y.t.appearances || x.t.playerId.localeCompare(y.t.playerId));
    // oneATeam (the Ironclad, Tom 2026-10-18): the runners-up from other teams, one a team, while enough teams qualify.
    const teams = new Set([t.teamId]);
    const others = a.oneATeam ? rest.filter((x) => !teams.has(x.t.teamId) && teams.add(x.t.teamId)) : rest;
    const shortlist = [...others, ...rest.filter((x) => !others.includes(x))]
      .slice(0, 2).map((x) => ({ playerId: x.t.playerId, teamId: x.t.teamId, value: shown(x.value) }));
    out.push({
      award: a.id, playerId: t.playerId, teamId: t.teamId, value: shown(value), appearances: t.appearances,
      ...(a.stat === 'savePct' ? { saves: t.saves, faced: facedOf(t) } : {}),
      shortlist,
    });
  }
  return out;
}

/** @typedef {{ id: string, stat: string, positions?: string[], minFacedShare?: number, oneATeam?: boolean, blend?: Record<string, Record<string, number>>, minMinutesShare?: number }} AwardSpec */

/** @param {import('./standings.js').SeasonPlayerStats} t @param {string} position @returns {SeasonLine} */
const lineOf = (t, position) => ({ position, goals: t.goals, assists: t.assists, scorchers: t.scorchers, stops: t.tackles + t.blocks, saves: t.saves, faced: facedOf(t) });

/**
 * The Spark (Task 252): the best rookie of the regular season. Each player with at least `minMinutesShare` of the most
 * minutes anyone played is scored on their position's blend: each stat measured against the regulars at their position
 * (how many spreads above or below their average), weighted by how much it counts there, so a midfielder's hundred-odd
 * stops don't drown out their goals. A rookie's standing is the share of the other regulars at their position they
 * scored above. The best standing wins; ties go to more minutes, then a draw.
 * None in a season without rookies (the founding one).
 * @param {AwardSpec} a @param {import('./standings.js').SeasonPlayerStats[]} all  Sorted by id.
 * @param {Record<string, Pick<import('./players.js').Player, 'position' | 'draft' | 'debutSeason'>>} players
 * @param {import('./rng.js').Rng} rng @param {number} season
 * @returns {Award | null}
 */
function rookieAward(a, all, players, rng, season) {
  const blend = /** @type {Record<string, Record<string, number>>} */ (a.blend);
  const most = Math.max(0, ...all.map((t) => t.minutes));
  const regulars = all.filter((t) => players[t.playerId] && t.minutes >= /** @type {number} */ (a.minMinutesShare) * most);
  const faced = regulars.reduce((n, t) => n + facedOf(t), 0);
  const leagueSavePct = faced > 0 ? regulars.reduce((n, t) => n + t.saves, 0) / faced : 0;
  // Each position's average and spread in each of its blend's stats.
  /** @type {Map<string, number>} */
  const mean = new Map();
  /** @type {Map<string, number>} */
  const spread = new Map();
  for (const [position, weights] of Object.entries(blend)) {
    const peers = regulars.filter((t) => players[t.playerId].position === position);
    for (const stat of Object.keys(weights)) {
      const xs = peers.map((t) => statOf(t, stat, leagueSavePct));
      const m = xs.reduce((n, x) => n + x, 0) / Math.max(1, xs.length);
      mean.set(`${position}.${stat}`, m);
      spread.set(`${position}.${stat}`, Math.sqrt(xs.reduce((n, x) => n + (x - m) * (x - m), 0) / Math.max(1, xs.length)) || 1);
    }
  }
  /** @param {import('./standings.js').SeasonPlayerStats} t */
  const score = (t) => {
    const position = players[t.playerId].position;
    return Object.entries(blend[position] ?? {}).reduce((n, [stat, w]) => {
      const key = `${position}.${stat}`;
      return n + (w * (statOf(t, stat, leagueSavePct) - /** @type {number} */ (mean.get(key)))) / /** @type {number} */ (spread.get(key));
    }, 0);
  };
  const scores = new Map(regulars.map((t) => [t, score(t)]));
  const rookies = regulars.filter((t) => isRookie(players[t.playerId], season)).map((t) => {
    const peers = regulars.filter((o) => o !== t && players[o.playerId].position === players[t.playerId].position);
    const above = peers.filter((o) => /** @type {number} */ (scores.get(o)) < /** @type {number} */ (scores.get(t))).length;
    return { t, value: peers.length > 0 ? Math.round((above / peers.length) * 10_000) / 10_000 : 0 };
  });
  if (rookies.length === 0) return null;
  const order = (/** @type {{ t: any, value: number }} */ x, /** @type {{ t: any, value: number }} */ y) => y.value - x.value || y.t.minutes - x.t.minutes;
  rookies.sort(order);
  const tied = rookies.filter((x) => order(x, rookies[0]) === 0);
  const best = tied.length === 1 ? tied[0] : rng.pick(tied);
  const position = players[best.t.playerId].position;
  return {
    award: a.id, playerId: best.t.playerId, teamId: best.t.teamId, value: best.value, appearances: best.t.appearances,
    position, line: lineOf(best.t, position),
    shortlist: rookies.filter((x) => x !== best).slice(0, 2)
      .map((x) => ({ playerId: x.t.playerId, teamId: x.t.teamId, value: x.value, line: lineOf(x.t, players[x.t.playerId].position) })),
  };
}
