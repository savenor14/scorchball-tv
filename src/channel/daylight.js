// How dark it is by the league's clock (Tom's note 14; docs/channel.md §31): day, dusk, night and dusk again at dawn,
// easing from one to the next. Pure and DOM-free, for the light (lighting.js) and for the programme (the grounds tour
// shows only the groundstaff at night).

const MINUTES = 24 * 60;

/** "17:00" → 1020. @param {string} hhmm */
const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** @param {number} f */
const smooth = (f) => f * f * (3 - 2 * f);

/**
 * The wall-clock minute of the day (0–1440) at instant `t`, given the time zone's offset from UTC then.
 * @param {number} t @param {number} offset  ms (calendar.js zoneOffsets().offsetAt).
 */
export const minuteOfDay = (t, offset) => ((((t + offset) / 60_000) % MINUTES) + MINUTES) % MINUTES;

/**
 * How dark it is at a wall-clock minute of the day (0–1440): 0 day, 1 dusk, 2 night, easing over easeMinutes centred
 * on each change.
 * @param {number} minute @param {{ dayFrom: string, duskFrom: string, nightFrom: string, dawnFrom: string, easeMinutes: number }} s
 */
export function lightLevel(minute, s) {
  // The changes in the day's order, each from one level to the next.
  const changes = [
    { at: minutesOf(s.dawnFrom), from: 2, to: 1 },
    { at: minutesOf(s.dayFrom), from: 1, to: 0 },
    { at: minutesOf(s.duskFrom), from: 0, to: 1 },
    { at: minutesOf(s.nightFrom), from: 1, to: 2 },
  ];
  const half = s.easeMinutes / 2;
  for (const c of changes) {
    // Minutes from the change, the short way round midnight.
    const d = ((((minute - c.at) % MINUTES) + MINUTES + MINUTES / 2) % MINUTES) - MINUTES / 2;
    if (half > 0 && Math.abs(d) < half) return c.from + (c.to - c.from) * smooth((d + half) / (2 * half));
  }
  // Otherwise the level of the last change before this minute.
  const since = (/** @type {{ at: number }} */ c) => (((minute - c.at) % MINUTES) + MINUTES) % MINUTES;
  return changes.reduce((a, b) => (since(b) < since(a) ? b : a)).to;
}

/**
 * The moment whose light a segment shows (Tom, 2026-10-19): a re-air or a highlights package as it was when the match
 * was played (its kick-off and how far in), so a night match stays a night match; everything else as now.
 * @param {{ kind: string, match?: { kickoff: number }, elapsed?: number }} seg @param {number} t
 */
export function litMoment(seg, t) {
  if ((seg.kind === 'reair' || seg.kind === 'highlights') && seg.match) return seg.match.kickoff + (seg.elapsed ?? 0);
  return t;
}
