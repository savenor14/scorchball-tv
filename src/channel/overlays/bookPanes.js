// The Rulebook and About in the pop-up pane (Task 164; docs/channel.md §17.2; rulebook.js, data/rulebook.json). The
// Rulebook's sections sit in tabs fixed under the title (Tom's pick in Task 163), each a few numbered rules; the tab
// chosen is kept while the channel is open. About is a few short paragraphs, the last ones (the font, the version,
// the copyright) set dimmer; its GUIDE tab (Task 172) explains the screen and the channel's rhythm, each line beside
// the button's own icon, the scorebug's label or the heat meter where it has one. Mixed case, at the pane's 86 px.
// Its UPDATES tab (Task 265, Tom's pick B, the last tab; channel.md §24): the League's announcements, the newest in
// full, older ones a line each opening in the pane's place; a dot on INFO's button while there's one this browser
// hasn't seen, and INFO opens on UPDATES while it shows. The Rulebook reads the season's own rules, so a quiet rule
// change (Task 265: upkeep is never announced) still leaves it true.
import { announcementsAt } from '../announcements.js';
import { crestCanvas } from '../crests.js';
import { about, guide, rulebook } from '../rulebook.js';
import { seasonConfig } from '../../sim/rules.js';
import { buttonIcon } from './buttons.js';
import { $, el } from './dom.js';

/** The newest announcement this browser has seen in UPDATES (epoch ms). */
const SEEN_KEY = 'scorchball.updatesSeen';
/** How often the dot checks for a new announcement, ms. */
const DOT_MS = 10_000;
/** Each kind's chip. */
const CHIP = /** @type {Record<string, string>} */ ({ announcement: 'THE LEAGUE', poll_open: 'NEW POLL', poll_result: 'POLL RESULT', induction: 'HALL OF FAME' });

/**
 * @param {object} o
 * @param {ReturnType<typeof import('./pane.js').createPane>} o.pane
 * @param {import('../../config.js').Config} o.config
 * @param {(id: string, open: boolean) => void} [o.onChange]  A pane opened or closed (to light its button).
 * @param {ReturnType<typeof import('../calendar.js').createCalendar>} o.calendar
 * @param {() => number} o.now  The channel's clock (epoch ms).
 * @param {(unseen: boolean) => void} [o.onUnseen]  Whether there's an announcement this browser hasn't seen (INFO's dot).
 * @param {() => void} [o.onTour]  TAKE THE TOUR at the top of GUIDE (the tour, Milestone 5⅞).
 */
