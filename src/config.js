// Loads and validates the config files. Browser-safe: the caller supplies how to read a file,
// so the same loader works with fs in Node and fetch in the browser.
import { arrayOf, bool, check, int, num, obj, oneOf, optional, pattern, plainObject, prob, range, recordOf, str } from './schema.js';
import { BLEND_STATS } from './sim/awards.js';
import { mergeRules } from './sim/rules.js';
import { DAY_TIME, SWITCH_TIME, parseDayTime, sum, withoutComments } from './util.js';

export const CONFIG_FILES = /** @type {const} */ ({
  settings: 'config/settings.json',
  rules: 'data/rules.json',
  ruleChanges: 'data/ruleChanges.json',
  positions: 'data/positions.json',
  regions: 'data/regions.json',
  teams: 'data/teams.json',
  interviews: 'data/interviews.json',
  studio: 'data/studio.json',
  ads: 'data/spots.json',
  commentary: 'data/commentary.json',
  rulebook: 'data/rulebook.json',
  chronicle: 'data/chronicle.json',
  polls: 'data/polls.json',
  decisions: 'data/decisions.json',
  director: 'data/director.json',
  moments: 'data/moments.json',
  tour: 'data/tour.json',
  fanCoins: 'data/fanCoins.json',
  analyst: 'data/analyst.json',
  podcast: 'data/podcast.json',
  voiceLengths: 'assets/voices/lengths.json',
});

/**
 * @typedef {object} Config
 * @property {any} settings   Real-time timing, pacing and the live league (config/settings.json).
 * @property {any} rules      Sport and engine values (data/rules.json): season 1's rules.
 * @property {any} ruleChanges Dated changes to the rules (data/ruleChanges.json; Task 229b): see src/sim/rules.js.
 * @property {any} positions  Positions, attributes and weights (data/positions.json).
 * @property {any} regions    World regions and name pools (data/regions.json).
 * @property {any} teams      The league's teams (data/teams.json).
 * @property {any} interviews Player of the match: scoring weights and canned quotes (data/interviews.json).
 * @property {any} studio     The talk at the desk: the presenters' looks and their lines (data/studio.json).
 * @property {any} ads        The in-universe ads, in the order they play (data/spots.json).
 * @property {any} commentary The commentators and their exclamations (data/commentary.json).
 * @property {any} rulebook   The Rulebook and About panes' words (data/rulebook.json).
 * @property {any} chronicle  The chronicle's thresholds: milestones, notable matches, the records (data/chronicle.json).
 * @property {any} polls      The AUDIENCE pane's polls, dated, with their results once announced (data/polls.json; Task 260).
 * @property {any} decisions  The Director's decisions other than rule changes, dated: legends inducted first
 *   (data/decisions.json; Task 262).
 * @property {any} director   The Director's watch list: measures, bands, levers (data/director.json; Task 263).
 * @property {any} moments    MOMENTS: the kinds, their steps and words, the secrets, SEEN IT ALL's places (data/moments.json).
 * @property {any} tour       The tour: the welcome on a first visit and the steps' words (data/tour.json).
 * @property {any} analyst    The playoff analyst: who sits in, the host, and their lines in the PLAYOFF PREVIEW show (data/analyst.json).
 * @property {any} podcast    OFF THE BALL, the podcast: the pair, their lines, the themes and discussions (data/podcast.json).
 * @property {any} fanCoins   Fan Coins' chants (their tunes and lines), shouts, and FAN BOARD's and the ticker's pictures (data/fanCoins.json).
 * @property {Record<string, number>} voiceLengths  How long each desk and interview clip plays, seconds, by its path
 *   under assets/voices/ without .mp3 (Task 187; written by `npm run voices -- --lengths`).
 */

const dayTime = pattern(DAY_TIME, 'a time like "day 6 20:00"');

