// The phone readout's numbers (phones, step 1; ?perf=1): frame times, what each frame spends its time on, and how late
// sounds start against when they were due. Pure and DOM-free: the channel feeds it times, overlays/perfView.js shows it.
// See docs/channel.md §27.

/** A frame longer than this missed the 30-a-second mark: the picture stutters. */
export const SLOW_FRAME_MS = 33;
/** Sounds started this much later than due are counted as late (a sixtieth of a second is a frame's own lag). */
export const LATE_SOUND_MS = 50;

/**
 * @typedef {object} Tally  One stretch's numbers (the last few seconds, or since loading or a reset).
 * @property {number} frames
 * @property {number} sumMs  The frames' intervals added up.
 * @property {number} worstMs
 * @property {number} slow  Frames over SLOW_FRAME_MS.
 * @property {Record<string, number>} phases  ms spent in each part of drawing, added up.
 * @property {number} sounds  Sounds started.
 * @property {number} lateSumMs
 * @property {number} worstLateMs
 * @property {number} late  Sounds over LATE_SOUND_MS late.
 * @property {number} dropped  Sounds left out for being too late.
 * @property {number} takes  Rendered sounds (the crowd, the music) started.
 * @property {number} takesLate  Of them, over LATE_SOUND_MS later than asked for, waiting on their render.
 * @property {number} worstTakeLateMs
 * @property {number} busyWorstMs  The worst frame while heavy sounds were being rendered.
 */

/** @returns {Tally} */
function emptyTally() {
  return { frames: 0, sumMs: 0, worstMs: 0, slow: 0, phases: {}, sounds: 0, lateSumMs: 0, worstLateMs: 0, late: 0, dropped: 0, takes: 0, takesLate: 0, worstTakeLateMs: 0, busyWorstMs: 0 };
}

/**
 * The readout's stats: a frame is begun, its parts marked as they finish, then ended; sounds are reported as they start.
 * @param {{ windowMs?: number }} [o]  windowMs: how long "now" covers.
 */
export function createPerf({ windowMs = 5000 } = {}) {
  let total = emptyTally();
  let current = emptyTally();
  /** The last full window's tally, shown while the next fills. */
  let recent = emptyTally();
  let windowFrom = /** @type {number | null} */ (null);
  let lastFrame = /** @type {number | null} */ (null);
  let markAt = 0;
  /** @type {Record<string, number>} This frame's parts. */
  let frameParts = {};
  /** This frame's interval was counted (not the first, nor after a gap), so its parts are too. */
  let counted = false;

  /** @param {(t: Tally) => void} f */
  const both = (f) => { f(total); f(current); };

  return {
    /**
     * A frame begins (requestAnimationFrame's time, or performance.now()). The interval since the last is the frame's
     * time as the viewer sees it (drawing plus whatever the browser did between).
     * @param {number} now @param {{ busy?: boolean }} [o]  busy: heavy sounds are being rendered.
     */
    frameStart(now, { busy = false } = {}) {
      counted = false;
      if (lastFrame !== null) {
        const ms = now - lastFrame;
        // A hidden tab or a paused browser gives no frames: a gap of seconds isn't a slow frame.
        if (ms >= 0 && ms < 1000) {
          counted = true;
          both((t) => {
            t.frames++;
            t.sumMs += ms;
            t.worstMs = Math.max(t.worstMs, ms);
            if (ms > SLOW_FRAME_MS) t.slow++;
            if (busy) t.busyWorstMs = Math.max(t.busyWorstMs, ms);
          });
        }
      }
      lastFrame = now;
      if (windowFrom === null) windowFrom = now;
      if (now - windowFrom >= windowMs) {
        recent = current;
        current = emptyTally();
        windowFrom = now;
      }
      markAt = now;
      frameParts = {};
    },
    /** The part of drawing just finished: the time since the last mark goes to it. @param {string} part @param {number} now */
    mark(part, now) {
      frameParts[part] = (frameParts[part] ?? 0) + (now - markAt);
      markAt = now;
    },
    /**
     * Time measured inside the parts (building sounds, the sharp text), shown as "of which". @param {string} part @param {number} ms
     */
    add(part, ms) {
      frameParts[`+${part}`] = (frameParts[`+${part}`] ?? 0) + ms;
    },
    /** The frame's drawing is done. @param {number} now */
    frameEnd(now) {
      if (!counted) return;
      frameParts.drawing = now - (lastFrame ?? now);
      both((t) => { for (const [k, v] of Object.entries(frameParts)) t.phases[k] = (t.phases[k] ?? 0) + v; });
    },
    /** A sound started `lateMs` after it was due (0 or less: on time). @param {number} lateMs */
    sound(lateMs) {
      const ms = Math.max(0, lateMs);
      both((t) => {
        t.sounds++;
        t.lateSumMs += ms;
        t.worstLateMs = Math.max(t.worstLateMs, ms);
        if (ms > LATE_SOUND_MS) t.late++;
      });
    },
    /** A rendered sound started `lateMs` after it was asked for, waiting on its render. @param {number} lateMs */
    rendered(lateMs) {
      const ms = Math.max(0, lateMs);
      both((t) => {
        t.takes++;
        t.worstTakeLateMs = Math.max(t.worstTakeLateMs, ms);
        if (ms > LATE_SOUND_MS) t.takesLate++;
      });
    },
    /** A sound left out for coming too late. */
    dropped() { both((t) => { t.dropped++; }); },
    /** Start the "since" numbers afresh (one test at a time: Full, then Broadcast…). */
    reset() {
      total = emptyTally();
      current = emptyTally();
      recent = emptyTally();
      windowFrom = null;
    },
    /** The last few seconds (the window before this one, or this one until there is one) and since loading or a reset. */
    get recent() { return recent.frames ? recent : current; },
    get total() { return total; },
  };
}

