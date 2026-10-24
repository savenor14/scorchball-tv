// Dev page (analyst.html; the playoff analyst, Tom 2026-10-17): mock-ups of a third person at the desk for the PLAYOFF
// PREVIEW show's talk, and a draft of their lines (data/analyst.json, not loaded by the channel yet). Three candidates
// drawn with the channel's own set B and figures (studioSet.js); Tom's pick, Radomir Brodek (Krenn until 2026-10-18), in the left seat with Ysolde hosting on the right, frozen mid-line with the bubble and the
// graphic under the speaker; the bits (THE FOUR, each semifinal) as they'd be said on the dev league the night before
// the semifinals, each line picked only when its fact is true; and every kind with its ways and what voicing them costs.
import { loadConfig } from '../config.js';
import { bracketCard } from './cards.js';
import { LiveLeague } from './liveLeague.js';
import { isFinished, seasonTotalsAt, tableAt } from './onScreen.js';
import { PALETTE } from './palette.js';
import { presenters } from './studio.js';
import { drawDesk, drawFigure, drawSetBack, setLayout } from './studioSet.js';
import { talkContext } from './talk.js';
import { createTimeline } from './timeline.js';

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

const config = await loadConfig(fetchText);
const draft = JSON.parse(await fetchText('data/analyst.json'));
const SEED = new URLSearchParams(location.search).get('seed') ?? config.settings.live.seed;
/** The night before the semifinals on the dev league (as preview.html). */
const NOW = Date.parse('2026-10-18T01:03:35Z');
const SEASON = 1;
const teams = Object.fromEntries(/** @type {any[]} */ (config.teams.teams).map((t) => [t.id, t]));
/** @type {Map<string, import('./timeline.js').Timeline>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
const durationOf = (/** @type {any} */ m) => timelineOf(m).duration;
const live = new LiveLeague(config, { now: NOW, seed: SEED });
const ctx = { ...talkContext(live, timelineOf), timelineOf };
const abbr = (/** @type {string} */ id) => teams[id].abbr;
const spoken = (/** @type {string} */ id) => String(config.studio.spokenTeam).replace('{name}', teams[id].shortName);
const ordinal = (/** @type {number} */ n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

// What's known: the table, the players' totals, the semifinals, each side's numbers.
const table = tableAt(live, SEASON, NOW, durationOf);
const regular = live.matchesIn(SEASON).filter((m) => m.stage === 'regular' && isFinished(m, NOW, durationOf));
const players = Object.values(seasonTotalsAt(live, SEASON, NOW, durationOf));
const semis = bracketCard(live, NOW, ctx).rows.filter((r) => r.label.startsWith('SEMI')).map((r, i) => ({ n: i + 1, homeId: /** @type {string} */ (r.homeId), awayId: /** @type {string} */ (r.awayId), kickoff: r.kickoff }));
const four = semis.flatMap((s) => [s.homeId, s.awayId]);
const win = config.rules.points.win;
/** A side's numbers. @param {string} id */
function side(id) {
  const r = /** @type {any} */ (table.find((x) => x.teamId === id));
  const home = [0, 0, 0];
  for (const m of regular.filter((x) => x.homeId === id)) {
    const res = m.summary.result;
    home[res.homeGoals > res.awayGoals ? 0 : res.homeGoals === res.awayGoals ? 1 : 2]++;
  }
  const mine = players.filter((p) => p.teamId === id);
  const scorer = [...mine].sort((a, b) => b.goals - a.goals)[0];
  const keeper = [...mine].sort((a, b) => b.saves - a.saves)[0];
  return {
    id, position: r.position, points: r.points, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, form: /** @type {string[]} */ (r.form),
    wins5: r.form.filter((/** @type {string} */ f) => f === 'W').length, home, homeWins: home[0],
    scorer: { name: ctx.playerName(scorer.playerId), goals: scorer.goals, id: scorer.playerId },
    keeper: { name: ctx.playerName(keeper.playerId), pct: Math.round((100 * keeper.saves) / Math.max(1, keeper.saves + keeper.conceded)) },
  };
}
const sides = Object.fromEntries(four.map((id) => [id, side(id)]));
const leagueTop = [...players].sort((a, b) => b.goals - a.goals)[0];
const fifth = table[4]?.points ?? 0;
const meetings = (/** @type {string} */ a, /** @type {string} */ b) => regular.filter((m) => [m.homeId, m.awayId].includes(a) && [m.homeId, m.awayId].includes(b));

/** @typedef {{ who: 'host' | 'analyst', kind: string, say: string, show: string, gesture: string }} Said */

/** A line of a kind, its `k`th way, filled. @param {string} kind @param {number} k @param {Record<string, string | number>} fill @returns {Said} */
function line(kind, k, fill = {}) {
  const def = draft.lines[kind];
  const way = def.ways[k % def.ways.length];
  const put = (/** @type {string} */ s, /** @type {boolean} */ said) => s.replace(/\{(\w+)\}/g, (_, key) => {
    if (key === 'team') return said ? spoken(String(fill.team)) : teams[String(fill.team)].shortName.toUpperCase();
    return String(fill[key] ?? `{${key}}`);
  });
  const say = put(way.say, true);
  return { who: def.who, kind, say: say.charAt(0).toUpperCase() + say.slice(1), show: way.show ? put(way.show, false) : '', gesture: def.gesture };
}

/** THE FOUR: the host brings the analyst in, the top seed's case, then two more cases that are true. @param {string} analyst */
function fourBit(analyst) {
  const top = sides[four[0]];
  /** @type {Said[]} */
  const out = [line('hostIntro', 0, { analyst, ANALYST: analyst.toUpperCase() }), line('analystHello', 0), line('caseTop', 0, { team: top.id, points: top.points }), line('hostRest', 0)];
  // The other three's cases, in order of interest, each team and each kind once.
  const others = four.slice(1).map((id) => sides[id]);
  const used = new Set();
  /** @type {[string, (s: ReturnType<typeof side>) => boolean, (s: ReturnType<typeof side>) => Record<string, string | number>][]} */
  const cases = [
    ['caseAttack', (s) => four.every((id) => sides[id].goalsFor <= s.goalsFor), (s) => ({ goalsFor: s.goalsFor })],
    ['caseDefence', (s) => four.every((id) => sides[id].goalsAgainst >= s.goalsAgainst), (s) => ({ goalsAgainst: s.goalsAgainst })],
    ['caseHot', (s) => s.wins5 >= 4, (s) => ({ form: s.form.join('') })],
    ['caseScraped', (s) => s.position === 4 && s.points - fifth <= win, (s) => ({ gap: s.points - fifth })],
    ['caseCold', (s) => s.wins5 <= 1, (s) => ({ form: s.form.join('') })],
    ['caseHome', (s) => four.every((id) => sides[id].homeWins <= s.homeWins), (s) => ({ home: s.home.join('-') })],
  ];
  // Each of the other three gets a case: the first that's true of it (each kind once), else steady by its place.
  const kinds = new Set();
  for (const s of others) {
    const c = cases.find(([kind, holds]) => !kinds.has(kind) && holds(s));
    if (c) {
      kinds.add(c[0]);
      out.push(line(c[0], used.size, { team: s.id, ...c[2](s) }));
    } else out.push(line('caseSteady', used.size, { team: s.id, place: ordinal(s.position).toUpperCase(), points: s.points }));
    used.add(s.id);
  }
  return out;
}

/** A semifinal: the host introduces it, the matchup, who decides it, a close. @param {typeof semis[number]} sf */
function semiBit(sf) {
  const h = sides[sf.homeId];
  const a = sides[sf.awayId];
  const met = meetings(h.id, a.id);
  const wins = (/** @type {string} */ id) => met.filter((m) => {
    const r = m.summary.result;
    return (m.homeId === id ? r.homeGoals - r.awayGoals : r.awayGoals - r.homeGoals) > 0;
  }).length;
  const metText = met.map((m) => `${abbr(m.homeId)} ${m.summary.result.homeGoals}-${m.summary.result.awayGoals} ${abbr(m.awayId)}`).join(' · ');
  const when = new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(sf.kickoff).toUpperCase();
  /** @type {Said[]} */
  const out = [line(`hostSemi${sf.n}`, sf.n, { home: abbr(h.id), away: abbr(a.id), when })];
  // Two lines on the matchup: who's favoured (or too close), then an upset if the lower seed is in better form, or
  // else how their meetings went.
  if (h.points - a.points > win) out.push(line('favourite', sf.n, { team: h.id, points: h.points, otherPoints: a.points }));
  else out.push(line('tooClose', sf.n));
  const both = [h, a].find((s) => met.length >= 2 && wins(s.id) === met.length);
  if (a.wins5 > h.wins5) out.push(line('upset', sf.n, { team: a.id, form: a.form.join('') }));
  else if (both) out.push(line('wonBoth', sf.n, { team: both.id, meetings: metText }));
  else if (met.length) out.push(line('split', sf.n, { meetings: metText }));
  out.push(line('hostWho', sf.n));
  const topHere = [h, a].find((s) => s.scorer.id === leagueTop.playerId);
  if (topHere) out.push(line('topScorer', sf.n, { team: topHere.id, player: topHere.scorer.name.toUpperCase(), goals: topHere.scorer.goals }));
  else {
    const s = h.scorer.goals >= a.scorer.goals ? h : a;
    out.push(line('stopScorer', sf.n, { team: s.id, player: s.scorer.name.toUpperCase(), goals: s.scorer.goals }));
  }
  const k = [h, a].sort((x, y) => y.keeper.pct - x.keeper.pct);
  if (k[0].keeper.pct - k[1].keeper.pct >= 5) out.push(line('keeper', sf.n, { team: k[0].id, player: k[0].keeper.name.toUpperCase(), pct: k[0].keeper.pct }));
  out.push(line('analystClose', sf.n));
  return out;
}

/** Seconds a line takes, a guess: the voice at about 14 characters a second and a beat after. @param {string} s */
const secondsOf = (s) => s.length / 14 + 0.6;

// 1. The desks.
const people = presenters(live.looks, config.regions.regions, config.studio.looks, config.studio.presenters);
const skins = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];
// The host (Tom: Ysolde, in her seat on the right; the analyst takes Hedrek's on the left).
const host = /** @type {(typeof people)[number]} */ (people.find((x) => x.id === draft.host) ?? people[1]);
/** @type {import('./studioSet.js').Look} */
const hostLook = { jacket: host.shirt, tie: host.tie, skin: skins[host.skin], hair: host.hair, style: host.style, woman: host.woman };
const R = { x: 0, y: 0, w: 392, h: 212 };
const screens = {
  left: ['THE FINAL TABLE', ...table.slice(0, 4).map((r) => `${r.position} ${abbr(r.teamId)} ${r.points}`)],
  right: ['SEMIFINALS', ...semis.map((s) => `${abbr(s.homeId)} v ${abbr(s.awayId)}`)],
};
const deskRow = /** @type {HTMLElement} */ (document.getElementById('desks'));
for (const c of [...draft.candidates].sort((a, b) => Number(b.id === draft.pick) - Number(a.id === draft.pick))) {
  const fig = document.createElement('figure');
  const cap = document.createElement('figcaption');
  cap.textContent = `${c.id === draft.pick ? "TOM'S PICK · " : ''}${c.name}: ${c.about}.`;
  const box = document.createElement('div');
  box.className = 'desk';
  const canvas = document.createElement('canvas');
  canvas.width = R.w;
  canvas.height = R.h;
  box.append(canvas);
  fig.append(cap, box);
  deskRow.append(fig);
  const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const look = { ...c.look, skin: skins[c.look.skin] };
  const L = setLayout(R);
  const said = fourBit(c.name)[2];
  drawSetBack(g, R, L, 0, config.settings.scene, screens);
  // The analyst on the left, turned to the screens when pointing; the host on the right, listening.
  drawFigure(g, L.seats[0].x, L.seats[0].y, L.scale, look, said.gesture === 'point' ? 'point' : 'talk', 1, said.gesture === 'point' ? -1 : 1, { mouth: true });
  drawFigure(g, L.seats[1].x, L.seats[1].y, L.scale, hostLook, 'nod', 0, -1, {});
  drawDesk(g, L);
  const k = 588 / R.w;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = said.say;
  Object.assign(bubble.style, { left: `${L.seats[0].x * k}px`, top: `${(L.seats[0].y - 4) * k}px` });
  const lower = document.createElement('div');
  lower.className = 'lower';
  lower.textContent = `${c.name.toUpperCase()} · PLAYOFF ANALYST`;
  Object.assign(lower.style, { left: `${L.seats[0].x * k}px`, top: `${L.lowerY * k}px` });
  box.append(bubble, lower);
}

