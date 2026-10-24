// Full or Broadcast (Task 55; docs/channel.md §14.3): the viewer's choice, and the slide between them. Pure: the
// frame loop asks how far into Broadcast the picture is at a moment of real time, and shifts the ground and fades the
// stands by that much. Each load starts in Full (or ?layout=broadcast, which the dev panel's jumps add, Task 62);
// nothing is remembered between visits.

/** @typedef {'full' | 'broadcast'} Layout */

/**
 * @param {{ slideMs: number }} o  How long the slide between layouts takes (settings.broadcast.slideMs).
 * @param {Layout} [initial]  The layout at load, already in place (no slide).
 */
export function createLayout({ slideMs }, initial = 'full') {
  /** @type {Layout} */
  let mode = initial;
  /** Where the slide started (0 = Full, 1 = Broadcast), and when (real ms). */
  let from = initial === 'broadcast' ? 1 : 0;
  let startedAt = -Infinity;

  /** How far into Broadcast the picture is at real time `now`: 0 Full, 1 Broadcast, eased in between. @param {number} now */
  function progress(now) {
    const to = mode === 'broadcast' ? 1 : 0;
    const f = slideMs > 0 ? Math.min(1, Math.max(0, (now - startedAt) / slideMs)) : 1;
    const eased = f * f * (3 - 2 * f);
    return from + (to - from) * eased;
  }

  return {
    get mode() { return mode; },
    progress,
    /** Switch to the other layout at real time `now`, carrying on from wherever a slide in progress has got to. @param {number} now */
    toggle(now) {
      from = progress(now);
      mode = mode === 'full' ? 'broadcast' : 'full';
      startedAt = now;
    },
  };
}