/** @param {number} n @param {number} [d] */
const fix = (n, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');

/**
 * One stretch as lines of text: frames (average, frames a second, worst, slow), the parts of drawing per frame, sounds.
 * @param {Tally} t @param {string} label
 * @returns {string[]}
 */
export function tallyLines(t, label) {
  if (!t.frames) return [`${label}: no frames yet`];
  const avg = t.sumMs / t.frames;
  const per = (/** @type {string} */ k) => (t.phases[k] ?? 0) / t.frames;
  const keys = Object.keys(t.phases).filter((k) => k !== 'drawing').sort((a, b) => per(b) - per(a));
  const parts = keys.filter((k) => !k.startsWith('+'));
  const within = keys.filter((k) => k.startsWith('+'));
  const drawn = per('drawing');
  return [
    `${label}: ${t.frames} frames, avg ${fix(avg)} ms (${fix(1000 / avg, 0)} fps), worst ${fix(t.worstMs, 0)}, over ${SLOW_FRAME_MS} ms ${t.slow} (${fix((100 * t.slow) / t.frames, 0)}%)`,
    `  drawing ${fix(drawn)} ms a frame, the browser ${fix(Math.max(0, avg - drawn))}`,
    `  parts: ${parts.map((k) => `${k} ${fix(per(k), 2)}`).join(', ')}`,
    ...(within.length ? [`  of which: ${within.map((k) => `${k.slice(1)} ${fix(per(k), 2)}`).join(', ')}`] : []),
    t.sounds || t.dropped
      ? `  sounds ${t.sounds}: late avg ${fix(t.sounds ? t.lateSumMs / t.sounds : 0, 0)} ms, worst ${fix(t.worstLateMs, 0)}, over ${LATE_SOUND_MS} ms ${t.late}, dropped ${t.dropped}`
      : '  sounds: none',
    ...(t.takes ? [`  rendered sounds ${t.takes}: waiting on their render over ${LATE_SOUND_MS} ms ${t.takesLate}, worst ${fix(t.worstTakeLateMs, 0)} ms`] : []),
    ...(t.busyWorstMs ? [`  worst frame while sounds rendered: ${fix(t.busyWorstMs, 0)} ms`] : []),
  ];
}