// 2. The bits as said (with the first candidate's name).
const bits = /** @type {HTMLElement} */ (document.getElementById('bits'));
/** @param {string} title @param {Said[]} lines */
function transcript(title, lines) {
  const h = document.createElement('h3');
  const total = lines.reduce((s, l) => s + secondsOf(l.say), 0);
  h.textContent = `${title} · about ${Math.round(total)} s`;
  const t = document.createElement('table');
  t.innerHTML = '<tr><th>Who</th><th>Says</th><th>The graphic</th><th>Kind</th></tr>';
  for (const l of lines) {
    const tr = document.createElement('tr');
    const cell = (/** @type {string} */ text, /** @type {string} */ cls) => {
      const td = document.createElement('td');
      td.className = cls;
      td.textContent = text;
      tr.append(td);
    };
    cell(l.who === 'host' ? host.name.split(' ')[0].toUpperCase() : 'ANALYST', `who ${l.who}`);
    cell(l.say, '');
    cell(l.show, 'show');
    cell(l.kind, 'n');
    t.append(tr);
  }
  bits.append(h, t);
}
transcript('THE FOUR (after THE TABLE\'S STORY)', fourBit(draft.candidates.find((/** @type {any} */ c) => c.id === draft.pick)?.name ?? draft.candidates[0].name));
for (const sf of semis) transcript(`SEMIFINAL ${sf.n} (before its TALE OF THE TAPE): ${teams[sf.homeId].name} v ${teams[sf.awayId].name}`, semiBit(sf));

