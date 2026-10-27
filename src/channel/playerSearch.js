// FIND A PLAYER (Tom, 2026-10-27; docs/channel.md §20): the CHRONICLE's search, pure. Every player the chronicle holds
// (only what has aired: anyone who has played on screen, retired players too), matched on any part of their name once
// the query is minLetters long, the most-played first. Drawn by overlays/chroniclePane.js.

/**
 * @typedef {object} PlayerHit
 * @property {string} id
 * @property {string} name  "K. Penhallow".
 * @property {string | null} teamId  Their club now, or the last they played for (its swatch).
 * @property {'team' | 'free' | 'retired'} status
 */

/**
 * The players whose names contain `query` (any case, spaces at the ends ignored), most appearances first, then by name.
 * @param {{ players: Map<string, { totals: { appearances: number }, seasons: Record<number, { regular?: { teamId: string } | null, playoffs?: { teamId: string } | null }> }> }} chronicle
 * @param {{ players: Record<string, { firstName: string, lastName: string, teamId: string | null, status: string }> }} league
 * @param {string} query
 * @param {{ minLetters: number, shown: number }} opts  settings.chronicle.search
 * @returns {{ state: 'empty' | 'short' | 'none' | 'hits', hits: PlayerHit[], more: number }}
 */
export function findPlayers(chronicle, league, query, { minLetters, shown }) {
  const q = query.trim().toLowerCase();
  if (!q) return { state: 'empty', hits: [], more: 0 };
  if (q.length < minLetters) return { state: 'short', hits: [], more: 0 };
  const found = [];
  for (const [id, c] of chronicle.players) {
    const p = league.players[id];
    if (!p || !`${p.firstName} ${p.lastName}`.toLowerCase().includes(q)) continue;
    const last = Object.entries(c.seasons).sort((a, b) => Number(b[0]) - Number(a[0]))[0]?.[1];
    found.push({
      id,
      name: `${p.firstName[0]}. ${p.lastName}`,
      full: `${p.firstName} ${p.lastName}`,
      teamId: p.teamId ?? last?.playoffs?.teamId ?? last?.regular?.teamId ?? null,
      status: /** @type {'team' | 'free' | 'retired'} */ (p.status === 'retired' ? 'retired' : p.teamId ? 'team' : 'free'),
      appearances: c.totals.appearances,
    });
  }
  found.sort((a, b) => b.appearances - a.appearances || a.full.localeCompare(b.full) || a.id.localeCompare(b.id));
  if (found.length === 0) return { state: 'none', hits: [], more: 0 };
  const hits = found.slice(0, shown).map(({ id, name, teamId, status }) => ({ id, name, teamId, status }));
  return { state: 'hits', hits, more: found.length - hits.length };
}
