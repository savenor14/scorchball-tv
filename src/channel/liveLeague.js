// The live league: the always-on league as of a given moment. See docs/channel.md §3.
// Pure and DOM-free. It never reads the clock itself: callers pass "now" (the real time, or a dev-shifted one),
// so the same seed and moment always give the same league.
//
// The chronicle (Task 215) is fed every event too, so the record books outlast the dropped match events, but only once
// it has aired (Task 219): a match's events (and the table after it) at its final whistle on screen, the off-season's
// once the off-season show has aired it that night (Task 220). So whatever reads the chronicle on the channel never gets ahead of the picture.
// Every match is simulated in full at its kick-off, through the same season steps as fast-forward.
// The off-season runs the moment the final is simulated, and the next season starts straight after, so its
// schedule is known during the countdown. That means the log runs ahead of the screen: the channel decides
// what to reveal from kick-off times and match lengths, never from when something was logged.
import { Chronicle, RecordWatch } from '../chronicle/chronicle.js';
import { EventLog } from '../chronicle/eventLog.js';
import { FactsLog } from '../chronicle/factsLog.js';
import { createLeague } from '../sim/league.js';
import { attachStreams, seedStreams } from '../sim/streams.js';
import { runOffseason } from '../sim/offseason.js';
import { isSeasonOver, nextFixture, playNextMatch, seasonRecord, startSeason } from '../sim/season.js';
import { createCalendar } from './calendar.js';
import { createTimeline } from './timeline.js';

/** A match whose kick-off is this long before the moment being reached has certainly finished on screen (ms). */
const LONG_AIRED_MS = 3 * 3_600_000;

/**
 * @typedef {import('../chronicle/eventLog.js').LeagueEvent} LeagueEvent
 *
 * @typedef {object} LiveMatch  A match that has been simulated (it has kicked off).
 * @property {string} id
 * @property {number} season
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {number | null} round
 * @property {number} slot       Index into calendar.slots(season).
 * @property {number} kickoff    Epoch ms.
 * @property {string} homeId
 * @property {string} awayId
 * @property {boolean} neutral
 * @property {import('../sim/match.js').MatchSummary} summary
 * @property {Readonly<LeagueEvent>[]} events  The match's own events, in order.
 *
 * @typedef {object} FinishedSeason
 * @property {import('../sim/season.js').SeasonRecord} record
 * @property {import('../sim/offseason.js').OffseasonReport} offseason
 */

export class LiveLeague {
  /** @type {Map<string, LiveMatch>} Kicked-off matches of the current and previous season, by id. */
  matches = new Map();
  /** @type {Readonly<LeagueEvent>[]} Every league event (standings, draft, ...), in order. */
  leagueEvents = [];
  /** @type {Map<number, FinishedSeason>} */
  finished = new Map();

  /** @type {LiveMatch | null} The match being simulated, so its events can be routed to it. */
  #current = null;
  /** Slots of the current season already played. */
  #slot = 0;
  /** Events waiting to air before the chronicle takes them, in log order (Task 219). @type {{ at: number, event: Readonly<LeagueEvent> }[]} */
  #queue = [];
  /** When the events being logged now will have aired (epoch ms). */
  #airsAt = -Infinity;
  /** When the last final's off-season will have aired (epoch ms). */
  #offseasonAirs = -Infinity;

