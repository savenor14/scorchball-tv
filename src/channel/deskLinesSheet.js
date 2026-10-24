// desklines.html (Task 246a): the desk's history lines in a fast-forwarded league, to read before anything is voiced.
// After each match, the heaviest fact the desk can say; before each, the tee-up's; each kind with how often it comes up
// and its ways (those naming a surname marked, with their cost), and the lines themselves as said and shown, with names
// on or off. Dev page only.
import { loadConfig } from '../config.js';
import { collectFacts } from '../chronicle/factsLeague.js';
import { deskAfter, deskBefore } from './deskFacts.js';
import { sayer, teamsForTalk } from './studio.js';
import { countTalk } from './talkCount.js';

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
const { chronicle, after, before } = collectFacts(config, seed, SEASONS);
const teamById = Object.fromEntries(config.teams.teams.map((/** @type {any} */ t) => [t.id, t]));
const names = {
  team: (/** @type {string} */ id) => teamById[id]?.shortName ?? id,
  player: (/** @type {string} */ id) => {
    const p = chronicle.players.get(id);
    return p ? `${p.firstName[0]}. ${p.lastName}`.toUpperCase() : id;
  },
  surname: (/** @type {string} */ id) => chronicle.players.get(id)?.lastName ?? '',
};
const lines = config.studio.lines;
const teams = teamsForTalk(teamById, config.studio.spokenTeam);
const surnames = config.regions.regions.flatMap((/** @type {any} */ r) => r.lastNames).length;

/** Every history line, after and before. */
const rows = [
  ...after.map((x) => ({ when: 'after', matchId: x.matchId, line: deskAfter(x.facts, names, config.chronicle.facts.deskFrom) })),
  ...before.map((x) => ({ when: 'before', matchId: x.matchId, line: deskBefore(x.facts, names) })),
].filter((r) => r.line);
/** @type {Map<string, number>} */
const byKind = new Map();
for (const r of rows) byKind.set(/** @type {any} */ (r.line).kind, (byKind.get(/** @type {any} */ (r.line).kind) ?? 0) + 1);

const root = /** @type {HTMLElement} */ (document.getElementById('sheet'));
root.replaceChildren();
const matches = after.length;
root.append(el('p', '', [
  `${SEASONS} seasons of seed "${seed}" (${Math.round(performance.now() - t0)} ms): ${matches} matches. `,
  el('b', '', [`After ${Math.round((100 * rows.filter((r) => r.when === 'after').length) / matches)}% of matches the desk says a history line; before ${Math.round((100 * rows.filter((r) => r.when === 'before').length) / matches)}%.`]),
  ` Lines naming a surname cost one clip per surname (${surnames}) per presenter: about ${Math.round((surnames * 2 * 35 * 0.43) / 100) * 100} credits a way.`,
]));

// The kinds, how often, and their ways.
const kinds = Object.keys(lines).filter((k) => /^(fact|teeUp(Rematch|RunOver|OldClub)$|interviewTeeUpNamed)/.test(k));
const table = el('table');
table.append(el('tr', '', ['Line', 'A season', 'Ways (said · shown)'].map((h) => el('th', '', [h]))));
for (const kind of kinds.sort((a, b) => (byKind.get(b) ?? 0) - (byKind.get(a) ?? 0))) {
  const n = kind === 'interviewTeeUpNamed' ? after.filter((x) => x.potm).length : byKind.get(kind) ?? 0;
  table.append(el('tr', n ? '' : 'muted', [
    el('td', '', [kind]),
    el('td', 'num', [(n / SEASONS).toFixed(1)]),
    el('td', 'ways', lines[kind].ways.map((w) => el('div', w.say.includes('{surname}') ? 'named' : '', [w.say, el('span', 'muted', [` · ${w.show ?? ''}`]), w.say.includes('{surname}') ? el('span', 'tag', [' NAMES A PLAYER']) : '']))),
  ]));
}
root.append(el('h2', '', ['The lines, and how often']), table);

// The lines as said and shown.
const toggle = /** @type {HTMLInputElement} */ (el('input'));
toggle.type = 'checkbox';
const list = el('div');
const render = () => {
  list.replaceChildren(...rows.slice(0, 400).map((r) => {
    const line = /** @type {import('./deskFacts.js').DeskLine} */ (r.line);
    const { said, say } = sayer(lines, `sheet|${r.when}|${r.matchId}`, teams, toggle.checked);
    say(line.kind, line.fill);
    const m = chronicle.matches.get(r.matchId);
    const head = m ? `S${m.season} ${m.stage === 'regular' ? `R${m.round}` : m.stage.toUpperCase()} · ${names.team(m.homeId)} ${m.homeGoals}-${m.awayGoals} ${names.team(m.awayId)}` : r.matchId;
    return el('div', 'line', [
      el('div', 'head', [`${r.when === 'after' ? 'After' : 'Before'} · ${head}`, el('span', 'tag', [line.kind])]),
      el('div', 'said', [`"${said[0].text}"`]),
      el('div', 'shown', [said[0].show ?? '']),
    ]);
  }));
};
toggle.addEventListener('change', render);
root.append(el('h2', '', ['As said and shown']), el('p', '', [el('label', '', [toggle, ' with player names (studio.json playerNames; off until their clips are made)']), el('span', 'muted', [' · the first 400'])]), list);
render();

// More ways for the lines heard most (Task 246b): every kind with how often it's said a day over a season of the
// programme, its ways (the new ones marked), and how often each way is heard.
/** How many ways Task 246b added to each kind (the last ones in its list). */
const ADDED = /** @type {Record<string, number>} */ ({"upcomingThen":11,"upcomingFirst":5,"upcomingIntro":6,"scorersScorchers":5,"scorersReact":5,"scorersChasing":5,"scorersLeader":5,"standingsBottom":4,"standingsReact":4,"interviewTeeUp":2,"teeUpKickoff":2,"teeUpWatch":2,"standingsLeader":2,"teeUpPlaces":2,"standingsCutLevel":1,"teeUpForm":1,"wrapUp":1,"highlightsNext":1,"teeUpMatch":1,"standingsCut":2,"upcomingSemi":1});
const counted = countTalk(config, seed, Number(params.get('season') ?? 2));
const often = el('table');
often.append(el('tr', '', ['Line', 'A day', 'Ways', 'Each way a day', 'Ways (new in gold)'].map((h) => el('th', '', [h]))));
const byDay = Object.keys(lines).map((kind) => ({ kind, perDay: (counted.byKind.get(kind) ?? 0) / counted.days }))
  .filter((r) => r.perDay > 0).sort((a, b) => b.perDay - a.perDay);
for (const { kind, perDay } of byDay) {
  const ways = lines[kind].ways;
  const added = ADDED[kind] ?? 0;
  often.append(el('tr', '', [
    el('td', '', [kind]), el('td', 'num', [perDay.toFixed(1)]), el('td', 'num', [`${ways.length}${added ? ` (+${added})` : ''}`]), el('td', 'num', [(perDay / ways.length).toFixed(2)]),
    el('td', 'ways', ways.map((w, i) => el('div', i >= ways.length - added ? 'named' : '', [w.say]))),
  ]));
}
root.append(el('h2', '', [`How often each line is heard (Task 246b): season ${params.get('season') ?? 2}, ${counted.days} days of the programme`]), often);

