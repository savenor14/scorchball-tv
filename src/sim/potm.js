// Player of the match: who gets it (Task 214: moved here from the channel, so the sim logs it and the record books
// can count it). Pure; the pick uses its own seeded stream (the match id), so logging it changes no results.
// The weights are data (data/interviews.json potm). The stat line and quotes stay in src/channel/potm.js.
import { winnerOf as summaryWinner } from './match.js';
import { createRng } from './rng.js';

/**
 * @typedef {import('./match.js').PlayerStats} PlayerStats
 * @typedef {{ playerId: string, teamId: string, score: number, stats: PlayerStats }} Pick
 */

/**
 * Which team won, shootouts included; null for a draw.
 * @param {{ homeId: string, awayId: string, summary: import('./match.js').MatchSummary }} m
 * @returns {string | null}
 */
export function winnerOf(m) {
  return summaryWinner({ homeId: m.homeId, awayId: m.awayId, result: m.summary.result });
}

/**
 * The player of the match: the highest weighted score from their match stats, plus a bonus for the winning side.
 * Ties go to the winning side, then a seeded pick, so every screen agrees.
 * @param {{ id: string, homeId: string, awayId: string, summary: import('./match.js').MatchSummary }} m
 * @param {{ weights: Record<string, number>, winBonus: number }} potm  interviews.potm
 * @returns {Pick}
 */
export function playerOfTheMatch(m, { weights, winBonus }) {
  const winner = winnerOf(m);
  const rng = createRng(`${m.id}|potm`);
  /** @type {(Pick & { tie: number, won: boolean })[]} */
  const scored = Object.entries(m.summary.playerStats).map(([playerId, stats]) => {
    let score = 0;
    for (const [key, w] of Object.entries(weights)) score += w * /** @type {number} */ (/** @type {any} */ (stats)[key] ?? 0);
    const won = stats.teamId === winner;
    if (won) score += winBonus;
    return { playerId, teamId: stats.teamId, score, stats, won, tie: rng.float(0, 1) };
  });
  scored.sort((a, b) => b.score - a.score || Number(b.won) - Number(a.won) || b.tie - a.tie);
  const { playerId, teamId, score, stats } = scored[0];
  return { playerId, teamId, score, stats };
}

/**
 * The player of the day (the share card; Tom, 2026-10-22): across a day's matches, each player's player-of-the-match
 * scores added up (most teams play two or three a day, so a whole day's work counts), their stats summed. Ties go to
 * a seeded pick by the day, so every screen agrees. Not logged: worked out from the matches, it changes no results.
 * @param {{ id: string, homeId: string, awayId: string, summary: import('./match.js').MatchSummary }[]} matches
 * @param {{ weights: Record<string, number>, winBonus: number }} potm  interviews.potm
 * @param {string} dayKey  e.g. "s2d3", for the tie-break.
 * @returns {{ playerId: string, teamId: string, score: number, matches: number, stats: Record<string, number> } | null}
 */
export function playerOfTheDay(matches, { weights, winBonus }, dayKey) {
  /** @type {Map<string, { playerId: string, teamId: string, score: number, matches: number, stats: Record<string, number> }>} */
  const by = new Map();
  for (const m of matches) {
    const winner = winnerOf(m);
    for (const [playerId, stats] of Object.entries(m.summary.playerStats)) {
      if (!stats.secondsPlayed) continue;
      let score = stats.teamId === winner ? winBonus : 0;
      for (const [key, w] of Object.entries(weights)) score += w * /** @type {number} */ (/** @type {any} */ (stats)[key] ?? 0);
      const row = by.get(playerId) ?? { playerId, teamId: stats.teamId, score: 0, matches: 0, stats: {} };
      row.score += score;
      row.matches++;
      for (const [k, v] of Object.entries(stats)) if (typeof v === 'number') row.stats[k] = (row.stats[k] ?? 0) + v;
      by.set(playerId, row);
    }
  }
  if (!by.size) return null;
  const rng = createRng(`${dayKey}|potd`);
  const rows = [...by.values()].map((r) => ({ r, tie: rng.float(0, 1) }));
  rows.sort((a, b) => b.r.score - a.r.score || b.tie - a.tie);
  return rows[0].r;
}
