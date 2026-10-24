// The player-of-the-match interview (Task 100; docs/channel.md §16.8): Tom's pick of set A, the board. The player
// alone in front of a board printed with the ball mark and the channel's orange, in the kit they wore (short sleeves,
// shorts and legs; no reporter's arm, the interviewer is out of frame), the stat line in a caption bar edged in the
// team's colour, the quote typing out, and RECORDED with when it was played in re-airs. It fills the ground in Full
// and the whole screen in Broadcast. interviewLayout, interviewPose, playerLook and recordedMark are pure; the draw
// functions are canvas only.
import { interviewClipKey } from './speech.js';
import { createRng } from '../sim/rng.js';
import { keeperShirt, skinOf } from './pitch.js';
import { ballMark, drawFigure } from './studioSet.js';
import { PALETTE } from './palette.js';

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {import('./studioSet.js').Look} Look
 * @typedef {import('./studioSet.js').Pose} Pose
 * @typedef {{ scale: number, player: { x: number, y: number, bottom: number }, bubble: { x: number, y: number, w: number },
 *   lower: { x: number, y: number, w: number, h: number }, badge: { x: number, y: number }, rec: { right: number, y: number } }} InterviewLayout
 *   player: the top of their head (centred) and how far down the frame they go; bubble: its top-left and width (its
 *   tail points right, at the player); lower: the caption bar; badge: PLAYER OF THE MATCH above it; rec: the RECORDED
 *   mark's right edge and top.
 */

/** The bubble's width, stage px (as the studio's). */
const BUBBLE_W = 150;
/**
 * How much of the player shows below the shirt, in figure rows (the shorts and the legs to just below the knee), so the
 * figure stands this low in the frame (Task 189, Tom's framing B: the legs felt long, about 24 rows before). The
 * figure's head and shirt are 22 rows.
 */
const LEG_ROWS = 19;
const SHIRT_ROWS = 22;

/**
 * Where everything goes in a rect (the ground in Full, the whole screen in Broadcast). The player is drawn at a
 * whole-number scale, 5× on the whole screen and 4× on the ground, so the pixels stay square.
 * @param {Rect} R
 * @returns {InterviewLayout}
 */
export function interviewLayout(R) {
  const whole = R.h >= 250;
  const scale = whole ? 5 : 4;
  return {
    scale,
    player: { x: R.x + Math.round(R.w * 0.62), y: R.y + R.h - (SHIRT_ROWS + LEG_ROWS) * scale, bottom: R.y + R.h },
    bubble: { x: R.x + (whole ? 24 : 14), y: R.y + (whole ? 40 : 28), w: BUBBLE_W },
    lower: { x: R.x + 10, y: R.y + R.h - 58, w: 200, h: 44 },
    badge: { x: R.x + 10, y: R.y + R.h - 70 },
    // On the whole screen, clear of the button row in the top-right corner.
    rec: { right: R.x + R.w - (whole ? 50 : 8), y: R.y + (whole ? 28 : 8) },
  };
}

/**
 * @typedef {{ parts: { from: number, until: number, before: number, chars: number }[], ms: number, total: number }} QuoteSchedule
 *   Each part's start and end (ms after the quote begins), how much is typed before it and its length; the whole
 *   quote's length in ms and characters.
 */

/**
 * The interview's quote in parts (Task 247a: a reaction, then a fact; or one canned quote), each its own clip: each part
 * as long as its clip (or typed at `usualCps` without one), `gapMs` between them. The quote shown is the parts joined
 * by a space.
 * @param {{ chars: number, seconds: number | null }[]} parts @param {number} usualCps @param {number} gapMs
 * @returns {QuoteSchedule}
 */
export function quoteSchedule(parts, usualCps, gapMs) {
  let at = 0;
  let typed = 0;
  const out = parts.map((p, i) => {
    if (i > 0) {
      at += gapMs;
      typed += 1;
    }
    const ms = (p.seconds && p.seconds > 0.3 ? p.seconds : p.chars / usualCps) * 1000;
    const part = { from: at, until: at + ms, before: typed, chars: p.chars };
    at += ms;
    typed += p.chars;
    return part;
  });
  return { parts: out, ms: at, total: typed };
}

/**
 * An interview card's parts as quoteSchedule takes them: each part's length and its clip's length, if it has one
 * (assets/voices/lengths.json, or `seconds` for a clip loaded but not listed).
 * @param {{ parts: { text: string, key: string }[], voice: string | null }} card @param {Record<string, number>} lengths
 * @param {(key: string) => number | null} [seconds]
 */
export function interviewParts(card, lengths, seconds = () => null) {
  return card.parts.map((p) => {
    const key = card.voice ? interviewClipKey(card.voice, p.key) : null;
    return { chars: p.text.length, seconds: key ? lengths[key] ?? seconds(key) : null };
  });
}

