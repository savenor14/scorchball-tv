// The light by the time of day (Tom's note 14; picked on groundstour.html; docs/channel.md §31). The league's clock
// (live.timeZone) says how dark it is: day, dusk, night, dusk again at dawn, easing from one to the next over
// lighting.easeMinutes centred on each change. lightAt is pure (the same on every screen at the same moment); drawLight
// lays the light over the ground, and in Broadcast over the stands, with the floodlights' lamps lit from dusk.
//
//   level  0 day, 1 dusk, 2 night (in between while easing)
//   the tint multiplies the picture: around the ground (Broadcast's stands, fading in with them) and on the ground
//   (its turf below the boards too, and in Full the turf down to the ticker), eased toward none by lighting.strength
//   the pools: each floodlight's light falling on the ground toward the middle ('lighter'), kept to the ground
//   the lamps: on the mounts in the stands' corners (stands.js), off by day, lit and glowing from dusk
//
// Only the ground is lit: the studio, the scene, the ads and the cards are drawn over it as ever.
import { lightLevel, minuteOfDay } from './daylight.js';
import { PALETTE } from './palette.js';
import { PITCH } from './pitch.js';
import { floodlights, GROUND, GROUND_TURF } from './stands.js';
import { FULL_TURF } from './strips.js';

export { lightLevel };

/**
 * @typedef {{ around: string, ground: string, pool: number, glow: number }} Tint
 * @typedef {{ on: boolean, dayFrom: string, duskFrom: string, nightFrom: string, dawnFrom: string, easeMinutes: number, strength: number, dusk: Tint, night: Tint }} LightingSettings
 * @typedef {object} Light  The light at a moment.
 * @property {number} level  0 day, 1 dusk, 2 night.
 * @property {string | null} around  The tint round the ground (null by day).
 * @property {string | null} ground  The tint on the ground (null by day).
 * @property {number} pool  The pools' strength (alpha at their centres).
 * @property {number} glow  The glow round each lamp (alpha at its centre).
 * @property {number} lamps  How lit the lamps are, 0 off → 1 on.
 * @property {string} lamp  The lamps' colour.
 */

/** How far into the pitch, from each floodlight toward the centre, its pool of light falls (a share of the way). */
const POOL_REACH = 0.38;
/** A pool's radius, and a lamp's glow (stage px). */
const POOL_R = 150;
const GLOW_R = 26;

