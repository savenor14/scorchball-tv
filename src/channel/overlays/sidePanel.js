// The side panel right of the pitch (Task 32): tabs on top (STATS, TABLE, TOP, WEEK), the chosen view below, all
// within the 86 px column. What each view shows comes from ../sidePanel.js; TABLE is overlays/tablePanel.js. The tab is the viewer's own
// (a click or its key), starts on STATS every load, and isn't remembered.
// Names open cards in the panel's place, under the tabs (Task 224, Tom's pick B on names.html): STATS' teams and
// scorers, TABLE's teams (tablePanel.js), TOP's scorers, WEEK's teams. ‹ goes back to the view, as does any tab; while
// a card is open the views wait (a card never vanishes while it's read).
import { statsView, TABS, topView, weekView } from '../sidePanel.js';
import { cardBody, linked } from './cardLinks.js';
import { $, el, kit } from './dom.js';

/** How often the views are recomputed, in real ms. */
const REFRESH_MS = 250;
/** How many rows the lists show. */
const TOP_ROWS = 10;
/** Once the playoffs have a scorer (Task 141): this many of the season's, then as many of the playoffs'. */
const TOP_SPLIT_ROWS = 5;
const WEEK = { results: 4, upcoming: 6 };

/**
 * @param {{ live: import('../liveLeague.js').LiveLeague, league: import('../../sim/league.js').League, config: import('../../config.js').Config,
 *   timelineOf: (m: import('../liveLeague.js').LiveMatch) => import('../timeline.js').Timeline,
 *   playerName: (id: string) => string, formatTime: (t: number) => string,
 *   kitsOf: (homeId: string, awayId: string) => import('../kits.js').MatchKits }} channel
 * @param {{ update: (season: number, t: number) => void }} table  The TABLE view.
 */
