// OFF THE BALL, the podcast (Tom's picks, 2026-10-20; docs/podcast.md; data/podcast.json): what an episode says. Tamsin
// Tregarrow on the left, Samir Haddani on the right. One episode a regular-season day, made at settings.podcast.at from
// what has aired by then, so every airing of it (and every screen) says the same: SEASON AHEAD on day 1, a daily one
// after it, SEASON REVIEW once the final has finished. A major event of the channel (Tom, 2026-10-20: about 9-10
// minutes), in three talks: the opening, THE DAY (every hook whose fact is true, in turn; SEASON AHEAD's and REVIEW's own
// lead first), the first discussion and the call for the day's goals; then the goals (a reel, programme.js) and, after
// them, the call for the break; then the ad break (programme.js); then back, the second and third discussions (each
// brought in by whoever opens it), PICKS (each owning up to the last one) and the close. Each hook line is said only
// when its fact is true; players and numbers go on the pane, never spoken. Pure and DOM-free.
//
// The themes come from a seeded schedule, not from the facts (only this season's and last season's matches are kept,
// so a schedule that remembered past episodes couldn't be worked out again later): settings.podcast.discussions an
// episode, dealt from a deck of the themes, each once in every run of eight, never the same twice within an episode
// or running; each theme's discussions dealt the same way, so none comes back until its theme's others have aired.
//
// The money and the archive come from the chronicle as aired, which only the off-season changes, and that airs after
// the season's last episode (SEASON REVIEW, at the final's whistle); everything else from matches finished by `at`.
import { createRng } from '../sim/rng.js';
import { seasonAwards } from '../sim/awards.js';
import { winnerOf } from '../sim/potm.js';
import { seasonConfig } from '../sim/rules.js';
import { parseDayTime } from '../util.js';
import { guilders, payrolls } from './money.js';
import { isFinished, seasonTotalsAt, tableAt } from './onScreen.js';
import { allPolls, pollsAt } from './polls.js';
import { lineTiming, sayer, talkEnd, teamsForTalk, timeLines } from './studio.js';
import { studioJingleMs } from './talk.js';

/**
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {{ timelineOf: (m: LiveMatch) => import('./timeline.js').Timeline, playerName: (id: string) => string, formatTime: (t: number) => string }} PodcastContext
 * @typedef {'tamsin' | 'samir'} Pundit
 * @typedef {'ahead' | 'daily' | 'review'} EpisodeKind
 * @typedef {{ kind: EpisodeKind, season: number, n: number, at: number }} EpisodeSlot  `n`: its place in the season's
 *   episodes (SEASON AHEAD 0, the dailies after it, SEASON REVIEW last); `at`: when it's made (epoch ms).
 * @typedef {{ key: string, kickoff: number, homeId: string, awayId: string, tamsin: string, samir: string }} Picks  The
 *   match each picks a winner of (calendar slot key), and their picks (team ids).
 * @typedef {import('./studio.js').Said & { who: 0 | 1, under?: { who: 0 | 1, text: string, clip: import('./studio.js').Clip } }} PodcastSaid
 *   `under`: the listener's interjection, played softly under this line.
 * @typedef {object} Episode
 * @property {EpisodeKind} kind
 * @property {number} season
 * @property {number} at        When it was made (epoch ms): everything in it had aired by then.
 * @property {string[]} hooks  THE DAY's topics said (table, hotTake, money, archive, kids, vote), SEASON AHEAD's or
 *   REVIEW's lead first (ahead, review).
 * @property {{ id: string, title: string, theme: string, part: number, first: number, last: number }[]} discussions
 *   Each one's lines are parts[part][first..last].
 * @property {string[]} goals  The day's matches whose goals the reel shows (matches finished that day by `at`), in
 *   order; none without two goals or more.
 * @property {Picks | null} picks
 * @property {PodcastSaid[][]} parts  The three talks: before the goals, between the goals and the break, after it.
 */

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Who sits where: Tamsin on the left (seat 0), Samir on the right. */
export const SEATS = /** @type {const} */ (['tamsin', 'samir']);
const seatOf = (/** @type {Pundit} */ who) => /** @type {0 | 1} */ (SEATS.indexOf(who));
/** A position on the pane, as the draft board writes it. */
const POSITION_NAME = /** @type {Record<string, string>} */ ({ K: 'KEEPER', D: 'DEFENDER', M: 'MIDFIELDER', S: 'STRIKER' });

