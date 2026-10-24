// Commentary (Tasks 123–125, 130): short exclamations at a match's key moments ("GOAL!", "WHAT A SAVE!"), spoken by one
// commentator per match from clips made ahead of time (data/commentary.json, assets/voices/). Pure and DOM-free: a
// function of the match, so a re-air sounds exactly like the live match. audio.js plays the clips; main.js only asks
// for them in live matches and re-airs, never highlights. Passes in a row (Task 130) are counted as the picture draws
// them, frame by frame (passCall), since working them out for a whole match at once takes too long. See
// docs/channel.md §18.2 and §18.5.
import { createRng } from '../sim/rng.js';
import { missNearPost } from './motion.js';

/**
 * @typedef {{ id: string, name: string, engine: 'kokoro' | 'elevenlabs', voice: string, speed: number, onAir: boolean }} Commentator
 * @typedef {{ commentators: Commentator[], playoffs: string, lines: { id: string, text: string, say: string, voices?: string[], warm?: boolean }[],
 *   moments: Record<Moment, { chance: number, rate?: number, onAir?: boolean, lines: string[] }>,
 *   names?: { onAir: boolean, voices: string[], share: number, lines: NameLine[] } }} CommentaryData  data/commentary.json
 *   rate: the share of a moment that's called at all, on its own or not (Task 149: the frequent ones, so the commentary
 *   isn't constant); chance: the share called in a cluster of moments.
 * @typedef {{ id: string, season: number, stage: 'regular' | 'semifinal' | 'final', round: number | null, slot: number }} MatchSlot
 *   What commentatorFor needs to know about a match (a LiveMatch has it all).
 * @typedef {{ finalRound: number | null, perRound: number }} RoundShape  The simultaneous final round's number (null if
 *   it isn't simultaneous), and matches a round.
 * @typedef {'goal' | 'scorcher' | 'save' | 'block' | 'post' | 'wide' | 'burn' | 'breakaway' | 'kickoff' | 'second_half'
 *   | 'half_time' | 'half_time_level' | 'full_time' | 'full_time_level' | 'passing' | 'tackle' | 'steal' | 'holding' | 'foul'
 *   | 'full_time_semi' | 'full_time_final' | 'golden_goal' | 'overtime'} Moment
 * @typedef {{ id: string, say?: string, of?: string, then?: string, moments: ('goal' | 'scorcher' | 'save')[] }} NameLine  A line naming
 *   the scorer or the keeper making a save (Task 247b): its own clips per surname (say), or another line's (of), followed with no gap by one of the
 *   commentator's own lines (then).
 * @typedef {{ at: number, moment: Moment, line: string, url: string, seed: string, level: number | null, follow: boolean, then?: string }} Call
 *   then: a second clip, played straight after the first with no gap (Task 247b: "Bonnefoy! What a scorcher!").
 *   at: ms since kick-off, when the voice starts. level: its own loudness (goals, over the cheering), or null for the
 *   commentary level. follow: the second half of a breakaway's one-two (the shot's outcome).
 * @typedef {{ matchId: string, commentatorId: string, data: CommentaryData, settings: CommentarySettings, said?: Call[] }} DynamicOptions
 *   passCall's and holdCall's. said: the pass and holding calls said so far in this viewing, shared by the two so they
 *   keep their distance from each other too (Task 179); empty it after a jump (main.js).
 * @typedef {{ delayMs: number, afterWhistleMs: number, minGapSeconds: number, followGapSeconds: number, passRun: number,
 *   goalLevels: { home: number, away: number }, turnoverGapSeconds: number, holdSeconds: number }} CommentarySettings
 */

/** Where a commentator's clip for a line lives. @param {string} commentatorId @param {string} lineId */
export const clipUrl = (commentatorId, lineId) => `assets/voices/${commentatorId}/${lineId}.mp3`;

/**
 * A line naming the scorer, as said by a commentator (Task 247b): its own clip per surname, or the clip of the line it
 * borrows (of). @param {string} commentatorId @param {NameLine} line @param {string} surname
 */
export const nameClipUrl = (commentatorId, line, surname) => `assets/voices/${commentatorId}/names/${line.of ?? line.id}-${surname.toLowerCase()}.mp3`;

