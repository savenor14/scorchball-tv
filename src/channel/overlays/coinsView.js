// The AUDIENCE pane's COINS tab (Fan Coins; docs/channel.md §29, version 2 §29.6; Tom's picks on fancoins.html): the balance,
// today against the daily limit (at the limit, the time to midnight counting down), then each spend a line with its
// price and SPEND or why not now, and a few words on how they're earned (Tom: the order, not the rates) and kept. A
// spend opens in the tab's place: what it is, the choices (a message, a chant and its end, a side, a picture), SPEND,
// then where it shows. ‹ COINS back. Version 2 (2026-10-17, docs/channel.md §29.6): spends go to the audience service,
// which queues them for everyone; each line says its queue (how many ahead, about when, the free end), the viewer's own
// queued or on, and SPEND waits for the service's answer.
import { crestCanvas } from '../crests.js';
import { minutesToMidnight, picturesOf } from '../fanCoins.js';
import { el } from './dom.js';

/** The pixel icons, 9×9 like the buttons'. */
const ICONS = /** @type {Record<string, string[]>} */ ({
  coin: ['..#####..', '.#.....#.', '#..###..#', '#..#....#', '#..##...#', '#..#....#', '#..#....#', '.#.....#.', '..#####..'],
  ticker: ['.........', '.........', '#########', '#.......#', '#.##.##.#', '#.......#', '#########', '.........', '.........'],
  chant: ['.......#.', '.....###.', '...#####.', '##.#####.', '##.#####.', '...#####.', '.....###.', '.......#.', '.........'],
  flag: ['#........', '######...', '########.', '########.', '######...', '#........', '#........', '#........', '#........'],
  screen: ['#########', '#.......#', '#.#####.#', '#.#####.#', '#.......#', '#########', '...###...', '..#####..', '.........'],
  shout: ['.#######.', '#.......#', '#.#.#.#.#', '#.......#', '.#######.', '..##.....', '..#......', '.........', '.........'],
});
/** An icon as an inline SVG. @param {string} id */
export const coinIcon = (id) => `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${ICONS[id].flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : ''))).join('')}</svg>`;

/** @typedef {import('../fanCoins.js').SpendKind} SpendKind */
/** A spend of one's own once it's on: on its page and the bar under the scorebug. @type {Record<string, string>} */
export const ON_TITLES = { ticker: 'YOUR MESSAGE IS ON', chant: 'YOUR CHANT IS ON', flag: 'YOUR FLAG IS UP', shout: 'YOUR SHOUT IS UP', screen: 'YOUR BOARD IS UP' };
/** @typedef {'home' | 'away'} Side */
/** The spends, in the list's order: name, what's picked. */
const SPENDS = /** @type {const} */ ([
  { id: 'ticker', name: 'TICKER', pick: 'THE MESSAGE' },
  { id: 'shout', name: 'SHOUT', pick: 'THE SHOUT' },
  { id: 'chant', name: 'CHANT', pick: 'THE CHANT' },
  { id: 'flag', name: 'FLAG', pick: 'THE END' },
  { id: 'screen', name: 'FAN BOARD', pick: 'THE BOARD' },
]);

/**
 * What the pane needs to say when a spend shows (Tom: specific about where, when and how long; when it will appear,
 * as SCHEDULE has it): the live match's half (null with none on), when the next live match kicks off, and which ends
 * have a chant or flag going.
 * @typedef {{ half: 0 | 1 | 2 | null, nextLive: number | null, busy: Set<Side> }} When
 */