/**
 * A podcast line's clip under assets/voices/, without .mp3 (also its key in config.voiceLengths):
 * podcast/<who>/<kind>-<way>[-<team>]; a discussion's line is <discussion>-<line>, an interjection interjection-<i>.
 * @param {Pundit} who @param {import('./studio.js').Clip} clip
 */
export const podcastClipKey = (who, clip) => `podcast/${who}/${clip.kind}-${clip.way}${clip.team ? `-${clip.team}` : ''}`;

/**
 * The pair as the desk seats them, left first: id (their clip folder), name, look (data/podcast.json pair).
 * @param {import('../config.js').Config} config
 */
export const podcastCast = (config) => SEATS.map((id) => ({ id, name: config.podcast.pair[id].name, look: config.podcast.pair[id].look }));

/** The podcast's line timing: the desk's beats, each line as long as its own clip. @param {import('../config.js').Config} config */
export const podcastTiming = (config) => lineTiming(config, SEATS.map((id) => ({ id })), (id, clip) => podcastClipKey(/** @type {Pundit} */ (id), clip));

/**
 * An episode timed for the screen: each of its talks' lines from the start of that talk, and how long each runs.
 * @param {LiveLeague} live @param {EpisodeSlot} slot @param {PodcastContext} ctx
 */
export function podcastScript(live, slot, ctx) {
  const episode = podcastEpisode(live, slot, ctx);
  const timing = podcastTiming(live.config);
  // The studio jingle opens the show (guide.js studioJingle): its first line waits for it. The last talk ends with the
  // band back to the studio (transitions.js): room after the last line for it to come down and its name to show.
  const tr = live.config.settings.transitions;
  const outroMs = tr.openStingSeconds * 1000;
  const parts = episode.parts.map((said, k) => {
    const quiet = k === 0 ? studioJingleMs(live.config) : 0;
    const script = timeLines(said, Infinity, timing, quiet);
    return { script, ms: Math.ceil(talkEnd(script, timing, quiet) + (k === episode.parts.length - 1 ? outroMs : 0)) };
  });
  return { episode, parts };
}

/**
 * The next premiere to promote at `t` (Tom, 2026-10-21: like a big match): the next episode made after `t`, within
 * settings.podcast.promoHours (not SEASON REVIEW, made at the final's whistle). Null with none.
 * @param {LiveLeague} live @param {number} t @param {PodcastContext} ctx
 * @returns {EpisodeSlot | null}
 */
export function podcastPremiere(live, t, ctx) {
  const season = live.calendar.seasonAt(t);
  const next = podcastEpisodes(live, season, ctx).find((s) => s.kind !== 'review' && s.at > t);
  return next && next.at - t <= live.config.settings.podcast.promoHours * HOUR_MS ? next : null;
}

/**
 * When an episode airs again: overnight, at settings.podcast.repeatAt on the day after it was made.
 * @param {LiveLeague} live @param {EpisodeSlot} slot
 */
export function podcastRepeatAt(live, slot) {
  const { calendar } = live;
  const day = Math.floor((slot.at - calendar.seasonStart(slot.season)) / DAY_MS);
  return calendar.instant(slot.season, (day + 1) * 1440 + parseDayTime(`day 1 ${live.config.settings.podcast.repeatAt}`).minutes);
}

/**
 * A season's episodes, in order, with when each is made: SEASON AHEAD on day 1 and a daily one on each later day with
 * regular-season matches, at settings.podcast.at; SEASON REVIEW when the final finishes on screen (only once it has
 * been played).
 * @param {LiveLeague} live @param {number} season @param {PodcastContext} ctx
 * @returns {EpisodeSlot[]}
 */
