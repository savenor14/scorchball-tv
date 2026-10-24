// Dev page (podcast.html; the podcast studio segment, Tom's picks 2026-10-20: pair A with new surnames, daily,
// Standard size; docs/podcast.md): mock-ups, nothing live or voiced. The set in three looks (A the back room, B a booth
// over the ground, C the sofa and the big screen), each with the pair talking through a draft topic, the bubble and the
// lower third as the desk has them; the pair magnified; and a topic as it would air on set C, the screen carrying the
// graphic (the table with today's moves) or a clip (the day's scorcher), from the dev league's real season 3. Drawn with
// the channel's own figures (studioSet.js), block font (sceneArt.js) and pitch (pitch.js). ?name= tries the show's name.
import { loadConfig } from '../config.js';
import { homeAttacksRight } from './formation.js';
import { matchKits } from './kits.js';
import { LiveLeague } from './liveLeague.js';
import { createMotion } from './motion.js';
import { isFinished, tableAt } from './onScreen.js';
import { PALETTE } from './palette.js';
import { drawBall, drawEndBoards, drawPitch, drawPlayers, PITCH } from './pitch.js';
import { blockText, blockWidth, rgba, shade } from './sceneArt.js';
import { sharpText } from './sharpText.js';
import { ballMark, drawFigure } from './studioSet.js';
import { createTimeline } from './timeline.js';

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

const config = await loadConfig(fetchText);
const params = new URLSearchParams(location.search);
const NAME = (params.get('name') ?? 'OFF THE BALL').toUpperCase();
const SEED = params.get('seed') ?? 'flareball';
/** Thursday evening of season 3 on the dev league: day 4, the regular season well under way. */
const NOW = Date.parse('2026-10-29T21:00:00-04:00');
const DAY_START = Date.parse('2026-10-29T00:00:00-04:00');
const live = new LiveLeague(config, { now: NOW, seed: SEED });
const season = live.calendar.seasonAt(NOW);
const teams = live.league.teams;
const keeperSlot = config.positions.keeper;
/** @type {Map<string, import('./timeline.js').Timeline>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
const durationOf = (/** @type {any} */ m) => timelineOf(m).duration;
const spoken = (/** @type {string} */ id) => String(config.studio.spokenTeam).replace('{name}', teams[id].shortName);

// The pair (Tom's pick A, 2026-10-20): the playoff analyst's two other candidates, with surnames from no region's pool.
const skins = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];
const PAIR = /** @type {const} */ ([
  { name: 'Tamsin Tregarrow', role: 'FORMER KEEPER', about: 'A former keeper from the Gullcoast, a career backup, sharp and dry: she watched it (mostly from the bench), and she trusts her eyes.', look: { jacket: '#3a2f4f', tie: '#ffd23f', skin: skins[0], hair: '#8a4a2a', style: 'long', woman: true } },
  { name: 'Samir Haddani', role: 'DATA ANALYST', about: 'A data analyst from Sunreach, quick and precise: he has the numbers, and he enjoys being right.', look: { jacket: '#5a1f2a', tie: '#d8a23a', skin: skins[2], hair: '#1a1a1a', style: 'short' } },
]);

// What's known on Thursday evening: the table now and at the day's start, so its moves today.
const table = tableAt(live, season, NOW, durationOf);
const before = tableAt(live, season, DAY_START, durationOf);
const moves = table.map((r, i) => ({ ...r, place: i + 1, move: before.findIndex((b) => b.teamId === r.teamId) - i }));
const top = moves[0];
// The day's climber: the biggest move up, not the leader (they have their own line).
const climber = [...moves].filter((r) => r.teamId !== moves[0].teamId).sort((a, b) => b.move - a.move || a.place - b.place)[0];
const bottom = moves[moves.length - 1];
const gamesLeft = live.calendar.regularCount - live.matchesIn(season).filter((m) => m.stage === 'regular' && isFinished(m, NOW, durationOf)).length;

/**
 * A draft topic, THE TABLE, as it might be said tonight (draft lines to show the shape; not data, not voiced). who: 0
 * Tamsin, 1 Samir. show: what the screen or the lower third carries.
 * @type {{ who: 0 | 1, say: string, show: string, gesture: 'talk' | 'open' | 'point' | 'laugh' | 'nod' }[]}
 */
