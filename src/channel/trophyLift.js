// The trophy lift after the final (the off-season show, Task 190; docs/channel.md §19.1; Tom's pick B on
// offseason.html): in place of the handshakes, before the post-match show. Pure and DOM-free: the parts' timing,
// everyone's place, the caption, the crowd's mood and sounds. liftArt.js draws the podium and the close-up.
//
//   The celebration (trophyLift.celebrateSeconds), three ways in turn (Task 197, Tom): the champions, the whole squad,
//     run to their fans by the bottom touchline and jump about together in a huddle; then pair off, hugging and
//     high-fiving; then spread along the boards waving to their fans. The runners-up stand about, some with hands on
//     heads; the referee and the runners-up's manager leave as after any match, the champions' manager stays on the
//     touchline throughout, clapping and cheering now and then (liftCoach).
//   The handshakes (guardSeconds): the runners-up form a guard of honour across the pitch, applauding; the champions
//     leave the boards one after another, cut round its near end to queue in two loose rows (never through it), then
//     file steadily along it, a hand out to each runner-up as they pass, and gather past the far end. The near end is
//     the champions' side (Task 212, Tom): celebrating on the right, it all runs mirrored, right to left.
//   The anthem (anthemSeconds): the runners-up go off down the tunnel first (Task 197: nobody crosses), then the
//     champions line up across halfway for their own tune.
//   The lift (liftSeconds): the champions walk to a podium on the centre circle, the captain in the middle; after
//     closeUpAfterSeconds the picture cuts to the close-up (liftArt.js) of the five who started, the captain lifting
//     the Scorch Cup; stageAfterSeconds later (Tom, 2026-10-20: a second cut, his pick C on offseason.html) it cuts
//     back wide to a stage where the podium stood, an arch in their colours over it, the cup passed down the line from
//     the captain, fireworks over the stands. The crowd cheers all through it (liftCues).
// Everyone starts from where they were at the final whistle (on the pitch or the bench), so nothing jumps.
import { SMALL_CHEER } from './crowd.js';
import { recipe } from './soundRecipes.js';
import { PITCH } from './pitch.js';
import { TUNNEL } from './sidelines.js';

/**
 * @typedef {{ celebrateSeconds: number, guardSeconds: number, anthemSeconds: number, liftSeconds: number, closeUpAfterSeconds: number, stageAfterSeconds: number }} LiftSettings
 *   settings.trophyLift
 * @typedef {import('./formation.js').Placed & { arms?: import('./pitch.js').Arms }} LiftPlaced
 * @typedef {{ x: number, y: number }} Point
 */

/** Where the champions' celebration gathers (pitch fractions), by the bottom touchline on their fans' side. */
const PILE = Object.freeze({ home: { x: 0.28, y: 0.86 }, away: { x: 0.72, y: 0.86 } });
/** The guard of honour: the runners-up's line, the champions' path along it (just above), its ends. */
const GUARD = Object.freeze({ y: 0.58, from: 0.27, gap: 0.05, pathY: 0.47, start: 0.2, end: 0.85 });
/** The anthem line across halfway and the podium's row, a player every LINE_GAP. */
const LINE_GAP = 0.045;
export const PODIUM_Y = 0.44;
/** How far the podium's top stands above its row, stage px (liftArt.js drawPodium): the champions step up exactly that far. */
export const PODIUM_TOP_PX = 2;
const PODIUM_GAP = 0.04;
/** The celebration's three ways, each a third of it (Task 197): a huddle, pairs, along the boards. */
const CELEBRATIONS = 3;
/** Moving from one way of celebrating to the next, ms. */
const REGROUP_MS = 3500;
/** The boards' row (pitch fractions down), just inside the bottom touchline, and how far apart the champions stand along it. */
const BOARDS_Y = 0.95;
const BOARDS_GAP = 0.042;
/** In the anthem's part: when the champions set off for halfway (the runners-up are gone by then), and arrive. */
const ANTHEM_GO = 0.3;
const ANTHEM_SET = 0.48;
/** From the queue to the start of the guard of honour, before the walk along it: ms, plus ms per pitch length further back. */
const APPROACH_MS = 600;
const APPROACH_PER = 6000;
/** To the queue (Task 212), as shares of the guard's part: each champion leaves the boards LEAVE_EACH after the one
 * nearer the guard, takes TO_CORNER to a spot past the guard's near end and below it, then TO_QUEUE up to their place. */
