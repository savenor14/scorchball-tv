// Instant goal replays (Task 57; docs/channel.md §14.5): during a goal's pause, after a short beat, a small zoomed inset
// replays the last few seconds before the goal. Pure: which goal, which moment of it to show, and where to point the
// camera. main.js draws the replay with the match's own drawing and crops it into the inset. The camera (Task 71, Tom's
// pick from replays.html, setup F) follows the ball, smoothed, at 1.5×, and the replay plays a little slowed.

/**
 * @typedef {object} ReplaySettings  settings.replays
 * @property {number} delayMs  The replay starts this long after the goal.
 * @property {number} leadMs  It starts this long before the goal...
 * @property {number} tailMs  ...and runs on this long after it (the ball in the net).
 * @property {number} zoom  How much it's magnified.
 * @property {number} speed  How fast it plays (1 = as live; below 1, slowed).
 * @property {number} followMs  The camera follows the ball averaged over this long either side of the moment shown.
 * @property {number} w @property {number} h  The inset's size (stage px).
 */

/**
 * The replay on screen at `e` (ms since kick-off), if any: the goal's moment, the moment of the match to show, and how
 * far through the replay it is. Only within the goal's pause, so it's gone before play restarts.
 * @param {import('./timeline.js').Timeline} timeline @param {number} e @param {ReplaySettings} r
 * @returns {{ goalAt: number, show: number, f: number } | null}
 */
export function replayAt(timeline, e, r) {
  // How long it lasts on screen, played at r.speed.
  const length = (r.leadMs + r.tailMs) / r.speed;
  for (const p of timeline.pauses) {
    if (p.kind !== 'goal' || e < p.at + r.delayMs || e >= p.at + r.delayMs + length) continue;
    if (r.delayMs + length > p.ms) continue; // never into play
    const into = e - p.at - r.delayMs;
    return { goalAt: p.at, show: p.at - r.leadMs + into * r.speed, f: into / length };
  }
  return null;
}

/**
 * Where the replay's camera points (pitch fractions) at the moment shown, and how much of the pitch it takes in (Task
 * 71): it follows the ball, averaged over followMs either side (a replay can look ahead, so it never lags and never
 * jerks), up to the goal; the shot is the inset's size over `zoom`, kept on the pitch (a little past each end, so the
 * net can show).
 * @param {{ at: (e: number) => import('./motion.js').Pose | null }} motion @param {number} goalAt @param {number} show
 * @param {ReplaySettings} r @param {{ w: number, h: number }} pitch  The pitch in stage px (pitch.js PITCH).
 * @returns {{ x: number, y: number, w: number, h: number }}  The crop: its centre and size, in pitch fractions.
 */
export function replayFocus(motion, goalAt, show, r, pitch) {
  // Weighted toward the moment shown (a triangle over the window), so a fast pass across, such as a cut-back from the
  // corner area (Task 79), doesn't leave the camera far behind.
  let x = 0;
  let y = 0;
  let n = 0;
  for (let t = show - r.followMs; t <= show + r.followMs; t += FOLLOW_STEP_MS) {
    const b = motion.at(Math.min(goalAt, t))?.ball;
    if (!b) continue;
    const weight = 1 - Math.abs(t - show) / (r.followMs + FOLLOW_STEP_MS);
    x += b.x * weight;
    y += b.y * weight;
    n += weight;
  }
  const w = r.w / r.zoom / pitch.w;
  const h = r.h / r.zoom / pitch.h;
  const c = n ? { x: x / n, y: y / n } : { x: 0.5, y: 0.5 };
  return { x: Math.min(1 - w / 2 + 0.04, Math.max(w / 2 - 0.04, c.x)), y: Math.min(1 - h / 2, Math.max(h / 2, c.y)), w, h };
}

/** The camera samples the ball this often (ms of match time). */
const FOLLOW_STEP_MS = 50;