const SETTINGS_SCHEMA = obj({
  live: obj({
    mode: oneOf('seed', 'keys'),
    seed: str(),
    looks: str(),
    firstSeasonStarts: pattern(/^\d{4}-\d{2}-\d{2}$/, 'a date like "2026-10-05"'),
    timeZone: str(),
  }),
  match: obj({
    realMinutes: num(1),
    halfTimeRealMinutes: num(0),
    goalPauseSeconds: num(0),
    subPauseSeconds: num(0),
    freeShotPauseSeconds: num(0, 30),
    foulPauseSeconds: num(0, 30),
    pauseAllowanceMinutes: num(0),
    overtimeBreakRealMinutes: num(0),
    shootoutKickRealSeconds: num(0),
  }),
  calendar: obj({ seasonDays: int(2, 28), firstKickoff: dayTime, finalRoundKickoff: dayTime, finalRoundSimultaneous: bool() }),
  playoffs: obj({ kickoffs: arrayOf(dayTime, { minLength: 1 }) }),
  segments: obj({
    preMatchMinutes: num(0),
    walkOutMinutes: num(0),
    handshakeMinutes: num(0),
    postMatchMinutes: num(0),
    fullTimeMinutes: num(0),
    potmSeconds: num(0),
    studioCardSeconds: num(1),
    // The studio cards' decks by phase (Tom's note 11, 2026-10-19; docs/studio-cards.md): every card a deck may hold.
    studioDecks: (() => {
      const deck = arrayOf(oneOf('results', 'upcoming', 'bracket', 'scorers', 'playoff_scorers', 'career', 'spotlight', 'form', 'race', 'assists', 'stops', 'keepers', 'head_to_head',
        'honours', 'new_season', 'payrolls', 'signings', 'last_season', 'roll_of_honour', 'biggest_wins', 'scorchers', 'award_race', 'records_watch', 'rookies', 'final_table',
        'playoff_stats', 'the_draft', 'farewells'), { minLength: 1, unique: true });
      return obj({ earlyDays: int(0, 7), recordsWatchShare: prob(), rookieKeeperStarts: int(0, 50), farewells: int(1, 10), early: deck, late: deck, finalRound: deck, playoffs: deck, afterFinal: deck });
    })(),
    raceFromGamesLeft: int(0, 100),
    cardsPerBlock: int(1, 50),
    championMinutes: num(0),
    offseasonSummaryMinutes: num(0),
  }),
  highlights: obj({ speed: num(0.5, 16), poolSize: int(1), perGap: int(1, 50), maxClips: int(1, 50), leadMs: num(0, 60_000), tailMs: num(0, 60_000), reels: obj({ goals: str(), saves: str(), scorchers: str() }), reelPasses: int(0, 10) }),
  preview: obj({ everyMinutes: num(10, 1440), lastStart: pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "12:00"'), openingSeconds: num(1, 60), cardSeconds: num(5, 120), seasonReelClips: int(1, 60), meetingReelClips: int(1, 60), numberTiles: int(3, 9), analystSeconds: num(5, 300), finalsEveryMinutes: num(10, 1440), reels: obj({ season: str(), meetings: str(), semis: str() }) }),
  animation: obj({
    reactNearMs: num(0, 5000),
    reactFarMs: num(0, 5000),
    runSpeed: num(0.01, 5),
    jogSpeed: num(0.01, 5),
    settleMs: num(1, 5000),
    nearBall: num(0.05, 1.2),
    probeMs: num(300, 30_000),
    holdPassChance: num(0, 1),
    passMs: num(1, 5000),
    passSpeed: num(0.05, 10),
    passMaxMs: num(1, 5000),
    touchChance: num(0, 1),
    touchMinMs: num(0, 5000),
    touchMaxMs: num(0, 5000),
    shotMs: num(1, 5000),
    goalHoldMs: num(0, 10_000),
    burnFlashMs: num(0, 5000),
    kickoffHoldMs: num(0, 10_000),
    keeperTrackMs: num(1, 10_000),
    runChance: num(0, 1),
    goalCelebrateMs: num(0, 60_000),
    cheers: obj({ goal: oneOf('pair', 'group', 'none'), winners: bool() }),
    momentumRing: obj({ pulses: int(1, 10), pulseMs: num(1, 10_000), gapMs: num(0, 10_000), width: int(1, 4), reach: num(0, 40), glowMs: num(0, 10_000), over: bool() }),
    bigKickSpeed: num(0.05, 5),
    ballSpin: obj({ perPixel: num(0, 1), maxSteps: num(0, 60), jumpMs: num(1, 10_000) }),
    shotBend: obj({ share: prob(), min: num(0, 0.5), max: num(0, 0.5), maxShare: prob() }),
    refereeTrackMs: num(1, 10_000),
    refereeSignalMs: num(0, 10_000),
    managerTrackMs: num(1, 30_000),
    shootout: obj({ walkSpeed: num(0.01, 5), standMs: num(0, 10_000), runUpMs: num(0, 5000), returnMs: num(0, 10_000), celebrateMs: num(0, 30_000), bounceMs: num(100, 10_000), bounce: num(0, 0.2), mill: num(0, 0.1) }),
  }),
  poses: obj({
    sampleMs: int(10, 1000),
    walkSpeed: num(0, 1),
    sprintSpeed: num(0.001, 5),
    stepMs: arrayOf(num(10, 5000), { minLength: 2, maxLength: 2 }),
    footSpeed: num(0, 1),
    footMs: arrayOf(num(10, 5000), { minLength: 2, maxLength: 2 }),
    kickMs: num(0, 2000),
    shotKickMs: num(0, 2000),
    diveLeadMs: num(0, 2000),
    diveMs: num(0, 3000),
    kneeMs: num(0, 3000),
    saves: obj({ catch: prob(), parry: prob(), beaten: prob() }),
    turnSpeed: num(0, 1),
    turfStride: int(0, 20),
    turfTurn: int(0, 20),
    turfKick: int(0, 20),
    turfShot: int(0, 20),
    turfDive: int(0, 20),
  }),
  play: obj({ breakaway: obj({ leadMs: num(0, 5000), hang: num(0, 0.5) }), flankChance: num(0, 1), wideOutletChance: num(0, 1), cornerChance: num(0, 1), switchChance: num(0, 1), tether: num(0, 1), lineDrop: num(0, 1), looseTackleChance: num(0, 1), looseReachMin: num(0, 0.5), looseReachMax: num(0, 0.5), tackleReachMin: num(0, 0.5), tackleReachMax: num(0, 0.5), looseMinMs: num(0, 5000), looseMaxMs: num(0, 5000) }),
  reairs: obj({
    offsets: arrayOf(int(1, 100), { minLength: 1, unique: true }),
    poolSize: int(1, 100),
    introSeconds: num(0, 600),
    lineUpSeconds: num(0, 600),
    halfTimeSeconds: num(0, 600),
    handshakeSeconds: num(0, 600),
    fullTimeSeconds: num(0, 600),
    interviewSeconds: num(0, 600),
    finalCelebrateSeconds: num(0, 600),
  }),
  studio: obj({
    matchTalkSeconds: num(0, 600),
    roundTalkSeconds: num(0, 600),
    interviewTeeUpSeconds: num(0, 600),
    wrapUpSeconds: num(0, 600),
    clipSeconds: num(1, 600),
    teeUpSeconds: num(0, 600),
    signoffTalkSeconds: num(0, 600),
    minBlockForTalkSeconds: num(0, 3600),
    clipKinds: arrayOf(oneOf('standings', 'scorers', 'upcoming'), { minLength: 2, unique: true }),
    gestureSeconds: num(0, 30),
    nodEverySeconds: num(0.1, 30),
    interviewQuoteDelaySeconds: num(0, 30),
    interviewPartGapSeconds: num(0, 5),
    lineLeadSeconds: num(0, 30),
    lineHoldSeconds: num(0, 30),
    lineGapSeconds: num(0, 30),
    talkTailSeconds: num(0, 30),
    showMinSeconds: num(0, 30),
    showCharsPerSecond: num(1, 100),
    interviewHoldSeconds: num(0, 60),
  }),
  ads: obj({ perBreak: int(1, 10), adSeconds: num(1, 120), bumperSeconds: num(0, 30), minGapMinutes: num(0, 600), closingSlates: int(0, 5), promoFromShare: num(0, 1), stillMinutes: num(0.1, 1440), dissolveMs: num(0, 5000) }),
  transitions: obj({ sceneMs: num(0, 5000), glassPx: num(0, 200), clipStingMs: num(0, 5000), openStingSeconds: num(0, 30), cutMs: num(0, 5000), cardDissolveMs: num(0, 5000), cardFadeMs: num(0, 5000) }),
  scene: obj({
    bands: int(1, 64),
    slope: num(-4, 4),
    bars: arrayOf(obj({ w: num(1, 480), speed: num(0, 500), offset: num(0, 5000), alpha: num(0, 1) }), { minLength: 1 }),
    lineAt: num(0, 1),
    runPxPerSecond: num(0, 2000),
    runPx: num(0, 480),
    sparkles: int(0, 500),
  }),
  opening: obj({ at: pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "06:00"'), identSeconds: num(0, 600), talkSeconds: num(0, 600), countdownSeconds: num(0, 600) }),
  ceremonies: obj({
    walkOnGapMs: num(0, 10_000),
    gateMs: num(1, 10_000),
    walkOnSeconds: num(0, 600),
    anthemSeconds: num(0, 600),
    warmUpSeconds: num(0, 600),
    warmUpMoveSeconds: num(1, 600),
    breakLineSeconds: num(1, 600),
    handshakeParts: obj({ huddle: prob(), pass: prob(), salute: prob() }),
    handshakePauseMs: num(0, 2000),
    handshakeLineSpeed: num(0.001, 1),
    saluteCheer: obj({ power: prob() }),
  }),
  // The awards on air (Task 191; src/channel/awardShow.js).
  awards: obj({ talkSeconds: num(0, 600), awardSeconds: num(5, 600), order: arrayOf(str(), { minLength: 1, unique: true }), shortlistAt: num(0, 600), secondAt: num(0, 600), winnerAt: num(0, 600), liftAt: num(0, 600) }),
  // The farewells and the draft lottery (Task 192; src/channel/offseasonShow.js).
  farewells: obj({ max: int(0, 10), awardWeight: num(0, 20), perPlayerSeconds: num(5, 600) }),
  lottery: obj({ oddsSeconds: num(0, 600), revealSeconds: num(5, 600), dropAt: num(0, 600), sound: oneOf('rattle', 'drumroll', 'whirr') }),
  // The draft on air (Task 193; src/channel/draftArt.js).
  moves: obj({ maxLines: int(0, 30), perPage: int(1, 12), leadSeconds: num(0, 60), lineSeconds: num(2, 60), cardAt: num(0, 60), tailSeconds: num(0, 60), minSeconds: num(0, 600) }),
  draft: obj({ round1Seconds: num(5, 600), walkAt: num(0, 600), cutAt: num(0, 600), kitAt: num(0, 600), cheerAt: num(0, 600), round2Seconds: num(2, 600), round2NameAt: num(0, 600) }),
  // The trophy lift after the final (Task 190; src/channel/trophyLift.js).
  trophyLift: obj({ celebrateSeconds: num(10, 600), guardSeconds: num(10, 600), anthemSeconds: num(10, 600), liftSeconds: num(10, 600), closeUpAfterSeconds: num(0, 600), stageAfterSeconds: num(0, 600) }),
  captions: obj({ ms: num(500, 30_000), goalMs: num(500, 30_000), recordMs: num(500, 30_000), alertMs: num(500, 30_000), calloutMs: num(200, 10_000), subCalloutMs: num(200, 10_000), quoteCharsPerSecond: num(1, 1000) }),
  updates: obj({ checkSeconds: num(30, 86_400) }),
  switches: recordOf(pattern(SWITCH_TIME, 'a time like "2026-11-02 00:00"')),
  ticker: obj({ pxPerSecond: num(1, 500), results: int(0, 20), upcoming: int(0, 20), goalFlashMs: num(0, 60_000), announcementHours: num(0, 24 * 28) }),
  table: obj({ slideMs: num(0, 5000) }),
  kits: obj({ clashDistance: num(0, 442) }),
  replays: obj({ delayMs: num(0, 30_000), leadMs: num(500, 30_000), tailMs: num(0, 10_000), zoom: num(1, 6), speed: num(0.1, 4), followMs: num(0, 5000), w: int(20, 400), h: int(12, 240) }),
  broadcast: obj({ shiftPx: int(0, 100), slideMs: num(0, 5000), peekMs: num(0, 60_000), awayEnd: obj({ leftPx: int(0, 200), downPx: int(0, 200), leaderAfterPlayed: int(0, 50) }) }),
  // OFF THE BALL, the podcast (docs/podcast.md; src/channel/podcastTalk.js).
  // The clip tool's moments (clips.html, npm run clip): a dev tool's timing.
  clips: obj({ leadSeconds: obj({ goal: num(0, 120), golden: num(0, 120), shootout: num(0, 120) }), tailSeconds: obj({ goal: num(0, 120), golden: num(0, 120), shootout: num(0, 120) }), listMax: int(1, 500) }),
  podcast: obj({ at: pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "18:00"'), repeatAt: pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "03:00"'), discussions: int(1, 4), reelClips: int(1, 40), topicBeatSeconds: num(0, 10), wipeMs: num(0, 3000), pickHours: num(1, 23), interjectionChars: int(1), interjectionShare: num(0, 1), interjectionLevel: num(0, 1), promoHours: num(0, 24) }),
  // FROM THE VAULT (Tom's note 14; src/channel/vault.js).
  vault: obj({ on: bool(), fromSeason: int(2, 1000), at: arrayOf(pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "10:00"')), openSeconds: num(1, 120), sinceSeconds: num(1, 120) }),
  // AROUND THE GROUNDS (Tom's note 14; src/channel/groundsTour.js).
  groundsTour: obj({ on: bool(), visitSeconds: num(5, 600), wipeMs: num(0, 10_000), wipeWidth: num(0.05, 1), nightLevel: num(0, 2), fans: obj({ training: num(0, 1), staff: num(0, 1) }) }),
  // The light by the time of day (Tom's note 14; src/channel/lighting.js).
  lighting: (() => {
    const hhmm = pattern(/^([01]\d|2[0-3]):[0-5]\d$/, 'a time like "17:00"');
    const tint = obj({ around: pattern(/^#[0-9A-Fa-f]{6}$/, 'a colour like "#2a3256"'), ground: pattern(/^#[0-9A-Fa-f]{6}$/, 'a colour like "#7886b8"'), pool: num(0, 1), glow: num(0, 1) });
    return obj({ on: bool(), dayFrom: hhmm, duskFrom: hhmm, nightFrom: hhmm, dawnFrom: hhmm, easeMinutes: num(0, 120), strength: num(0, 1), dusk: tint, night: tint });
  })(),
  crowd: obj({ base: num(0, 1), attack: num(0, 1), awayAttack: num(0, 1), heat: num(0, 1), breakaway: num(0, 1), bigStage: num(0, 1), reair: num(0, 1), breaks: num(0, 1), ceremony: num(0, 1), dipLevel: num(0, 1), dipHoldSeconds: num(0, 60), dipReturnSeconds: num(0.1, 60), quietAfterSeconds: num(0, 60), quietFadeSeconds: num(0.1, 60), quietLevel: num(0, 1), quietReturnSeconds: num(0.1, 60), fill: obj({ preMatchFrom: num(0, 1), preMatchTo: num(0, 1), walkOutFull: num(0.01, 1), handshakeLosers: num(0, 1), handshakeOthers: num(0, 1), losersGoneAt: num(0.01, 1), reairIntro: num(0, 1), fadeMs: num(0, 10_000) }) }),
  sound: obj({
    master: num(0, 1),
    resume: obj({ fadeInMs: num(0, 5000), crowd: num(0, 1), hiddenFadeMs: num(0, 5000), switchLevel: num(0, 1), switchReturnMs: num(0, 10_000), hush: oneOf('roar', 'murmur', 'both', 'none'), hushHoldMs: num(0, 10_000), hushFadeMs: num(0, 10_000) }),
    // Task 278h: the tracks the music runs take in turn.
    music: obj({ tracks: arrayOf(oneOf('synth', 'pulse', 'pulseB', 'pulseC', 'pulseD', 'chillhop', 'tropical'), { minLength: 1 }), fadeInMs: num(0, 10_000), fadeOutMs: num(0, 10_000), lotteryLevel: num(0, 1), studioLeadSeconds: num(0, 30), preRollSeconds: num(0, 30) }),
    levels: obj(Object.fromEntries(['whistle', 'kick', 'shot', 'net', 'save', 'post', 'block', 'burn', 'sub', 'roar', 'groan', 'ooh', 'applause', 'jeer', 'anthem', 'sting', 'murmur', 'chant', 'whoosh', 'swish', 'jingle', 'ident', 'fire', 'commentary', 'speech', 'music', 'lottery', 'effect'].map((k) => [k, num(0, 1)]))),
    // The ident's fire (Task 249): which of the three.
    identFire: oneOf('crackle', 'torch', 'comet'),
    // Task 278b: heavy sounds rendered ahead and played as recordings (phones).
    prerender: obj({ minNodes: int(1, 100_000), variants: int(1, 50), roarSizes: int(1, 20), cacheMB: num(1, 500), crowdRate: int(8000, 96_000), lateSeconds: num(0, 10) }),
    latency: oneOf('interactive', 'balanced', 'playback'),
    // Phones: every sound started this far ahead on the audio clock (Firefox lost short sounds' starts).
    ahead: num(0, 1),
    // The nudge to turn sound on gives up after this long (Tom, 2026-10-14).
    promptSeconds: num(0, 600),
    // Phones: every synthesized sound recorded ahead (recordings.js).
    recordings: obj({ enabled: bool(), variants: int(1, 50), crowdVariants: int(1, 50), roarSizes: int(1, 20), kickLevels: int(2, 20), shotPowers: arrayOf(num(0, 1), { minLength: 1 }), rate: int(8000, 96_000), crowdRate: int(8000, 96_000), bitrate: int(16, 320) }),
  }),
  commentary: obj({ turnoverGapSeconds: num(0, 60), holdSeconds: num(1, 60), delayMs: num(0, 5000), afterWhistleMs: num(0, 10_000), passRun: int(2, 50), minGapSeconds: num(0, 60), followGapSeconds: num(0, 60), goalLevels: obj({ home: num(0, 1), away: num(0, 1) }), duckLevel: num(0, 1), duckFadeMs: num(0, 2000), breathMs: num(0, 2000) }),
  chronicle: obj({ offseasonAiredMinutes: num(0, 24 * 60), latestOffseasonDays: num(0, 7) }),
  audience: obj({ endpoint: str(), service: str(), noteMaxChars: int(1, 5000), noteCooldownSeconds: num(0, 3600), helloMinutes: num(1, 120), watchingMinutes: num(1, 240), watchingTicker: bool(), donateUrl: str() }),
  moments: obj({ noticeSeconds: num(1, 30), noticeGapSeconds: num(0, 30), frameGapSeconds: num(0.1, 60), startGraceSeconds: num(0, 600), pieceGraceSeconds: num(0, 60), placesSeconds: num(0.1, 60), storageKey: str() }),
  fanCoins: obj({ enabled: bool(), storageKey: str(), frameGapSeconds: num(0.1, 60), graceSeconds: num(0, 600), offseasonMinutes: num(0.1, 60), liveMinutes: num(0.1, 60), studioMinutes: num(0.1, 120), dailyCap: int(1), prices: obj({ ticker: int(1), chant: int(1), flag: int(1), screen: int(1), shout: int(1) }), shoutSeconds: num(1, 60), tickerMinutes: num(0, 1440), screenMinutes: num(0, 1440), chantEverySeconds: num(5, 3600), plusSeconds: num(0.2, 10),
    // Version 2 (shared; docs/channel.md §29.6): the queues, the check-ins and the feed.
    shared: obj({ queueMax: int(1, 50), checkInSeconds: num(10, 600), feedSeconds: num(5, 300), feedCacheSeconds: num(0, 120), matchWindowMinutes: num(10, 240), bankMinutes: num(1, 1440), noticeSeconds: num(1, 120), afterSlideSeconds: num(0, 10), requestSeconds: num(2, 120), replayCacheHours: num(0, 168) }) }),
});

const contestShape = { scale: num(0.1), bias: num(), pMin: prob(), pMax: prob() };
const positionCounts = recordOf(int(0));

const RULES_SCHEMA = obj({
  match: obj({
    halfMinutes: num(1),
    overtimeMinutes: num(1),
    actionSeconds: range(0.5, 60),
    breakawaySeconds: range(0.5, 60),
    maxSubstitutions: int(0),
    homeBonus: num(0, 20),
    shorthandedPenalty: num(0, 50),
  }),
  heat: obj({
    burnSeconds: num(1),
    warmAt: num(0, 100),
    hotAt: num(0, 100),
    warmPenalty: num(0, 50),
    hotPenalty: num(0, 50),
    hotPower: num(0, 50),
    hotAccuracy: num(0, 50),
  }),
  momentum: obj({ bonus: num(0, 20), seconds: num(1, 600), withBall: bool() }),
  tactics: obj({
    recycleBase: prob(),
    advancePaceWeight: num(0, 2),
    shootBase: prob(),
    shootTempo: prob(),
    shootPerHeatStage: prob(),
    openShotChance: prob(),
    workItQuality: num(0, 50),
    contestBase: prob(),
    contestAggression: prob(),
    pressFactor: prob(),
    restartPressFactor: prob(),
    foulBase: prob(),
    foulAggression: prob(),
    freeShotAccuracyBonus: num(0, 50),
    shootoutAccuracyBonus: num(0, 50),
    parryChance: prob(),
  }),
  contests: obj({
    advance: obj(contestShape),
    block: obj(contestShape),
    onTarget: obj({ ...contestShape, baseline: num(1, 99) }),
    save: obj(contestShape),
    looseBall: obj(contestShape),
    breakaway: obj(contestShape),
  }),
  fatigue: obj({ ratePerMinute: num(0, 1), keeperRate: prob(), maxFade: prob(), subThreshold: prob(), aggressionRate: num(0, 2), aggressionRelief: num(0, 2) }),
  injuries: obj({
    chancePerMatch: prob(),
    fatigueMultiplier: num(0),
    severity: arrayOf(
      obj({ weight: num(0), minMatches: int(1), maxMatches: int(1), seasonEnding: bool() }),
      { minLength: 1 },
    ),
  }),
  points: obj({ win: int(0), draw: int(0), loss: int(0) }),
  tiebreakers: arrayOf(
    oneOf('points', 'goalDifference', 'goalsFor', 'h2hPoints', 'h2hGoalDifference', 'lots'),
    { minLength: 1, unique: true },
  ),
  playoffs: obj({ teams: oneOf(2, 4), shootoutKicks: int(1) }),
  roster: obj({ size: int(1), matchday: int(1), lineup: positionCounts, minimums: positionCounts, backupKeeperStarts: range(0, 13, true), localBonus: num(0, 50), styleWeight: num(0, 5), rookieStarters: int(0, 5) }),
  reserves: obj({ name: str(), rightsSeasons: int(1), playingTimeShare: prob(), callUpMargin: num(0, 50) }),
  motives: obj({
    agePerSeason: num(0, 1), pivotAge: num(16, 40), homeBias: num(-3, 3), winningPremium: num(0, 1), homePremium: num(0, 1),
    familiarity: num(0, 1), offerFloor: prob(), overMarket: obj({ roomShare: prob(), premium: num(0, 1), fromWage: int(0) }),
  }),
  finances: obj({
    cap: int(1), minWage: int(1), wageAt60: num(1), wagePerPoint: num(1, 2), maxContractShare: prob(), upgradeMargin: num(0, 50), rookieSeasons: int(1, 10),
    rookieScale: obj({ first: int(1), last: int(1) }),
    contractSeasons: arrayOf(obj({ maxAge: int(16, 99), min: int(1, 10), max: int(1, 10) }), { minLength: 1 }),
  }),
  draft: obj({
    rounds: int(1),
    extraProspects: int(0),
    lotteryWeights: arrayOf(num(0), { minLength: 1 }),
    laterRounds: oneOf('lottery', 'table'),
    scoutingNoise: num(0),
    potentialWeight: prob(),
    needBonus: num(0, 50),
    statNeed: obj({ bonus: num(0, 50), freeAgency: bool(), attack: arrayOf(str()), defence: arrayOf(str()) }),
    prospectAge: range(14, 30, true),
    prospectOverall: range(1, 99),
    potential: obj({ mean: num(1, 99), sd: num(0), min: num(1, 99), max: num(1, 99) }),
    headliners: arrayOf(obj({ overall: range(1, 99), potential: range(1, 99, true) })),
  }),
  development: obj({
    growthFraction: prob(),
    noise: num(0),
    playingTimeBonus: prob(),
    peakAge: obj({ outfield: range(18, 40, true), keeper: range(18, 40, true) }),
    plateauYears: int(0),
    decline: obj({ base: num(0), perYear: num(0), physicalMultiplier: num(0), mentalMultiplier: num(0) }),
    attributeGroups: obj({ physical: arrayOf(str(), { unique: true }), mental: arrayOf(str(), { unique: true }) }),
  }),
  retirement: obj({
    centerAge: num(18, 60),
    keeperCenterAge: num(18, 60),
    steepness: num(0.01),
    maxAge: int(18, 60),
    replacementOverall: num(1, 99),
    belowReplacementBoost: prob(),
    freeAgentSeasons: int(1),
    freeAgentBoost: prob(),
  }),
  // The season's awards (Task 188; src/sim/awards.js).
  awards: obj({
    list: arrayOf(obj({
      id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'),
      name: str(),
      stat: oneOf('goals', 'assists', 'scorchers', 'saves', 'tackles', 'blocks', 'stops', 'savePct', 'rookieBlend'),
      positions: optional(arrayOf(str(), { minLength: 1, unique: true })),
      minFacedShare: optional(prob()),
      oneATeam: optional(bool()),
      // The Spark (Task 252): rookies only, each against the regulars at their position on a blend of its stats.
      blend: optional(recordOf(recordOf(num(0, 10)))),
      minMinutesShare: optional(prob()),
    }), { minLength: 1 }),
  }),
  league: obj({
    initialPotentialMean: num(1, 99),
    teamStrengthSpread: num(0, 30),
    initialAge: range(14, 45, true),
    initialFreeAgents: int(0),
    freeAgentPoolMax: int(1),
    homeRegionChance: prob(),
  }),
  generation: obj({
    playerSpread: num(0, 30),
    freeAgentGap: num(0, 50),
    youthGapPerYear: num(0, 20),
    initialDeclinePerYear: num(0, 20),
    weightedSd: num(0, 30),
    unweightedGap: num(0, 60),
    unweightedSd: num(0, 30),
    minOverall: num(1, 99),
    specialists: recordOf(obj({ position: str(), othersMean: num(1, 99), othersSd: num(0, 30) })),
  }),
});

const POSITIONS_SCHEMA = obj({
  positions: arrayOf(str(), { minLength: 1, unique: true }),
  keeper: str(),
  attributes: arrayOf(str(), { minLength: 1, unique: true }),
  overallWeights: recordOf(recordOf(num(0, 1))),
  carrierWeights: obj({
    defensive: recordOf(num(0)),
    middle: recordOf(num(0)),
    attacking: recordOf(num(0)),
  }),
});

const nameList = arrayOf(pattern(/^[A-Za-z][A-Za-z' -]*$/, 'a name in plain ASCII letters'), { minLength: 10, unique: true });

const REGIONS_SCHEMA = obj({
  regions: arrayOf(
    obj({ id: str(), name: str(), blurb: str(), weight: num(0), firstNames: nameList, womensNames: arrayOf(str()), lastNames: nameList }),
    { minLength: 1 },
  ),
});

const colour = pattern(/^#[0-9A-Fa-f]{6}$/, 'a colour like "#1FA3A3"');

const TEAMS_SCHEMA = obj({
  teams: arrayOf(
    obj({
      id: pattern(/^t-[a-z0-9-]+$/, 'an id like "t-gulls"'),
      name: str(),
      shortName: str(),
      abbr: pattern(/^[A-Z]{3}$/, 'three capital letters'),
      city: str(),
      // The home ground's name (Tom, 2026-10-19; note 14): presentation only.
      ground: str(),
      region: str(),
      colours: obj({ primary: colour, secondary: colour }),
      crest: obj({ shape: oneOf('shield', 'circle', 'diamond', 'banner'), icon: str() }),
      personality: obj({ tempo: prob(), aggression: prob() }),
      blurb: str(),
      anthem: str(),
    }),
    { minLength: 2 },
  ),
});

const quoteList = arrayOf(str(), { minLength: 1 });
const quotesByResult = obj({ win: quoteList, draw: quoteList, loss: quoteList });

const INTERVIEWS_SCHEMA = obj({
  voices: recordOf(obj({ man: obj({ name: str(), voice: str() }), woman: obj({ name: str(), voice: str() }) })),
  potm: obj({
    weights: obj({ goals: num(), scorchers: num(), assists: num(), saves: num(), tackles: num(), shotsOnTarget: num(), burns: num(), fouls: num() }),
    winBonus: num(0),
  }),
  quotes: obj({ scorer: quotesByResult, keeper: quotesByResult, other: quotesByResult }),
  // Talk that remembers (Task 245): a reaction, then a sentence for a fact.
  reactions: obj({ win: arrayOf(str(), { minLength: 1 }), draw: arrayOf(str(), { minLength: 1 }), loss: arrayOf(str(), { minLength: 1 }) }),
  facts: recordOf(arrayOf(obj({ say: str(), results: arrayOf(oneOf('win', 'draw', 'loss'), { minLength: 1 }) }), { minLength: 1 })),
  // The fact strip's words (Task 247a), by the same key as facts.
  strip: recordOf(str()),
});

const hex = pattern(/^#[0-9A-Fa-f]{6}$/, 'a colour like "#1FA3A3"');
/** The season's stages a desk line's way can be kept out of (its `not`; studio.js `TalkStage`). */
const TALK_STAGES = ['season', 'settled', 'semis', 'finalSet', 'done'];
const lineKind = obj({ gesture: oneOf('talk', 'open', 'point', 'laugh', 'both'), subject: optional(str()), namedShare: optional(prob()), ways: arrayOf(obj({ say: str(), show: optional(str()), not: optional(arrayOf(oneOf(...TALK_STAGES), { minLength: 1 })) }), { minLength: 1 }) });
/** A tune on one of the anthems' instruments: the ads' jingles, and the studio's (Task 137). */
const JINGLE = obj({ instrument: oneOf('brass', 'organ', 'bells'), bpm: num(30, 300), at: num(0, 60), notes: arrayOf(obj({ note: optional(int(24, 108)), with: optional(arrayOf(int(24, 108))), rest: optional(bool()), beats: num(0.05, 16) }), { minLength: 1 }) });

const STUDIO_SCHEMA = obj({
  looks: obj({ jackets: arrayOf(hex, { minLength: 1 }), ties: arrayOf(hex, { minLength: 1 }), hair: arrayOf(hex, { minLength: 1 }), hairStyles: arrayOf(oneOf('short', 'long', 'bun'), { minLength: 1 }) }),
  presenters: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), name: str(), look: int(0, 1), woman: optional(bool()), voice: str() }), { minLength: 2, maxLength: 2 }),
  jingle: JINGLE,
  // The bumper sound (Task 168): into an ad break and out of it.
  bumpers: obj({ in: JINGLE, out: JINGLE }),
  spokenTeam: pattern(/\{name\}/, 'a pattern with {name}, like "the {name}"'),
  sayAs: optional(recordOf(str())),
  // Task 246a: ways with {surname} on air (once their clips are made).
  playerNames: bool(),
  lines: recordOf(lineKind),
});

/** The ads (Task 105): drawn scenes in src/channel/spotBrands.js and spotLeague.js, a jingle each on an anthem instrument. */
const ADS_SCHEMA = obj({
  ads: arrayOf(obj({
    id: str(), brand: str(), product: str(), region: str(), tagline: str(),
    colours: arrayOf(hex, { minLength: 2 }),
    scene: oneOf('caravan_cola', 'tideline', 'foundry_fuel', 'ironvale', 'velours', 'red_dune', 'gullwing', 'maison_dore', 'steamvale', 'sandglass', 'brinestone', 'orrery_bank', 'ember', 'almanac', 'league_shop', 'tickets', 'season_tickets', 'playoffs_promo'),
    jingle: JINGLE,
    // Task 205: the ad's small sounds (musicRecipes.js effectLayers), each at its moment (seconds into the ad), under the jingle.
    effects: optional(arrayOf(obj({ effect: str(), at: num(0, 30), gain: optional(num(0, 2)) }))),
  }), { minLength: 1 }),
});

/** Commentary (Task 123): one commentator per match, an exclamation at key moments. */
const COMMENTARY_SCHEMA = obj({
  commentators: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), name: str(), engine: oneOf('kokoro', 'elevenlabs'), voice: str(), speed: num(0.5, 2), onAir: bool() }), { minLength: 1 }),
  playoffs: str(),
  // voices: only these commentators speak the line (Task 149: the playoffs' lines are the Announcer's alone). onAir
  // false: never called until its clips are made (Task 257's new lines, until Task 258's batch). warm: a holding line
  // said only once the heat meter is Warm or Hot (Tom, 2026-10-18).
  lines: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), text: str(), say: str(), voices: optional(arrayOf(str(), { minLength: 1 })), onAir: optional(bool()), warm: optional(bool()) }), { minLength: 1 }),
  // onAir false: not called yet (its clips aren't made), Task 149.
  moments: obj(Object.fromEntries(['goal', 'scorcher', 'save', 'block', 'post', 'wide', 'burn', 'breakaway', 'kickoff', 'second_half', 'half_time', 'half_time_level', 'full_time', 'full_time_level', 'passing',
    'tackle', 'steal', 'holding', 'foul', 'full_time_semi', 'full_time_final', 'golden_goal', 'overtime'].map((k) => [k, obj({ chance: prob(), rate: optional(prob()), onAir: optional(bool()), lines: arrayOf(str(), { minLength: 1 }) })]))),
  // The scorer's surname (Task 247b): who says it, how often, and the lines (say with {surname}; or of another line's
  // clips, then one of the commentator's own lines, joined with no gap).
  names: obj({
    onAir: bool(), voices: arrayOf(str(), { minLength: 1 }), share: prob(),
    lines: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), say: optional(str()), of: optional(str()), then: optional(str()), moments: arrayOf(oneOf('goal', 'scorcher', 'save'), { minLength: 1 }) }), { minLength: 1 }),
  }),
});

