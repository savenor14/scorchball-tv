// The phone's controls (phones, step 4, Task 278c; Tom's picks on phone.html, 2026-10-14; docs/channel.md §28): on a
// phone the desktop's controls are hidden (the scorebug's layout and sound buttons, the side panel's tabs, the row of
// panes, CLICK FOR SOUND) and large buttons sit in the black bands either side of the picture (phone.js phoneBands).
// Each passes its tap on to the channel's own control and shows its state, so the panes, the side panel's views, sound
// and its levels work exactly as on the desktop. LEVELS opens the four switches beside it; FULL SCREEN fills the phone
// and holds it sideways; held upright, a card asks to turn the phone.
import { buttonHeight, phoneBands } from '../phone.js';
import { TABS } from '../sidePanel.js';
import { buttonIcon } from './buttons.js';
import { $, el } from './dom.js';

/** 9×9 pixel icons for the phone's own buttons. */
const ICONS = /** @type {Record<string, string[]>} */ ({
  fullscreen: ['###...###', '#.......#', '#.......#', '.........', '.........', '.........', '#.......#', '#.......#', '###...###'],
  exit: ['..#...#..', '..#...#..', '###...###', '.........', '.........', '.........', '###...###', '..#...#..', '..#...#..'],
  levels: ['.#...#...', '.#...#..#', '###..#..#', '.#..###.#', '.#...#.##', '.#...#..#', '.#...#..#', '.#...#..#', '.........'],
  stats: ['.........', '.......#.', '.......#.', '....#..#.', '....#..#.', '.#..#..#.', '.#..#..#.', '.#..#..#.', '#########'],
  table: ['#########', '#.......#', '#########', '#.......#', '#########', '#.......#', '#########', '#.......#', '#########'],
  top: ['#.#.#.#.#', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '...###...', '..#####..'],
  week: ['.#.....#.', '#########', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#...#', '#########'],
  phone: ['..#####..', '..#...#..', '..#...#..', '..#...#..', '..#...#..', '..#...#..', '..#...#..', '..##.##..', '..#####..'],
});
/** @param {string[]} rows */
const pixelIcon = (rows) => `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${rows.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`;

/** The side panel's views, in its tabs' order. */
const VIEWS = /** @type {const} */ (['stats', 'table', 'top', 'week']);
/** A view's name as its tab says it (the week view is GAMES since 2026-10-27, Tom). @param {string} id */
const viewLabel = (id) => TABS.find((t) => t.id === id)?.label ?? id.toUpperCase();
/** The panes, in the button row's order (buttons.js BUTTONS). */
const PANES = /** @type {const} */ (['guide', 'rulebook', 'chronicle', 'audience', 'about']);
/** The levels' switches (levels.js). */
const SWITCHES = /** @type {const} */ (['sound', 'crowd', 'commentary', 'studio']);
/** How often the buttons look at what they mirror, ms. */
const REFRESH_MS = 250;
/** In full screen in Broadcast, the bands fade after this long without a touch (Tom: for immersion); a tap brings them back. */
const FADE_MS = 3000;

/**
 * @param {{ layout: () => 'full' | 'broadcast', toggleLayout: () => void, soundOn: () => boolean, toggleSound: () => void, nudging: () => boolean }} hooks
 *   nudging: the channel still nudges the viewer to turn sound on (it gives up after sound.promptSeconds).
 */
export function createPhoneControls({ layout, toggleLayout, soundOn, toggleSound, nudging }) {
  const stage = $('stage');
  const left = el('div', 'phone-band left');
  const right = el('div', 'phone-band right');
  const turn = el('div', 'phone-turn');
  const levels = el('div', 'phone-levels panel');
  levels.hidden = true;
  stage.append(levels);
  document.body.append(left, right, turn);
  const canFullScreen = Boolean(document.documentElement.requestFullscreen);
  /** Sound has been on since the page loaded: SOUND stops asking (Tom: muting on purpose shouldn't bring the pulse back). */
  let heard = false;
  let touched = performance.now();
  // Any touch brings the bands back (a tap while they're faded only does that: they take no taps then).
  addEventListener('pointerdown', () => { touched = performance.now(); refresh(); }, true);

  /** The pane buttons' and the side panel's own controls, which the phone's pass taps on to. */
  const paneButton = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ (document.querySelectorAll('#buttons .icon-btn')[PANES.indexOf(/** @type {any} */ (id))] ?? null);
  const viewButton = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ (document.querySelectorAll('#side-tabs .side-tab')[VIEWS.indexOf(/** @type {any} */ (id))] ?? null);
  const levelSwitch = (/** @type {string} */ id) => /** @type {HTMLElement | null} */ (document.querySelector(`#levels .lv-${id}`));

  /** Close an open pane (its lit button again), so the side panel's view chosen shows. */
  const closePane = () => /** @type {HTMLElement | null} */ (document.querySelector('#buttons .icon-btn.lit'))?.click();
  /** The pane open, by its phone button (INFO is the desktop's about), or null. */
  const openPane = () => {
    const i = [...document.querySelectorAll('#buttons .icon-btn')].findIndex((b) => b.classList.contains('lit'));
    return i < 0 ? null : PANES[i] === 'about' ? 'info' : PANES[i];
  };
  /** The side panel's view showing. */
  const openView = () => VIEWS[[...document.querySelectorAll('#side-tabs .side-tab')].findIndex((b) => b.classList.contains('on'))] ?? 'stats';
  /**
   * The one of the side column's nine (the side panel's four views, the five panes) that shows (Tom, 2026-10-14: on a
   * phone they're one set): the open pane, else the side panel's view.
   */
  const chosen = () => openPane() ?? openView();
  /**
   * Choose one of the nine: a view closes any pane; a pane opens over the side panel. The one showing stays (Tom: sticky,
   * as the views are; a pane no longer closes from its own button). @param {string} id
   */
  const choose = (id) => {
    if (chosen() === id) return;
    if (/** @type {readonly string[]} */ (VIEWS).includes(id)) {
      closePane();
      viewButton(id)?.click();
    } else paneButton(id === 'info' ? 'about' : id)?.click();
  };
  /** The side panel's views get the panes' amber heading on a phone. */
  const sideHead = el('div', 'pane-head phone-side-head');
  stage.append(sideHead);
  // A card's ‹ back on a phone: a wide button saying where it goes back to (Tom).
  new MutationObserver(() => {
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (stage.querySelectorAll('.card-back:not([data-phone])'))) {
      b.dataset.phone = '1';
      b.textContent = (b.textContent ?? '').replace(/^‹\s*/, '‹ BACK TO ');
    }
  }).observe(stage, { childList: true, subtree: true });

  async function fullScreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        // Held sideways where the phone allows it (Chrome on Android, in full screen).
        await /** @type {any} */ (screen.orientation)?.lock?.('landscape').catch(() => {});
      }
    } catch { /* refused: it stays as it was */ }
    refresh();
  }

  /** @type {Record<string, { label: () => string, icon: () => string, tap: () => void, state: () => 'on' | 'lit' | 'ask' | '' }>} */
  const BUTTONS = {
    sound: { label: () => (soundOn() ? 'SOUND' : 'SOUND OFF'), icon: () => $('bug-sound').innerHTML, tap: () => toggleSound(), state: () => (soundOn() ? 'on' : heard || !nudging() ? '' : 'ask') },
    levels: { label: () => 'LEVELS', icon: () => pixelIcon(ICONS.levels), tap: () => { levels.hidden = !levels.hidden; }, state: () => (levels.hidden ? '' : 'lit') },
    info: { label: () => 'INFO', icon: () => buttonIcon('about'), tap: () => choose('info'), state: () => (chosen() === 'info' ? 'lit' : '') },
    audience: { label: () => 'AUDIENCE', icon: () => buttonIcon('audience'), tap: () => choose('audience'), state: () => (chosen() === 'audience' ? 'lit' : '') },
    // Two lines when it's long (Tom: EXIT FULL beside FULL was confusing).
    fullscreen: { label: () => (document.fullscreenElement ? 'EXIT FULL SCREEN' : 'FULL SCREEN'), icon: () => pixelIcon(document.fullscreenElement ? ICONS.exit : ICONS.fullscreen), tap: () => { void fullScreen(); }, state: () => '' },
    layout: { label: () => (layout() === 'full' ? 'BROADCAST' : 'FULL'), icon: () => document.querySelector(layout() === 'full' ? '#bug-layout .to-broadcast' : '#bug-layout .to-full')?.outerHTML ?? '', tap: () => { levels.hidden = true; toggleLayout(); }, state: () => '' },
    ...Object.fromEntries(VIEWS.map((id) => [id, { label: () => viewLabel(id), icon: () => pixelIcon(ICONS[id]), tap: () => choose(id), state: () => (chosen() === id ? 'lit' : '') }])),
    ...Object.fromEntries(['guide', 'rulebook', 'chronicle'].map((id) => [id, { label: () => (id === 'guide' ? 'SCHEDULE' : id.toUpperCase()), icon: () => buttonIcon(id), tap: () => choose(id), state: () => (chosen() === id ? 'lit' : '') }])),
  };

  /** One of the phone's buttons. @param {string} id @param {number} h */
  const make = (id, h) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', 'phone-btn'));
    b.dataset.id = id;
    b.style.height = `${h}px`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      BUTTONS[id].tap();
      refresh();
    });
    return b;
  };

  // The levels' switches, large, beside LEVELS: each the channel's own.
  for (const id of SWITCHES) {
    const b = el('button', 'phone-lv');
    b.dataset.id = id;
    b.innerHTML = `<span class="lamp"></span><span>${id.toUpperCase()}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      levelSwitch(id)?.click();
      refresh();
    });
    levels.append(b);
  }

  // Upright, the picture is too small to watch: a card asks to turn the phone, with FULL SCREEN, which turns it.
  turn.innerHTML = `${pixelIcon(ICONS.phone)}<div>TURN YOUR PHONE</div><small>Scorchball plays sideways, like the match on a TV.</small>`;
  if (canFullScreen) {
    const go = el('button', 'phone-go', ['FULL SCREEN']);
    go.addEventListener('click', () => { void fullScreen(); });
    turn.append(go);
  }

  let shape = '';
  /** Lay the bands out again when the layout or the screen changes; bring every button's face up to date. */
  function refresh() {
    const bands = phoneBands(layout(), { fullscreen: canFullScreen });
    const r = stage.getBoundingClientRect();
    const key = `${layout()}|${Math.round(r.left)}|${Math.round(r.right)}|${innerWidth}|${innerHeight}`;
    if (key !== shape) {
      shape = key;
      const hl = buttonHeight(innerHeight, bands.left.top.length + bands.left.bottom.length);
      const hr = buttonHeight(innerHeight, bands.right.length);
      const gap = el('div', 'gap');
      left.replaceChildren(...bands.left.top.map((id) => make(id, hl)), gap, ...bands.left.bottom.map((id) => make(id, hl)));
      right.replaceChildren(...bands.right.map((id) => make(id, hr)));
      left.style.width = `${Math.max(0, r.left)}px`;
      right.style.width = `${Math.max(0, innerWidth - r.right)}px`;
    }
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.phone-btn'))) {
      const btn = BUTTONS[/** @type {string} */ (b.dataset.id)];
      const label = btn.label();
      if (b.dataset.label !== label) {
        b.dataset.label = label;
        b.innerHTML = `${btn.icon()}<span>${label}</span>`;
      }
      const s = btn.state();
      b.classList.toggle('on', s === 'on');
      b.classList.toggle('lit', s === 'lit');
      b.classList.toggle('ask', s === 'ask');
    }
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (levels.querySelectorAll('.phone-lv'))) {
      b.classList.toggle('on', Boolean(levelSwitch(/** @type {string} */ (b.dataset.id))?.classList.contains('on')));
    }
    const view = viewLabel(openView());
    if (sideHead.textContent !== view) sideHead.textContent = view;
    turn.hidden = innerHeight <= innerWidth;
    if (soundOn()) heard = true;
    const fade = Boolean(document.fullscreenElement) && layout() === 'broadcast' && levels.hidden && performance.now() - touched > FADE_MS;
    left.classList.toggle('faded', fade);
    right.classList.toggle('faded', fade);
  }
  addEventListener('resize', () => refresh());
  document.addEventListener('fullscreenchange', () => refresh());
  setInterval(refresh, REFRESH_MS);
  refresh();
  return { refresh };
}
