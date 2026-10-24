// The studio set and its people (Task 98; docs/channel.md §16.1, §16.7): the half-length figure the presenters (and,
// from Task 100, the player of the match) are drawn as, Tom's pick of set B (a big curved screen with the light bars,
// two upright screens with live graphics, a lighting rig, a curved desk), where everything on it goes in a rect, and
// who's gesturing when. setLayout and figurePoses are pure; the draw functions are canvas only.
import { PALETTE } from './palette.js';
import { sharpText } from './sharpText.js';
import { drawScene } from './scene.js';

/**
 * @typedef {'rest' | 'talk' | 'nod' | 'open' | 'point' | 'laugh' | 'both'} Pose
 * @typedef {{ jacket: string, tie: string, skin: string, hair: string, style: 'short' | 'long' | 'bun', woman?: boolean, kit?: { primary: string, secondary: string } }} Look
 *   woman: a woman at the desk (Task 132; Tom's pick of three looks): a scarf in the tie's colour, a bun, earrings,
 *   lashes and lip colour.
 *   kit: drawn in a kit rather than a jacket and tie (the interview).
 */

/** @param {string} hex @param {number} k  Brightness scale. */
const shade = (hex, k) => `#${[1, 3, 5].map((i) => Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, '0')).join('')}`;

// ---------------------------------------------------------------- the figure: a presenter (or a player) from the chest up


/**
 * A half-length figure, 1× grid about 22 × 22 cells, drawn at `u` px a cell. (x, y) is the centre of their head's top.
 * Facing +1 looks right, −1 left. A pose moves the arms and the face; `beat` (0/1) animates it.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} u @param {Look} look
 * @param {Pose} pose @param {number} beat @param {1 | -1} facing @param {{ toBottom?: number, mouth?: boolean, badge?: (cx: number, cy: number) => void }} [o]
 *   toBottom: carry the torso down to this y (a close-up). mouth: open (talking). badge: draws the team's crest on the
 *   shirt, centred on the left chest, in place of the small mark (Task 165).
 */
