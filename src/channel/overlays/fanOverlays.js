// Fan Coins' overlays (docs/channel.md §29; Tom's picks on fancoins.html): a +1 and a coin rising from the
// Audience button as coins come in (the balance itself on COINS' tab, not the button: it opens more than coins; none
// in Broadcast, Tom), and a chant's speech bubble over the end singing it in Broadcast once its slide is complete, its
// line being sung picked out; and a fan shout's smaller bubble (Tom's notes, task 3): the home end's low in its side
// stand, the away end's in the stand above the pitch over the away corner, its tail on its right (not towards the dugout).
import { coinIcon } from './coinsView.js';
import { el } from './dom.js';

/** Where a chant's bubble sits over each end of Broadcast's bowl (stage px), and its notes. */
const BUBBLE = { home: { left: 3, top: 62 }, away: { left: 440, top: 26 } };
/** Where a fan shout's bubble sits for each end (stage px, its left and top), both as wide (Tom). */
const SHOUT = { home: { left: 5.5, top: 196 }, away: { left: 352, top: 2 } };
/** A pixel heart for ♥ (VT323 has none). */
const HEART = '<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true"><rect x="1" y="0" width="2" height="1"/><rect x="4" y="0" width="2" height="1"/><rect x="0" y="1" width="7" height="2"/><rect x="1" y="3" width="5" height="1"/><rect x="2" y="4" width="3" height="1"/><rect x="3" y="5" width="1" height="1"/></svg>';

/**
 * @param {{ stage: HTMLElement, plusSeconds: number, onBar?: (kind: string) => void }} o  onBar: the bar under the scorebug tapped.
 */
export function createFanOverlays({ stage, plusSeconds, onBar }) {
  const px = (/** @type {number} */ n) => `calc(var(--px) * ${n})`;
  const bubble = el('div', 'fc-bubble');
  bubble.hidden = true;
  stage.append(bubble);
  const shoutBox = el('div', 'fc-shout');
  shoutBox.hidden = true;
  stage.append(shoutBox);
  /** What the bubbles show, so they're only redrawn when that changes. */
  let shown = '';
  let shouted = '';

  // Version 2 (Tom's pick b on coinqueue.html): a bar under the scorebug when one's own spend starts, with BROADCAST ›
  // for a spend seen in the stands; below MOMENTS' ticket when one shows.
  const bar = /** @type {HTMLButtonElement} */ (el('button', 'fc-onbar'));
  bar.hidden = true;
  stage.append(bar);
  let barKind = '';
  let barShown = '';
  bar.addEventListener('click', () => { bar.hidden = true; onBar?.(barKind); });

  return {
    /**
     * The bar: what to say (null: hidden). @param {{ kind: string, title: string, broadcast: boolean } | null} item
     */
    onBar(item) {
      const key = item ? `${item.kind}|${item.title}|${item.broadcast}` : '';
      if (key !== barShown) {
        barShown = key;
        barKind = item?.kind ?? '';
        if (item) bar.replaceChildren(Object.assign(el('span', ''), { innerHTML: coinIcon(item.kind), style: 'display: contents' }), item.title, ...(item.broadcast ? [el('span', '', ['BROADCAST ›'])] : []));
      }
      bar.hidden = !item;
      const notice = /** @type {HTMLElement | null} */ (document.getElementById('moment-notice'));
      bar.classList.toggle('below', !!notice && !notice.hidden);
    },
    /**
     * Coins came in: +n and a coin rising from `from` (the Audience button, wherever it is).
     * @param {number} n @param {HTMLElement | null} from
     */
    plus(n, from) {
      if (!from || from.offsetParent === null) return;
      const s = stage.getBoundingClientRect();
      const r = from.getBoundingClientRect();
      if (r.width === 0) return;
      const scale = s.width / 480;
      const x = el('div', 'fc-plus', [`+${n}`]);
      x.insertAdjacentHTML('beforeend', coinIcon('coin'));
      Object.assign(x.style, { left: px((r.left - s.left) / scale - 2), top: px((r.top - s.top) / scale - 9) });
      x.style.setProperty('--fc-plus', `${plusSeconds}s`);
      stage.append(x);
      setTimeout(() => x.remove(), plusSeconds * 1000 + 100);
    },
    /**
     * The chant's bubble this frame: over its end, its line being sung picked out; hidden between rounds and in Full.
     * @param {{ lines: string[], line: number, side: 'home' | 'away' } | null} c @param {boolean} broadcast  Broadcast, its slide complete.
     */
    chant(c, broadcast) {
      const key = c && broadcast ? `${c.side}|${c.line}|${c.lines.join('/')}` : '';
      if (key === shown) return;
      shown = key;
      bubble.hidden = !key;
      if (!c || !key) return;
      const at = BUBBLE[c.side];
      Object.assign(bubble.style, { left: px(at.left), top: px(at.top) });
      bubble.replaceChildren(...c.lines.map((l, i) => el('span', `l${i === c.line ? ' on' : ''}`, [l])));
    },
    /**
     * A fan shout this frame, its bubble in its team's colour, popping up as it starts; hidden otherwise and in Full.
     * @param {{ words: string, side: 'home' | 'away', colour: string } | null} x @param {boolean} broadcast  Broadcast, its slide complete.
     */
    shout(x, broadcast) {
      const key = x && broadcast ? `${x.side}|${x.words}` : '';
      if (key === shouted) return;
      shouted = key;
      shoutBox.hidden = !key;
      if (!x || !key) return;
      const at = SHOUT[x.side];
      Object.assign(shoutBox.style, { left: px(at.left), top: px(at.top) });
      shoutBox.style.setProperty('--team', x.colour);
      shoutBox.classList.toggle('right', x.side === 'away');
      const [before, after] = x.words.split('♥');
      shoutBox.replaceChildren(before);
      if (after !== undefined) {
        shoutBox.insertAdjacentHTML('beforeend', HEART);
        shoutBox.append(after.trim());
      }
      // Pops up afresh each time.
      shoutBox.classList.remove('pop');
      void shoutBox.offsetWidth;
      shoutBox.classList.add('pop');
    },
  };
}
