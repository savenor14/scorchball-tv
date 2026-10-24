// The team card drawn (It remembers, Task 223; docs/channel.md §20.6): in the CHRONICLE pane's place, like the player
// card. Who they are (crest, name, home, Cups and Pennants), this season so far, the squad on its deals (the payroll
// against the cap; the rookie's R, the injured), the last off-season's moves, its history a row a season, the club's
// records and its head-to-heads, under two tabs, NOW and HISTORY (Tom's pick B on teamcards.html).
// ‹ goes back where it came from; nothing on it opens anything (one level only, Tom). The contents are teamCard.js's
// (pure); the styles are index.html's (.card, .tc-).
import { crestCanvas } from '../crests.js';
import { guilders } from '../money.js';
import { lotsSeedFor } from '../../sim/season.js';
import { teamCard } from '../teamCard.js';

const GROUPS = /** @type {[string, string][]} */ ([['K', 'KEEPERS'], ['D', 'DEFENDERS'], ['M', 'MIDFIELDERS'], ['S', 'STRIKERS']]);

/** "1st", "12th". @param {number} n */
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * The card's contents as one element, in `doc` (the channel's document, or a dev page's picture).
 * @param {Document} doc
 * @param {{ chronicle: import('../../chronicle/chronicle.js').Chronicle, config: import('../../config.js').Config,
 *   league: import('../../sim/league.js').League, teamId: string, backLabel: string, onBack: () => void }} o
 */
