// A fast-forwarded league's facts (Talk that remembers, Tasks 243 and 245): every match's facts after it and before it,
// with its player of the match, through the same FactsLog the live league uses. For the facts report (npm run facts),
// the tests and the dev pages (interviews.html), so pure and browser-safe.
import { EventLog } from './eventLog.js';
import { FactsLog } from './factsLog.js';
import { matchLines } from './matchLines.js';
import { createLeague } from '../sim/league.js';
import { runOffseason } from '../sim/offseason.js';
import { runSeason } from '../sim/season.js';

/**
 * Runs a league and collects every match's facts and its player of the match.
 * @param {any} config @param {string} seed @param {number} seasons
 * @param {number} [keepSeasons]  Keep the events of the matches in the first this many seasons (for the tests).
 */
export function collectFacts(config, seed, seasons, keepSeasons = 0) {
  const facts = new FactsLog(config);
  /** @type {{ matchId: string, season: number, potm: { playerId: string, teamId: string, goals: number } | null }[]} */
  const played = [];
  /** @type {Map<string, import('./eventLog.js').LeagueEvent[]>} */
  const kept = new Map();
  /** @type {{ season: number, matchId: string, stage: string, homeId: string, awayId: string, facts: import('./facts.js').Fact[] }[]} */
  const before = [];
  /** @type {Map<string, import('./eventLog.js').LeagueEvent[]>} */
  const open = new Map();
  /** @type {Map<string, string[]>} Each match's sides as their lineups come (the home side's first). */
  const sides = new Map();
  const sink = (/** @type {import('./eventLog.js').LeagueEvent} */ e) => {
    if (!e.matchId) return;
    // Before it, at its lineups: from the matches logged before it.
    if (e.type === 'lineup') {
      const ids = [...(sides.get(e.matchId) ?? []), /** @type {string} */ (e.teamId)];
      sides.set(e.matchId, ids);
      if (ids.length === 2) {
        before.push({ season: e.season, matchId: e.matchId, stage: e.stage, homeId: ids[0], awayId: ids[1], facts: facts.before({ season: e.season, stage: /** @type {any} */ (e.stage), homeId: ids[0], awayId: ids[1] }) });
        sides.delete(e.matchId);
      }
    }
    let events = open.get(e.matchId);
    if (!events) open.set(e.matchId, (events = []));
    events.push(e);
    if (e.type !== 'match_result') return;
    open.delete(e.matchId);
    const lines = matchLines(events);
    const potm = lines.potmId ? { playerId: lines.potmId, teamId: lines.players[lines.potmId].teamId, goals: lines.players[lines.potmId].goals } : null;
    played.push({ matchId: e.matchId, season: e.season, potm });
    if (e.season <= keepSeasons) kept.set(e.matchId, events);
  };
  // The facts' own sink first, so a match's facts are worked out before anything reads them.
  const log = new EventLog({ sinks: [sink, facts.add] });
  const league = createLeague(config, seed, log);
  for (let i = 0; i < seasons; i++) runOffseason(league, config, log, runSeason(league, config, log));
  // Read at the end: a final-round match's facts are topped up at the seeding.
  const after = played.map((x) => ({ ...x, facts: facts.after(x.matchId) }));
  return { chronicle: facts.chronicle, after, before, kept, facts };
}
