// momentum on screen (Momentum, Task 238; docs/channel.md §22): who has it at a moment of the picture and how much is
// left, from the match's `momentum` events (Task 237). Pure. Drawn as a glow round the team's kit swatch on the
// scorebug, fading with what's left (Tom's pick B), and a heat-orange ring pulsing out under each of its players for a
// moment as it's gained (C, Tom: under the sprites).

/**
 * The team with momentum `elapsed` ms after kick-off, how much of it is left (1 full, fading to 0) and how long ago
 * it was gained (ms of picture); null when nobody has it (none gained yet, faded, a new period, the shootout).
 * @param {import('./timeline.js').Timeline} tl @param {number} elapsed @param {number} seconds  rules.momentum.seconds
 * @returns {{ teamId: string, left: number, since: number } | null}
 */
export function momentumAt(tl, elapsed, seconds) {
  const n = tl.countAt(elapsed);
  for (let i = n - 1; i >= 0; i--) {
    const { event: e, at } = tl.events[i];
    // It ends with the period, and there's none in a shootout.
    if (e.type === 'kickoff' || e.type === 'half_time' || e.type === 'full_time' || e.type === 'overtime_start' || e.type === 'shootout_kick') return null;
    // A scorcher (Tom, after Task 255): its momentum comes in the picture after the goal's pause (it follows the goal
    // in the log), but it's shown from the goal itself, as a burn's is, through the celebration. The bonus is the sim's,
    // on the game clock, which the pause stops, so it still starts at the restart.
    if (e.type === 'goal' && /** @type {any} */ (e.data)?.scorcher) {
      const gained = tl.events.slice(i + 1).find((x) => x.event.clock !== e.clock || x.event.type === 'momentum');
      if (gained?.event.type !== 'momentum' || gained.event.clock !== e.clock) continue;
      const left = (/** @type {any} */ (gained.event.data).until - tl.stateAt(elapsed).clock) / seconds;
      return left > 0 ? { teamId: /** @type {string} */ (gained.event.teamId), left: Math.min(1, left), since: elapsed - at } : null;
    }
    if (e.type !== 'momentum') continue;
    const until = /** @type {any} */ (e.data).until;
    const left = (until - tl.stateAt(elapsed).clock) / seconds;
    // A scorcher's, timed from its goal (above), so the rings don't play a second time at the restart.
    const goal = /** @type {any} */ (e.data).cause === 'scorcher' ? tl.events.slice(0, i).findLast((x) => x.event.type === 'goal' && x.event.clock === e.clock) : undefined;
    return left > 0 ? { teamId: /** @type {string} */ (e.teamId), left: Math.min(1, left), since: elapsed - (goal?.at ?? at) } : null;
  }
  return null;
}