export function drawFigure(ctx, x, y, u, look, pose, beat, facing, o = {}) {
  const f = facing;
  /** A rect in cells, mirrored with the facing. @param {string} c @param {number} col @param {number} row @param {number} [w] @param {number} [h] */
  const px = (c, col, row, w = 1, h = 1) => {
    const left = f === 1 ? col : -(col + w);
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x + left * u), Math.round(y + row * u), Math.round(w * u), Math.round(h * u));
  };
  const kit = look.kit;
  const body = kit ? kit.primary : look.jacket;
  const dark = shade(body, 0.72);
  const bob = pose === 'laugh' ? beat : 0;
  // Torso and shoulders.
  px(body, -6, 9 + bob, 12, 13 - bob);
  if (o.toBottom && kit) {
    // A kit, not a gown (Tom): a shirt with darker side panels, a waistband, then (Tom: shorts and legs, about a third
    // and two thirds) shorts in the second colour with a stripe down each side, and two bare legs below them.
    const rows = Math.max(0, Math.ceil((o.toBottom - y) / u) - 22);
    const shorts = Math.max(2, Math.round(rows / 3));
    px(shade(kit.primary, 0.82), -6, 10, 1, 11);
    px(shade(kit.primary, 0.82), 5, 10, 1, 11);
    px(shade(kit.primary, 0.6), -6, 21, 12, 1);
    px(kit.secondary, -6, 22, 12, shorts);
    px(kit.primary, -6, 22, 1, shorts);
    px(kit.primary, 5, 22, 1, shorts);
    px(shade(kit.secondary, 0.6), 0, 22 + shorts - 1, 1, 1);
    const legs = rows - shorts;
    const knee = shade(look.skin, 0.88);
    for (const left of [-5, 1]) {
      px(look.skin, left, 22 + shorts, 4, legs);
      px(shade(look.skin, 0.8), left + (left < 0 ? 3 : 0), 22 + shorts, 1, legs);
      px(knee, left, 22 + shorts + Math.round(legs * 0.45), 4, 1);
    }
  } else if (o.toBottom) px(body, -6, 21, 12, Math.max(0, (o.toBottom - y) / u - 21));
  if (kit) {
    px(kit.secondary, -2, 9 + bob, 4, 1);
    px(kit.secondary, -1, 10 + bob, 2, 1);
    // On the kit's left chest (the viewer's right) whichever way the figure faces (Task 209, Tom: everywhere, as on a
    // real kit; the trophy lift's players turned to face the middle had it flipped).
    if (o.badge) o.badge(Math.round(x + 3 * u), Math.round(y + (13.5 + bob) * u));
    else {
      const chest = (/** @type {string} */ c, /** @type {number} */ col, /** @type {number} */ row, w = 1, h = 1) => {
        ctx.fillStyle = c;
        ctx.fillRect(Math.round(x - (col + w) * u), Math.round(y + row * u), Math.round(w * u), Math.round(h * u));
      };
      chest(kit.secondary, -4, 12 + bob, 2, 2);
      chest(kit.primary, -4, 12 + bob, 1, 1);
      chest(kit.secondary, -3, 14 + bob, 1, 1);
    }
  } else if (look.woman) {
    // A woman at the desk (Task 132): a scarf in the tie's colour, knotted at the throat.
    px(dark, -3, 9 + bob, 1, 5);
    px(dark, 2, 9 + bob, 1, 5);
    px(look.tie, -2, 9 + bob, 4, 2);
    px(shade(look.tie, 0.75), -1, 11 + bob, 2, 1);
    px(look.tie, 0, 12 + bob, 1, 3);
  } else {
    px(dark, -3, 9 + bob, 1, 5);
    px(dark, 2, 9 + bob, 1, 5);
    px('#f2efe6', -2, 9 + bob, 4, 1);
    px('#f2efe6', -1, 10 + bob, 2, 2);
    px(look.tie, -1, 9 + bob, 2, 1);
    px(look.tie, -1, 11 + bob, 2, 5);
  }
  // Arms. The near arm (on the facing side) does the gesture.
  const sleeve = kit ? kit.primary : look.jacket;
  const cuff = kit ? kit.secondary : '#f2efe6';
  const restArm = (/** @type {1 | -1} */ side) => {
    const c = side === 1 ? 6 : -7;
    if (o.toBottom) {
      // A close-up with no desk: the arm hangs at their side.
      const a = side === 1 ? 6 : -8;
      if (kit) {
        px(sleeve, a, 10 + bob, 2, 4);
        px(cuff, a, 14 + bob, 2, 1);
        px(look.skin, a, 15 + bob, 2, 6);
        return;
      }
      px(sleeve, a, 10 + bob, 2, 8);
      px(cuff, a, 18 + bob, 2, 1);
      px(look.skin, a, 19 + bob, 2, 2);
      return;
    }
    px(sleeve, c, 10 + bob, 1, 7);
    px(sleeve, side === 1 ? 3 : -6, 16 + bob, 4, 2);
    px(cuff, side === 1 ? 2 : -3, 16 + bob, 1, 2);
    px(look.skin, side === 1 ? 1 : -3, 17 + bob, 2, 1);
  };
  if (pose === 'open') {
    restArm(-1);
    px(sleeve, 6, 10, 1, 3);
    px(sleeve, 7, 12, 4, 2);
    px(cuff, 11, 12, 1, 2);
    px(look.skin, 12, 11 - beat, 2, 3);
  } else if (pose === 'point') {
    restArm(-1);
    for (let k = 0; k < 6; k++) px(sleeve, 6 + k, 10 - k, 2, 2);
    px(cuff, 12, 4, 1, 2);
    px(look.skin, 13, 3, 2, 2);
    px(look.skin, 15, 2 - beat, 1, 1);
  } else if (pose === 'both') {
    for (const s of /** @type {(1 | -1)[]} */ ([1, -1])) {
      const c = s === 1 ? 7 : -9;
      px(sleeve, s === 1 ? 6 : -7, 10, 1, 2);
      px(sleeve, c, 5 - beat, 2, 6);
      px(look.skin, c, 3 - beat, 2, 2);
    }
  } else {
    restArm(1);
    restArm(-1);
  }
  // Neck and head.
  const hx = pose === 'laugh' ? -1 : 0;
  const hy = (pose === 'nod' ? beat : 0) + (pose === 'laugh' ? -1 + bob : 0);
  px(look.skin, -1, 8 + bob, 2, 1);
  px(look.skin, -3 + hx, 1 + hy, 6, 7);
  px(shade(look.skin, 0.85), -3 + hx, 7 + hy, 6, 1);
  // Hair.
  px(look.hair, -3 + hx, 0 + hy, 6, 2);
  if (look.style === 'short') { px(look.hair, -3 + hx, 2 + hy, 1, 1); px(look.hair, 2 + hx, 2 + hy, 1, 1); }
  if (look.style === 'long') { px(look.hair, -4 + hx, 1 + hy, 1, 7); px(look.hair, 3 + hx, 1 + hy, 1, 7); px(look.hair, -3 + hx, 2 + hy, 1, 2); }
  if (look.style === 'bun') { px(look.hair, -4 + hx, 1 + hy, 1, 3); px(look.hair, -6 + hx, 0 + hy, 2, 2); }
  // A woman at the desk (Task 132): earrings.
  if (look.woman) { px('#ffd27a', -4 + hx, 5 + hy, 1, 1); px('#ffd27a', 3 + hx, 5 + hy, 1, 1); }
  // Face: eyes looking the way they face (closed when laughing), brows up when making a point, the mouth.
  const eye = '#151924';
  if (pose === 'laugh') { px(eye, -1 + hx, 4 + hy, 2, 1); px(eye, 2 + hx, 4 + hy, 1, 1); }
  else { px(eye, -1 + hx, 4 + hy, 1, 1); px(eye, 1 + hx, 4 + hy, 1, 1); }
  // A woman's lashes: a pixel at each eye's outer corner.
  if (look.woman && pose !== 'laugh') { px(eye, -2 + hx, 3 + hy, 1, 1); px(eye, 2 + hx, 3 + hy, 1, 1); }
  if (pose === 'open' || pose === 'point') { px(look.hair, -1 + hx, 3 + hy, 1, 1); px(look.hair, 1 + hx, 3 + hy, 1, 1); }
  const open = pose === 'laugh' || (o.mouth && beat === 1);
  const lips = look.woman ? '#b0405a' : shade(look.skin, 0.7);
  px(open ? '#6a1e1e' : lips, 0 + hx, 6 + hy, open && pose === 'laugh' ? 2 : 1, 1);
}

