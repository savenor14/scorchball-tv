// The AUDIENCE pane's MOMENTS tab (Milestone 5¾; docs/channel.md §25; Tom's picks on moments.html): what a moment is
// and how they come, then a wall of stubs two to a row by group (each kind's icon on its stub, its step on the paper, dimmed
// until seen), the secrets (a ? until found, then their own icon), and at the foot the notices' switch and how
// moments are kept. A kind opens its page in the tab's place (its steps with the dates reached; by team for goals and
// whole matches), a found secret its own (what it was, when, what was on air); ‹ MOMENTS back, to the wall where it was
// scrolled to. The tab keeps its place (Tom, 2026-10-20): leaving it and coming back shows the page that was open, as
// far down as it was (for this visit, not kept).
import { crestCanvas } from '../crests.js';
import { iconSvg } from '../momentIcons.js';
import { byTeamOf, progressOf } from '../moments.js';
import { el } from './dom.js';

/**
 * @param {object} o
 * @param {any} o.config
 * @param {import('../moments.js').MomentData} o.data
 * @param {() => void} o.onChange  The notices' switch changed (to save).
 * @param {(page: boolean) => void} o.onPage  A page opened (true) or back to the wall: the pane hides its tabs on a page.
 * @param {() => HTMLElement} o.scroller  What scrolls (the pane's body).
 */
