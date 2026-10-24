// The Rulebook and About panes' words (Task 163; docs/channel.md §17.2; data/rulebook.json), and About's guide (Task
// 172). Pure: the text's {facts} are filled in from the rules and settings, so the words can't drift from the sim.
import { createCalendar } from './calendar.js';
import { guilders } from './money.js';

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

/**
 * The facts the text may name, worked out from the config.
 * @param {import('../config.js').Config} config
 * @returns {Record<string, number | string>}
 */
export function rulebookFacts(config) {
  const { rules, settings, teams, regions } = config;
  const lineup = /** @type {Record<string, number>} */ (rules.roster.lineup);
  const heatAt = (/** @type {number} */ heat) => Math.round((rules.heat.burnSeconds * heat) / 100);
  const n = teams.teams.length;
  return {
    onPitch: Object.values(lineup).reduce((a, b) => a + b, 0),
    defenders: lineup.D,
    halfMinutes: rules.match.halfMinutes,
    overtimeMinutes: rules.match.overtimeMinutes,
    matchday: rules.roster.matchday,
    squad: rules.roster.size,
    subs: rules.match.maxSubstitutions,
    warmSeconds: heatAt(rules.heat.warmAt),
    hotSeconds: heatAt(rules.heat.hotAt),
    burnSeconds: rules.heat.burnSeconds,
    win: rules.points.win,
    draw: rules.points.draw,
    teams: n,
    regions: regions.regions.length,
    rounds: 2 * (n - 1),
    finalRoundMatches: Math.floor(n / 2),
    seasonDays: settings.calendar.seasonDays,
    playoffTeams: rules.playoffs.teams,
    shootoutKicks: rules.playoffs.shootoutKicks,
    // The off-season (Task 202): the draft's rounds, the lottery's teams (those that miss the playoffs), the Kindling
    // League and how long a team holds a reserve's rights.
    draftRounds: rules.draft.rounds,
    lotteryTeams: Math.min(rules.draft.lotteryWeights.length, n - rules.playoffs.teams),
    reserves: rules.reserves.name,
    rightsSeasons: rules.reserves.rightsSeasons,
    // Finances (Task 234): rookie deals, the cap, the max contract and the longest deal there is.
    rookieSeasons: rules.finances.rookieSeasons,
    cap: guilders(rules.finances.cap),
    maxWage: guilders(rules.finances.maxContractShare * rules.finances.cap),
    maxSeasons: Math.max(rules.finances.rookieSeasons, ...rules.finances.contractSeasons.map((/** @type {any} */ b) => b.max)),
    // The guide's (Task 172): a match's real length, the season's matches, the final round's day, and how often a live
    // match starts (the regular season's spacing, to 5 minutes: "2h 40m").
    realMinutes: settings.match.realMinutes,
    matches: (n - 1) * n,
    finalRoundDay: Number(/day (\d+)/.exec(settings.calendar.finalRoundKickoff)?.[1] ?? settings.calendar.seasonDays),
    liveEvery: liveEvery(config),
    // The grounds (Tom's note 14): "the Port Calder Gulls at Calder Quay Stadium, …, and the Kesh Oasis at the Caravanserai".
    grounds: grounds(teams.teams),
  };
}

/** Each club at its ground, in the data's order, as a list in words. @param {{ name: string, ground: string }[]} teams */
function grounds(teams) {
  const each = teams.map((t) => `the ${t.name} at ${t.ground}`);
  return `${each.slice(0, -1).join(', ')} and ${each.at(-1)}`;
}

/** How often a live match starts in the regular season, as "2h 40m" (to 5 minutes). @param {import('../config.js').Config} config */
function liveEvery(config) {
  const slots = createCalendar(config).slots(1).filter((s) => s.stage === 'regular');
  const minutes = Math.round((slots[1].kickoff - slots[0].kickoff) / 60_000 / 5) * 5;
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${String(minutes % 60).padStart(2, '0')}m` : `${minutes}m`;
}

/**
 * Fill a line's {fact} and {fact|word} blanks.
 * @param {string} text @param {Record<string, number | string>} facts
 * @throws {Error} on a blank that names no fact.
 */
export function fillFacts(text, facts) {
  return text.replace(/\{(\w+)(\|word)?\}/g, (_, name, word) => {
    if (!(name in facts)) throw new Error(`rulebook: no fact called {${name}}`);
    const v = facts[name];
    return word && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < WORDS.length ? WORDS[v] : String(v);
  });
}

/**
 * The Rulebook, filled in: its intro and sections, each with numbered rules.
 * @param {import('../config.js').Config} config
 * @returns {{ intro: string, sections: { id: string, tab: string, title: string, rules: string[] }[] }}
 */
export function rulebook(config) {
  const facts = rulebookFacts(config);
  const book = config.rulebook.rulebook;
  return {
    intro: fillFacts(book.intro, facts),
    sections: book.sections.map((/** @type {any} */ s) => ({ id: s.id, tab: s.tab, title: s.title, rules: s.rules.map((/** @type {string} */ r) => fillFacts(r, facts)) })),
  };
}

/**
 * About's paragraphs, filled in, and how many at the end are set small (the font, the version, the copyright).
 * @param {import('../config.js').Config} config @param {string} [version]  The deploy's (version.json, Task 277): its first
 *   seven characters, so a viewer's note can say which; "dev" on the dev server.
 * @returns {{ tab: string, paragraphs: string[], small: number }}
 */
export function about(config, version = 'dev') {
  const facts = { ...rulebookFacts(config), version: version.slice(0, 7) };
  return { tab: config.rulebook.about.tab, paragraphs: config.rulebook.about.paragraphs.map((/** @type {string} */ p) => fillFacts(p, facts)), small: config.rulebook.about.small };
}

/**
 * About's guide (Task 172), filled in: its tab and sections, each a few items (a line, perhaps with a button's icon, a
 * scorebug label, the heat meter or a swatch glowing with momentum beside it).
 * @param {import('../config.js').Config} config
 * @returns {{ tab: string, sections: { title: string, items: { text: string, icon?: string, chip?: string, chipKind?: string, heat?: boolean, momentum?: boolean }[] }[] }}
 */
export function guide(config) {
  const facts = rulebookFacts(config);
  const g = config.rulebook.guide;
  return {
    tab: g.tab,
    sections: g.sections.map((/** @type {any} */ s) => ({ title: s.title, items: s.items.map((/** @type {any} */ i) => ({ ...i, text: fillFacts(i.text, facts) })) })),
  };
}