export function podcastEpisodes(live, season, ctx) {
  const { calendar, config } = live;
  const at = parseDayTime(`day 1 ${config.settings.podcast.at}`).minutes;
  const lastRegular = calendar.slots(season)[calendar.regularCount - 1].kickoff;
  /** @type {EpisodeSlot[]} */
  const out = [{ kind: 'ahead', season, n: 0, at: calendar.instant(season, at) }];
  for (let day = 2; calendar.instant(season, (day - 1) * 1440) <= lastRegular; day++) {
    out.push({ kind: 'daily', season, n: day - 1, at: calendar.instant(season, (day - 1) * 1440 + at) });
  }
  const final = live.matchesIn(season).find((m) => m.stage === 'final');
  if (final?.summary) out.push({ kind: 'review', season, n: out.length, at: final.kickoff + ctx.timelineOf(final).duration });
  return out;
}

/** How many episodes a season has (SEASON AHEAD, the dailies, SEASON REVIEW): the same every season. @param {LiveLeague} live */
const perSeason = (live) => {
  const { calendar } = live;
  const lastRegular = calendar.slots(1)[calendar.regularCount - 1].kickoff;
  let days = 0;
  for (let day = 2; calendar.instant(1, (day - 1) * 1440) <= lastRegular; day++) days++;
  return days + 2;
};

/** An episode's number in the league's run of them, from 0. @param {LiveLeague} live @param {EpisodeSlot} slot */
const episodeNumber = (live, slot) => (slot.season - 1) * perSeason(live) + slot.n;

/**
 * A seeded deck dealt in rounds (the themes, a theme's discussions): round r is a shuffle of `items`, none of its first
 * `gap` among the last round's last `gap` (moved further in), so nothing comes round again within `gap` turns.
 * @param {string[]} items @param {string} key @param {number} r @param {number} [gap]
 */
function dealt(items, key, r, gap = 1) {
  const deck = createRng(`podcast|${key}|${r}`).shuffle(items);
  if (r === 0 || items.length <= 2 * gap) return deck;
  const tail = createRng(`podcast|${key}|${r - 1}`).shuffle(items).slice(-gap);
  for (let i = 0; i < gap; i++) {
    if (!tail.includes(deck[i])) continue;
    const j = deck.findIndex((x, k) => k >= gap && k < deck.length - gap && !tail.includes(x));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * An episode's themes and their discussions, settings.podcast.discussions of them: the episode's turns in the league's
 * run of discussions pick the themes from the themes' deck (each once in every run of as many turns as there are
 * themes), and each theme's turn (how many runs before this one) its discussion from the theme's own deck. A discussion
 * that needs a poll (it says there are polls) is left out of its theme's deck until the first poll has opened.
 * @param {LiveLeague} live @param {EpisodeSlot} slot
 * @returns {{ theme: string, discussion: string }[]}
 */
export function themesOf(live, slot) {
  const themes = live.config.podcast.themes;
  const ids = Object.keys(themes).filter((k) => !k.startsWith('_'));
  const per = live.config.settings.podcast.discussions;
  const polled = allPolls(live.config, live.calendar, slot.at).some((p) => p.opensAt <= slot.at);
  return Array.from({ length: per }, (_, j) => {
    const i = episodeNumber(live, slot) * per + j;
    const r = Math.floor(i / ids.length);
    const theme = dealt(ids, `themes|${live.looks}`, r, per - 1 || 1)[i % ids.length];
    const talks = themes[theme].discussions.filter((/** @type {string} */ id) => polled || live.config.podcast.discussions[id].needs !== 'poll');
    return { theme, discussion: dealt(talks, `talks|${live.looks}|${theme}`, Math.floor(r / talks.length))[r % talks.length] };
  });
}

/** THE DAY's topics, in the order they're said. */
const DAY_HOOKS = /** @type {const} */ (['table', 'hotTake', 'money', 'archive', 'kids', 'vote']);

/** "1ST", "2ND". @param {number} n */
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
/** A goal difference as the table writes it: +3, 0, −2. @param {number} gd */
const signed = (gd) => (gd > 0 ? `+${gd}` : `${gd}`);

/**
 * The match the two pick a winner of, made at `at`: the biggest (the two sides' points together, the earlier on a tie)
 * kicking off in the regular season within settings.podcast.pickHours after it; and their picks. Samir takes the side
 * higher in the table (a seeded draw when level on points); Tamsin goes against him about half the time (a seeded draw, likelier when the other side is in better form; Tom, 2026-10-20).
 * Null with none.
 * @param {LiveLeague} live @param {number} at @param {PodcastContext} ctx
 * @returns {Picks | null}
 */
export function picksAt(live, at, ctx) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const season = live.calendar.seasonAt(at);
  const table = tableAt(live, season, at, durationOf);
  const row = (/** @type {string} */ id) => /** @type {import('../sim/standings.js').TableRow} */ (table.find((r) => r.teamId === id));
  const until = at + live.config.settings.podcast.pickHours * HOUR_MS;
  // The fixtures: a match played since (it may have been, by the time a repeat airs) or still in the season's schedule.
  const played = live.matchesIn(season);
  const perRound = Object.keys(live.league.teams).length / 2;
  const next = live.calendar.slots(season).filter((s) => s.stage === 'regular' && s.kickoff > at && s.kickoff <= until).map((s) => {
    const m = played.find((x) => x.slot === s.index);
    const f = m ?? (live.state.season === season ? live.state.schedule[/** @type {number} */ (s.round) - 1].matches[s.index % perRound] : null);
    return f ? { key: `${season}-${s.index}`, kickoff: s.kickoff, homeId: f.homeId, awayId: f.awayId } : null;
  }).filter((f) => f !== null);
  if (!next.length) return null;
  const size = (/** @type {typeof next[number]} */ f) => row(f.homeId).points + row(f.awayId).points;
  const f = next.reduce((best, x) => (size(x) > size(best) ? x : best));
  const [home, away] = [row(f.homeId), row(f.awayId)];
  const rng = createRng(`podcast|picks|${live.looks}|${f.key}`);
  const samir = home.points === away.points ? rng.pick([home, away]) : home.position < away.position ? home : away;
  const wins = (/** @type {typeof home} */ r) => r.form.filter((x) => x === 'W').length;
  const other = samir === home ? away : home;
  const against = Math.min(0.8, Math.max(0.2, 0.5 + 0.15 * (wins(other) - wins(samir))));
  const tamsin = rng.chance(against) ? other : samir;
  return { key: f.key, kickoff: f.kickoff, homeId: home.teamId, awayId: away.teamId, tamsin: tamsin.teamId, samir: samir.teamId };
}

