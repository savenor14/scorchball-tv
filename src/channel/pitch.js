// Draws the pitch and the players on the stage canvas. DOM/canvas only; positions come from formation.js.
// Everything is drawn in whole stage pixels with fillRect, so the art stays crisp when scaled. See docs/channel.md §5.
import { createRng } from '../sim/rng.js';
import { colourDistance } from './kits.js';
import { PALETTE } from './palette.js';
import { drawPose } from './poses.js';
import { dugoutProps, inTunnel, PROP_W, seat, TUNNEL, tunnelFade } from './sidelines.js';

/**
 * The playing surface inside the boards, in stage pixels (2:1, like the 40 × 20 m pitch in sport.md §3). Layout D from
 * the Task 28 mock-ups (pitches.html): on the left, leaving 80 px on the right for the live-stats panel (Task 32), with
 * room for a bench strip above and below.
 */
export const PITCH = Object.freeze({ x: 18, y: 46, w: 358, h: 179 });
const BOARD = 4;
const GOAL = Object.freeze({ mouth: 40, depth: 10 });
/** How strongly the net's mesh shows over its shadowy inside (Task 44). */
const NET_MESH_ALPHA = 0.45;
const NET_CELL = 4;
const CREASE_R = 28;
const CENTRE_R = 22;
/** How far the apron (darker turf) reaches beyond the pitch: past the nets at the ends, past the dugouts top and bottom. */
const APRON = Object.freeze({ side: 4, top: 22, bottom: 6 });
/** A player sprite, as pixel rows: h skin (head, forearms), s shirt, t trim (sleeves, shorts), l / r legs, . empty. */
const SPRITE = Object.freeze([
  '..hhh..',
  '..hhh..',
  '.tssst.',
  'tssssst',
  'hsssssh',
  '.sssss.',
  '.ttttt.',
  '.l...r.',
  '.l...r.',
  '.l...r.',
]);
/** How tall a player stands, in stage pixels (for anything placed over their head). */
export const SPRITE_H = SPRITE.length;
export const STRIPES = 10;

const SKIN = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];
const KEEPER_KIT = Object.freeze({ home: PALETTE.keeperHome, away: PALETTE.keeperAway });

/** @type {HTMLCanvasElement | null} */
let pitchCache = null;

/** Stage pixel for a formation coordinate. @param {{ x: number, y: number }} p */
export function toStage(p) {
  return { x: Math.round(PITCH.x + p.x * PITCH.w), y: Math.round(PITCH.y + p.y * PITCH.h) };
}

/**
 * The end boards in the colours of the team defending that goal (Task 28), so it's clear which side is which. They
 * swap with the ends at half-time. A trim line runs along the outer edge; the goal mouth stays open.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ home: Kit, away: Kit }} kits  The kits worn in this match.
 * @param {boolean} homeDefendsLeft
 */
export function drawEndBoards(ctx, kits, homeDefendsLeft) {
  const { x, y, w, h } = PITCH;
  const goalY = y + (h - GOAL.mouth) / 2;
  const ends = /** @type {const} */ ([[homeDefendsLeft ? 'home' : 'away', x - BOARD, 0], [homeDefendsLeft ? 'away' : 'home', x + w, BOARD - 1]]);
  for (const [side, bx, edge] of ends) {
    for (const [from, to] of [[y - BOARD, goalY], [goalY + GOAL.mouth, y + h + BOARD]]) {
      ctx.fillStyle = kits[side].primary;
      ctx.fillRect(bx, from, BOARD, to - from);
      ctx.fillStyle = kits[side].secondary;
      ctx.fillRect(bx + edge, from, 1, to - from);
    }
  }
}

/**
 * The home mark (Task 49, Tom's pick): the centre circle filled in the home team's main colour, right out to the line,
 * as one flat shade (the colour softened a little toward the turf). A team whose main colour is close to the turf's
 * green (Kesh Oasis) gets a darker shade of it instead, so it still shows.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Kit} colours  The home team's own colours (never a change kit: the home team doesn't change).
 * @param {(ctx: CanvasRenderingContext2D, cx: number, cy: number) => void} [mark]  Drawn on the circle under its lines
 *   (Task 165: the team's icon, the halfway line and the spot crossing it, as centre-ice lines cross a hockey logo).
 */
export function drawHomeMark(ctx, colours, mark) {
  const own = homeMarkColour(colours);
  const cx = PITCH.x + PITCH.w / 2;
  const cy = PITCH.y + PITCH.h / 2;
  ctx.fillStyle = own;
  for (let dy = -CENTRE_R; dy <= CENTRE_R; dy++) {
    const half = Math.floor(Math.sqrt(CENTRE_R * CENTRE_R - dy * dy));
    ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), 2 * half + 1, 1);
  }
  mark?.(ctx, cx, cy);
  // The circle's line, the halfway line through it and the centre spot go back on top.
  ctx.fillStyle = PALETTE.line;
  pixelCircle(ctx, cx, cy, CENTRE_R, () => true);
  ctx.fillRect(cx, Math.round(cy - CENTRE_R), 1, 2 * CENTRE_R + 1);
  ctx.fillRect(cx - 1, cy - 1, 3, 3); // as paintPitch draws it
}

