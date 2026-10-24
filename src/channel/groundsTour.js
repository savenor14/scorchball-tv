// AROUND THE GROUNDS (Tom's note 14; picked on groundstour.html; docs/channel.md §32): a tour of the league's grounds
// with no match on, one ground after another, each with something going on there. Pure and DOM-free: which grounds in
// which order, which scene at each, and the caption's words, all seeded by the gap, so every screen shows the same.
// The scenes are drawn by groundScenes.js.
//
//   the order    every ground once, seeded by the gap, ending at the next match's ground (its home team's)
//   the scenes   dealt like the studio cards: a seeded shuffle, so no tour shows one twice; at night and on the night
//                after the final only the ten fit for the night (SCENES' staff), by day all but the night watch
import { createRng } from '../sim/rng.js';

/**
 * The scenes: `staff`, fit for the night (no squad training; nobody in the stands), dealt at night and on the night after
 * the final; `nightOnly`, never by day (the night watch). Round 4 (Tom, 2026-10-19: a night tour showed only five, so
 * repeats): the manager, the name on the turf, litter, a lone lap, the night watch; ten for a night, fourteen by day.
 * @type {Readonly<Record<string, { staff: boolean, nightOnly?: boolean }>>}
 */
export const SCENES = Object.freeze({
  shooting: { staff: false },
  keepers: { staff: false },
  chat: { staff: false },
  cones: { staff: false },
  cardio: { staff: false },
  mowing: { staff: true },
  lines: { staff: true },
  emblem: { staff: true },
  nets: { staff: true },
  dugouts: { staff: true },
  manager: { staff: true },
  turfName: { staff: true },
  litter: { staff: true },
  lap: { staff: true },
  guard: { staff: true, nightOnly: true },
});

/**
 * @typedef {{ teamId: string, scene: string }} Visit  One ground on the tour.
 */

/** A seeded shuffle. @template T @param {T[]} items @param {ReturnType<typeof createRng>} rng @returns {T[]} */
function shuffled(items, rng) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * The tour: every ground once in a seeded order ending at `lastId`'s (when it's one of them), each with its scene.
 * @param {string[]} teamIds  Every team, in the data's order.
 * @param {{ key: string, lastId: string | null, staffOnly: boolean }} o  key: seeds the order and the deal (the gap);
 *   lastId: whose ground ends the tour (the next match's home team); staffOnly: only the groundstaff (at night, and
 *   on the night after the final).
 * @returns {Visit[]}
 */
export function tourVisits(teamIds, { key, lastId, staffOnly }) {
  const order = shuffled(teamIds, createRng(`grounds|order|${key}`));
  if (lastId && order.includes(lastId)) order.push(...order.splice(order.indexOf(lastId), 1));
  const deck = Object.keys(SCENES).filter((k) => (staffOnly ? SCENES[k].staff : !SCENES[k].nightOnly));
  /** @type {string[]} */
  const dealt = [];
  for (let k = 0; dealt.length < order.length; k++) {
    const hand = shuffled(deck, createRng(`grounds|deal|${key}|${k}`));
    // Never the same scene twice running where one hand meets the next.
    if (dealt.length && hand[0] === dealt[dealt.length - 1]) hand.push(/** @type {string} */ (hand.shift()));
    dealt.push(...hand);
  }
  return order.map((teamId, i) => ({ teamId, scene: dealt[i] }));
}

/**
 * A team's ground's name, from the data (never the league: it's the channel's alone, src/sim/league.js CHANNEL_ONLY):
 * "the Rookery". Capitalize it at a sentence's start, upper-case it on graphics.
 * @param {{ teams: { teams: { id: string, ground: string }[] } }} config @param {string} teamId
 */
export function groundName(config, teamId) {
  return config.teams.teams.find((x) => x.id === teamId)?.ground ?? '';
}

/**
 * The caption on a ground (the plate, Tom's pick A): the ground's name and whose home it is (Tom: no words for what's
 * going on, the picture shows it).
 * @param {{ ground: string, name: string }} team
 */
export function tourCaption(team) {
  return { title: team.ground.toUpperCase(), detail: `Home of the ${team.name}` };
}