/**
 * @param {object} o
 * @param {any} o.config
 * @param {import('../fanCoins.js').CoinData} o.data
 * @param {(kind: SpendKind, end?: Side) => { ok: boolean, why: string, ahead?: number, starts?: number | null, own?: { starts: number } | null, free?: Side[], showing?: boolean }} o.stateOf
 *   Whether it can be spent now (in that end), and its queue (fanCoins.js queueState).
 * @param {(kind: SpendKind, pick: { choice: string, side?: Side }) => Promise<{ ok: boolean, why: string, starts?: number }>} o.spend
 *   Spend it: the service queues it (or says why not).
 * @param {() => number} o.now  Channel time, for the countdowns.
 * @param {{ full: () => boolean, go: () => void }} o.broadcast  Whether the channel is in Full, and the switch to Broadcast.
 * @param {() => { homeId: string, awayId: string } | null} o.matchOnScreen  The live match on screen, for a chant's end and a flag's.
 * @param {(end: Side) => { words: string, index: number }[]} o.shoutsFor  A fan shout's words for an end (its team, its top scorer), with its number in data/fanCoins.json.
 * @param {() => Set<string> | null} [o.boardTeams]  FAN BOARD's teams in the playoffs (fanCoins.js boardTeams); null: every team.
 * @param {() => When} o.when
 * @param {(t: number) => string} o.time  "WED 14:32", in the league's zone as SCHEDULE shows it.
 * @param {(page: boolean) => void} o.onPage  A spend opened (true) or back to the list: the pane hides its tabs on a page.
 */