/**
 * The home mark's shade of the home team's main colour: softened a little toward the turf, or darkened when it's close
 * to the turf's green. @param {Kit} colours
 */
export function homeMarkColour(colours) {
  return colourDistance(colours.primary, PALETTE.turf) < HOME_MARK_NEAR ? mix(colours.primary, '#000000', HOME_MARK_DARKEN) : mix(colours.primary, PALETTE.turf, HOME_MARK_SOFTEN);
}

/**
 * How far the home mark's colour is softened toward the turf (0 = the kit colour exactly). A main colour closer than
 * HOME_MARK_NEAR (RGB distance) to the turf is darkened by HOME_MARK_DARKEN instead.
 */
const HOME_MARK_SOFTEN = 0.25;
const HOME_MARK_NEAR = 60;
const HOME_MARK_DARKEN = 0.5;

/**
 * The two dugouts on the top touchline, out toward their own halves (sidelines.js has the seats). Each has a roof along
 * its back, in the team's shirt colour. The substitutes are drawn on top with drawPlayers.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ home: Kit, away: Kit }} kits
 * @param {{ home: number, away: number }} seats  How many seats each needs.
 * @param {string | null} [matchId]  The match, for the dugouts' props (Tasks 49, 69); none if omitted.
 * @param {number} [least]  Seats drawn at least, taken or not (the channel: a full bench, so a dugout never changes size).
 */
export function drawBenches(ctx, kits, seats, matchId = null, least = 4) {
  for (const side of /** @type {const} */ (['home', 'away'])) {
    const n = Math.max(least, seats[side]);
    const a = toStage(seat(side, 0));
    const b = toStage(seat(side, n - 1));
    const left = Math.min(a.x, b.x) - 6;
    const width = Math.abs(b.x - a.x) + 13;
    const top = a.y - SPRITE.length - 3;
    const bottom = a.y + 2;
    ctx.fillStyle = PALETTE.dugout;
    ctx.fillRect(left, top, width, bottom - top);
    const above = a.y < PITCH.y;
    // Depth (Task 44): a shadow under the roof, the bench the substitutes sit on (a plank at hip height with legs), and
    // a lighter front edge. The players are drawn over it.
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
    ctx.fillRect(left, above ? top : bottom - 3, width, 3);
    const plank = a.y - 4;
    ctx.fillStyle = PALETTE.dugoutSeat;
    ctx.fillRect(left + 2, plank, width - 4, 2);
    for (let lx = left + 3; lx < left + width - 3; lx += 9) ctx.fillRect(lx, plank + 2, 1, 3);
    ctx.fillRect(left + width - 4, plank + 2, 1, 3);
    ctx.fillStyle = PALETTE.dugoutLip;
    ctx.fillRect(left, above ? bottom - 1 : top, width, 1);
    // The roof runs along the back: the top edge for a bench above the pitch, the bottom edge for one below it.
    const back = above ? top - 2 : bottom;
    ctx.fillStyle = kits[side].primary;
    ctx.fillRect(left - 1, back, width + 2, 2);
    ctx.fillStyle = kits[side].secondary;
    ctx.fillRect(left - 1, above ? top : bottom - 1, width + 2, 1);
    if (matchId) {
      // Props (Task 49): beyond the outer end (left for home, right for away), and bottles between the seats.
      const outer = side === 'home' ? left - 1 : left + width + 1;
      for (const p of dugoutProps(matchId, side, n)) {
        const w = PROP_W[p.kind];
        const px = p.at === 'front' ? Math.round((toStage(seat(side, p.slot)).x + toStage(seat(side, p.slot + 1)).x) / 2) : side === 'home' ? outer - p.slot - w + 1 : outer + p.slot;
        drawProp(ctx, p.kind, px, a.y, kits[side]);
      }
    }
  }
}


/**
 * One dugout prop standing on the ground line y, its left edge at x.
 * @param {CanvasRenderingContext2D} ctx @param {import('./sidelines.js').PropKind} kind @param {number} x @param {number} y
 * @param {Kit} kit  The team's kit, for the bag and the bottles.
 */