export function createSidePanel(channel, table) {
  const { live, league, config, timelineOf, playerName, formatTime } = channel;
  const tabBox = $('side-tabs');
  const panel = $('side');
  const views = { stats: $('side-stats'), table: $('table'), top: $('side-top'), week: $('side-week') };
  /** @type {typeof TABS[number]['id']} */
  let tab = 'stats';
  let computedAt = -Infinity;
  let key = '';
  /** The card open in the panel's place, and the tab it was opened from. @type {(import('./cardLinks.js').CardRef & { tab: typeof TABS[number]['id'] }) | null} */
  let card = null;
  const holder = el('div', 'side-card');
  holder.hidden = true;
  panel.append(holder);

  const buttons = TABS.map((t) => {
    const b = el('button', 'side-tab', [t.label]);
    b.title = `${t.label} (${t.key.toUpperCase()})`;
    b.addEventListener('click', () => choose(t.id));
    return b;
  });
  tabBox.replaceChildren(...buttons);
  window.addEventListener('keydown', (e) => {
    const t = TABS.find((x) => x.key === e.key.toLowerCase());
    if (t && !e.ctrlKey && !e.metaKey && !e.altKey) choose(t.id);
  });

  /** @param {typeof TABS[number]['id']} id */
  function choose(id) {
    closeCard();
    tab = id;
    computedAt = -Infinity;
    key = '';
  }

  const team = (/** @type {string | null} */ id) => (id ? league.teams[id] : null);

  /** Open a card in the panel's place. @param {import('./cardLinks.js').CardRef} ref */
  function openCard(ref) {
    card = { ...ref, tab };
    const label = /** @type {string} */ (TABS.find((x) => x.id === tab)?.label);
    holder.replaceChildren(cardBody(live, config, { ...ref, backLabel: label, onBack: closeCard }));
    holder.scrollTop = 0;
    for (const node of Object.values(views)) node.hidden = true;
    holder.hidden = false;
  }

  /** Back to the view, brought up to date. */
  function closeCard() {
    if (!card) return;
    card = null;
    holder.hidden = true;
    holder.replaceChildren();
    computedAt = -Infinity;
    key = '';
  }

  /** A player's name that opens their card (if the chronicle has them yet). @param {string} id @param {string} [cls] */
  const playerLink = (id, cls = '') => {
    const s = el('span', cls, [playerName(id)]);
    return live.chronicle.players.has(id) ? linked(s, () => openCard({ kind: 'player', id })) : s;
  };
  /**
   * A team's kit and letters that open its card. The gap after the kit (STATS' heading) is the kit's margin, not a
   * space, so the underline stays under the letters (Tom).
   * @param {string} id @param {HTMLElement} swatch @param {boolean} [gap]
   */
  const teamLink = (id, swatch, gap = false) => {
    if (gap) swatch.style.marginRight = 'calc(var(--px) * 3)';
    return linked(el('span', 'tm', [swatch, league.teams[id].abbr]), () => openCard({ kind: 'team', id }));
  };

  return {
    openCard,
    /**
     * @param {import('../programme.js').Segment} seg @param {import('../liveLeague.js').LiveMatch | null} shown
     * @param {number} season @param {number} t
     */
    update(seg, shown, season, t) {
      TABS.forEach((x, i) => buttons[i].classList.toggle('on', x.id === tab));
      if (card) return;
      for (const [id, node] of Object.entries(views)) node.hidden = id !== tab;
      if (tab === 'table') {
        table.update(season, t);
        return;
      }
      const realNow = performance.now();
      if (realNow - computedAt < REFRESH_MS) return;
      computedAt = realNow;

      if (tab === 'stats') {
        const v = statsView(seg, shown, live, t, timelineOf);
        const k = JSON.stringify(v);
        if (k === key) return;
        key = k;
        if (!v) {
          views.stats.replaceChildren(el('p', 'side-empty', ['No match yet']));
          return;
        }
        const kits = channel.kitsOf(v.homeId, v.awayId);
        // The goals scroll in their own area, newest first (Tom, Task 109). Keep the viewer's place if they've
        // scrolled down; otherwise stay at the top, on the newest goal.
        const before = views.stats.querySelector('.side-goals');
        const scrolled = before ? before.scrollTop : 0;
        const goals = el('div', 'side-goals', [...v.scorers].reverse().map((s) => el('div', `side-goal${s.scorcher ? ' scorcher' : ''}`, [kit(league.teams[s.teamId]), ' ', el('span', 'min', [`${s.minute}'`]), ' ', playerLink(s.playerId)])));
        views.stats.replaceChildren(
          // Live in red, a replay in blue (docs/colours.md); FULL TIME, HIGHLIGHTS and UP NEXT in amber.
          el('p', `side-status${/^LIVE/.test(v.status) ? ' is-live' : /REPLAY/.test(v.status) ? ' is-replay' : ''}`, [v.status]),
          // When a re-aired or highlighted match was played (Tom).
          ...(v.played !== undefined ? [el('p', 'side-played', [`PLAYED ${formatTime(v.played).toUpperCase()}`])] : []),
          el('div', 'side-head', [el('span', ''), el('span', '', [teamLink(v.homeId, kit({ colours: kits.home }), true)]), el('span', '', [teamLink(v.awayId, kit({ colours: kits.away }), true)])]),
          ...v.rows.map(([label, a, b]) => el('div', label === 'GOALS' ? 'side-row goals' : 'side-row', [el('span', 'label', [label]), el('span', '', [a]), el('span', '', [b])])),
          ...(v.scorers.length ? [el('p', 'side-sub', ['SCORERS'])] : []),
          goals,
        );
        goals.scrollTop = scrolled;
        return;
      }

      if (tab === 'top') {
        // The season's (regular season) top scorers; once the playoffs have a scorer, fewer of them and the playoffs'
        // under them (Task 141).
        const playoffs = topView(live, t, timelineOf, TOP_SPLIT_ROWS, 'playoffs');
        const rows = topView(live, t, timelineOf, playoffs.length ? TOP_SPLIT_ROWS : TOP_ROWS);
        const k = JSON.stringify([rows, playoffs]);
        if (k === key) return;
        key = k;
        // The kit shows the team, so the row is just position, name and goals; the tooltip has the team.
        const list = (/** @type {typeof rows} */ rs) => rs.map((r, i) => {
          const row = el('div', 'side-list', [el('span', 'pos', [String(i + 1)]), kit(league.teams[r.teamId]), playerLink(r.playerId, 'name'), el('span', 'num', [String(r.goals)])]);
          row.title = `${playerName(r.playerId)}, ${league.teams[r.teamId].name}`;
          return row;
        });
        views.top.replaceChildren(
          el('p', 'side-sub', ['TOP SCORERS']),
          ...(rows.length ? list(rows) : [el('p', 'side-empty', ['No goals yet'])]),
          ...(playoffs.length ? [el('p', 'side-sub side-playoffs', ['PLAYOFFS']), ...list(playoffs)] : []),
        );
        return;
      }

      // WEEK
      const reairId = seg.kind === 'reair' ? seg.match.id : null;
      const rows = weekView(live, t, timelineOf, { ...WEEK, reairId });
      const k = JSON.stringify(rows);
      if (k === key) return;
      key = k;
      // Compact, to fit the column: the day on its own line before each day's fixtures, then "13:55 LIS v PCG";
      // results "FT SKA 5-5 KES", a live match "LIVE", a re-air "REP" (its score hidden). SF / F mark the playoffs.
      const label = /** @type {Record<string, string>} */ ({ live: 'LIVE', replay: 'REP', result: 'FT' });
      /** @type {HTMLElement[]} */
      const lines = [el('p', 'side-sub', ['THIS WEEK'])];
      let day = '';
      for (const r of rows) {
        const [d, time] = formatTime(r.kickoff).split(' ');
        if (r.kind === 'next' && d !== day) {
          day = d;
          lines.push(el('p', 'side-day', [d]));
        }
        const home = team(r.homeId);
        const away = team(r.awayId);
        const stage = r.stage === 'final' ? 'F ' : r.stage === 'semifinal' ? 'SF ' : '';
        const middle = r.score ? `${r.score[0]}-${r.score[1]}` : 'v';
        const row = el('div', `side-week ${r.kind}`, [
          el('span', 'when', [r.kind === 'next' ? time : label[r.kind]]),
          // Each team's kit before its abbreviation (Task 110).
          el('span', 'match', [stage, ...(home && r.homeId ? [teamLink(r.homeId, kit(home, 'kit tick-kit'))] : ['TBC']), ` ${middle} `, ...(away && r.awayId ? [teamLink(r.awayId, kit(away, 'kit tick-kit'))] : ['TBC'])]),
        ]);
        row.title = `${formatTime(r.kickoff)} ${home ? home.name : 'TBC'} v ${away ? away.name : 'TBC'}`;
        lines.push(row);
      }
      views.week.replaceChildren(...lines);
    },
  };
}