// 3. Every kind, its ways and its cost: a fixed line is one clip, a {team} line one per team.
const nTeams = config.teams.teams.length;
let clips = { host: 0, analyst: 0 };
let chars = { host: 0, analyst: 0 };
const list = /** @type {HTMLElement} */ (document.getElementById('lines'));
const table3 = document.createElement('table');
table3.innerHTML = '<tr><th>Kind</th><th>Who</th><th>When</th><th>Ways (said · the graphic)</th><th>Clips</th></tr>';
for (const [kind, def] of Object.entries(/** @type {Record<string, any>} */ (draft.lines))) {
  let n = 0;
  for (const w of def.ways) {
    const perTeam = w.say.includes('{team}');
    const each = perTeam ? nTeams : 1;
    n += each;
    /** @type {'host' | 'analyst'} */
    const who = def.who;
    clips[who] += each;
    chars[who] += each * w.say.replace('{team}', 'the Vintners').replace('{analyst}', 'Radomir Brodek').length;
  }
  const tr = document.createElement('tr');
  tr.innerHTML = `<td class="kind"></td><td class="who ${def.who}"></td><td class="when"></td><td></td><td class="n"></td>`;
  const cells = tr.querySelectorAll('td');
  cells[0].textContent = kind;
  cells[1].textContent = def.who === 'host' ? host.name.split(' ')[0].toUpperCase() : 'ANALYST';
  cells[2].textContent = def.when ?? '';
  cells[3].textContent = def.ways.map((/** @type {any} */ w) => `"${w.say}"${w.show ? ` · ${w.show}` : ''}`).join('  |  ');
  cells[4].textContent = String(n);
  table3.append(tr);
}
list.append(table3);
/** @type {HTMLElement} */ (document.getElementById('cost')).textContent = `In all: ${clips.analyst} analyst clips (${chars.analyst.toLocaleString()} characters) and ${clips.host} new host clips for ${host.name.split(' ')[0]} (${chars.host.toLocaleString()} characters): about ${(chars.analyst + chars.host).toLocaleString()} ElevenLabs credits at a credit a character (the real count from npm run voices -- --count once the tool knows these lines). A {team} line is voiced once per team (${nTeams}); a fixed line once.`;
/** @type {HTMLElement} */ (document.getElementById('seed')).textContent = `seed "${SEED}", season 1; the semifinals ${semis.map((s) => `${abbr(s.homeId)} v ${abbr(s.awayId)}`).join(' and ')}; the top four ${table.slice(0, 4).map((r) => `${abbr(r.teamId)} ${r.points}`).join(', ')}, fifth ${fifth}`;
