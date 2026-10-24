// Player of the match: their stat line and what they say (who gets it: src/sim/potm.js). Pure and DOM-free. See docs/channel.md §7a.
// The weights and quotes are data (data/interviews.json). The quote is text for now, shown in a speech bubble; voices
// or AI-written quotes can replace it later without changing the segment.
import { createRng } from '../sim/rng.js';
import { winnerOf } from '../sim/potm.js';

// Who gets it lives in the sim (Task 214: logged as player_of_the_match); re-exported for the channel's callers.
export { playerOfTheMatch, winnerOf } from '../sim/potm.js';

/**
 * @typedef {import('../sim/match.js').PlayerStats} PlayerStats
 * @typedef {import('../sim/potm.js').Pick} Pick
 * @typedef {'win' | 'draw' | 'loss'} Outcome
 */

/**
 * The stat line under their name, e.g. "2 goals (1 scorcher) · 1 assist" or "7 saves".
 * @param {PlayerStats} s
 */
export function statLine(s) {
  const n = (/** @type {number} */ k, /** @type {string} */ one) => `${k} ${one}${k === 1 ? '' : 's'}`;
  /** @type {string[]} */
  const parts = [];
  if (s.goals > 0) parts.push(`${n(s.goals, 'goal')}${s.scorchers > 0 ? ` (${n(s.scorchers, 'scorcher')})` : ''}`);
  if (s.assists > 0) parts.push(n(s.assists, 'assist'));
  if (s.saves > 0) parts.push(n(s.saves, 'save'));
  if (s.tackles > 0) parts.push(n(s.tackles, 'tackle'));
  if (parts.length < 2 && s.shotsOnTarget > 0) parts.push(`${s.shotsOnTarget} on target`);
  return parts.join(' · ') || 'A tireless shift';
}

/**
 * Which quote the player of the match gets (by role, the result from their side and a seeded roll), and its clip's key
 * (Task 135): "<role>-<result>-<index>".
 * @param {Pick} pick @param {{ id: string, homeId: string, awayId: string, summary: import('../sim/match.js').MatchSummary }} m
 * @param {Record<'scorer' | 'keeper' | 'other', Record<Outcome, string[]>>} quotes @param {boolean} isKeeper
 */
export function quoteChoice(pick, m, quotes, isKeeper) {
  const winner = winnerOf(m);
  /** @type {Outcome} */
  const outcome = winner === null ? 'draw' : winner === pick.teamId ? 'win' : 'loss';
  const role = pick.stats.goals > 0 ? 'scorer' : isKeeper ? 'keeper' : 'other';
  const list = quotes[role][outcome];
  const index = createRng(`${m.id}|potm-quote`).int(0, list.length - 1);
  return { line: list[index], key: `${role}-${outcome}-${index}` };
}

/**
 * Their canned interview line: by role (scored, the keeper, anyone else) and the result from their side, picked with
 * a seeded roll, with the placeholders filled in.
 * @param {Pick} pick
 * @param {{ id: string, homeId: string, awayId: string, summary: import('../sim/match.js').MatchSummary }} m
 * @param {Record<'scorer' | 'keeper' | 'other', Record<Outcome, string[]>>} quotes  interviews.quotes
 * @param {{ isKeeper: boolean, teamName: (id: string) => string, city: (id: string) => string }} ctx
 */
export function potmQuote(pick, m, quotes, { isKeeper, teamName, city }) {
  const { line } = quoteChoice(pick, m, quotes, isKeeper);
  const opponent = pick.teamId === m.homeId ? m.awayId : m.homeId;
  const fill = /** @type {Record<string, string>} */ ({
    team: teamName(pick.teamId),
    opponent: teamName(opponent),
    city: city(pick.teamId),
    goals: pick.stats.goals === 1 ? 'one goal' : `${pick.stats.goals} goals`,
    saves: String(pick.stats.saves),
    assists: String(pick.stats.assists),
  });
  const text = line.replace(/\{(\w+)\}/g, (all, key) => fill[key] ?? all);
  return text[0].toUpperCase() + text.slice(1);
}
