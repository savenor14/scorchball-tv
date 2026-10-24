// The row of icon buttons at the bottom of the side column (Task 50; docs/channel.md §14.1): TV guide, Rulebook,
// CHRONICLE (the Record book's place, Task 219: the open book, the Rulebook a whistle), Audience, About. Each opens a pop-up pane over the side column (Task 115, §17.2), lit while it's open;
// all work: the TV guide (V), the Rulebook (R) and About (I; Task 164), the CHRONICLE (C; Task 219), Audience (A; Task 260; the keys Task 277b). Sound is the speaker beside the scorebug, in
// both layouts (Task 110, Tom: the Settings gear here held only Sound; its place is kept for the TV guide). M turns
// sound on and off; the speaker opens the levels pane (Task 129, levels.js). Every load starts silent.
import { $, el } from './dom.js';

/** Each icon as 9×9 pixel rows: # filled. */
const ICONS = /** @type {Record<string, string[]>} */ ({
  guide: ['#########', '#.......#', '#.##.##.#', '#.......#', '#.#####.#', '#.......#', '#.###...#', '#########', '..#...#..'],
  // A referee's whistle (Task 219, Tom: the open book went to the CHRONICLE).
  rulebook: ['.##......', '#..#.....', '.##......', '..#######', '.#......#', '#...#####', '#...#....', '#...#....', '.###.....'],
  chronicle: ['.........', '.###.###.', '#...#...#', '#.#.#.#.#', '#...#...#', '#.#.#.#.#', '#...#...#', '.###.###.', '....#....'],
  // One silhouette (Tom, 2026-10-15: the two looked odd).
  audience: ['...###...', '..#####..', '..#####..', '...###...', '.........', '..#####..', '.#######.', '#########', '#########'],
  about: ['...###...', '...###...', '.........', '..####...', '...###...', '...###...', '...###...', '...###...', '..#####..'],
});

const BUTTONS = /** @type {const} */ ([
  ['guide', 'Schedule: today on the channel (V)'],
  ['rulebook', 'Rulebook: how the sport works (R)'],
  ['chronicle', 'Chronicle: the latest, the history and the records (C)'],
  ['audience', 'Audience: your moments, polls, and notes to the League (A)'],
  ['about', 'Info: about Scorchball, and a guide to the channel (I)'],
]);
/** The panes' keys (Task 277b, Tom), beside V for the Schedule. */
const BOOK_KEYS = /** @type {const} */ ({ r: 'rulebook', c: 'chronicle', a: 'audience', i: 'about' });

/** A button's icon as an inline SVG (About's guide shows them beside what they do, Task 172). @param {string} id */
export const buttonIcon = (id) => (ICONS[id] ? icon(ICONS[id]) : '');

/** A pixel icon as an inline SVG. @param {string[]} rows */
function icon(rows) {
  const cells = rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('');
  return `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${cells}</svg>`;
}

/**
 * @param {{ onSound: (on: boolean) => void, isSoundOn: () => boolean, onGuide: () => void, onBook: (id: 'rulebook' | 'chronicle' | 'audience' | 'about') => void, onSpeaker: () => void }} hooks
 *   onSound: the viewer turned sound on or off (called from the click or key press, so audio may start).
 *   onSpeaker: the viewer clicked the speaker beside the scorebug (it opens the levels pane).
 *   onGuide: the viewer opened or closed the TV guide (its button, or V).
 *   onBook: the viewer opened or closed the Rulebook, the CHRONICLE (Task 219), AUDIENCE (Task 260) or About (their buttons, or R, C, A, I).
 */
export function createButtons({ onSound, isSoundOn, onGuide, onBook, onSpeaker }) {
  const row = $('buttons');
  /** @type {Record<string, HTMLButtonElement>} */
  const byId = {};
  for (const [id, title] of BUTTONS) {
    const b = document.createElement('button');
    const works = id === 'guide' || id === 'rulebook' || id === 'chronicle' || id === 'audience' || id === 'about';
    b.className = works ? 'icon-btn' : 'icon-btn later';
    b.title = title;
    b.innerHTML = icon(ICONS[id]);
    if (id === 'guide') b.addEventListener('click', () => onGuide());
    else if (id === 'rulebook' || id === 'chronicle' || id === 'audience' || id === 'about') b.addEventListener('click', () => onBook(id));
    if (!works) b.setAttribute('aria-disabled', 'true');
    byId[id] = b;
    row.append(b);
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 'v') onGuide();
    else if (key in BOOK_KEYS) onBook(BOOK_KEYS[/** @type {keyof typeof BOOK_KEYS} */ (key)]);
  });

  window.addEventListener('keydown', (e) => {
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey) toggle();
  });

  function toggle() {
    onSound(!isSoundOn());
    render();
  }

  function render() {
    const on = isSoundOn();
    const btn = $('bug-sound');
    btn.classList.toggle('on', on);
    btn.title = `Sound ${on ? 'on' : 'off'} (M)`;
  }
  render();
  $('bug-sound').addEventListener('click', () => onSpeaker());
  /** Light a button while its pane is open. @param {string} id @param {boolean} on */
  const lit = (id, on) => byId[id]?.classList.toggle('lit', on);
  /** A dot on a button: INFO's, while there's an announcement this browser hasn't seen (Task 265). @param {string} id @param {boolean} on */
  const dot = (id, on) => {
    const b = byId[id];
    if (!b) return;
    b.querySelector('.btn-dot')?.remove();
    if (on) b.append(el('span', 'btn-dot'));
  };
  return { render, toggleSound: toggle, lit, dot, /** A button's element (Fan Coins' +1 rises from Audience's). @param {string} id */ element: (id) => byId[id] ?? null };
}