/**
 * Whether a moment is called (Task 149): every moment unless it's marked onAir false (its clips aren't made yet).
 * @param {CommentaryData} data @param {Moment} moment
 */
export const momentOnAir = (data, moment) => data.moments[moment]?.onAir !== false;

/**
 * The lines a commentator speaks (Task 149): those of moments on air (or, with `all`, every moment), less any line
 * meant only for other voices (the playoffs' lines are the Announcer's).
 * @param {CommentaryData} data @param {string} commentatorId @param {{ all?: boolean }} [o]
 * @returns {CommentaryData['lines']}
 */
export function linesFor(data, commentatorId, { all = false } = {}) {
  const wanted = new Set(Object.entries(data.moments).filter(([m]) => all || momentOnAir(data, /** @type {Moment} */ (m))).flatMap(([, m]) => m.lines));
  return data.lines.filter((l) => wanted.has(l.id) && (!l.voices || l.voices.includes(commentatorId)) && (all || l.onAir !== false));
}

/**
 * A moment's lines that are on air (Task 257: a line whose clips aren't made yet is left out).
 * @param {CommentaryData} data @param {Moment} moment @returns {string[]}
 */
export function dealt(data, moment) {
  const off = new Set(data.lines.filter((l) => l.onAir === false).map((l) => l.id));
  return data.moments[moment].lines.filter((id) => !off.has(id));
}

/**
 * This match's commentator, the same on every screen and in the re-air (Tom, 2026-10-06):
 *   - the semifinals and the final: always `playoffs` (the Announcer);
 *   - the final round's simultaneous matches: each a different one, in an order the seed shuffles once a season;
 *   - otherwise picked by the seed from those on air.
 * @param {MatchSlot} m @param {CommentaryData} data @param {RoundShape} shape
 * @returns {Commentator}
 */
export function commentatorFor(m, data, shape) {
  const onAir = data.commentators.filter((c) => c.onAir);
  if (m.stage !== 'regular') return onAir.find((c) => c.id === data.playoffs) ?? onAir[0];
  if (m.round !== null && m.round === shape.finalRound) {
    const order = createRng(`commentary|final-round|${m.season}`).shuffle(onAir);
    return order[(m.slot % shape.perRound) % order.length];
  }
  return createRng(`commentary|who|${m.id}`).pick(onAir);
}

/**
 * The season's shape for commentatorFor, from the config.
 * @param {import('../config.js').Config} config @returns {RoundShape}
 */
export function roundShape(config) {
  const teams = config.teams.teams.length;
  return { finalRound: config.settings.calendar.finalRoundSimultaneous ? (teams - 1) * 2 : null, perRound: teams / 2 };
}

/** The whistles' moments, called after the whistle rather than straight away (Task 130). */
const WHISTLE_MOMENTS = new Set(['kickoff', 'second_half', 'half_time', 'half_time_level', 'full_time', 'full_time_level', 'full_time_semi', 'full_time_final', 'overtime']);
/** Until a moment is on air (Task 149), the one called in its place, if any. */
const STAND_IN = /** @type {Partial<Record<Moment, Moment>>} */ ({ full_time_semi: 'full_time', full_time_final: 'full_time', golden_goal: 'goal' });
/** A ball won: one within turnoverGapSeconds of the last isn't called (Tom, Task 149). */
const TURNOVERS = new Set(['tackle', 'steal']);

/**
 * The moment an event is, for commentary, or null.
 * @param {import('../chronicle/eventLog.js').LeagueEvent} e @param {string} matchId @param {number} shotSeq  The last shot's seq.
 * @param {{ kickoffs: number, level: boolean, golden: boolean, stage: 'regular' | 'semifinal' | 'final' }} so  Kick-offs
 *   before this one; whether the score is level now; whether this is the golden goal; the match's stage.
 * @returns {Moment | null}
 */
