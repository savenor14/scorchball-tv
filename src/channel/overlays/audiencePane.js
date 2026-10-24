// The AUDIENCE pane (Task 260; docs/channel.md §23; Tom's picks in Task 259, audience.html): everything viewer-related,
// behind the Audience button. Two tabs (MOMENTS, Milestone 5¾), FEEDBACK first (Tom, 2026-10-18: FEEDBACK | COINS | MOMENTS): FEEDBACK (POLLS until 2026-10-14),
// which is the pane as it was (MOMENTS, momentsView.js, is the wall of stubs), under SUPPORT THE CHANNEL (donations, 2026-10-18: a link out to Ko-fi): TELL THE LEAGUE first (SEND A NOTE opens the note's form, Task 261:
// rising from the button row, look C, the line saying what was on air shown as it's sent), a line, then POLLS: the poll in gold with its status, then past polls, each opening in the pane's place as the cards do
// (‹ AUDIENCE). The poll opened: its crests, pick one (change your mind freely), then VOTE; once voted or closed, a
// plate in VOTE's place says the result goes on UPDATES. Tallies show only once the result is in the data. Full only.
import { crestCanvas } from '../crests.js';
import { pollsAt } from '../polls.js';
import { $, el } from './dom.js';
import { createMomentsView } from './momentsView.js';

/** How often an open pane checks whether a poll has opened or closed, ms. */
const REFRESH_MS = 10_000;
/** The note's form (Task 259, look C): rising from the button row over the side column and the pitch's corner, stage px. */
const FORM = { left: 300, top: 126, width: 180, height: 112 };

/**
 * @param {object} o
 * @param {ReturnType<typeof import('./pane.js').createPane>} o.pane
 * @param {import('../../config.js').Config} o.config
 * @param {ReturnType<typeof import('../calendar.js').createCalendar>} o.calendar
 * @param {ReturnType<typeof import('../audience.js').createAudience>} o.audience
 * @param {() => number} o.now  The channel's clock (epoch ms).
 * @param {() => string} o.onAir  The line saying what's on air, sent with a note (audience.js onAirLine).
 * @param {(open: boolean) => void} [o.onChange]  The pane opened or closed (to light its button).
 * @param {{ data: import('../moments.js').MomentData, onChange: () => void }} o.moments  The viewer's moments.
 * @param {(onPage: (page: boolean) => void) => ReturnType<typeof import('./coinsView.js').createCoinsView>} [o.coins]  Fan Coins'
 *   tab (docs/channel.md §29), between FEEDBACK and MOMENTS, while they're on.
 */