export function createMomentsView({ config, data, onChange, onPage, scroller }) {
  const m = config.moments;
  const teams = Object.fromEntries(/** @type {any[]} */ (config.teams.teams).map((t) => [t.id, t]));
  const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: config.settings.live.timeZone, day: 'numeric', month: 'short' });
  /** "24 OCT", from minutes since 1970. @param {number | null | undefined} min */
  const date = (min) => (min == null ? '–' : dateFmt.format(new Date(min * 60_000)).toUpperCase());
  const body = el('div', 'mo');
  /** The page open: a kind's or a secret's id, or null for the wall. @type {string | null} */
  let opened = null;
  /** How far down the wall was when a page opened, to go back to. */
  let wallTop = 0;
  /** How far down the tab was when it was left (keep), to come back to. */
  let keptTop = 0;

  /** @param {string} id */
  const icon = (id) => {
    const s = el('span', '');
    s.style.display = 'contents';
    s.innerHTML = iconSvg(id);
    return s;
  };

  function render() {
    const kind = opened && m.kinds.find((/** @type {any} */ k) => k.id === opened);
    const secret = opened && !kind && data.secrets[opened] ? m.secrets.find((/** @type {any} */ s) => s.id === opened) : null;
    if (opened && !kind && !secret) opened = null;
    body.replaceChildren(...(kind ? kindPage(kind) : secret ? secretPage(secret) : wall()));
    onPage(!!opened);
  }

  /** @param {string | null} id */
  const open = (id) => {
    const sc = scroller();
    if (!opened && id) wallTop = sc.scrollTop;
    opened = id;
    render();
    sc.scrollTop = id ? 0 : wallTop;
  };

  function wall() {
    const out = [el('div', 'mo-intro', ['A moment is something you saw live: a goal, a burn, a hat-trick, an interview, a whole match. Each one levels up as you see more. Replays and highlights don\'t count: find the next live match marked in red in the ', el('b', '', ['SCHEDULE']), ' (V).'])];
    for (const group of m.groups) {
      out.push(el('div', 'mo-h', [group]));
      const grid = el('div', 'mo-grid');
      for (const k of m.kinds.filter((/** @type {any} */ x) => x.group === group)) {
        const p = progressOf(data, k);
        const b = el('button', `mo-tile${p.level ? '' : ' none'}`, [el('span', 'n', [icon(k.id)]), el('span', 'w', [el('b', '', [p.level ? String(p.level) : '–']), k.name])]);
        b.title = p.level ? `${p.n} so far${p.next ? ` · next at ${p.next}` : ''}` : 'Not yet seen';
        b.addEventListener('click', () => open(k.id));
        grid.append(b);
      }
      out.push(grid);
    }
    const found = m.secrets.filter((/** @type {any} */ s) => data.secrets[s.id]).length;
    out.push(el('div', 'mo-h', [`SECRETS · ${found} OF ${m.secrets.length}`]));
    const grid = el('div', 'mo-grid');
    for (const s of m.secrets) {
      if (data.secrets[s.id]) {
        const b = el('button', 'mo-tile secret', [el('span', 'n', [icon(s.id)]), el('span', 'w', [s.name])]);
        b.addEventListener('click', () => open(s.id));
        grid.append(b);
      } else grid.append(el('div', 'mo-tile hidden', [el('span', 'n', [icon('secret')]), el('span', 'w', ['A SECRET'])]));
    }
    out.push(grid);
    const sw = el('button', 'mo-switch', ['NOTICES ', el('b', '', [data.notices ? 'ON' : 'OFF'])]);
    sw.title = 'Show a notice when you reach a moment';
    sw.addEventListener('click', () => { data.notices = !data.notices; onChange(); render(); });
    out.push(el('div', 'mo-foot', [sw, el('b', '', ['Currently, moments are kept in this browser.']), " They stay on this device, in this browser only. A private window doesn't keep them, clearing your browser's data erases them, and Safari forgets them after a week away."]));
    return out;
  }

  function back() {
    const b = el('button', 'card-back', ['‹ MOMENTS']);
    b.addEventListener('click', () => open(null));
    return b;
  }

  /** @param {any} k */
  function kindPage(k) {
    const p = progressOf(data, k);
    const l = el('span', 'l', [icon(k.id)]);
    // The stub says the step reached, as its notice did (Tom); a bar shows how far to the next.
    const big = el('div', `mo-stub mo-big${p.level ? '' : ' none'}`, [l, el('span', 'r', [el('span', 'k', [p.level ? 'MOMENT' : 'NOT YET SEEN']), el('span', 't', [!p.level ? k.name : p.level === 1 ? k.first : `${p.level} ${k.seen}`])])]);
    const from = p.level;
    const fill = el('i', '');
    fill.style.width = `${p.next ? Math.min(100, ((p.n - from) / (p.next - from)) * 100) : 100}%`;
    const bar = el('div', 'mo-prog', [el('div', 'bar', [fill]), el('div', 'c', [p.next ? `${p.n} / ${p.next}` : `${p.n} · THE TOP STEP`])]);
    const steps = el('div', 'mo-steps');
    k.steps.forEach((/** @type {number} */ s, /** @type {number} */ i) => {
      const got = i < p.when.length;
      // The first step without "seen", so each row keeps to one line (Tom).
      const words = s === 1 ? k.short ?? String(k.first).replace(/ SEEN$/, '') : `${s} ${k.row ?? k.name}`;
      steps.append(el('span', got ? 'got' : 'not', [String(s)]), el('span', got ? '' : 'not', [words]), el('span', got ? '' : 'not', [got ? date(p.when[i]) : '–']));
    });
    const out = [back(), big, bar, el('div', 'mo-h', ['THE STEPS']), steps];
    if (k.byTeam && p.n > 0) {
      const counts = byTeamOf(data, k.byTeam);
      const t = el('div', 'mo-team', [el('span', ''), el('span', 'h', ['BY TEAM']), el('span', 'h', [k.byTeam === 'goals' ? 'GOALS' : 'SEEN']), el('span', 'h', [k.byTeam === 'goals' ? '' : 'WON'])]);
      for (const [id, c] of Object.entries(counts).sort((a, b) => b[1].n - a[1].n)) {
        if (!teams[id]) continue;
        t.append(crestCanvas(document, teams[id], { scale: 1 }), el('span', '', [teams[id].abbr]), el('span', '', [String(c.n)]), el('span', '', [k.byTeam === 'goals' ? '' : String(c.won)]));
      }
      out.push(el('div', 'mo-h', ['']), t);
    }
    return out;
  }

  /** @param {any} s */
  function secretPage(s) {
    const f = data.secrets[s.id];
    const big = el('div', 'mo-stub mo-big secret', [el('span', 'l', [icon(s.id)]), el('span', 'r', [el('span', 'k', ['SECRET FOUND']), el('span', 't', [s.name])])]);
    return [back(), big, el('div', 'mo-how', [s.how]), el('div', 'mo-h', ['FOUND']), el('div', 'mo-when', [date(f.at)]), el('div', 'mo-when', [f.where])];
  }

  return {
    body,
    /** Draw the wall (or the page open) again, with the latest counts. */
    render,
    /** Back to the wall, at the top. */
    reset() { opened = null; keptTop = 0; },
    /** The tab left this far down: kept to come back to. @param {number} top */
    keep(top) { keptTop = top; },
    /** How far down to show it again. */
    keptTop: () => keptTop,
  };
}
