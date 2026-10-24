// The farewells and the draft lottery on air (the off-season show, Task 192; docs/channel.md §19.3–19.4): who's
// notable among the season's retirements and what their card says, and the lottery's odds and draw, as the sim already
// decided them. Pure and DOM-free; farewellArt.js and lotteryArt.js draw them.
import { marketWage } from '../sim/finances.js';

/**
 * @typedef {object} Farewell
 * @property {string} playerId @property {string} name @property {string} teamId  Their last team.
 * @property {string} position @property {number} age @property {number} seasons  Seasons in the league.
 * @property {string[]} awards  "2× THE QUELL", "THE BLAZE": each award once, with how many times.
 */

/**
 * A season's notable retirements (Tom: long careers and awards): those who retired from a team (not out of free
 * agency), ranked by seasons played with each award won counting `awardWeight` seasons more, up to `max`.
 * @param {readonly import('../chronicle/eventLog.js').LeagueEvent[]} leagueEvents
 * @param {readonly { season: number, awards?: { award: string, playerId: string }[] }[]} history  league.history.
 * @param {number} season  The season just finished.
 * @param {{ max: number, awardWeight: number }} settings  settings.farewells
 * @param {{ list: { id: string, name: string }[] }} awards  data/rules.json awards.
 * @param {(playerId: string) => string} nameOf
 * @returns {Farewell[]}
 */
export function notableRetirements(leagueEvents, history, season, settings, awards, nameOf) {
  const nameOfAward = (/** @type {string} */ id) => awards.list.find((a) => a.id === id)?.name ?? id;
  return leagueEvents
    .filter((e) => e.type === 'retirement' && e.season === season && /** @type {any} */ (e.data).reason === 'retired' && e.teamId)
    .map((e) => {
      const d = /** @type {any} */ (e.data);
      const id = /** @type {string} */ (e.playerId);
      const won = history.flatMap((h) => (h.awards ?? []).filter((a) => a.playerId === id).map((a) => a.award));
      const kinds = [...new Set(won)];
      return {
        playerId: id, name: nameOf(id), teamId: /** @type {string} */ (e.teamId), position: d.position, age: d.age, seasons: d.seasonsPlayed,
        awards: kinds.map((k) => { const n = won.filter((w) => w === k).length; return `${n > 1 ? `${n}× ` : ''}${nameOfAward(k).toUpperCase()}`; }),
        score: d.seasonsPlayed + settings.awardWeight * won.length,
      };
    })
    .sort((a, b) => b.score - a.score || b.seasons - a.seasons || a.playerId.localeCompare(b.playerId))
    .slice(0, settings.max)
    .map(({ score, ...f }) => f);
}

/**
 * The draft lottery as it aired: the teams that missed the playoffs, worst first, with their odds for the No. 1 pick
 * (rules.draft.lotteryWeights) and where they finished; and the draw (the sim's `draft_lottery` order) for those picks.
 * @param {readonly import('../chronicle/eventLog.js').LeagueEvent[]} leagueEvents @param {number} season
 * @param {{ table: { teamId: string }[] }} summary  The season's league.history entry (its final table).
 * @param {{ playoffs: { teams: number }, draft: { lotteryWeights: number[] } }} rules
 */
export function lotteryView(leagueEvents, season, summary, rules) {
  const finishers = summary.table.map((r) => r.teamId);
  const missed = finishers.slice(rules.playoffs.teams).reverse();
  const weights = rules.draft.lotteryWeights.slice(0, missed.length);
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  const odds = missed.map((teamId, i) => ({ teamId, pct: Math.round((100 * (weights[i] ?? 0)) / total), finished: finishers.indexOf(teamId) + 1 }));
  const order = /** @type {string[]} */ (/** @type {any} */ (leagueEvents.find((e) => e.type === 'draft_lottery' && e.season === season))?.data.order ?? []);
  return { odds, picks: order.slice(0, missed.length) };
}