const TALK = [
  { who: 0, say: 'Right. The table. Who\'s got it?', show: 'THE TABLE', gesture: 'open' },
  { who: 1, say: `${cap(spoken(top.teamId))} are top, and the numbers say they deserve it.`, show: `1 ${teams[top.teamId].shortName.toUpperCase()} · ${top.points} PTS · GD ${top.goalsFor - top.goalsAgainst > 0 ? '+' : ''}${top.goalsFor - top.goalsAgainst}`, gesture: 'point' },
  { who: 0, say: 'Numbers. I watched them. They\'re scared of nobody.', show: `${teams[top.teamId].abbr} FORM ${(/** @type {any} */ (top).form ?? []).join('')}`, gesture: 'talk' },
  { who: 1, say: climber.move > 0 ? `The climbers today: ${spoken(climber.teamId)}.` : 'Nobody moved today. Not one place.', show: climber.move > 0 ? `${teams[climber.teamId].abbr} ▲${climber.move} TO ${climber.place}` : 'NO CHANGE TODAY', gesture: 'open' },
  { who: 0, say: 'And at the bottom... somebody has to say it.', show: `${moves.length} ${teams[bottom.teamId].shortName.toUpperCase()} · ${bottom.points} PTS`, gesture: 'laugh' },
  { who: 1, say: 'Plenty of games left. In theory.', show: `${gamesLeft} MATCHES LEFT IN THE REGULAR SEASON`, gesture: 'talk' },
];
/** @param {string} s */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
/** How long each line takes (about 14 characters a second, as the analyst's mock-up guessed, and a beat). */
const lineMs = (/** @type {string} */ s) => (s.length / 14 + 0.9) * 1000;
const STARTS = TALK.reduce((acc, l, i) => [...acc, acc[i] + lineMs(l.say)], [0]);
const TOTAL = STARTS[STARTS.length - 1];
/** The line on at `t`, and how far in. @param {number} t */
function lineAt(t) {
  const into = t % TOTAL;
  const i = Math.max(0, STARTS.findIndex((s, k) => into >= s && into < STARTS[k + 1]));
  return { i, line: TALK[i], since: into - STARTS[i] };
}
/** Each figure's pose at `t`: the speaker's gesture then talking, mouth moving; the other turned to them, nodding now and then. @param {number} t */
function posesAt(t) {
  const { line, since } = lineAt(t);
  const beat = Math.floor(t / 180) % 2;
  return [0, 1].map((k) => {
    const facing = /** @type {1 | -1} */ (k === 0 ? 1 : -1);
    if (line.who === k) {
      const pose = since < 900 && line.gesture !== 'talk' ? line.gesture : 'talk';
      return { pose, facing: pose === 'point' ? /** @type {1 | -1} */ (-facing) : facing, mouth: since < (line.say.length / 14) * 1000, beat };
    }
    return { pose: Math.floor(since / 1100) % 3 === 1 ? 'nod' : 'rest', facing, mouth: false, beat: Math.floor(t / 400) % 2 };
  });
}

// ---------------------------------------------------------------- drawing helpers

const R = { x: 0, y: 0, w: 392, h: 212 };
const U = 3;
/** The neon name: a soft glow round the block letters, a bright core. @param {CanvasRenderingContext2D} g @param {number} cx @param {number} y @param {number} scale @param {number} t */
function neon(g, cx, y, scale, t) {
  const x = Math.round(cx - blockWidth(NAME, scale) / 2);
  const flicker = Math.floor(t / 2300) % 9 === 4 ? 0.6 : 1;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) blockText(g, NAME, x + dx, y + dy, scale, rgba(PALETTE.accent, 0.18 * flicker));
  blockText(g, NAME, x, y, scale, flicker < 1 ? shade(PALETTE.accent, 0.8) : '#ffd2a0');
}
/** A podcast mic on a stand: a pole from the base up to the arm, the arm across to the head by the speaker's mouth. @param {CanvasRenderingContext2D} g @param {number} baseX @param {number} baseY @param {number} headX @param {number} headY */
function mic(g, baseX, baseY, headX, headY) {
  g.fillStyle = '#2a2f3a';
  g.fillRect(baseX - 4, baseY - 2, 8, 2);
  g.fillRect(baseX, headY + 2, 2, baseY - headY - 2);
  const from = Math.min(baseX, headX);
  g.fillRect(from, headY + 2, Math.abs(headX - baseX) + 2, 2);
  g.fillStyle = '#151924';
  g.fillRect(headX - 3, headY - 4, 7, 10);
  g.fillStyle = '#5a6070';
  for (let r = 0; r < 4; r++) g.fillRect(headX - 2, headY - 3 + r * 2, 5, 1);
}
/** A mug. @param {CanvasRenderingContext2D} g @param {number} x @param {number} y @param {string} c */
function mug(g, x, y, c) {
  g.fillStyle = c;
  g.fillRect(x, y - 6, 5, 6);
  g.fillRect(x + 5, y - 5, 2, 1);
  g.fillRect(x + 6, y - 4, 1, 2);
  g.fillRect(x + 5, y - 2, 2, 1);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(x + 1, y - 9 - (Math.floor(performance.now() / 500) % 2), 1, 2);
}
/** Both figures, posed at `t`, at their seats. @param {CanvasRenderingContext2D} g @param {{ x: number, y: number }[]} seats @param {number} t */
function figures(g, seats, t) {
  posesAt(t).forEach((p, k) => drawFigure(g, seats[k].x, seats[k].y, U, PAIR[k].look, /** @type {any} */ (p.pose), p.beat, p.facing, { mouth: p.mouth }));
}

// The ground for set B's window and set C's clip: a real pitch, drawn at the channel's size.
const W = 480;
const H = 270;
const ground = document.createElement('canvas');
ground.width = W;
ground.height = H;
const groundCtx = /** @type {CanvasRenderingContext2D} */ (ground.getContext('2d'));
groundCtx.imageSmoothingEnabled = false;

