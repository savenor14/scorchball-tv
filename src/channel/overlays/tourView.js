// The tour on the channel (Milestone 5⅞; docs/channel.md §26; Tom's picks on tour.html, 2026-10-13). On a first visit
// the welcome (centred over the pitch) offers it: TAKE THE TOUR or NO THANKS; either is remembered (tour.js), so it's
// never offered again, and it can be taken any time from INFO's GUIDE. Each step lights one thing on screen, the rest
// dimmed (look B), with an amber box beside it: the words (data/tour.json), 1 / 6, ‹ BACK, NEXT › (DONE last), ✕.
// While a step shows, the channel's keys wait (Esc closes the tour) and clicks go nowhere but the box; the match plays
// on underneath. Full only: in Broadcast the welcome waits for Full. MOMENTS' step shows an example ticket.
// Round 2 (Tom, 2026-10-17): a FAN COINS step after MOMENTS while Fan Coins are on; and on a phone its own fewer steps,
// pointing at its buttons in the bands, the boxes in the phone's own pixels over the picture beside what they point at
// (Tom's pick A), offered once the phone is sideways.
import { iconSvg } from '../momentIcons.js';
import { BOX_WIDTH, PHONE_BOX, markOffered, placeBox, placePhoneBox, tourOffered, tourSteps, union } from '../tour.js';
import { buttonIcon } from './buttons.js';
import { $, el } from './dom.js';

/** How often an open step follows what it points at (the scorebug widens for a re-air), ms. */
const FOLLOW_MS = 500;

/**
 * @param {object} o
 * @param {any} o.config
 * @param {() => 'full' | 'broadcast'} o.layout
 * @param {Storage | null} o.storage
 * @param {boolean} o.phone  The phone's layout: its own steps, pointing at its buttons in the bands.
 */