function drawProp(ctx, kind, x, y, kit) {
  const px = (/** @type {string} */ c, /** @type {number} */ dx, /** @type {number} */ dy, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
  if (kind === 'ball') {
    px(PALETTE.heatCool, 0, -2, 2, 2);
    px(PALETTE.ballEdge, 1, -1);
  } else if (kind === 'bottle') {
    px(kit.primary, 0, -3, 1, 3);
    px(PALETTE.heatCool, 0, -4);
  } else if (kind === 'bag') {
    px(kit.primary, 0, -3, 5, 3);
    px(kit.secondary, 0, -2, 5, 1);
    px(PALETTE.ballEdge, 1, -4, 3, 1);
  } else if (kind === 'cone') {
    // A training cone: an orange triangle with a white band.
    px(PALETTE.cone, 1, -4, 1, 1);
    px(PALETTE.boardSide, 1, -3, 1, 1);
    px(PALETTE.cone, 0, -2, 3, 1);
    px(PALETTE.cone, 0, -1, 3, 1);
  } else if (kind === 'board') {
    // A tactics board on its stand: a little pitch in a white frame, a mark or two on it.
    px(PALETTE.boardSide, 0, -7, 5, 4);
    px(PALETTE.turf, 1, -6, 3, 2);
    px(kit.primary, 1, -6, 1, 1);
    px(PALETTE.ballEdge, 3, -5, 1, 1);
    px(PALETTE.ballEdge, 1, -3, 1, 3);
    px(PALETTE.ballEdge, 3, -3, 1, 3);
  } else {
    px(PALETTE.boardSide, 0, -3, 4, 3);
    px(PALETTE.replay, 0, -4, 4, 1);
  }
  px('rgb(0 0 0 / 0.25)', 0, 0, PROP_W[kind], 1);
}

/**
 * The empty pitch: turf, boards, goals, lines and creases. Drawn once and reused.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawPitch(ctx) {
  if (!pitchCache) {
    pitchCache = document.createElement('canvas');
    pitchCache.width = ctx.canvas.width;
    pitchCache.height = ctx.canvas.height;
    paintPitch(/** @type {CanvasRenderingContext2D} */ (pitchCache.getContext('2d')));
  }
  ctx.drawImage(pitchCache, 0, 0);
}

/** @param {CanvasRenderingContext2D} c */
function paintPitch(c) {
  const { x, y, w, h } = PITCH;
  const rect = (/** @type {string} */ colour, /** @type {number} */ rx, /** @type {number} */ ry, /** @type {number} */ rw, /** @type {number} */ rh) => {
    c.fillStyle = colour;
    c.fillRect(rx, ry, rw, rh);
  };
  rect(PALETTE.backdrop, 0, 0, c.canvas.width, c.canvas.height);
  // The apron: darker turf all round the boards, out to the dugouts, so the pitch and benches read as one ground.
  const apronX = Math.max(0, x - BOARD - GOAL.depth - APRON.side);
  rect(PALETTE.apron, apronX, y - APRON.top, x + w + BOARD + GOAL.depth + APRON.side - apronX, h + APRON.top + APRON.bottom);

  // Goals behind the boards, then the boards, then the turf.
  const goalY = y + (h - GOAL.mouth) / 2;
  // The nets (Task 44): white mesh over a shadowy inside, with a solid frame along the back and sides. The mesh is a
  // diagonal crosshatch (Task 69: straight lines read as vertical stripes), NET_CELL px across each diamond.
  for (const [gx, back] of [[x - BOARD - GOAL.depth, x - BOARD - GOAL.depth], [x + w + BOARD, x + w + BOARD + GOAL.depth - 1]]) {
    rect(PALETTE.netBack, gx, goalY - 1, GOAL.depth, GOAL.mouth + 2);
    c.globalAlpha = NET_MESH_ALPHA;
    for (let i = 0; i < GOAL.mouth + 2; i++) {
      for (let j = 0; j < GOAL.depth; j++) if ((i + j) % NET_CELL === 0 || (i - j + NET_CELL * 20) % NET_CELL === 0) rect(PALETTE.net, gx + j, goalY - 1 + i, 1, 1);
    }
    c.globalAlpha = 1;
    rect(PALETTE.net, back, goalY - 1, 1, GOAL.mouth + 2);
    rect(PALETTE.net, gx, goalY - 1, GOAL.depth, 1);
    rect(PALETTE.net, gx, goalY + GOAL.mouth, GOAL.depth, 1);
  }
  rect(PALETTE.board, x - BOARD, y - BOARD, w + 2 * BOARD, h + 2 * BOARD);
  rect(PALETTE.boardTop, x - BOARD, y - BOARD, w + 2 * BOARD, 1);
  // The side boards look like hockey boards: white, with a yellow kick plate along the turf (Task 30).
  rect(PALETTE.boardSide, x, y - BOARD, w, BOARD - 1);
  rect(PALETTE.kickPlate, x, y - 1, w, 1);
  rect(PALETTE.kickPlate, x, y + h, w, 1);
  rect(PALETTE.boardSide, x, y + h + 1, w, BOARD - 1);
  const stripe = w / STRIPES;
  for (let i = 0; i < STRIPES; i++) rect(i % 2 ? PALETTE.turfStripe : PALETTE.turf, x + Math.round(i * stripe), y, Math.round((i + 1) * stripe) - Math.round(i * stripe), h);
  // Goal mouths open through the boards, with white posts at each side.
  rect(PALETTE.turf, x - BOARD, goalY, BOARD, GOAL.mouth);
  rect(PALETTE.turfStripe, x + w, goalY, BOARD, GOAL.mouth);
  for (const px of [x - BOARD, x + w]) {
    rect(PALETTE.net, px, goalY - 1, BOARD, 1);
    rect(PALETTE.net, px, goalY + GOAL.mouth, BOARD, 1);
  }

  paintTunnel(c, rect);

  // Lines.
  c.fillStyle = PALETTE.line;
  c.fillRect(x + w / 2, y, 1, h); // halfway
  c.fillRect(x, y, 1, h);
  c.fillRect(x + w - 1, y, 1, h);
  pixelCircle(c, x + w / 2, y + h / 2, CENTRE_R, () => true);
  c.fillRect(x + w / 2 - 1, y + h / 2 - 1, 3, 3); // centre spot
  c.fillStyle = PALETTE.crease;
  pixelCircle(c, x, y + h / 2, CREASE_R, (dx) => dx >= 0);
  pixelCircle(c, x + w - 1, y + h / 2, CREASE_R, (dx) => dx <= 0);
}

