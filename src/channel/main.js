// Channel boot and frame loop. Builds the live league as of the channel clock; then every frame advances it, asks the
// programme what's on (live match, highlights, full-time, pre-match or studio card) and draws the stage.
// Deciding what to show lives in pure modules (programme, cards, captions, ticker, onScreen); overlays/ draws them.
import { ConfigError, loadConfig } from '../config.js';
import { createRng } from '../sim/rng.js';
import { championCard, finalDayCard, finalDayResultsCard, fullTimeCard, potmCard, preMatchCard, reairCard, studioCard } from './cards.js';
import { calloutAt, subCalloutsAt } from './callouts.js';
import { benchWalkOn, handshakeCaption, handshakeLength, handshakePose, kickoffSpots, lineUp, managerHandshakes, managerWalkOut, refereeHandshakes, refereeWalkOut, replayCaption, walkOutCaption, walkOutParts, walkOutPose } from './ceremonies.js';
import { alertAt, captionAt, recordCaptions } from './captions.js';
import { createCalendar, zoneOffsets } from './calendar.js';
import { createClock } from './clock.js';
import { devParams, devToolsAllowed, publicParams } from './dev.js';
import { homeAttacksRight } from './formation.js';
import { colourDistance, matchKits } from './kits.js';
import { LiveLeague } from './liveLeague.js';
import { loadDayKeys } from './dayKeys.js';
import { SNAPSHOT_VERSION, restoreLive, snapshotPath } from './snapshot.js';
import { fetchVersion, reloadForUpdate, resumed, updateAction } from './updates.js';
import { showPreseason } from './preseason.js';
import { createMotion } from './motion.js';
import { winnerOf } from './potm.js';
import { drawFireworks, drawLiftCloseUp, drawLiftStage, drawPodium, drawSmallCup } from './liftArt.js';
import { drawAwardPlinth } from './awardArt.js';
import { awardBeats, awardEvents, awardView } from './awardShow.js';
import { drawFarewells } from './farewellArt.js';
import { drawLottery } from './lotteryArt.js';
import { draftPicks, lotteryBeats, lotteryView, movesBeats, movesView, notableRetirements, pickBeats } from './offseasonShow.js';
import { drawMoves } from './movesArt.js';
import { musicLayers } from './musicRecipes.js';
import { drawDraftBoard, drawPickCloseUp } from './draftArt.js';
import { liftCaption, liftCoach, liftCues, liftFive, liftMood, liftParts, liftPose, PODIUM_Y, podiumRise, stageHolder } from './trophyLift.js';
import { overall } from '../sim/players.js';
import { CROWD_KINDS, createAudio } from './audio.js';
import { createLevels } from './overlays/levels.js';
import { cueKey, cuesBetween, eventCues, leadWindow, resumeCues } from './sounds.js';
import { spinOn } from './ballSpin.js';
import { deskClipKey, interviewClipUrl, typingSpeed } from './speech.js';
import { clipUrl, commentaryCalls, commentatorFor, holdCall, holdJump, holdState, linesFor, passBreaks, passCall, passJump, passState, roundShape } from './commentary.js';
import { recipe } from './soundRecipes.js';
import { ceremonyCues, ceremonyMood, crowdCues, crowdLevel, liveliness, standsFullness, standsMood } from './crowd.js';
import { createButtons } from './overlays/buttons.js';
import { installTooltips } from './overlays/tooltip.js';
import { createGuide } from './overlays/guidePane.js';
import { createBookPanes } from './overlays/bookPanes.js';
import { createChroniclePane } from './overlays/chroniclePane.js';
import { createAudiencePane } from './overlays/audiencePane.js';
import { createMomentNotice } from './overlays/momentNotice.js';
import { createMomentTracker, demoMoments } from './moments.js';
import { createMomentStore } from './momentStore.js';
import { createTourView } from './overlays/tourView.js';
import { goalCheer } from './cheers.js';
import { createAudience, onAirLine, startHellos } from './audience.js';
import { guideKind, studioJingle as jingleBegins } from './guide.js';
import { analystCast } from './analystTalk.js';
import { podcastCast, podcastClipKey, SEATS as SEATS_PODCAST } from './podcastTalk.js';
import { boothLayout, drawBooth } from './podcastBooth.js';
import { guilders, payrolls } from './money.js';
import { seasonConfig } from '../sim/rules.js';
import { createPane } from './overlays/pane.js';
import { createCallout } from './overlays/callout.js';
import { createCaption } from './overlays/caption.js';
import { createCardPanel } from './overlays/cardPanel.js';
import { createCrawl } from './overlays/crawl.js';
import { createMultiview } from './overlays/multiview.js';
import { createDevPanel } from './overlays/devPanel.js';
import { $, mmss, setText } from './overlays/dom.js';
import { createScorebug, PERIOD_LABEL } from './overlays/scorebug.js';
import { createSidePanel } from './overlays/sidePanel.js';
import { createTablePanel } from './overlays/tablePanel.js';
import { applyPalette, PALETTE } from './palette.js';
import { createLayout } from './layout.js';
import { replayAt, replayFocus } from './replay.js';
import { drawBand, drawScene, drawStingTitle, drawSweep, sceneRect, showsScene } from './scene.js';
import { pictureOf, transitionAt } from './transitions.js';
import { lineTiming, presenters, studioScript, teamsForTalk } from './studio.js';
import { talkContext, talkScript } from './talk.js';
import { drawDesk, drawFigure, drawSetBack, figurePoses, setLayout } from './studioSet.js';
import { drawInterview, interviewLayout, interviewParts, interviewPose, playerLook, quoteSchedule, recordedMark } from './interview.js';
import { drawAd, drawAdDissolve, drawAdStill, drawBumper, drawCountdown, drawIdent, identLanding, identPath, identTrack } from './spotArt.js';
import { adFacts, adIndex, adOrder, shopWith, stillAt } from './spots.js';
import { isFinished, tableAt, upcomingAt } from './onScreen.js';
import { watchingItem } from './ticker.js';
import { awayCorner, awaySteps, bowlAreas, crowdLayout, drawFloodlightMounts, drawGroundTurf, drawStands, GROUND, GROUND_TURF, presentFans } from './stands.js';
import { drawLight, lightAt, lightPitch } from './lighting.js';
import { litMoment } from './daylight.js';
import { AFTER_TURF, DRAW_SCENE, IN_STANDS, sceneCues } from './groundScenes.js';
import { groundName, tourCaption } from './groundsTour.js';
import { createManagers, createReferee, refereeKit } from './pitchside.js';
import { ballStageAt, drawBall, drawBenches, drawConfetti, drawEndBoards, drawGate, drawHomeMark, drawMomentumRings, drawPitch, drawPlayers, PITCH, toStage } from './pitch.js';
import { momentumAt } from './momentum.js';
import { seat, sidelinesAt, gateOpen, benchCheer, celebrationAt } from './sidelines.js';
import { createProgramme, groundOf } from './programme.js';
import { drawPlayoffMarks, GOLD } from './playoffArt.js';
import { centreIcon, crestSize, drawCrest, drawShirtCrest } from './crests.js';
import { drawTurfKick, footSide, stepPhase } from './poses.js';
import { mountStage, STAGE_WIDTH } from './stage.js';
import { meterSharp, sharpBake, sharpClear } from './sharpText.js';
import { createPerf } from './perf.js';
import { createPerfView, perfInfo } from './overlays/perfView.js';
import { isPhone } from './phone.js';
import { createPhoneControls } from './overlays/phoneControls.js';
import { BOTTOM_STRIP, drawBottomBand, drawStrips, FULL_TURF } from './strips.js';
import { createTimeline } from './timeline.js';
import { createEarner, dayOf, halvesOf, matchKey, matchOnScreen, normalizeData as normalizeCoins, picturesOf, queueState, showing, spendsFromFeed, boardTeams } from './fanCoins.js';
import { createCoinBank, newViewer } from './coinBank.js';
import { boardBlocked } from './coinRules.js';
import { drawFanBoard, drawHeldFlag } from './fanArt.js';
import { ON_TITLES, createCoinsView } from './overlays/coinsView.js';
import { createFanOverlays } from './overlays/fanOverlays.js';

/** How far back (ms) the ball's trail looks while it's in flight. */
const TRAIL_MS = [20, 40, 60, 80];
/** A gap longer than this (ms, real or match time) between frames counts as a jump: no sounds from before it play. */
const SOUND_JUMP_MS = 600;
/** A handover between segments (the walk-out to the live match) may take a slow frame or two while the match is built: up to this long (real ms) still counts as watching through it. */
const HANDOVER_MS = 3000;
/** A desk line or a quote is voiced only if it's this new (ms) when first seen, so tuning in part-way doesn't start a
 * voice mid-sentence (Task 135). */
const SPEECH_START_MS = 1000;
/** How far above the referee's other call their SUB ON bubble sits when both show (stage px; a bubble's height and a gap). */
const SUB_STACK_PX = 13;
/** After a jump, sounds that began up to this long ago (ms) and still have RESUME_MIN_MS to run join part-way (Task 62). */
const RESUME_LOOKBACK_MS = 90_000;
const RESUME_MIN_MS = 400;
/** The phases with the ball in play, when holding it can be called (Task 179). */
const IN_PLAY = new Set(['first_half', 'second_half', 'overtime']);
/** How lively the stands are with no match or ceremony on screen (cards, the studio). */
const CALM_STANDS = 0.2;
/** AROUND THE GROUNDS' wipe: how long before a ground ends its picture is kept for the next one's wipe, and the band's edge (stage px). */
const TOUR_SHOT_MS = 400;
const TOUR_EDGE = 3;
/** Where the replay inset's bottom-left corner sits (stage px): just above the caption in Full; in Broadcast just above the turf with the home name (Task 72). */
const REPLAY_AT = Object.freeze({ full: { x: 4, y: 234 }, broadcast: { x: 6, y: 230 } });
/** How often a card's content is rebuilt, in real ms (its countdown still ticks every frame). */
const CARD_REFRESH_MS = 1000;
/** Cards over the scene are Glass (Task 102). */
const GLASS = Object.freeze({ glass: true });