// The day's scorcher (DID YOU SEE THAT?): the latest of the regular season's on screen by Thursday evening.
const scorcher = (() => {
  const done = live.matchesIn(season).filter((m) => m.stage === 'regular' && isFinished(m, NOW, durationOf)).sort((a, b) => b.kickoff - a.kickoff);
  for (const m of done) {
    const tl = timelineOf(m);
    const goal = [...tl.events].reverse().find((x) => x.event.type === 'goal' && /** @type {any} */ (x.event.data)?.scorcher);
    if (!goal) continue;
    const motion = createMotion(tl, { matchId: m.id, homeId: m.homeId, keeperSlot, animation: config.settings.animation, play: config.settings.play });
    return { m, tl, motion, at: goal.at, scorerId: /** @type {string} */ (goal.event.playerId), kits: matchKits(teams[m.homeId].colours, teams[m.awayId].colours, config.settings.kits.clashDistance) };
  }
  return null;
})();
/**
 * The scorcher's last 3 s before it went in and a beat after, looping, drawn on the ground canvas; where the ball is
 * across it (stage px), for a narrow screen to follow. @param {number} t @returns {number}
 */
function drawClip(t) {
  drawPitch(groundCtx);
  const middle = PITCH.x + PITCH.w / 2;
  if (!scorcher) return middle;
  const e = scorcher.at - 3000 + (t % 4000);
  drawEndBoards(groundCtx, scorcher.kits, homeAttacksRight(scorcher.tl.stateAt(e).phase) === 1);
  const pose = scorcher.motion.at(e);
  if (!pose) return middle;
  drawPlayers(groundCtx, pose.players, scorcher.kits, keeperSlot, e);
  drawBall(groundCtx, pose, [], config.rules.heat, e);
  return pose.ball ? PITCH.x + pose.ball.x * PITCH.w : middle;
}

// ---------------------------------------------------------------- the three sets

/** @typedef {{ name: string, about: string, seats: { x: number, y: number }[], draw: (g: CanvasRenderingContext2D, t: number) => void, lowerY: number }} Set */

/** @type {Set} */
const SET_A = {
  name: 'A · The back room',
  about: 'A small back room: a brick wall with the neon name, a shelf with a ball, a pennant and books, foam panels, two armchairs turned to each other over a low table with mugs, a mic on a stand for each. The cosiest, the most like a real podcast; no screen, so the specifics go in the lower third.',
  seats: [{ x: 120, y: 74 }, { x: 272, y: 74 }],
  lowerY: 186,
  draw(g, t) {
    g.fillStyle = '#2a1d1a';
    g.fillRect(R.x, R.y, R.w, R.h);
    for (let y = 0, row = 0; y < 150; y += 7, row++) {
      g.fillStyle = '#231816';
      g.fillRect(0, y, R.w, 1);
      for (let x = (row % 2) * 9; x < R.w; x += 18) g.fillRect(x, y, 1, 7);
    }
    // The shelf: books, the ball, a pennant in the accent.
    g.fillStyle = '#5a3a22';
    g.fillRect(14, 58, 86, 3);
    [['#3d5a80', 9], ['#8a3a2a', 7], ['#c8a24a', 8], ['#3a6b4a', 6]].forEach(([c, h], i) => { g.fillStyle = String(c); g.fillRect(18 + i * 5, 58 - Number(h), 4, Number(h)); });
    ballMark(g, 52, 53, 4);
    g.fillStyle = PALETTE.accent;
    for (let i = 0; i < 9; i++) g.fillRect(66, 44 + i, 22 - i * 2.4, 1);
    g.fillStyle = '#d8d4c8';
    g.fillRect(65, 43, 1, 15);
    // Foam panels on the right.
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      g.fillStyle = (r + c) % 2 ? '#1c2230' : '#232a3a';
      g.fillRect(310 + c * 22, 30 + r * 22, 20, 20);
      g.fillStyle = '#151a25';
      for (let k = 0; k < 4; k++) g.fillRect(312 + c * 22, 33 + r * 22 + k * 5, 16, 1);
    }
    neon(g, R.w / 2, 18, 2, t);
    // The floor and a rug.
    g.fillStyle = '#3a2a22';
    g.fillRect(0, 150, R.w, R.h - 150);
    g.fillStyle = '#4a2f4f';
    g.fillRect(60, 176, 272, 30);
    g.fillStyle = '#5a3a5f';
    g.fillRect(64, 180, 264, 2);
    // The armchairs' backs, behind each figure.
    for (const s of this.seats) {
      g.fillStyle = '#6b3a2a';
      g.fillRect(s.x - 28, s.y + 6, 56, 80);
      g.fillStyle = '#7d4a36';
      g.fillRect(s.x - 26, s.y + 8, 52, 3);
    }
    figures(g, this.seats, t);
    // The chairs' arms and seats, in front.
    for (const s of this.seats) {
      g.fillStyle = '#5a2f22';
      g.fillRect(s.x - 34, s.y + 54, 12, 34);
      g.fillRect(s.x + 22, s.y + 54, 12, 34);
      g.fillStyle = '#6b3a2a';
      g.fillRect(s.x - 26, s.y + 70, 52, 18);
    }
    // The low table, the mugs, the mics on the table reaching to each.
    g.fillStyle = '#4a3020';
    g.fillRect(166, 148, 60, 5);
    g.fillRect(170, 153, 3, 18);
    g.fillRect(219, 153, 3, 18);
    mug(g, 178, 148, '#e8e2d0');
    mug(g, 206, 148, PALETTE.accent);
    mic(g, 172, 148, this.seats[0].x + 13, this.seats[0].y + 20);
    mic(g, 220, 148, this.seats[1].x - 13, this.seats[1].y + 20);
  },
};

