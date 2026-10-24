// A match's player lines and result worked out from its events alone (Task 214), the chronicle's per-match fold.
// Pure. It reads only the event log, never the sim's MatchSummary, so the record books can be rebuilt from a log;
// tests/matchLines.test.js holds it to the sim's own counts (that test is the log's completeness check).
// See docs/simulation.md §12.

/**
 * One player's match, as the sim's PlayerStats (src/sim/match.js) plus steals (the tackles that were a lost pass).
 * `secondsPlayed` is from whole-second event clocks, so it can differ from the sim's by under a second per change.
 * @typedef {{
 *   teamId: string, started: boolean, secondsPlayed: number, goals: number, assists: number, scorchers: number,
 *   shots: number, shotsOnTarget: number, saves: number, tackles: number, steals: number, fouls: number, burns: number,
 *   blocks: number, conceded: number,
 * }} PlayerLine
 *
 * @typedef {object} MatchLines
 * @property {string} matchId
 * @property {string} homeId
 * @property {string} awayId
 * @property {import('../sim/match.js').MatchResult} result
 * @property {Record<string, PlayerLine>} players  Everyone who played (started or came on), by id.
 * @property {string | null} potmId  The player of the match.
 * @property {string | null} winningGoalId  Who scored the winning goal (Tom, Task 167: the winner's goal that took them one
 *   past the loser's final total; a golden goal is one), or null for a draw or a shootout.
 * @property {{ playerId: string, matchesOut: number, seasonEnding: boolean }[]} injuries
 */

/**
 * @param {readonly import('./eventLog.js').LeagueEvent[]} events  One finished match's events, in order.
 * @returns {MatchLines}
 */
export function matchLines(events) {
  /** @type {Record<string, PlayerLine>} */
  const players = {};
  /** When each player on the pitch came on (game-clock seconds). */
  const onSince = new Map();
  /** @type {MatchLines['injuries']} */
  const injuries = [];
  let potmId = null;
  /** Every goal's scorer, side and the score after it, for the winning goal. @type {{ playerId: string, home: boolean, score: number[] }[]} */
  const goals = [];
  /** The home side's id, from the first lineup. */
  let homeId = null;

  const line = (/** @type {string} */ id, /** @type {string} */ teamId) => (players[id] ??= {
    teamId, started: false, secondsPlayed: 0, goals: 0, assists: 0, scorchers: 0,
    shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, steals: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0,
  });
  const comeOn = (/** @type {string} */ id, /** @type {string} */ teamId, /** @type {number} */ clock) => {
    line(id, teamId);
    onSince.set(id, clock);
  };
  const goOff = (/** @type {string} */ id, /** @type {number} */ clock) => {
    if (!onSince.has(id)) return;
    players[id].secondsPlayed += clock - onSince.get(id);
    onSince.delete(id);
  };

  for (const e of events) {
    const d = /** @type {any} */ (e.data);
    const id = /** @type {string} */ (e.playerId);
    const teamId = /** @type {string} */ (e.teamId);
    const clock = /** @type {number} */ (e.clock);
    switch (e.type) {
      case 'lineup':
        homeId ??= teamId;
        for (const s of d.starters) {
          comeOn(s.playerId, teamId, clock);
          players[s.playerId].started = true;
        }
        break;
      case 'substitution':
        goOff(d.offId, clock);
        comeOn(id, teamId, clock);
        break;
      case 'injury':
        // Off now; a substitution at the same moment brings someone on, or the team plays a player short. The last player
        // on the pitch plays on hurt (`playsOn`, Task 271).
        if (!d.playsOn) goOff(id, clock);
        injuries.push({ playerId: id, matchesOut: d.matchesOut, seasonEnding: d.seasonEnding });
        break;
      case 'shot':
        players[id].shots++;
        break;
      case 'save':
        players[id].saves++;
        players[d.shooterId].shotsOnTarget++;
        break;
      case 'goal':
        players[id].goals++;
        players[id].shotsOnTarget++;
        if (d.scorcher) players[id].scorchers++;
        if (d.assistId) players[d.assistId].assists++;
        if (d.keeperId) players[d.keeperId].conceded++;
        goals.push({ playerId: id, home: teamId === homeId, score: d.score });
        break;
      case 'block':
        players[id].blocks++;
        break;
      case 'possession_change':
        if (d.reason === 'tackle') {
          players[id].tackles++;
          if (d.steal) players[id].steals++;
        }
        break;
      case 'foul':
        players[id].fouls++;
        break;
      case 'burn':
        if (id) players[id].burns++;
        break;
      case 'player_of_the_match':
        potmId = id;
        break;
      case 'match_result': {
        for (const p of [...onSince.keys()]) goOff(p, clock);
        const homeWon = d.homeGoals > d.awayGoals;
        const need = Math.min(d.homeGoals, d.awayGoals) + 1;
        const winner = d.homeGoals === d.awayGoals ? undefined
          : goals.find((g) => g.home === homeWon && g.score[homeWon ? 0 : 1] === need);
        return {
          matchId: /** @type {string} */ (e.matchId),
          homeId: d.homeId,
          awayId: d.awayId,
          result: { homeGoals: d.homeGoals, awayGoals: d.awayGoals, decidedBy: d.decidedBy, shootout: d.shootout },
          players, potmId, injuries, winningGoalId: winner?.playerId ?? null,
        };
      }
    }
  }
  throw new Error(`Match ${events[0]?.matchId} has no match_result: is it finished?`);
}
