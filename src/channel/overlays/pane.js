// The pop-up pane (Task 115; docs/channel.md §17.2): what the buttons below the side panel open, over the side column
// (its tabs and panel; the buttons stay showing below), on the dark plate with an amber title bar. One at a time; the
// ✕, the button again or Esc closes it. Full only: Broadcast hides the button row, so it closes on the way. Each button
// supplies its title and its contents; the pane only frames them.
import { $, el, setText } from './dom.js';

/**
 * @typedef {object} PaneContent
 * @property {string} title  In the title bar ("TV GUIDE").
 * @property {HTMLElement} body  What scrolls.
 * @property {HTMLElement} [bar]  A row fixed under the title (the guide's ALL / MATCHES).
 * @property {HTMLElement} [foot]  A row fixed at the foot, under what scrolls (CHRONICLE's FIND A PLAYER).
 * @property {() => void} [onClose]
 */

export function createPane() {
  const box = $('pane');
  const title = el('span', 'pane-title');
  const sub = el('span', 'pane-sub');
  const close = el('button', 'pane-x', ['✕']);
  close.title = 'Close (Esc)';
  const head = el('div', 'pane-head', [title, sub, close]);
  const barSlot = el('div', 'pane-bar');
  const scroll = el('div', 'pane-body');
  const footSlot = el('div', 'pane-foot');
  box.append(head, barSlot, scroll, footSlot);
  /** @type {string | null} */
  let openId = null;
  /** @type {PaneContent | null} */
  let content = null;

  const api = {
    /** Which pane is open, if any. */
    get openId() { return openId; },
    /** Open a pane (closing any other). @param {string} id @param {PaneContent} c */
    open(id, c) {
      if (openId) api.close();
      openId = id;
      content = c;
      setText(title, c.title);
      setText(sub, '');
      barSlot.replaceChildren(...(c.bar ? [c.bar] : []));
      barSlot.hidden = !c.bar;
      scroll.replaceChildren(c.body);
      scroll.scrollTop = 0;
      footSlot.replaceChildren(...(c.foot ? [c.foot] : []));
      footSlot.hidden = !c.foot;
      box.hidden = false;
    },
    close() {
      if (!openId) return;
      const c = content;
      openId = null;
      content = null;
      box.hidden = true;
      scroll.replaceChildren();
      footSlot.replaceChildren();
      c?.onClose?.();
    },
    /** Open it, or close it if it's the one open. @param {string} id @param {() => PaneContent} make */
    toggle(id, make) {
      if (openId === id) api.close();
      else api.open(id, make());
    },
    /** The small text beside the title (the guide's day). @param {string} text */
    setSub(text) { setText(sub, text); },
    /** The scrolling area, for scrolling to a row. */
    scroller: scroll,
  };
  close.addEventListener('click', () => api.close());
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.close(); });
  return api;
}