  /**
   * Build the league from its seed and play every match that has kicked off by `now`.
   * @param {import('../config.js').Config} config
   * @param {{ now: number, seed?: string, streams?: import('../sim/streams.js').Streams, restore?: ReturnType<LiveLeague['saveState']> }} options  `now`: epoch ms.
   *   `seed` defaults to settings.live.seed; `streams`, in its place, where the randomness comes from (Task 271: the
   *   day keys, on the live channel). `restore`: a saved state (saveState, Task 272: a snapshot) to carry on from, in
   *   place of building the league from its first day; `now` must not be before its moment.
   */
  constructor(config, { now, seed = config.settings.live.seed, streams, restore }) {
    this.config = config;
    this.seed = streams ? 'keys' : seed;
    /** The public seed for appearance only (the presenters, the managers, the ads' order; Task 271), never results. */
    this.looks = config.settings.live.looks;
    this.calendar = createCalendar(config);
    /**
     * The league's memory (Task 215): every season, kept when old match events are dropped. Fed only what has aired by
     * `now` (Task 219), so the CHRONICLE pane, the cards and the records never give anything away.
     */
    this.chronicle = new Chronicle(config.chronicle);
    /** The records as they fall, ahead of the screen (Task 220b): the channel's record captions know a match's from its kick-off. */
    this.records = new RecordWatch(config.chronicle);
    /**
     * Every match's facts (Talk that remembers, Task 246a), ahead of the screen like the records: worked out as each match
     * is played, so the desk's talk after a match (built before it airs) says the same on every screen. Read per match.
     */
    this.facts = new FactsLog(config);
    this.log = new EventLog({ lastSeq: restore?.lastSeq ?? 0, sinks: [(event) => this.#route(event), (event) => this.#queue.push({ at: this.#airsAt, event }), this.records.add, this.facts.add] });
    if (restore) {
      // A snapshot (Task 272): the league as it stood, its streams attached again (it was saved as plain data).
      this.league = restore.league;
      attachStreams(this.league, streams ?? seedStreams(seed));
      this.state = restore.state;
      this.#slot = restore.slot;
      this.matches = restore.matches;
      this.leagueEvents = restore.leagueEvents;
      this.finished = restore.finished;
      this.chronicle.loadState(restore.chronicle);
      this.records.loadState(restore.records);
      this.facts.loadState(restore.facts);
      this.#queue = restore.queue;
      this.#airsAt = restore.airsAt;
      this.#offseasonAirs = restore.offseasonAirs;
      this.now = restore.now;
    } else {
      this.league = createLeague(config, streams ?? seed, this.log);
      /** @type {import('../sim/season.js').SeasonState} The season being played (the next one once the final is done). */
      this.state = startSeason(this.league, config, this.log);
      /** The moment the league has been advanced to (epoch ms). */
      this.now = -Infinity;
    }
    this.advanceTo(now);
  }

  /**
   * Everything the live league holds, as plain data (Task 272): what a snapshot keeps, so a browser can carry on from it
   * (`restore`) and play on exactly as if it had built the league from its first day. Packed with src/pack.js.
   */
  saveState() {
    if (this.#current) throw new Error('The live league cannot be saved in the middle of a match');
    return {
      now: this.now, league: this.league, state: this.state, slot: this.#slot, matches: this.matches, leagueEvents: this.leagueEvents,
      finished: this.finished, chronicle: this.chronicle.saveState(), records: this.records.saveState(), facts: this.facts.saveState(),
      queue: this.#queue, airsAt: this.#airsAt, offseasonAirs: this.#offseasonAirs, lastSeq: this.log.lastSeq,
    };
  }

  /**
   * Play every match whose kick-off is at or before `t`, across seasons if needed.
   * @param {number} t  Epoch ms. Must not go back in time.
   * @returns {LiveMatch[]} The matches that kicked off in this call, in play order.
   */
  advanceTo(t) {
    if (t < this.now) throw new RangeError(`The live league can't go back in time (at ${new Date(this.now).toISOString()}, asked for ${new Date(t).toISOString()})`);
    this.now = t;
    /** @type {LiveMatch[]} */
    const played = [];
    for (;;) {
      const slot = this.calendar.slots(this.state.season)[this.#slot];
      if (!slot || slot.kickoff > t) break;
      played.push(this.#play(slot));
      if (isSeasonOver(this.state)) this.#nextSeason();
    }
    this.#air(t);
    return played;
  }

  /**
   * The kicked-off matches of a season, in play order. Only the current and previous season are kept.
   * @param {number} season
   */
  matchesIn(season) {
    return [...this.matches.values()].filter((m) => m.season === season).sort((a, b) => a.slot - b.slot);
  }

  /** @param {import('./calendar.js').Slot} slot */
  #play(slot) {
    const fixture = /** @type {import('../sim/season.js').Fixture} */ (nextFixture(this.state));
    if (fixture.stage !== slot.stage) {
      throw new Error(`Calendar and season disagree: slot ${slot.index} is ${slot.stage}, next fixture ${fixture.id} is ${fixture.stage}`);
    }
    /** @type {LiveMatch} */
    const match = {
      id: fixture.id, season: fixture.season, stage: fixture.stage, round: fixture.round,
      slot: slot.index, kickoff: slot.kickoff,
      homeId: fixture.homeId, awayId: fixture.awayId, neutral: fixture.neutral,
      summary: /** @type {any} */ (null), events: [],
    };
    this.matches.set(match.id, match);
    this.#current = match;
    const from = this.#queue.length;
    try {
      match.summary = playNextMatch(this.league, this.config, this.log, this.state);
    } finally {
      this.#current = null;
    }
    // Its events, and the league's after it (the table, the seeding), air at its final whistle on screen; a match long
    // before the moment being reached needs no timeline (it has aired).
    this.#airsAt = slot.kickoff + LONG_AIRED_MS <= this.now ? slot.kickoff : slot.kickoff + createTimeline(match, this.config).duration;
    // The awards, logged with the final, wait for the off-season with the rest: the off-season show airs them that
    // night (settings.chronicle.offseasonAiredMinutes after the final's kick-off, Task 220).
    const offseason = Math.max(this.#airsAt, slot.kickoff + this.config.settings.chronicle.offseasonAiredMinutes * 60_000);
    this.#offseasonAirs = offseason;
    for (let i = from; i < this.#queue.length; i++) this.#queue[i].at = this.#queue[i].event.type === 'award' ? offseason : this.#airsAt;
    this.#slot++;
    return match;
  }

  /** The final is done: run the off-season, start the next season, and drop match events older than the season just finished. */
  #nextSeason() {
    const record = seasonRecord(this.state);
    // The off-season (awards, retirements, the draft, moves) and the new season's start reach the chronicle once the
    // off-season show has aired them, that night (Task 220).
    this.#airsAt = this.#offseasonAirs;
    const offseason = runOffseason(this.league, this.config, this.log, record);
    this.finished.set(record.season, { record, offseason });
    this.state = startSeason(this.league, this.config, this.log);
    this.#slot = 0;
    for (const [id, m] of this.matches) if (m.season < record.season) this.matches.delete(id);
    for (const s of this.finished.keys()) if (s < record.season) this.finished.delete(s);
    this.facts.dropBefore(record.season);
  }

  /** Hand the chronicle every event that has aired by `t`, in log order. @param {number} t */
  #air(t) {
    let n = 0;
    while (n < this.#queue.length && this.#queue[n].at <= t) this.chronicle.add(this.#queue[n++].event);
    if (n) this.#queue.splice(0, n);
  }

  /** @param {Readonly<LeagueEvent>} event */
  #route(event) {
    if (event.matchId === null) this.leagueEvents.push(event);
    else if (this.#current && event.matchId === this.#current.id) this.#current.events.push(event);
    else throw new Error(`Match event for ${event.matchId} arrived outside its match`);
  }
}