// ---------------------------------------------------------------- set B (Tom's pick, Task 93)

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ scale: number, seats: [{ x: number, y: number }, { x: number, y: number }], deskTop: number,
 *   desk: { x: number, w: number, h: number }, screen: Rect, sides: [Rect, Rect], floorY: number, lights: number[] }} SetLayout
 *   seats: each presenter's head (the top of it, centred); deskTop: the desk's top edge; desk: its left, width and
 *   front's height; screen: the big curved screen; sides: the two upright screens; lights: the spotlights' x.
 */

/**
 * Where everything on set B goes, in a rect (the ground in Full, the whole screen in Broadcast). The figures and desk
 * are drawn at 3× on the ground and 4× on the whole screen (Task 98: whole-number scales keep the pixels square; at 3×
 * on the full screen the presenters looked small).
 * @param {Rect} R
 * @returns {SetLayout}
 */
export function setLayout(R) {
  const scale = R.h >= 250 ? 4 : 3;
  const deskTop = R.y + Math.round(R.h * 0.64);
  const seatY = deskTop - 17 * scale;
  const deskW = Math.round((230 * scale) / 3);
  const screen = { x: R.x + 72, y: R.y + 16, w: R.w - 144, h: Math.round(R.h * 0.44) };
  const sideH = Math.round(R.h * 0.36);
  return {
    scale,
    seats: [{ x: R.x + Math.round(R.w * 0.4), y: seatY }, { x: R.x + Math.round(R.w * 0.6), y: seatY }],
    deskTop,
    desk: { x: R.x + Math.round((R.w - deskW) / 2), w: deskW, h: Math.round((40 * scale) / 3) },
    screen,
    sides: [{ x: R.x + 14, y: R.y + 26, w: 46, h: sideH }, { x: R.x + R.w - 60, y: R.y + 26, w: 46, h: sideH }],
    floorY: R.y + Math.round(R.h * 0.78),
    lights: [0, 1, 2, 3, 4].map((k) => R.x + 40 + Math.round((k * (R.w - 80)) / 4)),
    // The graphic under the speaker (Task 131): on the desk's front, a little below its top.
    lowerY: deskTop + Math.round((16 * scale) / 3),
  };
}

