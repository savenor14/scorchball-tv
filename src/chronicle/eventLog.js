// The event log: every meaningful thing that happens, in one consistent record format.
// Browser-safe. Where events go (file, memory, network) is decided by sinks. See docs/simulation.md §12.

export const EVENT_SCHEMA_VERSION = 1;

export const STAGES = Object.freeze(['preseason', 'regular', 'semifinal', 'final', 'offseason']);

/** Events inside a match: they must carry a matchId and a game-clock time. */
export const MATCH_EVENT_TYPES = Object.freeze(new Set([
  'lineup', 'kickoff', 'possession_change', 'advance', 'heat_stage', 'burn', 'momentum',
  'shot', 'save', 'block', 'miss', 'goal', 'foul', 'free_shot',
  'substitution', 'injury', 'half_time', 'full_time', 'overtime_start', 'shootout_kick', 'match_result',
  'player_of_the_match',
]));

/** Events outside matches: matchId and clock must be null. */
export const LEAGUE_EVENT_TYPES = Object.freeze(new Set([
  'season_start', 'standings', 'playoff_seeding', 'season_end', 'award',
  'retirement', 'player_development', 'draft_lottery', 'draft_pick',
  'signing', 'release', 'reserve', 'call_up', 'player_created', 'injury_return', 'rule_change', 'contract',
  'induction',
]));

/**
 * One record in the log. Field order is fixed so JSONL lines are easy to scan.
 * @typedef {object} LeagueEvent
 * @property {number} v              Schema version.
 * @property {number} seq            Global sequence number: +1 per event, never reused. The event's permanent ID.
 * @property {number} season
 * @property {string} stage          One of STAGES.
 * @property {number | null} round   Regular-season round, otherwise null.
 * @property {string | null} matchId
 * @property {number | null} clock   Game-clock seconds within the match.
 * @property {string} type
 * @property {string | null} teamId
 * @property {string | null} playerId
 * @property {Record<string, unknown>} data  Type-specific details.
 */

/**
 * What callers pass to `append`. `seq` and `v` are added by the log.
 * @typedef {object} EventInput
 * @property {number} season
 * @property {string} stage
 * @property {number | null} [round]
 * @property {string | null} [matchId]
 * @property {number | null} [clock]
 * @property {string} type
 * @property {string | null} [teamId]
 * @property {string | null} [playerId]
 * @property {Record<string, unknown>} [data]
 */

/** @typedef {(event: Readonly<LeagueEvent>) => void} EventSink */

const INPUT_FIELDS = new Set(['season', 'stage', 'round', 'matchId', 'clock', 'type', 'teamId', 'playerId', 'data']);

export class EventLog {
  #seq;
  /** @type {EventSink[]} */
  #sinks;

  /**
   * @param {{ lastSeq?: number, sinks?: EventSink[] }} [options]
   *   `lastSeq`: the last sequence number already written, to continue an existing log.
   */
  constructor({ lastSeq = 0, sinks = [] } = {}) {
    if (!Number.isInteger(lastSeq) || lastSeq < 0) throw new RangeError(`lastSeq must be a whole number ≥ 0, got ${lastSeq}`);
    this.#seq = lastSeq;
    this.#sinks = [...sinks];
  }

  /** The sequence number of the most recent event (0 if none). */
  get lastSeq() {
    return this.#seq;
  }

  /** @param {EventSink} sink */
  addSink(sink) {
    this.#sinks.push(sink);
  }

  /**
   * Validate, number, freeze and record an event, then pass it to every sink.
   * @param {EventInput} input
   * @returns {Readonly<LeagueEvent>}
   */
  append(input) {
    const event = buildEvent(input, this.#seq + 1);
    this.#seq = event.seq;
    for (const sink of this.#sinks) sink(event);
    return event;
  }

  /**
   * A shortcut for emitting many events with the same context, such as one match or one off-season.
   * @param {{ season: number, stage: string, round?: number | null, matchId?: string | null }} context
   * @returns {(type: string, fields?: Omit<EventInput, 'season' | 'stage' | 'round' | 'matchId' | 'type'>) => Readonly<LeagueEvent>}
   */
  scoped(context) {
    return (type, fields = {}) => this.append({ ...context, ...fields, type });
  }
}

/**
 * @param {EventInput} input
 * @param {number} seq
 * @returns {Readonly<LeagueEvent>}
 */
function buildEvent(input, seq) {
  const fail = (/** @type {string} */ msg) => {
    throw new TypeError(`Invalid event (${input?.type ?? 'no type'}): ${msg}`);
  };
  if (!isPlainObject(input)) fail('expected an object');
  for (const key of Object.keys(input)) if (!INPUT_FIELDS.has(key)) fail(`unknown field "${key}"`);

  const { season, stage, round = null, matchId = null, clock = null, type, teamId = null, playerId = null, data = {} } = input;

  const isMatch = MATCH_EVENT_TYPES.has(type);
  if (!isMatch && !LEAGUE_EVENT_TYPES.has(type)) fail(`unknown type "${type}"`);
  if (!Number.isInteger(season) || season < 1) fail(`season must be a whole number ≥ 1, got ${season}`);
  if (!STAGES.includes(stage)) fail(`stage must be one of ${STAGES.join(', ')}, got ${stage}`);
  if (round !== null && (!Number.isInteger(round) || round < 1)) fail(`round must be null or a whole number ≥ 1, got ${round}`);
  if (isMatch) {
    if (typeof matchId !== 'string' || matchId === '') fail('match events need a matchId');
    if (typeof clock !== 'number' || !Number.isFinite(clock) || clock < 0) fail(`match events need a clock ≥ 0, got ${clock}`);
  } else if (matchId !== null || clock !== null) {
    fail('league events must not have a matchId or clock');
  }
  if (teamId !== null && typeof teamId !== 'string') fail('teamId must be a string or null');
  if (playerId !== null && typeof playerId !== 'string') fail('playerId must be a string or null');
  if (!isPlainObject(data)) fail('data must be an object');

  /** @type {LeagueEvent} */
  const event = {
    v: EVENT_SCHEMA_VERSION, seq, season, stage, round, matchId, clock, type, teamId, playerId,
    data: Object.freeze({ ...data }),
  };
  return Object.freeze(event);
}

/**
 * One event as a JSONL line (with trailing newline).
 * @param {LeagueEvent} event
 */
export function toJsonLine(event) {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Parse JSONL text back into events. Blank lines are skipped; bad lines report their line number.
 * @param {string} text
 * @returns {LeagueEvent[]}
 */
export function parseJsonLines(text) {
  /** @type {LeagueEvent[]} */
  const events = [];
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    try {
      events.push(JSON.parse(line));
    } catch (err) {
      throw new SyntaxError(`Line ${i + 1}: ${err instanceof Error ? err.message : err}`);
    }
  });
  return events;
}

/**
 * A sink that keeps events in memory, for tests and the browser.
 * @returns {{ events: Readonly<LeagueEvent>[], sink: EventSink }}
 */
export function memorySink() {
  /** @type {Readonly<LeagueEvent>[]} */
  const events = [];
  return { events, sink: (event) => { events.push(event); } };
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
