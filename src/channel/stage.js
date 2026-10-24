// The 16:9 stage: a small logical pixel grid scaled up to fill the window (Task 277c, Tom: whole numbers only, for
// even pixels, left wide empty borders; the unevenness isn't noticeable) (docs/channel.md §2). The canvas and the HTML overlays share one coordinate system: "stage pixels".
// Overlays size themselves with CSS calc(var(--px) * N), where --px is the current scale in CSS pixels.
import { bindSharp } from './sharpText.js';

export const STAGE_WIDTH = 480;
export const STAGE_HEIGHT = 270;

/**
 * The scale that fills the window (Task 277c), the picture's pixels a little uneven; without `fill` (?fit=whole on the
 * dev server, to compare), the largest whole number that fits, or a fraction below 1 on very small windows.
 * @param {number} width @param {number} height  Available CSS pixels. @param {boolean} [fill]
 */
export function stageScale(width, height, fill = true) {
  const fit = Math.min(width / STAGE_WIDTH, height / STAGE_HEIGHT);
  return fit >= 1 && !fill ? Math.floor(fit) : fit;
}

/**
 * Size the stage to the window now and whenever it changes.
 * @param {HTMLElement} stage  The element holding the canvas and overlays.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLCanvasElement} [sharp]  The sharp text layer over it (Task 200; sharpText.js), sized to the screen pixels
 *   the stage covers, and bound to the picture.
 * @param {{ fill?: boolean }} [o]  fill: fill the window (stageScale).
 * @returns {CanvasRenderingContext2D} Drawn in stage pixels.
 */
export function mountStage(stage, canvas, sharp, { fill = true } = {}) {
  canvas.width = STAGE_WIDTH;
  canvas.height = STAGE_HEIGHT;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  ctx.imageSmoothingEnabled = false;

  const fit = () => {
    const scale = stageScale(window.innerWidth, window.innerHeight, fill);
    stage.style.setProperty('--px', `${scale}px`);
    stage.style.width = `${STAGE_WIDTH * scale}px`;
    stage.style.height = `${STAGE_HEIGHT * scale}px`;
    if (sharp) {
      // As many device pixels as the stage covers, at least the stage's own.
      const k = Math.max(1, Math.round(scale * (window.devicePixelRatio || 1)));
      sharp.width = STAGE_WIDTH * k;
      sharp.height = STAGE_HEIGHT * k;
    }
  };
  fit();
  window.addEventListener('resize', fit);
  if (sharp) bindSharp(ctx, /** @type {CanvasRenderingContext2D} */ (sharp.getContext('2d')));
  return ctx;
}
