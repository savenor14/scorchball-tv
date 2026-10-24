// Tooltips in the channel's look (Task 277b, Tom: the browser's own were out of place). Every `title` inside the stage
// is moved to `data-tip` as it's set (so the browser shows nothing), and hovering an element with one shows it on a
// plate inside the stage, in stage pixels, under the element (above it in the stage's lower half), kept inside the stage. A key
// in brackets at the end ("Sound (M)") is shown as a key cap. Mock-ups of its looks: tooltips.html (Tom's pick: B, amber).

/** @typedef {'plate' | 'amber' | 'caption'} TipLook */

const SHOW_MS = 350;
const MARGIN = 2; // stage px from the stage's edge
const GAP = 2; // stage px from the element

/**
 * The text and its key: "Schedule: today on the channel (V)" → ["Schedule: today on the channel", "V"].
 * @param {string} text @returns {[string, string | null]}
 */
export function splitKey(text) {
  const m = /^(.*?)\s*\(([^()]{1,5})\)$/.exec(text.trim());
  return m ? [m[1], m[2]] : [text.trim(), null];
}

/**
 * Install the tooltips in a stage.
 * @param {HTMLElement} stage  #stage. @param {TipLook} [look]
 * @returns {{ pin: (el: Element | null) => void, look: (l: TipLook) => void }}  `pin`: show one element's tip and keep
 *   it (the mock-ups' frozen pictures); null lets go. `look`: change the look.
 */
export function installTooltips(stage, look = 'plate') {
  const doc = stage.ownerDocument;
  const win = /** @type {Window} */ (doc.defaultView);
  const tip = doc.createElement('div');
  tip.className = `overlay tip tip-${look}`;
  tip.hidden = true;
  tip.setAttribute('role', 'tooltip');
  stage.append(tip);

  /** @type {Element | null} */
  let shownFor = null;
  /** @type {Element | null} */
  let pinned = null;
  let timer = 0;

  /** Move an element's title to data-tip. @param {Element} el */
  const take = (el) => {
    const t = el.getAttribute('title');
    if (t === null) return;
    el.setAttribute('data-tip', t);
    el.removeAttribute('title');
    // Its name for screen readers, which the title was (unless it has its own).
    if (!el.hasAttribute('aria-label') || el.getAttribute('data-tip-label') !== null) {
      el.setAttribute('aria-label', t);
      el.setAttribute('data-tip-label', '');
    }
    if (el === shownFor) show(el);
  };
  stage.querySelectorAll('[title]').forEach(take);
  new win.MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'attributes') take(/** @type {Element} */ (r.target));
      else r.addedNodes.forEach((n) => { if (n.nodeType === 1) { take(/** @type {Element} */ (n)); /** @type {Element} */ (n).querySelectorAll('[title]').forEach(take); } });
    }
  }).observe(stage, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  /** @param {Element} el */
  const show = (el) => {
    const text = el.getAttribute('data-tip');
    if (!text) return hide();
    const [words, key] = splitKey(text);
    tip.replaceChildren(doc.createTextNode(words));
    if (key) {
      const k = doc.createElement('span');
      k.className = 'tip-key';
      k.textContent = key;
      tip.append(k);
    }
    tip.hidden = false;
    shownFor = el;
    // Stage pixels: the stage's width over its 480.
    const s = stage.getBoundingClientRect();
    const px = s.width / 480;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth / px;
    const h = tip.offsetHeight / px;
    const cx = (r.left + r.width / 2 - s.left) / px;
    const below = (r.bottom - s.top) / px + GAP;
    const above = (r.top - s.top) / px - GAP - h;
    // Above an element in the lower half (the buttons over the ticker), else under it; whichever fits.
    const lower = (r.top + r.height / 2 - s.top) / px > 135;
    const y = (lower ? above >= MARGIN : below + h > 270 - MARGIN) ? Math.max(MARGIN, above) : below;
    const x = Math.min(480 - MARGIN - w, Math.max(MARGIN, cx - w / 2));
    tip.style.left = `calc(var(--px) * ${x.toFixed(2)})`;
    tip.style.top = `calc(var(--px) * ${y.toFixed(2)})`;
  };
  const hide = () => {
    tip.hidden = true;
    shownFor = null;
  };

  stage.addEventListener('pointerover', (e) => {
    if (pinned) return;
    const el = /** @type {Element} */ (e.target).closest?.('[data-tip]');
    win.clearTimeout(timer);
    if (!el) return hide();
    if (el === shownFor) return;
    // Straight from one tip to the next; after a pause, a moment's wait.
    if (shownFor) show(el);
    else timer = win.setTimeout(() => show(el), SHOW_MS);
  });
  stage.addEventListener('pointerleave', () => { win.clearTimeout(timer); if (!pinned) hide(); });
  stage.addEventListener('pointerdown', () => { win.clearTimeout(timer); if (!pinned) hide(); });

  return {
    pin(el) {
      pinned = el;
      if (el) show(el);
      else hide();
    },
    look(l) {
      tip.className = `overlay tip tip-${l}`;
      if (shownFor) show(shownFor);
    },
  };
}
