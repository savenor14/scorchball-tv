// The CHRONICLE pane (It remembers, Task 219; docs/channel.md §20): the third button, in the Record book's place, the
// open book. Three tabs under the title: LATEST (Task 220: the season so far, newest first, each line by its day; the
// off-season leading from the night it airs through the new season's first day; each day a sub-heading), HISTORY (on
// this day, then every past season, each opening its own page, its landmarks at the foot, with ‹ HISTORY back: one
// level only, Tom)
// and RECORDS (one stat at a time, ‹ GOALS ›, then the teams, the runs and the awards; Tom's pick B in Task 218), and MONEY
// (Task 234, Tom's pick A: every team's payroll against the cap, a click showing its contracts; team finances live here
// until the team panes come).
// A player's name opens their card and a team its card (Tasks 222–223), in the pane's place, ‹ back; not in rows that
// open something themselves (PAST SEASONS, MONEY's payrolls).
// It reads the live league's chronicle, which only takes what has aired (Task 219), so nothing is given away. The tab
// and the stat chosen are kept while the channel is open. Full only, at the pane's 86 px.
import { landmarks, legendWhy, offseasonStory, onThisDay, seasonStory } from '../../chronicle/notable.js';
import { records } from '../../chronicle/records.js';
import { seasonConfig } from '../../sim/rules.js';
import { crestCanvas } from '../crests.js';
import { guilders, payrolls, teamContracts } from '../money.js';
import { seasonPage, shortName } from '../recordBook.js';
import { findPlayers } from '../playerSearch.js';
import { el, kit } from './dom.js';
import { playerCardBody } from './playerCardView.js';
import { teamCardBody } from './teamCardView.js';

/** RECORDS' pages, in order: a player stat, or the teams, the runs, the awards. */
export const RECORD_PAGES = /** @type {const} */ ([
  ['goals', 'GOALS'], ['assists', 'ASSISTS'], ['scorchers', 'SCORCHERS'], ['saves', 'SAVES'], ['savePct', 'SAVE %'], ['stops', 'STOPS'],
  ['appearances', 'GAMES'], ['potm', 'PLAYER OF MATCH'], ['winningGoals', 'WINNING GOALS'], ['burns', 'BURNS'], ['teams', 'TEAMS'], ['runs', 'RUNS'], ['awards', 'AWARDS'],
]);
/** Stats with no single-season record (Tom, Task 218: a season's games make no sense as a record). */
const NO_SEASON = new Set(['appearances']);

/** A stat's value as shown. @param {string} stat @param {number} v */
export const shown = (stat, v) => (stat === 'savePct' ? `${(v * 100).toFixed(1)}%` : String(v));

/**
 * @param {object} o
 * @param {ReturnType<typeof import('./pane.js').createPane>} o.pane
 * @param {import('../liveLeague.js').LiveLeague} o.live
 * @param {import('../../config.js').Config} o.config
 * @param {() => number} o.now  The channel's moment (epoch ms), for LATEST's off-season and today's day.
 * @param {(open: boolean) => void} [o.onChange]  It opened or closed (to light its button).
 */