function momentOf(e, matchId, shotSeq, so) {
  const data = /** @type {any} */ (e.data) ?? {};
  switch (e.type) {
    // The match's first kick-off, the second half's, then golden-goal overtime's (Task 149).
    case 'kickoff': return so.kickoffs === 0 ? 'kickoff' : so.kickoffs === 1 ? 'second_half' : so.kickoffs === 2 ? 'overtime' : null;
    case 'half_time': return so.level ? 'half_time_level' : 'half_time';
    // Level at the end only without a shootout (a shootout always has a winner). The playoffs have their own (Task 149).
    case 'match_result':
      if (data.homeGoals === data.awayGoals && !data.shootout) return 'full_time_level';
      return so.stage === 'semifinal' ? 'full_time_semi' : so.stage === 'final' ? 'full_time_final' : 'full_time';
    case 'goal': return so.golden ? 'golden_goal' : data.scorcher ? 'scorcher' : 'goal';
    // A ball won (Task 149): a pass cut out, or off the player on it.
    case 'possession_change': return data.reason === 'tackle' ? (data.steal ? 'steal' : 'tackle') : null;
    case 'foul': return 'foul';
    case 'save': return 'save';
    case 'block': return 'block';
    // A miss the motion sends off a post rings it (sounds.js); the rest go wide.
    case 'miss': return missNearPost(matchId, shotSeq) ? 'post' : 'wide';
    case 'burn': return 'burn';
    case 'advance': return data.breakaway ? 'breakaway' : null;
    default: return null;
  }
}

/**
 * Every call in a match, in time order (Tom, Task 124):
 *   - a moment on its own (no other moment within `minGapSeconds` either side) is always called;
 *   - in a cluster, each is called with its moment's chance;
 *   - calls stay at least `minGapSeconds` apart, except a goal, which always comes and drops a call just before it
 *     so the two never step on each other;
 *   - a breakaway's one-two (Tom, Task 125): when the player who broke away shoots, the outcome (goal, save, post,
 *     wide) is always called, `followGapSeconds` or more after the call before it, which it never drops;
 *   - goals are louder than the rest, to be heard over the cheering (`goalLevels`, home and away);
 *   - each moment deals its lines in a seeded shuffle, so none repeats until the rest have had a turn.
 * A call comes `delayMs` after its moment.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ matchId: string, homeId: string, commentatorId: string, data: CommentaryData, settings: CommentarySettings, stage?: 'regular' | 'semifinal' | 'final', surnameOf?: (playerId: string) => string | undefined }} o
 *   commentatorId: from commentatorFor. stage: the match's (the playoffs' full times, Task 149). surnameOf: a player's
 *   surname, for the calls that name the scorer (Task 247b; data.names, when on air and this commentator says names).
 * @returns {Call[]}
 */
