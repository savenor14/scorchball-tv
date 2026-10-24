// OFF THE BALL's booth (Tom's pick B4, 2026-10-20; docs/podcast.md, docs/channel.md §34): high in a stand over the
// ground, the window's three panes over the pitch, the neon name on a plate across the frame, the pair at a counter with
// their mics, Tamsin's mug by her. During a topic the middle pane is the screen (its graphic, or the day's goals played
// in it, following the ball) and the side panes frost over in the channel's dark blue; between topics all three show the
// ground. Drawn into the scene's rect (over the ground in Full, the whole screen in Broadcast), laid out from its size as
// set B is (studioSet.js setLayout). Drawing only: what's on the screen is worked out by its caller. From podcastSheet.js's
// mock-up (podcast.html).
import { PALETTE } from './palette.js';
import { PITCH } from './pitch.js';
import { blockText, blockWidth, rgba, shade } from './sceneArt.js';
import { sharpText } from './sharpText.js';
import { drawFigure } from './studioSet.js';

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ pose: import('./studioSet.js').Pose, beat: number, facing: 1 | -1, mouth: boolean }} FigurePose
 * @typedef {{ kind: 'table', head: string, rows: { place: number, abbr: string, kit: string, points: number, move: number }[] } | { kind: 'list', head: string, rows: { label: string, kit: string, value: string, lit: boolean }[] } | { kind: 'match', ground: CanvasImageSource, ballX: number, label: string }} Screen
 *   What the middle pane shows during a topic, only when there's something to show (Tom, 2026-10-21: a heading or a line
 *   or two goes in a lower third, the window left clear): the table (with today's moves), a list (the payrolls, the
 *   Cups), or the day's goals (a stage-sized picture of the pitch with the match on it, followed at the ball's x).
 */

/** Where things go in a scene rect (stage px): the window and its panes, the seats, the counter, the lower third. @param {Rect} R */
export function boothLayout(R) {
  const scale = R.h >= 250 ? 4 : 3;
  const win = { x: R.x + 14, y: R.y + 12, w: R.w - 28, h: Math.round(R.h * 0.55) };
  const third = Math.round(win.w / 3);
  const panes = [{ x: win.x, w: third }, { x: win.x + third + 3, w: third - 3 }, { x: win.x + 2 * third + 3, w: win.w - 2 * third - 3 }];
  const counterY = R.y + Math.round(R.h * 0.71);
  const seatY = counterY - 19 * scale;
  return {
    scale, win, panes, counterY,
    seats: [{ x: R.x + Math.round(R.w * 0.22), y: seatY }, { x: R.x + Math.round(R.w * 0.78), y: seatY }],
    /** The middle pane as the screen: below the name's plate. */
    screen: { x: panes[1].x, y: win.y + 13, w: panes[1].w, h: win.h - 13 },
    lowerY: R.y + Math.round(R.h * 0.9),
  };
}

/**
 * The booth at a moment.
 * @param {CanvasRenderingContext2D} g @param {Rect} R
 * @param {{ name: string, t: number, ground: CanvasImageSource, looks: any[], poses: FigurePose[], screen: Screen | null, wipe?: number | null }} o
 *   ground: a stage-sized picture of the ground of the day (its pitch drawn and lit), seen through the window. wipe:
 *   how far a new graphic has wiped onto the screen (0–1), or none.
 */