/** Two colours mixed, `f` of the way from a to b. @param {string} a @param {string} b @param {number} f */
function mix(a, b, f) {
  const ca = parseInt(a.slice(1), 16);
  const cb = parseInt(b.slice(1), 16);
  const ch = [16, 8, 0].map((k) => Math.round(((ca >> k) & 255) + (((cb >> k) & 255) - ((ca >> k) & 255)) * f));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
/** A number `f` of the way from a to b. @param {number} a @param {number} b @param {number} f */
const lerp = (a, b, f) => a + (b - a) * f;

/**
 * The light at instant `t`.
 * @param {number} t  ms since the epoch.
 * @param {number} offset  The league's time zone's offset from UTC at `t`, ms (calendar.js zoneOffsets().offsetAt).
 * @param {LightingSettings} s
 * @returns {Light}
 */
export function lightAt(t, offset, s) {
  const level = lightLevel(minuteOfDay(t, offset), s);
  const white = '#ffffff';
  /** A tint's colour at this level, eased toward none by strength. @param {'around' | 'ground'} k */
  const tint = (k) => mix(white, level <= 1 ? mix(white, s.dusk[k], level) : mix(s.dusk[k], s.night[k], level - 1), s.strength);
  const by = (/** @type {'pool' | 'glow'} */ k) => (level <= 1 ? lerp(0, s.dusk[k], level) : lerp(s.dusk[k], s.night[k], level - 1));
  return {
    level,
    around: level > 0 ? tint('around') : null,
    ground: level > 0 ? tint('ground') : null,
    pool: by('pool') * s.strength,
    glow: by('glow'),
    lamps: Math.min(1, level),
    lamp: level <= 1 ? mix(PALETTE.lampOff, PALETTE.lampDusk, level) : mix(PALETTE.lampDusk, PALETTE.lampNight, level - 1),
  };
}

/**
 * The lit ground (stage px): the ground's rectangle and its turf, below the boards in Broadcast, down to the ticker in
 * Full, between the two while the layout slides.
 * @param {number} shift  Where the ground is now. @param {number} stands  Broadcast's stands, 0 (Full) → 1.
 */
function litGround(shift, stands) {
  const bottom = lerp(FULL_TURF.y + FULL_TURF.h, GROUND_TURF.y + GROUND_TURF.h, stands);
  return { x: shift, y: GROUND.top, w: GROUND.w, h: Math.round(bottom) - GROUND.top };
}

/**
 * Lay the light over the picture: call with no transform, after the ground, the strips and the stands, before the
 * scene. By day only the lamps (off) are drawn, in Broadcast.
 * @param {CanvasRenderingContext2D} ctx @param {Light} L
 * @param {{ shift: number, standsShift: number, stands: number }} o  shift: where the ground is now; standsShift: where
 *   the stands are laid out for (broadcast.shiftPx); stands: how far in Broadcast's stands are, 0 (Full) → 1, or 0 if none.
 */
export function drawLight(ctx, L, { shift, standsShift, stands }) {
  const lit = litGround(shift, stands);
  const lamps = floodlights(standsShift);
  const { width: W, height: H } = ctx.canvas;
  if (L.ground && L.around) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    if (stands > 0) {
      ctx.globalAlpha = stands;
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.rect(lit.x, lit.y, lit.w, lit.h);
      ctx.fillStyle = L.around;
      ctx.fill('evenodd');
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = L.ground;
    ctx.fillRect(lit.x, lit.y, lit.w, lit.h);
    // Each floodlight's pool of light, toward the middle of the pitch, kept to the ground.
    if (L.pool > 0) {
      ctx.beginPath();
      ctx.rect(lit.x, lit.y, lit.w, lit.h);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const centre = { x: shift + PITCH.x + PITCH.w / 2, y: PITCH.y + PITCH.h / 2 };
      for (const p of lamps) {
        const px = p.x + (centre.x - p.x) * POOL_REACH;
        const py = p.y + (centre.y - p.y) * POOL_REACH;
        const g = ctx.createRadialGradient(px, py, 0, px, py, POOL_R);
        g.addColorStop(0, `rgb(255 240 200 / ${L.pool.toFixed(3)})`);
        g.addColorStop(1, 'rgb(255 240 200 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(lit.x, lit.y, lit.w, lit.h);
      }
    }
    ctx.restore();
  }
  if (stands <= 0) return;
  // The lamps on their mounts, with a glow once lit.
  ctx.save();
  ctx.globalAlpha = stands;
  for (const p of lamps) {
    if (L.lamps > 0 && L.glow > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, GLOW_R);
      g.addColorStop(0, `rgb(255 244 200 / ${(L.glow * L.lamps).toFixed(3)})`);
      g.addColorStop(1, 'rgb(255 244 200 / 0)');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - GLOW_R, p.y - GLOW_R, 2 * GLOW_R, 2 * GLOW_R);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = PALETTE.mountFrame;
    ctx.fillRect(p.x - 6, p.y - 4, 13, 8);
    ctx.fillStyle = L.lamp;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) ctx.fillRect(p.x - 5 + i * 3, p.y - 2 + j * 3, 2, 2);
  }
  ctx.restore();
}

/**
 * The light on a picture of the pitch alone (the replay inset): its tint, and the pools as an even lift.
 * @param {CanvasRenderingContext2D} ctx @param {Light} L
 */
export function lightPitch(ctx, L) {
  if (!L.ground) return;
  const { width: W, height: H } = ctx.canvas;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = L.ground;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgb(255 240 200 / ${(L.pool / 2).toFixed(3)})`;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}
