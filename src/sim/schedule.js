// Regular-season schedule: a double round-robin. See docs/sport.md §12 and docs/vision.md §5.
//
// Circle method: one team stays fixed while the rest rotate, giving n−1 rounds where everyone meets once.
// Home/away rule: the fixed team alternates by round; the other pairs alternate by board position.
// The second half replays the first with home and away swapped, shifted by one round. That shift gives:
//   - every team 3–4 home games per half (with 8 teams) and exactly half its games at home overall,
//   - never more than 2 home or 2 away games in a row,
//   - the two meetings of any pair n−2 rounds apart (6 with 8 teams), so no back-to-back rematches.

/**
 * @typedef {object} Match
 * @property {string} id         e.g. "s3-r7-m2"
 * @property {number} season
 * @property {string} stage      "regular"
 * @property {number} round
 * @property {string} homeId
 * @property {string} awayId
 * @property {boolean} neutral
 * @property {{ homeGoals: number, awayGoals: number, decidedBy: string } | null} result  Filled in once played.
 */

/** @typedef {{ round: number, matches: Match[] }} Round */

/**
 * Build a season's regular-season schedule. Team order is shuffled first, so each season's fixtures differ.
 * @param {string[]} teamIds   An even number of unique ids.
 * @param {number} season
 * @param {import('./rng.js').Rng} rng  Use the season's "schedule" stream.
 * @returns {Round[]}
 */
export function createSchedule(teamIds, season, rng) {
  const n = teamIds.length;
  if (n < 2 || n % 2 !== 0) throw new RangeError(`Need an even number of teams (at least 2), got ${n}`);
  if (new Set(teamIds).size !== n) throw new RangeError('Team ids must be unique');

  const teams = rng.shuffle(teamIds);
  const [fixed, ...others] = teams;

  /** @type {[string, string][][]} */
  const firstHalf = [];
  for (let r = 0; r < n - 1; r++) {
    const board = [fixed, ...others.slice(r), ...others.slice(0, r)];
    /** @type {[string, string][]} */
    const pairs = [];
    for (let i = 0; i < n / 2; i++) {
      const a = board[i];
      const b = board[n - 1 - i];
      const aAtHome = i === 0 ? r % 2 === 0 : i % 2 === 1;
      pairs.push(aAtHome ? [a, b] : [b, a]);
    }
    firstHalf.push(pairs);
  }

  const secondHalf = [...firstHalf.slice(1), firstHalf[0]].map((pairs) =>
    pairs.map(([home, away]) => /** @type {[string, string]} */ ([away, home])));

  return [...firstHalf, ...secondHalf].map((pairs, r) => ({
    round: r + 1,
    matches: pairs.map(([homeId, awayId], m) => ({
      id: `s${season}-r${r + 1}-m${m + 1}`,
      season,
      stage: 'regular',
      round: r + 1,
      homeId,
      awayId,
      neutral: false,
      result: null,
    })),
  }));
}
