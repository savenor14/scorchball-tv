// The schedule (the TV guide until Task 172, Tom: the About pane's GUIDE tab took the word) in the pop-up pane (Task 115; docs/channel.md §17.2; guide.js): today's programmes in capitals, live
// matches in red with their kits, re-airs in blue, what's on now marked with how far in, the past dimmed; ALL / MATCHES
// in a row fixed under the title (on this screen only, ALL each load). It opens at now and then stays where the viewer
// scrolls; now and its bar move along in place. A team opens its card in the schedule's place (Task 224), ‹ SCHEDULE
// back to where it was scrolled; the rows wait meanwhile. At its foot (Tom, after Fan Coins: the next live match should
// be known before midnight) a TOMORROW divider, then tomorrow's programmes up to and including its first live match,
// a touch dimmer; nothing at all until tomorrow can be built (its day key out, Task 271: Tom, so it never changes
// part-way through the day). At midnight tomorrow becomes the day.
import { guideAt } from '../guide.js';
import { cardBody, linked } from './cardLinks.js';
import { el, kit } from './dom.js';

/** How often the open guide moves now along (real ms). */
const TICK_MS = 1000;
const TAG = /** @type {Record<string, string>} */ ({ studio: 'STUDIO', opening: 'OPENING', champions: 'CHAMPIONS', awards: 'AWARDS', offseason: 'OFF-SEASON', preview: 'PLAYOFF PREVIEW', grounds: 'AROUND THE GROUNDS', vault: 'FROM THE VAULT', podcast: 'OFF THE BALL' });
/** The playoffs' marks, as the WEEK tab writes them. */
const STAGE = /** @type {Record<string, string>} */ ({ semifinal: 'SF', final: 'F' });
const MIN_MS = 60_000;
/** How long before asking again for a tomorrow that couldn't be built (its day key not out yet), real ms of the channel's clock. */
const NEXT_RETRY_MS = 60_000;

/**
 * @param {object} o
 * @param {ReturnType<typeof import('./pane.js').createPane>} o.pane
 * @param {Record<string, { abbr: string, colours: { primary: string, secondary: string } }>} o.teams
 * @param {import('../liveLeague.js').LiveLeague} o.live  For the cards.
 * @param {import('../../config.js').Config} o.config
 * @param {(t: number) => Promise<import('../guide.js').GuideDay | null>} o.dayAt  The day around a moment (worked out off the drawing thread); null if it couldn't be built yet.
 * @param {(t: number) => boolean} o.semisDone  Both of this season's semifinals have finished on screen (or there are none).
 * @param {string} o.timeZone
 * @param {() => void} [o.onChange]  The pane opened or closed (to light the button).
 */