/**
 * Who's doing what at `since` ms into a talk: the one talking makes their line's gesture for its first
 * `gestureMs`, then just talks (mouth moving while the line types); the other turns to them and nods now and then.
 * Between lines both rest, facing each other.
 * @param {import('./studio.js').Line[]} script @param {number} since @param {{ gestureMs: number, nodEveryMs: number, charsPerSecond: number }} o
 * @returns {[FigurePose, FigurePose]}
 */
export function figurePoses(script, since, o) {
  const line = script.find((l) => since >= l.from && since < l.until) ?? null;
  return /** @type {[FigurePose, FigurePose]} */ ([0, 1].map((i) => {
    /** @type {1 | -1} */
    const toPartner = i === 0 ? 1 : -1;
    if (!line) return { pose: 'rest', facing: toPartner, mouth: false };
    const into = since - line.from;
    if (line.who === i) {
      const gesturing = into < o.gestureMs && line.gesture !== 'talk';
      const pose = gesturing ? line.gesture : 'talk';
      // Pointing at the screens means turning toward them, away from the partner.
      return { pose, facing: pose === 'point' ? /** @type {1 | -1} */ (-toPartner) : toPartner, mouth: into < (line.text.length / o.charsPerSecond) * 1000 };
    }
    return { pose: Math.floor(into / o.nodEveryMs) % 3 === 1 ? 'nod' : 'rest', facing: toPartner, mouth: false };
  }));
}

/** @typedef {{ pose: Pose, facing: 1 | -1, mouth: boolean }} FigurePose */
/**
 * @typedef {string | (string | { kit: string })[]} ScreenLine  A side screen's line: text, or text with a team's kit
 *   swatch (its main colour) before an abbreviation (Task 110).
 */

/** A frame round a rect. @param {CanvasRenderingContext2D} ctx @param {Rect} r @param {number} b @param {string} c */
function frame(ctx, r, b, c) {
  ctx.fillStyle = c;
  ctx.fillRect(r.x - b, r.y - b, r.w + 2 * b, b);
  ctx.fillRect(r.x - b, r.y + r.h, r.w + 2 * b, b);
  ctx.fillRect(r.x - b, r.y, b, r.h);
  ctx.fillRect(r.x + r.w, r.y, b, r.h);
}

/** @type {{ key: string, c: HTMLCanvasElement } | null} The big screen's picture, drawn flat before it's bent. */
let screenCanvas = null;

/**
 * Set B behind the presenters: the big curved screen showing the light bars, the two upright screens with live
 * graphics (the table's top six, the next match), the lighting rig and its spotlights, the floor.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {SetLayout} L @param {number} t
 * @param {import('./scene.js').SceneSettings} scene @param {{ left: ScreenLine[], right: ScreenLine[] }} screens  The side screens' lines (the first a title).
 */
