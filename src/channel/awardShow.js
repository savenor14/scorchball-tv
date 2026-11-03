// The awards on air (the off-season show, Task 191; docs/channel.md §19.2; Tom's pick B on offseason.html): which
// awards air and in what order, what each shows (the prize, what it's for, the winner and their stat, the two
// runners-up) and when (its beats). Pure and DOM-free: everything comes from the sim's `award` events (sim/awards.js),
// so the screen shows exactly what the sim decided. awardArt.js draws it.
import { quellsAGame } from '../chronicle/chronicle.js';

/**
 * @typedef {object} AwardView
 * @property {string} id  The sim's award id (data/rules.json awards).
 * @property {string} name  "The Ember Boot".
 * @property {string} forWhat  "MOST GOALS".
 * @property {{ playerId: string, name: string, teamId: string, stat: string }} winner
 * @property {{ playerId: string, name: string, teamId: string, stat: string }[]} shortlist  The next two, best first.
 */

/** What each award is for, as the card says it. */
const FOR_WHAT = /** @type {Record<string, string>} */ ({ rookieBlend: 'BEST ROOKIE', positionBlend: 'BEST', goals: 'MOST GOALS', scorchers: 'MOST SCORCHERS', assists: 'MOST ASSISTS', stops: 'MOST QUELLS', savePct: 'BEST SAVE %', saves: 'MOST SAVES', tackles: 'MOST TACKLES', blocks: 'MOST BLOCKS' });
const UNIT = /** @type {Record<string, string>} */ ({ goals: 'GOALS', scorchers: 'SCORCHERS', assists: 'ASSISTS', stops: 'QUELLS', saves: 'SAVES', tackles: 'TACKLES', blocks: 'BLOCKS' });

/**
 * A rookie's season as the Spark's card shows it (Task 252), in what their position does: a striker's goals and
 * assists, a midfielder's assists and goals, a defender's quells a game (Q, as the cards) and assists (their total, before Tom's
 * 2026-11-03, isn't shown: without the games, their assists and goals), a keeper's save percentage. The blend that chose
 * them stays off screen.
 * @param {import('../sim/awards.js').SeasonLine} line @param {number} [games]  Their regular-season games.
 */
export function rookieLineText(line, games = line.games ?? 0) {
  const n = (/** @type {number} */ v, /** @type {string} */ unit) => `${v} ${v === 1 ? unit.replace(/S$/, '') : unit}`;
  if (line.position === 'K') return `${statText('savePct', line.faced > 0 ? line.saves / line.faced : 0)} · ${line.saves} OF ${line.faced}`;
  if (line.position === 'D') return games > 0 ? `${quellsAGame(line.stops, games)} Q · ${n(line.assists, 'ASSISTS')}` : `${n(line.assists, 'ASSISTS')} · ${n(line.goals, 'GOALS')}`;
  if (line.position === 'M') return `${n(line.assists, 'ASSISTS')} · ${n(line.goals, 'GOALS')}`;
  return `${n(line.goals, 'GOALS')} · ${n(line.assists, 'ASSISTS')}`;
}

/**
 * A season's award events, by award id.
 * @param {readonly import('../chronicle/eventLog.js').LeagueEvent[]} leagueEvents @param {number} season
 * @returns {Map<string, import('../chronicle/eventLog.js').LeagueEvent>}
 */
export function awardEvents(leagueEvents, season) {
  return new Map(leagueEvents.filter((e) => e.type === 'award' && e.season === season).map((e) => [/** @type {any} */ (e.data).award, e]));
}

/**
 * The awards that air, in settings.awards.order, leaving out any the sim didn't give.
 * @param {{ order: string[] }} settings @param {Map<string, unknown>} given
 */
export const awardOrder = (settings, given) => settings.order.filter((id) => given.has(id));

/**
 * A stat as the graphics show it: "35 GOALS", "77.6% SAVED".
 * @param {string} stat  The award's stat. @param {number} value
 */
export function statText(stat, value) {
  if (stat === 'savePct') return `${(value * 100).toFixed(1)}% SAVED`;
  return `${value} ${UNIT[stat] ?? stat.toUpperCase()}`;
}

/**
 * A defender's season as the Aegis shows it from season 5 (positionBlend, Tom 2026-11-03): their quells a game, goals and
 * assists, what the blend weighed, in the cards' letters (Q a game, G, A): in words it overran the plinth's card.
 * @param {import('../sim/awards.js').SeasonLine} line
 */
export function positionLineText(line) {
  return `${quellsAGame(line.stops, line.games ?? 0)} Q · ${line.goals} G · ${line.assists} A`;
}

/**
 * What an award shows.
 * @param {import('../chronicle/eventLog.js').LeagueEvent} event  Its `award` event.
 * @param {{ list: { id: string, name: string, stat: string, positions?: string[] }[] }} awards  Its season's awards (seasonConfig's rules.awards).
 * @param {(playerId: string) => string} nameOf  A player's full name.
 * @param {(position: string) => string} positionName  "DEFENDERS" for "D".
 * @param {(playerId: string) => number} [gamesOf]  A player's regular-season games that season (the Spark's defenders).
 * @returns {AwardView}
 */
export function awardView(event, awards, nameOf, positionName, gamesOf = () => 0) {
  const d = /** @type {any} */ (event.data);
  const spec = /** @type {{ id: string, name: string, stat: string, positions?: string[] }} */ (awards.list.find((a) => a.id === d.award));
  const best = spec.stat === 'positionBlend';
  // The best defender (positionBlend) says its position in the singular: BEST DEFENDER.
  const who = best ? ` ${(spec.positions ?? []).map((p) => positionName(p).replace(/S$/, '')).join(' & ')}` : spec.positions ? ` · ${spec.positions.map(positionName).join(' & ')}` : '';
  const blend = spec.stat === 'rookieBlend';
  /** @param {string} playerId @param {any} line @param {number} value */
  const statOfOne = (playerId, line, value) => (best ? positionLineText(line) : blend ? rookieLineText(line, line.games ?? gamesOf(playerId)) : statText(spec.stat, value));
  const winnerStat = spec.stat === 'savePct' ? `${statText('savePct', d.value)} · ${d.saves} OF ${d.faced}` : statOfOne(/** @type {string} */ (event.playerId), d.line, d.value);
  return {
    id: spec.id,
    name: spec.name,
    forWhat: `${FOR_WHAT[spec.stat] ?? spec.stat.toUpperCase()}${who}`,
    winner: { playerId: /** @type {string} */ (event.playerId), name: nameOf(/** @type {string} */ (event.playerId)), teamId: /** @type {string} */ (event.teamId), stat: winnerStat },
    shortlist: (d.shortlist ?? []).map((/** @type {{ playerId: string, teamId: string, value: number, line?: any }} */ s) => ({ playerId: s.playerId, name: nameOf(s.playerId), teamId: s.teamId, stat: statOfOne(s.playerId, s.line, s.value) })),
  };
}

/**
 * Where an award is, `since` ms into its segment: how many of the shortlist are named (the third-placed first), how
 * far the winner has stepped in (0 → 1) and whether they've lifted the prize.
 * @param {number} since @param {{ shortlistAt: number, secondAt: number, winnerAt: number, liftAt: number }} s  settings.awards
 */
export function awardBeats(since, s) {
  const sec = since / 1000;
  return {
    named: sec >= s.secondAt ? 2 : sec >= s.shortlistAt ? 1 : 0,
    stepIn: Math.min(1, Math.max(0, (sec - s.winnerAt) / 1.5)),
    lifted: sec >= s.liftAt,
  };
}
