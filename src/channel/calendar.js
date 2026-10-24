// The league calendar: when every match of every season kicks off, in real time. See docs/channel.md §4.
// Pure and DOM-free: settings in, epoch milliseconds out. Calendar times ("day N HH:MM") are wall-clock times
// in settings.live.timeZone, so kick-offs keep their local time across daylight-saving changes.
//
// Slots are numbered in play order, matching the order of nextFixture() in src/sim/season.js:
// regular-season fixtures round by round, then semifinal 1, semifinal 2 and the final.
import { parseDayTime } from '../util.js';

const MINUTE = 60_000;
const DAY_MINUTES = 1440;

/**
 * @typedef {object} Slot
 * @property {number} index      Play order within the season, from 0.
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {number | null} round  Regular-season round (from 1), otherwise null.
 * @property {number} kickoff    Epoch ms.
 *
 * @typedef {object} CalendarPosition
 * @property {number} season     The season this moment belongs to. Before season 1 starts, this is 1.
 * @property {number} seasonStart  Epoch ms.
 * @property {number} seasonEnd    Epoch ms (the next season's start).
 * @property {'regular' | 'playoffs'} phase  'playoffs' from the first knockout kick-off to the season's end.
 * @property {number} started    How many of this season's slots have kicked off at or before this moment.
 * @property {Slot | null} next  The next slot to kick off this season, or null after the final has started.
 */

/**
 * Build the calendar for the live league.
 * @param {import('../config.js').Config} config
 */
export function createCalendar({ settings, rules, teams }) {
  const { live, calendar, playoffs } = settings;
  const zone = zoneOffsets(live.timeZone);
  const [y, m, d] = live.firstSeasonStarts.split('-').map(Number);
  const firstDay = Date.UTC(y, m - 1, d);

  // Season shape, from the team count and playoff format (the same rules that build the schedule).
  const teamCount = teams.teams.length;
  const perRound = teamCount / 2;
  const regularCount = (teamCount - 1) * 2 * perRound;
  const knockoutStages = /** @type {('semifinal' | 'final')[]} */ (rules.playoffs.teams === 4 ? ['semifinal', 'semifinal', 'final'] : ['final']);

  // Wall-clock minutes from day 1 00:00 for every slot. The same in every season.
  const first = parseDayTime(calendar.firstKickoff).minutes;
  const finalRound = parseDayTime(calendar.finalRoundKickoff).minutes;
  const spaced = calendar.finalRoundSimultaneous ? regularCount - perRound : regularCount;
  const spacing = (finalRound - first) / (calendar.finalRoundSimultaneous ? spaced : spaced - 1);
  /** @type {{ stage: Slot['stage'], round: number | null, minutes: number }[]} */
  const shape = [];
  for (let i = 0; i < regularCount; i++) {
    const minutes = i < spaced ? Math.round(first + i * spacing) : finalRound;
    shape.push({ stage: 'regular', round: Math.floor(i / perRound) + 1, minutes });
  }
  playoffs.kickoffs.forEach((/** @type {string} */ t, /** @type {number} */ i) => {
    shape.push({ stage: knockoutStages[i], round: null, minutes: parseDayTime(t).minutes });
  });

  /** @type {Map<number, Slot[]>} */
  const cache = new Map();

  /** Wall-clock minutes from a season's day 1 00:00 → epoch ms. @param {number} season @param {number} minutes */
  const toInstant = (season, minutes) => {
    const dayOffset = (season - 1) * calendar.seasonDays + Math.floor(minutes / DAY_MINUTES);
    return zone.wallToInstant(firstDay + dayOffset * DAY_MINUTES * MINUTE + (minutes % DAY_MINUTES) * MINUTE);
  };

  const api = {
    /** Number of slots in a season. */
    slotCount: shape.length,
    regularCount,

    /** @param {number} season  From 1. @returns {number} Epoch ms of day 1 00:00. */
    seasonStart(season) {
      return toInstant(season, 0);
    },

    /**
     * A wall-clock moment of a season: `minutes` from its day 1 00:00 (day 2 06:00 is 1800), in the league's zone.
     * @param {number} season @param {number} minutes
     * @returns {number} Epoch ms.
     */
    instant(season, minutes) {
      return toInstant(season, minutes);
    },

    /**
     * Every slot of a season in play order. Kick-offs never decrease.
     * @param {number} season
     * @returns {readonly Slot[]}
     */
    slots(season) {
      let slots = cache.get(season);
      if (!slots) {
        slots = Object.freeze(shape.map((s, index) => Object.freeze({ index, stage: s.stage, round: s.round, kickoff: toInstant(season, s.minutes) })));
        cache.set(season, slots);
      }
      return slots;
    },

    /**
     * The season a moment belongs to: season N runs from its day 1 00:00 up to season N+1's. Moments before
     * season 1 count as season 1.
     * @param {number} t  Epoch ms.
     */
    seasonAt(t) {
      const weekMs = calendar.seasonDays * DAY_MINUTES * MINUTE;
      let season = Math.max(1, Math.floor((t - api.seasonStart(1)) / weekMs) + 1);
      // The estimate can be one off around daylight-saving changes.
      while (season > 1 && t < api.seasonStart(season)) season--;
      while (t >= api.seasonStart(season + 1)) season++;
      return season;
    },

    /**
     * Where a moment sits in the calendar.
     * @param {number} t  Epoch ms.
     * @returns {CalendarPosition}
     */
    at(t) {
      const season = api.seasonAt(t);
      const slots = api.slots(season);
      let started = 0;
      while (started < slots.length && slots[started].kickoff <= t) started++;
      const firstKnockout = slots[regularCount]?.kickoff ?? Infinity;
      return {
        season,
        seasonStart: api.seasonStart(season),
        seasonEnd: api.seasonStart(season + 1),
        phase: t >= firstKnockout ? 'playoffs' : 'regular',
        started,
        next: slots[started] ?? null,
      };
    },
  };
  return api;
}

