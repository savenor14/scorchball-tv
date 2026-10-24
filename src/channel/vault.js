// FROM THE VAULT (Tom's note 14; picked on vault.html; docs/channel.md §33): a short package on one big match from the
// past, about 10:00 and 19:00 from season 2 on: its opening card, the match's reel, and SINCE THEN. Pure and DOM-free.
//
// The story: for now last season's final (Tom's placeholder for the first seasons). Other stories (a record broken, a
// milestone, a hat-trick, the biggest win) will each need a build of their own, with words and data that suit them
// (Tom), and the match's events kept beyond last season.
import { winnerOf } from '../sim/potm.js';
import { groundName } from './groundsTour.js';
import { tableAt } from './onScreen.js';

/**
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {{ kind: 'final', match: LiveMatch, headline: string }} VaultStory
 */

/**
 * The vault's story at `t`: last season's final, from settings.vault.fromSeason on; null before, or without it.
 * @param {LiveLeague} live @param {number} t
 * @returns {VaultStory | null}
 */
export function vaultStory(live, t) {
  const season = live.calendar.seasonAt(t);
  if (season < live.config.settings.vault.fromSeason) return null;
  const match = live.matchesIn(season - 1).find((m) => m.stage === 'final');
  if (!match?.summary) return null;
  // Its headline says why it's in the vault, never the result (Tom).
  const headline = match.season === 1 ? 'THE LEAGUE\'S FIRST FINAL' : `THE SEASON ${match.season} FINAL`;
  return { kind: 'final', match, headline };
}

/**
 * A vault card (studio card names vault_open, vault_since), or null when there's no story.
 * @param {string} card @param {LiveLeague} live @param {number} t @param {{ timelineOf: (m: LiveMatch) => import('./timeline.js').Timeline }} ctx
 */
export function vaultCard(card, live, t, ctx) {
  const story = vaultStory(live, t);
  if (!story) return null;
  const m = story.match;
  if (card === 'vault_open') {
    // The opening (Tom's pick A): the amber bar headed FROM THE VAULT, the headline, the two crests with v, when and where.
    return {
      kind: /** @type {const} */ ('vault_open'), headline: story.headline, season: m.season, homeId: m.homeId, awayId: m.awayId,
      kickoff: m.kickoff, ground: groundName(live.config, m.homeId), city: live.league.teams[m.homeId].city,
    };
  }
  if (card === 'vault_since') {
    // SINCE THEN (look A): each finalist then (champions, runners-up) and now (this season's table, as on screen).
    const winner = winnerOf(m);
    const loser = winner === m.homeId ? m.awayId : m.homeId;
    const season = live.calendar.seasonAt(t);
    const table = tableAt(live, season, t, (x) => ctx.timelineOf(x).duration);
    const now = (/** @type {string} */ id) => {
      const row = table.find((x) => x.teamId === id);
      return row && row.played > 0 ? { position: row.position, points: row.points } : null;
    };
    return {
      kind: /** @type {const} */ ('vault_since'),
      sides: [{ teamId: winner, then: 'CHAMPIONS', now: now(winner) }, { teamId: loser, then: 'RUNNERS-UP', now: now(loser) }],
    };
  }
  return null;
}