export function createAudiencePane({ pane, config, calendar, audience, now, onAir, onChange, moments, coins }) {
  const teams = Object.fromEntries(/** @type {any[]} */ (config.teams.teams).map((t) => [t.id, t]));
  const when = new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  /** "SUN 21:00". @param {number} t */
  const at = (t) => when.format(new Date(t)).toUpperCase().replace(',', '');
  const body = el('div', 'aud');
  /** What's open in the pane's place: a poll's id, or null (the list). */
  let opened = /** @type {string | null} */ (null);
  /** The option picked in the opened poll, before VOTE. */
  let picked = /** @type {string | null} */ (null);
  let sending = false;
  let failed = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;
  let shown = '';
  const form = createNoteForm({ audience, onAir, maxChars: config.settings.audience.noteMaxChars });
  /** The tab shown. @type {'moments' | 'coins' | 'polls'} */
  let tab = 'polls';
  const view = createMomentsView({ config, data: moments.data, onChange: moments.onChange, onPage: (page) => onPage(page), scroller: () => pane.scroller });
  /** Where MOMENTS is scrolled to is kept as it scrolls, to come back to after another tab or the pane closed (Tom, 2026-10-20). */
  pane.scroller.addEventListener('scroll', () => { if (pane.openId === 'audience' && tab === 'moments') view.keep(pane.scroller.scrollTop); });
  const onPage = (/** @type {boolean} */ page) => { if (bar.parentElement) bar.parentElement.hidden = page; };
  const coinsView = coins?.(onPage) ?? null;
  const tabs = /** @type {('moments' | 'coins' | 'polls')[]} */ (coinsView ? ['polls', 'coins', 'moments'] : ['polls', 'moments']).map((id) => {
    // The first tab holds the notes and the polls: FEEDBACK (Tom, 2026-10-14; was POLLS). COINS shows the balance.
    const b = el('button', 'guide-filter', [id === 'polls' ? 'FEEDBACK' : id.toUpperCase()]);
    b.addEventListener('click', () => { if (id === tab && id === 'moments') return; tab = id; coinsView?.reset(); opened = null; show(); });
    return { id, b };
  });
  const bar = el('div', 'guide-bar', tabs.map((x) => x.b));
  /** COINS' tab with the balance on it (Tom: there, not on the Audience button). */
  function labelCoins() {
    const b = tabs.find((x) => x.id === 'coins')?.b;
    if (b && coinsView) b.replaceChildren(...coinsView.tab());
  }
  /** What scrolls: the tab's own body. */
  const holder = el('div', '');

  /** The tab chosen, drawn. */
  function show() {
    tabs.forEach(({ id, b }) => b.classList.toggle('on', id === tab));
    labelCoins();
    if (tab === 'coins' && coinsView) {
      holder.replaceChildren(coinsView.body);
      coinsView.render();
      pane.scroller.scrollTop = 0;
    } else if (tab === 'moments') {
      holder.replaceChildren(view.body);
      view.render();
      pane.scroller.scrollTop = view.keptTop();
    } else {
      if (bar.parentElement) bar.parentElement.hidden = false;
      holder.replaceChildren(body);
      render();
    }
  }

  /** What the pane shows depends on: which polls are seen, each one's status and result, and this browser's votes. */
  const polls = () => pollsAt(config, calendar, now());
  const signature = () => {
    const { current, past } = polls();
    return JSON.stringify([current, ...past].map((p) => p && [p.id, p.status, !!p.votes, audience.votedFor(p.id)]));
  };

  function render() {
    shown = signature();
    const { current, past } = polls();
    const all = current ? [current, ...past] : past;
    const poll = opened ? all.find((p) => p.id === opened) : null;
    if (opened && !poll) opened = null;
    body.replaceChildren(...(poll ? (poll.votes ? resultsPage(poll) : pollPage(poll)) : listPage(current, past)));
    pane.scroller.scrollTop = 0;
  }

  /** @param {import('../polls.js').Poll | null} current @param {import('../polls.js').Poll[]} past */
  function listPage(current, past) {
    const send = el('button', 'aud-btn', ['SEND A NOTE']);
    send.addEventListener('click', () => form.open());
    const rows = [
      ...(current ? [row(current, true)] : []),
      ...past.map((p) => row(p, false)),
    ];
    // SUPPORT THE CHANNEL (donations, Tom's pick B on donate.html, 2026-10-18): an amber box on top, a plain link out
    // to Ko-fi in a new tab; nothing is loaded from Ko-fi.
    const donate = /** @type {HTMLAnchorElement} */ (el('a', 'aud-give-btn', ['DONATE ›']));
    donate.href = config.settings.audience.donateUrl;
    donate.target = '_blank';
    donate.rel = 'noopener noreferrer';
    return [
      el('div', 'aud-give', [
        el('div', 'aud-h', ['SUPPORT THE CHANNEL']),
        el('div', 'aud-note', ['Scorchball TV is free and always on. Donations help keep the channel going.']),
        donate,
      ]),
      el('div', 'aud-rule'),
      el('div', 'aud-h', ['TELL THE LEAGUE']),
      el('div', 'aud-note', ['Spotted a bug, or have an idea? Send a note to the League.']),
      send,
      el('div', 'aud-rule'),
      el('div', 'aud-h', ['POLLS']),
      ...(rows.length ? rows : [el('div', 'aud-note', ['No polls yet.'])]),
    ];
  }

  /** A poll in the list: the question, its status under it, and › to open it. @param {import('../polls.js').Poll} p @param {boolean} current */
  function row(p, current) {
    const voted = audience.votedFor(p.id);
    const sub = p.votes ? `CLOSED S${calendar.seasonAt(p.closesAt)} ${at(p.closesAt)} · ${total(p.votes)} VOTES`
      : p.status === 'closed' ? 'CLOSED · RESULT SOON'
        : `${voted ? 'VOTED' : 'OPEN'} · CLOSES ${at(p.closesAt)}`;
    const r = el('button', `aud-past${current ? ' current' : ''}`, [el('span', '', [p.question, el('span', 'sub', [sub])]), el('span', 'm', ['›'])]);
    r.addEventListener('click', () => { opened = p.id; picked = null; failed = false; render(); });
    return r;
  }

  /** Back to the list. */
  function back() {
    const b = el('button', 'card-back', ['‹ AUDIENCE']);
    b.addEventListener('click', () => { opened = null; render(); });
    return b;
  }

  /** The poll opened: pick, then VOTE; or, voted or closed, the plate. @param {import('../polls.js').Poll} p */
  function pollPage(p) {
    const voted = audience.votedFor(p.id);
    const state = voted ? 'voted' : p.status === 'closed' ? 'closed' : 'open';
    const poll = el('div', `aud-poll ${state}`, [
      el('div', 'aud-q', [p.question]),
      el('div', 'aud-note', [failed ? "Couldn't send your vote. Try again." : `${p.status === 'closed' ? 'Closed' : 'Closes'} ${at(p.closesAt)}`]),
    ]);
    for (const o of p.options) {
      const mine = voted === o.id;
      const opt = el('button', `aud-opt${mine ? ' mine' : state === 'open' && picked === o.id ? ' picked' : ''}`, [crestCanvas(document, teams[o.id], { scale: 1 }), o.label]);
      if (mine) opt.append(el('span', 'tag', ['YOUR VOTE']));
      opt.addEventListener('click', () => { if (state === 'open' && !sending) { picked = o.id; failed = false; render(); } });
      poll.append(opt);
    }
    if (state === 'open') {
      const vote = /** @type {HTMLButtonElement} */ (el('button', 'aud-btn', [sending ? 'SENDING…' : 'VOTE']));
      vote.disabled = !picked || sending;
      vote.addEventListener('click', async () => {
        if (!picked || sending) return;
        sending = true;
        render();
        failed = !(await audience.vote(p.id, picked));
        sending = false;
        render();
      });
      poll.append(vote);
    } else {
      // Voted or closed: a plate in VOTE's place, the same height, so nothing moves.
      poll.append(el('div', 'aud-btn aud-plate', ['RESULT ON UPDATES']));
    }
    return [back(), poll];
  }

  /** A poll whose result is in: each option's share, the winner in amber. @param {import('../polls.js').Poll} p */
  function resultsPage(p) {
    const votes = /** @type {Record<string, number>} */ (p.votes);
    const sum = total(votes);
    const best = Math.max(0, ...Object.values(votes));
    const rows = p.options.map((o) => ({ o, v: votes[o.id] ?? 0 })).sort((a, b) => b.v - a.v).map(({ o, v }) => {
      const fill = el('i', '');
      fill.style.width = `${best ? (v / best) * 100 : 0}%`;
      return el('div', `aud-res${v === best && v > 0 ? ' win' : ''}`, [crestCanvas(document, teams[o.id], { scale: 1 }), el('span', '', [teams[o.id].abbr]), el('span', 'bar', [fill]), el('span', 'r', [`${sum ? Math.round((v / sum) * 100) : 0}%`])]);
    });
    return [back(), el('div', 'aud-q', [p.question]), el('div', 'aud-note', [`Closed S${calendar.seasonAt(p.closesAt)} ${at(p.closesAt)} · ${sum} votes`]), ...rows];
  }

  const api = {
    /** Open MOMENTS (a notice clicked), or bring it forward if the pane is open on another tab. */
    openMoments() {
      if (pane.openId !== 'audience') api.toggle();
      tab = 'moments';
      view.reset();
      show();
    },
    /** Coins earned or the moment moved on: COINS' tab and, while it's open, the tab itself drawn again (a page stays where it is). */
    refreshCoins() {
      if (pane.openId !== 'audience' || !coinsView) return;
      labelCoins();
      if (tab !== 'coins') return;
      const top = pane.scroller.scrollTop;
      coinsView.render();
      pane.scroller.scrollTop = top;
    },
    /** New moments while MOMENTS is open: drawn again (a page stays where it is). */
    refresh() {
      if (pane.openId === 'audience' && tab === 'moments') {
        const top = pane.scroller.scrollTop;
        view.render();
        pane.scroller.scrollTop = top;
      }
    },
    /** Open or close the pane. */
    toggle() {
      pane.toggle('audience', () => ({
        title: 'AUDIENCE',
        bar,
        body: holder,
        onClose: () => { clearInterval(timer); form.close(); onChange?.(false); },
      }));
      if (pane.openId !== 'audience') return;
      opened = null;
      picked = null;
      failed = false;
      tab = 'polls';
      coinsView?.reset();
      show();
      // A poll may open or close while the pane is open: redrawn only when something it shows has changed.
      timer = setInterval(() => { if (tab === 'polls' && !sending && signature() !== shown) render(); }, REFRESH_MS);
      onChange?.(true);
    },
  };
  return api;
}