export function createCoinsView({ config, data, stateOf, spend, now, broadcast, matchOnScreen, shoutsFor, boardTeams, when, time, onPage }) {
  const s = config.settings.fanCoins;
  const teams = Object.fromEntries(/** @type {any[]} */ (config.teams.teams).map((t) => [t.id, t]));
  const pictures = picturesOf(config);
  const chants = /** @type {any[]} */ (config.fanCoins.chants);
  const body = el('div', 'fc');
  /** The spend open, its choice and end, and what the plate said once it was spent. */
  const page = { opened: /** @type {SpendKind | null} */ (null), picked: 0, side: /** @type {Side} */ ('home'), spent: /** @type {string | null} */ (null), sending: false, error: '' };
  /** "04:20" to a moment. @param {number} t */
  const until = (t) => {
    const sec = Math.max(0, Math.ceil((t - now()) / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
  };
  /** A line for a spend that can be spent: its queue, the free end, or where and how long. @param {SpendKind} kind @param {ReturnType<typeof stateOf>} st @param {When} w */
  const queueLine = (kind, st, w) => {
    if ((kind === 'chant' || kind === 'flag' || kind === 'shout') && st.free?.length === 1) return `NOW · ${st.free[0].toUpperCase()} END FREE`;
    if (st.ahead && st.starts) return `QUEUE: ${st.ahead} AHEAD · IN ${until(st.starts)}`;
    return brief(kind, w);
  };

  /** @param {string} id */
  const icon = (id) => {
    const x = el('span', '');
    x.style.display = 'contents';
    x.innerHTML = coinIcon(id);
    return x;
  };
  /** "half-time" or "full time", as the live match is now. @param {When} w */
  const halfEnd = (w) => (w.half === 2 ? 'full time' : 'half-time');

  /** The list's line under a spend: where and for how long, or why not now. @param {SpendKind} kind @param {When} w */
  function brief(kind, w) {
    if (kind === 'ticker') return `${s.tickerMinutes} MIN ON THE TICKER`;
    if (kind === 'screen') return `${s.screenMinutes} MIN BESIDE SCOREBUG`;
    if (kind === 'shout') return `LIVE · ${s.shoutSeconds} S OVER THE FANS`;
    return `LIVE · TO ${halfEnd(w).toUpperCase()}`;
  }

  /** A spend's words on its page: where it shows, when, how long, how often. @param {SpendKind} kind @param {When} w */
  function about(kind, w) {
    const live = w.half !== null;
    const next = w.nextLive ? ` The next live match kicks off ${time(w.nextLive)} (SCHEDULE, V).` : '';
    switch (kind) {
      case 'ticker': return `Your message joins the ticker at the end of the line scrolling in and stays on it for ${s.tickerMinutes} minutes, one message after another. One of yours at a time.`;
      case 'chant': return live
        ? `In this live match: your end sings it now, and again every ${s.chantEverySeconds} seconds until ${halfEnd(w)}. One chant a half; one chant or flag per end at a time.`
        : `In a live match only: your end sings it every ${s.chantEverySeconds} seconds until half-time or full time.${next}`;
      case 'shout': return live
        ? `In this live match: your words pop up over your end's fans as soon as you're in Broadcast (after a goal's celebration, if one's on) and stay ${s.shoutSeconds} seconds, one shout after another at each end. One of yours at a time.`
        : `In a live match only: your words pop up over your end's fans for ${s.shoutSeconds} seconds.${next}`;
      case 'flag': return live
        ? `In this live match: held up by your end now, until ${halfEnd(w)}. One flag a half; one chant or flag per end at a time.`
        : `In a live match only: held up by your end until half-time or full time.${next}`;
      default: return `Your board goes up beside the scorebug in Full, where the ads show, for ${s.screenMinutes} minutes, one board after another. Not in the final round; in the playoffs, only the teams still in it.`;
    }
  }

  /** What the plate says once it's spent. @param {SpendKind} kind @param {When} w */
  function plate(kind, w) {
    switch (kind) {
      case 'ticker': return `ON THE TICKER NOW, FOR ${s.tickerMinutes} MIN`;
      case 'chant': return `SUNG NOW, THEN EVERY ${s.chantEverySeconds} S TILL ${halfEnd(w).toUpperCase()}`;
      case 'flag': return `UP NOW, TILL ${halfEnd(w).toUpperCase()}`;
      case 'shout': return `OVER THE FANS NOW, FOR ${s.shoutSeconds} S`;
      default: return `BESIDE THE SCOREBUG, FOR ${s.screenMinutes} MIN`;
    }
  }

  // The tab is drawn again every second while it's open (its waits and countdowns). A click needs the same button under
  // the press and the release (Tom, 2026-10-21: a choice sometimes didn't take), so nothing is redrawn while a press is
  // down in it; the redraw waits for the click to go through. One that would change nothing is skipped.
  let pressed = false;
  let waiting = false;
  let drawn = '';
  body.addEventListener('pointerdown', () => { pressed = true; }, true);
  const release = () => {
    if (!pressed) return;
    pressed = false;
    // After the click (which follows the release), so its own redraw comes first.
    if (waiting) setTimeout(() => { if (waiting) render(); }, 0);
  };
  body.addEventListener('pointerup', release, true);
  body.addEventListener('pointercancel', release, true);
  body.addEventListener('pointerleave', release);

  function render() {
    if (pressed) {
      waiting = true;
      return;
    }
    waiting = false;
    const w = when();
    const nodes = page.opened ? spendPage(page.opened, w) : list(w);
    const html = nodes.map((n) => (n instanceof Element ? n.outerHTML : n.textContent)).join('');
    if (html !== drawn || !body.childElementCount) {
      drawn = html;
      body.replaceChildren(...nodes);
    }
    onPage(!!page.opened);
  }

  /** @param {When} w */
  function list(w) {
    const full = data.today >= s.dailyCap;
    const min = minutesToMidnight(Date.now());
    const out = [
      el('div', 'fc-bal', [icon('coin'), el('span', '', [el('b', '', [String(data.balance)]), el('small', '', ['FAN COINS'])])]),
      el('div', `fc-today${full ? ' full' : ''}`, [full ? `${s.dailyCap} OF ${s.dailyCap}: AT THE DAILY LIMIT` : `TODAY ${data.today} OF ${s.dailyCap}`]),
      el('div', 'fc-bar', [el('i', '')]),
    ];
    /** @type {HTMLElement} */ (out[2].firstChild).style.width = `${Math.min(100, (100 * data.today) / s.dailyCap)}%`;
    if (full) out.push(el('div', 'fc-small', [`RESETS IN ${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`]));
    // How they're earned, under the day's bar (Tom, 2026-10-17); no SPEND heading, the rows say it.
    out.push(el('div', 'fc-intro', ['Watching Scorchball TV earns Fan Coins that can be spent in various ways. Live matches and the off-season show earn the fastest. Fan Coins can only be earned while the channel is on screen. More to come!']));
    for (const x of SPENDS) {
      const st = stateOf(x.id);
      const why = st.own ? (st.own.starts > now() ? `YOURS: #${(st.ahead ?? 0) + 1} · IN ${until(st.own.starts)}` : 'YOURS IS ON') : st.why;
      const row = el('button', `fc-row${st.ok ? '' : ' off'}`, [icon(x.id), el('span', 'nm', [x.name]), el('span', 'pr', [icon('coin'), String(s.prices[x.id])]), el('span', ''), el('span', `st${st.ok ? ' ok' : ''}`, [st.ok ? queueLine(x.id, st, w) : why])]);
      row.addEventListener('click', () => {
        // A chant's end starts on one without a chant or flag going.
        Object.assign(page, { opened: x.id, picked: 0, side: (x.id === 'chant' || x.id === 'shout') && w.busy.has('home') ? 'away' : 'home', spent: null, error: '' });
        if (x.id === 'flag' && w.busy.has('home')) page.picked = 1;
        render();
      });
      out.push(row);
    }
    out.push(el('div', 'fc-foot', [
      el('b', '', ['Shared:']), " everyone watching sees and hears what's spent, in turn. Your Fan Coins belong to this browser: a private window doesn't keep them, and clearing your browser's data loses them.",
    ]));
    return out;
  }

  /** The choices for a spend: id, label, crest's team, and whether it can't be picked (an end that's busy). @param {SpendKind} kind @param {When} w */
  function choicesOf(kind, w) {
    const m = matchOnScreen();
    if (kind === 'chant') return chants.map((c) => ({ id: c.id, label: c.words, teamId: null, busy: false }));
    if (kind === 'shout') return m ? shoutsFor(page.side).map((x) => ({ id: String(x.index), label: x.words, teamId: null, busy: false })) : [];
    if (kind === 'flag') {
      return m ? /** @type {const} */ (['home', 'away']).map((side) => {
        const id = side === 'home' ? m.homeId : m.awayId;
        return { id: side, label: `THE ${teams[id].shortName.toUpperCase()} END`, teamId: id, busy: w.busy.has(side) };
      }) : [];
    }
    // FAN BOARD in the playoffs: the general boards and the teams still in it.
    const still = kind === 'screen' ? boardTeams?.() ?? null : null;
    return pictures.filter((p) => !p.teamId || !still || still.has(p.teamId)).map((p) => ({ id: p.id, label: p.words, teamId: p.teamId, busy: false }));
  }

  /**
   * The viewer's own spend (Tom's picks on coinqueue.html, 2026-10-17): queued, the queue's slots (the one showing, those
   * ahead, YOU, the rest free) with the countdown under them; on now, what it's doing, and for a spend in the stands
   * seen in Full, WATCH IN BROADCAST (nothing switches by itself).
   * @param {SpendKind} kind @param {ReturnType<typeof stateOf>} st @param {When} w
   */
  function ownPanel(kind, st, w) {
    const own = /** @type {{ starts: number }} */ (st.own);
    if (own.starts > now()) {
      const ahead = st.ahead ?? 0;
      const slots = [el('i', st.showing ? 'on' : '', ['NOW'])];
      for (let i = 0; i < ahead - (st.showing ? 1 : 0); i++) slots.push(el('i', 'ahead'));
      slots.push(el('i', 'you', ['YOU']));
      while (slots.length < 1 + s.shared.queueMax) slots.push(el('i', ''));
      return [
        el('div', 'fc-h', ['THE QUEUE']),
        el('div', 'fc-slots', slots),
        el('div', 'fc-legend', [`#${ahead + 1} IN THE QUEUE`]),
        el('div', 'fc-count', ['STARTS IN', el('b', '', [until(own.starts)])]),
        el('div', 'fc-small', [`${s.prices[kind]} spent · ${data.balance} left`]),
      ];
    }
    const out = [el('div', 'fc-done', [ON_TITLES[kind], el('small', '', [plate(kind, w)])])];
    if ((kind === 'chant' || kind === 'flag' || kind === 'shout') && broadcast.full()) {
      const go = el('button', 'fc-go', ['WATCH IN BROADCAST']);
      go.addEventListener('click', () => broadcast.go());
      out.push(go);
    }
    return out;
  }

  /** A spend opened: what it does and when, the choices, SPEND, then where it shows. @param {SpendKind} kind @param {When} w */
  function spendPage(kind, w) {
    const x = /** @type {typeof SPENDS[number]} */ (SPENDS.find((y) => y.id === kind));
    const choices = choicesOf(kind, w);
    // A shout's words change with its end (the team, its top scorer): keep the pick in range.
    if (page.picked >= choices.length) page.picked = 0;
    const end = kind === 'chant' || kind === 'shout' ? page.side : kind === 'flag' ? /** @type {Side | undefined} */ (choices[page.picked]?.id) : undefined;
    const st = stateOf(kind, end);
    const back = el('button', 'card-back', ['‹ COINS']);
    back.addEventListener('click', () => { page.opened = null; render(); });
    const out = [back, el('div', 'fc-bal', [icon(kind), el('span', '', [el('b', '', [x.name.length > 6 ? '' : x.name]), el('small', '', [x.name.length > 6 ? x.name : `${s.prices[kind]} FAN COINS`])])]), el('div', 'fc-small', [about(kind, w)])];
    // The viewer's own, queued or on (Tom's picks on coinqueue.html): in place of the choices and SPEND.
    if (st.own && !page.sending) return [back, out[1], ...ownPanel(kind, st, w)];
    out.push(el('div', 'fc-h', [x.pick]));
    choices.forEach((c, i) => {
      const b = el('button', `fc-opt${page.picked === i ? ' on' : ''}${c.busy ? ' busy' : ''}`, [...(c.teamId ? [crestCanvas(document, teams[c.teamId], { scale: 1 })] : []), c.busy ? `${c.label} (BUSY)` : c.label]);
      if (!c.busy) b.addEventListener('click', () => { page.picked = i; page.spent = null; render(); });
      out.push(b);
    });
    const m = matchOnScreen();
    if ((kind === 'chant' || kind === 'shout') && m) {
      // The end it comes from: for a chant, not one with a chant or flag going.
      out.push(el('div', 'fc-h', ['FROM']));
      for (const side of /** @type {const} */ (['home', 'away'])) {
        const team = teams[side === 'home' ? m.homeId : m.awayId];
        const busy = kind === 'chant' && w.busy.has(side);
        const b = el('button', `fc-opt${page.side === side ? ' on' : ''}${busy ? ' busy' : ''}`, [crestCanvas(document, team, { scale: 1 }), `THE ${team.shortName.toUpperCase()} END${busy ? ' (BUSY)' : ''}`]);
        if (!busy) b.addEventListener('click', () => { page.side = side; page.spent = null; render(); });
        out.push(b);
      }
    }
    if (page.sending) {
      out.push(el('button', 'fc-go off', ['SENDING…']));
    } else {
      if (page.error) out.push(el('div', 'fc-small', [page.error]));
      if (st.ok && st.ahead && st.starts) out.push(el('div', 'fc-small', [`${st.ahead} ahead of you: it starts in ${until(st.starts)}.`]));
      const go = el('button', `fc-go${st.ok ? '' : ' off'}`, st.ok ? [`SPEND ${s.prices[kind]}`, icon('coin')] : [st.own ? (st.own.starts > now() ? `YOURS IS QUEUED · IN ${until(st.own.starts)}` : 'YOURS IS ON') : st.why]);
      if (st.ok) {
        go.addEventListener('click', () => {
          const c = choices[page.picked];
          if (!c) return;
          Object.assign(page, { sending: true, error: '' });
          render();
          spend(kind, { choice: c.id, side: kind === 'flag' ? /** @type {Side} */ (c.id) : page.side }).then((r) => {
            page.sending = false;
            // Made: the page shows it as the viewer's own (queued, or on). Not made: why.
            if (!r.ok) page.error = r.why;
            render();
          });
        });
      }
      out.push(go);
    }
    return out;
  }

  return {
    body,
    render,
    /** Back to the list (the pane opened afresh, or another tab). */
    reset() { Object.assign(page, { opened: null, spent: null, sending: false, error: '' }); },
    /** The tab's label: COINS and the balance. */
    tab() { return [/** @type {Node | string} */ ('COINS'), el('span', 'fc-n', [String(data.balance)])]; },
  };
}