export function teamCardBody(doc, { chronicle, config, league, teamId, backLabel, onBack }) {
  const c = teamCard(chronicle, config, league.teams[teamId], (season) => lotsSeedFor(league, season));
  /** @param {string} tag @param {string} cls @param {(Node | string)[]} [kids] */
  const mk = (tag, cls, kids = []) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    e.append(...kids);
    return e;
  };
  const px = (/** @type {number} */ n) => `calc(var(--px) * ${n})`;
  const m = (/** @type {string} */ v) => mk('span', 'm', [v]);
  /** A kit swatch and the team's letters, after a word ("v", "to") kept on its line. @param {string} id @param {string} [word] */
  const t = (id, word = '') => {
    const k = mk('span', 'kit');
    k.style.background = league.teams[id].colours.primary;
    k.style.boxShadow = `inset calc(var(--px) * -1) 0 0 ${league.teams[id].colours.secondary}`;
    return mk('span', 'tm', [word, k, league.teams[id].abbr]);
  };
  /** @param {string} cols @param {(Node | string)[]} cells @param {string} [cls] */
  const row = (cols, cells, cls = '') => {
    const r = mk('div', `card-row ${cls}`, cells.map((x) => (typeof x === 'string' ? mk('span', '', [x]) : x)));
    r.style.gridTemplateColumns = cols;
    return r;
  };
  const right = (/** @type {string | number} */ v, cls = '') => mk('span', `r ${cls}`, [String(v)]);
  const h = (/** @type {string} */ title) => mk('div', 'card-h', [title]);
  const sub = (/** @type {string} */ title) => mk('div', 'card-sub', [title]);
  const small = (/** @type {(Node | string)[]} */ kids) => mk('div', 'card-small', kids);
  const plural = (/** @type {number} */ n, /** @type {string} */ word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  // Who they are.
  const back = mk('div', 'card-back', [`‹ ${backLabel}`]);
  back.addEventListener('click', onBack);
  const team = league.teams[teamId];
  const honours = [];
  if (c.cups.length) honours.push(mk('div', 'card-line', [mk('span', 'cup', [plural(c.cups.length, 'Cup')]), ': ', m(c.cups.map((s) => `S${s}`).join(' '))]));
  if (c.pennants.length) honours.push(mk('div', 'card-line', [plural(c.pennants.length, 'Pennant'), ': ', m(c.pennants.map((s) => `S${s}`).join(' '))]));
  if (!honours.length) honours.push(mk('div', 'card-line', [m('No Cups or Pennants yet')]));
  const head = [
    back,
    mk('div', 'tc-head', [crestCanvas(doc, team, { style: 'shaded', scale: 1 }), mk('div', 'card-name', [c.name])]),
    // The ground and its town (Tom's note 14): "The Rookery, Wrenhollow · The Gullcoast".
    small([`${c.ground ? `${c.ground.charAt(0).toUpperCase()}${c.ground.slice(1)}, ` : ''}${c.city} · ${c.region}`]),
    small([c.blurb]),
    ...honours,
  ];

  // This season so far.
  const thisSeason = () => {
    const s = c.season;
    const out = [h(`SEASON ${s.season}`)];
    if (!s.row || !s.played) return [...out, mk('div', 'card-line', [m('No games yet.')])];
    const r = s.row;
    out.push(mk('div', 'card-line', [`${ordinal(r.position)} · ${r.points} pts`, m(` · ${r.played} played`)]));
    out.push(mk('div', 'card-line', [`W${r.won} D${r.drawn} L${r.lost}`, m(` · GD ${r.goalDifference > 0 ? '+' : ''}${r.goalDifference}`)]));
    if (s.run && s.run.length >= 2) {
      const word = s.run.outcome === 'W' ? 'Won' : s.run.outcome === 'L' ? 'Lost' : 'Drawn';
      out.push(mk('div', 'card-line', [m(`${word} ${s.run.length} in a row`)]));
    }
    const po = /** @type {Record<string, string>} */ ({ champion: 'Won the Cup', runner_up: 'Lost the final', final: 'In the final', semifinal: 'Out in the semifinals', in: 'In the playoffs' });
    if (s.playoffs) out.push(mk('div', `card-line ${s.playoffs === 'champion' ? 'cup' : ''}`, [po[s.playoffs]]));
    return out;
  };

  // The squad on its deals and the payroll against the cap (Task 234's money, as MONEY's), by position, each player's
  // wage beside their name (by position over a STARTING / BENCH split, which showed a player hurt in the last match
  // among the starters, or one list by wage). Then the Kindling League. Two views (Task 278n, Tom): WAGES, and STATS,
  // this season's numbers on a line under each name across the card's width (Tom: in columns beside the names they were
  // cramped): G, A and ST (stops) for outfielders, SV and SV% for keepers.
  let view = /** @type {'wages' | 'stats'} */ ('wages');
  const squad = () => {
    const share = c.payroll / c.cap;
    const fill = mk('span', share > 1 ? 'over' : share > 0.95 ? 'full' : '');
    fill.style.width = `${Math.min(100, share * 100)}%`;
    const views = /** @type {const} */ ([['wages', 'WAGES'], ['stats', 'STATS']]).map(([id, word]) => {
      const b = mk('button', `guide-filter${view === id ? ' on' : ''}`, [word]);
      b.addEventListener('click', () => { view = id; pick('now'); });
      return b;
    });
    // Home-grown (Tom's note 8, 2026-10-19): how many, in the card's grey, and nothing beside the names.
    const out = [h('SQUAD'), mk('div', 'guide-bar tc-view', views), small([`${c.squad.filter((p) => p.homeGrown).length} of ${c.squad.length} home-grown, from ${c.region.replace(/^The /, 'the ')}`])];
    if (view === 'wages') out.push(small([`Payroll ${guilders(c.payroll)} of ${guilders(c.cap)}`]), mk('div', 'chr-bar', [fill]));
    const rookie = () => mk('span', 'tc-rookie', ['R']);
    const hurt = () => mk('span', 'tc-inj', ['+']);
    /** @param {typeof c.squad[number]} p */
    const player = (p) => {
      const name = mk('span', 'tc-name', [p.name]);
      if (p.rookie) name.append(rookie());
      if (p.injured) name.append(hurt());
      if (view === 'wages') return row(`1fr ${px(19)}`, [name, right(p.wage === null ? '-' : guilders(p.wage), 'm')]);
      // STATS: the name, then its numbers under it, each with its label, spread across the card. The Kindling League
      // doesn't play: no numbers there.
      if (c.reserves.includes(p)) return mk('div', 'tc-stat', [name]);
      const stat = (/** @type {string} */ label, /** @type {string | number} */ v) => mk('span', '', [mk('span', 'm', [`${label} `]), String(v)]);
      const line = p.position === 'K'
        ? [stat('SV', p.saves), stat('SV%', p.savePct === null ? '-' : `${Math.round(p.savePct * 100)}%`)]
        : [stat('G', p.goals), stat('A', p.assists), stat('ST', p.stops)];
      return mk('div', 'tc-stat', [name, mk('div', `tc-nums${p.position === 'K' ? ' k' : ''}`, line)]);
    };
    for (const [pos, title] of GROUPS) {
      const players = c.squad.filter((p) => p.position === pos);
      if (players.length) out.push(sub(title), ...players.map(player));
    }
    if (c.reserves.length) out.push(sub('KINDLING'), ...c.reserves.map(player));
    // The key with the marks themselves (Tom).
    const key = [];
    if ([...c.squad, ...c.reserves].some((p) => p.rookie)) key.push(rookie(), ' rookie · ');
    if ([...c.squad, ...c.reserves].some((p) => p.injured)) key.push(hurt(), ' injured · ');
    out.push(small(view === 'wages' ? [...key, 'wages a season', c.reserves.length ? '; the Kindling off the cap' : ''] : [...key, 'this season: G goals, A assists, ST stops (tackles and blocks), SV saves']));
    return out;
  };

  // The last off-season's comings and goings.
  const moves = () => {
    const mv = c.moves;
    if (mv.season < 1) return [];
    const out = [h(`OFF-SEASON ${mv.season}`)];
    const cols = `1fr ${px(30)}`;
    if (mv.drafted.length) {
      out.push(sub('DRAFTED'));
      for (const d of mv.drafted) out.push(row(cols, [d.name, right(`No. ${d.pick}`, 'm')]));
    }
    if (mv.signed.length) {
      out.push(sub('SIGNED'));
      for (const s of mv.signed) out.push(row(cols, [s.name, right(guilders(s.wage), 'm')]), small([s.fromId ? t(s.fromId, 'from ') : 'from free agency', ` · until S${s.until}`]));
    }
    if (mv.left.length) {
      out.push(sub('LEFT'));
      for (const l of mv.left) out.push(row(cols, [l.name, l.how === 'signed' && l.toId ? mk('span', 'r', [t(l.toId, 'to ')]) : right(l.how === 'retired' ? 'retired' : 'free', 'm')]));
    }
    if (!mv.drafted.length && !mv.signed.length && !mv.left.length) out.push(mk('div', 'card-line', [m('No moves.')]));
    return out;
  };

  // History: a row a finished season (a Cup season's label in gold, as on the player card).
  const history = () => {
    const out = [h('HISTORY')];
    if (!c.history.length) return [...out, mk('div', 'card-line', [m('No season finished yet.')])];
    const cols = `${px(13)} ${px(12)} ${px(14)} 1fr`;
    out.push(row(cols, ['', right('POS'), right('PTS'), right('PLAYOFFS')], 'head'));
    const po = /** @type {Record<string, string>} */ ({ champion: 'CUP', runner_up: 'FINAL', semifinal: 'SEMI' });
    for (const s of c.history) {
      out.push(row(cols, [mk('span', s.playoffs === 'champion' ? 'cup' : 'm', [`S${s.season}`]), right(ordinal(s.position), s.pennant ? 'cup' : ''), right(s.points),
        right(s.playoffs ? po[s.playoffs] : '-', s.playoffs === 'champion' ? 'cup' : 'm')]));
    }
    out.push(small(['amber: won the Cup, or the Pennant (1st)']));
    return out;
  };

  // The club's records.
  const records = () => {
    const r = c.records;
    const out = [h('CLUB RECORDS')];
    const cols = `1fr ${px(18)}`;
    /** @param {string} label @param {{ name: string, value: number } | null} x */
    const player = (label, x) => (x ? [sub(label), row(cols, [x.name, right(x.value)])] : []);
    out.push(...player('MOST GOALS', r.goals), ...player('MOST ASSISTS', r.assists), ...player('MOST SAVES', r.saves), ...player('MOST GAMES', r.games));
    if (r.bestSeason) out.push(sub('MOST POINTS'), row(cols, [m(`S${r.bestSeason.season}`), right(r.bestSeason.points)]));
    if (r.biggestWin) out.push(sub('BIGGEST WIN'), row(cols, [mk('span', 'tm', [`${r.biggestWin.for}–${r.biggestWin.against} `, t(r.biggestWin.opponentId, 'v ')]), right(`S${r.biggestWin.season}`, 'm')]));
    if (r.winningRun) out.push(sub('WINS IN A ROW'), row(cols, [String(r.winningRun.length), right(`S${r.winningRun.season}`, 'm')]));
    if (r.unbeatenRun) out.push(sub('UNBEATEN'), row(cols, [String(r.unbeatenRun.length), right(`S${r.unbeatenRun.season}`, 'm')]));
    if (out.length === 1) out.push(mk('div', 'card-line', [m('None yet.')]));
    out.push(small(['Incl. playoffs.']));
    return out;
  };

  // Head-to-heads, all-time.
  const headToHead = () => {
    const out = [h('HEAD TO HEAD')];
    const cols = `1fr ${px(10)} ${px(10)} ${px(10)}`;
    out.push(row(cols, ['', right('W'), right('D'), right('L')], 'head'));
    for (const x of c.headToHead) out.push(row(cols, [t(x.opponentId, 'v '), right(x.won), right(x.drawn), right(x.lost)]));
    out.push(small(['All-time, incl. playoffs.']));
    return out;
  };

  const body = mk('div', 'card');
  const now = () => [...thisSeason(), ...squad(), ...moves()];
  const past = () => [...history(), ...records(), ...headToHead()];
  // Two tabs under who they are (Tom's pick B: one scroll ran to four screens and more).
  const panel = mk('div', '');
  const tabs = /** @type {const} */ ([['now', 'NOW'], ['past', 'HISTORY']]).map(([id, word]) => {
    const b = mk('button', 'guide-filter', [word]);
    b.addEventListener('click', () => pick(id));
    return { id, b };
  });
  /** @param {'now' | 'past'} id */
  const pick = (id) => {
    tabs.forEach((x) => x.b.classList.toggle('on', x.id === id));
    panel.replaceChildren(...(id === 'now' ? now() : past()));
  };
  body.append(...head, mk('div', 'guide-bar tc-tabs', tabs.map((x) => x.b)), panel);
  pick('now');
  return body;
}
