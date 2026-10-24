// Which kit each team wears in a match: the kit-clash rule (docs/channel.md §9). Pure and DOM-free.
// Teams wear their primary colour with the secondary as trim. If the two primaries are closer than
// settings.kits.clashDistance, the away team changes: it wears its secondary as the shirt and its primary as trim.

/**
 * @typedef {{ primary: string, secondary: string }} Kit
 * @typedef {{ home: Kit, away: Kit, awayChanged: boolean, distance: number }} MatchKits
 *   `distance`: between the two primaries, before any change.
 */

/** "#1FA3A3" → [31, 163, 163]. @param {string} hex */
function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/**
 * Straight-line distance between two colours in RGB, from 0 (identical) to about 442 (black to white).
 * @param {string} a @param {string} b  "#RRGGBB"
 */
export function colourDistance(a, b) {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * The kits for a match. The away team only changes if its change kit is actually further from the home shirt.
 * @param {Kit} home @param {Kit} away
 * @param {number} clashDistance  settings.kits.clashDistance
 * @returns {MatchKits}
 */
export function matchKits(home, away, clashDistance) {
  const distance = colourDistance(home.primary, away.primary);
  const change = distance < clashDistance && colourDistance(home.primary, away.secondary) > distance;
  return {
    home,
    away: change ? { primary: away.secondary, secondary: away.primary } : away,
    awayChanged: change,
    distance,
  };
}