export function createChroniclePane({ pane, live, config, now, onChange }) {
  const { chronicle, league } = live;
  const awardName = Object.fromEntries(config.rules.awards.list.map((/** @type {any} */ a) => [a.id, a.name.replace(/^The /, '').toUpperCase()]));
  const awardTitle = Object.fromEntries(config.rules.awards.list.map((/** @type {any} */ a) => [a.id, a.name.replace(/^The /, '')]));
  const state = { tab: 'latest', season: 0, page: 0, card: /** @type {string | null} */ (null), team: /** @type {string | null} */ (null), teamCard: /** @type {string | null} */ (null) };
  /** Where the pane was scrolled when a card opened, to come back to. */
  let scrolledTo = 0;
  const opts = config.chronicle;
  const { calendar } = live;
  const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: config.settings.live.timeZone });
  /** A moment's day of the week, 0 = Monday, in the league's time zone. @param {number} t */
  const dayAt = (t) => DAYS.indexOf(weekday.format(t).toUpperCase());
  /** A match's day: its kick-off's (matches are played in the order of the calendar's slots). @param {number} season @param {string} matchId */
  const dayOf = (season, matchId) => {
    const slot = calendar.slots(season)[chronicle.season(season).matchIds.indexOf(matchId)];
    return slot ? dayAt(slot.kickoff) : 6;
  };
  /** @type {(id: string) => any} */
  const team = (id) => league.teams[id];
  /** @param {string} id */
  const name = (id) => shortName(league.players[id]);
  const px = (/** @type {number} */ n) => `calc(var(--px) * ${n})`;
  /** A kit swatch and the team's letters, as plain text (in a row that opens something else). @param {string} id */
  const tp = (id) => el('span', 'tm', [kit(team(id)), team(id).abbr]);
  /**
   * A team that opens its card in the pane's place (Task 223), ‹ back to here. A word before it ("v ") stays on its
   * line but outside the link, so only the kit and letters are underlined (Tom).
   * @param {string} id @param {string} [word]
   */
  const teamLink = (id, word = '') => {
    const s = el('span', 'tm pl', [kit(team(id)), team(id).abbr]);
    s.title = 'Open their card';
    s.addEventListener('click', () => openTeam(id));
    return word ? el('span', 'tm', [word, s]) : s;
  };
  /** A kit swatch and the team's letters, opening its card. @param {string} id */
  const t = (id) => teamLink(id);
  /** A word and the team after it, kept on one line (Tom: "v" never left without its team). @param {string} word @param {string} id */
  const glued = (word, id) => teamLink(id, word);
  const muted = (/** @type {string} */ v) => el('span', 'm', [v]);
  /** A player's name that opens their card in the pane's place (Task 222), ‹ back to here. @param {string} id */
  const pl = (id) => {
    const s = el('span', 'pl', [name(id)]);
    s.title = 'Open their card';
    s.addEventListener('click', () => openCard(id));
    return s;
  };
  const right = (/** @type {string | number} */ v) => el('span', 'r', [String(v)]);
  /** @param {string} cols @param {(Node | string)[]} cells @param {string} [cls] */
  const row = (cols, cells, cls = '') => {
    const r = el('div', `chr-row ${cls}`, cells.map((c) => (typeof c === 'string' ? el('span', '', [c]) : c)));
    r.style.gridTemplateColumns = cols;
    return r;
  };
  const sub = (/** @type {string} */ title) => el('div', 'chr-sub', [title]);
  const none = () => el('div', 'chr-note', ['None yet.']);
  /** A list, or "None yet." @param {HTMLElement[]} rows */
  const list = (rows) => (rows.length ? rows : [none()]);

  /** Players: name, the season (season and match records), the value. @param {any[]} xs @param {string} stat @param {boolean} seasoned @param {number} n */
  const players = (xs, stat, seasoned, n) => list(xs.slice(0, n).map((x) => row(`1fr ${px(seasoned ? 13 : 0)} ${px(stat === 'savePct' ? 20 : 13)}`,
    [pl(x.playerId), seasoned ? muted(`S${x.season}`) : '', right(shown(stat, x.value))])));
  /** Teams: kit and letters, the season, the value. @param {any[]} xs @param {(x: any) => string} value */
  const teams = (xs, value) => list(xs.slice(0, 5).map((x) => row(`1fr ${px(13)} ${px(18)}`, [t(x.teamId), muted(`S${x.season}`), right(value(x))])));
  /** Seasons whose Cup has been won (on screen). */
  const finished = () => [...chronicle.seasons.values()].filter((s) => s.championId).map((s) => s.season);

  const tabs = /** @type {const} */ (['latest', 'history', 'records', 'money']).map((id) => {
    const b = el('button', 'guide-filter', [id.toUpperCase()]);
    b.addEventListener('click', () => { Object.assign(state, { tab: id, season: 0, team: null }); show(); });
    return { id, b };
  });
  const prev = el('button', '', ['‹']);
  const next = el('button', '', ['›']);
  const stepName = el('span', '', ['']);
  prev.addEventListener('click', () => { state.page = (state.page + RECORD_PAGES.length - 1) % RECORD_PAGES.length; show(); });
  next.addEventListener('click', () => { state.page = (state.page + 1) % RECORD_PAGES.length; show(); });
  const stepper = el('div', 'chr-step', [prev, stepName, next]);
  const bar = el('div', '', [el('div', 'guide-bar', tabs.map((x) => x.b)), stepper]);
  const body = el('div', 'chr');

  // FIND A PLAYER (Tom, 2026-10-27; playerSearch.js): a bar fixed at the pane's foot whatever the tab, the matches
  // rising above it over the tab's foot once settings.chronicle.search.minLetters are typed; a name opens the card, ‹
  // back to the matches with the search kept. ✕ or Esc clears it (Esc with nothing typed closes the pane, as anywhere).
  // The channel's keys don't fire while typing.
  const search = config.settings.chronicle.search;
  const input = /** @type {HTMLInputElement} */ (el('input', 'chr-find-input'));
  input.type = 'text';
  input.placeholder = 'FIND A PLAYER';
  input.spellcheck = false;
  input.autocomplete = 'off';
  input.maxLength = 30;
  const clear = el('button', 'chr-find-x', ['✕']);
  clear.title = 'Clear (Esc)';
  const hitsBox = el('div', 'chr-find-hits');
  const foot = el('div', 'chr-find', [hitsBox, el('div', 'chr-find-bar', [el('span', 'chr-find-icon'), input, clear])]);
  const note = (/** @type {string} */ text) => el('div', 'chr-find-note', [text]);
  /** Draw the matches for what's typed (none while a card is open). */
  function showHits() {
    const r = findPlayers(chronicle, league, input.value, search);
    clear.hidden = !input.value;
    hitsBox.hidden = r.state === 'empty' || Boolean(state.card || state.teamCard);
    hitsBox.replaceChildren(...(r.state === 'short' ? [note(`${search.minLetters} letters or more`)] : r.state === 'none' ? [note('Nobody by that name')] : [
      ...r.hits.map((h) => {
        const tag = h.status === 'retired' ? 'RET' : h.status === 'free' ? 'FREE' : team(/** @type {string} */ (h.teamId)).abbr;
        const b = el('button', 'chr-find-hit', [h.teamId ? kit(team(h.teamId)) : el('span', ''), el('span', 'nm', [h.name]), el('span', h.status === 'free' ? 'tag free' : 'tag', [tag])]);
        b.addEventListener('click', () => openCard(h.id));
        return b;
      }),
      ...(r.more ? [note(`and ${r.more} more`)] : []),
    ]));
  }
  input.addEventListener('input', showHits);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Escape') return;
    if (input.value) {
      input.value = '';
      showHits();
    } else pane.close();
  });
  clear.addEventListener('click', () => {
    input.value = '';
    showHits();
    input.focus();
  });

  /** "1st", "100th". @param {number} n */
  const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
  const COUNT = /** @type {Record<string, [string, string]>} */ ({ goals: ['goal', 'goals'], assists: ['assist', 'assists'], saves: ['save', 'saves'], stops: ['stop', 'stops'], appearances: ['game', 'games'] });
  const IN_A_ROW = ['', '', 'back-to-back Cups', 'three Cups in a row', 'four Cups in a row', 'five Cups in a row', 'six Cups in a row'];
  /** A Cup landmark won with the Pennant too. @param {import('../../chronicle/notable.js').Item} it */
  const andPennant = (it) => (it.withPennant ? ', and the Pennant' : '');
  /** A legend's career in one figure: what made them one (600 goals, 4 awards, 6 Cups). @param {string} id */
  const careerLine = (id) => {
    const why = legendWhy(chronicle, opts, id);
    if (!why) return '';
    const word = why.stat === 'awards' ? 'awards' : why.stat === 'cups' ? 'Cups' : COUNT[why.stat][1];
    return `${why.value} ${word}`;
  };
  /** An item in words, teams as kits and letters. @param {import('../../chronicle/notable.js').Item} it @returns {(string | Node)[]} */
  function words(it) {
    const who = it.playerId ? pl(it.playerId) : '';
    const v = /** @type {number} */ (it.value);
    const team = /** @type {string} */ (it.teamId);
    const stat = /** @type {string} */ (it.stat);
    switch (it.kind) {
      case 'milestone': return [who, `: ${ordinal(v)} ${COUNT[stat][0]}`];
      case 'performance': return [who, `: ${v} ${COUNT[stat][1]} `, glued('v ', /** @type {string} */ (it.opponentId))];
      case 'run': return [t(team), stat === 'won' ? ` ${v} wins in a row` : ` ${v} without a win`];
      case 'pennant': return [t(team), ` win the Pennant, ${v} pts`];
      case 'playoffs': return ['Playoffs: ', ...(it.teamIds ?? []).flatMap((id, i) => (i ? [' ', t(id)] : [t(id)]))];
      case 'champion': return [t(team), ` win the Cup, ${it.score} `, glued('v ', /** @type {string} */ (it.opponentId))];
      case 'award': return [`${awardTitle[stat]}: `, who];
      case 'first_pick': return ['No. 1 pick: ', who, ' ', glued('to ', team)];
      case 'call_up': return [who, ' called up ', glued('by ', team)];
      case 'legend': return [`${state.tab === 'history' ? 'A legend retired' : 'A legend retires'}: `, who, `, ${careerLine(/** @type {string} */ (it.playerId))}`];
      case 'first_season': return ['The first season'];
      // HISTORY's landmarks in the past tense (LATEST's Cup is news, in the present).
      case 'first_cup': return [t(team), ` won their first Cup${andPennant(it)}`];
      case 'cups_in_a_row': return [t(team), ` won ${IN_A_ROW[v] ?? `${v} Cups in a row`}${andPennant(it)}`];
      case 'drought': return [t(team), ` won the Cup, their first in ${v} seasons${andPennant(it)}`];
      case 'double': return [t(team), ' won the Pennant and the Cup'];
      // A record falling (Task 220b): news in LATEST, past in HISTORY.
      case 'record': return state.tab === 'history'
        ? (it.scope === 'season' ? [who, ` set the season ${COUNT[stat][1]} record, ${v}`] : [who, ` took the all-time ${COUNT[stat][1]} record from `, pl(/** @type {string} */ (it.previousId))])
        : [who, `: ${it.scope === 'season' ? 'season' : 'all-time'} ${COUNT[stat][1]} record, ${v}`];
      default: return [];
    }
  }
  /** Lines that stand out: Cups, legends, records. */
  const BIG = new Set(['champion', 'legend', 'record', 'first_cup', 'cups_in_a_row', 'drought', 'double', 'first_season']);
  /** A line: its label (a day or a season) and its words. @param {string} label @param {import('../../chronicle/notable.js').Item} it */
  const line = (label, it) => el('div', `chr-item${BIG.has(it.kind) ? ' big' : it.kind === 'run' ? ' run' : ''}`, [el('span', 'when', [label]), el('span', '', words(it))]);

  /** A line with no label, the pane's full width (LATEST's, under their day; a season page's highlights). @param {import('../../chronicle/notable.js').Item} it */
  const plain = (it) => el('div', `chr-line${BIG.has(it.kind) ? ' big' : ''}`, words(it));

  /** The latest season with a match on screen (0 before the first). */
  const shownSeason = () => Math.max(0, ...[...chronicle.seasons.values()].filter((e) => e.matchIds.length).map((e) => e.season));

  function latestPage() {
    const season = shownSeason();
    if (!season) return [el('div', 'chr-note', ['The first match is still to come.'])];
    const done = Boolean(chronicle.season(season).championId);
    // The off-season leads (Tom): the night it airs, until the new season's first day is over.
    const offSeason = done ? season
      : season > 1 && now() < calendar.seasonStart(season) + config.settings.chronicle.latestOffseasonDays * 86_400_000 ? season - 1 : 0;
    const off = offSeason ? offseasonStory(chronicle, opts, offSeason, config.settings.awards.order) : [];
    const finalDay = offSeason ? DAYS[dayOf(offSeason, chronicle.season(offSeason).matchIds.at(-1) ?? '')] : '';
    const out = [];
    if (off.length) out.push(el('div', 'chr-h', [`SEASON ${offSeason}: OFF-SEASON`]), sub(finalDay), ...off.map((it) => plain(it)));
    const story = seasonStory(chronicle, opts, season).reverse();
    out.push(el('div', 'chr-h', [`SEASON ${season}`]));
    if (!story.length) out.push(el('div', 'chr-note', ['Nothing big yet this season.']));
    // Each day a sub-heading, its lines under it (Tom: not THU on every line).
    let day = '';
    for (const it of story) {
      const d = DAYS[dayOf(season, /** @type {string} */ (it.matchId))];
      if (d !== day) out.push(sub((day = d)));
      out.push(plain(it));
    }
    return out;
  }

  function historyPage() {
    if (state.season) return seasonDetail(state.season);
    const done = finished();
    if (done.length === 0) return [el('div', 'chr-note', ['The first season is under way.'])];
    const out = [];
    const today = onThisDay(chronicle, opts, { before: shownSeason(), day: dayAt(now()), dayOf });
    if (today.length) out.push(el('div', 'chr-h', ['ON THIS DAY']), ...today.map((it) => line(`S${it.season}`, it)));
    // Each season's landmarks are on its own page (Tom: the past seasons are the heart of it; no eras to scroll).
    out.push(
      el('div', 'chr-h', ['PAST SEASONS']),
      el('div', 'chr-note', ['Click a season for its table, playoffs, leaders and highlights.']),
      row(`${px(13)} 1fr 1fr`, ['', muted('CUP'), muted('PENNANT')]),
    );
    for (const s of [...done].reverse()) {
      const e = chronicle.season(s);
      const r = row(`${px(13)} 1fr 1fr`, [muted(`S${s}`), tp(/** @type {string} */ (e.championId)), tp(/** @type {string} */ (e.shieldId))], 'link');
      r.title = `Season ${s}`;
      r.addEventListener('click', () => { state.season = s; show(); });
      out.push(r);
    }
    return out;
  }

  /** A past season's page: the Cup and Pennant, the table, the playoffs, the leaders. @param {number} s */
  function seasonDetail(s) {
    const p = seasonPage(chronicle, s, league.players);
    const back = el('div', 'chr-back', ['‹ HISTORY']);
    back.addEventListener('click', () => { state.season = 0; show(); });
    const honour = (/** @type {string} */ id, /** @type {string} */ line) => el('div', 'chr-honour', [crestCanvas(document, team(id), { style: 'shaded', scale: 1 }), el('div', '', [el('div', '', [team(id).shortName]), muted(line)])]);
    const out = [back, el('div', 'chr-h', [`SEASON ${s}`]),
      honour(p.cupId, `Cup, ${p.finalScore} v ${team(p.runnerUpId).abbr}`),
      honour(p.pennantId, `Pennant, ${p.pennantPoints} pts`),
      sub('TABLE')];
    for (const r of p.table) out.push(row(`${px(8)} 1fr ${px(14)} ${px(12)}`, [muted(String(r.pos)), t(r.teamId), right(`${r.goalDifference > 0 ? '+' : ''}${r.goalDifference}`), right(r.points)], r.pos === config.rules.playoffs.teams ? 'cut' : ''));
    out.push(sub('PLAYOFFS'));
    for (const m of p.playoffs) out.push(row(`${px(10)} 1fr`, [muted(m.stage === 'final' ? 'F' : 'SF'), el('span', '', [t(m.homeId), ` ${m.score} `, t(m.awayId)])]));
    // Its awards (Tom, Task 252), in the show's order: the Spark first (from season 2), the Ember Boot last.
    const given = new Map(chronicle.season(s).awards.map((x) => [x.award, x.playerId]));
    const aired = config.settings.awards.order.filter((/** @type {string} */ id) => given.has(id));
    if (aired.length) out.push(sub('AWARDS'), ...list(aired.map((/** @type {string} */ id) => row(`${px(34)} 1fr`, [muted(awardTitle[id]), pl(/** @type {string} */ (given.get(id)))]))));
    // The No. 1 pick of the draft before it (Tom, 2026-10-28: who they were, a click away), from season 2 on.
    const first = s > 1 ? [...chronicle.players.values()].find((x) => x.joined?.how === 'draft' && x.joined.season === s - 1 && x.joined.round === 1 && x.joined.pick === 1) : null;
    if (first) out.push(sub('NO. 1 PICK'), row(`1fr ${px(18)}`, [pl(first.id), t(/** @type {string} */ (first.joined?.teamId))]));
    for (const [title, xs] of /** @type {const} */ ([['GOALS', p.regular.goals], ['ASSISTS', p.regular.assists], ['PLAYOFF GOALS', p.playoffLeaders.goals]])) {
      out.push(sub(title), ...list(xs.map((l) => row(`1fr ${px(12)}`, [pl(l.playerId), right(l.value)]))));
    }
    // Its landmarks (Tom: on the season's own page): Cups, records changing hands, legends retiring.
    const marks = landmarks(chronicle, opts, s);
    if (marks.length) out.push(sub('HIGHLIGHTS'), ...marks.map((it) => plain(it)));
    return out;
  }

  function recordsPage() {
    const r = records(chronicle, config.chronicle.records);
    const [stat] = RECORD_PAGES[state.page];
    if (stat === 'teams') {
      return [
        sub('CUPS AND PENNANTS'), ...r.teams.history.map((h) => row(`1fr ${px(14)} ${px(14)}`, [t(h.teamId), right(`${h.cups.length}C`), right(`${h.pennants.length}P`)])),
        sub('MOST GAMES FOR THE CLUB'), ...list(r.teams.clubGames.map((x) => row(`${px(18)} 1fr ${px(12)}`, [t(x.teamId), pl(x.playerId), right(x.value)]))),
        sub('POINTS (SEASON)'), ...teams(r.teams.mostPoints, (x) => `${x.value}`),
        sub('GOALS (SEASON)'), ...teams(r.teams.mostGoals, (x) => `${x.value}`),
        sub('FEWEST LET IN'), ...teams(r.teams.fewestConceded, (x) => `${x.value}`),
        sub('BIGGEST WINS'), ...teams(r.teams.biggestWins, (x) => x.score.join('-')),
      ];
    }
    if (stat === 'runs') {
      return [
        sub('WINS IN A ROW'), ...teams(r.teams.winningRuns, (x) => `${x.length}`),
        sub('UNBEATEN'), ...teams(r.teams.unbeatenRuns, (x) => `${x.length}`),
        sub('WITHOUT A WIN'), ...teams(r.teams.winlessRuns, (x) => `${x.length}`),
        el('div', 'chr-note', ['Runs within a season, incl. playoffs.']),
      ];
    }
    if (stat === 'awards') {
      const out = [sub('MOST AWARDS'), ...list(r.awards.most.slice(0, 5).map((x) => row(`1fr ${px(10)}`, [pl(x.playerId), right(x.value)])))];
      // The Spark (Task 252) is won once at most, so it has no "most" list; it counts in MOST AWARDS.
      for (const a of config.rules.awards.list.filter((/** @type {any} */ a) => a.stat !== 'rookieBlend')) {
        out.push(sub(awardName[a.id]), ...list((r.awards.byAward[a.id] ?? []).slice(0, 3).map((x) => row(`1fr ${px(10)}`, [pl(x.playerId), right(x.value)]))));
      }
      return out;
    }
    const k = /** @type {typeof import('../../chronicle/records.js').PLAYER_STATS[number]} */ (stat);
    const out = [sub('ALL-TIME*'), ...players(r.career[k], stat, false, 5)];
    if (!NO_SEASON.has(stat)) out.push(sub('SEASON'), ...players(r.season[k], stat, true, 5));
    if (stat in r.playoffs) out.push(sub('PLAYOFFS'), ...players(/** @type {any} */ (r.playoffs)[stat], stat, false, 3));
    if (stat in r.match) out.push(sub('ONE MATCH'), ...players(/** @type {any} */ (r.match)[stat], stat, true, 3));
    out.push(el('div', 'chr-note', [`* Incl. playoffs.${NO_SEASON.has(stat) ? '' : ' A season is the regular season.'}`]));
    return out;
  }

  /** MONEY (Task 234): every team's payroll, a bar against the cap (gold when nearly full); a click shows its contracts. */
  function moneyPage() {
    const cap = seasonConfig(config, calendar.seasonAt(now())).rules.finances.cap;
    const out = [el('div', 'chr-h', ['PAYROLLS']), el('div', 'chr-note', [`The cap: ${guilders(cap)} a season. Click a team for its contracts.`])];
    for (const { teamId, payroll } of payrolls(chronicle, Object.keys(league.teams))) {
      const r = row(`${px(30)} 1fr`, [tp(teamId), right(guilders(payroll))], 'link');
      r.title = team(teamId).name;
      r.addEventListener('click', () => { state.team = state.team === teamId ? null : teamId; show(); });
      const share = payroll / cap;
      const fill = el('span', share > 1 ? 'over' : share > 0.95 ? 'full' : '');
      fill.style.width = `${Math.min(100, share * 100)}%`;
      out.push(r, el('div', 'chr-bar', [fill]));
      if (state.team !== teamId) continue;
      const deals = teamContracts(chronicle, teamId);
      // Its contracts in a block of their own, a line under them before the next team (Tom: room to breathe).
      out.push(el('div', 'chr-team', [el('div', 'chr-sub', [team(teamId).name.toUpperCase()]), el('div', 'chr-note', [`${guilders(payroll)} of ${guilders(cap)}`]),
        ...list(deals.map((c) => row(`1fr ${px(17)}`, [pl(c.playerId), right(guilders(c.wage))])))]));
    }
    return out;
  }

  /** Draw the chosen tab. */
  function show() {
    // A player's card (Task 222) or a team's (Task 223) in the pane's place: the tabs hidden, ‹ back to the tab (or
    // season page) it came from.
    if (state.card || state.teamCard) {
      // The bar's slot too, so no empty frame is left under the title.
      if (bar.parentElement) bar.parentElement.hidden = true;
      const backLabel = state.tab === 'history' && state.season ? `SEASON ${state.season}` : state.tab === 'records' ? `RECORDS · ${RECORD_PAGES[state.page][1]}` : state.tab === 'money' && state.team ? `MONEY · ${team(state.team).abbr}` : state.tab.toUpperCase();
      body.replaceChildren(state.card
        ? playerCardBody(document, { chronicle, config, league, playerId: state.card, backLabel, onBack: closeCard })
        : teamCardBody(document, { chronicle, config, league, teamId: /** @type {string} */ (state.teamCard), backLabel, onBack: closeCard }));
      pane.scroller.scrollTop = 0;
      showHits();
      return;
    }
    if (bar.parentElement) bar.parentElement.hidden = false;
    tabs.forEach(({ id, b }) => b.classList.toggle('on', id === state.tab));
    stepper.hidden = state.tab !== 'records';
    stepName.textContent = RECORD_PAGES[state.page][1];
    body.replaceChildren(...(state.tab === 'latest' ? latestPage() : state.tab === 'history' ? historyPage() : state.tab === 'money' ? moneyPage() : recordsPage()));
    pane.scroller.scrollTop = 0;
    showHits();
  }

  /** Open a player's card from a name on the pane. @param {string} id */
  function openCard(id) {
    scrolledTo = pane.scroller.scrollTop;
    state.card = id;
    show();
  }

  /** Open a team's card from a team on the pane (Task 223). @param {string} id */
  function openTeam(id) {
    scrolledTo = pane.scroller.scrollTop;
    state.teamCard = id;
    show();
  }

  /** Back from the card to where it was opened, scrolled as it was. */
  function closeCard() {
    state.card = null;
    state.teamCard = null;
    show();
    pane.scroller.scrollTop = scrolledTo;
  }

  return {
    /** Open or close the CHRONICLE. */
    toggle() {
      pane.toggle('chronicle', () => ({ title: 'CHRONICLE', bar, body, foot, onClose: () => { state.card = null; state.teamCard = null; onChange?.(false); } }));
      if (pane.openId === 'chronicle') {
        show();
        onChange?.(true);
      }
    },
  };
}