export function createTourView({ config, layout, storage, phone }) {
  const { welcome } = config.tour;
  const steps = tourSteps(config.tour, { phone, coins: config.settings.fanCoins.enabled });
  const stage = $('stage');
  /** On a phone the tour sits over the whole page (the bands are outside the stage), sized in CSS px. */
  const host = phone ? document.body : stage;
  /** The step showing, or -1 for the welcome, or null when nothing shows. @type {number | null} */
  let at = null;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let follow;
  const px = (/** @type {number} */ n) => `calc(var(--px) * ${n})`;

  /** What a step points at. @param {string} target @returns {Element[]} */
  const targets = (target) => {
    const button = (/** @type {number} */ i) => document.querySelectorAll('#buttons .icon-btn')[i];
    const band = (/** @type {string} */ id) => document.querySelector(`.phone-btn[data-id="${id}"]`);
    const found = phone ? {
      scorebug: [$('scorebug')],
      buttons: [document.querySelector('.phone-band.right')],
      audience: [band('audience')],
      close: [band('info'), band('layout')],
    }[target] ?? [] : {
      scorebug: [$('scorebug')],
      layout: [$('bug-layout')],
      side: [$('side-tabs'), $('side')],
      schedule: [button(0)],
      audience: [button(3)],
      info: [button(4)],
    }[target] ?? [];
    return found.filter((e) => !!e);
  };

  function clear() {
    document.querySelectorAll('.tour-box, .tour-lit, .tour-welcome, .tour-block, #tour-notice').forEach((e) => e.remove());
  }

  function close(/** @type {string} */ how) {
    markOffered(storage, how);
    at = null;
    clearInterval(follow);
    clear();
  }

  function showWelcome() {
    at = -1;
    clear();
    const take = el('button', 'go', [welcome.take]);
    take.addEventListener('click', () => { markOffered(storage, 'taken'); show(0); });
    const skip = el('button', '', [welcome.skip]);
    skip.addEventListener('click', () => close('declined'));
    // INFO's own icon before the word INFO (Tom).
    const [before, after] = String(welcome.small).split(/(?=INFO)/);
    const icon = el('span', 'tour-icon');
    icon.innerHTML = buttonIcon('about');
    const box = el('div', 'tour-welcome', [
      el('div', 'tour-head', [welcome.title]),
      el('p', '', [welcome.text]),
      el('div', 'row', [take, skip]),
      el('small', '', after === undefined ? [before] : [before, icon, ' ', after]),
    ]);
    host.append(box);
    // On a phone: centred over the picture, in CSS px.
    if (phone) {
      const sr = stage.getBoundingClientRect();
      const w = Math.min(340, sr.width - 24);
      box.style.width = `${w}px`;
      const h = box.getBoundingClientRect().height;
      Object.assign(box.style, { left: `${sr.left + (sr.width - w) / 2}px`, top: `${sr.top + Math.max(8, (sr.height - h) / 2)}px` });
    }
  }

  /** A step: its things lit, the rest dimmed, the box beside the first. @param {number} i */
  function show(i) {
    at = i;
    clear();
    const s = steps[i];
    // Clicks stop here while the tour shows (the box sits above it).
    host.append(el('div', 'tour-block'));
    const lit = targets(s.target);
    if (s.notice) {
      const l = el('span', 'l');
      l.innerHTML = iconSvg('goal');
      const n = el('div', '', [el('div', 'mo-stub', [l, el('span', 'r', [el('span', 'k', ['MOMENT']), el('span', 't', ['25 GOALS SEEN'])])])]);
      n.id = 'tour-notice';
      stage.append(n);
      lit.push(n);
    }
    const sr = stage.getBoundingClientRect();
    if (phone) {
      showPhone(i, lit, sr);
      return;
    }
    const k = sr.width / 480;
    const rects = lit.map((e) => {
      const r = e.getBoundingClientRect();
      return { left: (r.left - sr.left) / k, top: (r.top - sr.top) / k, right: (r.right - sr.left) / k, bottom: (r.bottom - sr.top) / k };
    });
    // The side panel is lit as one (its tabs and the panel); otherwise each thing on its own, the first dimming the rest.
    const lights = s.target === 'side' ? [union(rects)] : rects;
    lights.forEach((r, j) => {
      const d = el('div', `tour-lit${j === 0 ? ' dim' : ''}`);
      Object.assign(d.style, { left: px(r.left - 1), top: px(r.top - 1), width: px(r.right - r.left + 2), height: px(r.bottom - r.top + 2) });
      stage.append(d);
    });
    const box = stepBox(i);
    box.style.width = px(BOX_WIDTH);
    stage.append(box);
    const p = placeBox(lights[0] ?? { left: 160, top: 100, right: 320, bottom: 110 }, box.getBoundingClientRect().height / k);
    Object.assign(box.style, { left: px(p.left), top: px(p.top) });
    const arrow = el('div', `tour-arrow ${p.arrow}`);
    arrow.style[p.arrow === 'right' ? 'top' : 'left'] = px(p.arrowAt);
    box.append(arrow);
    following(i);
  }

  /** Drawn again now and then, following what it points at (the scorebug widens for a re-air). @param {number} i */
  function following(i) {
    clearInterval(follow);
    follow = setInterval(() => { if (at === i) show(i); }, FOLLOW_MS);
  }

  /** A step's box: its title and ✕, its words, 1 / N, ‹ BACK and NEXT › (DONE last). @param {number} i */
  function stepBox(i) {
    const s = steps[i];
    const x = el('button', '', ['✕']);
    x.title = 'Close the tour (Esc)';
    x.addEventListener('click', () => close('closed'));
    const back = /** @type {HTMLButtonElement} */ (el('button', '', ['‹ BACK']));
    back.disabled = i === 0;
    back.addEventListener('click', () => show(i - 1));
    const last = i === steps.length - 1;
    const next = el('button', 'go', [last ? 'DONE' : 'NEXT ›']);
    next.addEventListener('click', () => (last ? close('finished') : show(i + 1)));
    return el('div', 'tour-box', [el('div', 'tour-head', [s.title, x]), el('div', 'tour-text', [s.text]), el('div', 'tour-foot', [el('span', 'n', [`${i + 1} / ${steps.length}`]), back, next])]);
  }

  /**
   * A phone's step (Tom's pick A): each thing lit in the page's CSS px (the first dimming the rest), the box over the
   * picture beside the first. @param {number} i @param {Element[]} lit @param {DOMRect} sr  The picture.
   */
  function showPhone(i, lit, sr) {
    const rects = lit.map((e) => e.getBoundingClientRect());
    rects.forEach((r, j) => {
      const d = el('div', `tour-lit${j === 0 ? ' dim' : ''}`);
      Object.assign(d.style, { left: `${r.left - 2}px`, top: `${r.top - 2}px`, width: `${r.width + 4}px`, height: `${r.height + 4}px` });
      host.append(d);
    });
    const box = stepBox(i);
    const w = Math.min(PHONE_BOX.width, sr.width - 24);
    box.style.width = `${w}px`;
    host.append(box);
    const r = rects[0] ?? new DOMRect(sr.left + sr.width / 2, sr.top + 20, 0, 0);
    const p = placePhoneBox(r, sr, w, box.getBoundingClientRect().height);
    Object.assign(box.style, { left: `${p.left}px`, top: `${p.top}px` });
    const arrow = el('div', `tour-arrow ${p.arrow}`);
    arrow.style[p.arrow === 'up' ? 'left' : 'top'] = `${p.arrowAt}px`;
    box.append(arrow);
    following(i);
  }

  // While a step shows, the channel's keys wait; Esc closes the tour (or turns down the welcome).
  window.addEventListener('keydown', (e) => {
    if (at === null) return;
    if (e.key === 'Escape') {
      close(at === -1 ? 'declined' : 'closed');
      e.stopImmediatePropagation();
      return;
    }
    if (at >= 0) e.stopImmediatePropagation();
  }, { capture: true });
  window.addEventListener('resize', () => { if (at !== null && at >= 0) show(at); });

  return {
    /** Whether a step or the welcome shows. */
    get open() { return at !== null; },
    /**
     * On load: the welcome, if this browser hasn't been offered the tour (in Full; Broadcast waits for Full). On a phone,
     * once it's sideways (never over TURN YOUR PHONE) and its buttons are in the bands.
     */
    offer() {
      if (tourOffered(storage)) return;
      const wait = setInterval(() => {
        if (layout() !== 'full') return;
        if (phone && (innerHeight > innerWidth || !document.querySelector('.phone-btn[data-id="audience"]'))) return;
        clearInterval(wait);
        if (at === null && !tourOffered(storage)) showWelcome();
      }, FOLLOW_MS);
    },
    /** From INFO's GUIDE: the first step (in Full). */
    start() {
      markOffered(storage, 'taken');
      show(0);
    },
    /** Broadcast hides what the steps point at: the tour closes on the way. */
    close: () => { if (at !== null) close(at === -1 ? 'declined' : 'closed'); },
  };
}