/** Reads a config file relative to the page (index.html sits at the project root). */
async function fetchText(/** @type {string} */ path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** How often a missing day key is asked for again (and tomorrow's while it isn't out). */
const KEY_RETRY_MS = 60_000;
/** Tomorrow's key is needed this long before midnight: the day's first match is previewed before it. */
const KEY_LOOKAHEAD_MS = 60 * 60_000;
/** When the channel last asked for missing keys (the frame loop's clock). */
let keysAskedAt = -Infinity;

/** A day key or a snapshot, or null if it isn't published yet (a 404). @param {string} path */
async function fetchKey(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

/**
 * The latest snapshot for moment `t` (Task 272): this season's, or failing that one of the two before (its week's keys
 * are then played too); null for none (season 1, or none made: the league is built from its first day's key).
 * @param {import('./calendar.js').Calendar} calendar @param {number} t
 */
async function latestSnapshot(calendar, t) {
  const season = calendar.seasonAt(t);
  for (let s = season; s >= Math.max(2, season - 2); s--) {
    const snap = await fetchKey(snapshotPath(s));
    if (snap?.version === SNAPSHOT_VERSION) return snap;
  }
  return null;
}

/** Whether the channel can play moment `t`: its day's key, and in the day's last hour tomorrow's. @param {any} keys @param {number} t */
const keysReady = (keys, t) => keys.has(t) && keys.has(t + KEY_LOOKAHEAD_MS);

/**
 * The loading card reading BACK SOON (on), or back to TUNING IN (off): hidden if it was showing BACK SOON over the
 * picture, left as it is while the channel is still loading. @param {boolean} on @param {{ hide?: boolean }} [o]
 */
function backSoon(on, { hide = true } = {}) {
  const card = $('loading');
  const msg = card.querySelector('.msg');
  const showing = card.dataset.back === '1';
  if (on === showing) return;
  card.dataset.back = on ? '1' : '';
  if (msg) msg.textContent = on ? 'BACK SOON' : 'TUNING IN…';
  if (on) card.hidden = false;
  else if (hide) card.hidden = true;
}

async function boot() {
  // The dev tools only on the dev server (Task 275): on the live site the URL can't move the clock or the seed.
  const devTools = devToolsAllowed(location.hostname);
  const params = devTools ? devParams(location.search) : publicParams(location.search);
  // The phone readout (phones, step 1): frame times, what drawing spends them on, how late sounds start (?perf=1).
  const perf = params.perf ? createPerf() : null;
  const mark = perf ? (/** @type {string} */ part) => perf.mark(part, performance.now()) : () => {};
  const loaded = await loadConfig(fetchText);
  // ?hl= tries another highlights speed on this screen only (a dev aid; the setting stays the default).
  const config = params.highlightsSpeed === null ? loaded
    : { ...loaded, settings: { ...loaded.settings, highlights: { ...loaded.settings.highlights, speed: params.highlightsSpeed } } };
  const seed = params.seed ?? config.settings.live.seed;
  const clock = createClock({ realNow: Date.now, at: params.at, speed: params.speed });
  // The clip tool (clips.html) starts recording when the channel's own clock reaches the moment: the dev server only.
  if (devTools) /** @type {any} */ (window).scorchballClock = clock;
  // The live channel plays from the day keys (Task 271; docs/live.md §5): the league's seed is secret, so a day can be
  // played only once its key is out. It starts from the latest snapshot (Task 272), so only this week is played, not
  // every season since the first. ?seed= plays a seed instead (a dev aid).
  // Before season 1 (Task 275): when it starts and a countdown on the loading card, then on with loading.
  const seasonOne = createCalendar(config).seasonStart(1);
  if (clock.now() < seasonOne) await showPreseason($('loading'), seasonOne, clock.now, config.settings.live.timeZone);
  const keysMode = config.settings.live.mode === 'keys' && params.seed === null;
  const snapshot = keysMode ? await latestSnapshot(createCalendar(config), clock.now()) : null;
  const keys = keysMode ? await loadDayKeys(createCalendar(config), fetchKey, snapshot ? { fromSeason: snapshot.season, book: snapshot.keys } : {}) : null;
  if (keys) {
    await keys.topUp(clock.now());
    // A day without its key (or tomorrow's, in its last hour: the first match's pre-match card asks for it): BACK SOON,
    // checking again each minute.
    while (!keysReady(keys, clock.now())) {
      backSoon(true);
      await new Promise((resolve) => setTimeout(resolve, KEY_RETRY_MS));
      await keys.topUp(clock.now());
    }
    backSoon(false, { hide: false });
  }

  const stage = $('stage');
  applyPalette(document.documentElement);
  const ctx = mountStage(stage, /** @type {HTMLCanvasElement} */ ($('pitch')), /** @type {HTMLCanvasElement} */ ($('sharp')), { fill: params.fill });
  await document.fonts.load(`10px "VT323"`);

  // Let the loading card paint before the build, which holds the page until it's done (Task 227): after a frame, or
  // at most 100 ms (a background tab or a hidden frame gets no frames, and must still load).
  await new Promise((resolve) => { requestAnimationFrame(() => setTimeout(resolve)); setTimeout(resolve, 100); });
  const built = performance.now();
  const live = snapshot ? restoreLive(config, snapshot, { now: clock.now(), streams: keys?.streams })
    : new LiveLeague(config, { now: clock.now(), seed, streams: keys?.streams });
  // The TV guide's worker fetches the snapshot itself (by its full address: a worker's relative paths start from its own
  // folder); the page keeps only which it was.
  const snapshotFile = snapshot ? new URL(snapshotPath(snapshot.season), location.href).href : null;
  const buildMs = performance.now() - built;
  $('loading').hidden = true;
  stage.hidden = false;

  const { league, calendar } = live;
  // Crests (Task 166): the home team's icon in the centre circle (the final's too: it's at the better seed's ground),
  // and the flat crest on the interview shirt.
  const homeIcon = (/** @type {string} */ homeId) => centreIcon(league.teams[homeId]);
  const shirtCrest = (/** @type {CanvasRenderingContext2D} */ c, /** @type {string} */ teamId) =>
    (/** @type {number} */ cx, /** @type {number} */ cy) => drawShirtCrest(c, cx, cy, league.teams[teamId]);
  const keeperSlot = config.positions.keeper;
  // The celebrations (Task 278l): the setting, or ?cheer= on the dev server to compare.
  const cheers = params.cheer === null ? config.settings.animation.cheers : { goal: params.cheer, winners: params.cheer !== 'none' };

  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  /** @type {Map<string, import('./motion.js').Motion>} */
  const motions = new Map();
  /** @type {Map<string, import('./kits.js').MatchKits>} */
  const kitCache = new Map();
  const timelineOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => {
    let tl = timelines.get(m.id);
    if (!tl) timelines.set(m.id, (tl = createTimeline(m, config)));
    return tl;
  };
  // Players named "F. Last", times as "MON 21:58" in the league's zone: shared with the programme (Task 187).
  const { playerName, formatTime } = talkContext(live, timelineOf);
  const channel = {
    config,
    live,
    league,
    timelineOf,
    playerName,
    formatTime,
    /** The kits worn in a match, after the clash rule (kits.js). @param {string} homeId @param {string} awayId */
    kitsOf: (homeId, awayId) => {
      const key = `${homeId}|${awayId}`;
      let k = kitCache.get(key);
      if (!k) kitCache.set(key, (k = matchKits(league.teams[homeId].colours, league.teams[awayId].colours, config.settings.kits.clashDistance)));
      return k;
    },
  };
  const motionOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => {
    let mo = motions.get(m.id);
    if (!mo) motions.set(m.id, (mo = createMotion(channel.timelineOf(m), { matchId: m.id, homeId: m.homeId, keeperSlot, animation: config.settings.animation, play: config.settings.play, breakLineMs: config.settings.ceremonies.breakLineSeconds * 1000 })));
    return mo;
  };
  /** @type {Map<string, ReturnType<typeof createReferee>>} */
  const referees = new Map();
  /** The referee through a match (pitchside.js). @param {import('./liveLeague.js').LiveMatch} m */
  const refereeOf = (m) => {
    let r = referees.get(m.id);
    if (!r) referees.set(m.id, (r = createReferee(channel.timelineOf(m), motionOf(m), config.settings.animation)));
    return r;
  };
  /** @type {Map<string, ReturnType<typeof createManagers>>} */
  const managers = new Map();
  /** Both managers through a match (pitchside.js). @param {import('./liveLeague.js').LiveMatch} m */
  const managersOf = (m) => {
    let r = managers.get(m.id);
    if (!r) managers.set(m.id, (r = createManagers(channel.timelineOf(m), motionOf(m), config.settings.animation, { breakLineMs: config.settings.ceremonies.breakLineSeconds * 1000 })));
    return r;
  };
  /** Whether someone following `pos` is moving at t (so they stride). @param {(t: number) => { x: number, y: number } | null} pos @param {number} t */
  const moving = (pos, t) => {
    const [a, b] = [pos(t), pos(t - 150)];
    return Boolean(a && b && Math.hypot(a.x - b.x, a.y - b.y) > 1e-4);
  };
  /**
   * The referee and the managers to draw with the players (pitch.js people).
   * @param {{ homeId: string, awayId: string }} m
   * @param {(t: number) => { x: number, y: number, arm?: boolean } | null} ref  Where the referee is at t.
   * @param {(side: 'home' | 'away', t: number) => { x: number, y: number, mood?: import('./pitchside.js').ManagerMood } | null} manager
   * @param {number} t
   * @returns {import('./pitch.js').Person[]}
   */
  const peopleAt = (m, ref, manager, t) => {
    /** @type {import('./pitch.js').Person[]} */
    const out = [];
    const r = ref(t);
    if (r) {
      const kit = refereeKit(channel.kitsOf(m.homeId, m.awayId), config.settings.kits.clashDistance);
      out.push({ x: r.x, y: r.y, walking: moving(ref, t), look: { shirt: kit.primary, trim: kit.secondary, skinKey: 'referee', arms: r.arm ? 'right' : 'none' } });
    }
    for (const side of /** @type {const} */ (['home', 'away'])) {
      const g = manager(side, t);
      if (!g) continue;
      const teamId = side === 'home' ? m.homeId : m.awayId;
      // A black suit; the tie in the team's colour with the knot in their second colour (swapped if the main colour
      // would vanish against the suit, as with near-black kits).
      const { primary, secondary } = league.teams[teamId].colours;
      const [tie, knot] = colourDistance(primary, PALETTE.suit) < config.settings.kits.clashDistance ? [secondary, primary] : [primary, secondary];
      const arms = g.mood === 'cheer' ? 'both' : g.mood === 'despair' ? 'head' : g.mood === 'talk' ? (side === 'home' ? 'right' : 'left') : 'none';
      out.push({ x: g.x, y: g.y, walking: g.mood === 'pace' && moving((s) => manager(side, s), t), look: { shirt: PALETTE.suit, trim: PALETTE.suit, trousers: PALETTE.suit, tie, knot, skinKey: `manager|${teamId}`, arms } });
    }
    return out;
  };
  /** The referee and managers during a match, at `e` ms since its kick-off. @param {import('./liveLeague.js').LiveMatch} m @param {number} e */
  const matchPeople = (m, e) => peopleAt(m, (t) => refereeOf(m).at(t), (side, t) => managersOf(m).at(t).find((g) => g.side === side) ?? null, e);
  /**
   * The referee and managers in a walk-out (or a re-air's trimmed line-up, with opts.trimmed).
   * @param {{ homeId: string, awayId: string }} m @param {number} since @param {number} total  Its length, ms.
   * @param {{ ceremonies: any, jogSpeed: number, trimmed?: boolean }} opts
   */
  const walkOutPeople = (m, since, total, opts) => peopleAt(m, (s) => refereeWalkOut(s, total - s, opts), (side, s) => managerWalkOut(side, s, opts), since);
  /**
   * The referee and managers in the handshakes, from where they were at the whistle.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} since @param {number} total
   */
  const handshakePeople = (m, since, total) => {
    const end = channel.timelineOf(m).duration - 1;
    const opts = { ceremonies: config.settings.ceremonies, jogSpeed: config.settings.animation.jogSpeed, homeWon: winnerOf(m) === m.homeId };
    const refEnd = refereeOf(m).at(end);
    const mgrEnd = managersOf(m).at(end);
    return peopleAt(m, (s) => refereeHandshakes(refEnd, s, total, opts), (side, s) => {
      const from = /** @type {import('./pitchside.js').Manager} */ (mgrEnd.find((g) => g.side === side));
      return managerHandshakes(side, from, s, total, opts);
    }, since);
  };
  /**
   * The referee and managers through the trophy lift (Task 197, Tom): the referee and the runners-up's manager leave as
   * after any match (over the celebration), the champions' manager stays on the touchline, clapping and cheering now
   * and then.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} since @param {'home' | 'away'} champSide
   */
  const liftPeople = (m, since, champSide) => {
    const end = channel.timelineOf(m).duration - 1;
    const total = liftParts(config.settings.trophyLift).guardAt;
    const opts = { ceremonies: config.settings.ceremonies, jogSpeed: config.settings.animation.jogSpeed, homeWon: winnerOf(m) === m.homeId };
    const refEnd = refereeOf(m).at(end);
    const mgrEnd = managersOf(m).at(end);
    return peopleAt(m, (s) => refereeHandshakes(refEnd, s, total, opts), (side, s) => {
      const from = /** @type {import('./pitchside.js').Manager} */ (mgrEnd.find((g) => g.side === side));
      return side === champSide ? { x: from.x, y: from.y, mood: liftCoach(s) === 'cheer' ? 'cheer' : 'pace' } : managerHandshakes(side, from, s, total, opts);
    }, since);
  };
  /** @type {Map<string, import('./sounds.js').Cue[]>} Each match's cues from its events (sounds.js). */
  const cueCache = new Map();
  /** @type {Map<string, import('./commentary.js').Call[]>} Each match's commentary (commentary.js, Task 123). */
  const callCache = new Map();
  /** @type {Map<string, { breaks: number[], state: ReturnType<typeof passState> }>} Each match's passes in a row (Task 130). */
  const passCache = new Map();
  /** @type {Map<string, ReturnType<typeof holdState>>} Each match's count of a spell on the ball (Task 149). */
  const holdCache = new Map();
  /** @type {Map<string, import('./commentary.js').Call[]>} Each match's pass and holding calls said since the last jump (Task 179). */
  const saidCache = new Map();
  /** The season's shape, for who commentates (the final round's four, the playoffs' Announcer). */
  const shape = roundShape(config);
  /** @type {Map<string, { cues: import('./sounds.js').Cue[], times: number[] }>} Each match's crowd reactions (crowd.js), and when they come. */
  const crowdCache = new Map();
  /** @param {import('./liveLeague.js').LiveMatch} m @param {import('./timeline.js').Timeline} tl */
  const reactionsOf = (m, tl) => {
    let r = crowdCache.get(m.id);
    if (!r) {
      const cues = crowdCues(tl, { matchId: m.id, homeId: m.homeId, bigStage: m.stage !== 'regular', halfMinutes: config.rules.match.halfMinutes, goalPauseMs: config.settings.match.goalPauseSeconds * 1000 });
      r = { cues, times: cues.map((c) => c.at) };
      crowdCache.set(m.id, r);
    }
    return r;
  };
  /** @type {{ id: string, at: number, real: number } | null} What was heard last frame: a match or ceremony, and its moment. */
  let heard = null;
  /**
   * Since the last frame, for whatever is heard now (`id`): the span to play, or null after a jump (loading mid-match,
   * ?at=, waking, a new highlights clip, flipping matches, a new segment, a gap of more than SOUND_JUMP_MS).
   * @param {string} id @param {number} at
   * @returns {[number, number] | null}
   */
  const sinceHeard = (id, at) => {
    const real = performance.now();
    const prev = heard;
    heard = { id, at, real };
    // Something new that has only just begun while the viewer was watching (the live match taking over from the
    // walk-out, a ceremony after the whistle): play it from its start, so the first kick-off's whistle isn't lost.
    if (prev && prev.id !== id && real - prev.real <= HANDOVER_MS && at >= 0 && at < SOUND_JUMP_MS) return [-1, at];
    if (!prev || prev.id !== id || at <= prev.at || at - prev.at > SOUND_JUMP_MS || real - prev.real > SOUND_JUMP_MS) return null;
    return [prev.at, at];
  };
  /**
   * After a jump or turning sound on (Task 62): the sounds already under way at `at` (an anthem, a cheer, applause),
   * started from where they'd be by now, so nothing long is lost. Ones nearly over are left out.
   * @param {import('./sounds.js').Cue[]} cues @param {number} at  ms, on the cues' clock.
   */
  const resumeRinging = (cues, at) => {
    const real = performance.now();
    const durationMs = (/** @type {import('./sounds.js').Cue} */ c) => recipe(c.kind, c.seed, c).duration * 1000;
    // Not one still ringing from before (Task 154): coming back to the tab used to start it again on top of itself.
    const ringing = (/** @type {import('./sounds.js').Cue} */ c) => (ringingUntil.get(cueKey(c)) ?? 0) > real;
    // Swelling in, the crowd's quieter (Task 181: switching into a cheering match jolted).
    const { fadeInMs, crowd } = config.settings.sound.resume;
    for (const c of resumeCues(cues, at, durationMs, ringing, { lookbackMs: RESUME_LOOKBACK_MS, minMs: RESUME_MIN_MS })) {
      playCue(CROWD_KINDS.has(c.kind) ? { ...c, gain: (c.gain ?? 1) * crowd } : c, (at - c.at) / 1000, fadeInMs / 1000);
    }
  };
  /** @type {Map<string, number>} Each cue started, by cueKey, until when (real ms) it rings (Task 154). */
  const ringingUntil = new Map();
  /**
   * Start a cue (from its start, or `from` s into it, swelling in over `fadeIn` s), noting until when it rings.
   * @param {import('./sounds.js').Cue} c @param {number} [from] @param {number} [fadeIn]
   */
  const playCue = (c, from = 0, fadeIn = 0) => {
    audio.play(c.kind, from > 0 ? { ...c, from, fadeIn } : c);
    if (!audio.audible) return; // nothing played: turning sound on, or the tab showing again, should start it
    const real = performance.now();
    ringingUntil.set(cueKey(c), real + recipe(c.kind, c.seed, c).duration * 1000 - from * 1000);
    if (ringingUntil.size > 400) for (const [k, until] of ringingUntil) if (until < real) ringingUntil.delete(k);
  };
  /**
   * How far ahead of the picture sounds are started, in ms on the cues' clock (phones, Tom: on Chrome on a phone a kick
   * was heard as the pass arrived): the device's delay to the speaker and the sound's own start ahead (audio.lead), so
   * each leaves the speaker at its moment on screen.
   */
  const leadMs = () => audio.lead * 1000 * clock.speed;
  /**
   * Start a cue at its moment, `now` being where the frame is on the cue's clock: started early by the device's delay
   * (audio.lead), so it's heard as the picture shows it; one already too close is started at once, and the readout
   * (?perf=1) counts how late it's heard.
   * @param {import('./sounds.js').Cue} c @param {number} now
   */
  const playDue = (c, now) => {
    const delay = (c.at - now) / clock.speed / 1000 - audio.lead;
    playCue(delay > 0 ? { ...c, delay } : c);
    if (perf && audio.audible) perf.sound(-delay * 1000);
  };
  /**
   * After a jump, the cues coming up within the lead (the window the next frames start from has moved past them).
   * @param {import('./sounds.js').Cue[]} cues @param {number} at
   */
  const playComing = (cues, at) => {
    const ahead = leadMs();
    for (const c of cues) if (c.at > at && c.at <= at + ahead) playDue(c, at);
  };
  const murmurGaps = createRng('murmur|gaps');
  /** The murmur's loudness this frame, for its bed (?murmur=bed); 0 where none is heard (cards, the studio). */
  let murmurWanted = 0;
  let nextMurmur = 0;
  let murmurs = 0;
  /**
   * The murmur under the play (Tom, 2026-10-04): a small roar, played quietly, a new take every 0.6–1.1 s so they
   * overlap into a continuous crowd; a little louder as the crowd's level rises (crowd.js). Only while a match or a
   * ceremony is heard: it fades out by itself on cards and in the studio.
   * @param {number} level  The crowd's level, 0–1. @param {number} [share]  How much of it plays (dips at stoppages).
   */
  const murmur = (level, share = 1) => {
    // ?murmur=bed (phones): one loop at this frame's loudness in place of the overlapping takes.
    if (params.murmurBed) {
      murmurWanted = Math.max(murmurWanted, (0.5 + level) * share);
      return;
    }
    const real = performance.now();
    if (!audio.on || clock.speed > 2 || real < nextMurmur) return;
    audio.play('murmur', { seed: `murmur|${murmurs++}`, gain: (0.5 + level) * share });
    nextMurmur = real + murmurGaps.float(600, 1100);
  };
  /**
   * A match's commentary calls, worked out (and its commentator's clips fetched) the first time it plays with sound on.
   * @param {import('./liveLeague.js').LiveMatch} m
   */
  /**
   * Play a commentary call, and its second clip straight after it with no gap if it has one (Task 247b: "Bonnefoy!
   * What a scorcher!"). @param {import('./commentary.js').Call} c
   */
  const playCall = (c) => {
    const played = audio.playClip(c.url, { level: c.level ?? undefined, queue: 'wait' });
    if (played && c.then) audio.playClip(c.then, { level: c.level ?? undefined, queue: 'wait', joined: true });
  };
  const callsOf = (m) => {
    let calls = callCache.get(m.id);
    if (!calls) {
      const who = commentatorFor(m, config.commentary, shape);
      calls = commentaryCalls(channel.timelineOf(m), { matchId: m.id, homeId: m.homeId, commentatorId: who.id, data: config.commentary, settings: config.settings.commentary, stage: m.stage, surnameOf: (id) => league.players[id]?.lastName });
      callCache.set(m.id, calls);
      // The calls naming a scorer (Task 247b): their clips, this match's only.
      audio.loadClips(calls.flatMap((c) => (c.url.includes('/names/') ? [c.url] : [])));
      // Only this match's commentator's clips (a few MB each), fetched as the match first plays with sound on: the lines
      // they speak in moments on air (Task 149).
      audio.loadClips(linesFor(config.commentary, who.id).map((l) => clipUrl(who.id, l.id)));
    }
    return calls;
  };
  /**
   * The calls after the final whistle (Task 208): full time is called afterWhistleMs after it, by when the handshakes
   * or the trophy lift are on, so they play them. `span` is theirs: ms since the whistle.
   * @param {import('./liveLeague.js').LiveMatch} m @param {[number, number]} span
   */
  const afterWhistleCalls = (m, span) => {
    const end = channel.timelineOf(m).duration;
    for (const c of callsOf(m)) if (c.at - end > span[0] && c.at - end <= span[1]) playCall(c);
  };
  /**
   * The match's own sounds at and after the final whistle (Task 277b): the whistle sits at the very end of the match, which
   * the live picture never reaches, so the handshakes or the lift play it (and the crowd's full-time roar after it), on
   * the frame they take over (`span` from -1: ms since the whistle). Only a match that was heard (its cues worked out).
   * @param {import('./liveLeague.js').LiveMatch} m @param {[number, number]} span
   */
  const afterWhistleCues = (m, span) => {
    const events = cueCache.get(m.id);
    if (!events) return;
    const end = channel.timelineOf(m).duration;
    const real = performance.now();
    for (const c of events) if (c.at - end > span[0] && c.at - end <= span[1] && (ringingUntil.get(cueKey(c)) ?? 0) <= real) playDue(c, span[1] + end);
  };
  /**
   * The sounds of the match on screen since the last frame (Tasks 51–52): its cues, the crowd's reactions and the
   * murmur, and the commentator's calls (Task 123; live matches and re-airs, not highlights). After a jump, only
   * what's still ringing joins (part-way; never a call); nothing above ?speed=2.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} at  ms since its kick-off.
   * @param {import('./motion.js').Pose | null} pose @param {{ bigStage: boolean, reair: boolean, commentary: boolean }} o
   */
  const matchSounds = (m, at, pose, { bigStage, reair, commentary }) => {
    // Switched here from another of the matches on now (Task 181): the new feed eases in.
    if (heard && heard.id !== m.id && liveGroup?.some((g) => g.id === heard?.id) && performance.now() - heard.real < SOUND_JUMP_MS) {
      const { switchLevel, switchReturnMs, hush, hushHoldMs, hushFadeMs } = config.settings.sound.resume;
      audio.enter(switchLevel, switchReturnMs);
      // Which of the crowd's sounds go silent for a moment (Tom, to find the spike): ?hush= overrides the setting.
      const which = params.hush ?? hush;
      audio.hush(which === 'both' ? ['roar', 'murmur'] : which === 'none' ? [] : [which], hushHoldMs, hushFadeMs);
    }
    const span = sinceHeard(m.id, at);
    const tl = channel.timelineOf(m);
    const level = crowdLevel(tl, pose, at, { homeId: m.homeId, bigStage, reair, settings: config.settings.crowd });
    const crowd = reactionsOf(m, tl);
    // One share for both (Task 60): the murmur dips at stoppages and in quiet spells, and the fans bob less with it.
    const lively = liveliness(tl, crowd.times, at, config.settings.crowd);
    standsNow = standsMood(tl, at, level * lively, { homeId: m.homeId, goalPauseMs: config.settings.match.goalPauseSeconds * 1000 });
    murmur(level, lively);
    if (!audio.on || clock.speed > 2) return;
    let events = cueCache.get(m.id);
    if (!events) {
      events = [
        ...eventCues(tl, { matchId: m.id, shotMs: config.settings.animation.shotMs }),
        ...crowd.cues,
      ].sort((a, b) => a.at - b.at);
      cueCache.set(m.id, events);
    }
    if (!span) {
      const passes = passCache.get(m.id);
      if (passes) passJump(passes.state);
      const hold = holdCache.get(m.id);
      if (hold) holdJump(hold);
      saidCache.get(m.id)?.splice(0);
      resumeRinging(events, at);
      return playComing(cuesBetween(events, motionOf(m), at, at + leadMs(), m.id), at);
    }
    // The sounds, ahead of the picture by the lead; the commentary on the picture's own time.
    const [from, to] = leadWindow(span, leadMs());
    for (const c of cuesBetween(events, motionOf(m), from, to, m.id)) playDue(c, span[1]);
    if (!commentary) return;
    const cues = cuesBetween(events, motionOf(m), span[0], span[1], m.id);
    const calls = callsOf(m);
    const who = commentatorFor(m, config.commentary, shape);
    // Never over the call before (Task 179): a one-two's outcome or a whistle can come before the last clip has ended.
    for (const c of calls) if (c.at > span[0] && c.at <= span[1]) playCall(c);
    let said = saidCache.get(m.id);
    if (!said) saidCache.set(m.id, (said = []));
    const dynamic = { matchId: m.id, commentatorId: who.id, data: config.commentary, settings: config.settings.commentary, said };
    // Passes in a row, counted as they're drawn (Task 130): each pass is a kick cue.
    let passes = passCache.get(m.id);
    if (!passes) {
      passes = { breaks: passBreaks(tl), state: passState() };
      passCache.set(m.id, passes);
    }
    for (const c of cues) {
      if (c.kind !== 'kick') continue;
      const call = passCall(passes.state, c.at, passes.breaks, calls, dynamic);
      if (call) audio.playClip(call.url, { delay: (call.at - c.at) / 1000, queue: 'skip' });
    }
    // Holding the ball (Task 149): whoever the picture has on it, frame by frame.
    let hold = holdCache.get(m.id);
    if (!hold) holdCache.set(m.id, (hold = holdState()));
    const holderId = pose?.ball?.held ? motionOf(m).holderAt(at) : null;
    const keeper = Boolean(holderId && pose?.players.find((p) => p.playerId === holderId)?.slot === keeperSlot);
    // Not while play waits (Task 179): a substitution, a foul, a free shot being set, a goal, a break between periods.
    const play = tl.stateAt(at);
    const stopped = play.paused !== null || !IN_PLAY.has(play.phase);
    const held = holdCall(hold, at, holderId, { keeper, stopped, warm: play.heatStage !== 'cool' }, calls, dynamic);
    if (held) audio.playClip(held.url, { delay: (held.at - at) / 1000, queue: 'skip' });
  };
  /**
   * The sounds of a walk-out or handshakes since the last frame: the crowd's applause.
   * @param {'walk_out' | 'handshakes'} kind @param {string} matchId @param {number} since  ms since the segment began.
   * @param {number} total  Its length, ms. @param {boolean} reair  A re-air's (its trimmed line-up has no applause or anthems).
   * @param {{ homeId: string, awayId: string }} teams
   */
  const ceremonySounds = (kind, matchId, since, total, reair, teams) => {
    const span = sinceHeard(`${kind}|${matchId}|${total}`, since);
    const level = config.settings.crowd.ceremony * (reair ? config.settings.crowd.reair : 1);
    standsNow = reair && kind === 'walk_out' ? { level, jump: null, gasp: null, wave: null } : ceremonyMood(kind, since, total, config.settings.ceremonies, level);
    // The murmur thins with the crowd (Task 84): a half-full ground for the walk-out sounds like one.
    murmur(level, (fullNow.home + fullNow.away) / 2);
    if (!audio.on || clock.speed > 2 || (reair && kind === 'walk_out')) return;
    const homeWon = kind === 'handshakes' && 'events' in teams && winnerOf(/** @type {import('./liveLeague.js').LiveMatch} */ (teams)) === teams.homeId;
    const cues = ceremonyCues(kind, total, config.settings.ceremonies, matchId, teams, (id) => league.teams[id].anthem, homeWon);
    if (!span) {
      resumeRinging(cues, since);
      return playComing(cues, since);
    }
    const [from, to] = leadWindow(span, leadMs());
    for (const cue of cues) if (cue.at > from && cue.at <= to) playDue(cue, span[1]);
    // The handshakes are always given their match.
    if (kind === 'handshakes') {
      afterWhistleCues(/** @type {import('./liveLeague.js').LiveMatch} */ (teams), span);
      afterWhistleCalls(/** @type {import('./liveLeague.js').LiveMatch} */ (teams), span);
    }
  };
  /** @type {{ key: string, cues: import('./sounds.js').Cue[] } | null} The grounds tour's sounds for the ground on now. */
  let tourCues = null;
  /**
   * AROUND THE GROUNDS' sounds (Tom's note 14, task 3): the swish as each ground after the first wipes in, then the
   * scene's own (groundScenes.js sceneCues: the balls struck, the whistle, the mower, the sprinklers, the hammer, the
   * broom), on time with the picture like a match's; and for training, the few early fans' murmur.
   * @param {Extract<import('./programme.js').Segment, { kind: 'grounds' }>} seg
   * @param {import('./groundScenes.js').Ground} g @param {number} t
   */
  const tourSounds = (seg, g, t) => {
    const since = t - seg.from;
    const key = `grounds|${seg.tourFrom}|${seg.visit}`;
    const span = sinceHeard(key, since);
    if (seg.fans > 0) murmur(config.settings.crowd.ceremony, (fullNow.home + fullNow.away) / 2);
    if (!audio.on || clock.speed > 2) return;
    if (tourCues?.key !== key) {
      /** @type {import('./sounds.js').Cue[]} */
      const swish = seg.visit > 0 ? [{ kind: 'swish', at: 0, seed: key }] : [];
      tourCues = { key, cues: [...swish, ...sceneCues(seg.scene, g, seg.from, seg.until, { night: seg.night })] };
    }
    if (!span) return playComing(tourCues.cues, since);
    const [from, to] = leadWindow(span, leadMs());
    for (const cue of tourCues.cues) if (cue.at > from && cue.at <= to) playDue(cue, span[1]);
  };
  /** @type {{ key: string | null, real: number } | null} The segment that might sting, as of last frame. */
  let stingSeen = null;
  /**
   * A sting as the post-match show opens, as each highlights package starts and at a re-air's intro card (Task 53),
   * only when the segment starts while the viewer is watching (not on load or after a jump).
   * @param {import('./programme.js').Segment} seg
   */
  const stings = (seg) => {
    /** @type {[string, 'show' | 'highlights' | 'replay'] | null} */
    const now = seg.kind === 'full_time' ? [`ft|${seg.match.id}`, 'show']
      : seg.kind === 'highlights' ? [`hl|${seg.reel?.kind ?? seg.match.id}|${seg.until}`, 'highlights']
        : seg.kind === 'reair' && seg.part === 'intro' ? [`reair|${seg.match.id}|${seg.from}`, 'replay'] : null;
    const real = performance.now();
    const prev = stingSeen;
    stingSeen = { key: now ? now[0] : null, real };
    if (!now || !prev || prev.key === now[0] || real - prev.real > SOUND_JUMP_MS || !audio.on || clock.speed > 2) return;
    audio.play('sting', { sting: now[1], seed: now[0] });
  };
  const captionCtx = { playerName: channel.playerName, teamName: (/** @type {string} */ id) => league.teams[id].shortName, captions: config.settings.captions };
  // Records falling (Task 220b): each match's record captions, worked out once (live and re-aired; not in highlights, Tom).
  /** @type {Map<string, import('./captions.js').RecordCaption[]>} */
  const recordCache = new Map();
  const recordsOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => {
    let r = recordCache.get(m.id);
    if (!r) recordCache.set(m.id, (r = recordCaptions(live.records.inMatch(m.id), channel.timelineOf(m), captionCtx)));
    return r;
  };

  const programme = createProgramme(live, channel.timelineOf, channel);
  const scorebug = createScorebug(channel);
  const caption = createCaption(channel);
  const callout = createCallout();
  // A team in TABLE opens its card in the side panel's place (Task 224).
  const table = createTablePanel(channel, { openTeam: (id) => side.openCard({ kind: 'team', id }) });
  const side = createSidePanel(channel, table);
  // Sound (Task 50): silent until the viewer turns it on (M or Settings); the first turn-on starts the audio, which
  // browsers only allow from a click or key press. A soft chime confirms it.
  // The listening switches for phones (Firefox's crowd popped): ?latency= (a larger audio buffer, in seconds) and
  // ?crowdrate= (the crowd rendered at this rate; 48000 needs no resampling).
  const soundSettings = config.settings.sound;
  // The recordings (phones; recordings.js): every synthesized sound recorded ahead, played from files; ?recordings=off
  // (or none recorded) builds them here as before.
  const recordings = soundSettings.recordings.enabled && !params.recordingsOff ? await loadRecordings(soundSettings.recordings) : null;
  const audio = createAudio({
    ...soundSettings,
    ...(params.latency !== null ? { latency: params.latency } : {}),
    ...(params.ahead !== null ? { ahead: params.ahead } : {}),
    ...(params.crowdRate !== null && soundSettings.prerender ? { prerender: { ...soundSettings.prerender, crowdRate: params.crowdRate } } : {}),
  }, config.settings.commentary, recordings);
  if (perf) {
    audio.setMeter({ add: (part, ms) => perf.add(part, ms), rendered: (ms) => perf.rendered(ms), dropped: () => perf.dropped() });
    meterSharp((ms) => perf.add('text', ms));
  }
  // A hidden tab goes quiet (Task 181): its frames are slowed or stopped, so the sounds due over a stretch came out
  // together. Back again, the first frame is a jump (SOUND_JUMP_MS), so what's under way swells back in.
  const hiddenNow = () => audio.setHidden(document.visibilityState === 'hidden', config.settings.sound.resume.hiddenFadeMs);
  document.addEventListener('visibilitychange', hiddenNow);
  hiddenNow();

  // Updates (Task 274; docs/live.md §3): version.json is checked every few minutes; a new version reloads a hidden or
  // silent channel, and shows UPDATE READY over one playing sound. Not while the dev tools move the clock (?at=, ?speed=:
  // a reload would jump back), nor on the dev server (no version.json).
  const updateReady = $('update-ready');
  updateReady.addEventListener('click', () => reloadForUpdate({ layout: layout.mode, sound: audio.on }));
  let updateWaiting = false;
  /** A new version is out: reload if that won't cut into anything, otherwise say so. */
  const updateNow = () => {
    if (!updateWaiting) return;
    if (updateAction({ hidden: document.visibilityState === 'hidden', soundOn: audio.on }) === 'reload') reloadForUpdate({ layout: layout.mode, sound: audio.on });
    else updateReady.hidden = false;
  };
  document.addEventListener('visibilitychange', updateNow);
  const startUpdateChecks = async () => {
    if (params.at !== null || params.speed !== 1) return;
    const mine = await fetchVersion();
    if (!mine) return;
    books.setVersion(mine);
    setInterval(async () => {
      const out = await fetchVersion();
      if (out && out !== mine) {
        updateWaiting = true;
        updateNow();
      }
    }, config.settings.updates.checkSeconds * 1000);
  };
  // Full or Broadcast (Task 55): B or the scorebug's switch. Each load starts in Full (or ?layout=broadcast).
  // After a dev-panel jump with sound on (?sound=on, Task 62): sound can't restart by itself, so offer it.
  const soundPrompt = $('sound-prompt');
  // Back from a reload of its own for an update (Task 274): the layout it had, and sound offered again if it was on.
  const kept = resumed();
  // On every load until sound is on (the tour, Tom 2026-10-13: a first visit had no hint that there's sound).
  soundPrompt.hidden = false;
  soundPrompt.addEventListener('click', () => { if (!audio.on) buttons.toggleSound(); });
  const layout = createLayout(config.settings.broadcast, kept && !location.search.includes('layout=') ? kept.layout : params.layout);
  stage.classList.toggle('broadcast', layout.mode === 'broadcast');
  // The buttons' tooltips in the channel's look (Task 277b, Tom's pick B: amber).
  installTooltips(stage, 'amber');
  const buttons = createButtons({
    onSound: (on) => {
      soundPrompt.hidden = true;
      audio.start();
      audio.setOn(on);
      // Sound off with an update waiting: now it can reload (Task 274).
      if (!on) updateNow();
      // The next frame counts as a jump, so whatever is already under way joins in part-way (Task 62).
      heard = null;
      if (on) audio.play('sub', { seed: 'sound-on' });
      // M, or the prompt, while the levels pane is open: its Sound switch follows.
      levels.render();
    },
    isSoundOn: () => audio.on,
    onGuide: () => { if (layout.mode === 'full') guide.toggle(clock.now()); },
    onBook: (id) => {
      if (layout.mode !== 'full') return;
      if (id === 'chronicle') chroniclePane.toggle();
      else if (id === 'audience') audiencePane.toggle();
      else books.toggle(id);
    },
    onSpeaker: () => levels.toggle(),
  });
  // The levels pane in the sound button (Task 129): Sound, Crowd, and the voices (Task 256: commentary apart from the studio).
  const levels = createLevels({
    isSoundOn: () => audio.on,
    setSound: () => { buttons.toggleSound(); },
    setCrowd: (on) => audio.setCrowd(on),
    setCommentary: (on) => audio.setCommentary(on),
    setStudio: (on) => audio.setStudio(on),
  });
  // The pop-up pane and the TV guide (Task 115; §17.2): Full only. The guide's day is worked out in a worker
  // (guideWorker.js) from a league of its own, so opening it never stutters the picture.
  const pane = createPane();
  const guideWorker = new Worker(new URL('./guideWorker.js', import.meta.url), { type: 'module' });
  /** @type {Map<number, (day: import('./guide.js').GuideDay | null) => void>} */
  const dayWaits = new Map();
  let dayAsks = 0;
  guideWorker.addEventListener('message', (e) => {
    dayWaits.get(e.data.id)?.(e.data.day);
    dayWaits.delete(e.data.id);
  });
  // A worker that fails to start or throws answers every wait with null, so the guide asks again (Task 271).
  guideWorker.addEventListener('error', (e) => {
    console.error("The TV guide's worker failed:", e.message);
    for (const resolve of dayWaits.values()) resolve(null);
    dayWaits.clear();
  });
  const guide = createGuide({
    pane,
    teams: league.teams,
    live,
    config,
    dayAt: async (t) => {
      // Its day's key fetched first if it's out (SCHEDULE's tomorrow: about 12 hours ahead, Task 271).
      if (keys) await keys.topUp(t).catch(() => {});
      return new Promise((resolve) => {
        const id = ++dayAsks;
        dayWaits.set(id, resolve);
        guideWorker.postMessage({ config, seed, book: keys?.book, snapshot: snapshotFile, t, id });
      });
    },
    // The final's teams wait until both semifinals have finished on screen.
    semisDone: (t) => {
      const season = calendar.seasonAt(t);
      const semis = calendar.slots(season).filter((sl) => sl.stage === 'semifinal').length;
      return live.matchesIn(season).filter((m) => m.stage === 'semifinal' && isFinished(m, t, (x) => channel.timelineOf(x).duration)).length === semis;
    },
    timeZone: config.settings.live.timeZone,
    onChange: () => buttons.lit('guide', guide.open),
  });
  // The Rulebook and About (Task 164): the league's rules in tabs, and the project in a few paragraphs.
  // The tour (Milestone 5⅞): offered once, on a first visit; any time from INFO's GUIDE.
  // On a phone (phones, step 4; ?phone= either way): the desktop's controls hidden, the phone's in the bands beside the
  // picture. It opens in Full as on the desktop (Tom). The tour has the phone's own steps there (the tour, round 2).
  const phone = isPhone({ coarse: matchMedia('(pointer: coarse)').matches, screenW: screen.width, screenH: screen.height }, params.phone);
  document.body.classList.toggle('phone', phone);
  const tour = createTourView({ config, layout: () => layout.mode, storage: (() => { try { return localStorage; } catch { return null; } })(), phone });
  const books = createBookPanes({ pane, config, calendar, now: () => clock.now(), onChange: (id, open) => buttons.lit(id, open), onUnseen: (on) => buttons.dot('about', on), onTour: () => tour.start() });
  tour.offer();
  // The nudge to turn sound on (CLICK FOR SOUND; the phone's pulsing SOUND) gives up after sound.promptSeconds of the
  // channel showing without sound (Tom, 2026-10-14: a viewer who hasn't turned it on by then wants it off), the count held
  // while the tour is open or the tab hidden.
  let nudgeLeft = config.settings.sound.promptSeconds * 1000;
  let nudgeAt = performance.now();
  const nudging = () => nudgeLeft > 0 && !audio.on;
  setInterval(() => {
    const now = performance.now();
    const dt = now - nudgeAt;
    nudgeAt = now;
    if (!nudging() || tour.open || document.visibilityState !== 'visible') return;
    nudgeLeft -= dt;
    if (nudgeLeft <= 0) soundPrompt.hidden = true;
  }, 250);
  // The CHRONICLE (Task 219): the history and the records, from the chronicle (only what has aired).
  const chroniclePane = createChroniclePane({ pane, live, config, now: () => clock.now(), onChange: (open) => buttons.lit('chronicle', open) });
  // AUDIENCE (Task 260): the polls, voted on through the audience module (the dev server until the launch's service).
  const audience = createAudience({ endpoint: config.settings.audience.endpoint, noteCooldownSeconds: config.settings.audience.noteCooldownSeconds });
  // Counted, anonymously, for the Director's desk (Task 277e).
  // How many are watching, as the ticker's last item (Tom, 2026-10-16; off until enough people watch, ?watching=on).
  /** @type {number | null} */
  let watchingNow = null;
  const showWatching = config.settings.audience.watchingTicker || params.watching;
  startHellos(audience, config.settings.audience.helloMinutes, document, showWatching ? (n) => { watchingNow = n; } : null, params.from);
  // The link's tag (?from=, docs/launch-plan.md) is read once and taken out of the address bar, so a viewer who shares
  // their address doesn't pass our tag on.
  if (new URLSearchParams(location.search).has('from')) {
    const url = new URL(location.href);
    url.searchParams.delete('from');
    history.replaceState(history.state, '', url);
  }
  // What was on air, for the line sent with a note (Task 261): the segment at the channel's clock and the match played
  // on screen; the last frame's match while it's fresh (the viewer's own pick in a simultaneous round), else the
  // segment's (frames pause in a hidden tab).
  const noteLine = () => {
    const t = clock.now();
    const seg = programme.at(t);
    const playing = seg.kind === 'live' || seg.kind === 'highlights' || (seg.kind === 'reair' && seg.part === 'match') ? seg.match : null;
    const shown = playing && onAirNow && t - onAirNow.t < 2000 && onAirNow.seg.kind === seg.kind ? onAirNow.shown ?? playing : playing;
    const about = shown ?? ('match' in seg ? seg.match : null);
    const s = shown ? channel.timelineOf(shown).stateAt(seg.kind === 'live' ? t - shown.kickoff : /** @type {any} */ (seg).elapsed ?? 0) : null;
    return onAirLine({
      t,
      season: calendar.seasonAt(t),
      timeZone: config.settings.live.timeZone,
      // A re-air's part too ("reair full_time"), since a re-air runs from its intro to the interview.
      kind: seg.kind === 'reair' ? `reair ${seg.part}` : seg.kind,
      match: about?.homeId ? { stage: about.stage, round: about.round, home: league.teams[about.homeId].abbr, away: league.teams[about.awayId].abbr } : null,
      play: s ? { score: /** @type {[number, number]} */ (s.score), period: PERIOD_LABEL[s.phase] ?? '', clock: s.phase === 'half_time' || s.phase === 'finished' ? '' : mmss(s.clock) } : null,
      layout: layout.mode,
    });
  };
  // MOMENTS (Milestone 5¾; docs/channel.md §25): what this viewer has watched live, kept in this browser.
  const momentStore = createMomentStore(config.settings.moments.storageKey);
  // The dev server only: ?moments=reset starts afresh, ?moments=demo fills in a viewer about two weeks in.
  if (params.moments === 'reset') momentStore.reset();
  else if (params.moments === 'demo') {
    demoMoments(momentStore.data, config, clock.now());
    momentStore.save();
  }
  const momentTracker = createMomentTracker({
    config,
    data: momentStore.data,
    timelineOf: channel.timelineOf,
    recordsOf,
    seasonAt: (t) => calendar.seasonAt(t),
    abbr: (id) => league.teams[id].abbr,
    onChange: () => momentStore.changed(),
  });
  // Fan Coins (docs/channel.md §29), version 2 (§29.6, Tom 2026-10-17): earned here by version 1's rates, banked with the
  // audience service (coinBank.js), every spend shared through its queues and drawn from its feed. The dev server only:
  // ?coins=reset starts afresh (a new viewer), ?coins=rich gives 500 to spend.
  const fc = config.settings.fanCoins;
  const coinStore = fc.enabled ? createMomentStore(fc.storageKey, { normalize: normalizeCoins }) : null;
  if (coinStore && params.coins === 'reset') coinStore.reset();
  if (coinStore && !coinStore.data.viewer) {
    coinStore.data.viewer = newViewer();
    coinStore.save();
  }
  /** A match by the service's key for it (s<season>-<slot>). @param {string} key */
  const matchByKey = (key) => {
    const [season, slot] = key.slice(1).split('-').map(Number);
    return live.matchesIn(season).find((m) => m.slot === slot) ?? null;
  };
  /** Set once the AUDIENCE pane exists (the bank answers before it's made). @type {{ refreshCoins: () => void } | null} */
  let audiencePaneRef = null;
  /** The feed as spends to draw, kept in the store's active list (a shout still on kept from before). */
  const showFeed = () => {
    if (!coinStore || !coinBank) return;
    coinStore.data.active = spendsFromFeed(config, coinBank.spends(), { matchOf: matchByKey, timelineOf: channel.timelineOf, teamOf: (id) => league.teams[id], nameOf: (id) => league.players[id]?.lastName.toUpperCase() ?? null, previous: coinStore.data.active, delayOf: (id) => coinBank.delayOf(id), now: clock.now() });
  };
  const coinBank = coinStore ? createCoinBank({
    config,
    data: coinStore.data,
    endpoint: config.settings.audience.endpoint,
    fetch: (url, init) => fetch(url, init),
    day: () => dayOf(Date.now()),
    onChange: () => {
      showFeed();
      coinStore.save();
      audiencePaneRef?.refreshCoins();
    },
  }) : null;
  /** A re-aired match's spends as they were live, made once per answer (2026-10-18). @type {{ rows: any[], spends: import('./fanCoins.js').Spend[] } | null} */
  let replayMade = null;
  /** The chants, flags and shouts to show again in a re-air (asked for from its intro on, so they're there for the match). @param {import('./programme.js').Segment} seg */
  const replaySpends = (seg) => {
    if (!coinBank || seg.kind !== 'reair') return [];
    const rows = coinBank.replayOf(matchKey(seg.match));
    if (replayMade?.rows !== rows) replayMade = { rows, spends: spendsFromFeed(config, rows, { matchOf: matchByKey, timelineOf: channel.timelineOf, teamOf: (id) => league.teams[id], nameOf: (id) => league.players[id]?.lastName.toUpperCase() ?? null }) };
    return replayMade.spends;
  };
  if (coinBank) {
    coinBank.start();
    // Spends move on (a shout's start past a goal, matches newly played): drawn afresh now and then.
    setInterval(showFeed, 5000);
    if (params.coins === 'rich') {
      fetch(`${config.settings.audience.endpoint}/coins/dev-rich`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ viewer: coinStore?.data.viewer }) }).then(() => coinBank.checkIn()).catch(() => {});
    }
  }
  const earner = coinStore ? createEarner({ config, data: coinStore.data, timelineOf: channel.timelineOf, onChange: () => coinStore.changed() }) : null;
  const fanPictures = picturesOf(config);
  /** The spends seen in the stands: the bar's BROADCAST ›, the page's WATCH IN BROADCAST. */
  const SPENDS_IN_STANDS = new Set(['chant', 'flag', 'shout']);
  // The bar under the scorebug (version 2, Tom's pick b): a tap on one in the stands switches to Broadcast.
  const fanOverlays = coinStore ? createFanOverlays({ stage, plusSeconds: fc.plusSeconds, onBar: (kind) => { if (SPENDS_IN_STANDS.has(kind) && layout.mode === 'full') toggleLayout(); } }) : null;
  /** One's own spends the bar has told of, and the one it's telling (until, real ms). */
  const barTold = new Set();
  /** @type {{ kind: string, until: number } | null} */
  let barNow = null;
  /** What's on screen for a spend: the last frame's moment and segment. */
  const coinsAt = () => {
    const t = onAirNow?.t ?? clock.now();
    return { t, seg: onAirNow?.seg ?? programme.at(t), timelineOf: channel.timelineOf };
  };
  /**
   * A team's top scorer this season, by surname, from the matches already over on screen (nothing still to air, so no
   * spoilers): the fan shout's I ♥ (its id goes to the service, its name on the page).
   * @param {string} teamId @param {number} t @returns {{ id: string, name: string } | null}
   */
  const topScorerOf = (teamId, t) => {
    /** @type {Map<string, number>} */
    const goals = new Map();
    for (const m of live.matchesIn(calendar.seasonAt(t))) {
      if (m.kickoff + channel.timelineOf(m).duration > t) continue;
      for (const e of m.events) if (e.type === 'goal' && e.teamId === teamId && e.playerId) goals.set(e.playerId, (goals.get(e.playerId) ?? 0) + 1);
    }
    const best = [...goals.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { id: best[0], name: league.players[best[0]].lastName.toUpperCase() } : null;
  };
  /** The next live match's kick-off after `t`, as SCHEDULE has it. @param {number} t @returns {number | null} */
  const nextKickoff = (t) => {
    const season = calendar.seasonAt(t);
    for (const n of [season, season + 1]) {
      const next = calendar.slots(n).find((x) => x.kickoff > t);
      if (next) return next.kickoff;
    }
    return null;
  };
  /** Where a +1 rises from: the Audience button, the phone's own or the side column's. @returns {HTMLElement | null} */
  const audienceButton = () => {
    const ph = /** @type {HTMLElement | null} */ (document.querySelector('.phone-btn[data-id="audience"]'));
    return ph && ph.offsetParent !== null ? ph : buttons.element('audience');
  };
  /** The live match on screen and its halves, for a spend's queue (version 2). */
  const queueAt = () => {
    const a = coinsAt();
    const match = a.seg.kind === 'live' ? a.seg.match : null;
    return { t: a.t, match, halves: match ? halvesOf(match, channel.timelineOf) : null, blocked: boardBlocked(config, live.calendar, a.t) };
  };
  /** A spend's queue (fanCoins.js queueState). @param {import('./fanCoins.js').SpendKind} kind @param {'home' | 'away'} [end] */
  const queueOf = (kind, end) => queueState(config, /** @type {any} */ (coinStore).data, /** @type {any} */ (coinBank).spends(), /** @type {any} */ (coinBank).state.mine, kind, queueAt(), end);
  const coinsTab = coinStore && coinBank ? (/** @type {(page: boolean) => void} */ onPage) => createCoinsView({
    config,
    data: coinStore.data,
    stateOf: (kind, end) => queueOf(kind, end),
    now: () => coinsAt().t,
    broadcast: { full: () => layout.mode === 'full', go: () => { if (layout.mode === 'full') toggleLayout(); } },
    // Version 2: the service queues it for everyone; nothing switches to Broadcast by itself (Tom).
    spend: async (kind, pick) => {
      const q = queueAt();
      /** @type {Record<string, any>} */
      const body = { kind, choice: pick.choice };
      if (kind === 'chant' || kind === 'flag' || kind === 'shout') {
        if (!q.match || !q.halves) return { ok: false, why: 'IN A LIVE MATCH' };
        Object.assign(body, { side: pick.side ?? 'home', match: matchKey(q.match), halves: q.halves });
        if (kind === 'flag') body.choice = '';
        if (kind === 'shout' && String(config.fanCoins.shouts[Number(pick.choice)] ?? '').includes('{star}')) {
          body.player = topScorerOf(pick.side === 'away' ? q.match.awayId : q.match.homeId, q.t)?.id ?? '';
        }
      }
      const r = await coinBank.spend(body);
      if (!r.ok) return r;
      // Starting at once (no queue) in the stands: over to Broadcast, and for this viewer it starts a moment after the
      // slide, so its first round is seen (Tom, 2026-10-18). A queued one never switches by itself.
      if (SPENDS_IN_STANDS.has(kind) && r.row.starts <= coinsAt().t + 1000 && layout.mode === 'full') {
        coinBank.delay(r.row.id, config.settings.broadcast.slideMs + fc.shared.afterSlideSeconds * 1000);
        showFeed();
        toggleLayout();
      }
      return { ok: true, why: '', starts: r.row.starts };
    },
    // FAN BOARD in the playoffs: only the teams still in it (Tom, 2026-10-21).
    boardTeams: () => boardTeams(live, coinsAt().t, channel.timelineOf),
    matchOnScreen: () => {
      const a = coinsAt();
      return matchOnScreen(a.seg, a.t, a.timelineOf) && 'match' in a.seg && a.seg.match ? { homeId: a.seg.match.homeId, awayId: a.seg.match.awayId } : null;
    },
    shoutsFor: (end) => {
      const a = coinsAt();
      if (a.seg.kind !== 'live') return [];
      const team = league.teams[end === 'home' ? a.seg.match.homeId : a.seg.match.awayId];
      const star = topScorerOf(team.id, a.t)?.name ?? null;
      return /** @type {string[]} */ (config.fanCoins.shouts).map((x, index) => ({ x, index })).filter(({ x }) => star || !x.includes('{star}')).map(({ x, index }) => ({ words: x.replace('{team}', team.shortName.toUpperCase()).replace('{star}', star ?? ''), index }));
    },
    when: () => {
      const a = coinsAt();
      // An end is busy when its chants and flags have no room left this match (one queued for the next half is room).
      const busy = new Set(/** @type {('home' | 'away')[]} */ (['home', 'away']).filter((end) => queueOf('flag', end).why === 'NO ROOM THIS MATCH'));
      return { half: matchOnScreen(a.seg, a.t, a.timelineOf)?.half ?? null, nextLive: nextKickoff(a.t), busy };
    },
    time: (t) => channel.formatTime(t).toUpperCase(),
    onPage,
  }) : undefined;
  const audiencePane = audiencePaneRef = createAudiencePane({ pane, config, calendar, audience, now: () => clock.now(), onAir: noteLine, onChange: (open) => buttons.lit('audience', open), moments: { data: momentStore.data, onChange: () => momentStore.changed() }, coins: coinsTab });
  /** A Fan Coins chant's sound (§29): each round once, joined where it's got to if it's only just begun. @param {number} t */
  const fanChant = (t) => {
    const c = fanNow?.chant;
    if (!c || c.start === chantHeard || c.into > 1000 || !audio.on || clock.speed > 2) return;
    if (audio.play('chant', { seed: `fan|${c.start}`, ...(c.chant.tune ? { tune: c.chant.tune } : {}), from: c.into / 1000 })) chantHeard = c.start;
  };
  /** A Fan Coins message on the ticker (§29), its FANS tag in the team's colours or gold. @returns {import('./ticker.js').TickerItem | null} */
  const fanTicker = () => {
    const pic = fanNow?.ticker ? fanPictures.find((x) => x.id === fanNow?.ticker) : null;
    if (!pic) return null;
    const team = pic.teamId ? league.teams[pic.teamId] : null;
    return { key: `fans-${pic.id}`, kind: 'fans', text: pic.words, flash: false, ...(team ? { tag: { bg: team.colours.primary, fg: team.colours.secondary } } : {}) };
  };
  // COINS' waits and the countdown to midnight move on while it's open.
  if (coinStore) setInterval(() => audiencePane.refreshCoins(), 1000);
  // The notice below the scorebug; a click opens MOMENTS (in Full: the panes belong to it).
  const momentNotice = createMomentNotice({
    config,
    enabled: () => momentStore.data.notices,
    onClick: () => {
      if (layout.mode !== 'full') toggleLayout();
      audiencePane.openMoments();
    },
  });
  // SEEN IT ALL (a secret): every pane, tab and card opened at least once, read off the screen as it is.
  /** What's open now, as data/moments.json's places name it. @returns {string[]} */
  const placesOpen = () => {
    if (layout.mode === 'broadcast') return [];
    const out = [];
    const side = document.querySelector('#side-tabs .on');
    if (side) out.push(`SIDE:${side.textContent?.trim()}`);
    const box = $('pane');
    if (!box.hidden) {
      const title = box.querySelector('.pane-title')?.textContent ?? '';
      const on = box.querySelector('.pane-bar:not([hidden]) .guide-filter.on');
      out.push(on ? `${title}:${on.textContent?.trim()}` : title);
    }
    for (const b of stage.querySelectorAll('.tc-tabs .guide-filter.on')) out.push(`CARD:TEAM:${b.textContent?.trim()}`);
    if ([...stage.querySelectorAll('.card-name')].some((n) => !n.closest('.tc-head'))) out.push('CARD:PLAYER');
    // The phone's levels count too (its own switches; the desktop's strip stays hidden there).
    if (!$('levels').hidden || document.querySelector('.phone-levels:not([hidden])')) out.push('LEVELS');
    return out;
  };
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    for (const place of placesOpen()) momentTracker.visit(place, clock.now());
  }, config.settings.moments.placesSeconds * 1000);
  // The layout switch lives in the scorebug, in both layouts (Task 70): its icon shows the layout it switches to, and
  // swaps once the slide has finished.
  const layoutSwitch = $('bug-layout');
  const showSwitch = () => {
    const broadcast = layout.mode === 'broadcast';
    layoutSwitch.classList.toggle('broadcast', broadcast);
    layoutSwitch.title = broadcast ? 'Full layout: the stats, the panes and the ticker (B)' : 'Broadcast layout: the stands and the crowd (B)';
  };
  showSwitch();
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let slideTimer;
  const toggleLayout = () => {
    layout.toggle(performance.now());
    // The panes belong to the button row, which Broadcast hides; so does what the tour points at.
    if (layout.mode === 'broadcast') {
      pane.close();
      tour.close();
    }
    stage.classList.toggle('broadcast', layout.mode === 'broadcast');
    // Plates glide to their new places only during a switch (not when the stage rescales on load or resize).
    stage.classList.add('sliding');
    clearTimeout(slideTimer);
    slideTimer = setTimeout(() => {
      stage.classList.remove('sliding');
      showSwitch();
    }, config.settings.broadcast.slideMs + 100);
    buttons.render();
  };
  layoutSwitch.addEventListener('click', () => toggleLayout());
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey && !e.altKey) toggleLayout();
  });
  /** @type {{ key: string, fans: import('./stands.js').Fan[], areas: import('./stands.js').Area[] } | null} The crowd last drawn. */
  let crowdDrawn = null;
  // Instant goal replays (Task 57): drawn on a spare canvas with the match's own drawing, then cropped and zoomed into
  // the inset; the inset's frame and REPLAY mark are a DOM plate over it.
  const replayCanvas = document.createElement('canvas');
  replayCanvas.width = ctx.canvas.width;
  replayCanvas.height = ctx.canvas.height;
  const rctx = /** @type {CanvasRenderingContext2D} */ (replayCanvas.getContext('2d'));
  rctx.imageSmoothingEnabled = false;
  const replayBox = $('replay');
  /** @type {{ m: import('./liveLeague.js').LiveMatch, r: NonNullable<ReturnType<typeof replayAt>> } | null} The replay to draw this frame. */
  let replayNow = null;
  // The light by the time of day (Tom's note 14; lighting.js), worked out each frame; the time zone's offset is looked
  // up once a minute (Intl is slow for every frame).
  /** @type {import('./lighting.js').Light | null} */
  let lightNow = null;
  /**
   * A ground on AROUND THE GROUNDS (Tom's note 14): its team (from the data, with the ground's name), its kit at both
   * ends, training wear, and its squad as it stands, for groundScenes.js; worked out once per squad.
   * @type {Map<string, import('./groundScenes.js').Ground & { team: any }>}
   */
  const tourGrounds = new Map();
  /** @param {string} teamId */
  const tourGround = (teamId) => {
    const roster = /** @type {string[]} */ (league.teams[teamId].roster);
    const key = `${teamId}|${roster.join(',')}`;
    let g = tourGrounds.get(key);
    if (!g) {
      const team = config.teams.teams.find((/** @type {{ id: string }} */ x) => x.id === teamId);
      const kit = channel.kitsOf(teamId, teamId).home;
      const wear = { ...kit, primary: PALETTE.tracksuit, secondary: team.colours.primary };
      const keepers = roster.filter((id) => league.players[id]?.position === keeperSlot);
      g = { team, kits: { home: kit, away: kit }, wear: { home: wear, away: wear }, keepers, outfield: roster.filter((id) => !keepers.includes(id)), roster, keeperSlot };
      tourGrounds.set(key, g);
    }
    return g;
  };
  // The wipe from one ground to the next (Tom's pick C): the last moment of a ground is kept, and as the next begins a
  // band in its club's colours sweeps left to right with the new ground behind it and the old one still ahead of it.
  const tourShot = document.createElement('canvas');
  const tourShotCtx = /** @type {CanvasRenderingContext2D} */ (tourShot.getContext('2d'));
  let tourShotKey = '';
  /** @param {Extract<import('./programme.js').Segment, { kind: 'grounds' }>} seg @param {number} t */
  const tourWipe = (seg, t) => {
    const gt = config.settings.groundsTour;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (seg.visit + 1 < seg.visits && seg.until - t < TOUR_SHOT_MS) {
      if (tourShot.width !== W || tourShot.height !== H) Object.assign(tourShot, { width: W, height: H });
      tourShotCtx.drawImage(ctx.canvas, 0, 0);
      tourShotKey = `${seg.tourFrom}|${seg.visit + 1}`;
    }
    const into = t - seg.from;
    if (seg.visit === 0 || into >= gt.wipeMs) return;
    const f = Math.min(1, into / Math.max(1, gt.wipeMs));
    const band = Math.round(W * gt.wipeWidth);
    const x = Math.round(-band + f * f * (3 - 2 * f) * (W + band));
    const ahead = Math.max(0, x + band);
    if (tourShotKey === `${seg.tourFrom}|${seg.visit}` && ahead < W) ctx.drawImage(tourShot, ahead, 0, W - ahead, H, ahead, 0, W - ahead, H);
    const { primary, secondary } = tourGround(seg.teamId).team.colours;
    ctx.fillStyle = secondary;
    ctx.fillRect(x - TOUR_EDGE, 0, band + 2 * TOUR_EDGE, H);
    ctx.fillStyle = primary;
    ctx.fillRect(x, 0, band, H);
  };
  const zone = zoneOffsets(config.settings.live.timeZone);
  let zoneMinute = NaN;
  let zoneOffset = 0;
  /** @param {number} t */
  const lightFor = (t) => {
    const lighting = config.settings.lighting;
    if (!lighting.on) return null;
    const minute = Math.floor(t / 60_000);
    if (minute !== zoneMinute) {
      zoneMinute = minute;
      zoneOffset = zone.offsetAt(t);
    }
    return lightAt(t, zoneOffset, lighting);
  };
  /**
   * Draw the replay inset (after everything else, so it's over the stands), or hide it.
   * @param {number} slide  How far into Broadcast the layout is (the inset follows the caption).
   */
  const drawReplay = (slide) => {
    const rs = config.settings.replays;
    if (!replayNow) {
      replayBox.hidden = true;
      return;
    }
    const { m, r } = replayNow;
    const focus = replayFocus(motionOf(m), r.goalAt, r.show, rs, PITCH);
    const tl = channel.timelineOf(m);
    rctx.setTransform(1, 0, 0, 1, 0, 0);
    drawPitch(rctx);
    drawHomeMark(rctx, league.teams[m.homeId].colours, homeIcon(m.homeId));
    drawPlayoffMarks(rctx, m.stage);
    drawEndBoards(rctx, channel.kitsOf(m.homeId, m.awayId), homeAttacksRight(tl.stateAt(r.show).phase) === 1);
    drawMatch(m, r.show, rctx);
    if (lightNow) lightPitch(rctx, lightNow);
    // Into the inset: above the caption, bottom left (Full), or over the left stand (Broadcast).
    const x = Math.round(REPLAY_AT.full.x + (REPLAY_AT.broadcast.x - REPLAY_AT.full.x) * slide);
    const y = Math.round(REPLAY_AT.full.y + (REPLAY_AT.broadcast.y - REPLAY_AT.full.y) * slide) - rs.h;
    const sx = PITCH.x + (focus.x - focus.w / 2) * PITCH.w;
    const sy = PITCH.y + (focus.y - focus.h / 2) * PITCH.h;
    const fade = Math.min(1, r.f * 12, (1 - r.f) * 12);
    ctx.globalAlpha = fade;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(replayCanvas, sx, sy, focus.w * PITCH.w, focus.h * PITCH.h, x, y, rs.w, rs.h);
    ctx.globalAlpha = 1;
    replayBox.hidden = false;
    replayBox.style.left = `calc(var(--px) * ${x})`;
    replayBox.style.top = `calc(var(--px) * ${y})`;
    replayBox.style.width = `calc(var(--px) * ${rs.w})`;
    replayBox.style.height = `calc(var(--px) * ${rs.h})`;
    replayBox.style.opacity = String(fade);
  };
  // The studio (Task 58): the presenters, and each segment's script from the facts at its start.
  const studioPeople = presenters(live.looks, config.regions.regions, config.studio.looks, config.studio.presenters);
  const presenterSkins = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];
  /** The presenters as figures (Task 98): their jackets, ties, skin and hair. */
  const presenterLooks = studioPeople.map((p) => ({ jacket: p.shirt, tie: p.tie, skin: presenterSkins[p.skin], hair: p.hair, style: p.style, woman: p.woman }));
  /** Who sits where at the desk, left first: their clips' folder, name and look. */
  const regularSeats = studioPeople.map((p, i) => ({ id: p.id ?? '', name: p.name, look: presenterLooks[i] }));
  // The playoff analyst's talk (analystTalk.js, Tom): the analyst in the left seat, the host (Ysolde) in hers.
  const [analystHim, analystHost] = analystCast(config);
  const analystSeats = [
    { id: analystHim.id, name: analystHim.name, look: { ...analystHim.look, skin: presenterSkins[analystHim.look.skin] } },
    regularSeats.find((x) => x.id === analystHost.id) ?? regularSeats[1],
  ];
  // OFF THE BALL (docs/podcast.md): Tamsin and Samir at the desk for now (the build's step 4b; their booth is 4c).
  const podcastSeats = podcastCast(config).map((p) => ({ id: p.id, name: p.name, look: { ...p.look, skin: presenterSkins[p.look.skin] } }));
  /** The seats for a talk. @param {{ topic?: string }} seg */
  const seatsOf = (seg) => (seg.topic === 'analyst' ? analystSeats : seg.topic === 'podcast' ? podcastSeats : regularSeats);
  /**
   * A talk line's clip key under assets/voices/ (and in config.voiceLengths): the desk's, or OFF THE BALL's own.
   * @param {{ topic?: string }} seg @param {0 | 1} who @param {import('./studio.js').Clip} clip
   */
  const talkClipKey = (seg, who, clip) => (seg.topic === 'podcast' ? podcastClipKey(/** @type {'tamsin' | 'samir'} */ (seatsOf(seg)[who].id), clip) : deskClipKey(seatsOf(seg)[who].id, clip));
  const talkClipUrl = (/** @type {{ topic?: string }} */ seg, /** @type {0 | 1} */ who, /** @type {import('./studio.js').Clip} */ clip) => `assets/voices/${talkClipKey(seg, who, clip)}.mp3`;
  const studioBubble = $('studio-bubble');
  const studioLower = $('studio-lower');
  let transitionKey = '';
  /**
   * The transition at this moment, if any (Task 97; transitions.js): the glass sweep laying the scene over the stadium
   * or lifting it off, or the diagonal band between clips, into a package (with its name while the band is down) and
   * between the desk and the interview. Each plays its sound as it starts.
   * @param {import('./transitions.js').Transition | null} tr @param {number} t @param {number} slide
   */
  const drawTransition = (tr, t, slide) => {
    if (!tr) return;
    // Over the ground and, in Full, the strip under it down to the ticker (Task 139, Tom: they stopped at the bottom
    // of the field, the turf with the home name left showing); in Broadcast the scene's rect is already the screen.
    const S = sceneRect(slide);
    const R = { ...S, h: S.h + Math.round(BOTTOM_STRIP.h * (1 - slide)) };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (tr.kind === 'into_scene' || tr.kind === 'out_of_scene') {
      // The glass lays down (or lifts off) what's on the scene side: set B with the presenters for talk (Tom, after
      // Task 101: the bare light bars, then the set cutting in, was jarring), the board and the player for the
      // interview, the light bars for everything else.
      const into = tr.kind === 'into_scene';
      const other = programme.at(into ? tr.edge : tr.edge - 1);
      /** @type {((o: CanvasRenderingContext2D, r: import('./interview.js').Rect) => void) | undefined} */
      let picture;
      if (other.kind === 'talk') picture = (o, r) => drawSet(o, r, other, into ? 0 : other.until - other.from, t);
      else if (pictureOf(other) === 'interview' && 'match' in other) {
        const iv = interviewOf(other.match);
        picture = (o, r) => drawInterview(o, r, iv.look, { pose: 'rest', mouth: false }, 0, { badge: shirtCrest(o, iv.card.teamId) });
      }
      // The scene side as it will look (or looked): its picture over the ground, the strip's quiet band under it.
      /** @param {CanvasRenderingContext2D} o @param {import('./interview.js').Rect} r */
      const side = (o, r) => {
        const top = { ...r, h: S.h };
        if (picture) picture(o, top);
        else drawScene(o, top, t, config.settings.scene);
        if (r.h > S.h) drawBottomBand(o, { x: r.x, y: r.y + S.h, w: r.w, h: r.h - S.h });
      };
      drawSweep(ctx, R, tr.p, tr.kind === 'into_scene' ? 'into' : 'out', t, config.settings.scene, config.settings.transitions.glassPx, side);
    } else {
      drawBand(ctx, R, tr.q, config.settings.scene);
      // A reel's name (Task 213), or the match's.
      if (tr.title && tr.reel) drawStingTitle(ctx, S, { title: tr.reel.title, sub: tr.reel.sub ?? `SEASON ${tr.reel.season} PLAYOFFS`, ...(tr.reel.head ? { head: tr.reel.head } : {}) });
      else if (tr.title && tr.match) {
        const m = tr.match;
        const kits = channel.kitsOf(m.homeId, m.awayId);
        drawStingTitle(ctx, S, { home: league.teams[m.homeId].abbr, away: league.teams[m.awayId].abbr, homeKit: kits.home.primary, awayKit: kits.away.primary, played: channel.formatTime(m.kickoff) });
      }
    }
    const key = `${tr.kind}|${tr.edge}`;
    if (key === transitionKey) return;
    transitionKey = key;
    // Only as it starts (not when loading or jumping into the middle of one), and not above ?speed=2.
    const start = tr.kind === 'into_scene' || tr.kind === 'out_of_scene' ? tr.p < 0.3 : tr.q < 0.3;
    if (start && audio.on && clock.speed <= 2) audio.play(tr.kind === 'into_scene' || tr.kind === 'out_of_scene' ? 'whoosh' : 'swish', { seed: key });
  };
  /** A home golden goal's confetti (Task 147). */
  const GOLD_CONFETTI = ['#ffd23f', '#f2c230', '#fff6c8'];
  /** @type {{ colours: string[], since: number } | null} The champions' confetti this frame, drawn over the scene (Task 96). */
  let confettiNow = null;
  /** @type {Map<string, { script: import('./studio.js').Line[], screens: { left: import('./studioSet.js').ScreenLine[], right: import('./studioSet.js').ScreenLine[] } }>} Each talk's lines and what set B's side screens show (Task 98). */
  const talks = new Map();
  /**
   * A talk's lines and side screens, from the facts at its start: kept for the talk on screen and the one a sweep is
   * about to show (or has just left).
   * @param {Extract<import('./programme.js').Segment, { kind: 'talk' }>} seg
   */
  const talkFor = (seg) => {
    const { from, until } = seg;
    const key = `${from}|${until}`;
    let got = talks.get(key);
    if (!got) {
      const durationOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => channel.timelineOf(m).duration;
      const results = /** @type {any} */ (studioCard('results', live, from, 0, channel)).rows;
      const top = tableAt(live, live.calendar.seasonAt(from), from, durationOf)[0];
      // After the final, the new season's opener (Task 194: the sign-off names it), which upcomingAt doesn't list yet.
      const next = upcomingAt(live, from, durationOf, 1)[0] ?? seg.next ?? undefined;
      const name = (/** @type {string} */ id) => league.teams[id].shortName;
      // The talk for its topic (Task 99: the match, the round, round the interview, the champions, the off-season);
      // the stand-in lines for what isn't written yet.
      // Task 187: the programme worked the lines out to size the talk, so they're on the segment.
      const script = (seg.script === undefined ? talkScript(seg, live, from, channel) : seg.script) ?? studioScript({
        result: results[0] ? { home: name(results[0].homeId), away: name(results[0].awayId), homeGoals: results[0].homeGoals, awayGoals: results[0].awayGoals } : null,
        leader: top && top.played > 0 ? { name: name(top.teamId), points: top.points } : null,
        next: next && next.homeId && next.awayId ? { home: name(next.homeId), away: name(next.awayId), when: channel.formatTime(next.kickoff) } : null,
      }, key, { total: until - from }, config.studio.lines, teamsForTalk(league.teams, config.studio.spokenTeam), lineTiming(config));
      // The side screens: the table's top six, and the next match.
      const table = tableAt(live, live.calendar.seasonAt(from), from, durationOf).filter((r) => r.played > 0).slice(0, 6);
      // Each team's kit before its abbreviation (Task 110).
      const k = (/** @type {string} */ id) => ({ kit: league.teams[id].colours.primary });
      /** @type {{ left: import('./studioSet.js').ScreenLine[], right: import('./studioSet.js').ScreenLine[] }} */
      const screens = {
        left: ['TABLE', ...table.map((r) => [`${r.position} `, k(r.teamId), `${league.teams[r.teamId].abbr} ${r.points}`])],
        right: next && next.homeId && next.awayId ? ['NEXT', [k(next.homeId), `${league.teams[next.homeId].abbr} v `, k(next.awayId), league.teams[next.awayId].abbr], channel.formatTime(next.kickoff)] : ['NEXT'],
      };
      got = { script, screens };
      // Its recorded lines (Task 135), fetched ahead so each plays as its line starts.
      if (audio.on) audio.loadClips(script.map((l) => talkClipUrl(seg, l.who, l.clip)));
      talks.set(key, got);
      while (talks.size > 2) talks.delete(/** @type {string} */ (talks.keys().next().value));
    }
    return got;
  };
  // OFF THE BALL's booth (podcastBooth.js; docs/channel.md §34): the ground of the day through its window, drawn on a
  // canvas of its own at the stage's size, lit by the time of day; in the day's goals, the match on it.
  /** How far the bubble sits outward of its speaker in the booth (stage px), clear of the screen. */
  const BOOTH_BUBBLE_NUDGE = 24;
  /** The bubble's middle in the booth: outward of its speaker, kept inside the booth (it's 160 stage px wide). @param {number} x @param {0 | 1} who @param {number} slide */
  const boothBubbleX = (x, who, slide) => {
    const R = sceneRect(slide);
    return Math.min(R.x + R.w - 81, Math.max(R.x + 81, x + (who === 0 ? -BOOTH_BUBBLE_NUDGE : BOOTH_BUBBLE_NUDGE)));
  };
  const boothCanvas = document.createElement('canvas');
  boothCanvas.width = STAGE_WIDTH;
  boothCanvas.height = 270;
  const bctx = /** @type {CanvasRenderingContext2D} */ (boothCanvas.getContext('2d'));
  bctx.imageSmoothingEnabled = false;
  // The day's goals on a canvas of their own: only the screen shows the match, the window behind it the empty pitch
  // (Tom, 2026-10-21: all three panes showed the play).
  const reelCanvas = document.createElement('canvas');
  reelCanvas.width = STAGE_WIDTH;
  reelCanvas.height = 270;
  const rlctx = /** @type {CanvasRenderingContext2D} */ (reelCanvas.getContext('2d'));
  rlctx.imageSmoothingEnabled = false;
  /**
   * The booth's ground: `homeId`'s pitch (the next match's home ground), or with a match on it at `at`.
   * @param {string | null} homeId @param {import('./liveLeague.js').LiveMatch | null} m @param {number} at
   * @returns {{ canvas: HTMLCanvasElement, ballX: number }}  ballX: the ball's x on it (stage px).
   */
  const boothGround = (homeId, m, at) => {
    const c = m ? rlctx : bctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    drawPitch(c);
    const home = m?.homeId ?? homeId ?? Object.keys(league.teams)[0];
    drawHomeMark(c, league.teams[home].colours, homeIcon(home));
    let ballX = PITCH.x + PITCH.w / 2;
    if (m) {
      drawEndBoards(c, channel.kitsOf(m.homeId, m.awayId), homeAttacksRight(channel.timelineOf(m).stateAt(at).phase) === 1);
      const pose = drawMatch(m, at, c);
      if (pose?.ball) ballX = ballStageAt(pose.ball).x;
    }
    if (lightNow) lightPitch(c, lightNow);
    return { canvas: m ? reelCanvas : boothCanvas, ballX };
  };
  /** @type {Map<string, any>} THE TABLE's rows on the booth's screen, by episode: the table when it was made, with that day's moves. */
  const podcastTables = new Map();
  /**
   * The booth's screen for a graphic (the line's show): THE TABLE's table for its lines, otherwise a card, the show's
   * first part its heading.
   * @param {Extract<import('./programme.js').Segment, { kind: 'talk' }>} seg @param {import('./studio.js').Line} shown
   * @returns {import('./podcastBooth.js').Screen | null}
   */
  const podcastScreen = (seg, shown) => {
    const key = screenKey(shown);
    if (key === 'money' && seg.podcast) {
      // The payrolls against the cap, the team the line names lit.
      const season = live.calendar.seasonAt(seg.podcast.at);
      const cap = seasonConfig(config, season).rules.finances.cap;
      const rows = payrolls(live.chronicle, Object.keys(league.teams)).map((r) => ({ label: league.teams[r.teamId].abbr, kit: league.teams[r.teamId].colours.primary, value: guilders(r.payroll), lit: r.teamId === shown.clip.team }));
      return { kind: 'list', head: `PAYROLLS · CAP ${guilders(cap)}`, rows };
    }
    if (key === 'archive' && seg.podcast) {
      // The Cups won before this season, the most first, the team the line names lit.
      const season = live.calendar.seasonAt(seg.podcast.at);
      const rows = Object.keys(league.teams).map((id) => ({ id, cups: (live.chronicle.teams.get(id)?.cups ?? []).filter((x) => x < season) }))
        .sort((a, b) => b.cups.length - a.cups.length || (Math.max(0, ...b.cups) - Math.max(0, ...a.cups)) || a.id.localeCompare(b.id))
        .map((r) => ({ label: league.teams[r.id].abbr, kit: league.teams[r.id].colours.primary, value: r.cups.length ? `${r.cups.length} · LAST S${Math.max(...r.cups)}` : '–', lit: r.id === shown.clip.team }));
      return { kind: 'list', head: 'CUPS WON', rows };
    }
    if (key === 'table' && seg.podcast) {
      const key = `${seg.podcast.season}|${seg.podcast.n}`;
      let rows = podcastTables.get(key);
      if (!rows) {
        const durationOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => channel.timelineOf(m).duration;
        const at = seg.podcast.at;
        const season = live.calendar.seasonAt(at);
        const dayStart = live.calendar.instant(season, Math.floor((at - live.calendar.seasonStart(season)) / 86_400_000) * 1440);
        const before = tableAt(live, season, dayStart, durationOf);
        rows = tableAt(live, season, at, durationOf).map((r) => ({ place: r.position, abbr: league.teams[r.teamId].abbr, kit: league.teams[r.teamId].colours.primary, points: r.points, move: (before.find((b) => b.teamId === r.teamId)?.position ?? r.position) - r.position }));
        podcastTables.set(key, rows);
        while (podcastTables.size > 2) podcastTables.delete(/** @type {string} */ (podcastTables.keys().next().value));
      }
      return { kind: 'table', head: 'THE TABLE · TODAY', rows };
    }
    return null;
  };
  /**
   * Which of the booth's screens a line's graphic belongs to: the table, the payrolls, the Cups; or none (a heading or
   * a line or two of facts, for the lower third; Tom, 2026-10-21).
   * @param {import('./studio.js').Line} l
   */
  const screenKey = (l) => (l.clip.kind.startsWith('table') ? 'table' : ['moneyCap', 'moneyRoom'].includes(l.clip.kind) ? 'money' : /^archive(Dynasty|Drought|Never)$/.test(l.clip.kind) ? 'archive' : null);
  /** The lines that bring the pair's names up (Tom, 2026-10-21): the start of the show, back from the break, the close. */
  const NAMED_LINES = new Set(['open', 'openReply', 'openAhead', 'openAheadReply', 'openReview', 'openReviewReply', 'breakBack', 'closeAsk', 'close', 'closeAhead', 'closeReview']);
  /**
   * Set B with the presenters behind the desk, `since` ms into a talk, in a rect (Task 98; studioSet.js).
   * @param {CanvasRenderingContext2D} c @param {import('./interview.js').Rect} R
   * @param {Extract<import('./programme.js').Segment, { kind: 'talk' }>} seg @param {number} since @param {number} t
   */
  const drawSet = (c, R, seg, since, t) => {
    if (seg.topic === 'podcast') {
      const { script } = talkFor(seg);
      const poses = figurePoses(script, since, { gestureMs: config.settings.studio.gestureSeconds * 1000, nodEveryMs: config.settings.studio.nodEverySeconds * 1000, charsPerSecond: config.settings.captions.quoteCharsPerSecond });
      const real = performance.now();
      const shown = script.find((l) => l.show && l.showUntil !== null && since >= l.from && since < l.showUntil) ?? null;
      const screen = shown ? podcastScreen(seg, shown) : null;
      // The screen wipes on when its graphic changes (the line before with a graphic showed another, or none).
      const before = shown ? script.slice(0, script.indexOf(shown)).findLast((l) => l.show) : undefined;
      const fresh = screen && (!before || before.showUntil !== shown?.from || screenKey(before) !== screenKey(/** @type {any} */ (shown)));
      const L = drawBooth(c, R, {
        name: config.podcast.show, t, ground: boothGround(seg.next?.homeId ?? null, null, 0).canvas, looks: podcastSeats.map((p) => p.look),
        // Pointing inwards (Tom, 2026-10-21): toward the middle, where the screen is.
        poses: poses.map((p, k) => ({ pose: p.pose, beat: Math.floor(real / (p.mouth ? 160 : 300)) % 2, facing: p.pose === 'point' ? /** @type {1 | -1} */ (k === 0 ? 1 : -1) : p.facing, mouth: p.mouth })),
        screen, wipe: fresh && shown ? Math.min(1, (since - shown.from) / config.settings.podcast.wipeMs) : null,
      });
      return { script, L };
    }
    const { script, screens } = talkFor(seg);
    const L = setLayout(R);
    drawSetBack(c, R, L, t, config.settings.scene, screens);
    const poses = figurePoses(script, since, { gestureMs: config.settings.studio.gestureSeconds * 1000, nodEveryMs: config.settings.studio.nodEverySeconds * 1000, charsPerSecond: config.settings.captions.quoteCharsPerSecond });
    const real = performance.now();
    poses.forEach((p, i) => drawFigure(c, L.seats[i].x, L.seats[i].y, L.scale, seatsOf(seg)[i].look, p.pose, Math.floor(real / (p.mouth ? 160 : 300)) % 2, p.facing, { mouth: p.mouth }));
    drawDesk(c, L);
    return { script, L };
  };
  /** The desk line last voiced (Task 135), so each plays once; an OFF THE BALL interjection likewise. */
  let deskSaid = '';
  let underSaid = '';
  /** @type {{ seg: Extract<import('./programme.js').Segment, { kind: 'talk' }>, since: number } | null} The talk on screen (on set B, Task 98), and how far in. */
  let studioNow = null;
  /**
   * The talk on set B (Task 98; studioSet.js): the set over the ground in Full or the whole screen in Broadcast, the
   * presenters behind the desk making their lines' gestures, and the bubble over whoever is talking (or none; none
   * while a transition covers the set, as the bubble is HTML over the canvas).
   * @param {number} slide @param {number} t @param {boolean} covered
   */
  const drawStudioNow = (slide, t, covered) => {
    for (const el of podNames) el.hidden = true;
    if (!studioNow) {
      studioBubble.hidden = true;
      studioLower.hidden = true;
      return;
    }
    const { seg, since } = studioNow;
    const { script, L } = drawSet(ctx, sceneRect(slide), seg, since, t);
    const line = script.find((l) => since >= l.from && since < l.until) ?? null;
    // The graphic under the speaker (Task 131): the facts the line is about, up until the next graphic or the talk's
    // end (Task 187: gone with the voice, it was too quick to read), under whoever said it.
    const shown = script.find((l) => l.show && l.showUntil !== null && since >= l.from && since < l.showUntil) ?? null;
    if (seg.topic === 'podcast') {
      // OFF THE BALL (Tom, 2026-10-21): their names under each of them at the start, back from the break and at the
      // close; a graphic with nothing for the screen (a heading, a line or two of facts) in a lower third in front of
      // the counter, the window left clear.
      const last = script.filter((l) => since >= l.from).at(-1);
      const named = Boolean(last && NAMED_LINES.has(last.clip.kind));
      const facts = shown?.show && !shown.show.startsWith(config.podcast.show) && !screenKey(shown) && !named ? shown.show : null;
      podcastPlates(named ? L : null, facts, L, covered, slide);
    } else studioLower.hidden = !shown || covered;
    if (seg.topic !== 'podcast' && shown?.show && !covered) {
      const seat = L.seats[shown.who];
      studioLower.style.left = `calc(var(--px) * ${seat.x})`;
      studioLower.style.top = `calc(var(--px) * ${L.lowerY})`;
      setText(studioLower, shown.show);
    }
    if (!line || covered) {
      studioBubble.hidden = true;
      return;
    }
    // The line's voice (Task 135): played once as it starts (not when tuning in part-way), the typing paced to it.
    const seats = seatsOf(seg);
    const url = talkClipUrl(seg, line.who, line.clip);
    const key = `${seg.from}|${line.from}`;
    // Fetched ahead while sound is on (sound may have come on after the talk was worked out): this line and the next.
    if (audio.on) {
      const next = script.find((l) => l.from > line.from);
      audio.loadClips(next ? [url, talkClipUrl(seg, next.who, next.clip)] : [url]);
    }
    // A clip still loading is tried again next frame, until the line is too far gone to start.
    if (key !== deskSaid && audio.on && clock.speed <= 2) {
      if (since - line.from >= SPEECH_START_MS || audio.playClip(url, { kind: 'speech' })) deskSaid = key;
    }
    // OFF THE BALL's interjections (Tom's plan, 2026-10-20): the listener's, softly, a little under halfway through.
    // Off since Tom heard them (2026-10-21: they sounded like a bug; settings.podcast.interjectionShare 0).
    const under = /** @type {import('./podcastTalk.js').PodcastSaid} */ (/** @type {unknown} */ (line)).under;
    if (seg.topic === 'podcast' && under) {
      const underAt = line.from + Math.max(1000, (line.until - line.from) * 0.4);
      const underUrl = talkClipUrl(seg, under.who, under.clip);
      const underKey = `${key}|under`;
      if (audio.on) audio.loadClips([underUrl]);
      if (underKey !== underSaid && since >= underAt && audio.on && clock.speed <= 2) {
        if (since - underAt >= SPEECH_START_MS || audio.playClip(underUrl, { kind: 'speech', level: (config.settings.sound.levels.speech ?? 1) * config.settings.podcast.interjectionLevel })) underSaid = underKey;
      }
    }
    // Paced to the clip's length from the list (Task 187), so it types in its time even with the sound off.
    const cps = typingSpeed(line.text.length, config.voiceLengths[talkClipKey(seg, line.who, line.clip)] ?? audio.clipSeconds(url), config.settings.captions.quoteCharsPerSecond);
    const chars = Math.floor(((since - line.from) / 1000) * cps);
    const seat = L.seats[line.who];
    studioBubble.hidden = false;
    // In the booth, nudged outward so the bubble clears the screen in the window's middle pane.
    studioBubble.style.left = `calc(var(--px) * ${seg.topic === 'podcast' ? boothBubbleX(seat.x, line.who, slide) : seat.x})`;
    studioBubble.style.top = `calc(var(--px) * ${seat.y - 4})`;
    setText(/** @type {HTMLElement} */ (studioBubble.firstElementChild), seats[line.who].name);
    setText(/** @type {HTMLElement} */ (studioBubble.lastElementChild), line.text.slice(0, chars));
  };
  /**
   * OFF THE BALL's lower thirds (the booth): each one's name and what they were under them (`named`: the booth's
   * layout, or null for none), and a line of facts centred in front of the counter.
   * @param {ReturnType<typeof boothLayout> | null} named @param {string | null} facts @param {ReturnType<typeof boothLayout>} L
   * @param {boolean} covered @param {number} slide
   */
  const podcastPlates = (named, facts, L, covered, slide) => {
    podNames.forEach((el, k) => {
      el.hidden = !named || covered;
      if (!named || covered) return;
      const p = config.podcast.pair[SEATS_PODCAST[k]];
      el.style.left = `calc(var(--px) * ${named.seats[k].x})`;
      el.style.top = `calc(var(--px) * ${named.lowerY})`;
      setText(el, `${p.name.toUpperCase()} · ${p.role}`);
    });
    studioLower.hidden = !facts || covered;
    if (!facts || covered) return;
    const R = sceneRect(slide);
    studioLower.style.left = `calc(var(--px) * ${R.x + R.w / 2})`;
    studioLower.style.top = `calc(var(--px) * ${L.lowerY})`;
    setText(studioLower, facts);
  };
  const podNames = [$('pod-name-0'), $('pod-name-1')];
  /** @type {{ seg: Extract<import('./programme.js').Segment, { kind: 'highlights' }>, at: number } | null} OFF THE BALL's day's goals on screen. */
  let podcastReelNow = null;
  /** The reaction last voiced, so each plays once. */
  let reactSaid = '';
  /**
   * OFF THE BALL's day's goals (the booth, docs/channel.md §34): the match on the booth's screen following the ball, the
   * side panes frosted, and as each goal goes in the one whose turn it is reacts (voiced, in the bubble).
   * @param {number} slide @param {number} t @param {boolean} covered
   */
  const drawPodcastReelNow = (slide, t, covered) => {
    if (!podcastReelNow) return;
    const { seg, at } = podcastReelNow;
    const R = sceneRect(slide);
    const m = seg.match;
    const ground = boothGround(null, m, at);
    const pitch = boothGround(seg.next?.homeId ?? null, null, 0);
    // The reaction: just after the clip's goal (leadMs into it).
    const react = seg.reacts?.[seg.clip] ?? null;
    const reactFrom = seg.clipFrom + config.settings.highlights.leadMs + 300;
    const url = react ? `assets/voices/${podcastClipKey(SEATS_PODCAST[react.who], react.clip)}.mp3` : '';
    const reactMs = react ? (config.voiceLengths[podcastClipKey(SEATS_PODCAST[react.who], react.clip)] ?? 1.5) * 1000 : 0;
    const talking = react && t >= reactFrom && t < reactFrom + reactMs + 1200 ? react : null;
    const real = performance.now();
    const poses = /** @type {0 | 1} */ ([0, 1]).map((k) => {
      const facing = /** @type {1 | -1} */ (k === 0 ? 1 : -1);
      const mouth = Boolean(talking && talking.who === k && t < reactFrom + reactMs);
      const pose = talking && talking.who === k && t - reactFrom < config.settings.studio.gestureSeconds * 1000 ? talking.gesture : 'rest';
      return { pose: /** @type {any} */ (pose), beat: Math.floor(real / (mouth ? 160 : 300)) % 2, facing, mouth };
    });
    const players = (/** @type {string} */ id) => live.league.players[id];
    // The clip's goal: the one nearest its moment (leadMs on screen into the clip).
    const hl = config.settings.highlights;
    const goalAt = at - (t - seg.clipFrom) * hl.speed + hl.leadMs * hl.speed;
    const goal = channel.timelineOf(m).events.filter((x) => x.event.type === 'goal').reduce((/** @type {any} */ best, x) => (!best || Math.abs(x.at - goalAt) < Math.abs(best.at - goalAt) ? x : best), null);
    const scorer = goal?.event.playerId ? players(goal.event.playerId) : null;
    const label = `${scorer ? `${scorer.firstName[0]}. ${scorer.lastName}`.toUpperCase() : 'THE DAY\'S GOALS'} · ${league.teams[m.homeId].abbr} v ${league.teams[m.awayId].abbr}`;
    const L = drawBooth(ctx, R, { name: config.podcast.show, t, ground: pitch.canvas, looks: podcastSeats.map((p) => p.look), poses, screen: { kind: 'match', ground: ground.canvas, ballX: ground.ballX, label } });
    podcastPlates(null, null, L, covered, slide);
    if (!talking || covered) {
      studioBubble.hidden = true;
      return;
    }
    const key = `${seg.from}|${seg.clip}`;
    if (audio.on) audio.loadClips([url]);
    if (key !== reactSaid && audio.on && clock.speed <= 2) {
      if (t - reactFrom >= SPEECH_START_MS || audio.playClip(url, { kind: 'speech' })) reactSaid = key;
    }
    const seat = L.seats[talking.who];
    studioBubble.hidden = false;
    studioBubble.style.left = `calc(var(--px) * ${boothBubbleX(seat.x, talking.who, slide)})`;
    studioBubble.style.top = `calc(var(--px) * ${seat.y - 4})`;
    setText(/** @type {HTMLElement} */ (studioBubble.firstElementChild), config.podcast.pair[SEATS_PODCAST[talking.who]].name);
    const cps = typingSpeed(talking.text.length, reactMs / 1000, config.settings.captions.quoteCharsPerSecond);
    setText(/** @type {HTMLElement} */ (studioBubble.lastElementChild), talking.text.slice(0, Math.floor(((t - reactFrom) / 1000) * cps)));
  };
  // Ad breaks (Task 105; spots.js, spotArt.js): the bumpers and the ads from data/spots.json, in the gap's own seeded order
  // (Task 158), each break carrying on where the last stopped, over the ground in Full and the whole screen in Broadcast, each ad's jingle as its brand comes up.
  /** @type {{ seg: Extract<import('./programme.js').Segment, { kind: 'ads' }>, since: number } | null} */
  let adNow = null;
  /** @type {{ key: number, facts: ReturnType<typeof adFacts> } | null} The facts the ads show, worked out once a break. */
  let adFactsNow = null;
  let jingleKey = '';
  /** @type {{ from: number, kind: import('./guide.js').EntryKind } | null} The segment heard last, for the studio jingle (Task 137). */
  let jingleSeg = null;
  /**
   * The studio's jingle (Task 137, Tom): as a STUDIO or OPENING entry in the TV guide begins, never over the desk
   * (Task 180; guide.js studioJingle). The opening's comes as the welcome starts, after the ident (which has its own
   * sound). Only as the segment starts (not when tuning in part-way), and not above ?speed=2.
   * @param {import('./programme.js').Segment} seg @param {number} t
   */
  const studioJingle = (seg, t) => {
    if (jingleSeg?.from === seg.from) return;
    const before = jingleSeg?.kind ?? null;
    jingleSeg = { from: seg.from, kind: guideKind(seg) };
    if (jingleBegins(seg, before) && t - seg.from < 500 && audio.on && clock.speed <= 2) audio.play('jingle', { seed: `studio|${seg.from}`, jingle: config.studio.jingle });
  };
  /** @param {number} slide @param {number} t */
  const drawAdNow = (slide, t) => {
    if (!adNow) return;
    const { seg, since } = adNow;
    const R = sceneRect(slide);
    /** The light bars behind the bumpers and the promo: the channel's own scene. @type {import('./spotArt.js').Back} */
    const back = (c, r) => drawScene(c, r, t, config.settings.scene);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (seg.part !== 'ad') {
      // The bumper sound (Task 168), as the card opens (not when loading into the middle of it); not above ?speed=2.
      const key = `bumper|${seg.from}`;
      if (key !== jingleKey) {
        jingleKey = key;
        if (since < 500 && audio.on && clock.speed <= 2) audio.play('jingle', { seed: key, jingle: seg.part === 'bumper_in' ? config.studio.bumpers.in : config.studio.bumpers.out });
      }
      drawBumper(ctx, R, since, seg.part === 'bumper_in' ? "WE'LL BE RIGHT BACK" : seg.podcast ? `BACK TO ${config.podcast.show}` : 'BACK TO THE STUDIO', seg.until - seg.from, back);
      return;
    }
    const breakStart = seg.from - config.settings.ads.bumperSeconds * 1000 - seg.ad * config.settings.ads.adSeconds * 1000;
    if (adFactsNow?.key !== breakStart) adFactsNow = { key: breakStart, facts: adFacts(live, breakStart, channel) };
    const ads = adOrder(config.ads.ads, live.looks, seg.gap, adFactsNow.facts.playoffs.stage);
    const ad = ads[adIndex(seg.brk, seg.ad, config.settings.ads.perBreak, ads.length)];
    const { adSeconds, perBreak, dissolveMs } = config.settings.ads;
    if (seg.ad > 0 && since < dissolveMs) {
      // From the ad before (Task 118): a darker pixel dissolve, the old ad held as it ended.
      const before = ads[adIndex(seg.brk, seg.ad - 1, perBreak, ads.length)];
      const facts = { ...adFactsNow.facts, back };
      drawAdDissolve(ctx, R, since / dissolveMs, (c, r) => drawAd(c, r, adSeconds * 1000, before, facts), (c, r) => drawAd(c, r, since, ad, facts));
    } else drawAd(ctx, R, since, ad, { ...adFactsNow.facts, back });
    // The jingle, as the ad starts (not when loading into the middle of one), timed to its brand; not above ?speed=2.
    const key = `${seg.from}`;
    if (key !== jingleKey) {
      jingleKey = key;
      if (since < 500 && audio.on && clock.speed <= 2) {
        audio.play('jingle', { seed: ad.id, jingle: ad.jingle, delay: Math.max(0, ad.jingle.at - since / 1000) });
        // Its sound effects (Task 205), each at its moment.
        for (const e of ad.effects ?? []) audio.play('effect', { seed: `${ad.id}|${e.at}`, effect: e.effect, gain: e.gain ?? 1, delay: Math.max(0, e.at - since / 1000) });
      }
    }
  };
  // The ad stills above the ground in Full (Task 113): one ad at a time, the next every ads.stillMinutes of the league's
  // clock, each ad once a pass in a seeded order (Task 158; the promo only in its window), with the facts of when it went up.
  /** @type {{ key: number, ad: any, facts: ReturnType<typeof adFacts> } | null} */
  let stillNow = null;
  /** Where the scorebug ends on the stage (stage px): its width changes with its label (LIVE, HIGHLIGHTS, NEXT…). */
  const bugEl = $('scorebug');
  const bugEnd = () => {
    const s = stage.getBoundingClientRect();
    return Math.ceil((bugEl.getBoundingClientRect().right - s.left) / (s.width / STAGE_WIDTH));
  };
  /** The still before this one, for the dissolve into it. @type {ReturnType<typeof stillAt> | null} */
  let stillBefore = null;
  /**
   * @param {CanvasRenderingContext2D} c @param {import('./sceneArt.js').Rect} R @param {number} t
   * @param {string | null} homeId  The home team of the match on screen: the League Shop's still shows its shirt (Task 161).
   */
  const drawStillNow = (c, R, t, homeId) => {
    const { stillMinutes, dissolveMs } = config.settings.ads;
    const every = stillMinutes * 60_000;
    if (stillNow?.key !== Math.floor(t / every)) {
      stillNow = stillAt(config.ads.ads, live, t, stillMinutes, channel);
      stillBefore = null;
    }
    // The same darker pixel dissolve as between the ads in a break (Task 119, Tom), over the new still's first
    // dissolveMs of the league's clock, so every screen changes together.
    const into = t - stillNow.key * every;
    if (into < dissolveMs) {
      stillBefore ??= stillAt(config.ads.ads, live, t - every, stillMinutes, channel);
      const [from, to] = [stillBefore, stillNow];
      drawAdDissolve(c, R, into / dissolveMs, (g, r) => drawAdStill(g, r, from.ad, shopWith(from.facts, homeId)), (g, r) => drawAdStill(g, r, to.ad, shopWith(to.facts, homeId)));
    } else drawAdStill(c, R, stillNow.ad, shopWith(stillNow.facts, homeId));
  };
  // The channel's opening ident (Task 106; spotArt.js drawIdent, Tom's pick C): over the scene's rect, a whoosh as the
  // comet comes in and a bright chord as it lands as the O (as it starts, not when loading into the middle; not above
  // ?speed=2). A band cuts into it and out of it to the welcome (transitions.js).
  /** @type {{ seg: Extract<import('./programme.js').Segment, { kind: 'ident' }>, since: number } | null} */
  let identNow = null;
  let identKey = -1;
  /** @param {number} slide @param {number} t */
  const drawIdentNow = (slide, t) => {
    if (!identNow) return;
    const { seg, since } = identNow;
    const R = sceneRect(slide);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    drawIdent(ctx, R, since, seg.until - seg.from, { back: (c, r) => drawScene(c, r, t, config.settings.scene), fade: false });
    ctx.restore();
    if (identKey === seg.from) return;
    identKey = seg.from;
    if (since > 300 || !audio.on || clock.speed > 2) return;
    const { enter, land } = identLanding(R);
    const scale = 1 / clock.speed;
    audio.play('whoosh', { seed: `ident|${seg.from}`, delay: ((enter - since) / 1000) * scale });
    // The fire following the comet round the name (Task 249), from its entry to its landing.
    audio.play('fire', { seed: `ident|${seg.from}`, delay: ((identPath(R).START - since) / 1000) * scale, track: identTrack(R), style: params.fire ?? config.settings.sound.identFire });
    audio.play('ident', { seed: `ident|${seg.from}`, delay: ((land - since) / 1000) * scale });
  };
  // A new season's countdown to the opening (Task 277b), over the scene's rect like the ident it leads into.
  /** @type {{ seg: Extract<import('./programme.js').Segment, { kind: 'countdown' }>, since: number, left: number } | null} */
  let countdownNow = null;
  /** @param {number} slide @param {number} t */
  const drawCountdownNow = (slide, t) => {
    if (!countdownNow) return;
    const R = sceneRect(slide);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(R.x, R.y, R.w, R.h);
    ctx.clip();
    drawCountdown(ctx, R, countdownNow.since, countdownNow.left, countdownNow.seg.season, { back: (c, r) => drawScene(c, r, t, config.settings.scene) });
    ctx.restore();
  };
  // The player-of-the-match interview (Task 100; interview.js): set A, the board, live in the post-match show and
  // recorded in re-airs.
  const interviewBox = $('interview');
  const ivBubble = $('interview-bubble');
  const ivBadge = $('interview-badge');
  const ivLower = $('interview-lower');
  const ivRec = $('interview-rec');
  const ivName = $('interview-name');
  const ivSub = $('interview-sub');
  const ivStats = $('interview-stats');
  const ivFact = $('interview-fact');
  /** @type {{ id: string, card: ReturnType<typeof potmCard>, look: import('./studioSet.js').Look } | null} */
  let interviewCache = null;
  // The crest at the left of the lower third (Task 166, shaded): redrawn only when the player's team changes.
  const ivCrest = /** @type {HTMLCanvasElement} */ ($('interview-crest'));
  const ivCrestSize = crestSize(1);
  ivCrest.width = ivCrestSize.w;
  ivCrest.height = ivCrestSize.h;
  ivCrest.style.width = `calc(var(--px) * ${ivCrestSize.w})`;
  ivCrest.style.height = `calc(var(--px) * ${ivCrestSize.h})`;
  let ivCrestTeam = '';
  /** Who the interview is with, what they say, and how they look (their kit in that match). @param {import('./liveLeague.js').LiveMatch} m */
  const interviewOf = (m) => {
    if (interviewCache?.id !== m.id) {
      const card = potmCard(m, live, 0);
      const side = card.teamId === m.homeId ? 'home' : 'away';
      const look = playerLook(card.playerId, channel.kitsOf(m.homeId, m.awayId)[side], { keeper: card.position === keeperSlot, side }, config.studio.looks);
      interviewCache = { id: m.id, card, look };
    }
    return interviewCache;
  };
  /** Each part of the interview's quote already said, by part (Task 247a): its match, re-air and part. @type {string[]} */
  const quoteSaid = [];
  /** @type {{ m: import('./liveLeague.js').LiveMatch, since: number, reair: boolean } | null} The interview on screen, and how far in. */
  let interviewNow = null;
  /** @param {HTMLElement} node @param {number} x @param {number} y */
  const placeAt = (node, x, y) => {
    node.style.left = `calc(var(--px) * ${x})`;
    node.style.top = `calc(var(--px) * ${y})`;
  };
  /**
   * The interview: the board and the player over the ground in Full or the whole screen in Broadcast, the badge and
   * the caption bar, the quote typing, and RECORDED in re-airs (the HTML parts hidden while a transition covers it).
   * @param {number} slide @param {boolean} covered
   */
  const drawInterviewNow = (slide, covered) => {
    if (!interviewNow) {
      interviewBox.hidden = true;
      return;
    }
    const { m, since, reair } = interviewNow;
    const { card, look } = interviewOf(m);
    const R = sceneRect(slide);
    const L = interviewLayout(R);
    const s = config.settings;
    // The quote in the player's own voice (Task 135): their region's, a man's or a woman's; once, as it starts typing,
    // the typing paced to it.
    // Task 247a: in parts (a reaction, then a fact; or the canned quote), each its own clip, played as its part starts.
    const delayMs = s.studio.interviewQuoteDelaySeconds * 1000;
    const urls = card.voice ? card.parts.map((p) => interviewClipUrl(/** @type {string} */ (card.voice), p.key)) : [];
    const schedule = quoteSchedule(interviewParts(card, config.voiceLengths, (key) => audio.clipSeconds(`assets/voices/${key}.mp3`)), s.captions.quoteCharsPerSecond, s.studio.interviewPartGapSeconds * 1000);
    if (urls.length && audio.on) {
      audio.loadClips(urls);
      schedule.parts.forEach((part, i) => {
        const key = `${m.id}|${reair}|${i}`;
        const into = since - delayMs - part.from;
        // A clip still loading is tried again next frame, until its part is too far gone to start.
        if (key !== quoteSaid[i] && into >= 0 && clock.speed <= 2 && (into >= SPEECH_START_MS || audio.playClip(urls[i], { kind: 'speech' }))) quoteSaid[i] = key;
      });
    }
    const now = interviewPose(since, card.quote.length, { delayMs, charsPerSecond: s.captions.quoteCharsPerSecond, nodEveryMs: s.studio.nodEverySeconds * 1000, schedule });
    drawInterview(ctx, R, look, now, Math.floor(performance.now() / (now.mouth ? 160 : 300)) % 2, { badge: shirtCrest(ctx, card.teamId) });
    if (ivCrestTeam !== card.teamId) {
      ivCrestTeam = card.teamId;
      const cc = /** @type {CanvasRenderingContext2D} */ (ivCrest.getContext('2d'));
      cc.clearRect(0, 0, ivCrest.width, ivCrest.height);
      drawCrest(cc, 0, 0, league.teams[card.teamId], { style: 'shaded', scale: 1 });
    }
    interviewBox.hidden = covered;
    placeAt(ivBubble, L.bubble.x, L.bubble.y);
    ivBubble.style.width = `calc(var(--px) * ${L.bubble.w})`;
    ivBubble.hidden = now.chars === 0;
    setText(ivBubble, `"${card.quote.slice(0, now.chars)}${now.chars < card.quote.length ? '' : '"'}`);
    placeAt(ivBadge, L.badge.x, L.badge.y);
    placeAt(ivLower, L.lower.x, L.lower.y);
    ivLower.style.width = `calc(var(--px) * ${L.lower.w})`;
    ivLower.style.height = `calc(var(--px) * ${L.lower.h})`;
    ivLower.style.setProperty('--team', league.teams[card.teamId].colours.primary);
    setText(ivName, card.name);
    setText(ivSub, `${card.position} · ${card.teamName}`);
    setText(ivStats, card.stats);
    // The fact strip (Task 247a): from the moment the fact sentence starts.
    const factFrom = schedule.parts[1]?.from;
    ivFact.hidden = !card.factStrip || factFrom === undefined || since - delayMs < factFrom;
    setText(ivFact, card.factStrip ?? '');
    const rec = recordedMark(reair, m.kickoff, channel.formatTime);
    ivRec.hidden = rec === null;
    setText(ivRec, rec ?? '');
    placeAt(ivRec, L.rec.right, L.rec.y);
  };
  /** @type {import('./crowd.js').StandsMood} The stands' mood this frame (Task 56): calm unless a match or ceremony sets it. */
  let standsNow = { level: CALM_STANDS, jump: null, gasp: null, wave: null };
  /** What this viewer's Fan Coins have showing this frame (fanCoins.js showing), or null. @type {ReturnType<typeof showing> | null} */
  let fanNow = null;
  /** The chant round last heard, so each plays once. */
  let chantHeard = -1;
  /** @type {import('./crowd.js').Fullness} How full the stands are this frame (Task 84). */
  let fullNow = { home: 1, away: 1, leaving: false };
  /** @type {{ key: string | null, fans: import('./stands.js').Fan[] | null, from: import('./stands.js').Fan[] | null, since: number }} The crowd drawn (its ground and who's in), and the one it's fading from (Task 89). */
  const crowdFade = { key: null, fans: null, from: null, since: 0 };
  /** @type {{ homeId: string, awayId: string, steps: number } | null} Whose ground the stands show (the last match or fixture on screen), and how much bigger its away end is. */
  let ground = null;
  const awayDugoutX = toStage(seat('away', 0)).x;
  /** @type {Map<string, number>} Each match's away end (awaySteps), worked out once. */
  const awayStepsCache = new Map();
  /**
   * How much bigger a match's away end is (Tom, 2026-10-16): the teams' regions, and the table before its kick-off.
   * @param {{ id: string, homeId: string, awayId: string, season: number, kickoff: number }} m
   */
  const awayStepsOf = (m) => {
    let steps = awayStepsCache.get(m.id);
    if (steps === undefined) {
      const table = tableAt(live, m.season, m.kickoff, (/** @type {import('./liveLeague.js').LiveMatch} */ x) => channel.timelineOf(x).duration);
      const teams = league.teams;
      steps = awaySteps(teams[m.homeId], teams[m.awayId], table, config.settings.broadcast.awayEnd);
      awayStepsCache.set(m.id, steps);
    }
    return steps;
  };
  const crawl = createCrawl(channel, stage);
  const cardPanel = createCardPanel(channel);

  // The viewer's pick among simultaneous live matches (null = follow the channel). Theirs alone.
  /** @type {string | null} */
  let viewerPick = null;
  /** @type {import('./liveLeague.js').LiveMatch[] | null} */
  let liveGroup = null;
  /** The last frame's moment, segment and match shown, for the line sent with a note (Task 261). */
  /** @type {{ t: number, seg: any, shown: import('./liveLeague.js').LiveMatch | null } | null} */
  let onAirNow = null;
  const multiview = createMultiview(channel, (id) => { viewerPick = id; });

  const dev = createDevPanel(config, live, seed, channel.timelineOf);
  window.addEventListener('keydown', (e) => {
    if (e.key === '`' && devTools) dev.toggle();
    if (e.key === 'h' || e.key === 'H') dev.toggleHelp();
    if (e.key === '0') viewerPick = null;
    const n = Number(e.key);
    if (liveGroup && n >= 1 && n <= liveGroup.length) viewerPick = liveGroup[n - 1].id;
  });

  /** Card content is rebuilt at most once a second, or when the segment changes. */
  let cardKey = '';
  let cardAt = -Infinity;
  /** @type {import('./overlays/cardPanel.js').Card | null} */
  let card = null;
  /** @param {string} key @param {() => import('./overlays/cardPanel.js').Card} make */
  const cardFor = (key, make) => {
    const realNow = performance.now();
    if (key !== cardKey || realNow - cardAt > CARD_REFRESH_MS) {
      card = make();
      cardKey = key;
      cardAt = realNow;
    }
    return card;
  };

  /** @type {Map<string, { line: import('./formation.js').Placed[], spots: import('./formation.js').Placed[], bench: { home: string[], away: string[] }, injured: Set<string> }>} The walk-out for each fixture. */
  const walkOuts = new Map();
  /** The line across halfway and the kick-off spots for a fixture. @param {import('./programme.js').NextFixture} f */
  const walkOutFor = (f) => {
    let w = walkOuts.get(f.id);
    if (!w) {
      const { home, away } = preMatchCard(f, live, f.kickoff, channel);
      w = {
        line: lineUp(home.lineup, away.lineup, keeperSlot),
        spots: kickoffSpots({ matchId: f.id, homeId: f.homeId, home: home.lineup, away: away.lineup, keeperSlot }),
        // The dugout in seat order: the injured nearest the tunnel (Task 185), then the substitutes.
        bench: { home: [...home.injured, ...home.bench], away: [...away.injured, ...away.bench] },
        injured: new Set([...home.injured, ...away.injured]),
      };
      walkOuts.set(f.id, w);
    }
    return w;
  };
  const teamName = (/** @type {string} */ id) => league.teams[id].shortName;
  /** @type {Map<string, { line: import('./formation.js').Placed[], spots: import('./formation.js').Placed[] }>} A re-air's line-up. */
  const reairLines = new Map();
  /** The line and kick-off spots for a re-aired match (its own first frame). @param {import('./liveLeague.js').LiveMatch} m */
  const reairLineFor = (m) => {
    let w = reairLines.get(m.id);
    if (!w) {
      const { home, away } = channel.timelineOf(m).stateAt(0).onPitch;
      w = { line: lineUp(home, away, keeperSlot), spots: /** @type {import('./motion.js').Pose} */ (motionOf(m).at(0)).players };
      reairLines.set(m.id, w);
    }
    return w;
  };

  // Livelier players (Task 120; poses.js, channel.md §17.4): where everyone was at the last few marks of the match
  // clock (poses.sampleMs apart), so speeds, turns and the ball's foot are the same on every screen, re-air and replay.
  /** @type {Map<string, Map<number, Map<string, import('./formation.js').Placed>>>} By match, by mark: everyone by id. */
  const markCache = new Map();
  /** @param {import('./liveLeague.js').LiveMatch} m @param {import('./motion.js').Motion} motion @param {number} g */
  const playersAtMark = (m, motion, g) => {
    let byMark = markCache.get(m.id);
    if (!byMark) markCache.set(m.id, (byMark = new Map()));
    let got = byMark.get(g);
    if (!got) {
      got = new Map((motion.at(g)?.players ?? []).map((pl) => [pl.playerId, pl]));
      byMark.set(g, got);
      // Keep the latest few marks (the replay inset and highlights look back from elsewhere, so a few more than needed).
      if (byMark.size > 40) byMark.delete(/** @type {number} */ (byMark.keys().next().value));
    }
    return got;
  };
  /** A player's seed for their own rhythm (as pitch.js's stride). @param {string} id */
  const strideSeed = (id) => id.charCodeAt(id.length - 1) * 37;

  /**
   * Players and ball at a moment in a match (motion.js), with their poses (Task 120) and the turf they kick up.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} elapsed
   * @returns {import('./motion.js').Pose | null}
   */
  /** @type {WeakMap<CanvasRenderingContext2D, Map<string, import('./ballSpin.js').SpinState>>} Each canvas's matches' ball turns. */
  const spinStates = new WeakMap();
  function drawMatch(m, elapsed, c = ctx) {
    const motion = motionOf(m);
    const raw = motion.at(elapsed);
    if (!raw) return null;
    let pose = raw;
    const P = config.settings.poses;
    const dt = P.sampleMs;
    const g0 = Math.floor(elapsed / dt) * dt;
    const mark = (/** @type {number} */ k) => playersAtMark(m, motion, g0 - k * dt);
    /** Horizontal speed between marks k + span and k (pitch lengths a second), or 0. @param {string} id @param {number} k @param {number} [span] */
    const vxAt = (id, k, span = 1) => {
      const a = mark(k + span).get(id);
      const b = mark(k).get(id);
      return a && b ? ((b.x - a.x) * 1000) / (span * dt) : 0;
    };
    /** Speed between marks 1 and 0 (the pitch is twice as long as wide). @param {string} id */
    const speedOf = (id) => {
      const a = mark(1).get(id);
      const b = mark(0).get(id);
      return a && b ? (Math.hypot(b.x - a.x, (b.y - a.y) / 2) * 1000) / dt : 0;
    };
    const action = motion.actionAt(elapsed, P);
    // The ball at its carrier's feet on the side they're heading; a ball just kicked carried on from the foot.
    const shortK = Math.round(P.footMs[0] / dt);
    const longK = Math.round(P.footMs[1] / dt);
    const footAt = (/** @type {string} */ id, /** @type {number} */ k, /** @type {1 | -1} */ attack) => footSide(vxAt(id, k, shortK), vxAt(id, k, longK), attack, P.footSpeed);
    const held = raw.ball?.held ? raw.ball : null;
    const holder = held ? raw.players.reduce((best, pl) => (Math.hypot(pl.x - held.x, pl.y - held.y) < Math.hypot(best.x - held.x, best.y - held.y) ? pl : best)) : null;
    if (held && holder) pose = { ...raw, ball: { ...held, dir: footAt(holder.playerId, 0, held.dir) } };
    else if (raw.ball && action.kick && action.kick.since < 120) pose = { ...raw, ball: { ...raw.ball, nudge: action.kick.dir * 4 * (1 - action.kick.since / 120) } };
    /** @type {Map<string, import('./poses.js').PlayerPose>} */
    const poses = new Map();
    const opts = { walk: P.walkSpeed, sprint: P.sprintSpeed, stepMs: P.stepMs };
    for (const pl of raw.players) {
      const at = toStage(pl);
      const seed = strideSeed(pl.playerId);
      if (action.kick?.playerId === pl.playerId) {
        const k = action.kick;
        poses.set(pl.playerId, { kind: 'kick', dir: k.dir, shot: k.shot });
        drawTurfKick(c, at.x + 2 * k.dir, at.y, k.dir, k.since, { count: k.shot ? P.turfShot : P.turfKick, seed: seed + Math.floor(elapsed - k.since), reach: k.shot ? 1.3 : 0.8 });
        continue;
      }
      if (action.dive?.playerId === pl.playerId) {
        const d = action.dive;
        const facing = /** @type {1 | -1} */ (pl.x < 0.5 ? 1 : -1);
        // The dive and the knee, or a standing catch or parry (Tom, 2026-10-20; settings.poses.saves).
        if (d.style !== 'dive') {
          poses.set(pl.playerId, { kind: d.style, dirY: d.dirY, facing });
          continue;
        }
        poses.set(pl.playerId, d.since < P.diveLeadMs + P.diveMs ? { kind: 'leap', dirY: d.dirY, facing } : { kind: 'knee', facing });
        drawTurfKick(c, at.x + 2 * facing, at.y, facing, d.since - d.landAt, { count: P.turfDive, seed: seed + Math.floor(elapsed - d.since), reach: 1.1 });
        continue;
      }
      const speed = speedOf(pl.playerId);
      const run = stepPhase(speed, elapsed, seed, opts);
      poses.set(pl.playerId, { kind: 'run', step: run.step });
      const vx = vxAt(pl.playerId, 0);
      // Behind each sprinting stride, a couple of flecks thrown back.
      if (run.sprinting && vx !== 0) drawTurfKick(c, at.x, at.y, vx > 0 ? -1 : 1, run.since, { count: P.turfStride, seed: seed + run.index, reach: 0.6 });
      // A sharp turn: the run's direction flipped at one of the last marks, at speed.
      for (let k = 0; k < 3; k++) {
        const now = vxAt(pl.playerId, k);
        const before = vxAt(pl.playerId, k + 1);
        if (now * before < 0 && Math.abs(now) > P.turnSpeed && Math.abs(before) > P.turnSpeed) {
          drawTurfKick(c, at.x, at.y, now > 0 ? -1 : 1, elapsed - (g0 - k * dt), { count: P.turfTurn, seed: seed + g0 - k * dt });
          break;
        }
      }
    }
    // The ball changing feet: turf kicked up as it goes across.
    if (held && holder) {
      const side = footAt(holder.playerId, 0, held.dir);
      if (footAt(holder.playerId, 1, held.dir) !== side) {
        const at = toStage(holder);
        drawTurfKick(c, at.x, at.y, side > 0 ? -1 : 1, elapsed - g0, { count: P.turfTurn, seed: strideSeed(holder.playerId) + g0 });
      }
    }
    // The scoring side's keeper throws their arms up through the celebration (Task 65); the scorer and teammates
    // gather and cheer (Task 278l, animation.cheers.goal; ?cheer= on the dev server).
    const cheer = celebrationAt(channel.timelineOf(m), elapsed, config.settings.animation.goalCelebrateMs);
    const keeperUp = !cheer ? pose.players : pose.players.map((p) => (p.side === cheer.side && p.slot === keeperSlot ? { ...p, arms: /** @type {const} */ ('both') } : p));
    const scorerId = cheer ? channel.timelineOf(m).events.find((x) => x.event.seq === cheer.seq)?.event.playerId ?? null : null;
    const players = !cheer ? keeperUp : goalCheer(keeperUp, cheer, { variant: cheers.goal, scorerId, keeperSlot, celebrateMs: config.settings.animation.goalCelebrateMs, runSpeed: config.settings.animation.runSpeed, atGoal: motion.at(elapsed - cheer.since)?.players });
    // A trail behind a shot, and behind a bent pass so its curl reads (Task 34).
    const curling = Boolean(pose.ball?.curling);
    const trail = pose.effects.flight || curling
      ? TRAIL_MS.map((dt) => motion.at(elapsed - dt)?.ball).filter((b) => b != null && (!curling || b.curling))
      : [];
    // The ball's turn, by its speed, kept frame to frame for this match on this canvas (Tom: pick C, a round ball).
    let spins = spinStates.get(c);
    if (!spins) spinStates.set(c, (spins = new Map()));
    const spin = spinOn(spins.get(m.id) ?? null, pose.ball ? ballStageAt(pose.ball) : null, Boolean(pose.ball && !pose.ball.held), elapsed, config.settings.animation.ballSpin);
    if (spin) spins.set(m.id, spin);
    else spins.delete(m.id);
    const ball = () => drawBall(c, pose, trail, config.rules.heat, elapsed, spin?.turn ?? null);
    // A held ball is drawn just after its carrier, so it covers their feet but anyone in front of them covers it (Task
    // 44); a ball in the air goes over everyone.
    const b = pose.ball;
    const carrier = b?.held ? pose.players.reduce((best, p) => (Math.hypot(p.x - b.x, p.y - b.y) < Math.hypot(best.x - b.x, best.y - b.y) ? p : best)) : null;
    // momentum gained (Task 238; Task 255's style): rings pulsing out round each of the team's players, under or over them.
    const mo = momentumAt(channel.timelineOf(m), elapsed, config.rules.momentum.seconds);
    const ring = config.settings.animation.momentumRing;
    const rings = () => { if (mo) drawMomentumRings(c, players, mo.teamId === m.homeId ? 'home' : 'away', mo.since, ring); };
    if (!ring.over) rings();
    drawPlayers(c, players, channel.kitsOf(m.homeId, m.awayId), keeperSlot, elapsed, { after: (p) => { if (p.playerId === carrier?.playerId) ball(); }, people: matchPeople(m, elapsed), poseOf: (p) => poses.get(p.playerId) ?? null });
    if (!carrier) ball();
    if (ring.over) rings();
    // The vertical camera (vertical.html, the dev server only): where the ball is on the main picture, in stage px,
    // through the picture's own transform (Broadcast's), stamped so a picture without a match reads as none.
    if (devTools && c === ctx && pose.ball) {
      const p = c.getTransform().transformPoint(ballStageAt(pose.ball));
      /** @type {any} */ (window).scorchballBall = { x: p.x, y: p.y, at: performance.now() };
    }
    return pose;
  }

  /**
   * Which match is on the pitch and which way round, for the end boards: null for cards and the studio.
   * @param {import('./programme.js').Segment} seg @param {import('./liveLeague.js').LiveMatch | null} shown @param {number} t
   * @returns {{ homeId: string, awayId: string, stage: string, homeDefendsLeft: boolean } | null}
   */
  const endsOf = (seg, shown, t) => {
    // AROUND THE GROUNDS (Tom's note 14): the ground's own marks, its colours at both ends.
    if (seg.kind === 'grounds') return { homeId: seg.teamId, awayId: seg.teamId, stage: /** @type {const} */ ('regular'), homeDefendsLeft: true };
    const leftAt = (/** @type {import('./liveLeague.js').LiveMatch} */ m, /** @type {number} */ at) =>
      homeAttacksRight(channel.timelineOf(m).stateAt(at).phase) === 1;
    if (shown && (seg.kind === 'live' || seg.kind === 'highlights' || seg.kind === 'reair')) {
      return { homeId: shown.homeId, awayId: shown.awayId, stage: shown.stage, homeDefendsLeft: leftAt(shown, seg.kind === 'live' ? t - shown.kickoff : seg.elapsed) };
    }
    // Around a match (Task 103: the pre-match too): the home side defends the left until kick-off, and after the
    // whistle whichever end they finished at.
    const g = groundOf(seg);
    if (!g) return null;
    const after = seg.kind === 'handshakes' || (seg.kind === 'reair' && seg.part === 'handshakes');
    return { homeId: g.homeId, awayId: g.awayId, stage: g.stage, homeDefendsLeft: after ? leftAt(/** @type {import('./liveLeague.js').LiveMatch} */ (g), channel.timelineOf(/** @type {import('./liveLeague.js').LiveMatch} */ (g)).duration - 1) : true };
  };

  /** A substitute's slot for their kit: keepers wear the keeper's shirt on the bench too. @param {string} id */
  const slotOf = (id) => (league.players[id]?.position === keeperSlot ? keeperSlot : '');
  /** @type {Map<string, { x: number, y: number } | null>} Where a player was just before they came off (for the walk to the bench). */
  const offFrom = new Map();
  /**
   * The benches for a match at a moment: dugouts, the substitutes sitting still, and anyone walking off.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} at  ms since its kick-off.
   */
  const sidelinePeople = (m, at) => {
    const tl = channel.timelineOf(m);
    const posAt = (/** @type {string} */ id, /** @type {number} */ e) => {
      const key = `${m.id}|${id}|${e}`;
      if (!offFrom.has(key)) offFrom.set(key, motionOf(m).at(e)?.players.find((p) => p.playerId === id) ?? null);
      return /** @type {{ x: number, y: number } | null} */ (offFrom.get(key));
    };
    return sidelinesAt(tl, at, { posAt, jogSpeed: config.settings.animation.jogSpeed, slotOf, breakLineMs: config.settings.ceremonies.breakLineSeconds * 1000 });
  };
  /**
   * Draw the dugouts and whoever's on the sidelines: seated players stand still, walkers stride.
   * The injured (Task 185) wear the dark tracksuit trimmed in their team's main colour.
   * @param {{ homeId: string, awayId: string }} m @param {(import('./formation.js').Placed & { walking?: boolean, injured?: boolean })[]} people @param {number} at
   */
  const benchSeats = config.rules.roster.matchday - Object.values(config.rules.roster.lineup).reduce((a, n) => a + n, 0);
  const benchesWith = (m, people, at) => {
    const kits = channel.kitsOf(m.homeId, m.awayId);
    // Long enough for the furthest seat taken, walkers' included (Task 140: counting only those seated left a gap's
    // worth of bench short, and someone sitting out among the props).
    const count = (/** @type {'home' | 'away'} */ side) => {
      const ours = people.filter((p) => p.side === side);
      return Math.max(ours.filter((p) => !p.walking).length, ...ours.map((p) => ('seat' in p ? Number(p.seat) + 1 : 0)));
    };
    // Always a full bench's seats (Tom): a matchday squad less the line-up, empty seats left empty.
    drawBenches(ctx, kits, { home: count('home'), away: count('away') }, m.id, benchSeats);
    /** @param {(import('./formation.js').Placed & { walking?: boolean })[]} ps @returns {import('./pitch.js').Person[]} */
    const tracksuits = (ps) => ps.map((p) => ({
      x: p.x, y: p.y, walking: Boolean(p.walking),
      look: { shirt: PALETTE.tracksuit, trim: league.teams[p.side === 'home' ? m.homeId : m.awayId].colours.primary, trousers: PALETTE.tracksuit, skinKey: p.playerId },
    }));
    const [seated, walking] = [people.filter((p) => !p.walking), people.filter((p) => p.walking)];
    drawPlayers(ctx, seated.filter((p) => !p.injured), kits, keeperSlot, at, { idle: true, people: tracksuits(seated.filter((p) => p.injured)) });
    drawPlayers(ctx, walking.filter((p) => !p.injured), kits, keeperSlot, at, { people: tracksuits(walking.filter((p) => p.injured)) });
  };

  /**
   * How far open the tunnel's gate is for what's on screen (Task 63; sidelines.js gateOpen).
   * @param {import('./programme.js').Segment} seg @param {import('./liveLeague.js').LiveMatch | null} shown @param {number} t
   */
  const gateOpenness = (seg, shown, t) => {
    // The grounds tour: open throughout (Tom).
    if (seg.kind === 'grounds') return 1;
    const ms = config.settings.ceremonies.gateMs;
    if (shown && (seg.kind === 'live' || seg.kind === 'highlights' || (seg.kind === 'reair' && seg.part === 'match'))) {
      const tl = channel.timelineOf(shown);
      return gateOpen([...tl.breaks, { from: tl.duration, to: Infinity }], seg.kind === 'live' ? t - shown.kickoff : seg.elapsed, ms);
    }
    if (seg.kind === 'walk_out') {
      const total = config.settings.segments.walkOutMinutes * 60_000;
      return gateOpen([{ from: 0, to: walkOutParts(total, config.settings.ceremonies).breakFrom }], t - (seg.until - total), ms);
    }
    return seg.kind === 'handshakes' || (seg.kind === 'reair' && seg.part === 'handshakes') ? 1 : 0;
  };

  /**
   * The handshakes after a match (live or re-aired): players, the result in the scorebug, and the caption.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} since  ms since the whistle. @param {number} total
   */
  const drawHandshakes = (m, since, total) => {
    const end = motionOf(m).at(channel.timelineOf(m).duration - 1);
    const homeWon = winnerOf(m) === m.homeId;
    const c = config.settings.ceremonies;
    if (end) {
      // The whole squads: whoever was on the pitch at the whistle, and everyone on the benches.
      const squads = [...end.players, ...sidelinePeople(m, channel.timelineOf(m).duration)];
      const winner = winnerOf(m);
      const players = handshakePose(squads, since, total, { ceremonies: c, jogSpeed: config.settings.animation.jogSpeed, keeperSlot, homeWon, winner: winner === m.homeId ? 'home' : winner === m.awayId ? 'away' : null, cheer: cheers.winners });
      drawPlayers(ctx, players, channel.kitsOf(m.homeId, m.awayId), keeperSlot, since, { people: handshakePeople(m, since, total) });
    }
    scorebug.result(m);
    const r = m.summary.result;
    caption.show(handshakeCaption(since, total, { homeId: m.homeId, awayId: m.awayId, score: [r.homeGoals, r.awayGoals] }, teamName, homeWon, c), m);
  };

  /** @type {{ since: number, o: Parameters<typeof drawLiftCloseUp>[3] } | null} The lift's close-up this frame (Task 190). */
  let liftNow = null;
  /** @type {{ since: number, colours: string[] } | null} The lift's stage this frame (its fireworks, its flash; Tom, 2026-10-20). */
  let liftStageNow = null;
  /** @type {{ since: number, view: import('./awardShow.js').AwardView } | null} The award on its plinth this frame (Task 191). */
  let awardNow = null;
  /** @type {Map<string, import('./awardShow.js').AwardView | null>} Each award's view, worked out once. */
  const awardViews = new Map();
  const POSITION_PLURAL = /** @type {Record<string, string>} */ ({ K: 'KEEPERS', D: 'DEFENDERS', M: 'MIDFIELDERS', S: 'STRIKERS' });
  /** What an award shows, from the sim's award event (awardShow.js). @param {number} season @param {string} award */
  const awardViewOf = (season, award) => {
    const key = `${season}|${award}`;
    if (!awardViews.has(key)) {
      const event = awardEvents(live.leagueEvents, season).get(award);
      const nameOf = (/** @type {string} */ id) => { const p = league.players[id]; return p ? `${p.firstName} ${p.lastName}` : id; };
      awardViews.set(key, event ? awardView(event, config.rules.awards, nameOf, (pos) => POSITION_PLURAL[pos] ?? pos) : null);
    }
    return awardViews.get(key) ?? null;
  };
  const awardArtOpts = { teams: league.teams, looks: config.studio.looks, isKeeper: (/** @type {string} */ id) => league.players[id]?.position === keeperSlot };
  /** @type {{ seg: Extract<import('./programme.js').Segment, { kind: 'farewell' | 'lottery' | 'draft' | 'moves' }>, since: number } | null} The farewells, the lottery or the draft this frame (Tasks 192–193). */
  let offseasonNow = null;
  /** @type {Map<number, { farewells: import('./offseasonShow.js').Farewell[], lottery: ReturnType<typeof lotteryView> | null, picks: import('./offseasonShow.js').DraftPick[], moves: import('./offseasonShow.js').Move[] }>} Each season's, worked out once. */
  const offseasonViews = new Map();
  /** The season's farewells and lottery, as the programme has them (offseasonShow.js). @param {number} season */
  const offseasonOf = (season) => {
    let v = offseasonViews.get(season);
    if (!v) {
      const nameOf = (/** @type {string} */ id) => { const p = league.players[id]; return p ? `${p.firstName} ${p.lastName}` : id; };
      const summary = league.history.find((h) => h.season === season);
      v = {
        farewells: notableRetirements(live.leagueEvents, league.history, season, config.settings.farewells, config.rules.awards, nameOf),
        lottery: summary ? lotteryView(live.leagueEvents, season, summary, config.rules) : null,
        picks: draftPicks(live.leagueEvents, season, league.players, league.teams, config.regions.regions),
        moves: movesView(live.leagueEvents, season, league.history, league.players, league.teams, config.rules.awards, config.settings.moves, config.settings.farewells.awardWeight, config),
      };
      offseasonViews.set(season, v);
    }
    return v;
  };
  /**
   * The farewells' gallery (the one lit, `since` into their turn) or the lottery's tumbler, over the scene.
   * @param {import('./interview.js').Rect} R @param {number} t
   * @param {Extract<import('./programme.js').Segment, { kind: 'farewell' | 'lottery' | 'draft' | 'moves' }>} seg @param {number} since
   */
  const drawOffseasonNow = (R, t, seg, since) => {
    const v = offseasonOf(seg.season);
    if (seg.kind === 'farewell') {
      drawFarewells(ctx, R, t, v.farewells, seg.index, since, seg.season, { teams: league.teams, looks: config.studio.looks, keeperSlot });
    } else if (seg.kind === 'draft') {
      // A pick (Task 193): round 1 on the board, then in close-up; round 2 on the board, its name up partway.
      const pk = v.picks[seg.index];
      if (!pk) return;
      const round = v.picks.filter((p) => p.round === pk.round);
      const at = round.indexOf(pk);
      const d = config.settings.draft;
      if (pk.round === 1) {
        const beats = pickBeats(since, d);
        if (beats.closeUp) drawPickCloseUp(ctx, R, t, pk, beats, { teams: league.teams, looks: config.studio.looks, keeperSlot });
        else drawDraftBoard(ctx, R, round, at, false, { teams: league.teams, season: seg.season, since, walk: beats.walk, card: 0 });
      } else {
        const named = since >= d.round2NameAt * 1000;
        drawDraftBoard(ctx, R, round, at, named, { teams: league.teams, season: seg.season, since, walk: 0, card: Math.min(1, Math.max(0, (since - d.round2NameAt * 1000) / 500)) });
      }
    } else if (seg.kind === 'moves') {
      // The moves board (Task 194): a line at a time, the lit one's card below.
      const mv = config.settings.moves;
      drawMoves(ctx, R, v.moves, movesBeats(since, v.moves.length, mv), { teams: league.teams, season: seg.season, perPage: mv.perPage, cardAt: mv.cardAt });
    } else if (v.lottery) {
      drawLottery(ctx, R, t, v.lottery, lotteryBeats(since, v.lottery.picks.length, config.settings.lottery), { teams: league.teams, season: seg.season, dropAt: config.settings.lottery.dropAt });
    }
  };
  /** @type {string} The lottery draw last heard (Task 204), so each plays once. */
  let lotteryHeard = '';
  /**
   * The lottery's sound for each draw (Task 204, Tom's pick A): as a draw starts (or joining part-way, up to its
   * landing), once.
   * @param {Extract<import('./programme.js').Segment, { kind: 'lottery' }>} seg @param {number} since
   */
  const lotterySounds = (seg, since) => {
    if (!audio.on || clock.speed > 2) return;
    const lot = config.settings.lottery;
    const v = offseasonOf(seg.season).lottery;
    if (!v) return;
    const b = lotteryBeats(since, v.picks.length, lot);
    if (b.reveal < 0) return;
    const key = `${seg.from}|${b.reveal}`;
    if (key === lotteryHeard) return;
    const into = b.into / 1000;
    if (into > lot.dropAt + 1.5) return;
    if (audio.play('lottery', { seed: key, style: lot.sound, dropAt: lot.dropAt, from: into, fadeIn: into > 0.2 ? 0.3 : 0 })) lotteryHeard = key;
  };
  /** @type {{ from: number, nextAt: number, loopMs: number, level: number, style: string } | null} The off-season's music under way (Task 204): its run's start, when the next pass begins, how loud (soft under the lottery). */
  let musicRun = null;
  /** When the last run's fade-out ends: a pre-roll waits for it, so it never cuts a fade short. */
  let musicFadedAt = -Infinity;
  /**
   * The off-season's music (Task 204): a run of its scenes starts the loop (from its top at the run's start, so every
   * screen hears the same), each pass queued a moment before the last ends; anything else fades it out.
   * @param {import('./programme.js').Segment} seg @param {number} t
   */
  const musicFrame = (seg, t) => {
    const m = config.settings.sound.music;
    const can = audio.on && clock.speed <= 2;
    // Not before its run's start (Task 211: a run of studio cards starts it after the jingle).
    const heard = 'musicFrom' in seg && typeof seg.musicFrom === 'number' && seg.musicFrom <= t && can ? seg.musicFrom : null;
    // A run about to start (Tom): its loop already under way, silent, preRollSeconds ahead, so nothing starts at the cut.
    const ahead = heard === null && can && t >= musicFadedAt ? programme.at(t + m.preRollSeconds * 1000) : null;
    const coming = ahead && 'musicFrom' in ahead && typeof ahead.musicFrom === 'number' && ahead.musicFrom > t ? ahead.musicFrom : null;
    const runFrom = heard ?? coming;
    // The run's track (Task 278h): music.tracks in turn, run by run, as the programme numbered them.
    const of = heard !== null ? seg : ahead;
    const style = m.tracks[((of && 'musicTrack' in of && typeof of.musicTrack === 'number' ? of.musicTrack : 0) % m.tracks.length)];
    if (runFrom === null) {
      if (musicRun) {
        audio.fadeMusic(0, m.fadeOutMs);
        musicRun = null;
        musicFadedAt = t + m.fadeOutMs + 100;
        // Stopped once faded, unless a new run has started meanwhile.
        setTimeout(() => { if (musicRun === null) audio.stop('music'); }, m.fadeOutMs + 50);
      }
      return;
    }
    // Softly under the lottery (Tom), full elsewhere; silent until its run begins.
    const level = heard === null ? 0 : seg.kind === 'lottery' ? m.lotteryLevel : 1;
    if (musicRun && musicRun.from === runFrom && musicRun.level !== level) {
      // Up from silence at the run's start over fadeInMs; between levels (the lottery) over fadeOutMs.
      audio.fadeMusic(level, musicRun.level === 0 ? m.fadeInMs : m.fadeOutMs);
      musicRun.level = level;
    }
    // Fallen behind its next pass (Task 277b: the tab hidden, a stall, the laptop asleep): started over where it would be,
    // since queuing the overdue pass at once, every frame until caught up, played copies of it over each other.
    if (!musicRun || musicRun.from !== runFrom || musicRun.nextAt <= t) {
      audio.stop('music');
      const loopMs = musicLayers(style).duration * 1000;
      const into = (((t - runFrom) % loopMs) + loopMs) % loopMs;
      audio.fadeMusic(0, 0);
      if (!audio.play('music', { seed: 'music', style, from: into / 1000, loop: loopMs / 1000 })) return;
      // Eased in when joined part-way (a run already going: tuning in, a hidden tab back); a run's own start is
      // pre-rolled silent and brought up above.
      if (level > 0) audio.fadeMusic(level, m.fadeInMs);
      musicRun = { from: runFrom, nextAt: t + loopMs - into, loopMs, level, style };
    } else if (musicRun.nextAt - t < 1500) {
      // Queue the next pass to start exactly as this one ends; if it couldn't play (a hidden tab), start over on return.
      if (!audio.play('music', { seed: 'music', style: musicRun.style, delay: Math.max(0, (musicRun.nextAt - t) / 1000), loop: musicRun.loopMs / 1000 })) musicRun = null;
      else musicRun.nextAt += musicRun.loopMs;
    }
  };
  /** @type {{ id: string, championId: string, champSide: 'home' | 'away', captainId: string, closeUp: Parameters<typeof drawLiftCloseUp>[3] } | null} */
  let liftCache = null;
  /**
   * Who the lift is about, worked out once a final: the champions, their side, the five who started for them and the
   * captain (their best outfield starter, trophyLift.js liftFive).
   * @param {import('./liveLeague.js').LiveMatch} m
   */
  const liftInfo = (m) => {
    if (liftCache?.id === m.id) return liftCache;
    const championId = /** @type {string} */ (winnerOf(m));
    const champSide = championId === m.homeId ? 'home' : 'away';
    const lineup = /** @type {any} */ (m.events.find((e) => e.type === 'lineup' && e.teamId === championId))?.data.starters ?? [];
    const { five, captainId } = liftFive(lineup, keeperSlot, (id) => overall(league.players[id], config.positions));
    const kit = channel.kitsOf(m.homeId, m.awayId)[champSide];
    liftCache = { id: m.id, championId, champSide, captainId, closeUp: { team: league.teams[championId], kit, side: champSide, five, captainId, keeperSlot, season: m.season, looks: config.studio.looks } };
    return liftCache;
  };
  /**
   * The lift's sounds since the last frame, and the stands' mood (trophyLift.js liftCues, liftMood).
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} since @param {{ championId: string, champSide: 'home' | 'away' }} L
   */
  const liftSounds = (m, since, L) => {
    const s = config.settings.trophyLift;
    const span = sinceHeard(`lift|${m.id}`, since);
    const level = config.settings.crowd.ceremony;
    standsNow = liftMood(since, s, L.champSide, level);
    murmur(level, (fullNow.home + fullNow.away) / 2);
    if (!audio.on || clock.speed > 2) return;
    const cues = liftCues(s, m.id, league.teams[L.championId].anthem);
    if (!span) {
      resumeRinging(cues, since);
      return playComing(cues, since);
    }
    const [from, to] = leadWindow(span, leadMs());
    for (const cue of cues) if (cue.at > from && cue.at <= to) playDue(cue, span[1]);
    afterWhistleCues(m, span);
    afterWhistleCalls(m, span);
  };
  /**
   * The trophy lift after the final (Task 190): the wide shot of the celebration, the guard of honour, the anthem and
   * the walk to the podium, then the close-up of the lift; its caption, the crowd and their sounds.
   * @param {import('./liveLeague.js').LiveMatch} m @param {number} since  ms since the whistle.
   */
  const drawLift = (m, since) => {
    const s = config.settings.trophyLift;
    const L = liftInfo(m);
    const p = liftParts(s);
    scorebug.result(m);
    const r = m.summary.result;
    const home = L.champSide === 'home';
    const [cg, rg] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
    const so = r.shootout;
    const score = so ? `${cg}-${rg}, ${home ? so.home : so.away}-${home ? so.away : so.home} on free shots` : `${cg}-${rg}`;
    const runnerUpId = L.championId === m.homeId ? m.awayId : m.homeId;
    caption.show(liftCaption(since, s, { championId: L.championId, runnerUpId, season: m.season, score }, teamName), m);
    liftSounds(m, since, L);
    if (since >= p.closeUpAt && since < p.stageAt) {
      liftNow = { since: since - p.closeUpAt, o: L.closeUp };
      return;
    }
    const tl = channel.timelineOf(m);
    const end = motionOf(m).at(tl.duration - 1);
    if (!end) return;
    const squads = [...end.players, ...sidelinePeople(m, tl.duration).filter((q) => !q.injured)];
    const placed = liftPose(squads, since, s, { champSide: L.champSide, captainId: L.captainId });
    if (since < p.stageAt) {
      drawPodium(ctx, podiumRise(since, s), PODIUM_Y);
      drawPlayers(ctx, placed, channel.kitsOf(m.homeId, m.awayId), keeperSlot, since, { people: liftPeople(m, since, L.champSide) });
      return;
    }
    // The second cut (Tom, 2026-10-20, his pick C): back wide, the stage where the podium stood, the cup passed down
    // the line from the captain, the others waving, fireworks over the stands and confetti.
    const team = league.teams[L.championId];
    const stageSince = since - p.stageAt;
    const row = placed.filter((q) => q.side === L.champSide).sort((a, b) => a.x - b.x);
    const held = stageHolder(since, s, row.length, Math.max(0, row.findIndex((q) => q.playerId === L.captainId)));
    const holder = held === null ? null : row[held];
    const waving = placed.map((q) => (q.side !== L.champSide ? q : { ...q, arms: /** @type {import('./pitch.js').Arms} */ (q === holder ? 'both' : Math.floor((stageSince + row.indexOf(q) * 130) / 320) % 2 ? 'right' : 'none') }));
    drawLiftStage(ctx, 1, PODIUM_Y, team);
    drawPlayers(ctx, waving, channel.kitsOf(m.homeId, m.awayId), keeperSlot, since, { people: liftPeople(m, since, L.champSide) });
    if (holder) {
      const at = toStage(holder);
      drawSmallCup(ctx, at.x, at.y - 11 - (Math.floor(stageSince / 400) % 2));
    }
    liftStageNow = { since: stageSince, colours: [team.colours.primary, team.colours.secondary] };
    confettiNow = { colours: [GOLD.fill, team.colours.primary, team.colours.secondary], since: stageSince };
  };

  /** What's on, for the readout (?perf=1). */
  let segNow = '';
  /** Draw everything for moment `t`. @param {number} t */
  const draw = (t) => {
    // The sharp text layer starts each frame empty (Task 200).
    sharpClear(ctx);
    // On the live channel, the picture holds on BACK SOON while the day's key isn't out (Task 271).
    if (keys) {
      const ready = keysReady(keys, t);
      backSoon(!ready);
      if (!ready) {
        if (t - keysAskedAt > KEY_RETRY_MS) {
          keysAskedAt = t;
          keys.topUp(t).catch(() => {});
        }
        return;
      }
    }
    live.advanceTo(t);
    mark('league');
    const pos = calendar.at(t);
    const seg = programme.at(t);
    musicFrame(seg, t);
    fanNow = coinStore ? showing(config, coinStore.data, { t, seg, timelineOf: channel.timelineOf }, replaySpends(seg)) : null;
    fanChant(t);
    // How full the stands are (Task 84), for the drawing and the murmur.
    const segMatch = 'match' in seg ? seg.match : null;
    const winner = segMatch?.summary ? winnerOf(segMatch) : null;
    const loser = !segMatch || !winner ? null : winner === segMatch.homeId ? 'away' : 'home';
    // The handshakes run from the final whistle (shorter without a home win, Task 74).
    const fullSeg = seg.kind === 'handshakes' ? { ...seg, from: seg.match.kickoff + channel.timelineOf(seg.match).duration } : seg;
    fullNow = standsFullness(fullSeg, t, { fill: config.settings.crowd.fill, segments: config.settings.segments }, loser);

    // Broadcast (Task 55): the whole ground drawn shifted right by the slide's progress; the stands go round it below.
    standsNow = { level: CALM_STANDS, jump: null, gasp: null, wave: null };
    replayNow = null;
    studioNow = null;
    podcastReelNow = null;
    interviewNow = null;
    adNow = null;
    identNow = null;
    countdownNow = null;
    // A re-air or highlights lit as when the match was played (Tom), the rest by the hour now.
    lightNow = lightFor(litMoment(seg, t));
    confettiNow = null;
    liftNow = null;
    liftStageNow = null;
    awardNow = null;
    offseasonNow = null;
    const slide = layout.progress(performance.now());
    const shift = Math.round(slide * config.settings.broadcast.shiftPx);
    // The transition on screen, if any: drawn over everything at the end of the frame.
    const trNow = transitionAt(programme.at, t, config.settings.transitions);
    stage.style.setProperty('--shift', String(shift));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(1, 0, 0, 1, shift, 0);
    drawPitch(ctx);

    // Several matches live at once: the viewer may have picked one; goals elsewhere cut in as alerts.
    const reairMatch = seg.kind === 'reair' && seg.part === 'match';
    let shown = seg.kind === 'live' || seg.kind === 'highlights' || reairMatch ? seg.match : null;
    if (seg.kind === 'live' && seg.group.length > 1) {
      const isLive = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => t >= m.kickoff && t < m.kickoff + channel.timelineOf(m).duration;
      const picked = seg.group.find((m) => m.id === viewerPick);
      if (picked && isLive(picked)) shown = picked;
      else viewerPick = null;
      liveGroup = seg.group;
      const alert = alertAt(seg.group, shown.id, t, { timelineOf: channel.timelineOf, abbr: (id) => league.teams[id].abbr, alertMs: config.settings.captions.alertMs });
      multiview.strip(seg.group.map((m) => ({
        id: m.id, homeId: m.homeId, awayId: m.awayId, live: isLive(m),
        score: /** @type {[number, number]} */ (channel.timelineOf(m).stateAt(t - m.kickoff).score),
      })), shown.id, seg.match.id, viewerPick === null, alert?.index ?? null);
      multiview.alert(alert);
    } else {
      liveGroup = null;
      viewerPick = null;
      multiview.strip(null, null, null, true);
      multiview.alert(null);
    }
    onAirNow = { t, seg, shown };

    // The end boards in the colours of the team defending each goal, whenever a match is on the pitch.
    const ends = endsOf(seg, shown, t);
    if (ends) {
      drawEndBoards(ctx, seg.kind === 'grounds' ? tourGround(seg.teamId).kits : channel.kitsOf(ends.homeId, ends.awayId), ends.homeDefendsLeft);
      // The home ground's centre circle (Task 49), the final's too (at the better seed's ground, Tom 2026-10-05).
      drawHomeMark(ctx, league.teams[ends.homeId].colours, homeIcon(ends.homeId));
      // A semifinal or the final (Task 117, Tom's picks): the words on the pitch, and for the final the trophy and gold boards.
      drawPlayoffMarks(ctx, ends.stage);
    }
    // The tunnel's gate (Task 63): shut during play, open for the walk-out, the breaks and the handshakes.
    drawGate(ctx, gateOpenness(seg, shown, t));
    // The benches, whenever a match is on the pitch.
    if (shown && (seg.kind === 'live' || seg.kind === 'highlights' || reairMatch)) {
      const at = seg.kind === 'live' ? t - shown.kickoff : seg.elapsed;
      // After a goal the scoring side's bench is on its feet (Task 65).
      const cheer = celebrationAt(channel.timelineOf(shown), at, config.settings.animation.goalCelebrateMs);
      const people = sidelinePeople(shown, at);
      const seats = Math.max(0, ...people.filter((p) => p.side === cheer?.side).map((p) => p.seat + 1));
      benchesWith(shown, !cheer ? people : people.map((p) => {
        if (p.side !== cheer.side || p.walking) return p;
        const c = benchCheer(p.side, p.seat, seats, cheer);
        return { ...p, x: p.x + c.dx, y: p.y + c.dy, arms: c.arms };
      }), at);
    } else if (seg.kind === 'walk_out') {
      // The substitutes follow the starters out of the tunnel to their seats.
      const since = t - (seg.until - config.settings.segments.walkOutMinutes * 60_000);
      const w = walkOutFor(seg.fixture);
      const subs = benchWalkOn(w.bench, since, { ceremonies: config.settings.ceremonies, jogSpeed: config.settings.animation.jogSpeed, slotOf, after: Math.ceil(w.line.length / 2), injured: w.injured });
      benchesWith(seg.fixture, subs, since);
    } else if (seg.kind === 'handshakes' || (seg.kind === 'reair' && seg.part === 'handshakes')) {
      // The substitutes join the handshakes (drawHandshakes), so just the dugouts here, and the injured in their seats
      // (Task 185).
      benchesWith(seg.match, sidelinePeople(seg.match, 0).filter((p) => p.injured), 0);
    } else if (seg.kind === 'reair' && seg.part === 'lineup') benchesWith(seg.match, sidelinePeople(seg.match, 0), 0);
    // The pre-match (Task 103): the next home ground with its dugouts empty; the substitutes come out with the walk-out.
    else if (seg.kind === 'pre_match') benchesWith(seg.fixture, [], 0);
    // The grounds tour: the dugouts empty (the dugouts' scene sweeps them out).
    else if (seg.kind === 'grounds') drawBenches(ctx, tourGround(seg.teamId).kits, { home: 0, away: 0 }, null, benchSeats);

    if (shown && (seg.kind === 'live' || seg.kind === 'highlights' || reairMatch)) {
      const tl = channel.timelineOf(shown);
      const at = seg.kind === 'live' ? t - shown.kickoff : seg.elapsed;
      // OFF THE BALL's day's goals play on the booth's screen (drawPodcastReelNow), not on the ground.
      if (seg.kind === 'highlights' && seg.podcast) podcastReelNow = { seg, at };
      const pose = seg.kind === 'highlights' && seg.podcast ? null : drawMatch(shown, at);
      // OFF THE BALL's day's goals (Tom, 2026-10-21: in-universe highlights): the scorebug stays on the next live match.
      if (podcastReelNow && seg.kind === 'highlights') scorebug.upcoming(seg.next ?? null, (seg.next?.kickoff ?? t) - t, pos.season, Boolean(seg.repeat));
      else scorebug.match(shown, tl.stateAt(at), seg.kind === 'live' ? 'live' : seg.kind === 'highlights' ? (seg.vault ? 'vault' : 'highlights') : 'replay', momentumAt(tl, at, config.rules.momentum.seconds), pos.season);
      // The caption and the bubbles are HTML over the canvas, so they'd show through a transition drawn on it (Tom,
      // after Task 102: a MISS! over the band into a package): none while one is on screen.
      caption.show(trNow || podcastReelNow ? null : captionAt(tl, at, seg.kind === 'highlights' ? captionCtx : { ...captionCtx, records: recordsOf(shown) }), shown);
      // The callout bubble points at its player (or the ball), edged in that team's shirt for this match.
      const call = pose && !trNow ? calloutAt(tl, at, config.settings.captions) : null;
      // The referee's calls (Task 64) go over the referee, the rest over their player or the ball.
      const ref = refereeOf(shown).at(at);
      const target = call && pose ? (call.referee ? ref : call.playerId ? pose.players.find((p) => p.playerId === call.playerId) : pose.ball) ?? null : null;
      const kits = channel.kitsOf(shown.homeId, shown.awayId);
      const edgeOf = (/** @type {string | null} */ teamId) => (teamId === shown.homeId ? kits.home.primary : kits.away.primary);
      // SUB ON is the referee's too: stacked above any other call of theirs showing at the same time.
      const subs = pose && !trNow ? subCalloutsAt(tl, at, config.settings.captions).map((c) => {
        const s = toStage(ref);
        return { c, at: { x: s.x, y: s.y - (call?.referee ? SUB_STACK_PX : 0) }, edge: edgeOf(c.teamId) };
      }) : [];
      callout.show(call, target ? toStage(target) : null, edgeOf(call?.teamId ?? null), subs);
      // A home golden goal (Task 147, Tom): gold confetti through its celebration.
      const golden = tl.goldenAt >= 0 ? tl.pauses.find((q) => q.at === tl.goldenAt) : null;
      if (golden && at >= golden.at && at < golden.at + golden.ms && tl.events.find((g) => g.at === golden.at && g.event.type === 'goal')?.event.teamId === shown.homeId) {
        confettiNow = { colours: GOLD_CONFETTI, since: at - golden.at };
      }
      cardPanel.show(null, t);
      // An instant replay of a goal, in live matches and re-airs (highlights already show it).
      if (seg.kind !== 'highlights') {
        const r = replayAt(tl, at, config.settings.replays);
        if (r) replayNow = { m: shown, r };
      }
      matchSounds(shown, at, pose, { bigStage: shown.stage !== 'regular' || (seg.kind === 'live' && seg.group.length > 1), reair: seg.kind === 'reair', commentary: seg.kind !== 'highlights' });
    } else if (seg.kind === 'reair') {
      // A re-air's other parts: its intro card, the line-up (from the line to the kick-off spots), the handshakes.
      const m = seg.match;
      const tl = channel.timelineOf(m);
      const kits = channel.kitsOf(m.homeId, m.awayId);
      callout.show(null, null, '');
      if (seg.part === 'intro') {
        // Counting down to its kick-off, after the line-up still to come (Tom).
        scorebug.replayCountdown(m, seg.until + config.settings.reairs.lineUpSeconds * 1000 - t, pos.season);
        caption.show(null);
        cardPanel.show(cardFor(`reair|${m.id}`, () => reairCard(m, channel)), t);
      } else if (seg.part === 'lineup') {
        const w = reairLineFor(m);
        const left = seg.until - t;
        const opts = { ceremonies: config.settings.ceremonies, jogSpeed: config.settings.animation.jogSpeed, matchId: m.id, keeperSlot, trimmed: true };
        drawPlayers(ctx, walkOutPose(w.line, w.spots, t - seg.from, left, opts), kits, keeperSlot, t - seg.from, { people: walkOutPeople(m, t - seg.from, seg.until - seg.from, opts) });
        scorebug.replayCountdown(m, left, pos.season);
        ceremonySounds('walk_out', m.id, t - seg.from, seg.until - seg.from, true, m);
        caption.show(replayCaption(seg, m, teamName, channel.formatTime(m.kickoff), t), m);
        cardPanel.show(null, t);
      } else if (seg.part === 'full_time') {
        // A final's celebration carries on behind the full-time card (Task 278f), its caption left to the card.
        if (seg.celebrate) drawLift(m, config.settings.reairs.finalCelebrateSeconds * 1000 + t - seg.from);
        scorebug.match(m, tl.stateAt(tl.duration), 'replay', null, pos.season);
        caption.show(null);
        cardPanel.show(cardFor(`reair-ft|${m.id}`, () => fullTimeCard(m, channel)), t);
      } else if (seg.part === 'interview') {
        // The recorded interview (Task 100), marked RECORDED with when it was played.
        scorebug.match(m, tl.stateAt(tl.duration), 'replay', null, pos.season);
        caption.show(null);
        cardPanel.show(null, t);
        interviewNow = { m, since: t - seg.from, reair: true };
      } else if (seg.lift || seg.celebrate) {
        // The final re-aired after the off-season show (Task 195): the trophy lift as it aired, in the handshakes' place;
        // in a gap (Task 278f), its start: the champions celebrating.
        drawLift(m, t - seg.from);
        cardPanel.show(null, t);
      } else {
        drawHandshakes(m, t - seg.from, seg.until - seg.from);
        ceremonySounds('handshakes', m.id, t - seg.from, seg.until - seg.from, true, m);
        cardPanel.show(null, t);
      }
    } else if (seg.kind === 'walk_out') {
      // The teams walk on, line up across halfway, then take their kick-off spots (ceremonies.js).
      const f = seg.fixture;
      const from = seg.until - config.settings.segments.walkOutMinutes * 60_000;
      const w = walkOutFor(f);
      const opts = { ceremonies: config.settings.ceremonies, jogSpeed: config.settings.animation.jogSpeed, matchId: f.id, keeperSlot };
      const players = walkOutPose(w.line, w.spots, t - from, f.kickoff - t, opts);
      drawPlayers(ctx, players, channel.kitsOf(f.homeId, f.awayId), keeperSlot, t - from, { people: walkOutPeople(f, t - from, f.kickoff - from, opts) });
      scorebug.upcoming(f, f.kickoff - t, pos.season);
      ceremonySounds('walk_out', f.id, t - from, f.kickoff - from, false, f);
      caption.show(walkOutCaption(t - from, f.kickoff - t, f, teamName, config.settings.ceremonies, { ground: groundName(config, f.homeId), city: league.teams[f.homeId].city }), f);
      callout.show(null, null, '');
      cardPanel.show(null, t);
    } else if (seg.kind === 'handshakes' && seg.lift) {
      // After the final, the trophy lift in the handshakes' place (Task 190; trophyLift.js, liftArt.js).
      const m = seg.match;
      drawLift(m, t - (m.kickoff + channel.timelineOf(m).duration));
      callout.show(null, null, '');
      cardPanel.show(null, t);
    } else if (seg.kind === 'grounds') {
      // AROUND THE GROUNDS (Tom's note 14; groundScenes.js): what's going on at this ground, the plate once it's wiped in.
      const g = tourGround(seg.teamId);
      DRAW_SCENE[/** @type {keyof typeof DRAW_SCENE} */ (seg.scene)](ctx, g, t, { from: seg.from, until: seg.until });
      scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season);
      const shownFrom = seg.from + (seg.visit > 0 ? config.settings.groundsTour.wipeMs : 0);
      const words = tourCaption(g.team);
      caption.show(trNow || t < shownFrom ? null : { key: `grounds|${seg.tourFrom}|${seg.visit}`, kind: 'period', ...words, teamId: seg.teamId, f: (t - shownFrom) / Math.max(1, seg.until - shownFrom) }, { homeId: seg.teamId, awayId: seg.teamId });
      callout.show(null, null, '');
      cardPanel.show(null, t);
      tourSounds(seg, g, t);
    } else if (seg.kind === 'handshakes') {
      // Lines at halfway, handshakes, the home salute after a home win, then off down the tunnel (ceremonies.js).
      const m = seg.match;
      const from = m.kickoff + channel.timelineOf(m).duration;
      const total = handshakeLength(config.settings.segments.handshakeMinutes * 60_000, config.settings.ceremonies, winnerOf(m) === m.homeId);
      drawHandshakes(m, t - from, total);
      ceremonySounds('handshakes', m.id, t - from, total, false, m);
      callout.show(null, null, '');
      cardPanel.show(null, t);
    } else {
      caption.show(null);
      callout.show(null, null, '');
      if (seg.kind === 'full_time') {
        scorebug.result(seg.match);
        cardPanel.show(cardFor(`ft|${seg.match.id}`, () => (seg.group.length > 1
          ? finalDayResultsCard(seg.group, live, t, channel)
          : fullTimeCard(seg.match, channel))), t);
      } else if (seg.kind === 'potm') {
        // The player-of-the-match interview (Task 100).
        scorebug.result(seg.match);
        cardPanel.show(null, t);
        interviewNow = { m: seg.match, since: t - seg.from, reair: false };
      } else if (seg.kind === 'pre_match') {
        scorebug.upcoming(seg.fixture, seg.fixture.kickoff - t, pos.season);
        // The murmur rises from silence as the fans come in (Task 278j, Tom), meeting the walk-out's (as full as the
        // stands) as it begins: its share is how full they are, times how far through the pre-match.
        const into = 1 - (seg.until - t) / (config.settings.segments.preMatchMinutes * 60_000);
        murmur(config.settings.crowd.ceremony, Math.max(0, Math.min(1, into)) * ((fullNow.home + fullNow.away) / 2));
        cardPanel.show(cardFor(`pre|${seg.fixture.kickoff}`, () => (seg.group.length > 1
          ? finalDayCard(seg.group, live, t, channel)
          : preMatchCard(seg.fixture, live, t, channel))), t);
      } else if (seg.kind === 'champion') {
        const c = /** @type {ReturnType<typeof championCard>} */ (cardFor(`champion|${seg.match.id}`, () => championCard(seg.match, live, t, channel)));
        scorebug.result(seg.match);
        confettiNow = { colours: Object.values(league.teams[c.championId].colours), since: t - seg.from };
        cardPanel.show(c, t, GLASS);
      } else if (seg.kind === 'award') {
        // An award on the plinth over the scene (Task 191; awardShow.js, awardArt.js), drawn late, over the scene.
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season, 'repeat' in seg && Boolean(seg.repeat));
        cardPanel.show(null, t);
        const view = awardViewOf(seg.season, seg.award);
        if (view) awardNow = { since: t - seg.from, view };
      } else if (seg.kind === 'farewell' || seg.kind === 'lottery' || seg.kind === 'draft' || seg.kind === 'moves') {
        // The farewells' gallery, the draft lottery's tumbler (Task 192), the draft (Task 193) and the moves board (Task 194; offseasonShow.js), over the scene.
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season, 'repeat' in seg && Boolean(seg.repeat));
        cardPanel.show(null, t);
        offseasonNow = { seg, since: t - seg.from };
        if (seg.kind === 'lottery') lotterySounds(seg, t - seg.from);
      } else if (seg.kind === 'studio') {
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season, 'repeat' in seg && Boolean(seg.repeat));
        cardPanel.show(cardFor(`studio|${seg.card}|${seg.rotation}`, () => studioCard(seg.card, live, t, seg.rotation, channel)), t, GLASS);
      } else if (seg.kind === 'talk') {
        // Talk at the desk (Task 95 placeholder: Task 58's desk and its lines; the real talk comes in Tasks 98–101).
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season, 'repeat' in seg && Boolean(seg.repeat));
        cardPanel.show(null, t);
        studioNow = { seg, since: t - seg.from };
      } else if (seg.kind === 'ads') {
        // An ad break (Task 105): the bumpers and the ads, drawn over the scene's rect after the frame.
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season, 'repeat' in seg && Boolean(seg.repeat));
        cardPanel.show(null, t);
        adNow = { seg, since: t - seg.from };
      } else if (seg.kind === 'ident') {
        // The channel's opening ident (Task 106), drawn over the scene's rect after the frame.
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season, 'repeat' in seg && Boolean(seg.repeat));
        cardPanel.show(null, t);
        identNow = { seg, since: t - seg.from };
      } else if (seg.kind === 'countdown') {
        scorebug.upcoming(seg.next, (seg.next?.kickoff ?? t) - t, pos.season);
        cardPanel.show(null, t);
        countdownNow = { seg, since: t - seg.from, left: seg.until - t };
      }
    }
    mark('match');
    // The side panel likewise stays as it is in the studio through OFF THE BALL's day's goals.
    if (podcastReelNow) side.update(/** @type {any} */ ({ ...seg, kind: 'talk' }), null, pos.season, t);
    else side.update(seg, shown, pos.season, t);
    guide.update(t, performance.now());
    crawl.update(t, seg.kind === 'live' && shown ? shown.id : null, seg.kind === 'reair' ? seg.match.id : null, fanTicker(), watchingItem(watchingNow));
    mark('panels');
    segNow = seg.kind;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The stands, fading in with the slide, round whoever's ground it is.
    const onScreen = shown ?? ('match' in seg ? seg.match : null) ?? ('fixture' in seg ? seg.fixture : null);
    if (onScreen) ground = { homeId: onScreen.homeId, awayId: onScreen.awayId, steps: awayStepsOf(onScreen) };
    else if (seg.kind === 'grounds') ground = { homeId: seg.teamId, awayId: seg.teamId, steps: 0 };
    if (slide > 0 && ground) {
      // The crowd is laid out once for the finished bowl; mid-slide it's clipped away from wherever the ground is.
      const key = `${ground.homeId}|${ground.awayId}|${ground.steps}`;
      if (crowdDrawn?.key !== key) {
        const full = config.settings.broadcast.shiftPx;
        const areas = bowlAreas(full);
        const colours = { home: league.teams[ground.homeId].colours, away: league.teams[ground.awayId].colours };
        crowdDrawn = { key, areas, fans: crowdLayout(areas, colours, ground.homeId, { away: awayCorner(full, awayDugoutX, ground.steps, config.settings.broadcast.awayEnd) }) };
      }
    }
    // Full mode's empty areas (Task 113, strips.js): an ad still and the turf with the home name in match pictures,
    // a quiet band otherwise; fading out as Broadcast's stands come in.
    if (slide < 1) {
      ctx.globalAlpha = 1 - slide;
      drawStrips(ctx, {
        // The lift's close-up (Task 197) has the quiet band under it, as the studio does, not the turf.
        picture: pictureOf(seg) === 'stadium' && !liftNow ? 'stadium' : 'other',
        topFree: !liveGroup,
        home: ground ? league.teams[ground.homeId] : null,
        bugEnd: bugEnd(),
        still: (c, R) => drawStillNow(c, R, t, ground ? ground.homeId : null),
        // FAN BOARD (Fan Coins; Tom, 2026-10-21) in the still's place while one's up.
        board: (c, R) => {
          const pic = fanNow?.screen ? fanPictures.find((x) => x.id === fanNow?.screen) : null;
          if (!pic) return false;
          drawFanBoard(c, R, pic, pic.teamId ? league.teams[pic.teamId] : null);
          return true;
        },
        clashDistance: config.settings.kits.clashDistance,
      });
      ctx.globalAlpha = 1;
    }
    if (slide > 0 && ground && crowdDrawn) {
      // The turf under the bottom boards (Task 72) reaches up into the ground's rectangle, so it's drawn outside the
      // stands' clip, fading in with them; before the stands (Task 199, Tom), so the front row's raised arms and hands
      // show over its edge rather than under it.
      ctx.globalAlpha = slide;
      drawGroundTurf(ctx, config.settings.broadcast.shiftPx, league.teams[ground.homeId], config.settings.kits.clashDistance);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.rect(shift, GROUND.top, GROUND.w, GROUND.bottom - GROUND.top);
      ctx.clip('evenodd');
      ctx.globalAlpha = slide;
      // Fans arriving or leaving fade in and out (Task 89): each change of crowd dissolves from the one before.
      const present = presentFans(crowdDrawn.fans, fullNow);
      const real = performance.now();
      if (present !== crowdFade.fans) {
        // Only within one ground: a new ground's crowd just appears.
        Object.assign(crowdFade, { from: crowdFade.key === crowdDrawn.key ? crowdFade.fans : null, key: crowdDrawn.key, fans: present, since: real });
      }
      const fadeMs = config.settings.crowd.fill.fadeMs;
      const fade = crowdFade.from && fadeMs > 0 ? { from: crowdFade.from, f: Math.min(1, (real - crowdFade.since) / fadeMs) } : null;
      // A Fan Coins chant (§29): its end waves its arms while it's sung, unless the crowd has something of its own on.
      const chanting = fanNow?.chant?.sung && slide >= 1 && !standsNow.jump && !standsNow.gasp && !standsNow.wave ? fanNow.chant.side : null;
      drawStands(ctx, crowdDrawn.areas, present, { elapsed: real, ...standsNow, ...(chanting ? { wave: chanting } : {}), fade });
      // The floodlights' mounts in the corners (Tom's note 14), over the seats they stand on; their lamps come with the light.
      if (lightNow) drawFloodlightMounts(ctx, config.settings.broadcast.shiftPx);
      // AROUND THE GROUNDS' crew in the stands (litter), once the crowd's drawn.
      if (seg.kind === 'grounds') /** @type {Record<string, Function>} */ (IN_STANDS)[seg.scene]?.(ctx, tourGround(seg.teamId), t, config.settings.broadcast.shiftPx);
      // A Fan Coins flag (§29), held up in its end.
      // Once Broadcast's slide is complete (Tom: not mid-switch).
      if (fanNow?.flag && slide >= 1) drawHeldFlag(ctx, league.teams[fanNow.flag.side === 'home' ? ground.homeId : ground.awayId], fanNow.flag.side, config.settings.broadcast.shiftPx, real);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
    // The light by the time of day (Tom's note 14): over the ground, the stands as they fade in, the lamps lit from dusk.
    // AROUND THE GROUNDS' work on the turf's lettering (the name repainted), over whichever turf is showing.
    if (seg.kind === 'grounds') /** @type {any} */ (AFTER_TURF)[seg.scene]?.(ctx, tourGround(seg.teamId), t, { from: seg.from, until: seg.until }, { shift, rows: slide >= 0.5 ? { y: GROUND_TURF.y, h: GROUND_TURF.h } : { y: FULL_TURF.y, h: FULL_TURF.h } });
    if (lightNow) drawLight(ctx, lightNow, { shift, standsShift: config.settings.broadcast.shiftPx, stands: slide > 0 && ground && crowdDrawn ? slide : 0 });
    if (seg.kind === 'grounds') tourWipe(seg, t);
    mark('stands');
    // The scene between matches (Task 96): over the ground in Full, the whole screen in Broadcast, sliding between
    // them with the layout; then what sits on it (the desk standing in for talk, the champions' confetti).
    if (showsScene(seg)) {
      drawScene(ctx, sceneRect(slide), t, config.settings.scene);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // A card (the pre-match's UP NEXT, the full-time card) is HTML over the canvas, so it hides while the glass sweeps.
    cardPanel.cover(trNow?.kind === 'into_scene' || trNow?.kind === 'out_of_scene');
    // The lift's close-up (Task 190): over the ground in Full, the whole screen in Broadcast, like the interview.
    if (liftNow) drawLiftCloseUp(ctx, sceneRect(slide), liftNow.since, liftNow.o);
    // An award on its plinth (Task 191), over the scene; hidden while a sweep covers the scene, like the desk.
    if (awardNow && !trNow) drawAwardPlinth(ctx, sceneRect(slide), awardNow.since, t, awardNow.view, awardBeats(awardNow.since, config.settings.awards), awardArtOpts);
    if (offseasonNow && !trNow) drawOffseasonNow(sceneRect(slide), t, offseasonNow.seg, offseasonNow.since);
    drawStudioNow(slide, t, Boolean(trNow));
    drawPodcastReelNow(slide, t, Boolean(trNow));
    drawInterviewNow(slide, Boolean(trNow));
    drawAdNow(slide, t);
    drawIdentNow(slide, t);
    drawCountdownNow(slide, t);
    ctx.setTransform(1, 0, 0, 1, shift, 0);
    if (liftStageNow) drawFireworks(ctx, liftStageNow.since, liftStageNow.colours);
    if (confettiNow) drawConfetti(ctx, confettiNow.colours, confettiNow.since);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // The flash as the lift cuts to the stage, as at the cut to the close-up.
    if (liftStageNow && liftStageNow.since < 300) {
      const R = sceneRect(slide);
      ctx.fillStyle = `rgba(255,255,255,${1 - liftStageNow.since / 300})`;
      ctx.fillRect(R.x, R.y, R.w, R.h);
    }
    drawReplay(slide);
    mark('scene');
    // Under a transition the text is baked into the picture first, so the sweep or band covers it too (Task 200).
    if (trNow) sharpBake(ctx);
    drawTransition(trNow, t, slide);
    scorebugAside(seg, Boolean(trNow));
    // MOMENTS: what was seen this frame; a notice for a step reached or a secret found, never over the ads, the
    // opening or a transition (nor while Broadcast's scorebug is aside).
    const found = momentTracker.frame({ t, wall: performance.now(), visible: document.visibilityState === 'visible', seg, shown: seg.kind === 'live' ? shown : null, layout: layout.mode });
    if (found.length) {
      momentNotice.add(found);
      audiencePane.refresh();
    }
    momentNotice.frame(performance.now(), ASIDE.has(seg.kind) || aside || Boolean(trNow));
    // Fan Coins (§29): what was earned this frame, a +1 rising from the Audience button; the chant's bubble.
    // One's own spend starting (version 2): the bar under the scorebug for a few seconds, in Full, with COINS closed.
    if (coinBank && fanOverlays) {
      const real = performance.now();
      for (const r of coinBank.spends()) {
        if (!coinBank.state.mine.has(r.id) || t < r.starts || t >= r.until || barTold.has(r.id)) continue;
        barTold.add(r.id);
        barNow = { kind: r.kind, until: real + fc.shared.noticeSeconds * 1000 };
      }
      const show = barNow && real < barNow.until && layout.mode === 'full' && pane.openId !== 'audience';
      fanOverlays.onBar(show && barNow ? { kind: barNow.kind, title: ON_TITLES[barNow.kind], broadcast: SPENDS_IN_STANDS.has(barNow.kind) } : null);
    }
    if (earner) {
      const got = earner.frame({ t, wall: performance.now(), now: Date.now(), visible: document.visibilityState === 'visible', seg });
      if (got) {
        // No +1 in Broadcast (Tom).
        if (layout.mode === 'full') fanOverlays?.plus(got, audienceButton());
        audiencePane.refreshCoins();
      }
      const c = fanNow?.chant;
      const inStands = layout.mode === 'broadcast' && layout.progress(performance.now()) >= 1 && !ASIDE.has(seg.kind);
      fanOverlays?.chant(c ? { lines: c.chant.lines.map((l) => l.words), line: c.line, side: c.side } : null, inStands);
      const sh = fanNow?.shout;
      fanOverlays?.shout(sh && ground ? { ...sh, colour: league.teams[sh.side === 'home' ? ground.homeId : ground.awayId].colours.primary } : null, inStands);
    }
    if (!soundPrompt.hidden) placeSoundPrompt();
    stings(seg);
    studioJingle(seg, t);
    dev.update(t, { pos, seg, shown, viewerPick, speed: clock.speed, buildMs, sound: { on: audio.on, played: audio.played, offered: !soundPrompt.hidden }, layout: layout.mode });
    mark('rest');
  };
  // Broadcast's scorebug steps aside (Task 278d, Tom: for immersion, and against burn-in): gone for each ad break and the
  // opening (the new season's countdown and the ident), back after; held off through a transition that follows, so it
  // never comes back over a sweep. A mouse moving over the picture brings it back a moment (its layout and sound
  // controls), and it stays while the levels pane is open.
  const topbar = $('topbar');
  const ASIDE = new Set(['ads', 'ident', 'countdown']);
  // CLICK FOR SOUND under the speaker, its point at it (MOMENTS took its place at the left edge): the scorebug is wider
  // for a re-air ("S1 REPLAY"), so it follows the speaker.
  const speaker = $('bug-sound');
  const placeSoundPrompt = () => {
    const st = stage.getBoundingClientRect();
    const sp = speaker.getBoundingClientRect();
    if (!st.width || !sp.width) return;
    const x = ((sp.left + sp.right) / 2 - st.left) / (st.width / STAGE_WIDTH) - 10;
    soundPrompt.style.left = `calc(var(--px) * ${x.toFixed(1)})`;
  };
  let aside = false;
  let peekUntil = 0;
  stage.addEventListener('pointermove', () => { peekUntil = performance.now() + config.settings.broadcast.peekMs; });
  /** @param {{ kind: string }} seg @param {boolean} transition */
  const scorebugAside = (seg, transition) => {
    aside = layout.mode === 'broadcast' && (ASIDE.has(seg.kind) || (aside && transition));
    const hide = aside && performance.now() > peekUntil && $('levels').hidden;
    if (topbar.classList.contains('aside') !== hide) topbar.classList.toggle('aside', hide);
  };
  // An error in one frame must never stop the channel: report it (console and dev panel, with the moment) and carry
  // on with the next frame. Before, a single error froze the picture for good while the ticker kept scrolling.
  if (phone) createPhoneControls({ layout: () => layout.mode, toggleLayout, soundOn: () => audio.on, toggleSound: () => buttons.toggleSound(), nudging });
  startUpdateChecks();
  if (perf) createPerfView(perf, () => perfInfo(audio.context, { layout: layout.mode, on: segNow, sound: audio.on, rendering: audio.rendering, crowdReadyMs: audio.crowdReadyMs, recorded: audio.recorded, lead: audio.lead, built: audio.built, trimmed: audio.trimmed, buildMs, sharp: /** @type {HTMLCanvasElement} */ ($('sharp')),
    switches: [params.latency !== null ? `latency=${params.latency}` : '', params.crowdRate !== null ? `crowdrate=${params.crowdRate}` : '', params.murmurBed ? 'murmur=bed' : '', params.ahead !== null ? `ahead=${params.ahead}` : '', params.recordingsOff ? 'recordings=off' : ''].filter(Boolean).join(' ') || 'none' }));
  const frame = () => {
    const t = clock.now();
    perf?.frameStart(performance.now(), { busy: audio.rendering > 0 });
    try {
      draw(t);
    } catch (err) {
      dev.problem(err, t);
    }
    // The side bars' night blue from the first picture on (index.html), so they never frame an empty stage.
    if (!document.body.classList.contains('on-air')) document.body.classList.add('on-air');
    if (params.murmurBed && audio.on) audio.murmurBed(clock.speed > 2 ? 0 : murmurWanted);
    murmurWanted = 0;
    perf?.frameEnd(performance.now());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/**
 * The recordings' index (phones; assets/sounds/index.json, written by the dev server from recordings.html), or null if
 * it can't be had: every sound is then built in the browser, as before.
 * @param {import('./recordings.js').RecordingSettings} settings
 * @returns {Promise<import('./audio.js').Recordings | null>}
 */
async function loadRecordings(settings) {
  try {
    const res = await fetch('assets/sounds/index.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const index = (await res.json()).recordings;
    return index && Object.keys(index).length ? { index, settings, base: 'assets/sounds/' } : null;
  } catch {
    return null;
  }
}

/** Set once the channel has fetched its files afresh after failing to start (this tab only). */
const HEALED_KEY = 'scorchball.healed';

/**
 * Failing to start may be old files beside new ones (a browser that kept code from before a deploy, or a deploy landing
 * mid-load): fetch every file the page used afresh and reload, once a tab (Task 275, after Tom's Firefox kept the old
 * config check against new settings). True if it's reloading.
 */
async function healOnce() {
  try {
    if (sessionStorage.getItem(HEALED_KEY)) return false;
    sessionStorage.setItem(HEALED_KEY, '1');
  } catch {
    return false;
  }
  const mine = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.startsWith(location.origin));
  await Promise.all([location.href, ...mine].map((u) => fetch(u, { cache: 'reload' }).catch(() => null)));
  location.reload();
  return true;
}

boot().catch(async (err) => {
  console.error(err);
  if (await healOnce()) return;
  $('loading').hidden = true;
  const box = $('error');
  box.hidden = false;
  box.textContent = `The channel could not start.\n\n${(err instanceof ConfigError ? err.errors : [err instanceof Error ? err.message : String(err)]).join('\n')}`;
});
