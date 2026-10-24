// The Director's desk (director.html, Task 264; docs/director.md §8): Tom's page on the dev server, never published.
// PROPOSALS (each with its evidence and balance check: approve, with the League's words editable, or reject with a
// note), POLLS (each poll's running tally, Tom's eyes only), FEEDBACK (the notes, newest first: read, bug, idea) and
// REJECTIONS (the history, by watcher) and ROADMAP (Task 265b: the growth ideas, their status and notes, the notes
// linked to each; no timeline) and VIEWERS (Task 277e: the live site's viewers and this dev server's, counted from the
// channel's hellos) and TODAY (the daily Bluesky post, its picture and alt text). Everything goes through the dev
// server's /api/director/ (src/cli/directorDesk.js).
import { loadConfig } from '../config.js';
import { CARD, drawShareCard } from './shareCard.js';

const HEADERS = { 'x-director': '1', 'content-type': 'application/json' };
const MEASURE = /** @type {Record<string, string>} */ ({ goalsPerMatch: 'Goals per match', scorcherShare: 'Scorcher share (%)', burnsPerMatch: 'Burns per match' });

/** @type {any} */
let state = null;
/** TODAY's posts (getting the word out), fetched when the tab is first opened. @type {any} */
let today = null;
/** The teams, for the share card's crests and names (loaded with TODAY). @type {any} */
let teams = null;
let tab = 'proposals';
let unreadOnly = false;

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [kids] */
function el(tag, cls = '', kids = []) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  e.append(...kids);
  return e;
}
/** @param {string} text @param {() => void} onClick @param {string} [cls] */
function button(text, onClick, cls = '') {
  const b = /** @type {HTMLButtonElement} */ (el('button', cls, [text]));
  b.addEventListener('click', onClick);
  return b;
}
/** @param {string} text @param {boolean} [err] */
function say(text, err = false) {
  $('msg').textContent = text;
  $('msg').className = err ? 'err' : '';
}

/** @param {string} path @param {object} [body] */
async function api(path, body) {
  const res = await fetch(`/api/director/${path}`, body ? { method: 'POST', headers: HEADERS, body: JSON.stringify(body) } : { headers: HEADERS });
  if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
  return res.json();
}

async function load() {
  try {
    state = await api('state');
    render();
  } catch (err) {
    say(`Couldn't load the desk: ${err instanceof Error ? err.message : err} (is the dev server up to date? restart it after pulling)`, true);
  }
}

function render() {
  const r = state.report;
  $('ran').textContent = r ? `Last run: ${new Date(r.at).toLocaleString()} for season ${r.season} (${r.finished} finished, seed "${r.seed}")` : 'Not run yet.';
  const unread = state.notes.filter((/** @type {any} */ n) => !n.read).length;
  const tabs = [['proposals', `PROPOSALS (${r?.proposals.length ?? 0})`], ['polls', 'POLLS'], ['feedback', `FEEDBACK (${unread} unread)`], ['rejections', `REJECTIONS (${state.rejections.length})`], ['roadmap', 'ROADMAP'], ['viewers', `VIEWERS (${state.viewers.live?.watching ?? '?'} now)`], ['today', 'TODAY']];
  $('tabs').replaceChildren(...tabs.map(([id, label]) => button(label, () => { tab = id; render(); }, tab === id ? 'on' : '')));
  const body = $('body');
  body.replaceChildren(...(tab === 'proposals' ? proposals() : tab === 'polls' ? polls() : tab === 'feedback' ? feedback() : tab === 'roadmap' ? roadmap() : tab === 'viewers' ? viewers() : tab === 'today' ? todayTab() : rejections()));
}

/**
 * TODAY (getting the word out, docs/launch-plan.md): a finished day's post for the league's Bluesky account, to edit
 * and copy, with the day's best moment for a clip (opens clips.html at it). Days only once their last match is over by
 * the real clock, so nothing is posted ahead of what's aired.
 */