export function drawBooth(g, R, o) {
  const L = boothLayout(R);
  const { win, panes } = L;
  g.fillStyle = '#161b26';
  g.fillRect(R.x, R.y, R.w, R.h);
  // The window over the ground: the pitch seen from high, a band across it, as wide as the window.
  const band = (PITCH.w * win.h) / win.w;
  g.drawImage(o.ground, PITCH.x, PITCH.y + (PITCH.h - band) / 2, PITCH.w, band, win.x, win.y, win.w, win.h);
  if (o.screen) {
    // A topic on: the side panes frost over, the middle one is the screen, its top under the name's plate.
    for (const pane of [panes[0], panes[2]]) {
      g.fillStyle = 'rgba(13,20,48,0.82)';
      g.fillRect(pane.x, win.y, pane.w, win.h);
      g.fillStyle = 'rgba(255,255,255,0.04)';
      for (let y = win.y; y < win.y + win.h; y += 3) g.fillRect(pane.x + ((y * 7) % 5), y, pane.w - 5, 1);
    }
    g.fillStyle = '#0d1430';
    g.fillRect(panes[1].x, win.y, panes[1].w, 13);
    drawScreen(g, L.screen, o.screen);
    // A new graphic wipes on from the left behind an amber edge (Tom, 2026-10-21: so the change of topic shows).
    if (o.wipe !== null && o.wipe !== undefined && o.wipe < 1) {
      const S = L.screen;
      const x = S.x + Math.round(S.w * o.wipe);
      g.fillStyle = '#0d1430';
      g.fillRect(x, S.y, S.x + S.w - x, S.h);
      g.fillStyle = PALETTE.accent;
      g.fillRect(Math.min(x, S.x + S.w - 3), S.y, 3, S.h);
    }
  }
  // The glass: a faint blue and a few streaks; the frame and its two mullions.
  g.fillStyle = 'rgba(20,30,60,0.18)';
  g.fillRect(win.x, win.y, win.w, win.h);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 3; i++) for (let k = 0; k < Math.floor(win.h / 8); k++) g.fillRect(win.x + 40 + Math.round((i * win.w) / 3) + k, win.y + k * 8, 3, 8);
  g.fillStyle = '#0e121b';
  g.fillRect(win.x - 3, win.y - 3, win.w + 6, 3);
  g.fillRect(win.x - 3, win.y + win.h, win.w + 6, 4);
  g.fillRect(win.x - 3, win.y, 3, win.h);
  g.fillRect(win.x + win.w, win.y, 3, win.h);
  g.fillRect(panes[1].x - 3, win.y, 3, win.h);
  g.fillRect(panes[2].x - 3, win.y, 3, win.h);
  // The neon name on a plate across the top of the frame.
  const cx = R.x + R.w / 2;
  g.fillStyle = '#0e121b';
  g.fillRect(Math.round(cx - 80), R.y + 4, 160, 20);
  neon(g, o.name, cx, R.y + 7, 2, o.t);
  o.poses.forEach((p, k) => drawFigure(g, L.seats[k].x, L.seats[k].y, L.scale, o.looks[k], p.pose, p.beat, p.facing, { mouth: p.mouth }));
  // The counter, in front, with the channel's line along it.
  g.fillStyle = '#3a4357';
  g.fillRect(R.x, L.counterY, R.w, 5);
  g.fillStyle = '#232a3a';
  g.fillRect(R.x, L.counterY + 5, R.w, R.y + R.h - L.counterY - 5);
  g.fillStyle = PALETTE.accent;
  g.fillRect(R.x, L.counterY + 18, R.w, 2);
  // Tamsin's mug on her side (Tom: near neither of them, not in the middle); a mic on a stand for each.
  const u = L.scale / 3;
  mug(g, L.seats[0].x - Math.round(26 * u), L.counterY, '#e8e2d0', o.t);
  mic(g, L.seats[0].x + Math.round(26 * u), L.counterY, L.seats[0].x + Math.round(13 * u), L.seats[0].y + Math.round(20 * u));
  mic(g, L.seats[1].x - Math.round(26 * u), L.counterY, L.seats[1].x - Math.round(13 * u), L.seats[1].y + Math.round(20 * u));
  return L;
}

/**
 * The middle pane during a topic.
 * @param {CanvasRenderingContext2D} g @param {Rect} S @param {Screen} s
 */
