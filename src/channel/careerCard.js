// The desk's career card (It remembers, Task 226; docs/channel.md §20.8): a studio card on one player's career, whose
// focus cycles each time its slot comes up: a star from the next match's teams, or a milestone in sight (Tom, Task 226:
// a recent player of the match was dropped, as it might not be an interesting player). Pure: reads the chronicle (only what has aired) and the config;
// the contents are the player card's (playerCard.js), with why this player and the card's focus.
import { withoutComments } from '../util.js';
import { statOf } from '../chronicle/chronicle.js';
import { playerCard } from './playerCard.js';

/** The focuses, in the order they cycle. */
export const CAREER_FOCUSES = /** @type {const} */ (['star', 'milestone']);

/** @typedef {typeof CAREER_FOCUSES[number]} CareerFocus */

/**
 * @typedef {object} CareerWhy  Why this player, for the card's line.
 * @property {CareerFocus} focus
 * @property {string} [stat]  milestone: goals, assists, saves, stops or appearances.
 * @property {number} [target]  milestone: the next multiple (300).
 * @property {number} [left]  milestone: how many to go.
 */

/**
 * Seasons played (a line in the regular season or the playoffs). @param {import('../chronicle/chronicle.js').PlayerRecord} p
 */
const seasonsPlayed = (p) => Object.values(p.seasons).filter((s) => s.regular || s.playoffs).length;

/**
 * Who the card is about for a focus, and why; null when nobody fits it (the slot tries the next focus).
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle @param {import('../config.js').Config} config
 * @param {CareerFocus} focus @param {{ teamIds: string[] }} o  The next match's teams (for the star).
 * @returns {{ playerId: string, why: CareerWhy } | null}
 */
export function careerPick(chronicle, config, focus, { teamIds }) {
  const opts = withoutComments(config.chronicle.careerCard);
  const players = [...chronicle.players.values()];
  const qualifies = (/** @type {import('../chronicle/chronicle.js').PlayerRecord} */ p) => p.status === 'roster' && seasonsPlayed(p) >= opts.minSeasons;
  // The latest season started on screen (a prospect's overall is already kept for the season after).
  const now = Math.max(0, ...[...chronicle.seasons.values()].filter((e) => e.teamIds.length).map((e) => e.season));
  if (focus === 'star') {
    // The best now (their overall: never shown, vision §9) of the next match's teams.
    const best = players.filter((p) => qualifies(p) && p.teamId && teamIds.includes(p.teamId))
      .sort((a, b) => (b.overall[now] ?? 0) - (a.overall[now] ?? 0) || a.id.localeCompare(b.id))[0];
    return best ? { playerId: best.id, why: { focus } } : null;
  }
  // A milestone in sight: the closest, as a share of its step, within milestoneWithin of it.
  const steps = Object.entries(withoutComments(config.chronicle.milestones));
  const gamesFrom = config.chronicle.latest.appearancesFrom;
  let pick = /** @type {{ playerId: string, why: CareerWhy, share: number } | null} */ (null);
  for (const p of players) {
    if (p.status !== 'roster') continue;
    for (const [stat, step] of steps) {
      const have = statOf(p.totals, stat);
      const target = (Math.floor(have / step) + 1) * step;
      if (stat === 'appearances' && target < gamesFrom) continue;
      const left = target - have;
      const share = left / step;
      if (have === 0 || share > opts.milestoneWithin) continue;
      if (!pick || share < pick.share || (share === pick.share && p.id < pick.playerId)) pick = { playerId: p.id, why: { focus, stat, target, left }, share };
    }
  }
  return pick && { playerId: pick.playerId, why: pick.why };
}

/**
 * The card for its slot: the focus is the rotation's turn, falling through to the next focus when nobody fits it;
 * null when none does (a young league: the slot shows another card).
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle @param {import('../config.js').Config} config
 * @param {number} rotation @param {{ teamIds: string[] }} o
 */
export function careerCard(chronicle, config, rotation, o) {
  for (let k = 0; k < CAREER_FOCUSES.length; k++) {
    const focus = CAREER_FOCUSES[(((rotation + k) % CAREER_FOCUSES.length) + CAREER_FOCUSES.length) % CAREER_FOCUSES.length];
    const picked = careerPick(chronicle, config, focus, o);
    if (picked) return { why: picked.why, player: playerCard(chronicle, config, picked.playerId) };
  }
  return null;
}