/** The Rulebook and About (Task 163): {fact} blanks are filled by src/channel/rulebook.js. */
const RULEBOOK_SCHEMA = obj({
  rulebook: obj({
    intro: str(),
    sections: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), tab: str(), title: str(), rules: arrayOf(str(), { minLength: 1 }) }), { minLength: 1 }),
  }),
  about: obj({ tab: str(), small: int(0, 10), paragraphs: arrayOf(str(), { minLength: 1 }) }),
  // About's guide (Task 172): icon, a button's (the row below the side panel's, or the scorebug's sound and layout).
  guide: obj({
    tab: str(),
    sections: arrayOf(obj({
      title: str(),
      items: arrayOf(obj({ text: str(), icon: optional(oneOf('sound', 'layout', 'guide', 'rulebook', 'chronicle', 'audience', 'about')), chip: optional(str()), chipKind: optional(oneOf('live', 'replay', 'next')), heat: optional(bool()), momentum: optional(bool()) }), { minLength: 1 }),
    }), { minLength: 1 }),
  }),
});

const CHRONICLE_SCHEMA = obj({
  milestones: obj({ goals: int(1), assists: int(1), appearances: int(1), saves: int(1), stops: int(1) }),
  notableMatch: obj({ goals: int(1), assists: int(1), saves: int(1) }),
  records: obj({ listLength: int(1, 100), seasonMinFaced: int(0), careerMinFaced: int(0) }),
  latest: obj({ matchGoals: int(1), matchAssists: int(1), matchSaves: int(1), winRun: int(2), winlessRun: int(2), appearancesFrom: int(1) }),
  history: obj({ droughtSeasons: int(2), recordsFrom: int(1) }),
  careerCard: obj({ minSeasons: int(1), milestoneWithin: num(0, 1) }),
  standing: obj({ starShare: num(0, 1), starterShare: num(0, 1), risingAge: int(16, 40), veteranYears: int(0, 20) }),
  legends: obj({ goals: int(1), assists: int(1), saves: int(1), stops: int(1), awards: int(1), cups: int(1), regularShare: num(0, 1) }),
  facts: obj({
    lateShare: num(0, 1), headToHeadRun: int(2), winRun: int(2), winlessRun: int(2), inARow: int(2), finalDrought: int(2), cupDrought: int(2),
    dynastyCups: int(2), dynastySeasons: int(2), injuryMatches: int(1), oldClubSeasons: int(1), deskFrom: num(0, 100), haulGoals: int(2), comebackFrom: int(1),
    lastMatch: obj({ chance: num(0, 1), seasons: int(1), appearances: int(1) }),
    weights: obj(Object.fromEntries([
      'final_rematch', 'head_to_head_ended', 'head_to_head_run', 'win_run', 'winless_ended', 'first_final', 'final_drought_ended',
      'finals_in_a_row', 'first_cup', 'cup_drought_ended', 'cups_in_a_row', 'dynasty', 'first_goal', 'milestone', 'record',
      'back_from_injury', 'old_club', 'likely_last', 'one_more_season', 'scorcher_decider', 'momentum_decider', 'late_decider', 'goal_haul', 'comeback',
    ].map((k) => [k, num(0, 100)]))),
  }),
});

