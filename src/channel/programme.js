// The programme: which segment is on screen at a moment. Pure and DOM-free. See docs/channel.md §7, §7a and §16.
//
// Each live match has a slot around it:
//   pre_match  segments.preMatchMinutes, ending walkOutMinutes before kick-off: both teams and their line-ups
//   walk_out   segments.walkOutMinutes before kick-off: the teams on the pitch
//   live       a match in progress; when several are (the final round), the one with the biggest table stakes
//   handshakes segments.handshakeMinutes after the final whistle (shorter without a home win: no salute, Task 74);
//              after the final, the trophy lift in their place (Task 190, trophyLift.js), marked lift: true
// Everything from the end of the handshakes to the next pre-match is the slot's running order (§16), built once as a
// list of timed pieces and looked up by time:
//   the post-match show (postMatchMinutes in all, every part `show: true`): full_time; talk (the match, or the round
//              in a simultaneous final round); talk (the interview tee-up); potm (the interview); talk (wrap-up); this
//              match's highlights (every package of a simultaneous round, biggest stakes first, while they fit); then
//              a studio block to the end of the show
//   after the final instead: full_time, the talk, the interview and wrap-up, then the off-season show (Tasks
//              190–194): the champions, the awards, the farewells, the lottery, the draft, the moves, the sign-off;
//              and the night after it (Task 195, §19.7): filler (the semis' highlights, studio blocks), then the
//              final re-aired (its trophy lift in the handshakes' place) and the show repeated as it aired, in turn,
//              ending on the show, a closing studio block and a run of every ad, timed back from the run-in
//   the gap:   re-air units (intro, line-up, the match with half-time shortened, handshakes, a full-time card, the
//              recorded interview, then a studio block), after a regular match the ones reairs.offsets back, otherwise
//              the last reairs.poolSize cycled; then highlights units (a package and a short block) of recent matches;
//              then one last studio block stretched to fill
//   the run-in: once a day, the channel's opening (ident, then a welcome at the desk) before the first live match
//              from opening.at; and before every live match the tee-up talk
// A studio block is: an ad break if one is due (ads.minGapMinutes since the last, the show's block always), a talk
// clip on something else (studio.clipKinds, a seeded order per slot, never the same kind twice running), then studio
// cards (segments.cardsPerBlock), continuing from where the last block stopped. Every unit starts only if it ends
// before the run-in.
// It's a function of the moment alone (and the slot's seed), so every screen shows the same thing.
import { createRng } from '../sim/rng.js';
import { nextFixture } from '../sim/season.js';
import { cardShows, potmCard } from './cards.js';
import { handshakeLength } from './ceremonies.js';
import { liftLength } from './trophyLift.js';
import { awardEvents, awardOrder } from './awardShow.js';
import { lotteryLength, lotteryView, movesLength, movesView, notableRetirements } from './offseasonShow.js';
import { adsFor } from './spots.js';
import { interviewParts, quoteSchedule } from './interview.js';
import { sizedTalk, talkContext } from './talk.js';
import { highlightClips, packageMs, reelClips, seasonReelClips, spread } from './highlights.js';
import { winnerOf } from './potm.js';
import { byStakes, stakesOf, tableAt } from './onScreen.js';
import { zoneOffsets } from './calendar.js';
import { lightLevel, minuteOfDay } from './daylight.js';
import { SCENES, tourVisits } from './groundsTour.js';
import { vaultStory } from './vault.js';
import { podcastEpisodes, podcastPremiere, podcastRepeatAt, podcastScript, reelReactions } from './podcastTalk.js';

const MIN = 60_000;
/** @typedef {'intro' | 'lineup' | 'match' | 'handshakes' | 'full_time' | 'interview'} ReairPart */
/**
 * @typedef {'match' | 'round' | 'interview_tee_up' | 'wrap_up' | 'clip' | 'tee_up' | 'welcome' | 'awards' | 'signoff' | 'analyst' | 'podcast'} TalkTopic
 * @typedef {'bumper_in' | 'ad' | 'bumper_out'} AdPart
 * @typedef {{ season: number, n: number, kind: import('./podcastTalk.js').EpisodeKind, at: number }} PodcastMark  An OFF
 *   THE BALL episode's: which, and when it was made.
 */

/** Whether a segment shows a match being played: live, or the match part of a re-air. @param {Segment} seg */
export function showsMatch(seg) {
  return seg.kind === 'live' || (seg.kind === 'reair' && seg.part === 'match');
}

/**
 * Whether a segment shows play: a match (showsMatch) or a highlights package. The channel's floor (Tom, 2026-10-19:
 * AROUND THE GROUNDS took a re-air's place in each gap, and highlights count as play) is 60% of the week.
 * @param {Segment} seg
 */
export function showsPlay(seg) {
  return showsMatch(seg) || seg.kind === 'highlights';
}

/**
 * Whose ground a segment shows around a match, with no play on: the next match's for the pre-match (Task 103: the
 * run-in lifts the scene off it, its marks already down) and the walk-out, the match's for the handshakes and a
 * re-air's line-up and handshakes. Null for the rest (matches and highlights follow play; the scene hides the ground).
 * @param {Segment} seg
 * @returns {{ id: string, homeId: string, awayId: string, stage: 'regular' | 'semifinal' | 'final' } | null}
 */
export function groundOf(seg) {
  if (seg.kind === 'pre_match' || seg.kind === 'walk_out') return seg.fixture;
  if (seg.kind === 'handshakes' || (seg.kind === 'reair' && (seg.part === 'lineup' || seg.part === 'handshakes'))) return seg.match;
  return null;
}

/** The off-season summary's cards, in order (the draft's card dropped in Task 193: the draft airs in full before them). */
/** The off-season's scenes the music plays under (Task 204; Tom: not the desk's talk, the trophy lift or the champions' cards; softly under the lottery). */
const MUSIC_KINDS = new Set(['award', 'farewell', 'lottery', 'draft', 'moves']);


/**
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {{ id: string, homeId: string, awayId: string, stage: 'regular' | 'semifinal' | 'final', season: number, round: number | null, kickoff: number, slot: number }} NextFixture
 * @typedef {(
 *   { kind: 'live', match: LiveMatch, elapsed: number, group: LiveMatch[] } |
 *   { kind: 'full_time', match: LiveMatch, group: LiveMatch[], from: number, until: number, show: true } |
 *   { kind: 'pre_match', fixture: NextFixture, group: NextFixture[], until: number } |
 *   { kind: 'walk_out', fixture: NextFixture, group: NextFixture[], until: number } |
 *   { kind: 'handshakes', match: LiveMatch, group: LiveMatch[], until: number, lift?: true } |
 *   { kind: 'potm', match: LiveMatch, from: number, until: number, show: true } |
 *   { kind: 'highlights', match: LiveMatch, elapsed: number, clip: number, clips: number, from: number, clipFrom: number, clipUntil: number, until: number, show?: true, reel?: Reel, preview?: true, finals?: true, vault?: true, podcast?: PodcastMark, reacts?: import('./podcastTalk.js').PodcastSaid[], repeat?: true, next?: NextFixture | null } |
 *   { kind: 'reair', match: LiveMatch, part: ReairPart, elapsed: number, from: number, until: number, lift?: true, celebrate?: true } |
 *   { kind: 'champion', match: LiveMatch, from: number, until: number, repeat?: true } |
 *   { kind: 'award', season: number, award: string, next: NextFixture | null, from: number, until: number, repeat?: true, musicFrom?: number, musicTrack?: number } |
 *   { kind: 'farewell', season: number, index: number, next: NextFixture | null, from: number, until: number, repeat?: true, musicFrom?: number, musicTrack?: number } |
 *   { kind: 'draft', season: number, index: number, next: NextFixture | null, from: number, until: number, repeat?: true, musicFrom?: number, musicTrack?: number } |
 *   { kind: 'lottery', season: number, next: NextFixture | null, from: number, until: number, repeat?: true, musicFrom?: number, musicTrack?: number } |
 *   { kind: 'moves', season: number, lines: number, next: NextFixture | null, from: number, until: number, repeat?: true, musicFrom?: number, musicTrack?: number } |
 *   { kind: 'studio', card: string, rotation: number, next: NextFixture | null, from: number, until: number, show?: true, musicFrom?: number, musicTrack?: number, preview?: true, vault?: true } |
 *   { kind: 'talk', topic: TalkTopic, clip: string | null, match: LiveMatch | null, group: (LiveMatch | NextFixture)[], next: NextFixture | null, from: number, until: number, show?: true, wordsAt?: number, script?: import('./studio.js').Line[] | null, repeat?: true, preview?: true, bit?: import('./analystTalk.js').AnalystBit, podcast?: PodcastMark } |
 *   { kind: 'ads', part: AdPart, ad: number, brk: number, gap: string, next: NextFixture | null, from: number, until: number, show?: true, podcast?: PodcastMark, repeat?: true } |
 *   { kind: 'ident', next: NextFixture | null, from: number, until: number } |
 *   { kind: 'countdown', season: number, next: NextFixture | null, from: number, until: number } |
 *   { kind: 'grounds', teamId: string, scene: string, visit: number, visits: number, fans: number, night: boolean, next: NextFixture | null, tourFrom: number, from: number, until: number }
 * )} Segment
 *   `rotation` counts studio-card rotations since the epoch, so the team spotlight moves on each time.
 *   `clip` / `clips`: which clip of the highlights package is showing (from 0), and how many it has; `clipFrom` and
 *   `clipUntil` when that clip is on screen, `from` when the package began.
 *   `show`: part of a match's post-match show.
 *   A re-air's `part` runs from `from` to `until`; in the `match` part, `elapsed` is the moment of the match on screen
 *   (ms since its kick-off), as for a live match.
 *   `group`: every match sharing the kick-off (the simultaneous final round), in play order; just the one otherwise.
 *   When several are live, `match` is the channel's featured one: the biggest table stakes among those still playing.
 *   A talk's `match`: the match it's about (the match talk, the interview's tee-up and wrap-up); its `group`: the
 *   round's matches (round talk) or the fixtures teed up. `clip`: a gap clip's kind (standings, scorers, upcoming).
 *   `script`: its lines, timed (Task 187: the programme sizes each talk to them; null when it had nothing to say and
 *   the stand-in lines fill in). `wordsAt`: the moment its words were drawn from, when that isn't `from` (the run-in's
 *   talks, sized back from the pre-match).
 *   An ad break's `ad`: which ad of the break (0 to ads.perBreak − 1), for the bumpers 0; its `brk`: which break of
 *   the slot (from 0), so each break carries on through the ads where the last stopped (Task 105); its `gap`: the id
 *   of the match the slot follows, which seeds the slot's order of ads (ads.js adOrder, Task 158).
 *   `vault`: part of FROM THE VAULT (Tom's note 14): its two cards and its reel.
 *   A talk's `podcast`: OFF THE BALL (docs/podcast.md), which episode; its `repeat` when it airs again. Its reel (the
 *   day's goals) carries the pair's `reacts`, one a clip.
 *   A grounds tour's visit (AROUND THE GROUNDS, Tom's note 14): ground `visit` of `visits` from `tourFrom`, whose
 *   home it is and what's going on (groundsTour.js SCENES); `fans`, how full its stands are.
 */

