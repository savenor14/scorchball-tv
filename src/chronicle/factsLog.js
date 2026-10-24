// Every match's facts as the league is played (Talk that remembers, Task 246a; docs/simulation.md §12c). An event sink
// with a chronicle of its own, fed as the log is written (not as it airs): each match's facts are worked out the moment
// it's folded in, so they read the league exactly as it stood after that match, whenever a screen asks for them (the
// channel builds the talk after a match before the match has aired, and a viewer can load at any time). A final-round
// match gets its likely last matches at the playoff seeding, which follows the round at once. Pure; no DOM.
import { Chronicle } from './chronicle.js';
import { factsAfter, factsBefore, rank, seasonOverFacts } from './facts.js';

/**
 * @typedef {import('./facts.js').Fact} Fact
 * @typedef {import('./eventLog.js').LeagueEvent} LeagueEvent
 */

export class FactsLog {
  /** @param {any} config */
  constructor(config) {
    this.config = config;
    /** The league as logged (ahead of the screen): only this module reads it. */
    this.chronicle = new Chronicle(config.chronicle);
    /** @type {Map<string, Fact[]>} Each match's facts after it, heaviest first, by match id. */
    this.byMatch = new Map();
    /** @type {Map<string, Readonly<LeagueEvent>[]>} */
    this.#open = new Map();
    /** @type {Map<string, Readonly<LeagueEvent>[]>} Each team's latest regular-season match's events, for the seeding. */
    this.#lastRegular = new Map();
  }

  #open;
  #lastRegular;

  /** The event sink. Events must arrive in log order. @param {Readonly<LeagueEvent>} e */
  add = (e) => {
    this.chronicle.add(e);
    if (e.type === 'playoff_seeding') return this.#seeded(e.season);
    if (e.matchId === null) return;
    let events = this.#open.get(e.matchId);
    if (!events) this.#open.set(e.matchId, (events = []));
    events.push(e);
    if (e.type !== 'match_result') return;
    this.#open.delete(e.matchId);
    this.byMatch.set(e.matchId, factsAfter(this.chronicle, this.config, events));
    if (e.stage === 'regular') {
      const m = /** @type {import('./chronicle.js').MatchRecord} */ (this.chronicle.matches.get(e.matchId));
      this.#lastRegular.set(m.homeId, events);
      this.#lastRegular.set(m.awayId, events);
    }
  };

  /** The regular season is over: the likely last matches of the teams out of the playoffs. @param {number} season */
  #seeded(season) {
    const seeds = this.chronicle.season(season).seeds;
    for (const [teamId, events] of this.#lastRegular) {
      if (seeds.includes(teamId)) continue;
      const id = /** @type {string} */ (events.at(-1)?.matchId);
      const more = seasonOverFacts(this.chronicle, this.config, events, teamId);
      if (more.length) this.byMatch.set(id, rank([...(this.byMatch.get(id) ?? []), ...more]));
    }
    this.#lastRegular.clear();
  }

  /** A match's facts, heaviest first ([] for one not played yet). @param {string} matchId */
  after(matchId) {
    return this.byMatch.get(matchId) ?? [];
  }

  /**
   * What's notable before a match: from the matches logged before it (all of them if it hasn't been played yet).
   * @param {{ season: number, stage: 'regular' | 'semifinal' | 'final', homeId: string, awayId: string }} next
   * @param {string} [matchId]  Its id, if it may have been played already.
   */
  before(next, matchId) {
    const played = matchId ? this.chronicle.matches.get(matchId) : undefined;
    if (!played) return factsBefore(this.chronicle, this.config, next);
    const order = [...this.chronicle.matches.values()];
    const at = order.indexOf(played);
    const earlier = new Set(order.slice(0, at));
    return factsBefore(this.chronicle, this.config, next, (m) => earlier.has(m));
  }

  /** Everything it holds, as plain data, for a snapshot (Task 272). */
  saveState() {
    return { chronicle: this.chronicle.saveState(), byMatch: this.byMatch, open: this.#open, lastRegular: this.#lastRegular };
  }

  /** Back to a saved state (on a new log with the same config). @param {ReturnType<FactsLog['saveState']>} s */
  loadState(s) {
    this.chronicle.loadState(s.chronicle);
    this.byMatch = s.byMatch;
    this.#open = s.open;
    this.#lastRegular = s.lastRegular;
    return this;
  }

  /** Forget the facts of seasons before `season` (the channel keeps two). @param {number} season */
  dropBefore(season) {
    for (const [id] of this.byMatch) if ((this.chronicle.matches.get(id)?.season ?? Infinity) < season) this.byMatch.delete(id);
  }
}