export function createGuide({ pane, teams, live, config, dayAt, semisDone, timeZone, onChange }) {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const dayName = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
  /** @type {'all' | 'matches'} */
  let filter = 'all';
  /** @type {import('../guide.js').GuideDay | null} */
  let day = null;
  /** Tomorrow, for the foot (null until built, or while it can't be). @type {import('../guide.js').GuideDay | null} */
  let next = null;
  let asked = 0;
  let askedNext = 0;
  /** When tomorrow was last asked for and couldn't be built (asked again a minute on). */
  let nextTriedAt = -Infinity;
  let lastTick = -Infinity;
  /** What the rows were built for, so they're only rebuilt when something changes. */
  let builtKey = '';
  /** @type {HTMLElement | null} */
  let nowBar = null;
  /** @type {HTMLElement | null} */
  let nowRow = null;
  let scrollToNow = false;
  /** A team's card open in the schedule's place. */
  let carded = false;
  let scrolledTo = 0;

  const list = el('div', 'guide-list');
  const toggles = /** @type {const} */ (['all', 'matches']).map((f) => {
    const b = el('button', 'guide-filter', [f.toUpperCase()]);
    b.addEventListener('click', () => { filter = f; builtKey = ''; scrollToNow = true; showToggles(); lastTick = -Infinity; });
    return { f, b };
  });
  const bar = el('div', 'guide-bar', toggles.map((x) => x.b));
  const showToggles = () => toggles.forEach(({ f, b }) => b.classList.toggle('on', f === filter));

  /** A team's kit and letters, opening its card. @param {string} id */
  const team = (id) => [linked(el('span', 'tm', [kit(teams[id]), teams[id].abbr]), () => openCard(id))];

  /** @param {string} id */
  function openCard(id) {
    scrolledTo = pane.scroller.scrollTop;
    carded = true;
    if (bar.parentElement) bar.parentElement.hidden = true;
    pane.scroller.replaceChildren(cardBody(live, config, { kind: 'team', id, backLabel: 'SCHEDULE', onBack: closeCard }));
    pane.scroller.scrollTop = 0;
  }

  /** Back to the schedule, scrolled as it was. */
  function closeCard() {
    if (!carded) return;
    carded = false;
    if (bar.parentElement) bar.parentElement.hidden = false;
    pane.scroller.replaceChildren(list);
    pane.scroller.scrollTop = scrolledTo;
    lastTick = -Infinity;
  }

  /** One line. @param {ReturnType<typeof guideAt>[number]} e */
  function row(e) {
    /** @type {(Node | string)[]} */
    let what;
    if (e.kind === 'live' && e.round) what = ['FINAL ROUND'];
    // A reel of the playoffs' moments (Task 213): its name says what it is (no HL, so PLAYOFF SCORCHERS fits).
    else if (e.title) what = [e.title];
    else if (e.homeId && e.awayId) {
      const pre = e.kind === 'reair' ? 'REP ' : e.kind === 'highlights' ? 'HL ' : '';
      // The playoffs' mark a pixel along rather than a space (Tom: REP VAR V BGA SF was cut off).
      const stage = STAGE[e.stage ?? ''];
      what = [pre, ...team(e.homeId), ' V ', ...team(e.awayId), ...(stage ? [el('span', 'stage', [stage])] : [])];
    } else if (e.kind === 'live') what = [e.stage === 'final' ? 'THE FINAL' : 'LIVE'];
    else what = [`${e.repeat ? 'REP ' : ''}${TAG[e.kind] ?? e.kind.toUpperCase()}`];
    const r = el('div', `guide-row ${e.kind} ${e.state}${e.repeat ? ' repeat' : ''}`, [el('span', 'when', [hhmm.format(e.kickoff ?? e.from)]), el('span', 'what', what)]);
    if (e.state === 'now') {
      nowBar = el('span', 'guide-now-bar');
      r.append(nowBar);
      nowRow = r;
    }
    return r;
  }

  /** Bring the rows up to `now`: rebuilt only when what's on changes, the bar moved along every time. @param {number} now */
  function render(now) {
    if (!day) return;
    const rows = guideAt(day, now, { filter, semisDone: semisDone(now) });
    const key = `${day.from}|${filter}|${rows.findIndex((e) => e.state === 'now')}|${rows.filter((e) => e.state === 'past').length}|${semisDone(now)}|${next?.from ?? '-'}`;
    if (key !== builtKey) {
      builtKey = key;
      nowBar = null;
      nowRow = null;
      const top = pane.scroller.scrollTop;
      list.replaceChildren(...rows.map(row), ...tomorrow(now));
      pane.scroller.scrollTop = top;
    }
    const current = rows.find((e) => e.state === 'now');
    if (nowBar && current) nowBar.style.width = `${(100 * current.progress).toFixed(1)}%`;
    if (scrollToNow && nowRow) {
      scrollToNow = false;
      pane.scroller.scrollTop = Math.max(0, nowRow.offsetTop - pane.scroller.clientHeight / 3);
    }
  }

  /**
   * The foot: a TOMORROW divider, then tomorrow's programmes up to and including its first live match (with MATCHES on,
   * its matches up to it); nothing until tomorrow is built.
   * @param {number} now @returns {HTMLElement[]}
   */
  function tomorrow(now) {
    if (!day || !next || next.from !== day.until) return [];
    const head = el('div', 'guide-tomorrow', ['TOMORROW ', el('small', '', [`· ${dayName.format(next.from).toUpperCase().replace(',', '')}`])]);
    const rows = guideAt(next, now, { filter, semisDone: semisDone(now) });
    const first = rows.findIndex((e) => e.kind === 'live');
    return [head, ...rows.slice(0, first < 0 ? rows.length : first + 1).map((e) => { const r = row(e); r.classList.add('tomorrow'); return r; })];
  }

  /** Ask for tomorrow (the foot), once today is in. @param {number} now */
  function fetchNext(now) {
    if (!day || askedNext || (next && next.from === day.until) || now - nextTriedAt < NEXT_RETRY_MS) return;
    const id = ++askedNext;
    const want = day.until;
    dayAt(want + MIN_MS).then((d) => {
      if (id !== askedNext) return;
      askedNext = 0;
      if (!d) { nextTriedAt = now; return; }
      if (d.from === want) {
        next = d;
        lastTick = -Infinity;
      }
    });
  }

  /** Ask for the day around `now` if it isn't the one we have. @param {number} now */
  function fetchDay(now) {
    // At midnight tomorrow is the day (built already: no wait).
    if (next && now >= next.from && now < next.until && (!day || now >= day.until)) {
      day = next;
      next = null;
      builtKey = '';
      scrollToNow = true;
      pane.setSub(dayName.format(day.from).toUpperCase().replace(',', ''));
    }
    fetchNext(now);
    if ((day && now >= day.from && now < day.until) || asked) return;
    const id = ++asked;
    list.replaceChildren(el('div', 'guide-wait', ['LOADING THE DAY…']));
    dayAt(now).then((d) => {
      if (id !== asked) return;
      asked = 0;
      // Not built (a day key not out yet, Task 271): asked again on the next tick.
      if (!d) return;
      day = d;
      builtKey = '';
      scrollToNow = true;
      pane.setSub(dayName.format(d.from).toUpperCase().replace(',', ''));
      lastTick = -Infinity;
    });
  }

  return {
    get open() { return pane.openId === 'guide'; },
    /** Open or close the guide. @param {number} now */
    toggle(now) {
      pane.toggle('guide', () => ({ title: 'SCHEDULE', bar, body: list, onClose: () => { carded = false; onChange?.(); } }));
      if (pane.openId === 'guide') {
        showToggles();
        if (day) pane.setSub(dayName.format(day.from).toUpperCase().replace(',', ''));
        builtKey = '';
        scrollToNow = true;
        lastTick = -Infinity;
        fetchDay(now);
      }
      onChange?.();
    },
    /** Each frame: while open, now moves along (once a second) and a new day comes in at midnight. @param {number} now @param {number} real */
    update(now, real) {
      if (pane.openId !== 'guide' || carded || real - lastTick < TICK_MS) return;
      lastTick = real;
      fetchDay(now);
      render(now);
    },
  };
}