export function commentaryCalls(timeline, { matchId, homeId, commentatorId, data, settings, stage = 'regular', surnameOf }) {
  const gap = settings.minGapSeconds * 1000;
  const followGap = settings.followGapSeconds * 1000;
  /** @type {{ at: number, seq: number, moment: Moment, follow: boolean, home: boolean, namedId: string | null }[]} */
  const moments = [];
  let shotSeq = -1;
  let breakawayShot = false;
  let kickoffs = 0;
  let lastTurnover = -Infinity;
  const turnoverGap = settings.turnoverGapSeconds * 1000;
  const goals = { home: 0, away: 0 };
  for (const { event: e, at } of timeline.events) {
    if (e.type === 'shot') {
      shotSeq = e.seq;
      breakawayShot = Boolean(/** @type {any} */ (e.data)?.breakaway);
    }
    if (e.type === 'goal') goals[e.teamId === homeId ? 'home' : 'away']++;
    const found = momentOf(e, matchId, shotSeq, { kickoffs, level: goals.home === goals.away, golden: at === timeline.goldenAt, stage });
    if (e.type === 'kickoff') kickoffs++;
    // Off air (no clips yet): its stand-in, or nothing (Task 149). A golden scorcher stands in as a scorcher.
    let moment = found;
    if (moment && !momentOnAir(data, moment)) moment = moment === 'golden_goal' && /** @type {any} */ (e.data)?.scorcher ? 'scorcher' : STAND_IN[moment] ?? null;
    // A ball won soon after the last one isn't called (each still counts as the last).
    if (moment && TURNOVERS.has(moment)) {
      const near = at - lastTurnover < turnoverGap;
      lastTurnover = at;
      if (near) moment = null;
    }
    // Only a share of the frequent moments is called at all (their own seeded roll, so the rest are dealt as before).
    if (moment && (data.moments[moment].rate ?? 1) < 1 && createRng(`commentary|rate|${matchId}|${e.seq}`).next() >= /** @type {number} */ (data.moments[moment].rate)) moment = null;
    const outcome = e.type === 'goal' || e.type === 'save' || e.type === 'block' || e.type === 'miss';
    if (moment) moments.push({ at, seq: e.seq, moment, follow: outcome && breakawayShot, home: e.teamId === homeId, namedId: e.type === 'goal' || e.type === 'save' ? e.playerId : null });
    if (outcome) breakawayShot = false;
  }
  /** @type {Partial<Record<Moment, string[]>>} Each moment's lines still to deal before the shuffle starts again. */
  const decks = {};
  /** @type {Partial<Record<Moment, string>>} */
  const lastLine = {};
  /** @param {Moment} moment @param {import('../sim/rng.js').Rng} rng */
  const deal = (moment, rng) => {
    let deck = decks[moment];
    if (!deck?.length) {
      deck = rng.shuffle(dealt(data, moment));
      // A fresh shuffle never starts with the line just said.
      if (deck.length > 1 && deck.at(-1) === lastLine[moment]) deck.unshift(/** @type {string} */ (deck.pop()));
      decks[moment] = deck;
    }
    let line = /** @type {string} */ (deck.pop());
    // Never the line of the call just before (Tom: a tackle then a steal could say the same line twice running, the
    // two moments sharing lines): the next on the deck instead, this one back at the bottom.
    const avoid = calls.at(-1)?.line;
    if (line === avoid && dealt(data, moment).length > 1) {
      if (!deck.length) {
        // The round's last card: a fresh round, every line in it, starting with neither this one nor the moment's last.
        decks[moment] = deck = rng.shuffle(dealt(data, moment));
        for (let k = 0; k < deck.length && (deck.at(-1) === avoid || deck.at(-1) === lastLine[moment]); k++) deck.unshift(/** @type {string} */ (deck.pop()));
        line = /** @type {string} */ (deck.pop());
      } else {
        // The nearest card that's neither (the moment's own last line can be next at a round's start).
        let at = deck.length - 1;
        while (at > 0 && deck[at] === lastLine[moment]) at--;
        deck.unshift(line);
        line = deck.splice(at + 1, 1)[0];
      }
    }
    lastLine[moment] = line;
    return line;
  };
  const isBig = (/** @type {Moment} */ m) => m === 'goal' || m === 'scorcher' || m === 'golden_goal';
  /** @type {Call[]} */
  const calls = [];
  // Calls naming the scorer (Task 247b): on air, by this commentator, with surnames to say.
  const names = data.names?.onAir && data.names.voices.includes(commentatorId) && surnameOf ? data.names : null;
  moments.forEach(({ at, seq, moment, follow, home, namedId }, i) => {
    const rng = createRng(`commentary|${matchId}|${seq}`);
    const crowded = (moments[i - 1] && at - moments[i - 1].at < gap) || (moments[i + 1] && moments[i + 1].at - at < gap);
    if (!follow && crowded && rng.next() >= data.moments[moment].chance) return;
    let callAt = at + (WHISTLE_MOMENTS.has(moment) ? settings.afterWhistleMs : settings.delayMs);
    const prev = calls.at(-1);
    // Always called (a one-two, a whistle, or a moment on its own after a delayed call): never dropped, only moved on
    // a little.
    if ((follow || !crowded || WHISTLE_MOMENTS.has(moment)) && prev) callAt = Math.max(callAt, prev.at + followGap);
    else if (prev && callAt - prev.at < gap) {
      if (!isBig(moment) || isBig(prev.moment)) return;
      // The dropped call's line goes back on its deck: it was never heard (a call naming the scorer has no deck).
      calls.pop();
      if (data.moments[prev.moment].lines.includes(prev.line)) decks[prev.moment]?.push(prev.line);
    }
    const level = isBig(moment) ? (home ? settings.goalLevels.home : settings.goalLevels.away) : null;
    // The scorer (or on a save the keeper, Tom) named, names.share of the time: a roll of its own, so the other calls are dealt as before.
    const surname = names && namedId ? surnameOf?.(namedId) : undefined;
    const naming = names && surname ? names.lines.filter((l) => l.moments.includes(/** @type {any} */ (moment))) : [];
    const nameRng = createRng(`commentary|name|${matchId}|${seq}`);
    if (naming.length && surname && nameRng.next() < /** @type {any} */ (names).share) {
      const named = nameRng.pick(naming);
      const then = named.then ? clipUrl(commentatorId, named.then) : undefined;
      calls.push({ at: callAt, moment, line: named.id, url: nameClipUrl(commentatorId, named, surname), seed: `${matchId}|${seq}`, level, follow, ...(then ? { then } : {}) });
      return;
    }
    const line = deal(moment, rng);
    calls.push({ at: callAt, moment, line, url: clipUrl(commentatorId, line), seed: `${matchId}|${seq}`, level, follow });
  });
  return calls;
}