/**
 * The tunnel (Task 46): a covered walkway at halfway on the top touchline, between the dugouts, opening through a gate
 * in the boards. Inside it gets darker toward the back, where walkers fade from view (tunnelFade).
 * @param {CanvasRenderingContext2D} c @param {(colour: string, x: number, y: number, w: number, h: number) => void} rect
 */
function paintTunnel(c, rect) {
  const { x, y, w } = PITCH;
  const half = Math.round(TUNNEL.halfW * w) + 1;
  const cx = x + Math.round(w / 2);
  const back = y - APRON.top;
  const front = y - BOARD;
  // Walls, then the dark inside, shading lighter toward the mouth.
  rect(PALETTE.tunnelWall, cx - half - 2, back, 2 * half + 5, front - back);
  for (let ry = back; ry < front; ry++) {
    const f = (ry - back) / (front - back);
    rect(PALETTE.tunnel, cx - half, ry, 2 * half + 1, 1);
    c.globalAlpha = f * 0.55;
    rect(PALETTE.apron, cx - half, ry, 2 * half + 1, 1);
    c.globalAlpha = 1;
  }
  // The roof's edge across the back, and the wall tops catching the light.
  rect(PALETTE.boardTop, cx - half - 2, back, 2 * half + 5, 2);
  rect(PALETTE.boardTop, cx - half - 2, back, 1, front - back);
  rect(PALETTE.boardTop, cx + half + 2, back, 1, front - back);
  // The gate: an opening in the top boards, with posts either side.
  rect(PALETTE.apron, cx - half, front, 2 * half + 1, BOARD - 1);
  rect(PALETTE.turf, cx - half, y - 1, 2 * half + 1, 1);
  rect(PALETTE.boardTop, cx - half - 1, front, 1, BOARD);
  rect(PALETTE.boardTop, cx + half + 1, front, 1, BOARD);
}

/** The tunnel's opening in the boards, in stage px: its left edge, width, and the rows the boards fill. */
export function tunnelGap() {
  const { x, y, w } = PITCH;
  const half = Math.round(TUNNEL.halfW * w) + 1;
  const cx = x + Math.round(w / 2);
  return { left: cx - half, width: 2 * half + 1, top: y - BOARD, bottom: y, back: y - APRON.top };
}

/**
 * Draw someone, clipped to the inside of the tunnel if they're in it (Task 63), so they go under its roof rather than
 * showing over the stands behind. @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number }} p @param {() => void} draw
 */
function clippedToTunnel(ctx, p, draw) {
  if (!inTunnel(p)) return draw();
  const g = tunnelGap();
  ctx.save();
  ctx.beginPath();
  ctx.rect(g.left, g.back + 2, g.width, g.bottom - g.back - 2);
  ctx.clip();
  draw();
  ctx.restore();
}

/**
 * The tunnel's gate (Task 63): two leaves in the gap in the boards, white with the yellow kick plate like the boards
 * either side, closed during play and folded back to the posts when open.
 * @param {CanvasRenderingContext2D} ctx @param {number} open  0 closed, 1 fully open.
 */
export function drawGate(ctx, open) {
  const g = tunnelGap();
  const leaf = Math.round(Math.ceil(g.width / 2) * (1 - Math.min(1, Math.max(0, open))));
  if (leaf <= 0) return;
  for (const lx of [g.left, g.left + g.width - leaf]) {
    ctx.fillStyle = PALETTE.boardSide;
    ctx.fillRect(lx, g.top, leaf, BOARD - 1);
    ctx.fillStyle = PALETTE.kickPlate;
    ctx.fillRect(lx, g.bottom - 1, leaf, 1);
  }
  // The leaves' meeting edge when shut.
  if (2 * leaf >= g.width) {
    ctx.fillStyle = PALETTE.boardTop;
    ctx.fillRect(g.left + Math.floor(g.width / 2), g.top, 1, BOARD);
  }
}