/** How much of a quote in parts is typed `t` ms after it begins. @param {QuoteSchedule} s @param {number} t */
export function charsAt(s, t) {
  for (const p of s.parts) {
    if (t < p.from) return p.before;
    if (t < p.until) return p.before + Math.floor(((t - p.from) / (p.until - p.from)) * p.chars);
  }
  return s.total;
}

/**
 * What the player is doing `since` ms in: listening to the (unheard) question and nodding for `delayMs`, then talking
 * while the quote types, then resting with a nod now and then (every third `nodEveryMs`).
 * @param {number} since @param {number} quoteLength  Characters.
 * @param {{ delayMs: number, charsPerSecond: number, nodEveryMs: number, schedule?: QuoteSchedule }} o  With a
 *   schedule (Task 247a), the quote is typed part by part, as quoteSchedule laid it out.
 * @returns {{ pose: Pose, mouth: boolean, chars: number }}  chars: how much of the quote is typed.
 */
export function interviewPose(since, quoteLength, o) {
  if (since < o.delayMs) return { pose: 'nod', mouth: false, chars: 0 };
  if (o.schedule) {
    // In parts (Task 247a): each typed over its clip, a short pause between them.
    const t = since - o.delayMs;
    const chars = charsAt(o.schedule, t);
    if (t < o.schedule.ms) return { pose: 'talk', mouth: o.schedule.parts.some((p) => t >= p.from && t < p.until), chars };
    return { pose: Math.floor((t - o.schedule.ms) / o.nodEveryMs) % 3 === 1 ? 'nod' : 'rest', mouth: false, chars };
  }
  const chars = Math.min(quoteLength, Math.floor(((since - o.delayMs) / 1000) * o.charsPerSecond));
  if (chars < quoteLength) return { pose: 'talk', mouth: true, chars };
  const after = since - o.delayMs - (quoteLength / o.charsPerSecond) * 1000;
  return { pose: Math.floor(after / o.nodEveryMs) % 3 === 1 ? 'nod' : 'rest', mouth: false, chars };
}

/**
 * The player as a figure: the skin tone their sprite has on the pitch, seeded hair (from the presenters' looks), and
 * the kit they wore in that match (clash kits included; a keeper in their keeper's shirt, trimmed in the team's colour,
 * as on the pitch).
 * @param {string} playerId @param {{ primary: string, secondary: string }} kit  Their side's kit in that match.
 * @param {{ keeper: boolean, side: 'home' | 'away' }} who
 * @param {{ hair: string[], hairStyles: ('short' | 'long' | 'bun')[] }} looks  studio.looks
 * @returns {Look}
 */
export function playerLook(playerId, kit, who, looks) {
  const rng = createRng(`hair|${playerId}`);
  const worn = who.keeper ? { primary: keeperShirt(who.side), secondary: kit.primary } : { primary: kit.primary, secondary: kit.secondary };
  return { jacket: worn.primary, tie: worn.secondary, skin: skinOf(playerId), hair: rng.pick(looks.hair), style: rng.pick(looks.hairStyles), kit: worn };
}

/**
 * The RECORDED mark: in re-airs only, with when the match was played.
 * @param {boolean} reair @param {number} kickoff @param {(t: number) => string} formatTime
 */
export function recordedMark(reair, kickoff, formatTime) {
  return reair ? `RECORDED · ${formatTime(kickoff)}` : null;
}

/**
 * The board behind the player: ball marks and orange patches on dark, in a staggered grid, with studio light falling
 * from the left.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R
 */
export function drawBoard(ctx, R) {
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(R.x, R.y, R.w, R.h);
  for (let j = 0; j * 30 < R.h + 30; j++) {
    for (let i = 0; i * 40 < R.w + 40; i++) {
      const x = R.x + i * 40 + (j % 2 ? 20 : 0) - 10;
      const y = R.y + j * 30 + 6;
      if ((i + j) % 2) ballMark(ctx, x + 10, y + 8, 5);
      else {
        ctx.fillStyle = 'rgba(255,182,39,0.85)';
        ctx.fillRect(x + 4, y + 5, 12, 6);
      }
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.beginPath();
  ctx.moveTo(R.x, R.y);
  ctx.lineTo(R.x + 140, R.y);
  ctx.lineTo(R.x + 60, R.y + R.h);
  ctx.lineTo(R.x, R.y + R.h);
  ctx.closePath();
  ctx.fill();
}

/**
 * The interview's picture in a rect: the board, and the player facing the interviewer off to the left.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {Look} look
 * @param {{ pose: Pose, mouth: boolean }} now @param {number} beat  0/1, the animation's beat.
 * @param {{ badge?: (cx: number, cy: number) => void }} [o]  badge: the team's crest on the shirt (Task 165).
 */
export function drawInterview(ctx, R, look, now, beat, o = {}) {
  const L = interviewLayout(R);
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  drawBoard(ctx, R);
  drawFigure(ctx, L.player.x, L.player.y, L.scale, look, now.pose, beat, -1, { toBottom: L.player.bottom, mouth: now.mouth, badge: o.badge });
  ctx.restore();
}