/**
 * A timed piece of a slot's running order: what's on from `from` to `until`, and the segment at a moment within it.
 * `label` names it for the rundown (npm run rundown).
 * @typedef {{ from: number, until: number, label: string, seg: (t: number) => Segment }} Piece
 * @typedef {{ kind: import('./highlights.js').ReelKind | 'season' | 'meetings1' | 'meetings2' | 'semis' | 'meetings_final' | 'day' | 'studio', title: string, season: number, sub?: string, head?: string }} Reel  A reel of the playoffs'
 *   moments (Task 213), or the PLAYOFF PREVIEW show's (the season's goals, a semifinal pair's meetings; `sub` the line under
 *   its name in the sting); match is then each clip's own.
 */

/**
 * @param {import('./liveLeague.js').LiveLeague} live
 * @param {(m: LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @param {import('./talk.js').TalkContext} [ctx]  How the talk names players and times (Task 187: the programme works
 *   out each talk's lines to size it); the channel's own by default.
 */
export function createProgramme(live, timelineOf, ctx = talkContext(live, timelineOf)) {
  const { segments, highlights, reairs, match: matchSettings, studio: talk, ads, opening, preview, groundsTour: tour, lighting, vault } = live.config.settings;
  /** The league's time zone, for the hour (the grounds tour at night). */
  const zone = zoneOffsets(live.config.settings.live.timeZone);
  const teamIds = live.config.teams.teams.map((/** @type {{ id: string }} */ x) => x.id);
  const sec = (/** @type {number} */ s) => s * 1000;
  const fullTimeMs = segments.fullTimeMinutes * MIN;
  const preMatchMs = segments.preMatchMinutes * MIN;
  const walkOutMs = segments.walkOutMinutes * MIN;
  /** A match's handshakes, live or in a re-air (Task 74: shorter without a home win). @param {LiveMatch} m @param {number} full */
  const handshakesOf = (m, full) => handshakeLength(full, live.config.settings.ceremonies, winnerOf(m) === m.homeId);
  const handshakeMinutesMs = segments.handshakeMinutes * MIN;
  /** After a live match's whistle: the handshakes, or after the final the trophy lift in their place (Task 190). @param {LiveMatch} m */
  const afterWhistleMs = (m) => (m.stage === 'final' ? liftLength(live.config.settings.trophyLift) : handshakesOf(m, handshakeMinutesMs));
  const showMs = segments.postMatchMinutes * MIN;
  const potmMs = sec(segments.potmSeconds);
  const introMs = sec(reairs.introSeconds);
  const lineUpMs = sec(reairs.lineUpSeconds);
  const reairHandshakeFullMs = sec(reairs.handshakeSeconds);
  const reairFullTimeMs = sec(reairs.fullTimeSeconds);
  const reairInterviewMs = sec(reairs.interviewSeconds);
  const fullHalfTimeMs = matchSettings.halfTimeRealMinutes * MIN;
  const reairHalfTimeMs = Math.min(sec(reairs.halfTimeSeconds), fullHalfTimeMs);
  const cardMs = sec(segments.studioCardSeconds);
  /** The studio cards' decks by phase (Tom's note 11, 2026-10-19; docs/studio-cards.md). */
  const decks = /** @type {Record<'early' | 'late' | 'finalRound' | 'playoffs' | 'afterFinal', string[]>} */ (segments.studioDecks);
  const championMs = segments.championMinutes * MIN;
  const offseasonMs = segments.offseasonSummaryMinutes * MIN;
  // Which TEAM SPOTLIGHT a card shows: the team turns over every this long.
  const rotationMs = decks.late.length * cardMs;
  /** A studio block's cards (Task 102: cardsPerBlock of them, carrying on round the rotation). */
  const blockCardsMs = segments.cardsPerBlock * cardMs;
  const clipMs = sec(talk.clipSeconds);
  const teeUpMs = sec(talk.teeUpSeconds);
  const minTalkBlockMs = sec(talk.minBlockForTalkSeconds);
  const clipKinds = /** @type {string[]} */ (talk.clipKinds);
  const bumperMs = sec(ads.bumperSeconds);
  const adMs = sec(ads.adSeconds);
  const breakMs = 2 * bumperMs + ads.perBreak * adMs;
  const adGapMs = ads.minGapMinutes * MIN;
  const identMs = sec(opening.identSeconds);
  const welcomeMs = sec(opening.talkSeconds);
  const countdownMs = sec(opening.countdownSeconds);
  const openingMinutes = (() => { const [h, m] = String(opening.at).split(':').map(Number); return h * 60 + m; })();
  /** How long before kick-off the tee-up talk starts. */
  const runInMs = teeUpMs + preMatchMs + walkOutMs;
  const endOfDuration = (/** @type {LiveMatch} */ m) => timelineOf(m).duration;
  const endOf = (/** @type {LiveMatch} */ m) => m.kickoff + endOfDuration(m);
  /**
   * How long a match's interview runs (Task 187), `maxMs` at most: the player's nod, their quote (its clip's length)
   * and a moment to read the caption bar. It used to hold for the whole 45 s after a quote of about 4.
   * @param {LiveMatch} m @param {number} maxMs
   */
  const interviewMs = (m, maxMs) => {
    const card = potmCard(m, live, 0);
    const s = live.config.settings;
    // Its parts (Task 247a), each as long as its clip, a short gap between.
    const quote = quoteSchedule(interviewParts(card, live.config.voiceLengths), s.captions.quoteCharsPerSecond, s.studio.interviewPartGapSeconds * 1000).ms / 1000;
    return Math.min(maxMs, Math.ceil((s.studio.interviewQuoteDelaySeconds + quote + s.studio.interviewHoldSeconds) * 1000));
  };
  /**
   * A talk segment at `from`, before it's sized.
   * @param {TalkTopic} topic @param {Partial<Extract<Segment, { kind: 'talk' }>>} extra @param {number} from @param {NextFixture | null} fixture
   * @returns {Extract<Segment, { kind: 'talk' }>}
   */
  const talkSeg = (topic, extra, from, fixture) => ({ kind: 'talk', topic, clip: null, match: null, group: [], next: fixture, from, until: from, ...extra });
  /** @type {Map<string, import('./highlights.js').Clip[]>} */
  const clipCache = new Map();
  const clipsOf = (/** @type {LiveMatch} */ m) => {
    let c = clipCache.get(m.id);
    if (!c) clipCache.set(m.id, (c = highlightClips(timelineOf(m), highlights)));
    return c;
  };

  /**
   * The next kick-off after the matches already kicked off, and who plays. `group` holds every fixture sharing that
   * kick-off (the four of the simultaneous final round), read from the schedule.
   * @param {number} t
   */
  function next(t) {
    const pos = live.calendar.at(t);
    const season = pos.next ? pos.season : pos.season + 1;
    const slots = live.calendar.slots(season);
    const first = pos.next ?? slots[0];
    const f = nextFixture(live.state);
    /** @type {NextFixture | null} */
    const fixture = f ? { id: f.id, homeId: f.homeId, awayId: f.awayId, stage: f.stage, season: f.season, round: f.round, kickoff: first.kickoff, slot: first.index } : null;
    /** @type {NextFixture[]} */
    const group = [];
    if (fixture && live.state.season === season && first.stage === 'regular') {
      const perRound = live.state.schedule[0].matches.length;
      for (const s of slots.filter((x) => x.kickoff === first.kickoff && x.index >= first.index)) {
        const m = live.state.schedule[/** @type {number} */ (s.round) - 1].matches[s.index % perRound];
        group.push({ id: m.id, homeId: m.homeId, awayId: m.awayId, stage: 'regular', season, round: m.round, kickoff: s.kickoff, slot: s.index });
      }
    }
    return { kickoff: first.kickoff, season, slot: first.index, fixture, group: group.length > 0 ? group : fixture ? [fixture] : [] };
  }

  /** @type {Map<number, string[]>} Featured order for each simultaneous kick-off, from the table before it. */
  const stakesOrder = new Map();

  /**
   * The channel's pick among simultaneous matches: the biggest stakes, judged on the table as it stood at kick-off.
   * @template {{ homeId: string, awayId: string, slot: number, kickoff: number }} M
   * @param {M[]} group
   * @returns {M[]}  Biggest stakes first.
   */
  function rankGroup(group) {
    const kickoff = group[0].kickoff;
    let order = stakesOrder.get(kickoff);
    if (!order) {
      const season = live.calendar.seasonAt(kickoff);
      const table = tableAt(live, season, kickoff - 1, endOfDuration);
      const { rules } = live.config;
      order = byStakes(group, stakesOf(table, rules.playoffs.teams, rules.points.win), table).map((m) => `${m.homeId}|${m.awayId}`);
      stakesOrder.set(kickoff, order);
    }
    const rank = (/** @type {M} */ m) => /** @type {string[]} */ (order).indexOf(`${m.homeId}|${m.awayId}`);
    return [...group].sort((a, b) => rank(a) - rank(b));
  }

  /**
   * preview.lastStart on the local day of `t` (live.timeZone), as an instant.
   * @param {number} t
   */
  function lastStartOn(t) {
    const season = live.calendar.seasonAt(t);
    let d = 0;
    while (live.calendar.instant(season, (d + 1) * 1440) <= t) d++;
    const [hh, mm] = /** @type {string} */ (preview.lastStart).split(':').map(Number);
    return live.calendar.instant(season, d * 1440 + hh * 60 + mm);
  }

  /**
   * A studio card, as shown from `from` to `until`. "Coming up" becomes the playoff bracket once the regular season
   * has finished on screen, and the new-season countdown once the final has been played. (Until the decks, Tom's note
   * 11, head-to-head and the playoff race gave way to other cards when they had nothing to say; now the deck skips them.)
   * @param {string} card @param {number} t @param {number} from @param {number} until @param {NextFixture | null} fixture
   * @returns {Extract<Segment, { kind: 'studio' }>}
   */
  function studioCard(card, t, from, until, fixture) {
    return { kind: 'studio', card: shownAs(card, t), rotation: Math.floor(from / rotationMs), next: fixture, from, until };
  }

  /** @type {string[] | null} cardsFrom's cards, worked out once. */
  let firstCards = null;

  /** The card a dealt card shows as at `t`. @param {string} card @param {number} t */
  function shownAs(card, t) {
    if (card !== 'upcoming') return card;
    const pos = live.calendar.at(t);
    const regularDone = live.matchesIn(pos.season).filter((m) => m.stage === 'regular' && endOf(m) <= t).length === live.calendar.regularCount;
    return !pos.next ? 'new_season' : regularDone ? 'bracket' : 'upcoming';
  }

  /**
   * Studio cards from `from`, one rotation after another, timed from `from` (before the first match ever, from the
   * epoch, so every screen agrees): the early deck in order, the cards with something to say then (nothing changes
   * before a ball is kicked).
   * @param {number} t @param {number} from @param {number} until @param {NextFixture | null} fixture
   */
  function cardsFrom(t, from, until, fixture) {
    const k = Math.floor((t - from) / cardMs);
    firstCards ??= decks.early.filter((c) => cardShows(shownAs(c, from), live, from, ctx));
    const cards = firstCards.length ? firstCards : ['spotlight'];
    return studioCard(cards[k % cards.length], t, from + k * cardMs, Math.min(until, from + (k + 1) * cardMs), fixture);
  }

  /**
   * A match's highlights package from `from`: its length, and the segment at a moment of it.
   * @param {LiveMatch} m @param {number} from
   */
  function packageOf(m, from) {
    const clips = clipsOf(m);
    const length = packageMs(clips, highlights.speed);
    /** @param {number} t @returns {Extract<Segment, { kind: 'highlights' }>} */
    const seg = (t) => {
      let into = (t - from) * highlights.speed;
      let k = 0;
      let start = from;
      while (k < clips.length - 1 && into >= clips[k].to - clips[k].from) {
        into -= clips[k].to - clips[k].from;
        start += (clips[k].to - clips[k].from) / highlights.speed;
        k++;
      }
      const clipUntil = start + (clips[k].to - clips[k].from) / highlights.speed;
      return { kind: 'highlights', match: m, elapsed: clips[k].from + into, clip: k, clips: clips.length, from, clipFrom: start, clipUntil, until: from + length };
    };
    return { length, clips: clips.length, seg };
  }

  /**
   * A reel from `from` (Task 213): one kind of moment across the playoffs, its length and the segment at a moment of
   * it, each clip naming its own match.
   * @param {import('./highlights.js').ReelKind} kind @param {LiveMatch[]} ms  The playoffs, in play order. @param {number} from
   */
  function reelOf(kind, ms, from) {
    return reelFrom(reelClips(ms, kind, timelineOf, highlights), { kind, title: /** @type {Record<string, string>} */ (highlights.reels)[kind], season: ms[0]?.season ?? 0 }, from);
  }

  /**
   * A reel's clips played one after another from `from`, its length and the segment at a moment of it.
   * @param {{ match: LiveMatch, from: number, to: number }[]} clips @param {Reel} reel @param {number} from
   */
  function reelFrom(clips, reel, from) {
    const length = packageMs(clips, highlights.speed);
    /** @param {number} t @returns {Extract<Segment, { kind: 'highlights' }>} */
    const seg = (t) => {
      let into = (t - from) * highlights.speed;
      let k = 0;
      let start = from;
      while (k < clips.length - 1 && into >= clips[k].to - clips[k].from) {
        into -= clips[k].to - clips[k].from;
        start += (clips[k].to - clips[k].from) / highlights.speed;
        k++;
      }
      const clipUntil = start + (clips[k].to - clips[k].from) / highlights.speed;
      return { kind: 'highlights', match: clips[k].match, elapsed: clips[k].from + into, clip: k, clips: clips.length, from, clipFrom: start, clipUntil, until: from + length, reel };
    };
    return { length, clips: clips.length, seg };
  }

  /**
   * A re-air's match part: how long it runs (half-time shortened), and which moment of the match is on screen at each
   * point of it. Half-time plays faster rather than being cut, so players still jog to the other end.
   * @param {LiveMatch} m
   */
  function reairPlay(m) {
    const tl = timelineOf(m);
    const ht = /** @type {import('./timeline.js').TimedEvent} */ (tl.events.find((e) => e.event.type === 'half_time')).at;
    const factor = fullHalfTimeMs / Math.max(1, reairHalfTimeMs);
    return {
      ms: tl.duration - (fullHalfTimeMs - reairHalfTimeMs),
      /** @param {number} p  ms into the match part. */
      elapsedAt: (p) => (p < ht ? p : p < ht + reairHalfTimeMs ? ht + (p - ht) * factor : p + fullHalfTimeMs - reairHalfTimeMs),
    };
  }

  /**
   * Whether the live match kicking off at `kickoff` gets the channel's opening: it's the first whose tee-up starts at
   * or after opening.at on some day (in the league's zone), or the season's very first match.
   * @param {number} season @param {number} slot  Its slot index.
   */
  function hasOpening(season, slot) {
    const slots = live.calendar.slots(season);
    const kickoff = slots[slot].kickoff;
    if (slots[0].kickoff === kickoff) return true;
    let prev = -Infinity;
    for (let i = slot - 1; i >= 0; i--) if (slots[i].kickoff < kickoff) { prev = slots[i].kickoff; break; }
    const days = live.config.settings.calendar.seasonDays;
    for (let d = 0; d < days; d++) {
      const o = live.calendar.instant(season, d * 1440 + openingMinutes);
      if (o > prev - runInMs && o <= kickoff - runInMs) return true;
    }
    return false;
  }

  /**
   * The slot's running order after `last` (and its group) finished: from the end of the handshakes to the next
   * pre-match. Built once per slot.
   * @param {LiveMatch} last @param {LiveMatch[]} group @param {LiveMatch[]} matches  Every match so far, in play order.
   * @returns {Piece[]}
   */
  function buildSlot(last, group, matches) {
    const end = endOf(last);
    const handshakeMs = afterWhistleMs(last);
    const showFrom = end + handshakeMs;
    const nx = next(end);
    const { fixture } = nx;
    const preMatchFrom = nx.kickoff - walkOutMs - preMatchMs;
    const featuredNext = nx.group.length > 1 ? rankGroup(nx.group)[0] : fixture;
    const withOpening = fixture !== null && hasOpening(nx.season, nx.slot);
    const { teeUp, welcome, teeUpFrom, runInFrom } = runIn(nx, featuredNext, preMatchFrom, withOpening);
    const finished = matches.filter((m) => endOf(m) <= end);
    const featured = group.length > 1 ? rankGroup(group)[0] : last;
    // The big matches promoted (Tom, 2026-10-17): before the final round, a semifinal or the final, every studio block
    // leads with the promo card (cards.js promoCard), the rotation carrying on after it.
    const promoted = fixture !== null && (nx.group.length > 1 || fixture.stage === 'semifinal' || fixture.stage === 'final');
    const rng = createRng(`programme|${last.id}`);
    const clipOffset = rng.int(0, clipKinds.length - 1);

    /** @type {Piece[]} */
    const pieces = [];
    let cursor = showFrom;
    /**
     * The slot's running state: each phase's deck (Tom's note 11: shuffled, seeded by the slot, every card in the pool
     * before any comes round again, a new shuffle never opening with the card the last ended on), where the clips have
     * got to, and when the last ad break ended.
     * @type {Record<string, { deck: string[], last: string | null, pass: number }>}
     */
    let deckState = {};
    let clipIndex = 0;
    let lastAdEnd = -Infinity;
    let breaks = 0;

    /** @param {number} ms @param {string} label @param {(from: number, until: number) => (t: number) => Segment} make @param {number} [limit] */
    const add = (ms, label, make, limit = runInFrom) => {
      const from = cursor;
      const until = Math.min(cursor + ms, limit);
      if (until > from) pieces.push({ from, until, label, seg: make(from, until) });
      cursor = Math.max(cursor, until);
    };
    /**
     * A talk from the cursor, as long as its lines need (Task 187), `maxMs` at most and never past `limit`.
     * @param {number} maxMs @param {string} label @param {TalkTopic} topic @param {Partial<Extract<Segment, { kind: 'talk' }>>} extra
     * @param {boolean} show @param {number} [limit]
     */
    const addTalk = (maxMs, label, topic, extra, show, limit = runInFrom) => {
      const room = Math.min(maxMs, limit - cursor);
      if (room <= 0) return;
      const seg = talkSeg(topic, { ...extra, ...(show ? { show: true } : {}) }, cursor, fixture);
      const { script, ms } = sizedTalk(seg, live, ctx, room);
      add(ms, label, (from, until) => () => ({ ...seg, from, until, script }), limit);
    };

    /**
     * A studio block from the cursor: an ad break if one is due (unless `noAds`), a talk clip, then cards
     * (cardsPerBlock, or to `fillTo`).
     * @param {{ show?: boolean, talk?: boolean, fillTo?: number, noAds?: boolean }} o
     */
    const block = (o) => {
      const show = Boolean(o.show);
      const room = (/** @type {number} */ need) => o.fillTo === undefined || o.fillTo - cursor >= need;
      if (!o.noAds && cursor - lastAdEnd >= adGapMs && room(breakMs)) {
        const start = cursor;
        const brk = breaks++;
        add(bumperMs, 'ads · bumper in', (from, until) => () => ({ kind: 'ads', part: 'bumper_in', ad: 0, brk, gap: last.id, next: fixture, from, until, ...(show ? { show: true } : {}) }), Infinity);
        for (let i = 0; i < ads.perBreak; i++) add(adMs, `ads · ad ${i + 1}`, (from, until) => () => ({ kind: 'ads', part: 'ad', ad: i, brk, gap: last.id, next: fixture, from, until, ...(show ? { show: true } : {}) }), Infinity);
        add(bumperMs, 'ads · bumper out', (from, until) => () => ({ kind: 'ads', part: 'bumper_out', ad: 0, brk, gap: last.id, next: fixture, from, until, ...(show ? { show: true } : {}) }), Infinity);
        lastAdEnd = start + breakMs;
      }
      if (o.talk && (o.fillTo === undefined || o.fillTo - cursor >= minTalkBlockMs)) {
        const kind = clipKinds[(clipOffset + clipIndex++) % clipKinds.length];
        addTalk(clipMs, `talk · ${kind}`, 'clip', { clip: kind }, show, Infinity);
      }
      const until = o.fillTo ?? cursor + blockCardsMs;
      // The promo leads the block, and comes round again every cardsPerBlock cards in a long one (the show's last block).
      // LATEST RESULTS leads the block straight after a match (the post-match show's; Tom's note 11), the rest dealt.
      let shown = 0;
      /** @type {Set<string>} */
      const inBlock = new Set();
      let resultsFirst = show;
      while (cursor < until) {
        // In a long block (the show's last, stretched), each run of cardsPerBlock cards counts as a block of its own.
        const k = shown++;
        if (k % segments.cardsPerBlock === 0) inBlock.clear();
        // OFF THE BALL's premiere promoted (Tom, 2026-10-21) the same way, when no big match is (and after the post-match
        // show's LATEST RESULTS).
        const lead = k % segments.cardsPerBlock === 0 ? (promoted ? 'promo' : !show && podcastPremiere(live, cursor, ctx) ? 'podcast_promo' : null) : null;
        const fixed = lead ?? (resultsFirst ? 'results' : null);
        if (fixed === 'results') resultsFirst = false;
        const card = fixed ?? deal(cursor, inBlock);
        inBlock.add(card);
        // A card that would leave less than half a card runs on to the end instead, so none flashes up for a moment
        // (Task 175 found a 0.7 s card before the opening).
        const left = until - cursor;
        add(left - cardMs < cardMs / 2 ? left : cardMs, `card · ${card}`, (from, to) => (t) => ({ ...studioCard(card, t, from, to, fixture), ...(show ? { show: true } : {}) }), until);
      }
    };

    /**
     * The deck's next card at `t` (Tom's note 11): from this phase's shuffled pool, skipping one already in the block,
     * the one just dealt, or one with nothing to say (cards.js cardShows); a new shuffle once the pool is through. Every screen deals the same:
     * the shuffles are seeded by the slot, and a card's having something to say is fixed by `t`.
     * @param {number} t @param {Set<string>} inBlock @returns {string}
     */
    function deal(t, inBlock) {
      const phase = phaseOf(t);
      const pool = decks[phase];
      const st = (deckState[phase] ??= { deck: [], last: null, pass: 0 });
      for (let tries = 0; tries < pool.length * 2; tries++) {
        if (!st.deck.length) {
          st.deck = createRng(`deck|${last.id}|${phase}|${st.pass++}`).shuffle([...pool]);
          if (st.deck.length > 1 && st.deck.at(-1) === st.last) st.deck.unshift(/** @type {string} */ (st.deck.pop()));
        }
        const card = /** @type {string} */ (st.deck.pop());
        if (inBlock.has(card) || card === st.last || !cardShows(shownAs(card, t), live, t, ctx)) continue;
        st.last = card;
        return card;
      }
      return inBlock.has('spotlight') ? 'results' : 'spotlight';
    }

    /**
     * Which deck a studio block deals from (Tom's note 11): after the final; the playoffs (from a semifinal's end); the
     * final round to the first semifinal; the regular season's first studioDecks.earlyDays days; or the rest of it.
     * @param {number} t @returns {keyof typeof decks}
     */
    function phaseOf(t) {
      if (last.stage === 'final') return 'afterFinal';
      if (last.stage === 'semifinal') return 'playoffs';
      if (fixture?.stage === 'semifinal') return 'finalRound';
      return t < live.calendar.instant(last.season, segments.studioDecks.earlyDays * 1440) ? 'early' : 'late';
    }

    /**
     * Studio blocks up to `until` (Task 206): whole blocks (an ad break when due, a talk clip, cardsPerBlock cards)
     * while another fits, then one stretched to it; a long stretch (the first gap of the channel, before the next
     * live match) so keeps its ads and the desk's clips rather than becoming one long run of cards.
     * @param {number} until
     */
    const fillTo = (until) => {
      while (cursor + blockLength(cursor) + blockCardsMs <= until) block({ talk: true });
      if (cursor < until) block({ talk: true, fillTo: until });
    };
    /** How long a fixed block would take if it started now (an ad break if due, a talk clip, its cards). */
    const blockLength = (/** @type {number} */ at) => (at - lastAdEnd >= adGapMs ? breakMs : 0) + clipMs + blockCardsMs;

    /**
     * AROUND THE GROUNDS (Tom's note 14; docs/channel.md §32): once a gap, from the cursor, if the whole tour and a block
     * after it end by `until`: every ground in turn, ending at the next match's, each with its scene; only the
     * groundstaff at night and on the night after the final. Never between the second semifinal and the final.
     */
    let toured = false;
    const maybeTour = (/** @type {number} */ until) => {
      if (!tour.on || toured || (last.stage === 'semifinal' && fixture?.stage === 'final')) return;
      const visitMs = sec(tour.visitSeconds);
      const ms = teamIds.length * visitMs;
      if (cursor + ms + blockLength(cursor + ms) > until) return;
      toured = true;
      const night = lightLevel(minuteOfDay(cursor, zone.offsetAt(cursor)), lighting) >= tour.nightLevel;
      const staffOnly = last.stage === 'final' || night;
      const visits = tourVisits(teamIds, { key: last.id, lastId: fixture?.homeId ?? null, staffOnly });
      const tourFrom = cursor;
      visits.forEach((v, i) => add(visitMs, `grounds · ${v.teamId} · ${v.scene}`, (from, until) => () => ({
        kind: 'grounds', teamId: v.teamId, scene: v.scene, visit: i, visits: visits.length,
        fans: SCENES[v.scene].staff ? tour.fans.staff : tour.fans.training, night, next: fixture, tourFrom, from, until,
      })));
      block({ talk: true });
    };

    /**
     * FROM THE VAULT (Tom's note 14; docs/channel.md §33): about each of vault.at, from vault.fromSeason. A time from the
     * last match's run-in to this one's belongs to this gap (so a time during a live match goes to the gap after it).
     * It airs at the first break from its time, or before a unit that would carry past it, if the whole package and a
     * block fit before the run-in; never between the second semifinal and the final, nor on the night after the final.
     */
    let vaulted = false;
    const vaultAt = (() => {
      if (!vault.on || last.stage === 'final' || (last.stage === 'semifinal' && fixture?.stage === 'final')) return null;
      const from = last.kickoff - runInMs;
      for (const hhmm of /** @type {string[]} */ (vault.at)) {
        const minutes = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
        for (const base of [from, runInFrom]) {
          const x = base - minuteOfDay(base, zone.offsetAt(base)) * MIN + minutes * MIN;
          if (x >= from && x < runInFrom) return x;
        }
      }
      return null;
    })();
    /** @param {number} nextUnitMs  How long the unit about to start runs (Infinity: now's the last chance). */
    const maybeVault = (nextUnitMs) => {
      if (vaulted || vaultAt === null || (cursor < vaultAt && cursor + nextUnitMs <= vaultAt)) return;
      const story = vaultStory(live, cursor);
      vaulted = true;
      if (!story) return;
      const openMs = sec(vault.openSeconds);
      const reelMs = packageOf(story.match, cursor + openMs).length;
      const ms = openMs + reelMs + sec(vault.sinceSeconds);
      if (cursor + ms + blockLength(cursor + ms) > runInFrom) return;
      add(openMs, 'vault · open', (from, until) => (t) => ({ ...studioCard('vault_open', t, from, until, fixture), vault: /** @type {const} */ (true) }));
      const reel = packageOf(story.match, cursor);
      add(reel.length, `vault · ${story.match.id}`, () => (t) => ({ ...reel.seg(t), vault: /** @type {const} */ (true) }));
      add(sec(vault.sinceSeconds), 'vault · since', (from, until) => (t) => ({ ...studioCard('vault_since', t, from, until, fixture), vault: /** @type {const} */ (true) }));
      block({ talk: true });
    };

    // The post-match show.
    const showUntil = Math.min(showFrom + showMs, runInFrom);
    add(fullTimeMs, 'full time', (from, until) => () => ({ kind: 'full_time', match: last, group, from, until, show: true }), showUntil);
    const round = group.length > 1;
    addTalk(sec(round ? talk.roundTalkSeconds : talk.matchTalkSeconds), `talk · ${round ? 'round' : 'match'}`, round ? 'round' : 'match', { match: featured, group }, true, showUntil);
    addTalk(sec(talk.interviewTeeUpSeconds), 'talk · interview tee-up', 'interview_tee_up', { match: featured }, true, showUntil);
    add(interviewMs(featured, potmMs), 'interview', (from, until) => () => ({ kind: 'potm', match: featured, from, until, show: true }), showUntil);
    addTalk(sec(talk.wrapUpSeconds), 'talk · wrap-up', 'wrap_up', { match: featured }, true, showUntil);

    /** @type {Piece[]} The off-season show as it aired (Task 195: repeated through the night after it). */
    let showPieces = [];
    if (last.stage === 'final') {
      // The final's highlights (Tom, after Task 258): how it was won, as after any match, the wrap-up leading into them.
      const pkg = packageOf(last, cursor);
      if (pkg.clips) add(pkg.length, `highlights · ${last.id}`, () => (t) => ({ ...pkg.seg(t), show: true }), Infinity);
      const showIndex = pieces.length;
      // Then the champions' cards (Tom: no talk before them, the match talk has crowned them), then the off-season
      // (retirements, lottery, draft) as the sim already decided it.
      add(championMs, 'champions', (from, until) => () => ({ kind: 'champion', match: last, from, until }));
      // The awards (Task 191): the desk's intro, then each award the sim gave on the plinth, in settings.awards.order.
      const aw = live.config.settings.awards;
      const order = awardOrder(aw, awardEvents(live.leagueEvents, last.season));
      if (order.length) {
        addTalk(sec(aw.talkSeconds), 'talk · awards', 'awards', { match: last }, false, Infinity);
        for (const award of order) add(sec(aw.awardSeconds), `award · ${award}`, (from, until) => () => ({ kind: 'award', season: last.season, award, next: fixture, from, until }), Infinity);
      }
      const offseasonFrom = cursor;
      // The farewells (Task 192): the season's notable retirements, a gallery, each lit in turn.
      const { farewells: fw, lottery: lot } = live.config.settings;
      const nameOf = (/** @type {string} */ id) => { const p = live.league.players[id]; return p ? `${p.firstName} ${p.lastName}` : id; };
      const notable = notableRetirements(live.leagueEvents, live.league.history, last.season, fw, live.config.rules.awards, nameOf);
      notable.forEach((f, index) => add(sec(fw.perPlayerSeconds), `farewell · ${f.name}`, (from, until) => () => ({ kind: 'farewell', season: last.season, index, next: fixture, from, until }), offseasonFrom + offseasonMs));
      // The draft lottery (Task 192): the odds, then the picks drawn last first, as the sim drew them.
      const summary = live.league.history.find((h) => h.season === last.season);
      const lottery = summary ? lotteryView(live.leagueEvents, last.season, summary, live.config.rules) : null;
      if (lottery?.picks.length) add(lotteryLength(lottery.picks.length, lot), 'draft lottery', (from, until) => () => ({ kind: 'lottery', season: last.season, next: fixture, from, until }), offseasonFrom + offseasonMs);
      // The draft (Task 193): every pick in order, round 1 on the board then in close-up, round 2 on the board, quicker.
      const dr = live.config.settings.draft;
      const picks = live.leagueEvents.filter((e) => e.type === 'draft_pick' && e.season === last.season)
        .map((e) => /** @type {{ pick: number, round: number }} */ (e.data)).sort((a, b) => a.pick - b.pick);
      picks.forEach((p, index) => add(sec(p.round === 1 ? dr.round1Seconds : dr.round2Seconds), `draft · round ${p.round} · pick ${p.pick}`, (from, until) => () => ({ kind: 'draft', season: last.season, index, next: fixture, from, until }), offseasonFrom + offseasonMs));
      // The moves (Task 194): the signings, the veteran releases and the call-ups on the board; then the desk signs off.
      const mv = live.config.settings.moves;
      const moves = movesView(live.leagueEvents, last.season, live.league.history, live.league.players, live.league.teams, live.config.rules.awards, mv, fw.awardWeight, live.config);
      if (moves.length) add(movesLength(moves.length, mv), 'moves', (from, until) => () => ({ kind: 'moves', season: last.season, lines: moves.length, next: fixture, from, until }), offseasonFrom + offseasonMs);
      addTalk(sec(talk.signoffTalkSeconds), 'talk · sign-off', 'signoff', { match: last }, false, offseasonFrom + offseasonMs);
      // Task 195: the off-season's talk and recap cards no longer follow (removed in Task 207): the show has aired all of it.
      showPieces = pieces.slice(showIndex);
      // The off-season's music (Task 204) plays through each unbroken run of the awards, farewells, lottery (softly),
      // draft and moves, from the loop's top at the run's start; the desk's talk breaks a run.
      let runFrom = null;
      for (let k = showIndex; k < pieces.length; k++) {
        const p = pieces[k];
        const kind = p.seg(p.from).kind;
        if (!MUSIC_KINDS.has(kind)) { runFrom = null; continue; }
        if (runFrom === null || pieces[k - 1].until !== p.from) runFrom = p.from;
        const from = runFrom;
        const seg = p.seg;
        pieces[k] = { ...p, seg: (t) => ({ ...seg(t), musicFrom: from }) };
      }
      showPieces = pieces.slice(showIndex);
    } else {
      for (const m of round ? rankGroup(group) : group) {
        const pkg = packageOf(m, cursor);
        if (pkg.clips === 0 || cursor + pkg.length > showUntil) break;
        add(pkg.length, `highlights · ${m.id}`, () => (t) => ({ ...pkg.seg(t), show: true }), showUntil);
      }
      if (cursor < showUntil) block({ show: true, talk: true, fillTo: showUntil });
    }

    if (last.stage === 'final') {
      night(showPieces);
      return pieces;
    }

    /**
     * The PLAYOFF PREVIEW show's running order, each piece's length and how to make it at its place: the opening, a desk
     * clip (the final table, its existing lines), THE TABLE'S STORY, the GOALS OF THE SEASON reel, BY THE NUMBERS, then
     * for each semifinal TALE OF THE TAPE, its pair's meetings reel and PLAYERS TO WATCH, then the SEMIFINALS promo.
     * @param {number} at  When it starts (the desk's clip is sized to its lines then).
     * @returns {{ ms: number, label: string, make: (from: number, until: number) => (t: number) => Segment }[]}
     */
    function previewPieces(at) {
      const cardMsP = sec(preview.cardSeconds);
      const card = (/** @type {string} */ name, ms = cardMsP) => ({ ms, label: `preview · ${name}`, make: (/** @type {number} */ from, /** @type {number} */ until) => (/** @type {number} */ t) => ({ ...studioCard(name, t, from, until, fixture), preview: /** @type {const} */ (true) }) });
      const regular = finished.filter((m) => m.season === last.season && m.stage === 'regular');
      /** @param {{ match: LiveMatch, from: number, to: number }[]} clips @param {Reel} reel */
      const reelPiece = (clips, reel) => ({
        ms: packageMs(clips, highlights.speed), label: `preview · reel · ${reel.kind}`,
        make: (/** @type {number} */ from) => {
          const r = reelFrom(clips, reel, from);
          return (/** @type {number} */ t) => ({ ...r.seg(t), preview: /** @type {const} */ (true) });
        },
      });
      const out = [card('preview_open', sec(preview.openingSeconds))];
      // The desk: the standings clip (after the regular season, the final table; its existing lines).
      /** When the next piece would start. */
      const next = () => at + out.reduce((sum, x) => sum + x.ms, 0);
      /** A talk sized to its lines where it will air. @param {Partial<Extract<Segment, { kind: 'talk' }>>} extra @param {number} maxMs @param {string} label */
      const talkPiece = (extra, maxMs, label) => {
        const talkSegment = talkSeg(/** @type {TalkTopic} */ (extra.topic), extra, next(), fixture);
        const { script, ms } = sizedTalk(talkSegment, live, ctx, maxMs);
        if (!script) return;
        out.push({ ms, label: `preview · talk · ${label}`, make: (from, until) => () => ({ ...talkSegment, from, until, script, preview: /** @type {const} */ (true) }) });
      };
      // The desk: the standings clip (after the regular season, the final table; its existing lines).
      talkPiece({ topic: 'clip', clip: 'standings' }, clipMs, 'standings');
      out.push(card('table_story'));
      // The playoff analyst on the four (analystTalk.js; Tom, after the show was built).
      talkPiece({ topic: 'analyst', bit: 'four' }, sec(preview.analystSeconds), 'analyst · four');
      const seasonClips = seasonReelClips(regular, preview.seasonReelClips, timelineOf, highlights);
      if (seasonClips.length) out.push(reelPiece(seasonClips, { kind: 'season', title: preview.reels.season, season: last.season, sub: `SEASON ${last.season}` }));
      out.push(card('season_numbers'));
      // The semifinals as the sim has them, 1st v 4th and 2nd v 3rd (shown only once the final round has finished on screen).
      const seeds = live.state.season === last.season ? live.state.seeds : [];
      [[seeds[0], seeds[3]], [seeds[1], seeds[2]]].forEach(([h, a], i) => {
        if (!h || !a) return;
        talkPiece({ topic: 'analyst', bit: /** @type {'semi1' | 'semi2'} */ (`semi${i + 1}`) }, sec(preview.analystSeconds), `analyst · semi${i + 1}`);
        out.push(card(`tape_${i + 1}`));
        const met = regular.filter((m) => [m.homeId, m.awayId].includes(h) && [m.homeId, m.awayId].includes(a));
        const clips = spread(reelClips(met, 'goals', timelineOf, highlights), preview.meetingReelClips);
        const name = (/** @type {string} */ id) => live.league.teams[id].shortName.toUpperCase();
        if (clips.length) out.push(reelPiece(clips, { kind: /** @type {'meetings1' | 'meetings2'} */ (`meetings${i + 1}`), title: `${name(h)} v ${name(a)}`, season: last.season, sub: preview.reels.meetings }));
        out.push(card(`watch_${i + 1}`));
      });
      out.push(card('promo'));
      return out;
    }

    /**
     * The FINALS PREVIEW show's running order (Tom, 2026-10-18; docs/channel.md §30.3): the opening, a desk clip (the
     * final set, its existing lines), THE ROAD TO THE FINAL, a reel of both semifinals' goals, TALE OF THE TAPE, the
     * finalists' meetings reel, PLAYERS TO WATCH, then THE FINAL's promo card. Its segments carry finals: true.
     * @param {number} at  When it starts.
     * @returns {{ ms: number, label: string, make: (from: number, until: number) => (t: number) => Segment }[]}
     */
    function finalsPieces(at) {
      const mark = (/** @type {Segment} */ x) => /** @type {Segment} */ ({ ...x, preview: /** @type {const} */ (true), finals: /** @type {const} */ (true) });
      const card = (/** @type {string} */ name, ms = sec(preview.cardSeconds)) => ({ ms, label: `finals preview · ${name}`, make: (/** @type {number} */ from, /** @type {number} */ until) => (/** @type {number} */ t) => mark(studioCard(name, t, from, until, fixture)) });
      const reelPiece = (/** @type {{ match: LiveMatch, from: number, to: number }[]} */ clips, /** @type {Reel} */ reel) => ({
        ms: packageMs(clips, highlights.speed), label: `finals preview · reel · ${reel.kind}`,
        make: (/** @type {number} */ from) => {
          const r = reelFrom(clips, reel, from);
          return (/** @type {number} */ t) => mark(r.seg(t));
        },
      });
      const out = [card('finals_open', sec(preview.openingSeconds))];
      const next = () => at + out.reduce((sum, x) => sum + x.ms, 0);
      // The desk: the playoffs clip (the final set; its existing lines), sized where it will air.
      /** A talk sized to its lines where it will air. @param {Partial<Extract<Segment, { kind: 'talk' }>>} extra @param {number} maxMs @param {string} label */
      const talkPiece = (extra, maxMs, label) => {
        const talkSegment = talkSeg(/** @type {TalkTopic} */ (extra.topic), extra, next(), fixture);
        const sized = sizedTalk(talkSegment, live, ctx, maxMs);
        if (sized.script) out.push({ ms: sized.ms, label: `finals preview · talk · ${label}`, make: (from, until) => () => mark({ ...talkSegment, from, until, script: sized.script }) });
      };
      talkPiece({ topic: 'clip', clip: 'standings' }, clipMs, 'standings');
      out.push(card('road'));
      // The playoff analyst (Tom, 2026-10-18): how each finalist got here.
      talkPiece({ topic: 'analyst', bit: 'road' }, sec(preview.analystSeconds), 'analyst · road');
      const semis = finished.filter((m) => m.season === last.season && m.stage === 'semifinal').sort((a, b) => a.kickoff - b.kickoff);
      const semiClips = reelClips(semis, 'goals', timelineOf, highlights);
      if (semiClips.length) out.push(reelPiece(semiClips, { kind: 'semis', title: preview.reels.semis, season: last.season, sub: `SEASON ${last.season}` }));
      // The analyst on the final itself, before its TALE OF THE TAPE.
      talkPiece({ topic: 'analyst', bit: 'final' }, sec(preview.analystSeconds), 'analyst · final');
      out.push(card('tape_final'));
      const [h, a] = [fixture?.homeId, fixture?.awayId];
      const regularMs = finished.filter((m) => m.season === last.season && m.stage === 'regular' && [m.homeId, m.awayId].includes(h) && [m.homeId, m.awayId].includes(a));
      const metClips = spread(reelClips(regularMs, 'goals', timelineOf, highlights), preview.meetingReelClips);
      const nm = (/** @type {string} */ id) => live.league.teams[id].shortName.toUpperCase();
      if (h && a && metClips.length) out.push(reelPiece(metClips, { kind: 'meetings_final', title: `${nm(h)} v ${nm(a)}`, season: last.season, sub: preview.reels.meetings }));
      out.push(card('watch_final'));
      out.push(card('promo'));
      return out;
    }

    // The PLAYOFF PREVIEW show (the big matches promoted, Tom 2026-10-17; docs/channel.md §30.1): in the gap between the
    // final round and the semifinals, right after the show, then again before a re-air once preview.everyMinutes have
    // passed since the last began, none starting after preview.lastStart on the semifinals' day. FINALS PREVIEW (Tom,
    // 2026-10-18; §30.3) the same in the gap between the second semifinal and the final, every finalsEveryMinutes.
    const finalsOn = last.stage === 'semifinal' && fixture?.stage === 'final';
    const previewOn = (round && fixture?.stage === 'semifinal') || finalsOn;
    let previewAt = -Infinity;
    const previewEvery = sec((finalsOn ? preview.finalsEveryMinutes : preview.everyMinutes) * 60);
    const previewUntil = finalsOn ? runInFrom : previewOn ? lastStartOn(nx.kickoff) : -Infinity;
    /** The show from the cursor, if it's due and it fits with a block after it before the run-in. */
    const maybePreview = () => {
      if (!previewOn || cursor - previewAt < previewEvery || cursor > previewUntil) return;
      const show = finalsOn ? finalsPieces(cursor) : previewPieces(cursor);
      const ms = show.reduce((sum, x) => sum + x.ms, 0);
      if (cursor + ms + blockLength(cursor + ms) > runInFrom) return;
      previewAt = cursor;
      for (const x of show) add(x.ms, x.label, x.make);
    };
    maybePreview();

    /**
     * OFF THE BALL's running order (docs/podcast.md; podcastTalk.js): its first talk, the day's goals (a reel, scorchers
     * first, settings.podcast.reelClips at most), the second talk, an ad break, the third talk; every piece marked with
     * the episode. Its words were worked out when it was made (episode.at), so a repeat says the same.
     * @param {import('./podcastTalk.js').EpisodeSlot} slot @param {boolean} repeat
     * @returns {{ ms: number, label: string, make: (from: number, until: number) => (t: number) => Segment }[]}
     */
    function podcastPieces(slot, repeat) {
      const { episode, parts } = podcastScript(live, slot, ctx);
      const mark = { podcast: { season: slot.season, n: slot.n, kind: slot.kind, at: slot.at }, ...(repeat ? { repeat: /** @type {const} */ (true) } : {}) };
      const name = `podcast · ${slot.kind} · s${slot.season} n${slot.n}${repeat ? ' · repeat' : ''}`;
      const talkPiece = (/** @type {number} */ k) => ({
        ms: parts[k].ms, label: `${name} · talk ${k + 1}`,
        make: (/** @type {number} */ from, /** @type {number} */ until) => () => /** @type {Segment} */ ({ ...talkSeg('podcast', {}, from, fixture), until, script: parts[k].script, ...mark }),
      });
      const out = [talkPiece(0)];
      const matches = episode.goals.map((id) => live.matches.get(id)).filter((m) => m !== undefined);
      const clips = seasonReelClips(matches, live.config.settings.podcast.reelClips, timelineOf, highlights);
      if (clips.length) {
        out.push({
          ms: packageMs(clips, highlights.speed), label: `${name} · the day's goals`,
          make: (from) => {
            const r = reelFrom(clips, { kind: 'day', title: 'THE DAY\'S GOALS', season: slot.season, sub: 'OFF THE BALL' }, from);
            // The pair's reaction to each goal (the booth, step 4c).
            const reacts = reelReactions(live, slot, clips.length);
            return (t) => /** @type {Segment} */ ({ ...r.seg(t), ...mark, reacts, next: fixture });
          },
        });
      }
      out.push(talkPiece(1));
      const gap = `podcast|${slot.season}|${slot.n}`;
      /** @param {AdPart} part @param {number} ad @param {number} ms */
      const adPiece = (part, ad, ms) => ({ ms, label: `${name} · ads · ${part === 'ad' ? `ad ${ad + 1}` : part}`, make: (/** @type {number} */ from, /** @type {number} */ until) => () => /** @type {Segment} */ ({ kind: 'ads', part, ad, brk: 0, gap, next: fixture, from, until, ...mark }) });
      out.push(adPiece('bumper_in', 0, bumperMs));
      for (let i = 0; i < ads.perBreak; i++) out.push(adPiece('ad', i, adMs));
      out.push(adPiece('bumper_out', 0, bumperMs));
      out.push(talkPiece(2));
      return out;
    }
    /**
     * An OFF THE BALL episode at the cursor, if it and a block after it end by `limit`: its pieces, then a studio block.
     * @param {import('./podcastTalk.js').EpisodeSlot} slot @param {boolean} repeat @param {number} limit @returns {boolean} Whether it aired.
     */
    function podcastHere(slot, repeat, limit) {
      const show = podcastPieces(slot, repeat);
      const ms = show.reduce((sum, x) => sum + x.ms, 0);
      if (cursor + ms + blockLength(cursor + ms) > limit) return false;
      for (const x of show) {
        // Its break counts as the gap's: the next block's ads wait their usual gap after it.
        if (x.label.includes('· ads · bumper in')) lastAdEnd = cursor + breakMs;
        add(x.ms, x.label, x.make, Infinity);
      }
      block({ talk: true });
      return true;
    }
    /**
     * The daily episode this gap airs, if any: the one made (settings.podcast.at), or to air again overnight
     * (repeatAt), at a time from the last match's run-in to this one's (a time during a live match goes to the gap
     * after it). Never in PLAYOFF PREVIEW's or FINALS PREVIEW's gap. It airs at the first break from its time, never
     * before; a re-air that no longer fits gives way.
     */
    const podcastAir = (() => {
      if (previewOn || last.stage !== 'regular') return null;
      const from = last.kickoff - runInMs;
      for (const slot of podcastEpisodes(live, last.season, ctx).filter((e) => e.kind !== 'review')) {
        for (const [x, repeat] of /** @type {[number, boolean][]} */ ([[slot.at, false], [podcastRepeatAt(live, slot), true]])) {
          if (x >= from && x < runInFrom) return { slot, x, repeat };
        }
      }
      return null;
    })();
    let podcastDone = false;
    const maybePodcast = () => {
      if (podcastDone || !podcastAir || cursor < podcastAir.x) return;
      podcastDone = true;
      podcastHere(podcastAir.slot, podcastAir.repeat, runInFrom);
    };

    // Re-air units: after a regular match, the ones reairs.offsets back in play order; after anything else (the final
    // round, a knockout, the final), the most recent matches cycled. Each only if the whole unit fits. Between the second
    // semifinal and the final, the two semifinals alone (Tom, 2026-10-18), with FINALS PREVIEW between them.
    const semisOnly = finalsOn ? finished.filter((m) => m.season === last.season && m.stage === 'semifinal').reverse() : null;
    const regular = last.stage === 'regular' && !round;
    const k = matches.indexOf(last);
    const picks = regular
      ? /** @type {number[]} */ (reairs.offsets).map((o) => matches[k - o]).filter((m) => m && finished.includes(m))
      : semisOnly ?? finished.slice(-reairs.poolSize).reverse();
    /**
     * The re-air units from the cursor, `most` at most, each only if it fits, leaving out the `skip`th of them; the
     * grounds tour after the first.
     * @param {number} most @param {number} [skip] @returns {number} How many aired.
     */
    const reairUnits = (most, skip = -1) => {
      let aired = 0;
      for (let i = 0; aired < most && picks.length > 0 && (regular ? i < picks.length : true); i++) {
        if (i === skip) continue;
        const m = picks[i % picks.length];
        const play = reairPlay(m);
        // A final ends with the champions celebrating, carrying on behind the full-time card (Task 278f).
        const celebrate = m.stage === 'final';
        const shake = celebrate ? sec(reairs.finalCelebrateSeconds) : handshakesOf(m, reairHandshakeFullMs);
        const iv = interviewMs(m, reairInterviewMs);
        const unitMs = introMs + lineUpMs + play.ms + shake + reairFullTimeMs + iv;
        maybePreview();
        maybePodcast();
        maybeVault(unitMs);
        if (cursor + unitMs + blockLength(cursor + unitMs) > runInFrom) break;
        const parts = /** @type {[ReairPart, number][]} */ ([['intro', introMs], ['lineup', lineUpMs], ['match', play.ms], ['handshakes', shake], ['full_time', reairFullTimeMs], ['interview', iv]]);
        for (const [part, ms] of parts) {
          add(ms, `re-air · ${m.id} · ${celebrate && part === 'handshakes' ? 'celebration' : part}`, (from, until) => (t) => ({
            kind: 'reair', match: m, part, from, until, ...(celebrate && (part === 'handshakes' || part === 'full_time') ? { celebrate: /** @type {const} */ (true) } : {}),
            elapsed: part === 'match' ? play.elapsedAt(t - from) : part === 'intro' || part === 'lineup' ? 0 : timelineOf(m).duration,
          }));
        }
        block({ talk: true });
        aired++;
        maybeTour(runInFrom);
      }
      maybeTour(runInFrom);
      return aired;
    };
    // AROUND THE GROUNDS takes a re-air's place (Tom, 2026-10-19): when a tour airs in a gap with room for two re-airs
    // or more, the gap is built again with one fewer, its time going to the tour and the highlights. Which one gives
    // way turns from gap to gap, so every match keeps its share of re-airs; a gap with room for one keeps it.
    const saved = { n: pieces.length, cursor, deckState: structuredClone(deckState), clipIndex, lastAdEnd, breaks, previewAt, toured, vaulted, podcastDone };
    const aired = reairUnits(Infinity);
    if (toured && aired > 1) {
      pieces.length = saved.n;
      ({ cursor, deckState, clipIndex, lastAdEnd, breaks, previewAt, toured, vaulted, podcastDone } = saved);
      reairUnits(aired - 1, Math.max(0, matches.indexOf(last)) % aired);
    }

    // Highlights units: recent matches newest first and cycled, so a missed match comes round again; the matches just
    // shown in the post-match show go to the back of the queue. Each is a package and a short block (ads if due, then
    // cardsPerBlock cards), only if the whole unit fits; no package more than highlights.perGap times in the gap (Task
    // 206), the last block filling the rest.
    const recent = (semisOnly ?? finished.slice(-highlights.poolSize).reverse()).filter((m) => clipsOf(m).length > 0);
    const pool = last.stage === 'final' ? recent : [...recent.filter((m) => !group.includes(m)), ...recent.filter((m) => group.includes(m))];
    for (let i = 0; pool.length > 0 && i < pool.length * highlights.perGap; i++) {
      const m = pool[i % pool.length];
      maybePodcast();
      maybeVault(packageOf(m, cursor).length);
      const pkg = packageOf(m, cursor);
      const after = cursor + pkg.length;
      if (after + (after - lastAdEnd >= adGapMs ? breakMs : 0) + blockCardsMs > runInFrom) break;
      add(pkg.length, `highlights · ${m.id}`, () => pkg.seg);
      block({});
    }

    // The podcast and the vault, if their times are still to come, the earlier first: blocks up to it, then it.
    const toPodcast = () => {
      maybePodcast();
      if (podcastDone || !podcastAir || podcastAir.x >= runInFrom) return;
      fillTo(podcastAir.x);
      maybePodcast();
    };
    const toVault = () => {
      while (!vaulted && vaultAt !== null && cursor < vaultAt && cursor + blockLength(cursor) + blockCardsMs <= vaultAt) block({ talk: true });
      maybeVault(Infinity);
    };
    if (podcastAir && vaultAt !== null && vaultAt < podcastAir.x) { toVault(); toPodcast(); } else { toPodcast(); toVault(); }

    // The last block, stretched to the run-in; a talk clip only if it's long enough.
    fillTo(runInFrom);
    runInPieces();
    return pieces;

    /**
     * The night after the off-season show (Task 195; docs/channel.md §19.7), up to the new season's run-in: filler
     * first (recent matches' highlights, the semis first, and studio blocks), then the final re-aired (the trophy lift in its handshakes'
     * place, Tom) and the show repeated as it aired, in turn, as many pairs as fit, so the night ends on the show; then
     * a run of every ad (ads.closingSlates times through the slate, Tom: the night ends on the ads) and the new season's
     * countdown up to the run-in (Task 277b, Tom: in place of a closing studio block, whose cards said the wrong season).
     * @param {Piece[]} show
     */
    function night(show) {
      const m = last;
      const play = reairPlay(m);
      const liftMs = liftLength(live.config.settings.trophyLift);
      const iv = interviewMs(m, reairInterviewMs);
      const finalMs = introMs + lineUpMs + play.ms + liftMs + reairFullTimeMs + iv;
      const showMs = show.length ? show[show.length - 1].until - show[0].from : 0;
      // A block after a unit, at most: an ad break (one is due after any unit of 20 minutes or more), a clip, cards.
      const blockMs = breakMs + clipMs + blockCardsMs;
      const slate = adsFor(live.config.ads.ads, 'off');
      const closingCount = slate.length * ads.closingSlates;
      const closingMs = 2 * bumperMs + closingCount * adMs;
      const closingFrom = runInFrom - countdownMs - closingMs;
      const pairMs = finalMs + blockMs + showMs + blockMs;
      // The last pair's show is followed by the closing ads, not a usual block.
      const pairs = showMs > 0 ? Math.max(0, Math.floor((closingFrom - cursor + blockMs) / pairMs)) : 0;
      // How long the repeats really run (their blocks' talk is sized to its lines, shorter than the most): built once
      // to measure, then undone, so the time to spare goes to the filler before them, not the countdown.
      const saved = { n: pieces.length, cursor, deckState: structuredClone(deckState), clipIndex, lastAdEnd, breaks };
      const trialFrom = closingFrom - (pairs * pairMs - blockMs);
      cursor = trialFrom;
      repeats();
      const repeatsMs = cursor - trialFrom;
      pieces.length = saved.n;
      ({ cursor, deckState, clipIndex, lastAdEnd, breaks } = saved);
      const repeatsFrom = pairs > 0 ? closingFrom - repeatsMs : closingFrom;

      // Filler up to the repeats: the semis' packages (the later first; not the final, which is re-aired), then the
      // playoffs' reels (Task 213, Tom: in place of the last round's packages): goals, saves, scorchers, reelPasses
      // times round, then the semis again; each with a short block, only while the whole unit fits; then a block to fill.
      const playoffs = matches.filter((x) => x.season === m.season && x.stage !== 'regular' && endOf(x) <= end);
      const semis = playoffs.filter((x) => x !== m && clipsOf(x).length > 0).reverse();
      const reelKinds = /** @type {import('./highlights.js').ReelKind[]} */ (Object.keys(highlights.reels));
      /** @type {(() => { length: number, clips: number, seg: (t: number) => Segment, label: string })[]} */
      const units = [
        ...semis.map((x) => () => ({ ...packageOf(x, cursor), label: `highlights · ${x.id}` })),
        ...Array.from({ length: highlights.reelPasses }, () => reelKinds.map((kind) => () => ({ ...reelOf(kind, playoffs, cursor), label: `reel · ${kind}` }))).flat(),
        ...semis.map((x) => () => ({ ...packageOf(x, cursor), label: `highlights · ${x.id}` })),
      ];
      // SEASON REVIEW (OFF THE BALL): first thing, and again before the repeats, the filler leaving room for it.
      const review = podcastEpisodes(live, m.season, ctx).find((e) => e.kind === 'review');
      if (review) podcastHere(review, false, repeatsFrom);
      const reviewMs = review ? podcastPieces(review, true).reduce((sum, x) => sum + x.ms, 0) + breakMs + clipMs + blockCardsMs : 0;
      const fillerUntil = repeatsFrom - reviewMs;
      maybeTour(fillerUntil);
      for (const unit of units) {
        const u = unit();
        // A reel with nothing in it (no scorchers in the playoffs) is left out.
        if (u.clips === 0) continue;
        const after = cursor + u.length;
        if (after + (after - lastAdEnd >= adGapMs ? breakMs : 0) + blockCardsMs > fillerUntil) break;
        add(u.length, u.label, () => u.seg);
        block({});
      }
      if (review && cursor <= fillerUntil) {
        fillTo(fillerUntil);
        podcastHere(review, true, repeatsFrom);
      }
      fillTo(repeatsFrom);

      repeats();

      // The closing ads: the whole slate, in an order of their own (ads.js adOrder, seeded by this gap).
      const gap = `${m.id}|closing`;
      add(bumperMs, 'ads · bumper in', (from, until) => () => ({ kind: 'ads', part: 'bumper_in', ad: 0, brk: 0, gap, next: fixture, from, until }));
      for (let i = 0; i < closingCount; i++) add(adMs, `ads · closing ${i + 1}`, (from, until) => () => ({ kind: 'ads', part: 'ad', ad: i, brk: 0, gap, next: fixture, from, until }));
      add(bumperMs, 'ads · bumper out', (from, until) => () => ({ kind: 'ads', part: 'bumper_out', ad: 0, brk: 0, gap, next: fixture, from, until }));
      // The new season's countdown to the opening (Task 277b), to the run-in.
      add(runInFrom - cursor, 'opening · countdown', (from, until) => () => ({ kind: 'countdown', season: featuredNext?.season ?? m.season + 1, next: featuredNext, from, until }));
      runInPieces();

      /** The final and the show in turn, `pairs` times, from the cursor. */
      function repeats() {
        for (let i = 0; i < pairs; i++) {
          // The final re-aired, the trophy lift where a re-air has its handshakes.
          const parts = /** @type {[ReairPart, number, string][]} */ ([['intro', introMs, 'intro'], ['lineup', lineUpMs, 'lineup'], ['match', play.ms, 'match'], ['handshakes', liftMs, 'trophy lift'], ['full_time', reairFullTimeMs, 'full_time'], ['interview', iv, 'interview']]);
          for (const [part, ms, name] of parts) {
            add(ms, `re-air · ${m.id} · ${name}`, (from, until) => (t) => ({
              kind: 'reair', match: m, part, from, until,
              elapsed: part === 'match' ? play.elapsedAt(t - from) : part === 'intro' || part === 'lineup' ? 0 : timelineOf(m).duration,
              ...(part === 'handshakes' ? { lift: /** @type {const} */ (true) } : {}),
            }), Infinity);
          }
          block({ talk: true });
          // The show again, as it aired: each piece moved along, its words and pictures the same (they're timed from its
          // own start), marked as a repeat.
          const d = cursor - show[0].from;
          for (const p of show) {
            pieces.push({ from: p.from + d, until: p.until + d, label: `repeat · ${p.label}`, seg: (t) => {
              const x = p.seg(t - d);
              return { ...x, from: p.from + d, until: p.until + d, repeat: true, ...('musicFrom' in x && x.musicFrom !== undefined ? { musicFrom: x.musicFrom + d } : {}) };
            } });
          }
          cursor += showMs;
          if (i < pairs - 1) block({ talk: true });
        }
      }
    }

    /** The run-in: the channel's opening once a day, then the tee-up talk. */
    function runInPieces() {
      if (welcome) {
        add(identMs, 'opening · ident', (from, until) => () => ({ kind: 'ident', next: featuredNext, from, until }), Infinity);
        add(welcome.ms, 'opening · welcome', (from, until) => () => ({ ...welcome.seg, from, until }), Infinity);
      }
      if (teeUp) add(preMatchFrom - teeUpFrom, 'talk · tee-up', (from, until) => () => ({ ...teeUp.seg, from, until }), preMatchFrom);
    }
  }

  /**
   * The run-in before a live match, sized back from its pre-match (Task 187): the tee-up as long as its lines need,
   * and once a day before it the ident and the welcome. Their words are drawn as if each had its most length (from
   * `wordsAt`), since where they start depends on how long they are.
   * @param {ReturnType<typeof next>} nx @param {NextFixture | null} featuredNext @param {number} preMatchFrom
   * @param {boolean} withOpening
   */
  function runIn(nx, featuredNext, preMatchFrom, withOpening) {
    /** @param {TalkTopic} topic @param {Partial<Extract<Segment, { kind: 'talk' }>>} extra @param {number} wordsAt @param {number} maxMs */
    const sized = (topic, extra, wordsAt, maxMs) => {
      const seg = talkSeg(topic, { ...extra, wordsAt }, wordsAt, nx.fixture);
      const { script, ms } = sizedTalk(seg, live, ctx, maxMs);
      return { seg: { ...seg, script }, ms };
    };
    const teeUp = nx.fixture ? sized('tee_up', { group: nx.group, next: featuredNext }, preMatchFrom - teeUpMs, teeUpMs) : null;
    const teeUpFrom = preMatchFrom - (teeUp?.ms ?? 0);
    const welcome = withOpening ? sized('welcome', { group: nx.group }, preMatchFrom - teeUpMs - welcomeMs, welcomeMs) : null;
    const runInFrom = welcome ? teeUpFrom - identMs - welcome.ms : teeUpFrom;
    return { teeUp, welcome, teeUpFrom, runInFrom };
  }

  /** @type {Map<string, Piece[]>} Each slot's running order, by the match it follows. */
  const slotCache = new Map();
  /** @param {LiveMatch} last @param {LiveMatch[]} group @param {LiveMatch[]} matches */
  const slotOf = (last, group, matches) => {
    let p = slotCache.get(last.id);
    if (!p) slotCache.set(last.id, (p = withStudioMusic(buildSlot(last, group, matches))));
    return p;
  };

  /**
   * The off-season's music under the studio cards too (Task 211, Tom: long and dry without it): each unbroken run of
   * cards starts the loop from its top studioLeadSeconds in (after the studio jingle, which plays as a run starts),
   * or carries on an off-season run it follows. The desk's talk, ads, packages and re-airs break a run.
   *   Each run plays the next of music.tracks in turn (Task 278h, Tom: as fresh as possible), as musicTrack, the slot
   *   starting from a seeded place in the turn, so every screen hears the same.
   * @param {Piece[]} pieces @returns {Piece[]}
   */
  function withStudioMusic(pieces) {
    const lead = sec(live.config.settings.sound.music.studioLeadSeconds);
    const tracks = live.config.settings.sound.music.tracks.length;
    let turn = createRng(`music|turn|${Number.isFinite(pieces[0]?.from) ? pieces[0].from : 0}`).int(0, tracks - 1) - 1;
    /** @type {number | null} */
    let runFrom = null;
    /** @type {number | null} */
    let lastRun = null;
    /** The run's place in the turn, the next once a new run starts. @param {number} from */
    const trackOf = (from) => {
      if (from !== lastRun) {
        turn++;
        lastRun = from;
      }
      return turn % tracks;
    };
    return pieces.map((p, k) => {
      const seg = p.seg;
      const first = seg(Number.isFinite(p.from) ? p.from : p.until - 1);
      if ('musicFrom' in first && typeof first.musicFrom === 'number') {
        runFrom = first.musicFrom;
        const track = trackOf(runFrom);
        return { ...p, seg: (t) => ({ ...seg(t), musicTrack: track }) };
      }
      if (first.kind !== 'studio') {
        runFrom = null;
        return p;
      }
      // Cards from the epoch (before the first match ever) start the loop there.
      if (runFrom === null || pieces[k - 1].until !== p.from) runFrom = (Number.isFinite(p.from) ? p.from : 0) + lead;
      const from = runFrom;
      const track = trackOf(from);
      return { ...p, seg: (t) => ({ ...seg(t), musicFrom: from, musicTrack: track }) };
    });
  }

  /**
   * Before the first match ever: studio cards timed from the epoch, then the opening and the tee-up.
   * @param {ReturnType<typeof next>} nx
   * @returns {Piece[]}
   */
  function beforeFirst(nx) {
    let p = firstCache.get(nx.kickoff);
    if (!p) firstCache.set(nx.kickoff, (p = withStudioMusic(buildFirst(nx))));
    return p;
  }
  /** @type {Map<number, Piece[]>} beforeFirst's running order, worked out once (its talks are sized from their lines). */
  const firstCache = new Map();
  /** @param {ReturnType<typeof next>} nx @returns {Piece[]} */
  function buildFirst(nx) {
    const preMatchFrom = nx.kickoff - walkOutMs - preMatchMs;
    const featuredNext = nx.group.length > 1 ? rankGroup(nx.group)[0] : nx.fixture;
    const { teeUp, welcome, teeUpFrom, runInFrom: identFrom } = runIn(nx, featuredNext, preMatchFrom, true);
    const welcomeFrom = identFrom + identMs;
    /** @type {Piece[]} */
    const pieces = [{ from: -Infinity, until: identFrom, label: 'cards', seg: (t) => cardsFrom(t, 0, identFrom, nx.fixture) }];
    pieces.push({ from: identFrom, until: welcomeFrom, label: 'opening · ident', seg: () => ({ kind: 'ident', next: featuredNext, from: identFrom, until: welcomeFrom }) });
    if (welcome) pieces.push({ from: welcomeFrom, until: teeUpFrom, label: 'opening · welcome', seg: () => ({ ...welcome.seg, from: welcomeFrom, until: teeUpFrom }) });
    if (teeUp) pieces.push({ from: teeUpFrom, until: preMatchFrom, label: 'talk · tee-up', seg: () => ({ ...teeUp.seg, from: teeUpFrom, until: preMatchFrom }) });
    return pieces;
  }

  /**
   * The running order around a moment: the slot's pieces, or null while a match, its ceremonies or a pre-match is on.
   * @param {number} t
   */
  function context(t) {
    const matches = [...live.matches.values()].sort((a, b) => a.kickoff - b.kickoff || a.slot - b.slot);
    const onAir = matches.filter((m) => m.kickoff <= t && t < endOf(m));
    const finished = matches.filter((m) => endOf(m) <= t).sort((a, b) => endOf(a) - endOf(b));
    const last = finished.at(-1) ?? null;
    return { matches, onAir, last };
  }

  /**
   * @param {number} t  Epoch ms.
   * @returns {Segment}
   */
  function at(t) {
    const { matches, onAir, last } = context(t);
    if (onAir.length > 0) {
      const group = matches.filter((m) => m.kickoff === onAir[0].kickoff);
      const featured = group.length > 1 ? /** @type {LiveMatch} */ (rankGroup(group).find((m) => onAir.includes(m))) : onAir[0];
      return { kind: 'live', match: featured, elapsed: t - featured.kickoff, group };
    }

    const nx = next(t);
    const walkOutFrom = nx.kickoff - walkOutMs;
    const preMatchFrom = walkOutFrom - preMatchMs;
    if (t >= preMatchFrom && nx.fixture) {
      const featured = nx.group.length > 1 ? rankGroup(nx.group)[0] : nx.fixture;
      if (t >= walkOutFrom) return { kind: 'walk_out', fixture: featured, group: nx.group, until: nx.kickoff };
      return { kind: 'pre_match', fixture: featured, group: nx.group, until: walkOutFrom };
    }

    if (!last) return pieceIn(beforeFirst(nx), t).seg(t);
    const group = matches.filter((m) => m.kickoff === last.kickoff);
    const end = endOf(last);
    const handshakeMs = afterWhistleMs(last);
    if (t < end + handshakeMs) return { kind: 'handshakes', match: last, group, until: Math.min(end + handshakeMs, preMatchFrom), ...(last.stage === 'final' ? { lift: true } : {}) };
    return pieceIn(slotOf(last, group, matches), t).seg(t);
  }

  /** The piece on at `t` (binary search). @param {Piece[]} pieces @param {number} t */
  function pieceIn(pieces, t) {
    let lo = 0;
    let hi = pieces.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (pieces[mid].from <= t) lo = mid;
      else hi = mid - 1;
    }
    return pieces[lo];
  }

  /**
   * The rundown's label for what's on at `t`, and when it started and ends (for npm run rundown and the dev panel).
   * @param {number} t
   * @returns {{ label: string, from: number, until: number }}
   */
  function pieceAt(t) {
    const { matches, onAir, last } = context(t);
    if (onAir.length > 0) {
      const m = onAir[0];
      return { label: `live · ${matches.filter((x) => x.kickoff === m.kickoff).map((x) => x.id).join(' ')}`, from: m.kickoff, until: Math.max(...onAir.map(endOf)) };
    }
    const nx = next(t);
    const walkOutFrom = nx.kickoff - walkOutMs;
    const preMatchFrom = walkOutFrom - preMatchMs;
    if (t >= preMatchFrom && nx.fixture) {
      return t >= walkOutFrom ? { label: 'walk-out', from: walkOutFrom, until: nx.kickoff } : { label: `pre-match · ${nx.fixture.id}`, from: preMatchFrom, until: walkOutFrom };
    }
    if (!last) {
      const p = pieceIn(beforeFirst(nx), t);
      return { label: p.label, from: p.from, until: p.until };
    }
    const group = matches.filter((m) => m.kickoff === last.kickoff);
    const end = endOf(last);
    const handshakeMs = afterWhistleMs(last);
    if (t < end + handshakeMs) return { label: last.stage === 'final' ? 'trophy lift' : 'handshakes', from: end, until: end + handshakeMs };
    const p = pieceIn(slotOf(last, group, matches), t);
    return { label: p.label, from: p.from, until: p.until };
  }

  return { at, pieceAt };
}

/** @typedef {ReturnType<typeof createProgramme>} Programme */