/**
 * The note's form (Task 261): a box ("A bug, an idea, anything!"), a count, the line saying what's on air (kept up to
 * date while it's open: the note takes it as sent), CANCEL and SEND; then THANKS. A wait between notes from one
 * browser (noteCooldownSeconds) shows in the count's place. Typing never reaches the channel's keys (M, V, B); Esc
 * closes the form.
 * @param {{ audience: ReturnType<typeof import('../audience.js').createAudience>, onAir: () => string, maxChars: number }} o
 */
function createNoteForm({ audience, onAir, maxChars }) {
  const box = el('div', 'fb');
  Object.assign(box.style, { left: px(FORM.left), top: px(FORM.top), width: px(FORM.width), height: px(FORM.height) });
  box.hidden = true;
  $('stage').append(box);
  const x = el('button', '', ['✕']);
  x.title = 'Close (Esc)';
  x.addEventListener('click', () => api.close());
  const head = el('div', 'fb-head', ['SEND A NOTE', x]);
  const area = /** @type {HTMLTextAreaElement} */ (el('textarea', ''));
  area.maxLength = maxChars;
  area.placeholder = 'A bug, an idea, anything!';
  area.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') api.close();
  });
  const sentWith = el('div', 'fb-sent');
  const count = el('span', 'fb-count');
  const cancel = el('button', '', ['CANCEL']);
  cancel.addEventListener('click', () => api.close());
  const send = /** @type {HTMLButtonElement} */ (el('button', 'send', ['SEND']));
  const failed = el('div', 'fb-failed', ["Couldn't send. Try again."]);
  failed.hidden = true;
  const writing = el('div', 'fb-body', [area, sentWith, failed, el('div', 'fb-foot', [count, cancel, send])]);
  const again = el('button', 'fb-again', ['SEND ANOTHER']);
  again.addEventListener('click', () => show(false));
  const thanks = el('div', 'fb-thanks', [el('b', '', ['THANKS']), 'Your note is with the League.', again]);
  let sending = false;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  let timer;

  /** The count (or the wait), SEND's state and the line, every second while open. */
  function tick() {
    const wait = audience.noteWait();
    count.textContent = wait > 0 ? `WAIT ${wait} S` : `${area.value.length} / ${maxChars}`;
    send.disabled = sending || wait > 0 || !area.value.trim();
    send.textContent = sending ? 'SENDING…' : 'SEND';
    sentWith.textContent = `SENT WITH IT: ${onAir()}`;
  }
  area.addEventListener('input', () => { failed.hidden = true; tick(); });
  send.addEventListener('click', async () => {
    if (send.disabled) return;
    sending = true;
    tick();
    const ok = await audience.note(area.value, onAir());
    sending = false;
    if (ok) {
      area.value = '';
      show(true);
    } else {
      failed.hidden = false;
      tick();
    }
  });

  /** The box or the thanks. @param {boolean} done */
  function show(done) {
    box.replaceChildren(head, done ? thanks : writing);
    failed.hidden = true;
    tick();
    if (!done) area.focus();
  }

  const api = {
    open() {
      if (!box.hidden) return;
      box.hidden = false;
      show(false);
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    },
    close() {
      box.hidden = true;
      clearInterval(timer);
    },
  };
  return api;
}

/** @param {number} n */
const px = (n) => `calc(var(--px) * ${n})`;

/** @param {Record<string, number>} votes */
const total = (votes) => Object.values(votes).reduce((a, b) => a + b, 0);