const LEAVE_EACH = 0.012;
const TO_CORNER = 0.05;
const TO_QUEUE = 0.035;
/** The queue: two loose rows, QUEUE_GAP apart along, the second QUEUE_ROW above the path. */
const QUEUE_GAP = 0.03;
const QUEUE_ROW = 0.035;
/** A hand out to a runner-up while within this of them along the line (pitch fractions). */
const SHAKE_REACH = 0.012;

/** @param {LiftSettings} s */
export function liftParts(s) {
  const guardAt = s.celebrateSeconds * 1000;
  const anthemAt = guardAt + s.guardSeconds * 1000;
  const liftAt = anthemAt + s.anthemSeconds * 1000;
  const closeUpAt = liftAt + s.closeUpAfterSeconds * 1000;
  return { guardAt, anthemAt, liftAt, closeUpAt, stageAt: closeUpAt + s.stageAfterSeconds * 1000, total: liftAt + s.liftSeconds * 1000 };
}

/** The whole ceremony's length, ms. @param {LiftSettings} s */
export const liftLength = (s) => liftParts(s).total;

/** Eased from `from` toward `to` between t0 and t0 + ms. @param {Point} from @param {Point} to @param {number} t @param {number} t0 @param {number} ms */
function walk(from, to, t, t0, ms) {
  const v = Math.min(1, Math.max(0, (t - t0) / Math.max(1, ms)));
  const f = v * v * (3 - 2 * v);
  return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
}