// When a decision is announced (Task 262; docs/director.md §3): a season and a day time in it, like the calendar's.
const announcedAt = obj({ season: int(1), at: dayTime });

// Each change's `changes` is a partial data/rules.json, checked once merged (validateConfig). Never announced on its own
// (Task 265, Tom: upkeep is quiet); an announcement is a decision of its own.
const RULE_CHANGES_SCHEMA = obj({
  changes: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), season: int(2), reason: str(), changes: plainObject() })),
});

// The Director's other decisions (Task 262; docs/director.md §6), checked further in checkDecisions. A legend's
// induction (season, playerId, reason): logged as `induction` at the start of its season, like a rule change. An
// announcement (Task 265: headline for the ticker, words for UPDATES, perhaps a roadmap idea): news only, never logged.
const DECISIONS_SCHEMA = obj({
  decisions: arrayOf(obj({
    id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'),
    kind: oneOf('induction', 'announcement'),
    announced: announcedAt,
    season: optional(int(2)),
    playerId: optional(str()),
    reason: optional(str()),
    headline: optional(str()),
    words: optional(str()),
    roadmap: optional(pattern(/^[a-z0-9_]+$/, 'a roadmap idea\'s id')),
  })),
});

// The AUDIENCE pane's polls (Task 260): checked further in checkPolls.
const POLLS_SCHEMA = obj({
  polls: arrayOf(obj({
    id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'),
    question: str(),
    options: oneOf('teams'),
    season: int(1),
    opens: dayTime,
    closes: dayTime,
    result: optional(obj({ announced: announcedAt, votes: recordOf(int(0)) })),
  })),
});