/**
 * Where the lottery is, `since` ms in: the odds first, then the picks drawn last first (pick 4, 3, 2, then 1). Within
 * a reveal the drum spins up, the ball drops at `dropAt` and lands in the tray a moment later, filling its row.
 * @param {number} since @param {number} picks  How many are drawn.
 * @param {{ oddsSeconds: number, revealSeconds: number, dropAt: number }} s  settings.lottery
 * @returns {{ reveal: number, into: number, shown: number, dropping: number }}
 *   reveal: which draw is under way (-1 before the first), into: ms into it, shown: how many picks are on the board,
 *   dropping: the drawn ball's fall (0 → 1; 0 before it drops).
 */
export function lotteryBeats(since, picks, s) {
  const after = since - s.oddsSeconds * 1000;
  if (after < 0) return { reveal: -1, into: since, shown: 0, dropping: 0 };
  const reveal = Math.min(picks - 1, Math.floor(after / (s.revealSeconds * 1000)));
  const into = after - reveal * s.revealSeconds * 1000;
  const dropping = Math.min(1, Math.max(0, (into - s.dropAt * 1000) / 700));
  return { reveal, into, shown: reveal + (dropping >= 1 ? 1 : 0), dropping };
}

/** The lottery's length, ms. @param {number} picks @param {{ oddsSeconds: number, revealSeconds: number }} s */
export const lotteryLength = (picks, s) => (s.oddsSeconds + picks * s.revealSeconds) * 1000;

/**
 * @typedef {object} DraftPick  One pick as the draft shows it.
 * @property {number} pick  Overall, from 1. @property {number} round @property {string} teamId @property {string} playerId
 * @property {string} name @property {string} position @property {number} age  At the coming season.
 * @property {string} region  Where they're from (the region's name).
 * @property {{ role: string, when: string }} projection  What their numbers say, in words (Tom: no ratings on screen).
 * @property {boolean} homeGrown  From the team's own region (Task 176). @property {boolean} style  Suits the team's style (Task 177).
 * @property {boolean} reserve  Sent to the Kindling League, not making the roster (sim Task 194b).
 */

/**
 * What a pick's numbers say (Tom, Task 189: no ratings on screen): the role their potential points to, and how soon,
 * from their rating now. A starter is rated about 70; the No. 1 pick arrives about 75 with a potential of 86–95, the
 * No. 2 about 70 (78–88), the rest about 46–50 with potential about 62 (Task 175).
 * @param {number} overall  At the draft. @param {number} potential
 */
export function projection(overall, potential) {
  const role = potential >= 85 ? 'STAR PLAYER' : potential >= 75 ? 'STARTER' : potential >= 62 ? 'SQUAD PLAYER' : 'LONG-TERM PROJECT';
  const when = overall >= 68 ? 'READY TO PLAY NOW' : overall >= 58 ? 'A SEASON OR TWO AWAY' : 'THREE SEASONS OR SO AWAY';
  return { role, when };
}

/**
 * The season's draft as it aired: every pick, in order, from the sim's `draft_pick` events.
 * @param {readonly import('../chronicle/eventLog.js').LeagueEvent[]} leagueEvents @param {number} season  The season just finished.
 * @param {Record<string, any>} players @param {Record<string, any>} teams
 * @param {{ id: string, name: string }[]} regions
 * @returns {DraftPick[]}
 */
export function draftPicks(leagueEvents, season, players, teams, regions) {
  const sentDown = new Set(leagueEvents.filter((e) => e.type === 'reserve' && e.season === season).map((e) => e.playerId));
  return leagueEvents.filter((e) => e.type === 'draft_pick' && e.season === season).map((e) => {
    const d = /** @type {any} */ (e.data);
    const p = players[/** @type {string} */ (e.playerId)];
    const team = teams[/** @type {string} */ (e.teamId)];
    return {
      pick: d.pick, round: d.round, teamId: team.id, playerId: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position,
      age: season + 1 - p.birthSeason, region: regions.find((r) => r.id === p.region)?.name ?? p.region,
      projection: projection(d.overall, Math.round(p.potential)), homeGrown: p.region === team.region, reserve: sentDown.has(p.id),
    };
  }).sort((a, b) => a.pick - b.pick);
}