/**
 * A pick's outcome at `t`: true if the picked side won, false if not, null before the match has finished on screen.
 * @param {LiveLeague} live @param {Picks} picks @param {Pundit} who @param {number} t @param {PodcastContext} ctx
 */
function judged(live, picks, who, t, ctx) {
  const [season, slot] = picks.key.split('-').map(Number);
  const m = live.matchesIn(season).find((x) => x.slot === slot);
  if (!m?.summary || !isFinished(m, t, (x) => ctx.timelineOf(x).duration)) return null;
  return winnerOf(m) === picks[who];
}

/**
 * Each one's picks this season, judged by `t`: of the episodes before `slot`, how many each got right of those whose
 * match had finished.
 * @param {LiveLeague} live @param {EpisodeSlot} slot @param {PodcastContext} ctx
 */
function pickRecord(live, slot, ctx) {
  const record = { tamsin: { right: 0, of: 0 }, samir: { right: 0, of: 0 } };
  for (const s of podcastEpisodes(live, slot.season, ctx).filter((x) => x.n < slot.n && x.kind !== 'review')) {
    const p = picksAt(live, s.at, ctx);
    if (!p) continue;
    for (const who of SEATS) {
      const r = judged(live, p, who, slot.at, ctx);
      if (r === null) continue;
      record[who].of++;
      if (r) record[who].right++;
    }
  }
  return record;
}

/**
 * An episode: everything said, in order, each line with its seat, and what the screen needs (the discussion's title
 * and lines, DID YOU SEE THAT?'s goal, the picks).
 * @param {LiveLeague} live @param {EpisodeSlot} slot @param {PodcastContext} ctx
 * @returns {Episode}
 */