// The Director's watch list (Task 263; data/director.json, docs/director.md §7).
const DIRECTOR_SCHEMA = obj({
  watchers: arrayOf(obj({
    id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'),
    measure: oneOf('goalsPerMatch', 'scorcherShare', 'burnsPerMatch'),
    band: arrayOf(num(), { minLength: 2, maxLength: 2 }),
    seasons: int(1, 20),
    aim: num(),
    lever: obj({ path: pattern(/^[a-zA-Z]+(\.[a-zA-Z]+)+$/, 'a dotted path in data/rules.json'), step: num(0), perStep: num(), maxSteps: int(1, 10), digits: int(0, 6) }),
    reasons: obj({ low: str(), high: str() }),
  })),
  check: obj({ leagues: int(1, 20), seasons: int(1, 100) }),
});

// MOMENTS (Milestone 5¾; docs/channel.md §25): checked further in checkMoments.
const MOMENTS_SCHEMA = obj({
  groups: arrayOf(str(), { minLength: 1, unique: true }),
  kinds: arrayOf(obj({
    id: oneOf('goal', 'scorcher', 'burn', 'stop', 'hat_trick', 'first_minute', 'clean_sheet', 'big_win', 'record', 'interview', 'ad_break', 'whole_match', 'day'),
    group: str(),
    name: str(),
    seen: str(),
    first: str(),
    short: optional(str()),
    row: optional(str()),
    steps: arrayOf(int(1), { minLength: 1, unique: true }),
    byTeam: optional(oneOf('goals', 'matches')),
  }), { minLength: 1 }),
  secrets: arrayOf(obj({
    id: oneOf('nil_nil', 'last_minute', 'hundred_stops', 'golden_goal', 'every_team', 'season_ends', 'seven_days', 'both_ways', 'seen_it_all'),
    name: str(),
    how: str(),
  })),
  lastMinuteWinnerMinutes: num(0, 60),
  firstMinuteGoalMinutes: num(0, 60),
  bigWinMargin: int(1),
  stopsMatch: int(1),
  sevenDays: int(2, 365),
  places: arrayOf(str(), { minLength: 1, unique: true }),
});

// The tour (Milestone 5⅞; docs/channel.md §26).
// The playoff analyst (the big matches promoted, 2026-10-17): the pick among the candidates, the host (a presenter in
// data/studio.json), and the lines as data/studio.json's, each with who says it.
const ANALYST_SCHEMA = obj({
  pick: str(),
  host: str(),
  candidates: arrayOf(obj({
    id: str(), name: str(), about: str(), voice: optional(str()),
    look: obj({ jacket: str(), tie: str(), skin: int(0, 3), hair: str(), style: oneOf('short', 'long', 'bun'), woman: optional(bool()) }),
  }), { minLength: 1 }),
  bits: plainObject(),
  lines: recordOf(obj({
    who: oneOf('host', 'analyst'),
    gesture: oneOf('open', 'point', 'laugh', 'both', 'talk'),
    subject: optional(str()),
    when: optional(str()),
    ways: arrayOf(obj({ say: str(), show: optional(str()) }), { minLength: 1 }),
  })),
});

// OFF THE BALL, the podcast (2026-10-20; docs/podcast.md): the pair, the hooks' lines as data/studio.json's (each with
// who says it), the themes and their discussions (fixed lines, one clip each), the interjections.
const PODCAST_GESTURE = oneOf('open', 'point', 'laugh', 'both', 'talk', 'nod');
const PODCAST_WHO = oneOf('tamsin', 'samir');
const PODCAST_PUNDIT = obj({
  name: str(), seat: oneOf('left', 'right'), role: str(), region: str(), voice: str(),
  look: obj({ jacket: str(), tie: str(), skin: int(0, 3), hair: str(), style: oneOf('short', 'long', 'bun'), woman: optional(bool()) }),
});
const PODCAST_SCHEMA = obj({
  show: str(),
  pair: obj({ tamsin: PODCAST_PUNDIT, samir: PODCAST_PUNDIT }),
  episodes: plainObject(),
  topics: plainObject(),
  lines: recordOf(obj({
    who: PODCAST_WHO,
    gesture: PODCAST_GESTURE,
    subject: optional(str()),
    when: optional(str()),
    ways: arrayOf(obj({ say: str(), show: optional(str()) }), { minLength: 1 }),
  })),
  themes: recordOf(obj({ hooks: arrayOf(str(), { minLength: 1 }), discussions: arrayOf(str(), { minLength: 1 }) })),
  discussions: recordOf(obj({
    title: str(),
    needs: optional(oneOf('poll')),
    lines: arrayOf(obj({ who: PODCAST_WHO, gesture: PODCAST_GESTURE, say: str(), tag: optional(str()) }), { minLength: 2 }),
  })),
  interjections: obj({ tamsin: arrayOf(str(), { minLength: 1 }), samir: arrayOf(str(), { minLength: 1 }) }),
});

const TOUR_SCHEMA = obj({
  welcome: obj({ title: str(), text: str(), take: str(), skip: str(), small: str() }),
  steps: arrayOf(obj({
    target: oneOf('scorebug', 'layout', 'side', 'schedule', 'audience', 'info'),
    title: str(),
    text: str(),
    notice: optional(bool()),
    coins: optional(bool()),
  }), { minLength: 1 }),
  // The phone's own steps (the tour, round 2): its buttons in the bands.
  phone: obj({
    steps: arrayOf(obj({
      target: oneOf('scorebug', 'buttons', 'audience', 'close'),
      title: str(),
      text: str(),
      notice: optional(bool()),
      coins: optional(bool()),
    }), { minLength: 1 }),
  }),
});

// Fan Coins (docs/channel.md §29): a tune's syllable is "vowel note seconds" ("!vowel" shouted), "* seconds" (a clap) or "- seconds" (a breath).
const SYLLABLE = pattern(/^(!?(ah|eh|oh|oo) -?\d+|[*-]) \d*\.?\d+$/,'a syllable like "ah 0 0.42", "!eh 2 0.3" (shouted), "* 0.25" or "- 0.15"');
const FAN_COINS_SCHEMA = obj({
  chants: arrayOf(obj({
    id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'),
    words: str(),
    tune: optional(arrayOf(SYLLABLE, { minLength: 1 })),
    lines: arrayOf(obj({ words: str(), syllables: int(1) }), { minLength: 1 }),
  }), { minLength: 1 }),
  pictures: arrayOf(obj({ id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), words: str() }), { minLength: 1 }),
  teamWords: pattern(/\{team\}/, 'words with {team} in them'),
  shouts: arrayOf(str(), { minLength: 1 }),
});

const SCHEMAS = {
  settings: SETTINGS_SCHEMA,
  rules: RULES_SCHEMA,
  ruleChanges: RULE_CHANGES_SCHEMA,
  positions: POSITIONS_SCHEMA,
  regions: REGIONS_SCHEMA,
  teams: TEAMS_SCHEMA,
  interviews: INTERVIEWS_SCHEMA,
  studio: STUDIO_SCHEMA,
  ads: ADS_SCHEMA,
  commentary: COMMENTARY_SCHEMA,
  rulebook: RULEBOOK_SCHEMA,
  chronicle: CHRONICLE_SCHEMA,
  polls: POLLS_SCHEMA,
  decisions: DECISIONS_SCHEMA,
  director: DIRECTOR_SCHEMA,
  moments: MOMENTS_SCHEMA,
  tour: TOUR_SCHEMA,
  fanCoins: FAN_COINS_SCHEMA,
  analyst: ANALYST_SCHEMA,
  podcast: PODCAST_SCHEMA,
  voiceLengths: recordOf(num(0, 60)),
};

/** Thrown when config files can't be read or don't validate. `errors` lists every problem found. */
export class ConfigError extends Error {
  /** @param {string[]} errors */
  constructor(errors) {
    super(`Invalid config (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n  - ${errors.join('\n  - ')}`);
    this.name = 'ConfigError';
    this.errors = errors;
  }
}

/**
 * Validate a parsed config. Checks each file's shape first, then rules that span fields or files.
 * @param {Config} config
 * @returns {string[]} Errors, each prefixed with its file. Empty if valid.
 */
export function validateConfig(config) {
  /** @type {string[]} */
  const errors = [];
  for (const name of /** @type {(keyof typeof CONFIG_FILES)[]} */ (Object.keys(CONFIG_FILES))) {
    for (const e of check(config[name], SCHEMAS[name])) errors.push(`${CONFIG_FILES[name]} → ${e}`);
  }
  // Cross-checks assume every field exists, so only run them on well-shaped files.
  if (errors.length === 0) errors.push(...crossCheck(config));
  if (errors.length === 0) errors.push(...checkRuleChanges(config));
  if (errors.length === 0) errors.push(...checkPolls(config));
  if (errors.length === 0) errors.push(...checkDecisions(config));
  if (errors.length === 0) errors.push(...checkMoments(config));
  if (errors.length === 0) errors.push(...checkFanCoins(config));
  return errors;
}

/**
 * A season's day time as minutes from season 1's day 1 00:00, for comparing dates across seasons.
 * @param {Config} config @param {number} season @param {string} dayTimeText
 */