/**
 * The booth over the ground (set B, Tom's favourite) and how it carries the topic (Tom, 2026-10-20: C's screen in B's
 * style): plain (as first drawn), monitor (B1, a monitor hung from the ceiling between them), glass (B2, a Glass panel
 * over the window, the ground round it), board (B3, the big board in the far stand, seen through the window), frost and
 * blinds (B4, B5; Tom: the window's middle pane is the screen during a topic, the side panes neutral, frosted or with
 * blinds down; between topics all three show the ground).
 * @param {'plain' | 'monitor' | 'glass' | 'board' | 'frost' | 'blinds'} how @param {string} name @param {string} about @returns {Set}
 */
const booth = (how, name, about) => ({
  name, about,
  seats: how === 'plain' ? [{ x: 132, y: 92 }, { x: 260, y: 92 }] : how === 'frost' || how === 'blinds' ? [{ x: 86, y: 92 }, { x: 306, y: 92 }] : [{ x: 92, y: 92 }, { x: 300, y: 92 }],
  lowerY: 190,
  /** @param {CanvasRenderingContext2D} g @param {number} t */
  draw(g, t) {
    g.fillStyle = '#161b26';
    g.fillRect(R.x, R.y, R.w, R.h);
    // The window over the ground: the pitch seen from high, a band across it, as wide as the window.
    drawPitch(groundCtx);
    const win = { x: 14, y: 12, w: 364, h: 116 };
    const band = (PITCH.w * win.h) / win.w;
    g.drawImage(ground, PITCH.x, PITCH.y + (PITCH.h - band) / 2, PITCH.w, band, win.x, win.y, win.w, win.h);
    // B3: the big board in the far stand, small with distance, on its two legs above the far touchline.
    if (how === 'board') {
      const S = { x: 141, y: 30, w: 110, h: 48 };
      g.fillStyle = '#0a0d14';
      g.fillRect(S.x + 14, S.y + S.h, 4, 10);
      g.fillRect(S.x + S.w - 18, S.y + S.h, 4, 10);
      g.fillRect(S.x - 3, S.y - 3, S.w + 6, S.h + 6);
      drawScreen(g, S, t);
    }
    // B4, B5: during a topic the middle pane is the screen and the side panes go neutral; between topics, the ground.
    const third = Math.round(win.w / 3);
    const panes = [{ x: win.x, w: third }, { x: win.x + third + 3, w: third - 3 }, { x: win.x + 2 * third + 3, w: win.w - 2 * third - 3 }];
    const topicOn = (how === 'frost' || how === 'blinds') && screenShows !== 'name';
    if (topicOn) {
      for (const pane of [panes[0], panes[2]]) {
        if (how === 'frost') {
          g.fillStyle = 'rgba(13,20,48,0.82)';
          g.fillRect(pane.x, win.y, pane.w, win.h);
          g.fillStyle = 'rgba(255,255,255,0.04)';
          for (let y = win.y; y < win.y + win.h; y += 3) g.fillRect(pane.x + ((y * 7) % 5), y, pane.w - 5, 1);
        } else {
          for (let y = win.y; y < win.y + win.h; y += 4) {
            g.fillStyle = '#2c3446';
            g.fillRect(pane.x, y, pane.w, 3);
            g.fillStyle = '#1c2230';
            g.fillRect(pane.x, y + 3, pane.w, 1);
          }
          g.fillStyle = '#4a5060';
          g.fillRect(pane.x + Math.round(pane.w / 2), win.y, 1, win.h);
        }
      }
      // Its top under the name's plate: the screen's colour there, the topic below it.
      g.fillStyle = '#0d1430';
      g.fillRect(panes[1].x, win.y, panes[1].w, 13);
      drawScreen(g, { x: panes[1].x, y: win.y + 13, w: panes[1].w, h: win.h - 13 }, t);
    }
    g.fillStyle = 'rgba(20,30,60,0.18)';
    g.fillRect(win.x, win.y, win.w, win.h);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 3; i++) for (let k = 0; k < 14; k++) g.fillRect(win.x + 40 + i * 120 + k, win.y + k * 8, 3, 8);
    g.fillStyle = '#0e121b';
    g.fillRect(win.x - 3, win.y - 3, win.w + 6, 3);
    g.fillRect(win.x - 3, win.y + win.h, win.w + 6, 4);
    g.fillRect(win.x - 3, win.y, 3, win.h);
    g.fillRect(win.x + win.w, win.y, 3, win.h);
    g.fillRect(win.x + Math.round(win.w / 3), win.y, 3, win.h);
    g.fillRect(win.x + Math.round((2 * win.w) / 3), win.y, 3, win.h);
    // B2: a Glass panel over the window, the ground showing round it.
    if (how === 'glass') drawScreen(g, { x: 122, y: 30, w: 148, h: 92 }, t, { glass: true });
    // The neon name on a plate across the top of the frame.
    g.fillStyle = '#0e121b';
    g.fillRect(R.w / 2 - 80, 4, 160, 20);
    neon(g, R.w / 2, 7, 2, t);
    // B1: a monitor hung from the ceiling between them, on a bar from the frame.
    if (how === 'monitor') {
      const S = { x: 124, y: 36, w: 144, h: 84 };
      g.fillStyle = '#0a0d14';
      g.fillRect(R.w / 2 - 2, 24, 4, S.y - 24);
      g.fillRect(S.x - 4, S.y - 4, S.w + 8, S.h + 8);
      drawScreen(g, S, t);
    }
    figures(g, this.seats, t);
    // The counter, in front.
    g.fillStyle = '#3a4357';
    g.fillRect(0, 150, R.w, 5);
    g.fillStyle = '#232a3a';
    g.fillRect(0, 155, R.w, R.h - 155);
    g.fillStyle = PALETTE.accent;
    g.fillRect(0, 168, R.w, 2);
    // Tamsin's mug, on her side of the counter (Tom: not in the middle, near neither).
    mug(g, this.seats[0].x - 26, 150, '#e8e2d0');
    mic(g, this.seats[0].x + 26, 150, this.seats[0].x + 13, this.seats[0].y + 20);
    mic(g, this.seats[1].x - 26, 150, this.seats[1].x - 13, this.seats[1].y + 20);
  },
});
const SET_B = booth('plain', 'B · A booth over the ground', 'A booth high in a stand: a wide window over a real ground (here the pitch the channel draws; on air the ground of the day, lit by the time of day as AROUND THE GROUNDS is), the neon name on the window\'s frame, the pair at a counter with their mics. Ties the show to the grounds; the window could carry a slow grounds tour behind them.');
/** B with C's screen (Tom, 2026-10-20: he likes B the most). */
const BOOTHS = [
  booth('monitor', 'B1 · A monitor hung from the ceiling', 'As in a commentary box: a monitor on a bar from the ceiling, between them, the pair a little further apart. Nearly as big as C\'s screen, so the whole table fits; the ground still behind it.'),
  booth('glass', 'B2 · Glass on the window', 'The topic on a panel of the channel\'s own Glass, laid over the window: the ground shows round it and faintly through it, the clip a touch see-through. The most like the rest of the channel; nothing new in the booth.'),
  booth('frost', "B4 · The middle pane, the sides frosted", "Tom's idea: the window's middle pane is the screen while a topic is on (the whole table fits; the clip follows the ball), and the side panes frost over in the channel's dark blue. Between topics (the third button) the frost clears and all three panes show the ground."),
  booth('blinds', "B5 · The middle pane, blinds on the sides", "The same, but the side panes get slatted blinds down while a topic is on, and up again between topics: more of a real booth, a little busier."),
  booth('board', 'B3 · The big board across the ground', 'The far stand\'s big screen, seen through the window, plays the topic, as if the stadium were showing it. Small with distance, so it carries the top of the table and today\'s climber, or the clip. The most in the world of the three.'),
];

