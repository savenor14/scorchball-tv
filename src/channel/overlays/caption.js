// The lower-third caption under the pitch. What it says comes from captions.js. Its stripe is the team's shirt in this
// match (after the clash rule).
import { PALETTE } from '../palette.js';
import { $, setText } from './dom.js';

/** @param {{ kitsOf: (homeId: string, awayId: string) => import('../kits.js').MatchKits }} channel */
export function createCaption({ kitsOf }) {
  const box = $('caption');
  return {
    /** @param {import('../captions.js').Caption | null} c @param {{ homeId: string, awayId: string }} [m]  The match it's about. */
    show(c, m) {
      if (!c) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      if (box.dataset.key !== c.key) {
        box.dataset.key = c.key;
        box.className = `overlay panel ${c.kind}`;
        setText($('caption-title'), c.title);
        setText($('caption-detail'), c.detail);
        const kits = m && kitsOf(m.homeId, m.awayId);
        // A record falling (Task 220b) has an amber stripe, whoever's team (gold is Fan Coins' alone, docs/colours.md).
        const colour = c.kind === 'record' ? PALETTE.accent : kits && c.teamId ? (c.teamId === m.homeId ? kits.home : kits.away).primary : PALETTE.accent;
        $('caption-stripe').style.background = colour;
        box.style.setProperty('--team', colour); // Broadcast: a goal's pulsing border
      }
      // Fade in over the first tenth, out over the last tenth.
      box.style.opacity = String(Math.min(1, c.f * 10, (1 - c.f) * 10));
    },
  };
}