const leagueMinutes = (config, season, dayTimeText) => (season - 1) * config.settings.calendar.seasonDays * 1440 + parseDayTime(dayTimeText).minutes;

/**
 * An `announced` date's problems: its day within the season, and no later than `latest` (league minutes) when given.
 * @param {Config} config @param {{ season: number, at: string }} a @param {string} where @param {number | null} latest
 * @param {string} latestText  What `latest` is, for the message.
 * @returns {string[]}
 */
function checkAnnounced(config, a, where, latest, latestText) {
  const days = config.settings.calendar.seasonDays;
  if (parseDayTime(a.at).day > days) return [`${where}.announced: must fall within the season's ${days} days`];
  return latest !== null && leagueMinutes(config, a.season, a.at) > latest ? [`${where}.announced: must be no later than ${latestText}`] : [];
}

/**
 * The Director's decisions (Task 262): ids unique, each kind with its own fields, an induction announced no later than it
 * takes effect (its season's start).
 * Whether an inducted player exists can't be known without playing the league: the Director's desk only offers real
 * players (Task 264), and the chronicle ignores an induction for a player it doesn't know.
 * @param {Config} config @returns {string[]}
 */
function checkDecisions(config) {
  const DC = CONFIG_FILES.decisions;
  const decisions = /** @type {any[]} */ (config.decisions.decisions);
  const ids = decisions.map((d) => d.id);
  /** @type {string[]} */
  const e = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))].map((id) => `${DC} → decisions: id "${id}" is used twice`);
  decisions.forEach((d, i) => {
    const where = `${DC} → decisions[${i}]`;
    // Each kind's own fields, and no others.
    const own = d.kind === 'induction' ? ['season', 'playerId', 'reason'] : ['headline', 'words'];
    const other = d.kind === 'induction' ? ['headline', 'words', 'roadmap'] : ['season', 'playerId', 'reason'];
    for (const k of own) if (d[k] === undefined) e.push(`${where}: an ${d.kind} needs ${k}`);
    for (const k of other) if (d[k] !== undefined) e.push(`${where}: an ${d.kind} has no ${k}`);
    if (d.kind === 'induction' && d.season !== undefined) e.push(...checkAnnounced(config, d.announced, where, leagueMinutes(config, d.season, 'day 1 00:00'), `the start of season ${d.season}, when it takes effect`));
    else e.push(...checkAnnounced(config, d.announced, where, null, ''));
  });
  // The watch list (Task 263): each band low to high, its aim inside it, its lever a number in data/rules.json.
  const DR = CONFIG_FILES.director;
  config.director.watchers.forEach((/** @type {any} */ w, /** @type {number} */ i) => {
    const [lo, hi] = w.band;
    if (!(lo < hi)) e.push(`${DR} → watchers[${i}].band: low must be below high`);
    else if (w.aim < lo || w.aim > hi) e.push(`${DR} → watchers[${i}].aim: must be inside the band`);
    const value = w.lever.path.split('.').reduce((/** @type {any} */ o, /** @type {string} */ k) => o?.[k], config.rules);
    if (typeof value !== 'number') e.push(`${DR} → watchers[${i}].lever.path: "${w.lever.path}" is not a number in data/rules.json`);
  });
  return e;
}

/**
 * Fan Coins (docs/channel.md §29): each chant once, and its lines' syllables adding up to its tune's (the olé, sung
 * when a chant has no tune, has 12: soundRecipes.js OLE).
 * @param {Config} config @returns {string[]}
 */
function checkFanCoins(config) {
  const F = CONFIG_FILES.fanCoins;
  /** @type {string[]} */
  const e = [];
  const ids = config.fanCoins.chants.map((/** @type {any} */ c) => c.id);
  for (const id of new Set(ids.filter((/** @type {string} */ id, /** @type {number} */ i) => ids.indexOf(id) !== i))) e.push(`${F} → chants: "${id}" is used twice`);
  for (const c of config.fanCoins.chants) {
    const n = c.tune ? c.tune.length : 12;
    const lines = sum(c.lines.map((/** @type {any} */ l) => l.syllables));
    if (lines !== n) e.push(`${F} → chants: "${c.id}"'s lines have ${lines} syllables, its tune ${n}`);
  }
  return e;
}

/**
 * MOMENTS (Milestone 5¾): each kind and secret once, every kind in a known group, steps rising from 1.
 * @param {Config} config @returns {string[]}
 */
function checkMoments(config) {
  const M = CONFIG_FILES.moments;
  /** @type {string[]} */
  const e = [];
  const { groups, kinds, secrets } = config.moments;
  for (const list of [kinds, secrets]) {
    const ids = /** @type {any[]} */ (list).map((x) => x.id);
    for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) e.push(`${M} → "${id}" is used twice`);
  }
  for (const k of kinds) {
    if (!groups.includes(k.group)) e.push(`${M} → kinds: "${k.id}" is in group "${k.group}", not one of groups`);
    if (k.steps[0] !== 1 || k.steps.some((/** @type {number} */ s, /** @type {number} */ i) => i > 0 && s <= k.steps[i - 1])) e.push(`${M} → kinds: "${k.id}" steps must start at 1 and rise`);
  }
  return e;
}

/**
 * Polls (Task 260): ids unique, each closing after it opens, one at a time (a poll opens once the one before has
 * closed), and a result's votes only for the poll's options, announced once the poll has closed (Task 262).
 * @param {Config} config @returns {string[]}
 */
function checkPolls(config) {
  const PL = CONFIG_FILES.polls;
  /** @type {string[]} */
  const e = [];
  const polls = /** @type {any[]} */ (config.polls.polls);
  const days = config.settings.calendar.seasonDays;
  /** A poll's time as minutes from season 1's day 1 00:00. @param {any} p @param {'opens' | 'closes'} k */
  const at = (p, k) => leagueMinutes(config, p.season, p[k]);
  const ids = polls.map((p) => p.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) e.push(`${PL} → polls: id "${id}" is used twice`);
  const teamIds = new Set(config.teams.teams.map((/** @type {any} */ t) => t.id));
  polls.forEach((p, i) => {
    if (parseDayTime(p.opens).day > days || parseDayTime(p.closes).day > days) e.push(`${PL} → polls[${i}]: opens and closes must fall within the season's ${days} days`);
    if (at(p, 'closes') <= at(p, 'opens')) e.push(`${PL} → polls[${i}]: closes must come after opens`);
    if (i > 0 && at(p, 'opens') < at(polls[i - 1], 'closes')) e.push(`${PL} → polls[${i}]: opens before polls[${i - 1}] closes (one poll at a time, in order)`);
    for (const k of Object.keys(p.result?.votes ?? {})) if (!teamIds.has(k)) e.push(`${PL} → polls[${i}].result.votes: "${k}" is not one of the poll's options`);
    if (p.result) {
      e.push(...checkAnnounced(config, p.result.announced, `${PL} → polls[${i}].result`, null, ''));
      if (leagueMinutes(config, p.result.announced.season, p.result.announced.at) < at(p, 'closes')) e.push(`${PL} → polls[${i}].result.announced: must be no earlier than the poll closes`);
    }
  });
  return e;
}

/**
 * Rule changes (Task 229b): ids unique, and each season's rules, once merged, as valid as data/rules.json itself
 * (shape, unknown keys and every cross-check), so a typo or an impossible value is caught before it's played.
 * @param {Config} config @returns {string[]}
 */
function checkRuleChanges(config) {
  const RC = CONFIG_FILES.ruleChanges;
  /** @type {string[]} */
  const e = [];
  const changes = /** @type {any[]} */ (config.ruleChanges.changes);
  const ids = changes.map((c) => c.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) e.push(`${RC} → changes: id "${id}" is used twice`);
  for (const season of [...new Set(changes.map((c) => c.season))].sort((a, b) => a - b)) {
    const rules = mergeRules(config.rules, changes.filter((c) => c.season <= season).sort((a, b) => a.season - b.season));
    const shape = check(rules, RULES_SCHEMA);
    const found = shape.length ? shape : crossCheck({ ...config, rules });
    for (const msg of found) e.push(`${RC} → season ${season}'s rules: ${msg}`);
  }
  return e;
}

/**
 * Read, parse, validate and deep-freeze all config files.
 * @param {(path: string) => Promise<string>} readText  Reads a file given its path relative to the project root.
 * @returns {Promise<Readonly<Config>>}
 * @throws {ConfigError}
 */