function todayTab() {
  if (!today) {
    Promise.all([api('today'), loadTeams()]).then(([r]) => { today = r; render(); }).catch((err) => say(`Couldn't make the posts: ${err instanceof Error ? err.message : err}`, true));
    return [el('p', 'muted', ["Rebuilding the league for the day's posts…"])];
  }
  if (!today.days.length) return [el('p', 'muted', ['No finished day yet this season or last.'])];
  const pick = /** @type {HTMLSelectElement} */ (el('select'));
  today.days.forEach((/** @type {any} */ d, /** @type {number} */ i) => { const o = el('option', '', [d.label]); o.setAttribute('value', String(i)); pick.append(o); });
  const text = /** @type {HTMLTextAreaElement} */ (el('textarea'));
  text.rows = 7;
  const count = el('span', 'muted');
  const clip = el('p', '');
  // The share card (Tom's pick D), drawn here, and its alt text (the whole day, for anyone who can't see it).
  const canvas = /** @type {HTMLCanvasElement} */ (el('canvas', 'share'));
  canvas.width = CARD.w;
  canvas.height = CARD.h;
  const alt = /** @type {HTMLTextAreaElement} */ (el('textarea'));
  alt.rows = 6;
  const show = () => {
    const d = today.days[Number(pick.value)];
    text.value = d.text;
    alt.value = d.alt;
    counted();
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, CARD.w, CARD.h);
    drawShareCard(ctx, d.card, teams);
    clip.replaceChildren(...(d.clip ? ['The clip: ', d.clip.label, ' · ', Object.assign(el('a', '', ['open in clips.html']), { href: `clips.html?at=${new Date(d.clip.moment).toISOString().slice(0, 19)}Z`, target: '_blank' })] : [el('span', 'muted', ['No moment stands out for a clip.'])]));
  };
  /** Copy a box's text. @param {HTMLTextAreaElement} box */
  const copy = async (box) => { try { await navigator.clipboard.writeText(box.value); say('Copied.'); } catch { box.select(); say('Select and copy (the clipboard was refused).', true); } };
  const download = () => canvas.toBlob((blob) => {
    if (!blob) return say("The picture couldn't be made.", true);
    const a = /** @type {HTMLAnchorElement} */ (el('a'));
    a.href = URL.createObjectURL(blob);
    a.download = `scorchball-${today.days[Number(pick.value)].key}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
  const counted = () => {
    const n = [...text.value].length;
    count.textContent = `${n} / 300`;
    count.className = n > 300 ? 'err' : 'muted';
  };
  pick.onchange = show;
  text.oninput = counted;
  show();
  return [
    el('p', 'muted', [`The league's daily post for Bluesky, from the live league as aired (${today.league}); a day appears once its last match is over. COPY the post, DOWNLOAD the picture and attach it, and COPY ALT into the picture's description (Bluesky asks for it). The link carries ?from=bsky, counted on VIEWERS.`]),
    el('div', 'card', [
      el('p', '', [pick]),
      text,
      el('p', '', [button('COPY', () => copy(text)), ' ', count]),
      canvas,
      el('p', '', [button('DOWNLOAD', download), ' ', el('span', 'muted', ['1200 × 675 PNG'])]),
      el('h3', '', ["The picture's alt text"]),
      alt,
      el('p', '', [button('COPY ALT', () => copy(alt))]),
      clip,
    ]),
  ];
}

/**
 * VIEWERS (Task 277e): watching now, the week (unique viewers, visits, a typical visit) and each day, for the live site
 * (from the audience service, with the desk's token) and for this dev server, apart. A visit's length runs to its last
 * hello, so it's up to helloMinutes short.
 */
function viewers() {
  const v = state.viewers;
  /** @param {string} title @param {any} st @param {string} none */
  const block = (title, st, none) => {
    if (!st) return el('div', 'card', [el('h2', '', [title]), el('p', 'muted', [none])]);
    const typical = st.typicalMinutes === null ? 'none yet' : `at least ${st.typicalMinutes} min`;
    return el('div', 'card', [
      el('h2', '', [title]),
      el('p', '', [`Watching now: ${st.watching} · this week: ${st.week} viewer${st.week === 1 ? '' : 's'}, ${st.visits} visit${st.visits === 1 ? '' : 's'} · a typical visit: ${typical}`]),
      el('table', '', [
        el('tr', '', ['Day', 'Viewers', 'Visits'].map((h) => el('th', '', [h]))),
        ...st.days.map((/** @type {any} */ d) => el('tr', '', [el('td', '', [d.day]), el('td', 'num', [String(d.viewers)]), el('td', 'num', [String(d.visits)])])),
      ]),
      // Where they came in (?from= on our posts' links; docs/launch-plan.md).
      ...(st.sources?.length ? [
        el('h3', '', ['Where from']),
        el('table', '', [
          el('tr', '', ['Link', 'Visits', 'Viewers', 'Typical visit', 'Came back'].map((h) => el('th', '', [h]))),
          ...st.sources.map((/** @type {any} */ s) => el('tr', '', [el('td', '', [s.from === 'direct' ? 'direct (no tag)' : `?from=${s.from}`]), el('td', 'num', [String(s.visits)]), el('td', 'num', [String(s.viewers)]), el('td', 'num', [s.typicalMinutes === null ? '–' : `${s.typicalMinutes} min`]), el('td', 'num', [String(s.cameBack)])])),
        ]),
      ] : []),
    ]);
  };
  const mine = v.list.filter((/** @type {any} */ r) => r.me).length;
  return [
    el('p', 'muted', [`Counted anonymously from the channel's hello, as it starts and every ${v.helloMinutes} minutes while it's showing (a hidden tab isn't counted). A viewer is a household (one network: every device on it is one viewer); a visit is a page load, its length to its last hello.`]),
    block('scorchball.tv', v.live, "The audience service couldn't be reached (AUDIENCE_TOKEN in .env, and a connection, are needed)."),
    ...(v.list.length ? [whoList(v.list, mine)] : []),
    block('This dev server', v.dev, ''),
  ];
}

/**
 * The week's viewers on scorchball.tv, most watched first (Task 278): Tom marks his own tag, and it's left out of the
 * figures above (anyone else on his network with it). Watching now on the site yourself? Yours is the one marked now.
 * @param {any[]} list @param {number} mine
 */
function whoList(list, mine) {
  const hm = (/** @type {number} */ m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
  return el('div', 'card', [
    el('h2', '', ['Who watched this week']),
    el('p', 'muted', [`Each viewer's tag, most watched first. Mark your own and it's left out of the figures above${mine ? ` (${mine} left out)` : ''}; kept on this computer only. If your address changes, mark the new tag too.`]),
    el('table', '', [
      el('tr', '', ['Viewer', 'Visits', 'Watched', 'Last heard', ''].map((h) => el('th', '', [h]))),
      ...list.map((r) => el('tr', r.me ? 'muted' : '', [
        el('td', '', [r.viewer, r.watching ? ' · now' : '']),
        el('td', 'num', [String(r.visits)]),
        el('td', 'num', [hm(r.minutes)]),
        el('td', '', [new Date(r.lastAt).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })]),
        el('td', '', [button(r.me ? 'NOT ME' : "THAT'S ME", async () => {
          try { await api('viewer', { viewer: r.viewer, me: !r.me }); await load(); } catch (err) { say(String(err), true); }
        })]),
      ])),
    ]),
  ]);
}

