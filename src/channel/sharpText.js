// Sharp text (Task 200, Tom: every graphic's text as crisp as the ticker's, in VT323). The stage is drawn at 480 × 270
// and scaled up, so text drawn into it goes soft; a picture can bind a second canvas over it at the size it's shown
// (its "sharp layer"), and the scenes draw their text through here: onto the layer, with the picture's own position,
// scale, fade and colour, or straight into the picture when it has no layer (dev pages, offscreen pictures).
// Lettering painted into the world (the turf's name, FINALS on the pitch, a shirt's letters, a book's cover) stays
// pixel art and doesn't come through here.
//
// Each frame the channel clears the layer before drawing; anything the picture draws over text afterwards (a
// transition) would be hidden by the layer, so before a transition it bakes the layer into the picture (sharpBake).

/** @type {WeakMap<CanvasRenderingContext2D, { layer: CanvasRenderingContext2D }>} */
const layers = new WeakMap();
/** @type {((ms: number) => void) | null} Told how long the sharp text takes (the phone readout, ?perf=1). */
let meter = null;

/** Time the sharp text for the phone readout (?perf=1), or stop (null). @param {((ms: number) => void) | null} m */
export function meterSharp(m) {
  meter = m;
}

/**
 * Give a picture a sharp layer: a canvas laid exactly over it, any size (its width over the picture's is the scale).
 * @param {CanvasRenderingContext2D} ctx  The picture's. @param {CanvasRenderingContext2D | null} layer  null unbinds.
 */
export function bindSharp(ctx, layer) {
  if (layer) layers.set(ctx, { layer });
  else layers.delete(ctx);
}

/** Clear a picture's sharp layer (at the start of each frame). @param {CanvasRenderingContext2D} ctx */
export function sharpClear(ctx) {
  const b = layers.get(ctx);
  if (!b) return;
  const began = meter ? performance.now() : 0;
  b.layer.setTransform(1, 0, 0, 1, 0, 0);
  b.layer.clearRect(0, 0, b.layer.canvas.width, b.layer.canvas.height);
  meter?.(performance.now() - began);
}

/**
 * Copy the sharp layer into the picture and clear it, so what's drawn next (a transition) covers the text as it
 * covers everything else. The text is soft for those moments, as it would have been.
 * @param {CanvasRenderingContext2D} ctx
 */
export function sharpBake(ctx) {
  const b = layers.get(ctx);
  if (!b) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(b.layer.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  sharpClear(ctx);
}

/**
 * Text in VT323, sharp on the picture's layer if it has one.
 * @param {CanvasRenderingContext2D} ctx @param {string} s @param {number} x @param {number} y
 * @param {{ size?: number, colour?: string, align?: CanvasTextAlign, baseline?: CanvasTextBaseline, max?: number, bold?: boolean }} [o]
 */
export function sharpText(ctx, s, x, y, { size = 10, colour = '#ffffff', align = 'left', baseline = 'top', max, bold = false } = {}) {
  const b = layers.get(ctx);
  const target = b ? b.layer : ctx;
  const began = meter ? performance.now() : 0;
  if (b) {
    // The picture's transform, scaled up to the layer's size.
    const k = b.layer.canvas.width / ctx.canvas.width;
    const m = ctx.getTransform();
    b.layer.save();
    b.layer.setTransform(m.a * k, m.b * k, m.c * k, m.d * k, m.e * k, m.f * k);
    b.layer.globalAlpha = ctx.globalAlpha;
  }
  target.font = `${bold ? 'bold ' : ''}${size}px "VT323"`;
  target.textBaseline = baseline;
  target.textAlign = align;
  target.fillStyle = colour;
  if (max) target.fillText(s, x, y, max);
  else target.fillText(s, x, y);
  if (b) b.layer.restore();
  meter?.(performance.now() - began);
}

/** VT323's capital height as a share of its size, measured once (about 0.6). */
let capShare = 0;
/** @param {CanvasRenderingContext2D} ctx */
function capOf(ctx) {
  if (!capShare) {
    ctx.save();
    ctx.font = '100px "VT323"';
    const h = ctx.measureText('H').actualBoundingBoxAscent;
    ctx.restore();
    capShare = h > 20 && h < 100 ? h / 100 : 0.6;
  }
  return capShare;
}

/**
 * How wide sharpBlock draws `text` at `scale`, in the picture's pixels (VT323 runs narrower than the block letters'
 * 6 a character, so placing by blockWidth leaves gaps; Tom, after Task 258: the playoffs promo's still).
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} scale
 */
export function sharpBlockWidth(ctx, text, scale) {
  const size = Math.round((6 * scale) / capOf(ctx));
  ctx.save();
  ctx.font = `${size}px "VT323"`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

/**
 * Big capitals in place of the pixel block letters (sceneArt.js blockText) on graphics: VT323 sized so its capitals
 * stand as tall as the blocks (6 rows × `scale`), centred on the blocks' box (`x` its left edge, `y` its top, as
 * blockText takes them), or from its left edge (`left`).
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y @param {number} scale
 * @param {string} colour @param {boolean} [left]
 */
export function sharpBlock(ctx, text, x, y, scale, colour, left = false) {
  const cap = capOf(ctx);
  const size = Math.round((6 * scale) / cap);
  const width = (text.length * 6 - 1) * scale;
  sharpText(ctx, text, left ? x : x + width / 2, y + 6 * scale, { size, colour, align: left ? 'left' : 'center', baseline: 'alphabetic' });
}