export async function loadConfig(readText) {
  /** @type {Record<string, any>} */
  const raw = {};
  /** @type {string[]} */
  const errors = [];
  for (const [name, file] of Object.entries(CONFIG_FILES)) {
    try {
      raw[name] = JSON.parse(await readText(file));
    } catch (err) {
      errors.push(`${file} → could not read or parse: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (errors.length === 0) errors.push(...validateConfig(/** @type {Config} */ (raw)));
  if (errors.length > 0) throw new ConfigError(errors);
  return deepFreeze(/** @type {Config} */ (raw));
}

/** @param {Config} config @returns {string[]} */
function crossCheck({ settings, rules, positions, regions, teams, commentary, studio, interviews }) {
  const S = CONFIG_FILES.settings;
  const R = CONFIG_FILES.rules;
  const P = CONFIG_FILES.positions;
  const G = CONFIG_FILES.regions;
  const T = CONFIG_FILES.teams;
  /** @type {string[]} */
  const e = [];
  // Donations (2026-10-18): the Ko-fi link goes in an href, so only a plain https address.
  if (!/^https:\/\/[^\s"'<>]+$/.test(settings.audience.donateUrl)) e.push(`${S} → audience.donateUrl: must be an https:// address`);
  const posList = /** @type {string[]} */ (positions.positions);
  const attrList = /** @type {string[]} */ (positions.attributes);

  // studio (Task 131): a said line is fixed or names one team, {team}, the kind's subject; or (Task 246a) a player's
  // surname, {surname}, made ahead for every surname in the pools
  for (const [kind, k] of entries(studio.lines)) {
    for (const w of k.ways) {
      const blanks = (w.say.match(/\{\w+\}/g) ?? []).filter((/** @type {string} */ b) => b !== '{team}' && b !== '{surname}');
      if (blanks.length) e.push(`${CONFIG_FILES.studio} → lines.${kind}: "${w.say}" may only name {team} or {surname} (vision §12: said lines are made ahead)`);
      if (w.say.includes('{team}') && !k.subject) e.push(`${CONFIG_FILES.studio} → lines.${kind}: "${w.say}" names {team} but the kind has no subject`);
    }
  }

  // commentary: unique ids, and every moment's lines exist
  const C = CONFIG_FILES.commentary;
  e.push(...duplicates(commentary.commentators.map((/** @type {any} */ c) => c.id), `${C} → commentators: duplicate id`));
  e.push(...duplicates(commentary.lines.map((/** @type {any} */ l) => l.id), `${C} → lines: duplicate id`));
  if (!commentary.commentators.some((/** @type {any} */ c) => c.onAir)) e.push(`${C} → commentators: at least one must be onAir`);
  if (!commentary.commentators.some((/** @type {any} */ c) => c.onAir && c.id === commentary.playoffs)) e.push(`${C} → playoffs: must be a commentator on air`);
  const lineIds = new Set(commentary.lines.map((/** @type {any} */ l) => l.id));
  for (const [moment, m] of entries(commentary.moments)) {
    for (const id of m.lines) if (!lineIds.has(id)) e.push(`${C} → moments.${moment}: unknown line ${id}`);
  }
  const commentatorIds = new Set(commentary.commentators.map((/** @type {any} */ c) => c.id));
  for (const l of commentary.lines) for (const v of l.voices ?? []) if (!commentatorIds.has(v)) e.push(`${C} → lines.${l.id}: unknown voice ${v}`);

  // settings
  e.push(...checkCalendar(settings, rules, teams.teams.length).map((msg) => `${S} → ${msg}`));

  // heat
  const h = rules.heat;
  if (!(h.warmAt < h.hotAt && h.hotAt < 100)) e.push(`${R} → heat: need warmAt < hotAt < 100`);

  // contests
  for (const [name, c] of entries(rules.contests)) {
    if (c.pMin >= c.pMax) e.push(`${R} → contests.${name}: pMin must be less than pMax`);
  }

  // injuries
  rules.injuries.severity.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (s.minMatches > s.maxMatches) e.push(`${R} → injuries.severity[${i}]: minMatches must not exceed maxMatches`);
  });
  if (!rules.injuries.severity.some((/** @type {any} */ s) => s.weight > 0)) {
    e.push(`${R} → injuries.severity: at least one weight must be above 0`);
  }

  // points and tiebreakers
  const pts = rules.points;
  if (!(pts.win > pts.draw && pts.draw >= pts.loss)) e.push(`${R} → points: need win > draw ≥ loss`);
  if (rules.tiebreakers.at(-1) !== 'lots') e.push(`${R} → tiebreakers: last entry must be "lots" so ties always resolve`);

  // roster
  const roster = rules.roster;
  for (const key of /** @type {const} */ (['lineup', 'minimums'])) {
    e.push(...keyMismatch(roster[key], posList, `${R} → roster.${key}`, 'exactly'));
  }
  const lineupSize = sum(Object.values(withoutComments(roster.lineup)));
  if (lineupSize < 1) e.push(`${R} → roster.lineup: must put at least one player on the pitch`);
  if (lineupSize > roster.matchday) e.push(`${R} → roster: lineup (${lineupSize}) is larger than matchday squad (${roster.matchday})`);
  if (roster.matchday > roster.size) e.push(`${R} → roster: matchday squad (${roster.matchday}) is larger than roster size (${roster.size})`);
  const minTotal = sum(Object.values(withoutComments(roster.minimums)));
  if (minTotal > roster.size) e.push(`${R} → roster.minimums: total (${minTotal}) exceeds roster size (${roster.size})`);
  for (const p of posList) {
    if ((roster.minimums[p] ?? 0) < (roster.lineup[p] ?? 0)) {
      e.push(`${R} → roster.minimums.${p}: must be at least the lineup count (${roster.lineup[p]})`);
    }
  }

  // draft
  rules.finances.contractSeasons.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    if (b.min > b.max) e.push(`${R} → finances.contractSeasons[${i}]: min (${b.min}) must not be greater than max (${b.max})`);
  });
  const pot = rules.draft.potential;
  if (pot.min > pot.max) e.push(`${R} → draft.potential: min must not exceed max`);
  if (!rules.draft.lotteryWeights.some((/** @type {number} */ w) => w > 0)) {
    e.push(`${R} → draft.lotteryWeights: at least one weight must be above 0`);
  }

  // development
  for (const [group, attrs] of entries(rules.development.attributeGroups)) {
    for (const a of attrs) {
      if (!attrList.includes(a)) e.push(`${R} → development.attributeGroups.${group}: "${a}" is not an attribute in ${P}`);
    }
  }

  // retirement
  const ret = rules.retirement;
  if (ret.centerAge >= ret.maxAge) e.push(`${R} → retirement: centerAge must be below maxAge`);
  if (ret.keeperCenterAge >= ret.maxAge) e.push(`${R} → retirement: keeperCenterAge must be below maxAge`);

  // awards (Task 188): unique ids, real positions, a minimum only for save percentage
  const awardIds = rules.awards.list.map((/** @type {any} */ a) => a.id);
  if (new Set(awardIds).size !== awardIds.length) e.push(`${R} → awards.list: ids must be unique`);
  for (const a of rules.awards.list) {
    for (const p of a.positions ?? []) if (!posList.includes(p)) e.push(`${R} → awards.list.${a.id}: unknown position ${p}`);
    if ((a.stat === 'savePct') !== (a.minFacedShare !== undefined)) e.push(`${R} → awards.list.${a.id}: minFacedShare goes with savePct, and only with it`);
    if ((a.stat === 'rookieBlend') !== (a.blend !== undefined) || (a.blend !== undefined) !== (a.minMinutesShare !== undefined)) e.push(`${R} → awards.list.${a.id}: blend and minMinutesShare go with rookieBlend, and only with it`);
    for (const [pos, stats] of Object.entries(a.blend ?? {})) {
      if (!posList.includes(pos)) e.push(`${R} → awards.list.${a.id}.blend: unknown position ${pos}`);
      for (const s of Object.keys(stats)) if (!BLEND_STATS.includes(s)) e.push(`${R} → awards.list.${a.id}.blend.${pos}: unknown stat ${s}`);
    }
  }

  // positions
  e.push(...keyMismatch(positions.overallWeights, posList, `${P} → overallWeights`, 'exactly'));
  for (const [pos, weights] of entries(positions.overallWeights)) {
    e.push(...keyMismatch(weights, attrList, `${P} → overallWeights.${pos}`, 'subset'));
    const total = sum(Object.values(withoutComments(weights)));
    if (Math.abs(total - 1) > 1e-6) e.push(`${P} → overallWeights.${pos}: weights sum to ${round(total)}, must sum to 1`);
  }
  for (const [zone, weights] of entries(positions.carrierWeights)) {
    e.push(...keyMismatch(weights, posList, `${P} → carrierWeights.${zone}`, 'subset'));
    if (sum(Object.values(withoutComments(weights))) <= 0) e.push(`${P} → carrierWeights.${zone}: at least one weight must be above 0`);
  }
  if (!posList.includes(positions.keeper)) e.push(`${P} → keeper: "${positions.keeper}" is not in positions`);
  for (const [attr, spec] of entries(rules.generation.specialists)) {
    if (!attrList.includes(attr)) e.push(`${R} → generation.specialists.${attr}: not an attribute in ${P}`);
    if (!posList.includes(spec.position)) e.push(`${R} → generation.specialists.${attr}.position: "${spec.position}" is not in ${P}`);
  }

  // the interview's voices (Task 133): one for each region, a man's and a woman's
  for (const r of /** @type {any[]} */ (regions.regions)) if (!interviews.voices[r.id]) e.push(`${CONFIG_FILES.interviews} → voices: none for region ${r.id}`);

  // regions
  const regionList = /** @type {any[]} */ (regions.regions);
  e.push(...duplicates(regionList.map((r) => r.id), `${G} → regions: duplicate id`));
  for (const r of regionList) {
    for (const n of /** @type {any} */ (r).womensNames) if (!(/** @type {any} */ (r).firstNames.includes(n))) e.push(`${G} → regions.${r.id}.womensNames: ${n} is not one of its firstNames`);
  }
  if (!regionList.some((r) => r.weight > 0)) e.push(`${G} → regions: at least one weight must be above 0`);

  // teams
  const teamList = /** @type {any[]} */ (teams.teams);
  const regionIds = regionList.map((r) => r.id);
  for (const field of ['id', 'name', 'shortName', 'abbr']) {
    e.push(...duplicates(teamList.map((t) => t[field]), `${T} → teams: duplicate ${field}`));
  }
  e.push(...duplicates(teamList.map((t) => t.colours.primary.toUpperCase()), `${T} → teams: duplicate primary colour`));
  teamList.forEach((t, i) => {
    if (!regionIds.includes(t.region)) e.push(`${T} → teams[${i}].region: "${t.region}" is not a region in ${G}`);
  });
  if (teamList.length % 2 !== 0) e.push(`${T} → teams: need an even number of teams (got ${teamList.length})`);
  const playoffTeams = rules.playoffs.teams;
  if (playoffTeams > teamList.length) e.push(`${R} → playoffs.teams (${playoffTeams}) is more than the number of teams (${teamList.length})`);
  const nonPlayoff = teamList.length - playoffTeams;
  if (rules.draft.lotteryWeights.length !== nonPlayoff) {
    e.push(`${R} → draft.lotteryWeights: need one weight per non-playoff team (${nonPlayoff}), got ${rules.draft.lotteryWeights.length}`);
  }

  return e;
}

/**
 * The live league and the week's calendar: a real start date and time zone, and kick-offs that fit in the
 * week without overlapping. Lengths are in real minutes. A knockout's longest case allows for overtime and a
 * shootout with two rounds of sudden death.
 * @param {any} settings @param {any} rules @param {number} teamCount
 * @returns {string[]}
 */