/**
 * Where a round 1 pick is, `since` ms in (seconds in settings.draft): on the clock, the walk up, the cut to the
 * close-up, the kit fading on and the card coming in together (Task 198), the fist-pump.
 * @param {number} since @param {{ walkAt: number, cutAt: number, kitAt: number, cheerAt: number }} s
 */
export function pickBeats(since, s) {
  const sec = since / 1000;
  return {
    walk: Math.min(1, Math.max(0, (sec - s.walkAt) / Math.max(0.1, s.cutAt - s.walkAt - 0.5))),
    closeUp: sec >= s.cutAt,
    sinceCut: since - s.cutAt * 1000,
    kit: Math.min(1, Math.max(0, (sec - s.kitAt) / 1)),
    cheer: sec >= s.cheerAt,
    card: Math.min(1, Math.max(0, (sec - s.kitAt) / 0.5)),
  };
}

/**
 * @typedef {object} Move  One line on the moves board (Task 194).
 * @property {'signed' | 're_signed' | 'released' | 'deal_ended' | 'called_up'} kind  re_signed (Task 234): back with the
 *   team that let him go, after testing the market; deal_ended: his deal ran out and nobody signed him.
 * @property {string} playerId @property {string} name @property {string} position
 * @property {string} teamId  Who signed, released or called them up.
 * @property {string | null} fromId  For a signing, the team that released them this off-season (else from free agency).
 * @property {number} age  At the coming season. @property {number} seasons  Seasons in the league (for a call-up, in
 *   the Kindling League: since they were drafted).
 * @property {string[]} awards  "2× THE QUELL": each award won to this season, once, with how many times.
 * @property {number | null} pick  A former No. 1 or 2 pick (round 1); else null.
 * @property {boolean} homeGrown  From the team's own region.
 * @property {{ season: number, round: number, pick: number } | null} drafted  A call-up's draft.
 * @property {{ wage: number, seasons: number, overMarket: boolean } | null} deal  A signing's deal (Task 234): thousands a
 *   season, how many seasons, and whether it's over his market wage (only known when movesView is given the config).
 */

/**
 * The off-season's moves as the sim made them (Task 194; Tom's order): the free-agent signings (Task 234: the biggest deal
 * first; one back with the team that let him go is RE-SIGNED), then the veteran
 * releases, then the Kindling League's call-ups. Releases of this draft's picks and of reserves whose rights ran out
 * aren't shown (Tom: the weakest in the pool), nor a release whose player signed elsewhere the same off-season (the
 * signing tells it). Releases most notable first: each award counting `awardWeight` seasons, then seasons in the league.
 * Up to `maxLines` in all.
 * @param {readonly import('../chronicle/eventLog.js').LeagueEvent[]} leagueEvents @param {number} season  The season just finished.
 * @param {readonly { season: number, awards?: { award: string, playerId: string }[] }[]} history  league.history.
 * @param {Record<string, any>} players @param {Record<string, any>} teams
 * @param {{ list: { id: string, name: string }[] }} awards  data/rules.json awards.
 * @param {{ maxLines: number }} s  settings.moves @param {number} awardWeight  settings.farewells.awardWeight
 * @param {import('../config.js').Config} [config]  For OVER THE MARKET (a signing's wage against his market wage).
 * @returns {Move[]}
 */