/** @typedef {ReturnType<typeof createCalendar>} Calendar */

/**
 * The moment to read the season just finished at (Task 277b): from a new season's 00:00 to its first kick-off the night
 * after the last final goes on, so its studio cards and the desk's standings and scorers stay about that season, as
 * they were before midnight (the calendar already counts the new one: SEASON 3's countdown, empty scorers). Otherwise `t`.
 * @param {Calendar} calendar @param {number} t
 */
export function wrapUpAt(calendar, t) {
  const pos = calendar.at(t);
  return pos.season > 1 && pos.started === 0 ? pos.seasonStart - 1 : t;
}

/**
 * Convert wall-clock times in an IANA time zone to instants, using the built-in Intl (Node and browsers).
 * @param {string} timeZone
 */
export function zoneOffsets(timeZone) {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });

  /** Offset of the zone from UTC at an instant, in ms (e.g. −4 h for New York in summer). @param {number} t */
  const offsetAt = (t) => {
    /** @type {Record<string, number>} */
    const p = {};
    for (const { type, value } of format.formatToParts(new Date(t))) if (type !== 'literal') p[type] = Number(value);
    const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return wall - (t - (((t % 1000) + 1000) % 1000));
  };

  return {
    offsetAt,
    /**
     * The instant when the zone's clocks show a wall time. `wall` is that wall time written as if it were UTC.
     * A time skipped by a spring-forward change resolves to an hour later; a repeated autumn time to its first occurrence.
     * @param {number} wall
     */
    wallToInstant(wall) {
      const guess = wall - offsetAt(wall);
      const offset = offsetAt(guess);
      if (offset === offsetAt(wall)) return guess;
      const second = wall - offset;
      return offsetAt(second) === offset ? second : guess;
    },
  };
}
