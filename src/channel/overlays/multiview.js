// When several matches are live (the final round): a selector strip to flip between them, and goal alerts from the
// matches not on screen. The viewer's pick is theirs alone; the channel's own featured match stays the default. No AUTO
// chip since Task 110 (Tom: the strip was cramped): a red dot over the score marks the channel's pick, the underline the
// match on screen, and picking the dotted chip (or key 0) follows the channel again.
import { $, el, kit } from './dom.js';

/**
 * @param {{ league: import('../../sim/league.js').League, kitsOf: (homeId: string, awayId: string) => import('../kits.js').MatchKits }} channel
 * @param {(id: string | null) => void} onPick  Called with a match id, or null for Auto.
 */
export function createMultiview({ league, kitsOf }, onPick) {
  const strip = $('picker');
  const alertBox = $('alert');
  let stripKey = '';
  /** @type {string | null} The channel's pick, as last shown. */
  let featured = null;

  strip.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-pick]'));
    // Watching the channel's pick is following the channel: it only changes when that match ends, and then a viewer
    // pinned to it falls back to the channel anyway.
    if (chip) onPick(chip.dataset.pick === featured ? null : /** @type {string} */ (chip.dataset.pick));
  });

  return {
    /**
     * @param {{ id: string, homeId: string, awayId: string, score: [number, number], live: boolean }[] | null} matches  Null hides the strip.
     * @param {string | null} shownId  The match on screen.
     * @param {string | null} featuredId  The channel's pick.
     * @param {boolean} auto  The viewer is following the channel's pick (no longer shown; kept for the key).
     * @param {number | null} [flashIndex]  The match (1–4) whose goal is alerting: its chip flashes.
     */
    strip(matches, shownId, featuredId, auto, flashIndex = null) {
      if (!matches) {
        strip.hidden = true;
        stripKey = '';
        return;
      }
      strip.hidden = false;
      const key = JSON.stringify([matches, shownId, featuredId, auto, flashIndex]);
      if (key === stripKey) return;
      stripKey = key;
      featured = featuredId;
      const team = (/** @type {string} */ id) => league.teams[id];
      strip.replaceChildren(...matches.map((m, i) => {
        const kits = kitsOf(m.homeId, m.awayId); // the chips show the kits worn on the pitch
        const chip = el('button', `chip-pick${m.id === shownId ? ' on' : ''}${m.id === featuredId ? ' featured' : ''}${m.live ? '' : ' done'}${flashIndex === i + 1 ? ' flash' : ''}`, [
          // Kits, abbreviations and the score; keys 1–4 follow the chips left to right.
          kit({ colours: kits.home }), `${team(m.homeId).abbr} ${m.score[0]}-${m.score[1]} ${team(m.awayId).abbr}`, kit({ colours: kits.away }),
        ]);
        chip.dataset.pick = m.id;
        chip.title = `${team(m.homeId).name} v ${team(m.awayId).name} (key ${i + 1})${m.id === featuredId ? ": the channel's pick (key 0 to follow it)" : ''}`;
        return chip;
      }));
    },

    /** @param {import('../captions.js').Alert | null} a */
    alert(a) {
      if (!a) {
        alertBox.hidden = true;
        return;
      }
      alertBox.hidden = false;
      if (alertBox.dataset.key !== a.key) {
        alertBox.dataset.key = a.key;
        const stripe = el('span', 'alert-stripe');
        stripe.style.background = league.teams[a.teamId].colours.primary;
        alertBox.style.setProperty('--team', league.teams[a.teamId].colours.primary); // Broadcast: a pulsing border
        // Each team's kit before its abbreviation (Task 110).
        const words = a.text.split(' ').flatMap((w, i) => {
          const id = w === league.teams[a.homeId].abbr ? a.homeId : w === league.teams[a.awayId].abbr ? a.awayId : null;
          return [...(i > 0 ? [' '] : []), ...(id ? [kit(league.teams[id], 'kit tick-kit')] : []), w];
        });
        alertBox.replaceChildren(stripe, el('span', 'alert-text', words), el('span', 'alert-hint', [`press ${a.index} to watch`]));
      }
      alertBox.style.opacity = String(Math.min(1, a.f * 10, (1 - a.f) * 10));
    },
  };
}
