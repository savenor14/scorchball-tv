// Small shared helpers. Browser-safe.

/** A copy of an object without "_" comment keys. @template T @param {Readonly<Record<string, T>>} object @returns {Record<string, T>} */
export function withoutComments(object) {
  return Object.fromEntries(Object.entries(object).filter(([k]) => !k.startsWith('_')));
}

/** @param {number[]} values */
export function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Deep-merge plain objects into `target` (changed in place); arrays and values replace. @param {any} target @param {any} patch */
export function deepMerge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') deepMerge(target[k], v);
    else target[k] = v;
  }
  return target;
}

/** Matches a season-relative time such as "day 6 20:00". */
export const DAY_TIME = /^day ([1-9]\d*) ([01]\d|2[0-3]):([0-5]\d)$/;

/** Matches a date and time such as "2026-11-02 00:00" (settings.switches, Task 274: in the league's time zone). */
export const SWITCH_TIME = /^(\d{4})-(\d{2})-(\d{2}) ([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Parse "day N HH:MM" (day 1 is the season's Monday). These are wall-clock times in the league's time zone.
 * @param {string} text
 * @returns {{ day: number, hour: number, minute: number, minutes: number }}  `minutes`: wall-clock minutes from day 1 00:00, for ordering.
 */
export function parseDayTime(text) {
  const m = DAY_TIME.exec(text);
  if (!m) throw new RangeError(`Expected a time like "day 6 20:00", got "${text}"`);
  const [day, hour, minute] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return { day, hour, minute, minutes: (day - 1) * 1440 + hour * 60 + minute };
}
