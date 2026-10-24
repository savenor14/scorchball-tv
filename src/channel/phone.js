// The channel on a phone (phones, step 4, Task 278c; Tom's picks on phone.html, 2026-10-14; docs/channel.md §28):
// whether this screen is a phone, and which of the phone's controls go in which band beside the picture. Pure and
// DOM-free; overlays/phoneControls.js draws them.

/** A phone's screen is at most this many CSS pixels on its short side (a tablet's is 600 or more). */
export const PHONE_SHORT_SIDE = 500;

/**
 * Whether to lay the channel out for a phone: a touch screen (a coarse pointer) with a short side of at most
 * PHONE_SHORT_SIDE, unless `?phone=` says otherwise.
 * @param {{ coarse: boolean, screenW: number, screenH: number }} device  The screen's own size, not the window's.
 * @param {boolean | null} override  ?phone=1 (true) or ?phone=0 (false).
 */
export function isPhone({ coarse, screenW, screenH }, override) {
  if (override !== null) return override;
  return coarse && Math.min(screenW, screenH) <= PHONE_SHORT_SIDE;
}

/**
 * @typedef {'sound' | 'levels' | 'info' | 'audience' | 'fullscreen' | 'layout' | 'stats' | 'table' | 'top' | 'week' | 'guide' | 'rulebook' | 'chronicle'} PhoneButton
 */

/**
 * The phone's controls in the bands either side of the picture (Tom's pick B, the corners): on the left, sound and its
 * levels at the top and the layout at the bottom, where the desktop has them by the scorebug, with INFO and AUDIENCE
 * between in Full (the least immersive, moved from the right to make room); on the right, in Full only, the side panel's
 * views and the sport's panes. Broadcast has sound and the layout only.
 * @param {'full' | 'broadcast'} layout
 * @param {{ fullscreen: boolean }} o  fullscreen: the browser can go full screen (the button's shown).
 * @returns {{ left: { top: PhoneButton[], bottom: PhoneButton[] }, right: PhoneButton[] }}
 */
export function phoneBands(layout, { fullscreen }) {
  const full = layout === 'full';
  return {
    left: { top: ['sound', 'levels', ...(full ? /** @type {PhoneButton[]} */ (['info', 'audience']) : [])], bottom: [...(fullscreen ? /** @type {PhoneButton[]} */ (['fullscreen']) : []), 'layout'] },
    right: full ? ['stats', 'table', 'top', 'week', 'guide', 'rulebook', 'chronicle'] : [],
  };
}

/**
 * How tall each button in a band is: as tall as fits, between `min` and `max`.
 * @param {number} height  The band's height (the screen's). @param {number} count @param {number} [min] @param {number} [max]
 */
export function buttonHeight(height, count, min = 32, max = 48) {
  if (count === 0) return max;
  return Math.max(min, Math.min(max, Math.floor((height - 8) / count)));
}