function drawScreen(g, S, s) {
  if (s.kind === 'match') {
    // The pitch and its boards, as tall as the pane, a part of it as wide as it, following the ball.
    const full = { x: PITCH.x - 10, y: PITCH.y - 6, w: PITCH.w + 20, h: PITCH.h + 12 };
    const w = Math.min(full.w, Math.round((full.h * S.w) / S.h));
    const x = Math.round(Math.min(full.x + full.w - w, Math.max(full.x, s.ballX - w / 2)));
    g.drawImage(s.ground, x, full.y, w, full.h, S.x, S.y, S.w, S.h);
    g.fillStyle = 'rgba(5,7,12,0.85)';
    g.fillRect(S.x, S.y + S.h - 12, S.w, 12);
    sharpText(g, s.label, S.x + 4, S.y + S.h - 11, { size: 8, colour: PALETTE.accent, max: S.w - 8 });
    return;
  }
  g.fillStyle = '#0d1430';
  g.fillRect(S.x, S.y, S.w, S.h);
  g.fillStyle = PALETTE.accent;
  g.fillRect(S.x, S.y, S.w, 3);
  sharpText(g, s.head, S.x + 5, S.y + 6, { size: 8, colour: '#ffffff', max: S.w - 10 });
  if (s.kind === 'list') {
    const n = Math.max(1, Math.floor((S.h - 17) / 9));
    s.rows.slice(0, n).forEach((r, i) => {
      const y = S.y + 17 + i * 9;
      g.fillStyle = r.kit;
      g.fillRect(S.x + 6, y + 1, 3, 6);
      sharpText(g, r.label, S.x + 13, y, { size: 8, colour: r.lit ? PALETTE.accent : '#cfe6ff' });
      sharpText(g, r.value, S.x + S.w - 5, y, { size: 8, colour: r.lit ? PALETTE.accent : '#cfe6ff', align: 'right' });
    });
    return;
  }
  // The table: as many rows as fit.
  const n = Math.max(1, Math.floor((S.h - 17) / 9));
  s.rows.slice(0, n).forEach((r, i) => {
    const y = S.y + 17 + i * 9;
    sharpText(g, String(r.place), S.x + 6, y, { size: 8, colour: PALETTE.panelMuted });
    g.fillStyle = r.kit;
    g.fillRect(S.x + 16, y + 1, 3, 6);
    sharpText(g, r.abbr, S.x + 23, y, { size: 8, colour: r.move > 0 ? PALETTE.accent : '#cfe6ff' });
    sharpText(g, String(r.points), S.x + S.w - 34, y, { size: 8, colour: '#cfe6ff' });
    sharpText(g, r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : '–', S.x + S.w - 16, y, { size: 8, colour: r.move > 0 ? PALETTE.up : r.move < 0 ? PALETTE.down : PALETTE.panelMuted });
  });
}

/** The neon name: a soft glow round the block letters, a bright core, a flicker now and then. @param {CanvasRenderingContext2D} g @param {string} name @param {number} cx @param {number} y @param {number} scale @param {number} t */
function neon(g, name, cx, y, scale, t) {
  const x = Math.round(cx - blockWidth(name, scale) / 2);
  const flicker = Math.floor(t / 2300) % 9 === 4 ? 0.6 : 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) blockText(g, name, x + dx, y + dy, scale, rgba(PALETTE.accent, 0.18 * flicker));
  blockText(g, name, x, y, scale, flicker < 1 ? shade(PALETTE.accent, 0.8) : '#ffd2a0');
}

/** A podcast mic on a stand: a pole up from the counter, an arm across to the head by the speaker's mouth. @param {CanvasRenderingContext2D} g @param {number} baseX @param {number} baseY @param {number} headX @param {number} headY */
function mic(g, baseX, baseY, headX, headY) {
  g.fillStyle = '#2a2f3a';
  g.fillRect(baseX - 4, baseY - 2, 8, 2);
  g.fillRect(baseX, headY + 2, 2, baseY - headY - 2);
  g.fillRect(Math.min(baseX, headX), headY + 2, Math.abs(headX - baseX) + 2, 2);
  g.fillStyle = PALETTE.panel;
  g.fillRect(headX - 3, headY - 4, 7, 10);
  g.fillStyle = '#5a6070';
  for (let r = 0; r < 4; r++) g.fillRect(headX - 2, headY - 3 + r * 2, 5, 1);
}

/** A mug, steaming. @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {string} c @param {number} t */
function mug(g, x, y, c, t) {
  g.fillStyle = c;
  g.fillRect(x, y - 6, 5, 6);
  g.fillRect(x + 5, y - 5, 2, 1);
  g.fillRect(x + 6, y - 4, 1, 2);
  g.fillRect(x + 5, y - 2, 2, 1);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(x + 1, y - 9 - (Math.floor(t / 500) % 2), 1, 2);
}