/** A small seeded number in [-1, 1) for a player. @param {string} id @param {number} k */
function jitter(id, k) {
  let h = 2166136261;
  for (const ch of `${id}|${k}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 2000) / 1000 - 1;
}

/**
 * Everyone's place `since` ms after the final whistle. The champions' order is their order in `squads` (the pitch,
 * then the bench), the captain taking the podium's middle.
 * @param {import('./formation.js').Placed[]} squads  Both squads where they were at the whistle, the benches included.
 * @param {number} since @param {LiftSettings} s
 * @param {{ champSide: 'home' | 'away', captainId: string }} o
 * @returns {LiftPlaced[]}
 */
export function liftPose(squads, since, s, { champSide, captainId }) {
  const p = liftParts(s);
  const champs = squads.filter((q) => q.side === champSide);
  const runners = squads.filter((q) => q.side !== champSide);
  const pile = PILE[champSide];
  // The guard of honour's near end is the champions' side (Task 212): on the right, everything about it mirrored.
  const mx = (/** @type {number} */ x) => (champSide === 'away' ? 1 - x : x);
  const dir = champSide === 'away' ? -1 : 1;
  const pileSpot = (/** @type {number} */ i) => ({ x: pile.x + 0.035 * Math.cos(i * 1.9), y: pile.y + 0.05 * Math.sin(i * 1.9) });
  // Pairs (Task 197): two rows of pairs on their fans' side, each pair close together.
  const pairCentre = (/** @type {number} */ i) => {
    const j = Math.floor(i / 2);
    return { x: pile.x + ((j % 3) - 1) * 0.13, y: 0.66 + Math.floor(j / 3) * 0.13 };
  };
  // Along the boards: spread out by their fans, inside the touchlines, the first nearest the guard's near end.
  const boardSpot = (/** @type {number} */ i) => ({ x: Math.min(0.96, Math.max(0.04, pile.x + dir * (i - (champs.length - 1) / 2) * BOARDS_GAP)), y: BOARDS_Y });
  const drifted = (/** @type {Point & { playerId: string }} */ q) => ({ x: q.x + 0.03 * jitter(q.playerId, 1), y: q.y + 0.03 * jitter(q.playerId, 2) });
  const guardSpot = (/** @type {number} */ i) => ({ x: mx(GUARD.from + i * GUARD.gap), y: GUARD.y });
  const queueSpot = (/** @type {number} */ i) => ({ x: mx(GUARD.start - 0.03 - Math.floor(i / 2) * QUEUE_GAP), y: GUARD.pathY - (i % 2) * QUEUE_ROW });
  const pastSpot = (/** @type {number} */ i) => ({ x: mx(GUARD.end + 0.03 + (i % 2) * 0.03), y: 0.36 + Math.floor(i / 2) * 0.035 });
  const start = { x: mx(GUARD.start), y: GUARD.pathY };
  const finish = { x: mx(GUARD.end), y: GUARD.pathY };
  // Past the guard's near end and below it, on the way from the boards to the queue.
  const corner = { x: mx(GUARD.start - 0.04), y: GUARD.y + 0.1 };
  const anthemSpot = (/** @type {number} */ i) => ({ x: 0.5 + (i - (champs.length - 1) / 2) * LINE_GAP, y: 0.5 });
  // The podium: the captain in the middle, the rest either side in their order.
  const others = champs.filter((q) => q.playerId !== captainId);
  const podiumOrder = [...others.slice(0, Math.floor(others.length / 2)), ...champs.filter((q) => q.playerId === captainId), ...others.slice(Math.floor(others.length / 2))];
  const podiumSpot = (/** @type {string} */ id) => ({ x: 0.5 + (podiumOrder.findIndex((q) => q.playerId === id) - (podiumOrder.length - 1) / 2) * PODIUM_GAP, y: PODIUM_Y });

  const G = p.guardAt;
  const guardMs = p.anthemAt - p.guardAt;
  const anthemMs = p.liftAt - p.anthemAt;
  const climbMs = p.closeUpAt - p.liftAt;
  // The procession along the guard: each champion sets off in turn and takes `walkMs` to pass the whole line at a
  // steady walk (Task 212: stepping and stopping at each runner-up, the file stretched and bunched in unison).
  const n = Math.max(1, champs.length);
  const firstOff = 0.12 * guardMs;
  const between = (0.38 * guardMs) / Math.max(1, n - 1);
  const walkMs = 0.45 * guardMs;
  const runnerXs = runners.map((_, k) => guardSpot(k).x);

  /** @type {LiftPlaced[]} */
  const out = [];
  champs.forEach((q, i) => {
    /** @type {Point} */
    let pos;
    /** @type {import('./pitch.js').Arms} */
    let arms = 'none';
    if (since < G) {
      ({ pos, arms } = celebrate(q, i, since));
    } else if (since < p.anthemAt) {
      const g = since - G;
      const off = firstOff + i * between;
      const approach = APPROACH_MS + APPROACH_PER * Math.hypot(start.x - queueSpot(i).x, start.y - queueSpot(i).y);
      // From the boards to the queue round the guard's near end (Task 197: never through the runners-up's line), one
      // after another (Task 212): across to a spot past the end and below it, then up to their place.
      const leave = i * LEAVE_EACH * guardMs;
      const reach = leave + TO_CORNER * guardMs;
      if (g < reach) pos = walk(boardSpot(i), corner, g, leave, TO_CORNER * guardMs);
      else if (g < off) pos = walk(corner, queueSpot(i), g, reach, TO_QUEUE * guardMs);
      else if (g < off + approach) pos = walk(queueSpot(i), start, g, off, approach);
      else if (g < off + approach + walkMs) {
        const v = (g - off - approach) / walkMs;
        pos = { x: start.x + (finish.x - start.x) * v, y: GUARD.pathY };
        // A hand out to each runner-up as they pass, towards the way they walk.
        if (runnerXs.some((x) => Math.abs(x - pos.x) < SHAKE_REACH)) arms = dir === 1 ? 'right' : 'left';
      } else pos = walk(finish, pastSpot(i), g, off + approach + walkMs, 1500);
    } else if (since < p.liftAt) {
      // Waiting past the far end while the runners-up go off, then to halfway for the anthem.
      pos = walk(pastSpot(i), anthemSpot(i), since - p.anthemAt, ANTHEM_GO * anthemMs, (ANTHEM_SET - ANTHEM_GO) * anthemMs);
    } else {
      const l = since - p.liftAt;
      pos = walk(anthemSpot(i), podiumSpot(q.playerId), l, i * 120, 0.55 * climbMs);
      // Up on the podium, cheering: stepped up exactly its height (Tom: they hovered over it, 0.02 of the pitch up).
      const up = Math.min(1, Math.max(0, (l - 0.6 * climbMs) / (0.15 * climbMs)));
      pos = { x: pos.x, y: pos.y - (PODIUM_TOP_PX / PITCH.h) * up };
      if (up >= 1) arms = Math.floor((l + i * 140) / 300) % 2 ? 'both' : 'none';
    }
    out.push({ ...q, ...pos, arms });
  });
  runners.forEach((q, i) => {
    /** @type {Point} */
    let pos;
    /** @type {import('./pitch.js').Arms} */
    let arms = 'none';
    if (since < G) {
      pos = walk(q, drifted(q), since, 0, G);
      arms = i % 2 ? 'head' : 'none';
    } else if (since < p.anthemAt) {
      const g = since - G;
      pos = walk(drifted(q), guardSpot(i), g, 0, 0.1 * guardMs);
      // Applauding once in line.
      if (g > 0.1 * guardMs) arms = Math.floor((since + i * 90) / 200) % 2 ? 'both' : 'none';
    } else {
      // Off down the tunnel (Task 197), one after another, gone before the champions come to halfway.
      const a = since - p.anthemAt;
      const lane = (i % 2 ? 1 : -1) * TUNNEL.lane;
      const mouth = { x: TUNNEL.mouth.x + lane, y: TUNNEL.mouth.y };
      const leave = i * OFF_EACH_MS;
      const toMouth = OFF_WALK * anthemMs;
      if (a >= leave + toMouth + INSIDE_MS) return;
      pos = a < leave + toMouth ? walk(guardSpot(i), mouth, a, leave, toMouth) : walk(mouth, { x: mouth.x, y: TUNNEL.back.y }, a, leave + toMouth, INSIDE_MS);
    }
    out.push({ ...q, ...pos, arms });
  });
  return out;

  /**
   * A champion in the celebration, `t` ms after the whistle: a third each in a huddle hopping together, in pairs
   * (hugging, then high-fiving), and along the boards waving to their fans; REGROUP_MS to move between them.
   * @param {Point & { playerId: string }} q @param {number} i @param {number} t
   * @returns {{ pos: Point, arms: import('./pitch.js').Arms }}
   */
  function celebrate(q, i, t) {
    const third = G / CELEBRATIONS;
    const k = Math.min(CELEBRATIONS - 1, Math.floor(t / third));
    const into = t - k * third;
    const pairMember = i % 2;
    // A pair alternates a hug (close, arms round) and a high five (a step apart, hands up towards each other).
    const pairPose = (/** @type {number} */ at) => {
      const hug = Math.floor((at + Math.floor(i / 2) * 700) / 2400) % 2 === 0;
      const c = pairCentre(i);
      const dx = (hug ? 0.009 : 0.02) * (pairMember ? 1 : -1);
      return { pos: { x: c.x + dx, y: c.y }, arms: /** @type {import('./pitch.js').Arms} */ (hug ? 'both' : pairMember ? 'left' : 'right') };
    };
    if (k === 0) {
      const run = Math.min(4000, 0.15 * G);
      let pos = walk(q, pileSpot(i), t, 0, run);
      if (t <= run) return { pos, arms: 'none' };
      const hop = Math.floor((t + i * 170) / 260) % 2;
      pos = { x: pos.x, y: pos.y - hop * 0.012 };
      return { pos, arms: hop ? 'both' : i % 3 ? 'none' : 'right' };
    }
    if (k === 1) {
      const settled = pairPose(into);
      if (into < REGROUP_MS) return { pos: walk(pileSpot(i), settled.pos, into, 0, REGROUP_MS), arms: 'none' };
      return settled;
    }
    if (into < REGROUP_MS) return { pos: walk(pairPose(third).pos, boardSpot(i), into, 0, REGROUP_MS), arms: 'none' };
    // Waving to their fans, now and then both arms up.
    const beat = Math.floor((into + i * 230) / 380);
    return { pos: boardSpot(i), arms: beat % 7 === 3 ? 'both' : beat % 2 ? 'right' : 'none' };
  }
}

/** The runners-up going off: one after another every OFF_EACH_MS, OFF_WALK of the anthem's part to the tunnel's mouth, INSIDE_MS in it. */
const OFF_EACH_MS = 450;
const OFF_WALK = 0.17;
const INSIDE_MS = 1500;

/**
 * The champions' manager through the lift (Task 197, Tom): on the touchline throughout, now and then clapping and
 * cheering (a burst every COACH_EVERY_MS). `cheer` arms up, `calm` arms down.
 * @param {number} since  ms after the whistle.
 * @returns {'cheer' | 'calm'}
 */
export function liftCoach(since) {
  const into = since % COACH_EVERY_MS;
  return into < COACH_BURST_MS && Math.floor(into / 250) % 2 === 0 ? 'cheer' : 'calm';
}
const COACH_EVERY_MS = 7000;
const COACH_BURST_MS = 1800;

/** How far the podium has risen into place (0 → 1), `since` ms after the whistle. @param {number} since @param {LiftSettings} s */
export function podiumRise(since, s) {
  const p = liftParts(s);
  return Math.min(1, Math.max(0, (since - p.liftAt) / (0.3 * (p.closeUpAt - p.liftAt))));
}

/** @param {number} t @param {number} from @param {number} until */
const frac = (t, from, until) => Math.min(1, Math.max(0, (t - from) / Math.max(1, until - from)));

/**
 * The caption through the lift: the champions, the guard of honour, the anthem, the cup.
 * @param {number} since @param {LiftSettings} s
 * @param {{ championId: string, runnerUpId: string, season: number, score: string }} m  score: the champions' first ("3-2").
 * @param {(teamId: string) => string} teamName
 * @returns {import('./captions.js').Caption | null}  None from the cut to the close-up (Task 197: it covered the podium's words).
 */
export function liftCaption(since, s, m, teamName) {
  const p = liftParts(s);
  if (since >= p.closeUpAt && since < p.stageAt) return null;
  const champ = teamName(m.championId);
  /** @type {[number, number, string, string, string][]} from, until, title, detail, the stripe's team */
  const parts = [
    [0, p.guardAt, `SEASON ${m.season} CHAMPIONS`, `${champ} beat ${teamName(m.runnerUpId)} ${m.score}`, m.championId],
    [p.guardAt, p.anthemAt, 'A GUARD OF HONOUR', `${teamName(m.runnerUpId)} applaud the champions`, m.runnerUpId],
    [p.anthemAt, p.liftAt, "THE CHAMPIONS' ANTHEM", champ, m.championId],
    [p.liftAt, p.total, 'THE SCORCH CUP', `${champ} · season ${m.season} champions`, m.championId],
  ];
  const [from, until, title, detail, teamId] = parts.find(([, u]) => since < u) ?? parts[parts.length - 1];
  return { key: `lift|${title}|${m.championId}`, kind: 'period', title, detail, teamId, f: frac(since, from, until) };
}

/**
 * The stands' mood: the champions' fans jumping as they celebrate and as the cup goes up, everyone waving through the
 * handshakes, the champions' fans through their anthem.
 * @param {number} since @param {LiftSettings} s @param {'home' | 'away'} champSide @param {number} level
 * @returns {import('./crowd.js').StandsMood}
 */
export function liftMood(since, s, champSide, level) {
  const p = liftParts(s);
  if (since < p.guardAt || since >= p.liftAt) return { level: Math.max(level, 1), jump: champSide, gasp: null, wave: null };
  if (since < p.anthemAt) return { level, jump: null, gasp: null, wave: 'both' };
  return { level, jump: null, gasp: null, wave: champSide };
}

/**
 * The lift's sounds, ms after the whistle: a roar for the champions, a small cheer for the guard of honour, the
 * champions' anthem once they're lined up (repeated to fill most of its part) and a small cheer after it, then roars as
 * the cup goes up.
 * @param {LiftSettings} s @param {string} key  Seeds the cues (the match id). @param {string} anthem  The champions' tune.
 * @returns {import('./sounds.js').Cue[]}
 */
export function liftCues(s, key, anthem) {
  const p = liftParts(s);
  const cue = (/** @type {any} */ kind, /** @type {number} */ at, /** @type {object} */ extra = {}) => ({ kind, at, seed: `${key}|lift|${kind}|${at}`, ...extra });
  const anthemMs = p.liftAt - p.anthemAt;
  // Once the runners-up have gone and the champions are lined up (Task 197).
  const anthemFrom = p.anthemAt + Math.round((ANTHEM_SET + 0.02) * anthemMs);
  const fit = Math.max(1, ((0.96 - ANTHEM_SET) * anthemMs) / 1000);
  const tune = recipe('anthem', '', { team: anthem, fit }).duration * 1000;
  const cupUp = p.closeUpAt + 1500;
  return [
    cue('roar', 300, { power: 1 }),
    cue('roar', 2500, { power: 0.8, gain: 0.8 }),
    cue('roar', p.guardAt + 500, { power: SMALL_CHEER, gain: 0.8 }),
    cue('anthem', anthemFrom, { team: anthem, fit }),
    cue('roar', anthemFrom + Math.round(tune), { power: SMALL_CHEER, gain: 0.9 }),
    // The cheering all through the lift (Tom, 2026-10-20): a run of roars as the cup goes up, then waves, a surge at
    // the cut to the stage, waves again to the end.
    ...CUP_CHEER.map(([after, size]) => cue('roar', cupUp + after, { power: size, gain: size })),
    ...waves(cupUp + CUP_CHEER[CUP_CHEER.length - 1][0] + WAVE_EVERY_MS, p.stageAt - CHEER_ROOM_MS).map((at) => cue('roar', at, { power: WAVE_SIZE, gain: WAVE_SIZE })),
    ...STAGE_CHEER.map(([after, size]) => cue('roar', p.stageAt + after, { power: size, gain: size })),
    ...waves(p.stageAt + STAGE_CHEER[STAGE_CHEER.length - 1][0] + WAVE_EVERY_MS, p.total - CHEER_ROOM_MS).map((at) => cue('roar', at, { power: WAVE_SIZE, gain: WAVE_SIZE })),
  ];
}

/** The cup going up: overlapping roars (ms after, size), each a little smaller, over about 20 s. */
const CUP_CHEER = Object.freeze([[0, 1], [1600, 0.95], [3200, 0.9], [4800, 0.85], [6600, 0.8], [8400, 0.75], [10400, 0.7], [12600, 0.65], [15000, 0.6], [17600, 0.55]]);
/** The cut to the stage: a fresh surge. */
const STAGE_CHEER = Object.freeze([[0, 1], [1600, 0.9], [3200, 0.85], [5000, 0.75], [7000, 0.65]]);
/** Between: a wave of cheering every so often, this big. */
const WAVE_EVERY_MS = 6000;
const WAVE_SIZE = 0.55;
/** No roar starts so late it would ring past the next part (about a roar's length). */
const CHEER_ROOM_MS = 3000;
/** A wave every WAVE_EVERY_MS from `from` while before `until`. @param {number} from @param {number} until */
const waves = (from, until) => Array.from({ length: Math.max(0, Math.floor((until - from) / WAVE_EVERY_MS) + 1) }, (_, i) => from + i * WAVE_EVERY_MS).filter((t) => t < until);

/**
 * Who holds the cup on the stage (Tom's pick C): the captain first, then down the line left to right, each a while;
 * null until they've had a moment on the stage. By index along `row` (left to right).
 * @param {number} since @param {LiftSettings} s @param {number} n  How many on the stage. @param {number} captain  The captain's index.
 */
export function stageHolder(since, s, n, captain) {
  const into = since - liftParts(s).stageAt - STAGE_SETTLE_MS;
  if (n === 0 || into < 0) return null;
  const turn = Math.floor(into / STAGE_TURN_MS);
  return turn === 0 ? captain : (turn - 1) % n;
}
/** On the stage this long before the cup goes up again, then each player holds it this long. */
const STAGE_SETTLE_MS = 1200;
const STAGE_TURN_MS = 1500;

/**
 * The five who started the final for the champions, as the close-up lines them up: the captain (their best outfield
 * starter) in the middle, the keeper at one end.
 * @param {{ playerId: string, slot: string }[]} starters  From the final's lineup event. @param {string} keeperSlot
 * @param {(playerId: string) => number} overallOf
 * @returns {{ five: { playerId: string, slot: string }[], captainId: string }}
 */
export function liftFive(starters, keeperSlot, overallOf) {
  const outfield = starters.filter((q) => q.slot !== keeperSlot);
  const captain = [...outfield].sort((a, b) => overallOf(b.playerId) - overallOf(a.playerId))[0] ?? starters[0];
  const rest = [...starters.filter((q) => q.slot === keeperSlot), ...outfield.filter((q) => q !== captain)];
  const mid = Math.floor(rest.length / 2);
  return { five: [...rest.slice(0, mid), captain, ...rest.slice(mid)], captainId: captain.playerId };
}