function proposals() {
  const r = state.report;
  if (!r) return [el('p', 'muted', ['Run the Director to see what it proposes.'])];
  /** @type {Node[]} */
  const out = [];
  if (r.measures.length) {
    const rows = r.measures.slice(-6).map((/** @type {any} */ m) => el('tr', '', [el('td', '', [`S${m.season}`]), el('td', 'num', [m.goalsPerMatch.toFixed(2)]), el('td', 'num', [`${m.scorcherShare.toFixed(1)}%`]), el('td', 'num', [m.burnsPerMatch.toFixed(2)])]));
    out.push(el('div', 'card', [el('h2', '', ['The last finished seasons']), el('table', '', [el('tr', '', ['Season', 'Goals/match', 'Scorchers', 'Burns/match'].map((h) => el('th', '', [h]))), ...rows])]));
  }
  if (!r.proposals.length) out.push(el('p', 'muted', ['No proposals: every measure is in its band (or its watcher silenced), and no closed poll is waiting for its result.']));
  for (const p of r.proposals) out.push(p.kind === 'rule_change' ? ruleCard(p) : pollCard(p));
  return out;
}

/** @param {any} p */
function ruleCard(p) {
  const e = p.evidence;
  const [lo, hi] = e.band;
  const seasons = el('table', '', [
    el('tr', '', [el('th', '', ['Season']), ...e.seasons.map((/** @type {any} */ s) => el('th', 'num', [`S${s.season}`]))]),
    el('tr', '', [el('td', '', [MEASURE[e.measure] ?? e.measure]), ...e.seasons.map((/** @type {any} */ s) => el('td', `num ${s.value < lo || s.value > hi ? 'out' : ''}`, [String(s.value)]))]),
  ]);
  const reason = /** @type {HTMLTextAreaElement} */ (el('textarea'));
  reason.rows = 2;
  reason.value = p.change.reason;
  const check = p.check === null ? el('span', 'muted', ['Balance check skipped.']) : p.check.ok ? el('span', 'ok', ['Balance check: every target the league meets today is still met.']) : el('span', 'out', [`Balance check: breaks ${p.check.broken.join(', ')}.`]);
  return el('div', 'card', [
    el('h2', '', [`RULE CHANGE · ${MEASURE[e.measure] ?? e.measure} ${e.side === 'low' ? 'too low' : 'too high'}`]),
    el('p', 'muted', [`Out of its band (${lo}–${hi}) for ${e.seasons.length} seasons running:`]),
    seasons,
    el('p', '', [`Change ${p.lever.path} from ${p.lever.from} to ${p.lever.to}, in force from season ${p.change.season}; aiming at about ${p.lever.expected} (the aim ${e.aim}). Quiet: never announced (upkeep, Task 265).`]),
    el('p', '', [check]),
    el('p', 'muted', ['Why (kept with the change, never announced):']),
    reason,
    actions(p, () => ({ reason: reason.value })),
  ]);
}

