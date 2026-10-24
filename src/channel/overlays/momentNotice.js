// The MOMENTS notice (Milestone 5¾; docs/channel.md §25; Tom's picks on moments.html): a step reached or a secret
// found, as a small ticket stub below the scorebug for settings.moments.noticeSeconds, shooting in with a flash and a
// glint (index.html's mo-in), in both layouts. Several wait their turn, noticeGapSeconds apart. None while the channel
// says it's quiet (an ad break, the opening's countdown or ident, a transition, Broadcast's scorebug aside), nor while the
// notices are switched off (the switch at the foot of MOMENTS). A click opens the AUDIENCE pane's MOMENTS tab. No sound (Tom).
import { iconSvg } from '../momentIcons.js';
import { $, el } from './dom.js';

/**
 * @param {object} o
 * @param {any} o.config
 * @param {() => boolean} o.enabled  The notices switched on.
 * @param {() => void} o.onClick
 */
export function createMomentNotice({ config, enabled, onClick }) {
  const { noticeSeconds, noticeGapSeconds } = config.settings.moments;
  const kinds = new Map(/** @type {any[]} */ (config.moments.kinds).map((k) => [k.id, k]));
  const secrets = new Map(/** @type {any[]} */ (config.moments.secrets).map((x) => [x.id, x]));
  const showMs = noticeSeconds * 1000;
  const box = /** @type {HTMLButtonElement} */ (el('button', ''));
  box.id = 'moment-notice';
  box.hidden = true;
  box.style.setProperty('--mo-ms', `${showMs}ms`);
  box.addEventListener('click', () => onClick());
  $('stage').append(box);
  /** @type {import('../moments.js').Notice[]} */
  const queue = [];
  /** When the one showing goes, and the next may come (real ms). */
  let until = -Infinity;
  let nextAt = -Infinity;

  /** The stub's words: a step ("25 GOALS SEEN", "FIRST GOAL SEEN") or a secret. @param {import('../moments.js').Notice} n */
  function words(n) {
    if ('secret' in n) {
      const s = secrets.get(n.secret);
      return { icon: n.secret, kicker: 'SECRET FOUND', text: s?.name ?? n.secret, secret: true };
    }
    const k = kinds.get(n.kind);
    return { icon: n.kind, kicker: 'MOMENT', text: n.step === 1 ? k.first : `${n.step} ${k.seen}`, secret: false };
  }

  return {
    /** New notices, in the order found. @param {import('../moments.js').Notice[]} list */
    add(list) {
      if (enabled()) queue.push(...list);
    },
    /**
     * Each frame: hide the one showing when its time is up; show the next when allowed.
     * @param {number} now  Real time, ms (performance.now()).
     * @param {boolean} quiet  No notice may start now.
     */
    frame(now, quiet) {
      if (!box.hidden && now >= until) {
        box.hidden = true;
        nextAt = now + noticeGapSeconds * 1000;
      }
      if (!box.hidden || queue.length === 0 || now < nextAt || quiet) return;
      if (!enabled()) {
        queue.length = 0;
        return;
      }
      const w = words(/** @type {import('../moments.js').Notice} */ (queue.shift()));
      const l = el('span', 'l');
      l.innerHTML = iconSvg(w.icon);
      box.replaceChildren(el('div', `mo-stub${w.secret ? ' secret' : ''}`, [l, el('span', 'r', [el('span', 'k', [w.kicker]), el('span', 't', [w.text])])]));
      box.title = 'Your moments (A)';
      // Shown afresh, so its entrance plays from the start.
      box.hidden = false;
      box.style.animation = 'none';
      void box.offsetWidth;
      box.style.animation = '';
      until = now + showMs;
    },
  };
}
