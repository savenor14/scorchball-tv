// The tour (Milestone 5⅞; docs/channel.md §26): the parts with no DOM. Which steps show (the desktop's or the phone's,
// Fan Coins' only while they're on), where a step's box goes beside what it points at (on the stage, or on a phone in
// its own pixels over the picture), and whether this browser has been offered the tour (taken, finished or turned
// down, it's never offered again).

/** The stage, in stage px, and the box's width and gaps. */
const STAGE = { width: 480, height: 270, bottom: 236 };
export const BOX_WIDTH = 150;
const GAP = 8;
const EDGE = 4;
/** Something taller than this gets its box beside it (the side panel), not above or below. */
const TALL = 120;

/** Where the browser keeps that the tour has been offered. */
export const TOUR_KEY = 'scorchball.tour';

/**
 * @typedef {{ left: number, top: number, right: number, bottom: number }} Rect  In stage px.
 * @typedef {{ left: number, top: number, arrow: 'up' | 'down' | 'right', arrowAt: number }} Place  The box's corner;
 *   the arrow's side and its offset along that side (from the box's left for up and down, its top for right).
 */

/**
 * The box's place by `r`: below it if there's room above the caption's line, else above it; to its left if it's tall.
 * Kept on the stage.
 * @param {Rect} r @param {number} height  The box's height, stage px.
 * @returns {Place}
 */
export function placeBox(r, height) {
  const centre = (r.left + r.right) / 2;
  if (r.bottom - r.top > TALL) {
    const top = Math.max(EDGE, Math.min(r.top + 30, STAGE.height - height - EDGE));
    return { left: Math.max(EDGE, r.left - BOX_WIDTH - GAP), top, arrow: 'right', arrowAt: Math.max(EDGE, r.top + 40 - top) };
  }
  const left = Math.max(EDGE, Math.min(STAGE.width - BOX_WIDTH - EDGE, centre - BOX_WIDTH / 2));
  const arrowAt = Math.max(EDGE, Math.min(BOX_WIDTH - 12, centre - left - 4));
  if (r.bottom + GAP + height <= STAGE.bottom) return { left, top: r.bottom + GAP, arrow: 'up', arrowAt };
  return { left, top: Math.max(EDGE, r.top - GAP - height), arrow: 'down', arrowAt };
}

/**
 * The steps to show: the desktop's or the phone's own (the tour, round 2, Tom 2026-10-17: fewer, pointing at the bands),
 * Fan Coins' only while they're on (off at the launch).
 * @template {{ coins?: boolean }} S
 * @param {{ steps: S[], phone: { steps: S[] } }} tour @param {{ phone: boolean, coins: boolean }} o
 * @returns {S[]}
 */
export function tourSteps(tour, { phone, coins }) {
  return (phone ? tour.phone.steps : tour.steps).filter((s) => coins || !s.coins);
}

/** On a phone, in CSS px: the box's width at most, and its gaps from the picture's edge and from what it points at. */
export const PHONE_BOX = { width: 260, edge: 6, gap: 14, below: 12, arrow: 8 };

/**
 * On a phone (Tom's pick A on tour.html, round 2): the box over the picture beside what it points at, in the page's
 * CSS px. Left of something in the right-hand band, right of something in the left-hand band (its arrow pointing out at
 * it, level with its middle), below anything on the picture. Kept on the picture.
 * @param {Rect} r  What it points at. @param {Rect} pic  The picture (the stage). @param {number} width @param {number} height
 * @returns {{ left: number, top: number, arrow: 'up' | 'left' | 'right', arrowAt: number }}
 */
export function placePhoneBox(r, pic, width, height) {
  const { edge, gap, below, arrow } = PHONE_BOX;
  const mid = (r.top + r.bottom) / 2;
  const level = () => Math.max(pic.top + edge, Math.min(pic.bottom - height - edge, mid - height / 2));
  const along = (/** @type {number} */ at, /** @type {number} */ size) => Math.max(arrow, Math.min(size - 3 * arrow, at - arrow));
  if (r.left >= pic.right - 1) {
    const top = level();
    return { left: pic.right - width - gap, top, arrow: 'right', arrowAt: along(mid - top, height) };
  }
  if (r.right <= pic.left + 1) {
    const top = level();
    return { left: pic.left + gap, top, arrow: 'left', arrowAt: along(mid - top, height) };
  }
  const left = Math.max(pic.left + edge, Math.min(pic.right - width - edge, r.left));
  return { left, top: r.bottom + below, arrow: 'up', arrowAt: along((r.left + r.right) / 2 - left, width) };
}

/** The smallest rect holding them all. @param {Rect[]} rects @returns {Rect} */
export function union(rects) {
  return {
    left: Math.min(...rects.map((x) => x.left)),
    top: Math.min(...rects.map((x) => x.top)),
    right: Math.max(...rects.map((x) => x.right)),
    bottom: Math.max(...rects.map((x) => x.bottom)),
  };
}

/** Whether this browser has been offered the tour. Where storage is blocked: no, so it's offered each visit. @param {Storage | null} storage */
export function tourOffered(storage) {
  try {
    return !!storage?.getItem(TOUR_KEY);
  } catch {
    return false;
  }
}

/** Remember it was offered (taken, finished or turned down). @param {Storage | null} storage @param {string} how */
export function markOffered(storage, how) {
  try {
    storage?.setItem(TOUR_KEY, how);
  } catch {
    // Blocked: it'll be offered again next visit.
  }
}