/** @param {any} p */
function pollCard(p) {
  return el('div', 'card', [
    el('h2', '', [`POLL RESULT · ${p.question}`]),
    tally(p.votes, state.polls.find((/** @type {any} */ x) => x.id === p.id)?.labels ?? null),
    el('p', '', [`${p.total} votes. Announced S${p.result.announced.season} ${p.result.announced.at}; the tally shows in PAST POLLS from then.`]),
    actions(p, () => ({})),
  ]);
}

/** APPROVE and REJECT (with a note). @param {any} p @param {() => object} extra */
function actions(p, extra) {
  const note = /** @type {HTMLInputElement} */ (el('input'));
  note.placeholder = 'a note (if rejecting)';
  note.size = 40;
  const row = el('div', 'row', [
    button('APPROVE', async () => {
      try {
        const { file } = await api('approve', { id: p.id, ...extra() });
        say(`Approved ${p.id}: written to ${file}. Commit it, then publish.`);
        await load();
      } catch (err) { say(`Not approved: ${err instanceof Error ? err.message : err}`, true); }
    }, 'go'),
    button('REJECT', async () => {
      try {
        await api('reject', { id: p.id, note: note.value });
        say(`Rejected ${p.id}: kept in data/rejections.json${p.kind === 'rule_change' ? '; its watcher is silent until the measure is back in its band' : ''}. Commit it with the rest.`);
        await load();
      } catch (err) { say(`Not rejected: ${err instanceof Error ? err.message : err}`, true); }
    }, 'no'),
    note,
  ]);
  row.style.marginTop = '8px';
  return row;
}