/**
 * The match's breaks in play for passes in a row, in time order: anything that ends one team's run of passes
 * (a change of possession, a shot, a foul, a burn, a stoppage).
 * @param {import('./timeline.js').Timeline} timeline
 */
export function passBreaks(timeline) {
  const ends = new Set(['possession_change', 'shot', 'goal', 'burn', 'foul', 'half_time', 'kickoff', 'substitution', 'full_time', 'match_result']);
  return timeline.events.filter(({ event: e }) => ends.has(e.type)).map(({ at }) => at);
}

/**
 * Passes in a row (Task 130), counted as the picture draws them: call with each pass (a kick, sounds.js) as it
 * happens, in order. When one team's run reaches `passRun` passes, a call comes, unless another call (the match's,
 * or a pass or holding call already said) is within `minGapSeconds` either side. After a jump (passJump), counting
 * waits for the next break, so a run already under way isn't called.
 * @param {ReturnType<typeof passState>} state  Per match: start it with passState().
 * @param {number} kickAt  ms since kick-off. @param {number[]} breaks  From passBreaks. @param {Call[]} calls  The match's.
 * @param {DynamicOptions} o
 * @returns {Call | null}
 */
export function passCall(state, kickAt, breaks, calls, { matchId, commentatorId, data, settings, said = [] }) {
  // Back in time (a re-air from the start, a jump back): start counting afresh.
  if (kickAt < state.lastKick) Object.assign(state, passState());
  // A run only counts once a break has been seen between two passes, so it's watched from its start.
  const seen = state.lastKick > -Infinity;
  state.lastKick = kickAt;
  while (state.breakIndex < breaks.length && breaks[state.breakIndex] <= kickAt) {
    state.breakIndex++;
    state.run = 0;
    if (seen) state.partial = false;
  }
  state.run++;
  if (state.partial || state.run !== settings.passRun) return null;
  const at = kickAt + settings.delayMs;
  if (crowded(at, calls, said, settings)) return null;
  const rng = createRng(`commentary|pass|${matchId}|${kickAt}`);
  if (!state.deck.length) {
    state.deck = rng.shuffle(dealt(data, 'passing'));
    if (state.deck.length > 1 && state.deck.at(-1) === state.last) state.deck.unshift(/** @type {string} */ (state.deck.pop()));
  }
  const line = /** @type {string} */ (state.deck.pop());
  state.last = line;
  return saying(said, { at, moment: 'passing', line, url: clipUrl(commentatorId, line), seed: `${matchId}|pass|${kickAt}`, level: null, follow: false });
}

/**
 * Holding the ball (Task 149), counted as the picture draws it: call each frame with who the picture has on the ball
 * (null while it travels or is loose). When one outfield player has had it holdSeconds without a pass, one call comes,
 * unless another call (the match's, or a pass or holding call already said) is within minGapSeconds either side. Not
 * while play is stopped (Task 179: a substitution, a foul, a free shot, a goal): that ends the spell, and the count
 * starts again at the restart. After a jump (holdJump), the spell under way isn't counted. A line marked warm ("That ball's
 * getting warm.") only once the heat meter is Warm or Hot (Tom, 2026-10-18); while it's cool, the next line in the deck.
 * @param {ReturnType<typeof holdState>} state  Per match. @param {number} at  ms since kick-off.
 * @param {string | null} holderId @param {{ keeper: boolean, stopped: boolean }} now  The holder is a keeper (never
 *   called); play is stopped (the timeline's pause). warm: the heat meter is Warm or Hot.
 * @param {Call[]} calls  The match's. @param {DynamicOptions} o
 * @returns {Call | null}
 */