export function createBookPanes({ pane, config, onChange, calendar, now, onUnseen, onTour }) {
  /** The Rulebook as the season on screen plays it (its rules, after any change). */
  let book = rulebook(seasonConfig(config, calendar.seasonAt(now())));
  // Sections sharing a tab (Task 202: LEAGUE holds 4. The season and 5. The off-season) show together under it.
  const tabNames = [...new Set(book.sections.map((s) => s.tab))];
  let section = tabNames[0];

  const tabs = tabNames.map((name) => {
    const b = el('button', 'guide-filter', [name]);
    b.addEventListener('click', () => { section = name; showSection(); });
    return { id: name, b };
  });
  const bar = el('div', 'guide-bar', tabs.map((x) => x.b));
  const rules = el('div', 'rb');

  /** The chosen tab's sections: each its rules numbered by section (2.1, 2.2…), the book's intro above the first. */
  function showSection() {
    book = rulebook(seasonConfig(config, calendar.seasonAt(now())));
    tabs.forEach(({ id, b }) => b.classList.toggle('on', id === section));
    rules.replaceChildren(...book.sections.flatMap((s, i) => (s.tab !== section ? [] : [
      ...(i === 0 ? [el('div', 'rb-intro', [book.intro])] : []),
      el('div', 'rb-head', [`${i + 1}. ${s.title.toUpperCase()}`]),
      ...s.rules.map((r, j) => el('div', 'rb-rule', [el('span', 'n', [`${i + 1}.${j + 1}`]), el('span', '', [r])])),
    ])));
    pane.scroller.scrollTop = 0;
  }

  const aboutPage = el('div', 'rb rb-about');
  /** About's words, with the deploy's version once it's known (Task 277). @param {string} [version] */
  const fillAbout = (version) => {
    const text = about(config, version);
    aboutPage.replaceChildren(...text.paragraphs.map((p, k) => el('p', k >= text.paragraphs.length - text.small ? 'small' : '', [p])));
  };
  fillAbout();

  // The guide (Task 172): each item's picture, then its line.
  const g = guide(config);
  /** What sits beside an item: a button's icon, a scorebug label in its colour, the heat meter, or a swatch glowing with momentum. @param {ReturnType<typeof guide>['sections'][number]['items'][number]} i */
  const mark = (i) => {
    if (i.chip) return el('span', `rb-chip ${i.chipKind ?? 'next'}`, [i.chip]);
    if (i.heat) return el('span', 'rb-heat');
    if (i.momentum) return el('span', 'kit rb-momentum');
    if (!i.icon) return null;
    const box = el('span', 'rb-icon');
    // The scorebug's own speaker and layout switch, copied from the page; the row's buttons from their pixel rows.
    const own = i.icon === 'sound' ? $('bug-sound')?.querySelector('svg') : i.icon === 'layout' ? $('bug-layout')?.querySelector('svg.to-broadcast') : null;
    if (own) box.append(own.cloneNode(true));
    else box.innerHTML = buttonIcon(i.icon);
    return box;
  };
  const tourButton = el('button', 'aud-btn rb-tour', [config.tour.welcome.take]);
  tourButton.addEventListener('click', () => { pane.close(); onTour?.(); });
  const guidePage = el('div', 'rb rb-guide', [...(onTour ? [tourButton] : []), ...g.sections.flatMap((s, k) => [
    el('div', 'rb-head', [`${k + 1}. ${s.title.toUpperCase()}`]),
    ...s.items.map((i) => {
      const m = mark(i);
      // A label starts its line (labels are wide); an icon or the meter sits beside it.
      return i.chip ? el('div', 'rb-gitem', [/** @type {Node} */ (m), ' ', i.text]) : el('div', `rb-gitem${m ? ' pic' : ''}`, [...(m ? [m] : []), el('span', '', [i.text])]);
    }),
  ])]);
  let aboutTab = 'about';
  const aboutTabs = [['about', about(config).tab], ['guide', g.tab], ['updates', 'UPDATES']].map(([id, label]) => {
    const b = el('button', 'guide-filter', [label]);
    b.addEventListener('click', () => { aboutTab = id; opened = null; showAbout(); });
    return { id, b };
  });
  const aboutBar = el('div', 'guide-bar', aboutTabs.map((x) => x.b));
  const aboutBody = el('div', '');
  /** The About tab chosen: the paragraphs, the guide or UPDATES. */
  function showAbout() {
    aboutTabs.forEach(({ id, b }) => b.classList.toggle('on', id === aboutTab));
    aboutBody.replaceChildren(aboutTab === 'guide' ? guidePage : aboutTab === 'updates' ? updatesPage() : aboutPage);
    pane.scroller.scrollTop = 0;
  }

  // UPDATES (Task 265).
  /** An older announcement opened in the pane's place. @type {string | null} */
  let opened = null;
  const teams = Object.fromEntries(/** @type {any[]} */ (config.teams.teams).map((t) => [t.id, t]));
  const when = new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  /** "SUN 22:00 · SEASON 1". @param {number} t */
  const stamp = (t) => `${when.format(new Date(t)).toUpperCase().replace(',', '')} · SEASON ${calendar.seasonAt(t)}`;
  const announced = () => announcementsAt(config, calendar, now());
  /** The newest seen in this browser (remembered; 0 where storage is blocked). */
  const seen = () => {
    try {
      return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0;
    } catch {
      return 0;
    }
  };
  const unseen = () => (announced()[0]?.at ?? 0) > seen();

  /** One announcement in full. @param {import('../announcements.js').Announcement} a */
  function item(a) {
    const parts = [el('div', 'upd-when', [stamp(a.at)]), el('div', `upd-kind ${a.kind}`, [CHIP[a.kind]]), el('div', 'upd-words', [a.words])];
    const winner = a.poll?.winner;
    if (winner) parts.push(el('div', 'upd-win', [crestCanvas(document, teams[winner.id], { scale: 1 }), `${winner.label} ${winner.share}%`]));
    if (a.kind === 'poll_open' && a.poll && now() < a.poll.closesAt) parts.push(el('div', 'upd-gold', ['VOTE IN AUDIENCE']));
    return el('div', 'upd-item', parts);
  }

  function updatesPage() {
    const list = announced();
    // Seen once UPDATES is shown: the dot goes.
    try {
      if (list[0]) localStorage.setItem(SEEN_KEY, String(list[0].at));
    } catch { /* storage blocked: the dot just comes back next time */ }
    onUnseen?.(false);
    if (!list.length) return el('div', 'upd', [el('div', 'upd-note', ['News from the League will appear here.'])]);
    const open = opened ? list.find((a) => a.id === opened) : null;
    if (open) {
      const back = el('button', 'card-back', ['‹ UPDATES']);
      back.addEventListener('click', () => { opened = null; showAbout(); });
      return el('div', 'upd', [back, item(open)]);
    }
    const [newest, ...older] = list;
    return el('div', 'upd', [
      item(newest),
      ...(older.length ? [el('div', 'upd-older', ['EARLIER'])] : []),
      ...older.map((a) => {
        const line = el('button', 'upd-line', [el('span', '', [a.headline, el('span', 'sub', [`${stamp(a.at)} · ${CHIP[a.kind]}`])]), el('span', 'm', ['›'])]);
        line.addEventListener('click', () => { opened = a.id; showAbout(); });
        return line;
      }),
    ]);
  }

  // INFO's dot: checked now and then, since an announcement can air while the channel is open.
  let dot = false;
  const checkDot = () => {
    const on = unseen() && !(pane.openId === 'about' && aboutTab === 'updates');
    if (on !== dot) onUnseen?.(on);
    dot = on;
  };
  setInterval(checkDot, DOT_MS);
  queueMicrotask(checkDot);

  /** @type {Record<string, () => import('./pane.js').PaneContent>} */
  const make = {
    rulebook: () => ({ title: 'RULEBOOK', bar, body: rules, onClose: () => onChange?.('rulebook', false) }),
    // INFO (Tom, Task 172): its tabs are ABOUT and GUIDE, and its button is an "i".
    about: () => ({ title: 'INFO', bar: aboutBar, body: aboutBody, onClose: () => onChange?.('about', false) }),
  };

  return {
    /** The deploy's version for About's small print (Task 277). @param {string} version */
    setVersion: (version) => fillAbout(version),
    /** Open or close the Rulebook or About. @param {'rulebook' | 'about'} id */
    toggle(id) {
      // While INFO's dot shows, it opens on UPDATES.
      if (id === 'about' && pane.openId !== 'about' && unseen()) { aboutTab = 'updates'; opened = null; }
      pane.toggle(id, make[id]);
      if (pane.openId === 'rulebook') showSection();
      if (pane.openId === 'about') showAbout();
      if (pane.openId === id) onChange?.(id, true);
      checkDot();
    },
  };
}
