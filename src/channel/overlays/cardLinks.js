// Names that open cards (It remembers, Tasks 222–224; docs/channel.md §20.7): a player's or a team's card opens in
// place of whatever the name was clicked in (the CHRONICLE pane, the side panel, the schedule), ‹ back to it. These
// are the pieces every host shares: a name made clickable, and a card's body. One level only (Tom): nothing on a card
// opens anything.
import { playerCardBody } from './playerCardView.js';
import { teamCardBody } from './teamCardView.js';

/** @typedef {{ kind: 'player' | 'team', id: string }} CardRef */

/**
 * Make a name (a player's, or a team's kit and letters) open its card: the pointer and underline on hover, as the
 * CHRONICLE's. The click goes no further (a row around it may open something of its own).
 * @template {HTMLElement} T @param {T} node @param {() => void} open
 */
export function linked(node, open) {
  node.classList.add('pl');
  node.title = 'Open their card';
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    open();
  });
  return node;
}

/**
 * A card's body, in the document.
 * @param {import('../liveLeague.js').LiveLeague} live @param {import('../../config.js').Config} config
 * @param {CardRef & { backLabel: string, onBack: () => void }} o
 */
export function cardBody(live, config, { kind, id, backLabel, onBack }) {
  const { chronicle, league } = live;
  return kind === 'team'
    ? teamCardBody(document, { chronicle, config, league, teamId: id, backLabel, onBack })
    : playerCardBody(document, { chronicle, config, league, playerId: id, backLabel, onBack });
}
