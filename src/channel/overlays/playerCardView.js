// The player card drawn (It remembers, Task 222; docs/channel.md §20.5): in the CHRONICLE pane's place, one scroll
// (Tom's picks on cards.html, Task 221): who they are, how they joined, their standing now, the career with each club a
// heading over its seasons (games, goals, assists, stops; a keeper's saves and save %; a Cup season in amber), player
// of the match, legend, honours, records taken, milestones. ‹ goes back where it came from; nothing on it opens
// anything (one level only, Tom). The contents are playerCard.js's (pure); the styles are index.html's (.card).
// cards.html draws the same into its pictures.
import { CARD_STATS, cardStat, playerCard } from '../playerCard.js';

/**
 * The card's contents as one element, in `doc` (the channel's document, or a dev page's picture).
 * @param {Document} doc
 * @param {{ chronicle: import('../../chronicle/chronicle.js').Chronicle, config: import('../../config.js').Config,
 *   league: import('../../sim/league.js').League, playerId: string, backLabel: string, onBack: () => void }} o
 */
export function playerCardBody(doc, { chronicle, config, league, playerId, backLabel, onBack }) {
  const c = playerCard(chronicle, config, playerId);
  const awardName = Object.fromEntries(config.rules.awards.list.map((/** @type {any} */ a) => [a.id, a.name.replace(/^The /, '')]));
  /** @param {string} tag @param {string} cls @param {(Node | string)[]} [kids] */
  const mk = (tag, cls, kids = []) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    e.append(...kids);
    return e;
  };
  const px = (/** @type {number} */ n) => `calc(var(--px) * ${n})`;
  /** @param {string} id @param {string} [word] */
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
  const right = (/** @type {string | number} */ v) => mk('span', 'r', [String(v)]);
  const fmt = (/** @type {string} */ k, /** @type {number | null} */ v) => (v === null ? '-' : k === 'savePct' ? `${(v * 100).toFixed(0)}%` : String(v));
  const stats = CARD_STATS[c.position];

  // Who they are.
  const back = mk('div', 'card-back', [`‹ ${backLabel}`]);
  back.addEventListener('click', onBack);
  const where = c.retired
    ? mk('div', 'm', [`${c.positionName} · retired S${c.retired.season}`])
    : c.status === 'reserves' && c.teamId ? mk('div', 'm', [`${c.positionName} · `, t(c.teamId), ' reserves'])
      : c.teamId ? mk('div', 'm', [`${c.positionName} · `, t(c.teamId)]) : mk('div', 'm', [`${c.positionName} · free agent`]);
  const standing = c.legend
    ? mk('div', 'card-standing legend', ['LEGEND'])
    : c.standing ? mk('div', 'card-standing', [c.standing.words]) : mk('div', '', []);
  const j = c.joined;
  const joined = !j ? 'Never signed'
    : j.how === 'founding' ? mk('span', '', ['Founding squad, ', t(j.teamId)])
      : j.how === 'draft' ? mk('span', '', [`${j.round === 1 ? `No. ${j.pick} pick` : `Round ${j.round} pick ${j.pick}`}, `, t(j.teamId), `, S${j.season}`])
        : mk('span', '', ['Signed by ', t(j.teamId), `, S${j.season}`]);
  const head = [
    back,
    mk('div', 'card-name', [c.name]),
    where,
    standing,
    mk('div', 'card-small', [`Age ${c.age} · from ${c.region.replace(/^The /, 'the ')}`]),
    mk('div', 'card-small', [joined]),
  ];

  // The career: totals, a row a season, teams, honours.
  const career = () => {
    const tot = c.totals;
    const out = [mk('div', 'card-h', ['CAREER']), mk('div', 'card-small', [`${tot.seasons} season${tot.seasons === 1 ? '' : 's'}, incl. playoffs`, ...(c.honours.cups.length ? ['; ', mk('span', 'tm', [mk('span', 'cup', ['gold']), ': won Cup'])] : [])])];
    // The team as a heading over its seasons (Tom: a column freed for stops): a row a season, a C for a Cup.
    // The season (and a Cup's C) takes what's left; GP and the stats fixed, wide enough for a career's four digits
    // with a gap between (Tom: the total row ran together).
    const cols = `1fr ${px(12)} ${stats.map(([k]) => px(k === 'savePct' ? 20 : 17)).join(' ')}`;
    out.push(row(cols, ['', right('GP'), ...stats.map(([, label]) => right(label))], 'head'));
    let team = '';
    for (const r of c.career) {
      if (r.teamId !== team) out.push(mk('div', 'card-team', [t((team = r.teamId)), mk('span', 'm', [` ${league.teams[team].shortName}`])]));
      // A Cup season's label in amber (no room for a C beside it once the stats were widened).
      out.push(row(cols, [mk('span', r.cup ? 'cup' : 'm', [`S${r.season}`]), right(r.games), ...stats.map(([k], i) => right(fmt(k, r.stats[i])))]));
    }
    const totLine = /** @type {any} */ (tot);
    out.push(row(cols, [mk('span', 'm', ['ALL']), right(tot.appearances), ...stats.map(([k]) => right(fmt(k, cardStat(totLine, k))))], 'total'));
    // Player of the match (Tom: a heading of its own, like HONOURS): how many times, and their best season.
    if (tot.potm) {
      const best = c.career.reduce((m, r) => (r.potm > m.potm ? r : m), c.career[0]);
      out.push(mk('div', 'card-sub', ['PLAYER OF THE MATCH']), mk('div', 'card-line', [`${tot.potm} time${tot.potm === 1 ? '' : 's'}`, ...(best.potm > 1 && tot.potm > best.potm ? [mk('span', 'm', [` · ${best.potm} in S${best.season}`])] : [])]));
    }
    // Honours.
    const h = c.honours;
    if (c.legend) out.push(mk('div', 'card-sub', ['LEGEND']), mk('div', 'card-line', [`${c.legend.value} ${c.legend.stat === 'cups' ? 'Cups' : c.legend.stat}`]));
    if (h.awards.length || h.cups.length) {
      out.push(mk('div', 'card-sub', ['HONOURS']));
      if (h.cups.length) out.push(mk('div', 'card-line', [`${h.cups.length} Cup${h.cups.length === 1 ? '' : 's'}: `, mk('span', 'm', [h.cups.map((s) => `S${s}`).join(' ')])]));
      for (const a of h.awards) out.push(mk('div', 'card-line', [`${awardName[a.award]}${a.seasons.length > 1 ? ` ×${a.seasons.length}` : ''}: `, mk('span', 'm', [a.seasons.map((s) => `S${s}`).join(' ')])]));
    }
    if (h.records.length) {
      out.push(mk('div', 'card-sub', ['RECORDS']));
      // Each record once, with the seasons they took it (a record can change hands and come back).
      /** @type {Map<string, number[]>} */
      const took = new Map();
      for (const r of h.records) {
        const k = `${r.scope === 'career' ? 'All-time' : 'Season'} ${r.stat} record`;
        const list = took.get(k) ?? took.set(k, []).get(k);
        if (!list?.includes(r.season)) list?.push(r.season);
      }
      for (const [k, list] of took) out.push(mk('div', 'card-line', [`${k}: `, mk('span', 'm', [list.map((x) => `S${x}`).join(' ')])]));
    }
    if (h.milestones.length) {
      out.push(mk('div', 'card-sub', ['MILESTONES']));
      const word = /** @type {Record<string, string>} */ ({ goals: 'goal', assists: 'assist', saves: 'save', stops: 'stop', appearances: 'game' });
      for (const m of h.milestones.slice(-6).reverse()) out.push(row(`${px(13)} 1fr`, [mk('span', 'm', [`S${m.season}`]), `${m.value}th ${word[m.stat]}`]));
    }
    return out;
  };


  const body = mk('div', 'card');
  body.append(...head, ...career());
  return body;
}