/** What the screens show: the graphic, the clip or the name. @type {'table' | 'clip' | 'name'} */
let screenShows = 'table';
/** @type {Set} */
const SET_C = {
  name: 'C · The sofa and the big screen',
  about: 'A sofa in front of a big screen, the pair at its ends turned to each other, the neon name on the wall, a plant, mics on floor stands. The screen carries the topic: its graphic (the table, a payroll, a record) or a clip (a goal replayed). The most like the channel\'s own studio, and the specifics have somewhere to go.',
  seats: [{ x: 70, y: 96 }, { x: 322, y: 96 }],
  lowerY: 192,
  draw(g, t) {
    g.fillStyle = '#141a2a';
    g.fillRect(R.x, R.y, R.w, R.h);
    g.fillStyle = '#18203a';
    for (let x = 0; x < R.w; x += 14) g.fillRect(x, 0, 7, 150);
    // The big screen.
    const S = { x: 106, y: 14, w: 180, h: 101 };
    g.fillStyle = '#05070c';
    g.fillRect(S.x - 3, S.y - 3, S.w + 6, S.h + 6);
    drawScreen(g, S, t);
    // The neon name, small, top left; a plant on the right.
    g.fillStyle = '#0e121b';
    g.fillRect(8, 20, 86, 16);
    neon(g, 51, 25, 1, t);
    g.fillStyle = '#6b4a2a';
    g.fillRect(352, 128, 18, 20);
    g.fillStyle = '#2f7a3c';
    for (const [dx, dy, w] of [[-4, -22, 6], [6, -28, 5], [14, -20, 6], [2, -12, 14], [-2, -6, 22]]) g.fillRect(352 + dx, 128 + dy, w, 8);
    g.fillStyle = '#0e1320';
    g.fillRect(0, 150, R.w, R.h - 150);
    // The sofa's back, then the pair, then its seat and arms.
    g.fillStyle = '#2f4a5a';
    g.fillRect(30, 124, 332, 46);
    g.fillStyle = '#3b5a6b';
    g.fillRect(32, 126, 328, 3);
    figures(g, this.seats, t);
    g.fillStyle = '#3b5a6b';
    g.fillRect(30, 166, 332, 18);
    g.fillStyle = '#2f4a5a';
    g.fillRect(22, 150, 14, 38);
    g.fillRect(356, 150, 14, 38);
    g.fillStyle = '#4a3020';
    g.fillRect(170, 182, 52, 4);
    mug(g, 182, 182, '#e8e2d0');
    mug(g, 202, 182, PALETTE.accent);
    mic(g, this.seats[0].x + 30, 200, this.seats[0].x + 13, this.seats[0].y + 20);
    mic(g, this.seats[1].x - 30, 200, this.seats[1].x - 13, this.seats[1].y + 20);
  },
};