/** Each option's votes as a bar, most first. @param {Record<string, number>} counts @param {Record<string, string> | null} labels */
function tally(counts, labels) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const best = Math.max(1, ...Object.values(counts));
  return el('table', '', Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => {
    const bar = el('span', `bar${n === best && n > 0 ? '' : ' dim'}`);
    bar.style.width = `${(n / best) * 240}px`;
    return el('tr', '', [el('td', '', [labels?.[id] ?? id]), el('td', 'num', [String(n)]), el('td', 'num', [total ? `${Math.round((n / total) * 100)}%` : '–']), el('td', '', [bar])]);
  }));
}

function polls() {
  if (!state.polls.length) return [el('p', 'muted', ['No polls in data/polls.json.'])];
  return state.polls.slice().reverse().map((/** @type {any} */ p) => {
    const total = Object.values(p.counts).reduce((/** @type {number} */ a, /** @type {any} */ b) => a + b, 0);
    const when = `${new Date(p.opensAt).toLocaleString()} – ${new Date(p.closesAt).toLocaleString()}`;
    return el('div', 'card', [
      el('h2', '', [p.question]),
      el('p', 'muted', [`${p.status.toUpperCase()}${p.announced ? ', result announced' : ''} · ${when} · ${total} votes so far (only you see this)`]),
      tally(p.counts, p.labels),
    ]);
  });
}

function feedback() {
  const notes = state.notes.filter((/** @type {any} */ n) => !unreadOnly || !n.read);
  const head = el('div', 'row', [button(unreadOnly ? 'SHOWING UNREAD' : 'SHOWING ALL', () => { unreadOnly = !unreadOnly; render(); }), el('span', 'muted', [`${state.notes.length} notes in output/audience/notes.jsonl`])]);
  head.style.marginBottom = '10px';
  if (!notes.length) return [head, el('p', 'muted', [unreadOnly ? 'Nothing unread.' : 'No notes yet.'])];
  return [head, ...notes.map((/** @type {any} */ n) => {
    /** @param {object} patch */
    const mark = async (patch) => {
      try { await api('note', { at: n.at, ...patch }); await load(); } catch (err) { say(String(err), true); }
    };
    return el('div', `card note ${n.read ? 'read' : 'unread'}`, [
      el('div', 'row', [el('span', 'muted', [new Date(n.at).toLocaleString()]), ...(n.tag ? [el('span', `tag ${n.tag}`, [n.tag.toUpperCase()])] : [])]),
      el('p', 'text', [n.text]),
      el('p', 'muted', [`On air: ${n.onAir || '–'}`]),
      el('div', 'row', [
        button(n.read ? 'MARK UNREAD' : 'MARK READ', () => mark({ read: !n.read })),
        button('BUG', () => mark({ tag: n.tag === 'bug' ? null : 'bug' }), n.tag === 'bug' ? 'on' : ''),
        button('IDEA', () => mark({ tag: n.tag === 'idea' ? null : 'idea' }), n.tag === 'idea' ? 'on' : ''),
        linkPicker(n, mark),
      ]),
    ]);
  })];
}

/** A note's link to a roadmap idea (Task 265b): evidence building up behind it. @param {any} n @param {(patch: object) => void} mark */
function linkPicker(n, mark) {
  const pick = /** @type {HTMLSelectElement} */ (el('select'));
  pick.append(el('option', '', ['link to an idea…']), ...state.roadmap.ideas.map((/** @type {any} */ i) => el('option', '', [i.title])));
  [...pick.options].forEach((o, k) => { o.value = k === 0 ? '' : state.roadmap.ideas[k - 1].id; });
  pick.value = n.roadmap ?? '';
  pick.addEventListener('change', () => mark({ roadmap: pick.value || null }));
  return pick;
}