/**
 * A 1-pixel circle outline (midpoint algorithm), keeping only points where keep(dx, dy) is true.
 * @param {CanvasRenderingContext2D} c @param {number} cx @param {number} cy @param {number} r
 * @param {(dx: number, dy: number) => boolean} keep
 */
function pixelCircle(c, cx, cy, r, keep) {
  let px = r;
  let py = 0;
  let err = 1 - r;
  while (px >= py) {
    for (const [dx, dy] of [[px, py], [py, px], [-py, px], [-px, py], [-px, -py], [-py, -px], [py, -px], [px, -py]]) {
      if (keep(dx, dy)) c.fillRect(Math.round(cx + dx), Math.round(cy + dy), 1, 1);
    }
    py++;
    if (err < 0) err += 2 * py + 1;
    else {
      px--;
      err += 2 * (py - px) + 1;
    }
  }
}

/** @type {Map<string, string>} */
const skinCache = new Map();
/** A player's skin tone, seeded by their id so it never changes. @param {string} playerId */
export function skinOf(playerId) {
  let tone = skinCache.get(playerId);
  if (!tone) skinCache.set(playerId, (tone = SKIN[createRng(`skin|${playerId}`).int(0, SKIN.length - 1)]));
  return tone;
}

/**
 * @typedef {object} Kit
 * @property {string} primary
 * @property {string} secondary
 */

/**
 * How momentum's rings look (Task 255; Task 238's was one thin ring for a second). `pulses` rings, each growing from
 * radius 4 by `reach` px and fading over `pulseMs`, one every `gapMs`, `width` px thick (a heat-yellow core inside
 * the orange when 2 or more); a heat-orange glow at each player's feet fading over `glowMs` (0: none).
 * @typedef {{ pulses: number, pulseMs: number, gapMs: number, width: number, reach: number, glowMs: number }} RingStyle
 */

/** How long the rings take, ms. @param {RingStyle} r */
export const ringsLength = (r) => Math.max((r.pulses - 1) * r.gapMs + r.pulseMs, r.glowMs);

/**
 * momentum gained (Task 238, Tom's pick C): rings pulsing out round each of the team's players, centred on the body.
 * Drawn before the players (each sprite covers its own) or after them (over).
 * @param {CanvasRenderingContext2D} ctx @param {readonly { x: number, y: number, side: string }[]} players
 * @param {string} side  'home' or 'away' @param {number} since  ms since it was gained @param {RingStyle} r
 */