/**
 * A screen's topic: the table with today's moves, the clip, or the name, fitted to its size (a small screen shows the
 * top of the table and today's climber). glass: drawn over the window in the channel's Glass style (B2), see-through.
 * @param {CanvasRenderingContext2D} g @param {{ x: number, y: number, w: number, h: number }} S @param {number} t @param {{ glass?: boolean }} [o]
 */
function drawScreen(g, S, t, o = {}) {
  const wide = S.w >= 140;
  if (screenShows === 'clip') {
    const ballX = drawClip(t);
    // The pitch and its boards, cropped to fill the screen; a narrower screen (B4, B5's middle pane) shows a part of it
    // as tall as the pitch, following the ball.
    const full = { x: PITCH.x - 10, y: PITCH.y - 6, w: PITCH.w + 20, h: PITCH.h + 12 };
    const w = Math.min(full.w, Math.round((full.h * S.w) / S.h));
    const crop = { ...full, w, x: Math.round(Math.min(full.x + full.w - w, Math.max(full.x, ballX - w / 2))) };
    g.globalAlpha = o.glass ? 0.9 : 1;
    g.drawImage(ground, crop.x, crop.y, crop.w, crop.h, S.x, S.y, S.w, S.h);
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(5,7,12,0.85)';
    g.fillRect(S.x, S.y + S.h - 12, S.w, 12);
    if (scorcher) sharpText(g, `SCORCHER · ${live.league.players[scorcher.scorerId].lastName.toUpperCase()}${wide ? ` · ${teams[scorcher.m.homeId].abbr} v ${teams[scorcher.m.awayId].abbr}` : ''}`, S.x + 4, S.y + S.h - 11, { size: 8, colour: '#ffd2a0' });
    if (o.glass) glassEdge(g, S);
    return;
  }
  g.fillStyle = o.glass ? 'rgba(13,20,48,0.74)' : '#0d1430';
  g.fillRect(S.x, S.y, S.w, S.h);
  g.fillStyle = PALETTE.accent;
  g.fillRect(S.x, S.y, S.w, 3);
  if (o.glass) glassEdge(g, S);
  if (screenShows === 'name') {
    const scale = blockWidth(NAME, 2) <= S.w - 10 ? 2 : 1;
    blockText(g, NAME, Math.round(S.x + S.w / 2 - blockWidth(NAME, scale) / 2), Math.round(S.y + S.h / 2 - 3 * scale), scale, '#ffd2a0');
    return;
  }
  sharpText(g, wide ? `THE TABLE · TODAY'S MOVES` : 'THE TABLE', S.x + 5, S.y + 6, { size: 8, colour: '#ffffff' });
  // As many rows as fit: the whole table, or its top and today's climber.
  const n = Math.max(1, Math.floor((S.h - 17) / 10));
  const rows = n >= moves.length ? moves : [...moves.slice(0, n - 1), moves.slice(n - 1).find((r) => r.teamId === climber.teamId) ?? moves[n - 1]];
  rows.forEach((r, i) => {
    const y = S.y + 17 + i * 10;
    const lit = r.teamId === climber.teamId && r.move > 0;
    sharpText(g, String(r.place), S.x + 6, y, { size: 8, colour: '#9aa1b2' });
    g.fillStyle = teams[r.teamId].colours.primary;
    g.fillRect(S.x + 16, y + 1, 3, 6);
    sharpText(g, wide ? teams[r.teamId].shortName : teams[r.teamId].abbr, S.x + 23, y, { size: 8, colour: lit ? '#ffd2a0' : '#cfe6ff' });
    sharpText(g, wide ? `${r.points} PTS` : String(r.points), S.x + S.w - (wide ? 66 : 40), y, { size: 8, colour: '#cfe6ff' });
    sharpText(g, r.move > 0 ? `▲${r.move}` : r.move < 0 ? `▼${-r.move}` : '–', S.x + S.w - 18, y, { size: 8, colour: r.move > 0 ? '#7fe08a' : r.move < 0 ? '#ff7a6a' : '#9aa1b2' });
  });
}
/** The Glass panel's edge: a thin light line round it. @param {CanvasRenderingContext2D} g @param {{ x: number, y: number, w: number, h: number }} S */
function glassEdge(g, S) {
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(S.x, S.y + S.h - 1, S.w, 1);
  g.fillRect(S.x, S.y, 1, S.h);
  g.fillRect(S.x + S.w - 1, S.y, 1, S.h);
}

