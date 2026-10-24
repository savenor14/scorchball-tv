// The levels pane in the sound button (Task 129; docs/channel.md §18.4): the speaker beside the scorebug opens a strip
// of on/off switches in the scorebug's row (over Full's ad strip, over Broadcast's crowd beside the scorebug): Sound,
// Crowd and the voices. No sliders (Tom: "we don't need people doing EQ"). The voices (Commentary until Task 135, then
// Voices for all three) split in Task 256, for viewers who want the commentators off but the desk and the interview
// on: a Commentary and a Studio switch (Tom's pick A; B was one Voices switch going round ALL, STUDIO ONLY, OFF). M still
// turns sound on and off at once. The voices and Crowd are remembered in this browser (sound itself can't be:
// browsers need a click first, so every load starts silent). It closes with the speaker, a click elsewhere, or Escape.
// Each switch has a lamp, lit when on (Tom's pick of three looks, Task 129); no strike-through when off (Tom, Task 256).
import { $, el } from './dom.js';

const STORE_KEY = 'scorchball.levels';

/** @typedef {{ crowd: boolean, commentary: boolean, studio: boolean }} State */
/** @typedef {'sound' | 'crowd' | 'commentary' | 'studio'} Switch */

/** What was remembered in this browser, or the defaults (all on). @returns {State} */
function remembered() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    // Saved before Task 256: one switch for every voice (Voices, or Commentary before Task 135), carried to both.
    if (saved.studio === undefined) {
      const voices = (saved.voices ?? saved.commentary) !== false;
      return { crowd: saved.crowd !== false, commentary: voices, studio: voices };
    }
    return { crowd: saved.crowd !== false, commentary: saved.commentary !== false, studio: saved.studio !== false };
  } catch {
    return { crowd: true, commentary: true, studio: true };
  }
}

/**
 * @param {{ isSoundOn: () => boolean, setSound: (on: boolean) => void, setCrowd: (on: boolean) => void,
 *   setCommentary: (on: boolean) => void, setStudio: (on: boolean) => void }} hooks
 *   setSound is called from the click itself, so audio may start.
 */
export function createLevels({ isSoundOn, setSound, setCrowd, setCommentary, setStudio }) {
  const box = $('levels');
  const topbar = $('topbar');
  const state = remembered();
  const apply = () => {
    setCrowd(state.crowd);
    setCommentary(state.commentary);
    setStudio(state.studio);
  };
  apply();
  /** @type {Switch[]} */
  const ids = ['sound', 'crowd', 'commentary', 'studio'];
  /** @type {Partial<Record<Switch, HTMLButtonElement>>} */
  const buttons = {};
  for (const id of ids) {
    const b = /** @type {HTMLButtonElement} */ (el('button', `lv lv-${id}`));
    b.innerHTML = '<span class="lv-lamp"></span><span class="lv-label"></span>';
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (id === 'sound') setSound(!isSoundOn());
      else {
        state[id] = !state[id];
        apply();
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(state));
        } catch { /* storage blocked: it just isn't remembered */ }
      }
      render();
    });
    buttons[id] = b;
    box.append(b);
  }

  /** A switch's label, whether it's on, and its tooltip. @param {Switch} id */
  function face(id) {
    if (id === 'sound') return { label: 'SOUND', on: isSoundOn(), title: `Sound ${isSoundOn() ? 'on' : 'off'} (M)` };
    if (id === 'crowd') return { label: 'CROWD', on: state.crowd, title: `Crowd ${state.crowd ? 'on' : 'off'}` };
    if (id === 'commentary') return { label: 'COMMENTARY', on: state.commentary, title: `Commentary ${state.commentary ? 'on' : 'off'}` };
    return { label: 'STUDIO', on: state.studio, title: `The studio's voices (the desk, the interview) ${state.studio ? 'on' : 'off'}` };
  }

  function render() {
    const sound = isSoundOn();
    for (const id of ids) {
      const b = /** @type {HTMLButtonElement} */ (buttons[id]);
      const f = face(id);
      /** @type {HTMLElement} */ (b.querySelector('.lv-label')).textContent = f.label;
      b.classList.toggle('on', f.on);
      // The others are only heard with sound on: shown dimmed (but still switchable) while it's off.
      b.classList.toggle('muted', id !== 'sound' && !sound);
      b.title = f.title;
    }
  }

  const isOpen = () => !box.hidden;
  /** @param {boolean} open */
  function show(open) {
    box.hidden = !open;
    topbar.classList.toggle('levels-open', open);
    $('bug-sound').classList.toggle('lit', open);
    if (open) render();
  }
  window.addEventListener('pointerdown', (e) => {
    if (isOpen() && !box.contains(/** @type {Node} */ (e.target)) && !$('bug-sound').contains(/** @type {Node} */ (e.target))) show(false);
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') show(false); });
  render();
  return { toggle: () => show(!isOpen()), show, render, isOpen };
}
