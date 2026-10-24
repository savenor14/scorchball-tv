// The league table panel (right). What it shows comes from tableView() in onScreen.js.
// Each team keeps its own row, so when the order changes the rows glide to their new places (settings.table.slideMs).
// A team's kit and letters open its card in the side panel's place (Task 224).
import { tableView } from '../onScreen.js';
import { linked } from './cardLinks.js';
import { $, el, kit, setText } from './dom.js';

/** How often the table is recomputed, in real ms. It changes at most a few times a minute. */
const REFRESH_MS = 250;

/**
 * @param {{ live: import('../liveLeague.js').LiveLeague, config: import('../../config.js').Config,
 *   timelineOf: (m: import('../liveLeague.js').LiveMatch) => import('../timeline.js').Timeline }} channel
 * @param {{ openTeam: (id: string) => void }} o
 */
export function createTablePanel({ live, config, timelineOf }, { openTeam }) {
  const { league } = live;
  const { slideMs } = config.settings.table;
  const title = $('table-title');
  const list = $('table-rows');
  /** @type {Map<string, HTMLLIElement>} One row per team, reused so it can slide. */
  const rows = new Map();
  let computedAt = -Infinity;

  return {
    /** @param {number} season @param {number} t */
    update(season, t) {
      const realNow = performance.now();
      if (realNow - computedAt < REFRESH_MS) return;
      computedAt = realNow;
      const view = tableView(live, season, t, timelineOf);
      setText(title, view.title);
      const key = JSON.stringify(view.rows);
      if (list.dataset.key === key) return;
      list.dataset.key = key;

      // Where each row is now, before re-ordering.
      const before = new Map([...rows].map(([id, li]) => [id, li.isConnected ? li.getBoundingClientRect().top : null]));
      const ordered = view.rows.map((r) => {
        let li = rows.get(r.teamId);
        if (!li) rows.set(r.teamId, (li = /** @type {HTMLLIElement} */ (el('li'))));
        const gd = r.goalDifference > 0 ? `+${r.goalDifference}` : String(r.goalDifference);
        li.replaceChildren(
          el('span', 'pos', [String(r.position)]), linked(kit(league.teams[r.teamId]), () => openTeam(r.teamId)), linked(el('span', '', [league.teams[r.teamId].abbr]), () => openTeam(r.teamId)),
          el('span', 'gp', [String(r.played)]), el('span', 'gd', [gd]), el('span', 'pts', [String(r.points)]),
        );
        li.classList.toggle('live', r.live);
        li.classList.toggle('cut', r.position === view.cut);
        return li;
      });
      list.replaceChildren(...ordered);

      // Slide: start each moved row at its old place, then let it glide to the new one.
      for (const [id, li] of rows) {
        const from = before.get(id);
        if (from == null || !slideMs) continue;
        const dy = from - li.getBoundingClientRect().top;
        if (Math.abs(dy) < 0.5) continue;
        li.style.transition = 'none';
        li.style.transform = `translateY(${dy}px)`;
        li.getBoundingClientRect(); // apply the start position before transitioning
        li.style.transition = `transform ${slideMs}ms ease-in-out`;
        li.style.transform = '';
      }
    },
  };
}