export function podcastEpisode(live, slot, ctx) {
  const { config, calendar } = live;
  const { season, at } = slot;
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const teams = live.league.teams;
  const name = (/** @type {string} */ id) => teams[id].shortName;
  const abbr = (/** @type {string} */ id) => teams[id].abbr;
  const pod = config.podcast;
  const { said, say, rng, setTurn } = sayer(pod.lines, `podcast|${live.looks}|${season}|${slot.n}`, teamsForTalk(teams, config.studio.spokenTeam));
  // A series (as the desk's opening): each kind's ways take turns from one episode to the next.
  setTurn(`podcast|${live.looks}`, episodeNumber(live, slot));
  // A new topic (Tom, 2026-10-21: it moved on too quickly): a beat before its first line, unless it opens a talk.
  const beatMs = config.settings.podcast.topicBeatSeconds * 1000;
  let newTopic = false;
  const topic = () => { newTopic = true; };
  /** Say a kind, its seat from who says it. @param {string} kind @param {Record<string, string | number>} [fill] */
  const line = (kind, fill = {}) => {
    const before = said.length;
    say(kind, fill);
    if (said.length > before) {
      const l = /** @type {PodcastSaid} */ (said.at(-1));
      l.who = seatOf(pod.lines[kind].who);
      if (newTopic && said.length > 1) l.beatMs = beatMs;
    }
    newTopic = false;
  };

  const table = tableAt(live, season, at, durationOf);
  const regular = live.matchesIn(season).filter((m) => m.stage === 'regular');
  const played = regular.filter((m) => isFinished(m, at, durationOf));
  const totals = () => Object.values(seasonTotalsAt(live, season, at, durationOf));
  const dayStart = calendar.instant(season, Math.floor((at - calendar.seasonStart(season)) / DAY_MS) * 1440);
  // The hooks, each the lines its fact makes true; false when it has nothing true to say.
  /** @type {Record<string, () => boolean>} */
  const hooks = {
    table() {
      if (!played.length) return false;
      const top = table[0];
      line('tableAsk');
      line('tableTop', { team: name(top.teamId), points: top.points, gd: signed(top.goalDifference) });
      line('tableTopReply', { TEAM: name(top.teamId), form: top.form.join('') });
      // Since the day began: the biggest climb (not the leader) and fall, two places or more.
      const before = tableAt(live, season, dayStart, durationOf);
      const moved = table.map((r) => ({ r, by: /** @type {any} */ (before.find((b) => b.teamId === r.teamId)).position - r.position }));
      const up = moved.filter((x) => x.by >= 2 && x.r.position > 1).sort((a, b) => b.by - a.by || a.r.position - b.r.position)[0];
      if (up) line('tableClimber', { team: name(up.r.teamId), up: up.by, place: ordinal(up.r.position) });
      const down = moved.filter((x) => x.by <= -2).sort((a, b) => a.by - b.by || a.r.position - b.r.position)[0];
      if (down) line('tableFaller', { team: name(down.r.teamId), down: -down.by, place: ordinal(down.r.position) });
      const perRound = Object.keys(teams).length / 2;
      const bottom = /** @type {(typeof table)[number]} */ (table.at(-1));
      if (played.length >= 3 * perRound && bottom.teamId !== down?.r.teamId) line('tableBottom', { team: name(bottom.teamId), place: ordinal(bottom.position), points: bottom.points });
      const left = calendar.regularCount - played.length;
      line(left > calendar.regularCount / 2 ? 'tableGamesMany' : 'tableGamesFew', { left });
      return true;
    },
    hotTake() {
      if (!played.length) return false;
      const n = table.length;
      const count = (/** @type {(typeof table)[number]} */ r, /** @type {string} */ x) => r.form.filter((f) => f === x).length;
      const byGd = [...table].sort((a, b) => b.goalDifference - a.goalDifference || a.position - b.position);
      /** @type {[string, (typeof table)[number]][]} */
      const takes = [];
      const cup = table.slice(0, 2).find((r) => count(r, 'W') >= 3);
      if (cup) takes.push(['hotTakeCup', cup]);
      const trouble = table.slice(n - 2).reverse().find((r) => count(r, 'L') >= 3);
      if (trouble) takes.push(['hotTakeTrouble', trouble]);
      const unlucky = table.filter((r) => r.position - (byGd.indexOf(r) + 1) >= 3).sort((a, b) => b.position - a.position)[0];
      if (unlucky) takes.push(['hotTakeUnlucky', unlucky]);
      if (!takes.length) return false;
      const [kind, r] = rng.pick(takes);
      line(kind, { team: name(r.teamId), form: r.form.join(''), place: ordinal(r.position), gd: signed(r.goalDifference) });
      // The other agrees or not: Samir always backs a hot take the table already shows (the leader, the bottom side).
      if (pod.lines[kind].who === 'tamsin') {
        const backed = (kind === 'hotTakeCup' && r.position === 1) || (kind === 'hotTakeTrouble' && r.position === n);
        line(backed || rng.chance(0.5) ? 'agreeSamir' : 'disagreeSamir');
      } else line(rng.chance(0.5) ? 'agreeTamsin' : 'disagreeTamsin');
      return true;
    },
    money() {
      const cap = seasonConfig(config, season).rules.finances.cap;
      const rolls = payrolls(live.chronicle, Object.keys(teams)).map((r) => ({ id: r.teamId, payroll: r.payroll }));
      line('moneyAsk');
      const top = rolls[0];
      const room = /** @type {(typeof rolls)[number]} */ (rolls.at(-1));
      if (top.payroll >= 0.95 * cap) line('moneyCap', { team: name(top.id), payroll: guilders(top.payroll), cap: guilders(cap) });
      else line('moneyRoom', { team: name(room.id), payroll: guilders(room.payroll), cap: guilders(cap) });
      // A bargain: a top-five scorer on a wage in the league's bottom half.
      const wages = [...live.chronicle.players.values()].filter((p) => p.status === 'roster' && p.contract).map((p) => p.contract.wage).sort((a, b) => a - b);
      const middle = wages[Math.floor(wages.length / 2)] ?? 0;
      const bargain = totals().filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || a.playerId.localeCompare(b.playerId)).slice(0, 5)
        .map((p) => ({ p, wage: live.chronicle.players.get(p.playerId)?.contract?.wage }))
        .find((x) => x.wage !== undefined && x.wage < middle);
      if (bargain) line('moneyBargain', { team: name(bargain.p.teamId), player: ctx.playerName(bargain.p.playerId).toUpperCase(), goals: bargain.p.goals, wage: guilders(/** @type {number} */ (bargain.wage)) });
      line('moneyReply');
      return true;
    },
    archive() {
      // FROM THE ARCHIVES, from season 2: the most Cups (two or more), the longest wait since one (three seasons or
      // more), or a side that has never won it.
      if (season < 2) return false;
      const cups = Object.keys(teams).map((id) => ({ id, won: (live.chronicle.teams.get(id)?.cups ?? []).filter((s) => s < season) }));
      /** @type {[string, Record<string, string | number>][]} */
      const options = [];
      const most = Math.max(...cups.map((c) => c.won.length));
      const leaders = cups.filter((c) => c.won.length === most);
      if (most >= 2 && leaders.length === 1) options.push(['archiveDynasty', { team: name(leaders[0].id), cups: most }]);
      const waits = cups.filter((c) => c.won.length).map((c) => ({ id: c.id, last: Math.max(...c.won) })).sort((a, b) => a.last - b.last);
      if (waits.length && season - 1 - waits[0].last >= 3) options.push(['archiveDrought', { team: name(waits[0].id), last: waits[0].last }]);
      const never = cups.filter((c) => !c.won.length);
      if (never.length) options.push(['archiveNever', { team: name(rng.pick(never).id) }]);
      if (!options.length) return false;
      line('archiveAsk');
      line(...rng.pick(options));
      line('archiveReply');
      return true;
    },
    kids() {
      // THE KIDS, from season 2: the best rookie so far, as the Spark is given.
      if (season < 2 || !played.length) return false;
      const spark = seasonConfig(config, season).rules.awards.list.find((/** @type {any} */ a) => a.stat === 'rookieBlend');
      const all = seasonAwards(seasonTotalsAt(live, season, at, durationOf), live.league.players, { list: spark ? [spark] : [] }, createRng(`podcast|kids|${live.looks}|${season}|${slot.n}`), season);
      const best = all[0];
      if (!best?.line) return false;
      const l = best.line;
      const stat = l.position === 'K' ? `${l.saves} SAVES` : l.position === 'S' ? `${l.goals} GOALS` : l.position === 'M' ? `${l.assists} ASSISTS` : `${l.stops} STOPS`;
      line('kidsAsk');
      line('kidsRookie', { team: name(best.teamId), player: ctx.playerName(best.playerId).toUpperCase(), position: POSITION_NAME[l.position] ?? l.position, stat });
      line('kidsReply');
      return true;
    },
    vote() {
      const poll = pollsAt(config, calendar, at).current;
      if (!poll || poll.status !== 'open') return false;
      line('voteOpen', { question: poll.question });
      line('voteReply');
      return true;
    },
  };

  /** @type {Picks | null} */
  let picks = null;
  /** PICKS: the match, each owning up to their last pick, then this one's. */
  const picksSection = () => {
    picks = picksAt(live, at, ctx);
    if (!picks) return false;
    topic();
    line('picksAsk', { home: abbr(picks.homeId), away: abbr(picks.awayId), when: ctx.formatTime(picks.kickoff) });
    const last = podcastEpisodes(live, season, ctx).filter((s) => s.n < slot.n && s.kind !== 'review').at(-1);
    const lastPicks = last ? picksAt(live, last.at, ctx) : null;
    if (lastPicks) {
      const record = pickRecord(live, slot, ctx);
      for (const who of SEATS) {
        const right = judged(live, lastPicks, who, at, ctx);
        if (right === null) continue;
        const r = record[who];
        const suffix = who === 'tamsin' ? 'Tamsin' : 'Samir';
        line(`${right ? 'pickRight' : 'pickWrong'}${suffix}`, { record: `${r.right} OF ${r.of} THIS SEASON` });
      }
    }
    line('pickTamsin', { team: name(picks.tamsin), TEAM: name(picks.tamsin) });
    line('pickSamir', { team: name(picks.samir), TEAM: name(picks.samir) });
    return true;
  };

  // The first talk: the opening.
  // SEASON AHEAD is made in the evening of day 1, with matches played, so Samir answers as on any day (Tom, 2026-10-20:
  // openAheadReply's "Clean slate" and "Everyone starts on zero" came too late; voiced, kept unused).
  const open = slot.kind === 'ahead' ? ['openAhead', 'openReply'] : slot.kind === 'review' ? ['openReview', 'openReviewReply'] : ['open', 'openReply'];
  for (const k of open) line(k, { season });

  // SEASON AHEAD's and REVIEW's lead, then THE DAY: every hook with something true to say (not on the night after the
  // final, the season over).
  /** @type {string[]} */
  const saidHooks = [];
  if (slot.kind === 'ahead') {
    const last = live.chronicle.seasons.get(season - 1);
    if (last?.championId) {
      saidHooks.push('ahead');
      line('aheadChampions', { team: name(last.championId), last: season - 1 });
      line('aheadChampionsReply');
      const four = last.table.slice(0, 4).map((r) => r.teamId);
      if (four.length) {
        const pick = createRng(`podcast|cupPick|${live.looks}|${season}`).pick(four);
        line('aheadPick', { team: name(pick), TEAM: name(pick) });
        line('aheadPickReply');
      }
    }
  } else if (slot.kind === 'review') {
    const final = live.matchesIn(season).find((m) => m.stage === 'final');
    const champion = final?.summary ? winnerOf(final) : null;
    if (champion) {
      saidHooks.push('review');
      line('reviewChampions', { team: name(champion), season });
      line('reviewChampionsReply');
      if (table[0] && table[0].teamId !== champion) line('reviewPennant', { team: name(table[0].teamId), points: table[0].points });
      const r = pickRecord(live, slot, ctx);
      if (r.tamsin.of && r.tamsin.right !== r.samir.right) line('reviewPicks', { tamsin: `${r.tamsin.right} OF ${r.tamsin.of}`, samir: `${r.samir.right} OF ${r.samir.of}` });
    }
  }
  if (slot.kind !== 'review') {
    for (const hook of DAY_HOOKS) {
      topic();
      if (hooks[hook]()) saidHooks.push(hook);
    }
  }

  // The discussions: each its lines as written, each its own clip (<discussion>-<line>), its title under its first;
  // the second and third brought in by whoever opens them.
  /** @type {PodcastSaid[][]} */
  const parts = [];
  /** @type {Episode['discussions']} */
  const discussions = [];
  /** @param {{ theme: string, discussion: string }} d @param {boolean} bridged */
  const discuss = (d, bridged) => {
    const talk = pod.discussions[d.discussion];
    const opener = /** @type {Pundit} */ (talk.lines[0].who);
    topic();
    if (bridged) line(opener === 'tamsin' ? 'talkIntoTamsin' : 'talkIntoSamir');
    const first = said.length;
    talk.lines.forEach((/** @type {{ who: Pundit, gesture: string, say: string }} */ l, /** @type {number} */ i) => {
      said.push(/** @type {PodcastSaid} */ ({ who: seatOf(l.who), text: l.say, show: i === 0 ? talk.title : null, clip: { kind: d.discussion, way: i, team: null }, gesture: /** @type {any} */ (l.gesture), ...(i === 0 && !bridged && said.length > 0 ? { beatMs } : {}) }));
    });
    discussions.push({ id: d.discussion, title: talk.title, theme: d.theme, part: parts.length, first, last: said.length - 1 });
  };
  const [d1, ...rest] = themesOf(live, slot);
  discuss(d1, false);

  // The day's goals: the day's matches finished by now (the night after the final: the semifinals' and the final's),
  // if two goals or more.
  const today = live.matchesIn(season).filter((m) => m.kickoff >= dayStart && isFinished(m, at, durationOf));
  const goals = today.reduce((n, m) => n + m.summary.result.homeGoals + m.summary.result.awayGoals, 0) >= 2 ? today.map((m) => m.id) : [];
  topic();
  if (goals.length) line('reelAsk');
  parts.push(said.splice(0));

  // The second talk: after the goals, the call for the break.
  if (goals.length) line('reelEnd');
  line('breakInto');
  parts.push(said.splice(0));

  // The third: back, the other discussions, PICKS (not on the night after the final), the close.
  line('breakBack');
  for (const d of rest) discuss(d, true);
  if (slot.kind !== 'review') picksSection();
  const close = slot.kind === 'ahead' ? 'closeAhead' : slot.kind === 'review' ? 'closeReview' : 'close';
  topic();
  line('closeAsk');
  line(close);
  parts.push(said.splice(0));

  // Interjections: now and then the listener's, under the other's longer lines, dealt so none repeats until all have.
  const { interjectionChars, interjectionShare } = config.settings.podcast;
  const under = createRng(`podcast|under|${live.looks}|${season}|${slot.n}`);
  /** @type {Record<string, number[]>} */
  const decks = {};
  for (const l of /** @type {PodcastSaid[]} */ (parts.flat())) {
    if (l.text.length < interjectionChars || !under.chance(interjectionShare)) continue;
    const listener = /** @type {0 | 1} */ (1 - l.who);
    const who = SEATS[listener];
    if (!decks[who]?.length) decks[who] = under.shuffle(pod.interjections[who].map((/** @type {string} */ _, /** @type {number} */ i) => i));
    const way = /** @type {number} */ (decks[who].pop());
    l.under = { who: listener, text: pod.interjections[who][way], clip: { kind: 'interjection', way, team: null } };
  }

  return { kind: slot.kind, season, at, hooks: saidHooks, discussions, goals, picks, parts };
}

/**
 * The pair's reactions to the day's goals, one a clip of the reel (`n`), taking turns (who starts seeded by the
 * episode), each one's ways dealt so none repeats until the rest have had a turn: voiced lines, never naming a scorer.
 * @param {LiveLeague} live @param {EpisodeSlot} slot @param {number} n
 * @returns {PodcastSaid[]}
 */
export function reelReactions(live, slot, n) {
  const { config } = live;
  const { said, say, rng } = sayer(config.podcast.lines, `podcast|reel|${live.looks}|${slot.season}|${slot.n}`, teamsForTalk(live.league.teams, config.studio.spokenTeam));
  const first = rng.chance(0.5) ? 0 : 1;
  for (let k = 0; k < n; k++) {
    const who = /** @type {0 | 1} */ ((first + k) % 2);
    say(who === 0 ? 'reelReactTamsin' : 'reelReactSamir');
    /** @type {PodcastSaid} */ (said.at(-1)).who = who;
  }
  return /** @type {PodcastSaid[]} */ (said);
}