// ---------------------------------------------------------------- the page

const K = 1.5;
/** A set on the page: the canvas, the bubble over the speaker, the lower third. @param {HTMLElement} into @param {Set} set */
function mount(into, set) {
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = `${set.name}: ${set.about}`;
  const box = document.createElement('div');
  box.className = 'set';
  const canvas = document.createElement('canvas');
  canvas.width = R.w;
  canvas.height = R.h;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  const lower = document.createElement('div');
  lower.className = 'lower';
  box.append(canvas, bubble, lower);
  fig.append(cap, box);
  into.append(fig);
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  g.imageSmoothingEnabled = false;
  return (/** @type {number} */ t) => {
    set.draw(g, t);
    const { line, since } = lineAt(t);
    const s = set.seats[line.who];
    bubble.textContent = line.say.slice(0, Math.ceil((since / 1000) * 25));
    // Kept inside the picture (a seat near the edge would push it off).
    Object.assign(bubble.style, { left: `${Math.min(R.w * K - 87, Math.max(87, s.x * K))}px`, top: `${(s.y - 4) * K}px` });
    const who = PAIR[line.who];
    lower.replaceChildren(Object.assign(document.createElement('b'), { textContent: `${NAME} · ` }), `${who.name.toUpperCase()} · ${who.role}`, Object.assign(document.createElement('span'), { textContent: line.show ? ` · ${line.show}` : '' }));
    Object.assign(lower.style, { left: `${(R.w / 2) * K}px`, top: `${set.lowerY * K}px` });
  };
}

const drawers = [mount(/** @type {HTMLElement} */ (document.getElementById('sets')), SET_A), mount(/** @type {HTMLElement} */ (document.getElementById('sets')), SET_B)];
for (const b of BOOTHS) drawers.push(mount(/** @type {HTMLElement} */ (document.getElementById('booths')), b));
const topicRow = /** @type {HTMLElement} */ (document.getElementById('topic'));
drawers.push(mount(/** @type {HTMLElement} */ (document.getElementById('sets')), SET_C));
const topicDraw = mount(topicRow, { ...SET_C, name: 'THE TABLE on set C', about: 'The topic as it would air: the screen carries the graphic while they talk.' });

// The screen's buttons for the topic.
const pick = /** @type {HTMLElement} */ (document.getElementById('screen'));
for (const [id, label] of /** @type {const} */ ([['table', 'THE TABLE (the graphic)'], ['clip', 'DID YOU SEE THAT? (the clip)'], ['name', 'Between topics (the name)']])) {
  const b = document.createElement('button');
  b.textContent = label;
  b.classList.toggle('on', id === screenShows);
  b.addEventListener('click', () => { screenShows = id; pick.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); });
  pick.append(b);
}

// The pair, magnified.
const pairBox = /** @type {HTMLElement} */ (document.getElementById('pair'));
PAIR.forEach((p, k) => {
  const fig = document.createElement('figure');
  const c = document.createElement('canvas');
  c.width = 60;
  c.height = 60;
  c.style.width = '180px';
  c.style.height = '180px';
  c.style.imageRendering = 'pixelated';
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = '#141a2a';
  g.fillRect(0, 0, 60, 60);
  drawFigure(g, 30, 8, 2, p.look, 'talk', 0, k === 0 ? 1 : -1, {});
  const cap = document.createElement('figcaption');
  cap.textContent = `${p.name.toUpperCase()} · ${p.role}: ${p.about}`;
  fig.append(c, cap);
  pairBox.append(fig);
});

// The draft topic as a transcript.
const tr = /** @type {HTMLElement} */ (document.getElementById('lines'));
for (const l of TALK) {
  const row = document.createElement('tr');
  for (const [text, cls] of [[PAIR[l.who].name.split(' ')[0].toUpperCase(), `who w${l.who}`], [l.say, ''], [l.show, 'show']]) {
    const td = document.createElement('td');
    td.className = cls;
    td.textContent = text;
    row.append(td);
  }
  tr.append(row);
}
/** @type {HTMLElement} */ (document.getElementById('when')).textContent = `seed "${SEED}", season ${season}, Thursday 21:00 (day 4); the scorcher on the screen: ${scorcher ? `${teams[scorcher.m.homeId].name} v ${teams[scorcher.m.awayId].name}` : 'none yet'}`;