export function drawMomentumRings(ctx, players, side, since, r) {
  if (since < 0 || since >= ringsLength(r)) return;
  const ours = players.filter((p) => p.side === side && tunnelFade(/** @type {any} */ (p)) > 0).map((p) => toStage(p));
  ctx.save();
  if (r.glowMs > 0 && since < r.glowMs) {
    // The glow at their feet, brightest at once.
    ctx.globalAlpha = 0.45 * (1 - since / r.glowMs);
    ctx.fillStyle = PALETTE.heatOrange;
    for (const at of ours) {
      ctx.beginPath();
      ctx.ellipse(at.x + 0.5, at.y, 6, 2.5, 0, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  for (let k = 0; k < r.pulses; k++) {
    const s = since - k * r.gapMs;
    if (s < 0 || s >= r.pulseMs) continue;
    const f = s / r.pulseMs;
    ctx.globalAlpha = 1 - f * f;
    for (const at of ours) {
      const rad = 4 + r.reach * f;
      ctx.beginPath();
      ctx.arc(at.x + 0.5, at.y - SPRITE.length / 2, rad, 0, 2 * Math.PI);
      ctx.strokeStyle = PALETTE.heatOrange;
      ctx.lineWidth = r.width;
      ctx.stroke();
      if (r.width >= 2) {
        ctx.strokeStyle = PALETTE.heatWarm;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

/**
 * Draw the players, nearest the bottom last so they overlap naturally.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./formation.js').Placed[]} players
 * @param {{ home: Kit, away: Kit }} kits
 * @param {string} keeperSlot
 * @param {number} elapsed  ms, for the running stride.
 * @param {{ idle?: boolean, after?: (p: import('./formation.js').Placed) => void, people?: Person[], poseOf?: (p: import('./formation.js').Placed) => import('./poses.js').PlayerPose | null }} [opts]
 *   idle: standing about (the bench, Task 44): a slow shift of weight and a pixel of sway instead of the running
 *   stride. after: called once each player is drawn (the held ball goes just after its carrier). people: others drawn
 *   among them in depth order, each in their own look: the referee (Task 47) and the managers (Task 48). poseOf: a
 *   player's pose when it's known (in play, Task 120: the run by speed, a kick, a keeper's dive), drawn by poses.js;
 *   otherwise (and with arms raised) the two-frame stride.
 */
export function drawPlayers(ctx, players, kits, keeperSlot, elapsed, { idle = false, after, people = [], poseOf } = {}) {
  const sorted = [...players].sort((a, b) => a.y - b.y);
  const others = [...people].sort((a, b) => a.y - b.y);
  let next = 0;
  /** Draw the others standing behind depth y. @param {number} y */
  const othersTo = (y) => {
    for (; next < others.length && others[next].y < y; next++) {
      const o = others[next];
      const fade = tunnelFade(o);
      if (fade <= 0) continue;
      ctx.globalAlpha = fade;
      const at = toStage(o);
      const { skinKey, ...look } = o.look;
      clippedToTunnel(ctx, o, () => drawSprite(ctx, at.x, at.y, { ...look, skin: skinOf(skinKey), stride: o.walking ? Math.floor(elapsed / 220) % 2 : -1 }));
      ctx.globalAlpha = 1;
    }
  };
  for (const p of sorted) {
    othersTo(p.y);
    // In the tunnel they fade into the dark (Task 46).
    const fade = tunnelFade(p);
    if (fade <= 0) continue;
    ctx.globalAlpha = fade;
    const seed = p.playerId.charCodeAt(p.playerId.length - 1) * 37;
    const at = toStage(p);
    const y = at.y;
    const x = at.x + (idle ? Math.round(Math.sin((elapsed + seed * 10) / IDLE_SWAY_MS)) : 0);
    const kit = kits[p.side];
    const stride = Math.floor((elapsed + seed) / (idle ? IDLE_SHIFT_MS + (seed % 700) : 180)) % 2;
    const keeper = p.slot === keeperSlot;
    const arms = /** @type {{ arms?: Arms }} */ (p).arms;
    // Keepers wear their fixed shirt with sleeves and shorts in their team's colour.
    const look = { shirt: keeper ? KEEPER_KIT[p.side] : kit.primary, trim: keeper ? kit.primary : kit.secondary, skin: skinOf(p.playerId) };
    const pose = !idle && !arms ? poseOf?.(p) ?? null : null;
    clippedToTunnel(ctx, p, () => (pose ? drawPose(ctx, x, y, look, pose) : drawSprite(ctx, x, y, { arms, ...look, stride })));
    ctx.globalAlpha = 1;
    after?.(p);
  }
  othersTo(Infinity);
}

/**
 * Someone on the pitch or touchline who isn't a player (the referee, a manager), in pitch fractions.
 * @typedef {'none' | 'right' | 'left' | 'both' | 'head'} Arms
 * @typedef {{ x: number, y: number, walking: boolean, look: { shirt: string, trim: string, tie?: string, knot?: string, trousers?: string, skinKey: string, arms?: Arms } }} Person
 *   skinKey: seeds their skin tone. walking: stride, or stand with both feet down.
 */

/** Idle on the bench (Task 44): a shift of weight about every IDLE_SHIFT_MS (varied per player), and a slow sway. */
const IDLE_SHIFT_MS = 1100;
const IDLE_SWAY_MS = 900;

/** A keeper's fixed shirt colour. @param {'home' | 'away'} side */
export const keeperShirt = (side) => KEEPER_KIT[side];

/**
 * One 7×10 player sprite standing at (x, y), its feet's centre, in stage pixels.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x @param {number} y
 * @param {{ shirt: string, trim: string, skin: string, stride: number, arms?: Arms, tie?: string, knot?: string, trousers?: string }} look
 *   trim: sleeves and shorts. stride: 0 or 1 (which foot is lifted), or -1 standing. arms: none (hands at the hips),
 *   right or left (one raised: the referee signalling, a high five), both (raised: a manager cheering) or head (hands on head: a manager
 *   despairing). tie: a tie down the shirt's middle (a manager's suit), with its knot at the collar in `knot` (the tie
 *   colour if none). trousers: legs in this colour, two pixels wide, instead of bare legs (a manager's suit).
 */
export function drawSprite(ctx, x, y, { shirt, trim, skin, stride, arms = 'none', tie, knot = tie, trousers }) {
  const left = x - 3;
  const top = y - SPRITE.length;
  ctx.fillStyle = 'rgb(0 0 0 / 0.25)';
  ctx.fillRect(left, y, 7, 1); // shadow
  const lastCol = SPRITE[0].length - 1;
  SPRITE.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      // The stride lifts one foot off the ground on alternate frames.
      if (r === SPRITE.length - 1 && ((ch === 'l' && stride === 1) || (ch === 'r' && stride === 0))) continue;
      // Raised hands leave the hips.
      if (r === 4 && ((i === lastCol && (arms === 'right' || arms === 'both' || arms === 'head')) || (i === 0 && (arms === 'left' || arms === 'both' || arms === 'head')))) continue;
      const leg = ch === 'l' || ch === 'r';
      ctx.fillStyle = ch === 's' ? (tie && i === 3 && r >= 2 && r <= 5 ? (r === 2 ? knot : tie) : shirt) : ch === 't' ? trim : leg && trousers ? trousers : skin;
      // Trousers are a pixel wider than bare legs, on the inside.
      ctx.fillRect(leg && trousers && ch === 'r' ? left + i - 1 : left + i, top + r, leg && trousers ? 2 : 1, 1);
    }
  });
  /** A raised arm at column c: sleeve, then the hand above the head. @param {number} c */
  const raise = (c) => {
    ctx.fillStyle = trim;
    ctx.fillRect(left + c, top + 1, 1, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(left + c, top - 1, 1, 2);
  };
  if (arms === 'right') raise(lastCol);
  if (arms === 'left') raise(0);
  if (arms === 'both') {
    raise(0);
    raise(lastCol);
  }
  if (arms === 'head') {
    ctx.fillStyle = skin;
    ctx.fillRect(left + 1, top, 1, 2);
    ctx.fillRect(left + lastCol - 1, top, 1, 2);
  }
}

/**
 * The ball's colour for its heat (sport.md §8): white while Cool, yellow to orange while Warm, orange to red while Hot.
 * @param {number} heat  0–100
 * @param {{ warmAt: number, hotAt: number }} stages
 */
export function heatColour(heat, { warmAt, hotAt }) {
  if (heat < warmAt) return PALETTE.heatCool;
  if (heat < hotAt) return mix(PALETTE.heatWarm, PALETTE.heatOrange, (heat - warmAt) / (hotAt - warmAt));
  return mix(PALETTE.heatOrange, PALETTE.heatHot, (heat - hotAt) / (100 - hotAt));
}

/**
 * The ball, its trail when in flight, and the burn and goal effects.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./motion.js').Pose} pose
 * @param {{ x: number, y: number }[]} trail  Earlier ball positions while in flight, newest first.
 * @param {{ warmAt: number, hotAt: number }} stages
 * @param {number} elapsed  ms, for flicker.
 * @param {number | null} [turn]  How far the ball has turned (ballSpin.js, by its speed; the channel); without it a
 *   travelling ball's spin steps round its core at a fixed rate (the dev pages).
 */
export function drawBall(ctx, pose, trail, stages, elapsed, turn = null) {
  const { ball, heat, effects } = pose;
  if (effects.goal) drawGoalFlash(ctx, effects.goal, elapsed);
  if (!ball) return;
  const colour = heatColour(heat, stages);
  const at = toStage(ball);
  const { x, y } = ballStageAt(ball);
  const lift = at.y - y;

  // Trail: a few fading dots behind a ball in flight, fiery for a Hot shot.
  trail.forEach((p, i) => {
    const t = toStage(p);
    ctx.fillStyle = effects.scorcher ? (i % 2 ? PALETTE.heatHot : PALETTE.heatWarm) : colour;
    ctx.globalAlpha = 0.6 - i * 0.15;
    ctx.fillRect(t.x - (i < 2 ? 1 : 0), t.y - (i < 2 ? 1 : 0), i < 2 ? 2 : 1, i < 2 ? 2 : 1);
  });
  ctx.globalAlpha = 1;

  if (effects.burn) {
    // A ring that bursts outward, flashing white-hot and red.
    const r = Math.round(2 + effects.burn.f * 9);
    ctx.fillStyle = Math.floor(elapsed / 80) % 2 ? PALETTE.heatBurn : PALETTE.heatHot;
    ctx.globalAlpha = 1 - effects.burn.f * 0.7;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * 2 * Math.PI;
      ctx.fillRect(Math.round(x + r * Math.cos(ang)), Math.round(y + r * Math.sin(ang)), 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = 'rgb(0 0 0 / 0.3)';
  if (lift > 0) ctx.fillRect(x - 2, at.y + 1, 4, 2); // on the turf, under the chipped ball
  else ctx.fillRect(x - 1, y + 1, 3, 1);
  if (heat >= stages.hotAt && Math.floor(elapsed / 90) % 2 === 0) {
    // Hot: a flickering glow.
    ctx.fillStyle = PALETTE.heatWarm;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x - 2, y - 1, 1, 2);
    ctx.fillRect(x + 1, y - 1, 1, 2);
    ctx.fillRect(x - 1, y - 2, 2, 1);
    ctx.fillRect(x - 1, y + 1, 2, 1);
    ctx.globalAlpha = 1;
  }
  // A dark edge so the ball reads on the turf (Task 28), round (Tom, 2026-10-16: a 4×4 without its corners).
  ctx.fillStyle = PALETTE.ballEdge;
  ctx.fillRect(x - 2, y - 1, 4, 2);
  ctx.fillRect(x - 1, y - 2, 2, 4);
  const core = effects.burn ? PALETTE.heatBurn : colour;
  ctx.fillStyle = core;
  ctx.fillRect(x - 1, y - 1, 2, 2);
  if (ball.spin && turn !== null && !ball.held) {
    // Spin by speed (Tom, 2026-10-16): a dark pixel steps round the core, the way it travels or curls, as quick as it's
    // going, and the round ball's corner beside it is filled in, turning with it: a lopsided ball turning over (his pick
    // D on ballspin.html). (A pattern running round the edge, his first pick, made the smaller round ball harder to follow.)
    const dir = ball.spin > 0 ? 1 : -1;
    const j = Math.floor(turn) % 4;
    const [cx, cy] = SPIN_CELLS[dir > 0 ? j : (4 - j) % 4];
    ctx.fillStyle = PALETTE.ballEdge;
    ctx.fillRect(x - 2 + 3 * cx, y - 2 + 3 * cy, 1, 1);
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x - 1 + cx, y - 1 + cy, 1, 1);
    ctx.globalAlpha = 1;
  } else if (ball.spin) {
    // Spin: a dark pixel steps round the core's corners, clockwise or anticlockwise (Task 34).
    const step = Math.floor((elapsed / 1000) * Math.abs(ball.spin)) % 4;
    const [cx, cy] = SPIN_CELLS[ball.spin > 0 ? step : (4 - step) % 4];
    ctx.fillStyle = PALETTE.ballEdge;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x - 1 + cx, y - 1 + cy, 1, 1);
    ctx.globalAlpha = 1;
  }
}

/** The ball core's four pixels, clockwise from the top left. */
const SPIN_CELLS = Object.freeze([[0, 0], [1, 0], [1, 1], [0, 1]]);

/**
 * Where the ball is drawn, stage px: at the holder's feet, just in front (on the side they're heading, Task 120);
 * `nudge` carries a just-kicked ball on from that foot, so it doesn't jump to the kicker's middle as it leaves; a
 * chipped pass above its shadow (Task 34).
 * @param {NonNullable<import('./motion.js').Pose['ball']>} ball
 */
export function ballStageAt(ball) {
  const at = toStage(ball);
  return { x: at.x + (ball.held ? 4 * ball.dir : 0) + (ball.nudge ?? 0), y: at.y - Math.round((ball.lift ?? 0) * PITCH.w) };
}

/**
 * The net flashes after a goal; a scorcher flashes in fire colours.
 * @param {CanvasRenderingContext2D} ctx @param {{ x: number, f: number, scorcher: boolean }} goal @param {number} elapsed
 */
function drawGoalFlash(ctx, goal, elapsed) {
  if (Math.floor(elapsed / 120) % 2) return;
  const { x, y, h } = PITCH;
  const gx = goal.x >= 1 ? x + PITCH.w + BOARD : x - BOARD - GOAL.depth;
  const gy = y + (h - GOAL.mouth) / 2;
  ctx.fillStyle = goal.scorcher ? PALETTE.heatHot : PALETTE.accent;
  ctx.globalAlpha = 0.85 * (1 - goal.f * 0.6);
  ctx.fillRect(gx, gy - 1, GOAL.depth, GOAL.mouth + 2);
  ctx.globalAlpha = 1;
}

/** @type {{ x: number, y: number, speed: number, phase: number, colour: number, size: number }[] | null} */
let confettiPieces = null;

/**
 * Pixel confetti falling over the stage, in the champions' colours. Seeded, so every screen shows the same fall.
 * @param {CanvasRenderingContext2D} ctx @param {string[]} colours @param {number} elapsed  ms since it started.
 */
export function drawConfetti(ctx, colours, elapsed) {
  const { width, height } = ctx.canvas;
  if (!confettiPieces) {
    const rng = createRng('confetti');
    confettiPieces = Array.from({ length: 90 }, () => ({
      x: rng.float(0, width), y: rng.float(0, height), speed: rng.float(18, 40),
      phase: rng.float(0, 2 * Math.PI), colour: rng.int(0, 2), size: rng.int(1, 2),
    }));
  }
  const palette = [...colours, PALETTE.accent];
  for (const p of confettiPieces) {
    const y = (p.y + (elapsed * p.speed) / 1000) % height;
    const x = (p.x + 6 * Math.sin(elapsed / 600 + p.phase) + width) % width;
    ctx.fillStyle = palette[p.colour % palette.length];
    // Flicker between a square and a sliver, like paper turning over.
    const flip = Math.floor(elapsed / 200 + p.phase * 3) % 2;
    ctx.fillRect(Math.round(x), Math.round(y), flip ? p.size : 1, flip ? 1 : p.size);
  }
}

/** Mix two "#rrggbb" colours. @param {string} a @param {string} b @param {number} f */
function mix(a, b, f) {
  const t = Math.min(1, Math.max(0, f));
  const ch = (/** @type {string} */ c, /** @type {number} */ i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  const out = [0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0'));
  return `#${out.join('')}`;
}

