// The on-pitch callout bubble over a player (what it says comes from callouts.js), plus a SUB ON bubble for each team's
// player coming on (Task 41), which can show at the same time. Positioned in stage pixels.
import { PITCH, SPRITE_H } from '../pitch.js';
import { $, setText } from './dom.js';

/** Keep the bubble's centre this far inside the pitch's left and right edges (stage px). */
const EDGE = 16;
/** The bubble's tail sits this far above the player's feet (stage px): just over the head. */
const LIFT = SPRITE_H + 2;

/**
 * @typedef {{ c: import('../callouts.js').Callout, at: { x: number, y: number } | null, edge: string }} Bubble
 *   at: where it's pointing, in stage pixels (the player's feet or the ball); edge: the team's shirt in this match.
 */

export function createCallout() {
  const box = $('callout');
  // Two more boxes like it, for the SUB ON bubbles (one per team).
  const subBoxes = [0, 1].map(() => {
    const b = /** @type {HTMLElement} */ (box.cloneNode(false));
    b.removeAttribute('id');
    b.hidden = true;
    /** @type {HTMLElement} */ (box.parentElement).append(b);
    return b;
  });

  /** @param {HTMLElement} b @param {Bubble | null} bubble */
  const place = (b, bubble) => {
    if (!bubble?.c || !bubble.at) {
      b.hidden = true;
      return;
    }
    const { c, at, edge } = bubble;
    b.hidden = false;
    if (b.dataset.key !== c.key) {
      b.dataset.key = c.key;
      b.className = `overlay callout ${c.kind}`;
      setText(b, c.text);
      b.style.setProperty('--edge', edge);
    }
    const x = Math.min(PITCH.x + PITCH.w - EDGE, Math.max(PITCH.x + EDGE, at.x));
    b.style.left = `calc(var(--px) * ${x})`;
    b.style.top = `calc(var(--px) * ${at.y - LIFT})`;
    // Pop in over the first tenth, fade out over the last fifth.
    const pop = Math.min(1, c.f * 10);
    b.style.opacity = String(Math.min(1, (1 - c.f) * 5));
    b.style.transform = `translate(-50%, -100%) scale(${0.6 + 0.4 * pop})`;
  };

  return {
    /**
     * @param {import('../callouts.js').Callout | null} c
     * @param {{ x: number, y: number } | null} at  Where it's pointing, in stage pixels (the player's feet or the ball).
     * @param {string} edge  Border colour: the team's shirt in this match.
     * @param {Bubble[]} [subs]  SUB ON bubbles; none when left out.
     */
    show(c, at, edge, subs = []) {
      place(box, c ? { c, at, edge } : null);
      subBoxes.forEach((b, i) => place(b, subs[i] ?? null));
    },
  };
}