function frame() {
  const t = performance.now();
  for (const d of drawers) d(t);
  topicDraw(t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- the lines (data/podcast.json, a draft for Tom)

// Every kind, who says it, when, its ways and its clips: a fixed line one clip, a {team} line one per team. Credits
// at about 0.43 a character (the analyst's batch: 10,900 characters, about 4,700 credits).
const draft = JSON.parse(await fetchText('data/podcast.json'));
const nTeams = Object.keys(teams).length;
/** @type {Record<string, { clips: number, chars: number }>} */
const per = { tamsin: { clips: 0, chars: 0 }, samir: { clips: 0, chars: 0 } };
const listing = /** @type {HTMLElement} */ (document.getElementById('draft'));
const table4 = document.createElement('table');
table4.innerHTML = '<tr><th>Kind</th><th>Who</th><th>When</th><th>Ways (said · on the pane)</th><th>Clips</th></tr>';
const longest = Object.values(teams).map((t) => spoken(t.id)).sort((a, b) => b.length - a.length)[0];
for (const [kind, def] of Object.entries(/** @type {Record<string, any>} */ (draft.lines))) {
  if (kind.startsWith('_')) continue; // a comment
  let n = 0;
  for (const w of def.ways) {
    const each = w.say.includes('{team}') ? nTeams : 1;
    n += each;
    per[def.who].clips += each;
    per[def.who].chars += each * w.say.replace('{team}', longest).length;
  }
  const row = document.createElement('tr');
  for (const [text, cls] of [[kind, 'kind'], [def.who === 'tamsin' ? 'TAMSIN' : 'SAMIR', `who w${def.who === 'tamsin' ? 0 : 1}`], [def.when ?? '', 'when'], [def.ways.map((/** @type {any} */ w) => `"${w.say}"${w.show ? ` · ${w.show}` : ''}`).join('  |  '), ''], [String(n), 'n']]) {
    const td = document.createElement('td');
    td.className = cls;
    td.textContent = text;
    row.append(td);
  }
  table4.append(row);
}
listing.append(table4);
const credits = (/** @type {number} */ chars) => Math.round((chars * 0.43) / 10) * 10;
const all = { clips: per.tamsin.clips + per.samir.clips, chars: per.tamsin.chars + per.samir.chars };
/** @type {HTMLElement} */ (document.getElementById('cost')).textContent = `In all: ${Object.keys(draft.lines).length} kinds; ${all.clips} clips, about ${all.chars.toLocaleString()} characters, about ${credits(all.chars).toLocaleString()} credits (Tamsin ${per.tamsin.clips} clips, about ${credits(per.tamsin.chars).toLocaleString()}; Samir ${per.samir.clips}, about ${credits(per.samir.chars).toLocaleString()}). A {team} line is voiced once per team (${nTeams}), counted at the longest name; the real count comes from npm run voices -- --count once the tool knows these lines.`;

// The discussions (Tom, 2026-10-20: after the hook, a longer back-and-forth on its theme), as transcripts by theme,
// each line one clip; the running cost of everything drafted so far.
const talks = /** @type {HTMLElement} */ (document.getElementById('discussions'));
let dLines = 0;
let dChars = 0;
for (const [themeId, theme] of Object.entries(/** @type {Record<string, any>} */ (draft.themes ?? {}))) {
  const h = document.createElement('h3');
  h.textContent = `${themeId.toUpperCase()} · led into by ${theme.hooks.join(', ')}`;
  talks.append(h);
  for (const id of theme.discussions) {
    const d = draft.discussions[id];
    const chars = d.lines.reduce((n, /** @type {any} */ l) => n + l.say.length, 0);
    dLines += d.lines.length;
    dChars += chars;
    const h4 = document.createElement('h4');
    h4.textContent = `${d.title} (${id}) · ${d.lines.length} lines · about ${Math.round(chars / 14 + d.lines.length * 0.6)} s`;
    const t = document.createElement('table');
    for (const l of d.lines) {
      const row = document.createElement('tr');
      for (const [text, cls] of [[l.who === 'tamsin' ? 'TAMSIN' : 'SAMIR', `who w${l.who === 'tamsin' ? 0 : 1}`], [`${l.tag ? `[${l.tag}] ` : ''}${l.say}`, ''], [l.gesture, 'when']]) {
        const td = document.createElement('td');
        td.className = cls;
        td.textContent = text;
        row.append(td);
      }
      t.append(row);
    }
    talks.append(h4, t);
  }
}
// The interjections: short back-channel reactions, one clip each.
const inter = /** @type {Record<string, string[]>} */ (draft.interjections ?? {});
const iClips = Object.values(inter).reduce((n, xs) => n + xs.length, 0);
const iChars = Object.values(inter).reduce((n, xs) => n + xs.join('').length, 0);
const ih = document.createElement('h3');
ih.textContent = "INTERJECTIONS · played softly under the other's longer lines";
talks.append(ih);
for (const [who, xs] of Object.entries(inter)) {
  const para = document.createElement('p');
  para.textContent = `${who.toUpperCase()}: ${xs.map((x) => `"${x}"`).join('  ')}`;
  talks.append(para);
}
const grand = all.chars + dChars + iChars;
/** @type {HTMLElement} */ (document.getElementById('talkCost')).textContent = `${Object.keys(draft.discussions ?? {}).length} discussions, ${dLines} lines (one clip each), about ${dChars.toLocaleString()} characters, about ${credits(dChars).toLocaleString()} credits; ${iClips} interjections, about ${credits(iChars).toLocaleString()}. The whole batch with the hooks above: about ${(all.clips + dLines + iClips).toLocaleString()} clips, about ${grand.toLocaleString()} characters, about ${credits(grand).toLocaleString()} credits (the plan: about 25,000), plus about 3,000 to try the voices first.`;
