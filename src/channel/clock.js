// The channel's clock: real time, optionally started at another moment (?at=) and/or run faster (?speed=).
// Pure: the real-time source is passed in. The URL parameters are read in dev.js. See docs/channel.md §10.

/**
 * @param {{ realNow: () => number, at?: number | null, speed?: number }} options
 *   `at`: the league moment (epoch ms) the clock starts from; defaults to the real time. `speed`: league ms per real ms.
 */
export function createClock({ realNow, at = null, speed = 1 }) {
  if (!(speed > 0)) throw new RangeError(`speed must be above 0, got ${speed}`);
  const realStart = realNow();
  const leagueStart = at ?? realStart;
  let last = -Infinity;
  return {
    speed,
    /**
     * The league's current moment, in epoch ms. It never goes backwards: the computer's clock can step back (Windows
     * syncs it with a time server now and then), and the live league can't rewind, so the channel holds still until
     * real time catches up. It still follows the wall clock, so it stays on the real schedule.
     */
    now: () => (last = Math.max(last, leagueStart + (realNow() - realStart) * speed)),
  };
}