export function holdCall(state, at, holderId, { keeper, stopped, warm = false }, calls, { matchId, commentatorId, data, settings, said = [] }) {
  if (at < state.lastAt) Object.assign(state, holdState());
  state.lastAt = at;
  if (stopped) holderId = null;
  // A new spell on the ball: counted only if the one before it was seen (not straight after a jump or a start).
  if (holderId !== state.holder) Object.assign(state, { holder: holderId, since: at, called: false, partial: state.holder === UNSEEN });
  if (!holderId || keeper || state.called || state.partial || !momentOnAir(data, 'holding') || at - state.since < settings.holdSeconds * 1000) return null;
  state.called = true;
  if (createRng(`commentary|hold-rate|${matchId}|${state.since}`).next() >= (data.moments.holding.rate ?? 1)) return null;
  const callAt = at + settings.delayMs;
  if (crowded(callAt, calls, said, settings)) return null;
  const rng = createRng(`commentary|hold|${matchId}|${state.since}`);
  const hot = new Set(data.lines.filter((l) => l.warm).map((l) => l.id));
  const fits = (/** @type {string} */ id) => warm || !hot.has(id);
  if (!state.deck.some(fits)) {
    // A fresh deal (what's left of the old one, only lines for warmer heat, goes back in it).
    state.deck = rng.shuffle(dealt(data, 'holding'));
    if (state.deck.length > 1 && state.deck.at(-1) === state.last) state.deck.unshift(/** @type {string} */ (state.deck.pop()));
  }
  const i = state.deck.findLastIndex(fits);
  if (i < 0) return null;
  const [line] = state.deck.splice(i, 1);
  state.last = line;
  return saying(said, { at: callAt, moment: 'holding', line, url: clipUrl(commentatorId, line), seed: `${matchId}|hold|${state.since}`, level: null, follow: false });
}

/**
 * Whether a pass or holding call at `at` would come within minGapSeconds of another: one of the match's calls, or a
 * pass or holding call already said (Task 179: the two used to be counted apart, so one could start on top of the other).
 * @param {number} at @param {Call[]} calls @param {Call[]} said @param {CommentarySettings} settings
 */
function crowded(at, calls, said, settings) {
  const gap = settings.minGapSeconds * 1000;
  const near = (/** @type {Call} */ c) => Math.abs(c.at - at) < gap;
  return calls.some(near) || said.some(near);
}

/** Note a pass or holding call as said, and return it. @param {Call[]} said @param {Call} call */
function saying(said, call) {
  said.push(call);
  if (said.length > 8) said.shift(); // only the last few can be near the next
  return call;
}

/** Who's on the ball before anyone's been seen (a start, a jump). */
const UNSEEN = '(unseen)';

/** A fresh count for holdCall. */
export const holdState = () => ({ holder: /** @type {string | null} */ (UNSEEN), since: 0, lastAt: -Infinity, called: false, partial: true, deck: /** @type {string[]} */ ([]), last: /** @type {string | null} */ (null) });

/** The picture jumped: the spell on the ball under way isn't counted. @param {ReturnType<typeof holdState>} state */
export function holdJump(state) {
  state.partial = true;
  state.holder = UNSEEN;
}

/** A fresh count for passCall. partial: the run under way wasn't seen from its start (until a break is seen). */
export const passState = () => ({ breakIndex: 0, run: 0, lastKick: -Infinity, partial: true, deck: /** @type {string[]} */ ([]), last: /** @type {string | null} */ (null) });

/** The picture jumped (loading mid-match, a jump, sound turned on): wait for the next break before counting. @param {ReturnType<typeof passState>} state */
export function passJump(state) {
  state.partial = true;
}