/** The roadmap: each idea, its status and notes, the notes linked to it and its announcements. No timeline (Tom). */
function roadmap() {
  const r = state.roadmap;
  const since = r.sinceLastBigChange === null ? 'no idea done yet' : `${r.sinceLastBigChange} since the last idea was done`;
  /** @type {Node[]} */
  const out = [el('p', 'muted', [`${r.finished} seasons played; ${since}. No timeline: growth comes down to feel, the channel going stale, inspiration, or viewers pointing one way.`])];
  for (const i of r.ideas) {
    const status = /** @type {HTMLSelectElement} */ (el('select'));
    status.append(...['idea', 'considering', 'planned', 'building', 'done'].map((s) => el('option', '', [s])));
    status.value = i.status;
    status.addEventListener('change', () => save({ status: status.value }, `${i.title}: ${status.value}`));
    const notes = /** @type {HTMLTextAreaElement} */ (el('textarea'));
    notes.rows = 3;
    notes.value = i.notes;
    notes.placeholder = 'Your notes on it…';
    /** @param {object} patch @param {string} done */
    async function save(patch, done) {
      try { await api('roadmap', { id: i.id, ...patch }); say(`Saved (${done}) in data/roadmap.json. Commit it with the rest.`); await load(); } catch (err) { say(String(err), true); }
    }
    const linked = i.linkedNotes.length
      ? el('div', '', [el('p', '', [`${i.linkedNotes.length} note${i.linkedNotes.length === 1 ? '' : 's'} point${i.linkedNotes.length === 1 ? 's' : ''} this way:`]), ...i.linkedNotes.map((/** @type {any} */ n) => el('p', 'muted', [`${new Date(n.at).toLocaleDateString()}: ${n.text}`]))])
      : el('p', 'muted', ['No notes linked yet (link them from FEEDBACK).']);
    const announced = i.announcements.length ? el('p', 'muted', [`Announced: ${i.announcements.map((/** @type {any} */ a) => `${a.headline} (S${a.announced.season} ${a.announced.at})`).join('; ')}`]) : null;
    out.push(el('div', 'card', [
      el('div', 'row', [el('h2', '', [i.title]), status, ...(i.status === 'done' && i.doneSeason !== undefined ? [el('span', 'muted', [`after season ${i.doneSeason}`])] : [])]),
      el('p', '', [i.what]),
      ...(i.needs ? [el('p', 'muted', [`Needs: ${i.needs}`])] : []),
      linked,
      ...(announced ? [announced] : []),
      notes,
      el('div', 'row', [button('SAVE NOTES', () => save({ notes: notes.value }, `${i.title}'s notes`))]),
    ]));
  }
  return out;
}

function rejections() {
  const list = state.rejections.slice().reverse();
  if (!list.length) return [el('p', 'muted', ['Nothing rejected yet.'])];
  /** @type {Record<string, number>} */
  const by = {};
  for (const r of list) by[r.watcher ?? 'poll results'] = (by[r.watcher ?? 'poll results'] ?? 0) + 1;
  return [
    el('div', 'card', [el('h2', '', ['How often']), el('p', '', [Object.entries(by).map(([k, n]) => `${k}: ${n}`).join(' · ')])]),
    el('table', '', [
      el('tr', '', ['Rejected', 'After season', 'Proposal', 'What', 'Note'].map((h) => el('th', '', [h]))),
      ...list.map((/** @type {any} */ r) => el('tr', '', [el('td', '', [new Date(r.rejected).toLocaleDateString()]), el('td', 'num', [String(r.finished)]), el('td', '', [r.id]), el('td', '', [r.summary]), el('td', 'muted', [r.note || ''])])),
    ]),
  ];
}

$('run').addEventListener('click', async () => {
  const b = /** @type {HTMLButtonElement} */ ($('run'));
  b.disabled = true;
  say('Running the Director: rebuilding the league and checking any rule change against the balance targets (up to half a minute)…');
  try {
    const at = /** @type {HTMLInputElement} */ ($('at')).value.trim();
    await api('run', { at: at || null });
    say('Done.');
    tab = 'proposals';
    await load();
  } catch (err) {
    say(`The Director failed: ${err instanceof Error ? err.message : err}`, true);
  } finally {
    b.disabled = false;
  }
});

load();

/** The teams, once, for the share card. */
async function loadTeams() {
  if (teams) return;
  const config = await loadConfig(async (/** @type {string} */ path) => { const r = await fetch(path, { cache: 'no-store' }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.text(); });
  teams = Object.fromEntries(config.teams.teams.map((/** @type {any} */ t) => [t.id, t]));
  await document.fonts.load('40px "VT323"');
}
