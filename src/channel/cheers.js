// Celebrations that cheer (Task 278l, Tom: after a goal the scorers ran to a spot and stood; at full time the winners
// gathered and stood). Pure and DOM-free; drawing only, results untouched. A goal: the scorer and their teammates
// (pair: the nearest one; group: every outfielder) gather round the scorer and cheer on a beat (arms up with a hop; the
// pair high-five), easing out of it before the celebration ends so play resumes from where the motion has them, with
// nothing jumping. The keeper's arms-up and the bench's cheer are as before (main.js, sidelines.js).

/** The beat of a cheer: arms up with a hop on every other one. */
export const CHEER_BEAT_MS = 300;
/** How high a hop is, pitch fractions down the page. */
export const HOP = 0.01;
/** Gathering round the scorer, and easing back out before the celebration ends: at least this long (ms)... */
const GATHER_MS = 700;
/** ...longer for anyone further, at up to this many times the usual running speed (a celebration sprint)... */
const SPRINT = 2;
/** ...and only those who can be there by this share of the celebration join the group. */
const JOIN_SHARE = 0.5;
/** The ring round the scorer, pitch lengths (across is twice as tall in pitch fractions). */
const RING = 0.032;

const ease = (/** @type {number} */ f) => {
  const g = Math.min(1, Math.max(0, f));
  return g * g * (3 - 2 * g);
};

/**
 * The scoring side cheering a goal.
 * @template {{ playerId: string, side: 'home' | 'away', slot: string, x: number, y: number }} P
 * @param {P[]} players  Where the motion has everyone.
 * @param {{ side: 'home' | 'away', since: number }} cheer  The celebration (sidelines.js celebrationAt).
 * @param {{ variant: 'pair' | 'group' | 'none', scorerId: string | null, keeperSlot: string, celebrateMs: number, runSpeed?: number, atGoal?: { playerId: string, x: number, y: number }[] }} o
 *   runSpeed: animation.runSpeed (pitch lengths a second).
 *   atGoal: where everyone was as the goal went in, so who joins the scorer, and where, holds for the whole celebration
 *   (chosen afresh each frame, the nearest flipped as two teammates crossed, and they jumped).
 * @returns {(P & { arms?: 'both' | 'left' | 'right' })[]}
 */
export function goalCheer(players, cheer, { variant, scorerId, keeperSlot, celebrateMs, runSpeed = 0.11, atGoal = players }) {
  const scorer = players.find((p) => p.playerId === scorerId);
  if (variant === 'none' || !scorer) return players;
  const then = new Map(atGoal.map((q) => [q.playerId, q]));
  const s0 = then.get(scorer.playerId) ?? scorer;
  const from = (/** @type {P} */ q) => then.get(q.playerId) ?? q;
  const far = (/** @type {P} */ q) => Math.hypot(from(q).x - s0.x, (from(q).y - s0.y) / 2);
  // Nearest first as the goal went in (the pair), ties by id, so the order never changes mid-celebration.
  const mates = players
    .filter((p) => p.side === cheer.side && p.slot !== keeperSlot && p !== scorer)
    .sort((a, b) => far(a) - far(b) || (a.playerId < b.playerId ? -1 : 1));
  // Each one's run in (and back out), by how far they were: a smooth start and stop peaks at 1.5 times the average pace.
  const runMs = (/** @type {P} */ q) => Math.max(GATHER_MS, (1.5 * far(q) * 1000) / (runSpeed * SPRINT));
  // Only those who can be there in time join (the pair too: a far-off nearest teammate would never arrive).
  const near = mates.filter((q) => runMs(q) <= JOIN_SHARE * celebrateMs);
  const group = variant === 'pair' ? near.slice(0, 1) : near;
  const s = cheer.since;
  // In, then out again before the celebration ends (the motion takes them back from where it has them).
  const shareOf = (/** @type {P} */ q) => (q === scorer ? Math.min(ease(s / GATHER_MS), ease((celebrateMs - s) / GATHER_MS)) : Math.min(ease(s / runMs(q)), ease((celebrateMs - s) / runMs(q))));
  // The pair high-five in the middle third of the celebration.
  const highFive = variant === 'pair' && s > celebrateMs / 3 && s < celebrateMs / 2;
  return players.map((p) => {
    const k = p === scorer ? 0 : group.indexOf(p) + 1;
    if (k < 0 || (k === 0 && p !== scorer)) return p;
    const f = shareOf(p);
    const cheering = f > 0.6;
    let at = { x: p.x, y: p.y };
    if (k > 0) {
      // A ring round the scorer (the pair: beside them, on the side they came from).
      const a = variant === 'pair' ? (from(p).x < s0.x ? Math.PI : 0) : (2 * Math.PI * (k - 1)) / group.length;
      const spot = { x: scorer.x + RING * Math.cos(a), y: scorer.y + 2 * RING * Math.sin(a) };
      at = { x: p.x + (spot.x - p.x) * f, y: p.y + (spot.y - p.y) * f };
    }
    if (!cheering) return { ...p, ...at };
    if (highFive) {
      // Hands up towards each other.
      const mate = group[0];
      const left = mate && from(mate).x < s0.x;
      const towards = k === 0 ? (left ? 'left' : 'right') : left ? 'right' : 'left';
      return { ...p, ...at, arms: /** @type {const} */ (towards) };
    }
    const up = Math.floor((s + k * 110) / CHEER_BEAT_MS) % 2 === 0;
    return { ...p, x: at.x, y: at.y - (up ? HOP * f : 0), ...(up ? { arms: /** @type {const} */ ('both') } : {}) };
  });
}

/**
 * A winner cheering at full time, in the huddle or the salute: arms up with a hop on the beat, each a little out of
 * step with the next. `share` (0–1) eases it in and out with the huddle's idle.
 * @param {number} since @param {number} i  Their place in the squad. @param {number} share
 * @returns {{ arms: 'both' | 'right' | 'none', dy: number }}
 */
export function winnerCheer(since, i, share) {
  if (share < 0.5) return { arms: 'none', dy: 0 };
  const beat = Math.floor((since + i * 130) / CHEER_BEAT_MS);
  if (beat % 2 === 0) return { arms: 'both', dy: -HOP };
  // Now and then a wave to the fans between the jumps.
  return { arms: beat % 5 === 1 ? 'right' : 'none', dy: 0 };
}
