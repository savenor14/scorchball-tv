// The ticker crawl along the bottom. What it says comes from ticker.js.
// A tape holds the items twice so it loops seamlessly. New items join at the end of each loop; live scores update
// in place; a newly live match restarts the tape so it shows straight away.
import { tickerItems } from '../ticker.js';
import { $, el, kit } from './dom.js';

/** How often the items are recomputed, in real ms. */
const REFRESH_MS = 250;

/**
 * The movement is a browser animation (Web Animations API) rather than a position set every frame: the browser runs it
 * on its compositor at the display's own rate, sub-pixel, so it stays smooth even when the page's frame loop is late
 * (a game loading on another screen). Each pass runs the tape from its start (or the right-hand edge, after a restart)
 * until the first copy has gone by; then new items join and the next pass begins where the second copy had reached.
 * @param {{ live: import('../liveLeague.js').LiveLeague, timelineOf: (m: import('../liveLeague.js').LiveMatch) => import('../timeline.js').Timeline,
 *   playerName: (id: string) => string, formatTime: (t: number) => string }} channel
 * @param {HTMLElement} stage  For the current scale (--px).
 */
export function createCrawl({ live, timelineOf, playerName, formatTime }, stage) {
  /**
   * An item's words, with each team's kit before its abbreviation (Task 110) in scores, results and fixtures.
   * @param {HTMLElement} node @param {import('../ticker.js').TickerItem} item
   */
  const render = (node, item) => {
    node.dataset.text = item.text;
    // An announcement (Task 265): an amber LEAGUE tag before its headline.
    if (item.kind === 'league') {
      node.replaceChildren(el('span', 'tick-league', ['LEAGUE']), item.text);
      return;
    }
    // OFF THE BALL's premiere (Tom, 2026-10-21): when, then the show and its episode in amber.
    if (item.kind === 'show') {
      const [when, ...rest] = item.text.split(' · ');
      node.replaceChildren(`${when} · `, el('span', 'tick-show', [rest.join(' · ')]));
      return;
    }
    // A viewer's message (Fan Coins, shared): a FANS tag in a team's colours, or gold.
    if (item.kind === 'fans') {
      const tag = el('span', 'tick-fans', ['FANS']);
      if (item.tag && typeof item.tag !== 'string') Object.assign(tag.style, { background: item.tag.bg, color: item.tag.fg });
      node.replaceChildren(tag, item.text);
      return;
    }
    if (!item.teams) {
      node.replaceChildren(item.text);
      return;
    }
    // A big match promoted: its fiery tag (FINAL ROUND, SEMIFINAL 1, THE FINAL) before the teams and when.
    const big = item.kind === 'big' && typeof item.tag === 'string' ? [el('span', 'tick-big', [item.tag])] : [];
    const teams = item.teams.map((id) => (id ? live.league.teams[id] : null));
    const used = [false, false];
    // TOP and TOP SCORER: the team's and the player's names in white, the rest grey (docs/colours.md).
    const named = item.kind === 'scorer' || item.kind === 'leader';
    const words = item.text.split(' ');
    const nameEnd = item.kind === 'scorer' ? words.findIndex((w) => w.startsWith('(')) : -1;
    /** @type {(Node | string)[]} */
    const parts = [];
    words.forEach((word, i) => {
      if (i > 0) parts.push(' ');
      // An abbreviation alone, or in brackets (the top scorer's team: "(▮ PCG)").
      const open = word.startsWith('(') ? '(' : '';
      const bare = word.slice(open.length);
      const k = teams.findIndex((t, j) => t && !used[j] && (t.abbr === bare || `${t.abbr})` === bare));
      // A live score's LIVE and minute in red, the score in white (docs/colours.md).
      if (item.kind === 'live' && i < 2) parts.push(el('span', 'tick-on-air', [word]));
      else if (item.kind === 'scorer' && i >= 2 && i < nameEnd) parts.push(el('span', 'tick-name', [word]));
      else if (k >= 0) {
        used[k] = true;
        if (open) parts.push(open);
        parts.push(kit(/** @type {any} */ (teams[k]), 'kit tick-kit'), named ? el('span', 'tick-name', [bare]) : bare);
      } else parts.push(word);
    });
    node.replaceChildren(...big, ...parts);
  };
  const settings = live.config.settings.ticker;
  const tape = $('ticker-tape');
  // The season, on the ticker's right (Tom, after Task 234).
  const seasonBox = $('ticker-season');
  const ctx = { timelineOf, featuredId: /** @type {string | null} */ (null), hideId: /** @type {string | null} */ (null), playerName, formatTime, settings };
  /** @type {import('../ticker.js').TickerItem[]} */
  let items = [];
  let computedAt = -Infinity;
  /** The viewer's message on the tape, if any (a new one joins at the end of the line coming in, Tom). @type {string | null} */
  let fanKey = null;
  /** What the tape's second copy shows: the next pass starts with it, so nothing on screen changes at the join. @type {import('../ticker.js').TickerItem[]} */
  let comingItems = [];
  /** @type {Animation | null} */
  let pass = null;

  /** One copy of some items, a row of ticks. @param {import('../ticker.js').TickerItem[]} list */
  const copyOf = (list) => {
    const row = el('div', '', list.flatMap((item) => {
      const span = el('span', `tick ${item.kind}${item.flash ? ' flash' : ''}`);
      render(span, item);
      span.dataset.key = item.key;
      return [span, el('span', 'tick-sep', ['·'])];
    }));
    row.style.display = 'flex';
    return row;
  };

  /**
   * Fill the tape: the first copy, then the current items after it, coming in from the right (new items join there).
   * @param {import('../ticker.js').TickerItem[]} firstItems @returns {number} The first copy's width, in CSS px.
   */
  function fill(firstItems) {
    const first = copyOf(firstItems);
    comingItems = items;
    tape.replaceChildren(first, copyOf(items));
    return first.getBoundingClientRect().width;
  }

  /**
   * A new viewer's message (Fan Coins, Tom): tacked on at the end of the line, never restarting the tape. If the second
   * copy hasn't come into view yet it's remade with the message at its start; otherwise the next pass brings it.
   */
  function joinAtEnd() {
    const second = /** @type {HTMLElement | undefined} */ (tape.children[1]);
    const view = /** @type {HTMLElement} */ (tape.parentElement).getBoundingClientRect();
    if (!second || second.getBoundingClientRect().left < view.right) return;
    comingItems = items;
    second.replaceWith(copyOf(items));
  }

  /** Start a pass. @param {boolean} restart  From the right-hand edge (a newly live match shows straight away). */
  function start(restart) {
    pass?.cancel();
    // A pass carries on from where the last one's second copy had reached: that copy, then the items as they are now.
    const width = fill(restart || !comingItems.length ? items : comingItems);
    if (width === 0) {
      pass = null;
      return;
    }
    const from = restart ? /** @type {HTMLElement} */ (tape.parentElement).getBoundingClientRect().width : 0;
    const speed = settings.pxPerSecond * (parseFloat(stage.style.getPropertyValue('--px')) || 1); // CSS px per second
    pass = tape.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${-width}px)` }], {
      duration: ((from + width) / speed) * 1000,
      easing: 'linear',
      fill: 'forwards',
    });
    pass.onfinish = () => start(false);
  }

  /** Live scores and flashes change in place, without moving the tape. */
  function refresh() {
    for (const item of items) {
      for (const node of tape.querySelectorAll(`[data-key="${item.key}"]`)) {
        if (/** @type {HTMLElement} */ (node).dataset.text !== item.text) render(/** @type {HTMLElement} */ (node), item);
        node.classList.toggle('flash', item.flash);
      }
    }
  }

  // A new window size changes the scale (--px), so the tape's width and speed: start the pass again.
  window.addEventListener('resize', () => { if (pass) start(false); });

  return {
    /**
     * @param {number} t @param {string | null} featuredId  The match on air, which the ticker doesn't repeat.
     * @param {string | null} [hideId]  A match being re-aired: its result leaves the tape at once.
     * @param {import('../ticker.js').TickerItem | null} [fan]  A viewer's message (Fan Coins, shared), first on the tape.
     * @param {import('../ticker.js').TickerItem | null} [last]  How many are watching (ticker.js watchingItem), last on it.
     */
    update(t, featuredId, hideId = null, fan = null, last = null) {
      const realNow = performance.now();
      const hideChanged = hideId !== ctx.hideId;
      const fanChanged = (fan?.key ?? null) !== fanKey;
      fanKey = fan?.key ?? null;
      if (realNow - computedAt <= REFRESH_MS && !hideChanged && !fanChanged && pass) return;
      const season = `SEASON ${live.calendar.seasonAt(t)}`;
      if (seasonBox.textContent !== season) seasonBox.textContent = season;
      ctx.featuredId = featuredId;
      ctx.hideId = hideId;
      items = [...(fan ? [fan] : []), ...tickerItems(live, t, ctx), ...(last ? [last] : [])];
      computedAt = realNow;
      const keys = new Set([...tape.querySelectorAll('[data-key]')].map((n) => /** @type {HTMLElement} */ (n).dataset.key));
      if (!pass || hideChanged || items.some((i) => i.kind === 'live' && !keys.has(i.key))) start(true);
      else {
        if (fanChanged && fan) joinAtEnd();
        refresh();
      }
    },
  };
}
