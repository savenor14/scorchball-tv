// interviews.html (Task 245): the interview's sentences in a fast-forwarded league, to read before anything is voiced.
// Every match's player of the match: the reaction and the fact they speak to, or the canned quote when there's none;
// how often each fact comes up; and every sentence with how often it would be heard. Dev page only.
import { loadConfig } from '../config.js';
import { collectFacts } from '../chronicle/factsLeague.js';
import { factKey, interviewTalk } from './interviewTalk.js';
import { quoteChoice } from './potm.js';

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

const config = await loadConfig(fetchText);
const params = new URLSearchParams(location.search);
const SEASONS = Number(params.get('seasons') ?? 20);
const seed = params.get('seed') ?? config.settings.live.seed;
const t0 = performance.now();
const { chronicle, after } = collectFacts(config, seed, SEASONS);
const data = config.interviews;
const shortName = (/** @type {string} */ id) => config.teams.teams.find((/** @type {any} */ t) => t.id === id)?.shortName ?? id;
const nameOf = (/** @type {string} */ id) => {
  const p = chronicle.players.get(id);
  return p ? `${p.firstName[0]}. ${p.lastName}` : id;
};

/** Every interview: the match, who, the result from their side, and what they say. */
const rows = after.filter((x) => x.potm).map((x) => {
  const m = /** @type {import('../chronicle/chronicle.js').MatchRecord} */ (chronicle.matches.get(x.matchId));
  const potm = /** @type {NonNullable<typeof x.potm>} */ (x.potm);
  /** @type {'win' | 'draw' | 'loss'} */
  const outcome = m.winnerId === null ? 'draw' : m.winnerId === potm.teamId ? 'win' : 'loss';
  const talk = interviewTalk(x.facts, { matchId: m.id, playerId: potm.playerId, teamId: potm.teamId, outcome }, data);
  const isKeeper = chronicle.players.get(potm.playerId)?.position === config.positions.keeper;
  const summary = /** @type {any} */ ({ result: { homeGoals: m.homeGoals, awayGoals: m.awayGoals, decidedBy: m.decidedBy, shootout: m.shootout } });
  const canned = talk ? null : quoteChoice(/** @type {any} */ ({ teamId: potm.teamId, stats: { goals: potm.goals } }), { id: m.id, homeId: m.homeId, awayId: m.awayId, summary }, data.quotes, isKeeper);
  return { m, potm, outcome, talk, canned };
});

const withFact = rows.filter((r) => r.talk);
/** How often each sentence key comes up. @type {Map<string, number>} */
const heard = new Map();
for (const r of withFact) for (const s of /** @type {any} */ (r.talk).sentences) heard.set(s.key, (heard.get(s.key) ?? 0) + 1);
/** By fact key. @type {Map<string, number>} */
const byKey = new Map();
for (const r of withFact) byKey.set(factKey(/** @type {any} */ (r.talk).fact), (byKey.get(factKey(/** @type {any} */ (r.talk).fact)) ?? 0) + 1);

const root = /** @type {HTMLElement} */ (document.getElementById('sheet'));
root.replaceChildren();
const perSeason = rows.length / SEASONS;
root.append(el('p', '', [
  `${SEASONS} seasons of seed "${seed}" (${Math.round(performance.now() - t0)} ms): ${rows.length} interviews, about ${Math.round(perSeason)} a season. `,
  el('b', '', [`${Math.round((100 * withFact.length) / rows.length)}% speak to a fact`]),
  ` (a reaction, then the fact); the rest say one of the ${Object.values(data.quotes).flatMap((b) => Object.values(b)).flat().length} quotes, as today.`,
]));

// The facts spoken to, and every sentence with how often it comes up.
const facts = el('table');
facts.append(el('tr', '', ['Fact', 'Interviews', 'A season', 'Ways', 'Each way heard (over the seasons)'].map((h) => el('th', '', [h]))));
const keys = [...Object.keys(data.facts)].sort((a, b) => (byKey.get(b) ?? 0) - (byKey.get(a) ?? 0));
for (const key of keys) {
  const ways = data.facts[key];
  const n = byKey.get(key) ?? 0;
  facts.append(el('tr', n ? '' : 'muted', [
    el('td', '', [key]), el('td', 'num', [String(n)]), el('td', 'num', [(n / SEASONS).toFixed(1)]), el('td', 'num', [String(ways.length)]),
    el('td', 'ways', ways.map((w, i) => el('div', '', [el('span', 'count', [String(heard.get(`fact-${key.replace('.', '-')}-${i}`) ?? 0)]), ` ${w.say} `, el('span', 'muted', [`(${w.results.join(', ')})`])]))),
  ]));
}
const reactions = el('table');
reactions.append(el('tr', '', ['Result', 'Each reaction heard'].map((h) => el('th', '', [h]))));
for (const [outcome, list] of Object.entries(data.reactions)) {
  reactions.append(el('tr', '', [el('td', '', [outcome]), el('td', 'ways', list.map((say, i) => el('div', '', [el('span', 'count', [String(heard.get(`reaction-${outcome}-${i}`) ?? 0)]), ` ${say}`])))]));
}
root.append(el('h2', '', ['What they speak to']), facts, el('h2', '', ['The reactions']), reactions);

// The interviews themselves: with a fact, or every one; a season at a time.
const filter = /** @type {HTMLSelectElement} */ (el('select'));
for (const [value, label] of [['fact', 'with a fact'], ['all', 'every interview'], ...keys.filter((k) => byKey.get(k)).map((k) => [k, k])]) {
  const o = /** @type {HTMLOptionElement} */ (el('option', '', [label]));
  o.value = value;
  filter.append(o);
}
const list = el('div');
const render = () => {
  const shown = rows.filter((r) => filter.value === 'all' || (r.talk && (filter.value === 'fact' || factKey(r.talk.fact) === filter.value))).slice(0, 300);
  list.replaceChildren(...shown.map((r) => {
    const { m } = r;
    const head = `S${m.season} ${m.stage === 'regular' ? `R${m.round}` : m.stage.toUpperCase()} · ${shortName(m.homeId)} ${m.homeGoals}-${m.awayGoals} ${shortName(m.awayId)}${m.decidedBy === 'regulation' ? '' : m.decidedBy === 'overtime' ? ' GG' : ' (SO)'}`;
    const who = `${nameOf(r.potm.playerId)} (${shortName(r.potm.teamId)}, ${r.outcome})`;
    const said = r.talk ? r.talk.sentences.map((s) => s.say).join(' ') : /** @type {any} */ (r.canned).line;
    return el('div', `interview ${r.talk ? '' : 'canned'}`, [
      el('div', 'head', [head, ' · ', el('b', '', [who]), r.talk ? el('span', 'tag', [factKey(r.talk.fact)]) : el('span', 'tag muted', ['quote'])]),
      el('div', 'said', [`"${said}"`]),
    ]);
  }));
};
filter.addEventListener('change', render);
root.append(el('h2', '', ['The interviews']), el('p', '', ['Show ', filter, el('span', 'muted', [' (the first 300)'])]), list);
render();