export function movesView(leagueEvents, season, history, players, teams, awards, s, awardWeight, config) {
  const off = leagueEvents.filter((e) => e.season === season && e.stage === 'offseason');
  const picked = new Set(off.filter((e) => e.type === 'draft_pick').map((e) => e.playerId));
  const signed = off.filter((e) => e.type === 'signing');
  const signedIds = new Set(signed.map((e) => e.playerId));
  const releasedBy = new Map(off.filter((e) => e.type === 'release').map((e) => [e.playerId, /** @type {string} */ (e.teamId)]));
  const nameOfAward = (/** @type {string} */ id) => awards.list.find((a) => a.id === id)?.name ?? id;
  /** The deals signed in free agency this off-season (Task 231). */
  const deals = new Map(off.filter((e) => e.type === 'contract' && /** @type {any} */ (e.data).kind !== 'rookie').map((e) => [e.playerId, /** @type {any} */ (e.data)]));
  const ended = new Set(off.filter((e) => e.type === 'release' && /** @type {any} */ (e.data)?.reason === 'contract_end').map((e) => e.playerId));
  /** @param {Move['kind']} kind @param {import('../chronicle/eventLog.js').LeagueEvent} e @returns {Move & { score: number }} */
  const move = (kind, e) => {
    const p = players[/** @type {string} */ (e.playerId)];
    const teamId = /** @type {string} */ (e.teamId);
    const won = history.filter((h) => h.season <= season).flatMap((h) => (h.awards ?? []).filter((a) => a.playerId === p.id).map((a) => a.award));
    const kinds = [...new Set(won)];
    const drafted = p.draft ? { season: p.draft.season, round: p.draft.round, pick: p.draft.pick } : null;
    const seasons = kind === 'called_up' && drafted ? season - drafted.season : season - p.joinedSeason + 1;
    return {
      kind, playerId: p.id, name: `${p.firstName} ${p.lastName}`, position: p.position, teamId,
      fromId: kind === 'signed' || kind === 're_signed' ? releasedBy.get(p.id) ?? null : null,
      age: season + 1 - p.birthSeason, seasons,
      awards: kinds.map((k) => { const n = won.filter((w) => w === k).length; return `${n > 1 ? `${n}× ` : ''}${nameOfAward(k).toUpperCase()}`; }),
      pick: drafted && drafted.round === 1 && drafted.pick <= 2 ? drafted.pick : null,
      homeGrown: p.region === teams[teamId]?.region,
      drafted: kind === 'called_up' ? drafted : null,
      deal: dealOf(p, kind),
      score: seasons + awardWeight * won.length,
    };
  };
  /** A signing's deal (Task 234). @param {any} p @param {Move['kind']} kind @returns {Move['deal']} */
  function dealOf(p, kind) {
    const d = deals.get(p.id);
    if (!d || (kind !== 'signed' && kind !== 're_signed')) return null;
    return { wage: d.wage, seasons: d.until - season, overMarket: config ? d.wage > marketWage(p, season + 1, config) : false };
  }
  const releases = off.filter((e) => e.type === 'release' && /** @type {any} */ (e.data)?.reason !== 'rights_expired' && !picked.has(e.playerId) && !signedIds.has(e.playerId))
    .map((e) => move(ended.has(e.playerId) ? 'deal_ended' : 'released', e))
    .sort((a, b) => b.score - a.score || a.playerId.localeCompare(b.playerId));
  const lines = [
    ...signed.map((e) => move(releasedBy.get(/** @type {string} */ (e.playerId)) === e.teamId ? 're_signed' : 'signed', e))
      .sort((a, b) => (b.deal?.wage ?? 0) - (a.deal?.wage ?? 0)),
    ...releases,
    ...off.filter((e) => e.type === 'call_up').map((e) => move('called_up', e)),
  ];
  return lines.slice(0, s.maxLines).map(({ score, ...m }) => m);
}

/**
 * The moves board's length, ms: a lead-in, then each line its turn, then a tail; never shorter than minSeconds.
 * @param {number} lines @param {{ leadSeconds: number, lineSeconds: number, tailSeconds: number, minSeconds: number }} s  settings.moves
 */
export const movesLength = (lines, s) => Math.max(s.minSeconds, s.leadSeconds + lines * s.lineSeconds + s.tailSeconds) * 1000;

/**
 * Where the board is, `since` ms in: which line is lit (its letters flapping in as its turn starts) and how far into
 * its turn, and which page of `perPage` lines is up. Before the first line, `line` is -1.
 * @param {number} since @param {number} lines @param {{ leadSeconds: number, lineSeconds: number, perPage: number }} s
 * @returns {{ line: number, into: number, page: number }}
 */
export function movesBeats(since, lines, s) {
  const after = since - s.leadSeconds * 1000;
  if (after < 0 || lines === 0) return { line: -1, into: since, page: 0 };
  const line = Math.min(lines - 1, Math.floor(after / (s.lineSeconds * 1000)));
  return { line, into: after - line * s.lineSeconds * 1000, page: Math.floor(line / s.perPage) };
}