function checkCalendar(settings, rules, teamCount) {
  /** @type {string[]} */
  const e = [];
  const { live, match, calendar, playoffs, segments } = settings;

  const start = new Date(`${live.firstSeasonStarts}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== live.firstSeasonStarts) {
    e.push(`live.firstSeasonStarts: "${live.firstSeasonStarts}" is not a real date`);
  } else if (start.getUTCDay() !== 1) {
    e.push(`live.firstSeasonStarts: ${live.firstSeasonStarts} must be a Monday`);
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: live.timeZone });
  } catch {
    e.push(`live.timeZone: "${live.timeZone}" is not a known time zone (use one like "America/New_York")`);
  }

  const times = [
    ['calendar.firstKickoff', calendar.firstKickoff],
    ['calendar.finalRoundKickoff', calendar.finalRoundKickoff],
    ...playoffs.kickoffs.map((/** @type {string} */ t, /** @type {number} */ i) => [`playoffs.kickoffs[${i}]`, t]),
  ];
  for (const [where, t] of times) {
    if (parseDayTime(t).day > calendar.seasonDays) e.push(`${where}: "${t}" is after the season's last day (${calendar.seasonDays})`);
  }

  // Goal and substitution pauses lengthen a match by a varying amount: allow pauseAllowanceMinutes for them.
  const matchLength = match.realMinutes + match.halfTimeRealMinutes + match.pauseAllowanceMinutes;
  const realPerGameMinute = match.realMinutes / (2 * rules.match.halfMinutes);
  const shootoutKicks = 2 * (rules.playoffs.shootoutKicks + 2);
  const knockoutLength = matchLength + 2 * match.overtimeBreakRealMinutes
    + rules.match.overtimeMinutes * realPerGameMinute + (shootoutKicks * match.shootoutKickRealSeconds + match.goalPauseSeconds) / 60;
  // The walk-out has to hold its parts, and the handshake parts leave room to walk off.
  const c = settings.ceremonies;
  const walkOutNeeds = c.walkOnSeconds + 2 * c.anthemSeconds + c.warmUpSeconds + c.breakLineSeconds;
  if (walkOutNeeds > segments.walkOutMinutes * 60) e.push(`ceremonies: the walk-out's parts need ${walkOutNeeds} s, but segments.walkOutMinutes gives ${segments.walkOutMinutes * 60}`);
  const hp = c.handshakeParts;
  if (hp.huddle + hp.pass + hp.salute > 0.8) e.push('ceremonies.handshakeParts: huddle + pass + salute must leave at least 0.2 for walking off');

  // The slot around a match: pre-match and walk-out before it, handshakes and the post-match show after.
  // The run-in before it (§16.5): the tee-up talk, and once a day the channel's opening.
  const { studio, opening } = settings;
  const runIn = (studio.teeUpSeconds + opening.identSeconds + opening.talkSeconds) / 60;
  const around = runIn + segments.preMatchMinutes + segments.walkOutMinutes + segments.handshakeMinutes + segments.postMatchMinutes;
  // The show's fixed parts (§16.2): the full-time card, the talk (the round's, the longest), the interview and its tee-up and wrap-up.
  const showTalk = (Math.max(studio.matchTalkSeconds, studio.roundTalkSeconds) + studio.interviewTeeUpSeconds + studio.wrapUpSeconds) / 60;
  if (segments.fullTimeMinutes + showTalk + segments.potmSeconds / 60 > segments.postMatchMinutes) {
    e.push('segments.fullTimeMinutes, potmSeconds, studio talk: the full-time card, the talk and the interview are part of the post-match show, so together they can\'t be longer than postMatchMinutes');
  }

  // Regular season: evenly spaced, one at a time, each with its pre-match and full-time segments.
  const first = parseDayTime(calendar.firstKickoff).minutes;
  const finalRound = parseDayTime(calendar.finalRoundKickoff).minutes;
  const totalMatches = (teamCount - 1) * teamCount;
  const gaps = calendar.finalRoundSimultaneous ? totalMatches - teamCount / 2 : totalMatches - 1;
  if (finalRound <= first) {
    e.push('calendar: finalRoundKickoff must be after firstKickoff');
  } else if ((finalRound - first) / gaps < matchLength + around) {
    const spacing = Math.round((finalRound - first) / gaps);
    e.push(`calendar: regular-season matches would be ${spacing} min apart, but each needs ${matchLength + around} `
      + '(pre-match, walk-out, match, handshakes and post-match show). Start earlier or end later.');
  }

  // Playoffs: one kick-off per knockout match, after the final round, with room for overtime and a shootout.
  const expected = rules.playoffs.teams === 4 ? 3 : 1;
  if (playoffs.kickoffs.length !== expected) {
    e.push(`playoffs.kickoffs: need ${expected} (one per knockout match with ${rules.playoffs.teams} playoff teams), got ${playoffs.kickoffs.length}`);
    return e;
  }
  const knockouts = playoffs.kickoffs.map((/** @type {string} */ t) => parseDayTime(t).minutes);
  const needAfterRound = matchLength + around;
  if (knockouts[0] < finalRound + needAfterRound) {
    e.push(`playoffs.kickoffs[0]: must be at least ${needAfterRound} min after calendar.finalRoundKickoff`);
  }
  const needBetween = Math.ceil(knockoutLength + around);
  for (let i = 1; i < knockouts.length; i++) {
    if (knockouts[i] < knockouts[i - 1] + needBetween) {
      e.push(`playoffs.kickoffs[${i}]: must be at least ${needBetween} min after the previous knockout (overtime and shootout included)`);
    }
  }
  const seasonEnd = calendar.seasonDays * 1440;
  // The light by the time of day (Tom's note 14): its changes in the day's order, each ease clear of the next.
  const lt = settings.lighting;
  const hm = (/** @type {string} */ s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const changes = [hm(lt.dawnFrom), hm(lt.dayFrom), hm(lt.duskFrom), hm(lt.nightFrom)];
  if (!changes.every((m, i) => i === 0 || m > changes[i - 1])) e.push('lighting: dawnFrom, dayFrom, duskFrom and nightFrom must come in that order through the day');
  else if (changes.some((m, i) => ((changes[(i + 1) % 4] - m + 1440) % 1440) < lt.easeMinutes)) e.push('lighting: easeMinutes must be shorter than the time between any two changes');
  // After the final, the trophy lift takes the handshakes' place (Task 190).
  const lift = settings.trophyLift;
  if (lift.closeUpAfterSeconds >= lift.liftSeconds) e.push('trophyLift.closeUpAfterSeconds: the close-up comes inside the lift, so it must be less than liftSeconds');
  if (lift.closeUpAfterSeconds + lift.stageAfterSeconds >= lift.liftSeconds) e.push('trophyLift.stageAfterSeconds: the stage comes inside the lift, so closeUpAfterSeconds + stageAfterSeconds must be less than liftSeconds');
  const liftMinutes = (lift.celebrateSeconds + lift.guardSeconds + lift.anthemSeconds + lift.liftSeconds) / 60;
  // The awards on air (Task 191): the sim's own, their beats in order inside each award.
  const aw = settings.awards;
  const given = rules.awards.list.map((/** @type {any} */ a) => a.id);
  for (const id of aw.order) if (!given.includes(id)) e.push(`awards.order: no award "${id}" in data/rules.json awards`);
  if (!(aw.shortlistAt <= aw.secondAt && aw.secondAt <= aw.winnerAt && aw.winnerAt <= aw.liftAt && aw.liftAt < aw.awardSeconds)) e.push(`awards: shortlistAt ≤ secondAt ≤ winnerAt ≤ liftAt < awardSeconds`);
  const awardsMinutes = (aw.talkSeconds + aw.order.length * aw.awardSeconds) / 60;
  // The farewells and the lottery (Task 192), the draft and the moves run inside the off-season's own length.
  const fw = settings.farewells;
  const lot = settings.lottery;
  if (lot.dropAt + 1 > lot.revealSeconds) e.push(`lottery.dropAt: the ball has to land inside its reveal (revealSeconds)`);
  const lotteryPicks = Math.max(0, teamCount - rules.playoffs.teams);
  // The draft (Task 193) too: round 1 at round1Seconds a pick, the rest at round2Seconds; its beats in order.
  const dr = settings.draft;
  if (!(dr.walkAt <= dr.cutAt && dr.cutAt <= dr.kitAt && dr.kitAt <= dr.cheerAt && dr.cheerAt < dr.round1Seconds)) e.push('draft: walkAt ≤ cutAt ≤ kitAt ≤ cheerAt < round1Seconds');
  if (dr.round2NameAt >= dr.round2Seconds) e.push('draft.round2NameAt: the name goes up inside the pick (round2Seconds)');
  const draftSeconds = teamCount * dr.round1Seconds + teamCount * (rules.draft.rounds - 1) * dr.round2Seconds;
  // The moves board and the sign-off (Task 194) after the draft.
  const mv = settings.moves;
  if (mv.cardAt >= mv.lineSeconds) e.push('moves.cardAt: the card comes in inside its line\'s turn (lineSeconds)');
  const movesSeconds = Math.max(mv.minSeconds, mv.leadSeconds + mv.maxLines * mv.lineSeconds + mv.tailSeconds);
  const showsMinutes = (fw.max * fw.perPlayerSeconds + lot.oddsSeconds + lotteryPicks * lot.revealSeconds + draftSeconds + movesSeconds + studio.signoffTalkSeconds) / 60;
  if (showsMinutes > segments.offseasonSummaryMinutes) e.push(`farewells, lottery, draft, moves: with the sign-off they need ${Math.ceil(showsMinutes)} min, more than segments.offseasonSummaryMinutes`);
  const finalDone = knockouts.at(-1) + knockoutLength + liftMinutes + segments.fullTimeMinutes + segments.potmSeconds / 60
    + (studio.matchTalkSeconds + studio.interviewTeeUpSeconds + studio.wrapUpSeconds) / 60 + segments.championMinutes + awardsMinutes + segments.offseasonSummaryMinutes;
  if (finalDone > seasonEnd) {
    e.push(`playoffs.kickoffs: the final, champion and off-season segments run past the end of day ${calendar.seasonDays}`);
  }
  return e;
}

/** @param {unknown[]} values @param {string} message */
function duplicates(values, message) {
  const seen = new Set();
  const dupes = new Set();
  for (const v of values) (seen.has(v) ? dupes : seen).add(v);
  return [...dupes].map((v) => `${message} "${v}"`);
}

/**
 * Compare an object's keys (ignoring "_" comments) with an allowed list.
 * @param {Record<string, unknown>} object
 * @param {string[]} allowed
 * @param {string} where
 * @param {'exactly' | 'subset'} mode  "exactly" also reports allowed keys that are missing.
 */
function keyMismatch(object, allowed, where, mode) {
  const keys = Object.keys(withoutComments(object));
  const errors = keys.filter((k) => !allowed.includes(k)).map((k) => `${where}.${k}: unknown position/attribute (expected one of ${allowed.join(', ')})`);
  if (mode === 'exactly') {
    for (const k of allowed) if (!keys.includes(k)) errors.push(`${where}.${k}: missing`);
  }
  return errors;
}

/** @param {Record<string, any>} object @returns {[string, any][]} */
function entries(object) {
  return Object.entries(withoutComments(object));
}

/** @param {number} n */
function round(n) {
  return Math.round(n * 1e6) / 1e6;
}

/** @template T @param {T} value @returns {Readonly<T>} */
function deepFreeze(value) {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