export function drawSetBack(ctx, R, L, t, scene, screens) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  ctx.fillStyle = '#0b0d16';
  ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.fillStyle = '#10141f';
  for (let x = R.x; x < R.x + R.w; x += 24) ctx.fillRect(x, R.y, 12, R.h);
  // The curved screen: the light bars drawn flat, then copied a column at a time, shorter toward its ends.
  const S = L.screen;
  const key = `${S.w}x${S.h}`;
  if (screenCanvas?.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, S.w);
    c.height = Math.max(1, S.h);
    screenCanvas = { key, c };
  }
  const flat = screenCanvas.c;
  drawScene(/** @type {CanvasRenderingContext2D} */ (flat.getContext('2d')), { x: 0, y: 0, w: S.w, h: S.h }, t, scene);
  for (let i = 0; i < S.w; i++) {
    const d = (i - S.w / 2) / (S.w / 2);
    const inset = Math.round(7 * d * d);
    ctx.fillStyle = '#1c2232';
    ctx.fillRect(S.x + i, S.y + inset - 3, 1, S.h - 2 * inset + 6);
    ctx.drawImage(flat, i, 0, 1, S.h, S.x + i, S.y + inset, 1, S.h - 2 * inset);
  }
  // The side screens.
  [screens.left, screens.right].forEach((lines, k) => {
    const r = L.sides[k];
    ctx.fillStyle = '#0d1430';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(r.x, r.y, r.w, 3);
    ctx.font = '8px "VT323"';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    lines.forEach((line, i) => {
      let x = r.x + 3;
      const y = r.y + 6 + i * 9;
      for (const part of typeof line === 'string' ? [line] : line) {
        if (typeof part === 'string') {
          // Sharp (Task 200; sharpText.js); measured here at the picture's size.
          sharpText(ctx, part, x, y, { size: 8, colour: i ? '#cfe6ff' : '#ffffff', max: r.x + r.w - 3 - x });
          ctx.font = '8px "VT323"';
          x += ctx.measureText(part).width;
        } else {
          ctx.fillStyle = part.kit;
          ctx.fillRect(Math.round(x), y + 1, 2, 5);
          x += 3;
        }
      }
    });
    frame(ctx, r, 2, '#1c2232');
  });
  // The rig and its spotlights.
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(R.x, R.y + 2, R.w, 3);
  L.lights.forEach((lx, k) => {
    ctx.fillStyle = '#4a5060';
    ctx.fillRect(lx - 3, R.y + 5, 6, 4);
    ctx.fillStyle = 'rgba(255,240,200,0.9)';
    ctx.fillRect(lx - 2, R.y + 9, 4, 1);
    ctx.fillStyle = `rgba(255,240,200,${0.05 + 0.02 * Math.sin(t / 900 + k)})`;
    const top = R.y + 10;
    const bottom = R.y + R.h;
    for (let y = top; y < bottom; y++) {
      const spread = 2 + ((y - top) / (bottom - top)) * 20;
      ctx.fillRect(Math.round(lx - spread), y, Math.round(2 * spread), 1);
    }
  });
  ctx.fillStyle = '#0e1320';
  ctx.fillRect(R.x, L.floorY, R.w, R.y + R.h - L.floorY);
  ctx.restore();
}

/**
 * Set B's curved desk, in front of the presenters, with the ball mark on its front.
 * @param {CanvasRenderingContext2D} ctx @param {SetLayout} L
 */
export function drawDesk(ctx, L) {
  const { x, w, h } = L.desk;
  const cx = x + w / 2;
  const u = L.scale / 3;
  for (let i = 0; i < w; i++) {
    const d = (i - w / 2) / (w / 2);
    const dip = Math.round(6 * u * (1 - d * d));
    ctx.fillStyle = '#3a4357';
    ctx.fillRect(x + i, L.deskTop + dip, 1, Math.round(4 * u));
    ctx.fillStyle = '#20273a';
    ctx.fillRect(x + i, L.deskTop + dip + Math.round(4 * u), 1, h);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(x + i, L.deskTop + dip + Math.round(26 * u), 1, Math.max(1, Math.round(2 * u)));
  }
  ballMark(ctx, Math.round(cx), L.deskTop + Math.round(20 * u), Math.round(5 * u));
}

/**
 * The ball mark (no fire, no name), on the desk and the interview's board.
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r
 */
export function ballMark(ctx, cx, cy, r) {
  for (let y = -r; y <= r; y++) {
    const half = Math.round(Math.sqrt(r * r - y * y));
    ctx.fillStyle = y < -r / 3 ? '#ffffff' : '#d8d4c8';
    ctx.fillRect(cx - half, cy + y, half * 2 + 1, 1);
  }
  ctx.fillStyle = PALETTE.panel;
  const p = Math.max(1, Math.round(r / 3));
  ctx.fillRect(cx - Math.floor(p / 2), cy - Math.floor(p / 2), p, p);
}
