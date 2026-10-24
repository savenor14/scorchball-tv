// The ident and ad mock-ups (ads.html, a dev page for Task 94; channel.md §16.5a, §16.11): the channel's opening
// ident in three versions (a ball wrapped in fire, like a comet, and SCORCHBALL), the in-universe ads (18 since Ad break) and a channel
// promo, the bumpers either side of a break, a whole 30-second break, and the invented brands. Drawn on the canvas
// over the ground. Tom picked ident C and all the ads; the ads and bumpers are now drawn by spotArt.js from data/spots.json
// (Task 105), shared with the channel, and the fire too; the idents stay here until Task 106.
import { loadConfig } from '../config.js';
import { addMatchStats } from '../sim/standings.js';
import { createCalendar } from './calendar.js';
import { matchKits } from './kits.js';
import { LiveLeague } from './liveLeague.js';
import { isFinished } from './onScreen.js';
import { PALETTE } from './palette.js';
import { drawBenches, drawEndBoards, drawGate, drawHomeMark, drawPitch } from './pitch.js';
import { centreIcon } from './crests.js';
import { blockText, blockWidth, canvasOf, clamp01, ease, fillPoly, H, lightBars, mix, mod, rgba, shade, W } from './sceneArt.js';
import { bowlAreas, drawGroundTurf, drawStands, GLYPHS, GROUND, GROUND_TURF } from './stands.js';
import { createTimeline } from './timeline.js';
import { drawAd, drawAdStill, drawBumper, drawIdent, STILL } from './spotArt.js';
import { fireball, FIRE, hash, identBack, wordmark } from './spotKit.js';
import { adFacts, adIndex, adOrder, playoffTimes } from './spots.js';
import { createAudio } from './audio.js';

const SHIFT = 43;
const R_FULL = Object.freeze({ x: 0, y: GROUND.top, w: GROUND.w, h: GROUND.bottom - GROUND.top });
/** In Broadcast everything between matches fills the whole screen (Tom, 2026-10-05: the empty stands as a border looked off); the scorebug floats over it. */
const R_BROADCAST = Object.freeze({ x: 0, y: 0, w: W, h: H });
/** Ad break, batch 1 (Task 159): the four new ads (from data/spots.json), each with its style and a note for the page. @type {Record<string, [string, string]>} */
const BATCH_1 = {
  "red_dune_sun_cream": [
    "a mascot",
    "A lizard on a red dune does the hot-sand dance under a swelling, pulsing sun; a tube flies in and squeezes a blob of cream onto its back; it cools from red to green, a striped parasol opens and it lounges in sunglasses."
  ],
  "gullwing_ferries": [
    "a journey",
    "The ferry chugs from the lighthouse quay to the harbour houses along a dotted route (bright behind it), smoke puffing, gulls trailing; as it docks the tide rushes in over the flats behind it."
  ],
  "maison_dore": [
    "a product shot",
    "A croissant on a silver plate under a spotlight; a gloved hand comes down, lifts it, and it shatters into a slow-motion shower of golden flakes that drift down onto the plate and the velvet."
  ],
  "steamvale_crisps": [
    "the crowd",
    "A fan in the stand lifts a packet, it puffs and pops, CRUNCH! shakes the steaming valley walls and echoes off them, and the whole row in front turns round to look."
  ]
};
/** Ad break, batch 2 (Task 160): the three new ads (from data/spots.json), each with its style and a note for the page. @type {Record<string, [string, string]>} */
const BATCH_2 = {
  "sandglass_watches": [
    "a product shot",
    "In a desert market, awnings fluttering behind, sand pours through an hourglass on a rug-covered table; in a swirl of sand it turns into a gold watch on a leather strap, its second hand ticking. Jingle: tick-tock, then a low chord."
  ],
  "brinestone_oilskins": [
    "a little story",
    "A fisher in yellow oilskins on a pitching boat in a storm: rain, lightning, two waves crash over them; the spray clears, the storm breaks, and they are bone dry, grinning, a thumb up. Jingle: a low sea shanty."
  ],
  "orrery_bank": [
    "a billboard",
    "A marble hall: a gold coin rolls along a ledge past the columns and drops into an open vault, whose round door (an orrery on it, its planets going round) swings shut with a clunk that shakes dust off the ledge; the name is cut into the frieze. Jingle: slow low organ chords."
  ]
};
/** Ad break, batch 3 (Task 161): the league's own three (from data/spots.json), each with its style and a note for the page. @type {Record<string, [string, string]>} */
const BATCH_3 = {
  "ember_and_co": [
    "a sponsored stat",
    "The official match ball on a pedestal heats from Cool to Warm to Hot over the light bars, the fire from the ident licking round it, while COOL, WARM, HOT light in turn and this season's burns count up. Jingle: a low, quick run flickering up and down like flames."
  ],
  "scorchball_almanac": [
    "the channel's own promo",
    "A thick red book (ALMANAC, SEASON N) thumps onto a desk in a dark study, dust puffing; it opens and its pages riffle past, each a blur of tiny results, and settles on this season's goals so far. Jingle: a low, quick run flickering down."
  ],
  "league_shop": [
    "a showcase",
    "A carousel rack spins through all eight teams' shirts and slows to a stop on one (seeded per break), which is lifted off and held up to the camera, its team's name under it. Jingle: low bells, quick, flickering upward."
  ]
};
const IDENT_MS = 10_000;
const AD_MS = 9000;
const BUMPER_MS = 1500;

/** @typedef {import('./sceneArt.js').Rect} Rect */
/** @typedef {(ctx: CanvasRenderingContext2D, R: Rect, ms: number) => void} Draw */

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}


// ---------------------------------------------------------------- the idents

/** A quick fade to black at the loop's end. @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} ms @param {number} total */
const fadeOut = (ctx, R, ms, total) => {
  const f = clamp01((ms - (total - 500)) / 500);
  if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(R.x, R.y, R.w, R.h); }
};

/** A: the comet streaks in on the bars' diagonal, settles, and SCORCHBALL burns in letter by letter. @type {Draw} */
function identComet(ctx, R, ms) {
  identBack(ctx, R, ms);
  const cx = R.x + R.w / 2;
  const cy = R.y + R.h * 0.36;
  const ARRIVE = 2000;
  /** @type {Path} */
  const path = (t) => {
    const f = ease(clamp01(t / ARRIVE));
    const g = 1 - (1 - clamp01(t / ARRIVE)) ** 3;
    return { x: R.x - 40 + (cx - R.x + 40) * g, y: R.y + R.h + 30 - (R.y + R.h + 30 - cy) * g - 40 * Math.sin(f * Math.PI) };
  };
  fireball(ctx, ms, path, { r: 15, life: 700, rate: 6, speed: 50 });
  const s = 5;
  const text = 'SCORCHBALL';
  const x0 = Math.round(cx - blockWidth(text, s) / 2);
  wordmark(ctx, text, x0, Math.round(cy + 34), s, (i) => clamp01((ms - 2500 - i * 110) / 220));
  fadeOut(ctx, R, ms, IDENT_MS);
}

/** B: a plain ball heats up like the match ball (white, yellow, orange, red), bursts into flame, and the name slams in. @type {Draw} */
function identIgnite(ctx, R, ms) {
  identBack(ctx, R, ms);
  const cx = R.x + R.w / 2;
  const cy = R.y + R.h * 0.36;
  const IGNITE = 3000;
  const heat = clamp01(ms / IGNITE);
  const core = (/** @type {number} */ t) => {
    const h = clamp01(t / IGNITE);
    return h < 0.33 ? mix('#ffffff', PALETTE.heatWarm, h / 0.33) : h < 0.66 ? mix(PALETTE.heatWarm, PALETTE.heatOrange, (h - 0.33) / 0.33) : mix(PALETTE.heatOrange, PALETTE.heatHot, (h - 0.66) / 0.34);
  };
  const shake = ms < IGNITE ? Math.round((hash(Math.floor(ms / 50)) - 0.5) * 3 * heat) : 0;
  /** @type {Path} */
  const path = () => ({ x: cx + shake, y: cy });
  if (ms < IGNITE) {
    // Building heat: a few sparks, more as it nears ignition.
    fireball(ctx, ms, path, { r: 15, life: 400, rate: Math.max(0, Math.round(heat * 3)), speed: 30, spread: 2, core });
  } else {
    fireball(ctx, ms, path, { r: 15, life: 700, rate: 7, speed: 40, spread: 1.4, from: IGNITE, core: () => '#fff6c8' });
    // The shockwave.
    const w = (ms - IGNITE) / 600;
    if (w < 1) {
      ctx.fillStyle = rgba('#ffd23f', 1 - w);
      const rr = 18 + w * 120;
      for (let k = 0; k < 200; k++) { const a = (k / 200) * 2 * Math.PI; ctx.fillRect(Math.round(cx + rr * Math.cos(a)), Math.round(cy + rr * 0.6 * Math.sin(a)), 2, 1); }
      ctx.fillStyle = `rgba(255,246,200,${0.5 * (1 - w)})`;
      ctx.fillRect(R.x, R.y, R.w, R.h);
    }
  }
  const s = 5;
  const text = 'SCORCHBALL';
  const x0 = Math.round(cx - blockWidth(text, s) / 2);
  const slam = ease(clamp01((ms - IGNITE - 250) / 300));
  if (slam > 0) wordmark(ctx, text, x0, Math.round(cy + 34 + (1 - slam) * 90), s, () => (slam < 1 ? slam : 1));
  fadeOut(ctx, R, ms, IDENT_MS);
}

/** C: Tom's pick, now drawn by spotArt.js (Task 106). @type {Draw} */
const identOrbit = (ctx, R, ms) => drawIdent(ctx, R, ms, IDENT_MS);

async function boot() {
  const config = await loadConfig(fetchText);
  await document.fonts.load('20px VT323');
  const params = new URLSearchParams(location.search);
  const zoom = Number(params.get('zoom') ?? 1.5);
  const freeze = params.has('freeze') ? Number(params.get('freeze')) : null;
  const clash = config.settings.kits.clashDistance;
  const seed = config.settings.live.seed;
  const slots = createCalendar(config).slots(1);
  const teams = Object.fromEntries(config.teams.teams.map((/** @type {any} */ t) => [t.id, t]));

  // The season's scorchers so far (season 1, before match 41), for the sponsored stat.
  const now = slots[40].kickoff - 60_000;
  const live = new LiveLeague(config, { now, seed });
  const durationOf = (/** @type {any} */ m) => createTimeline(m, config).duration;
  /** @type {Record<string, any>} */
  const totals = {};
  const done = live.matchesIn(1).filter((m) => isFinished(m, now, durationOf));
  for (const m of done) addMatchStats(totals, m.summary);
  const scorchers = Object.values(totals).reduce((n, s) => n + s.scorchers, 0);
  // The ads (Task 105: data/spots.json, drawn by spotArt.js, shared with the channel), with the facts they show.
  const when = new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const times = playoffTimes(slots, createCalendar(config).regularCount, (ms) => when.format(ms).toUpperCase().replace(',', ''));
  /** @type {import('./spots.js').PlayoffFacts} The promo's playoffs version (Task 111: from midway through the season). */
  const playoffs = { stage: 'playoffs', ...times, finalAt: times.final.replace(/^Finals /, ''), finalists: null };
  // The final's version (from the first semifinal's kick-off), with two of the league's teams as the finalists.
  const [fa, fb] = Object.values(live.league.teams).slice(0, 2).map((tm) => ({ name: tm.shortName, abbr: tm.abbr, colour: tm.colours.primary }));
  // Tickets and Season tickets (Task 146): the next live match and a seeded team, as the channel works them out; and
  // the season tickets' playoffs version, the next season on sale.
  const league = adFacts(live, now, { timelineOf: (m) => createTimeline(m, config), formatTime: (ms) => when.format(ms).toUpperCase().replace(',', '') });
  const facts = { scorchers, playoffs, tickets: league.tickets, seasonTickets: league.seasonTickets, season: league.season, burns: league.burns, goals: league.goals, shop: league.shop };
  const nextSeason = { ...facts, seasonTickets: { ...league.seasonTickets, season: league.seasonTickets.season + 1 } };
  const adDraw = (/** @type {string} */ id, f = facts) => /** @type {Draw} */ ((ctx, R, ms) => drawAd(ctx, R, ms, config.ads.ads.find((/** @type {any} */ a) => a.id === id), f));
  const caravanCola = adDraw('caravan_cola');
  const tideline = adDraw('tideline_sardines');
  const foundryFuel = () => adDraw('foundry_fuel');
  const ironvale = adDraw('ironvale_boots');
  const velours = adDraw('velours');
  const ticketsAd = adDraw('tickets');
  const seasonTicketsAd = adDraw('season_tickets');
  const seasonTicketsNext = adDraw('season_tickets', nextSeason);
  const promo = adDraw('playoffs_promo');
  const promoFinal = adDraw('playoffs_promo', { scorchers, playoffs: { ...playoffs, stage: 'final', finalists: [fa, fb] } });
  const promoFinalOpen = adDraw('playoffs_promo', { scorchers, playoffs: { ...playoffs, stage: 'final' } });
  const bumper = (/** @type {string} */ text) => /** @type {Draw} */ ((ctx, R, ms) => drawBumper(ctx, R, ms, text, BUMPER_MS));
  const home = done[done.length - 1];

  /** @param {'full' | 'broadcast'} layout */
  const emptyGround = (layout) => {
    const { c, ctx } = canvasOf();
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, W, H);
    const k = matchKits(teams[home.homeId].colours, teams[home.awayId].colours, clash);
    ctx.save();
    ctx.translate(layout === 'broadcast' ? SHIFT : 0, 0);
    drawPitch(ctx);
    drawEndBoards(ctx, k, true);
    drawHomeMark(ctx, teams[home.homeId].colours, centreIcon(teams[home.homeId]));
    drawGate(ctx, 0);
    drawBenches(ctx, k, { home: 4, away: 4 }, null);
    ctx.restore();
    if (layout === 'broadcast') {
      drawStands(ctx, bowlAreas(SHIFT), [], { elapsed: 0, level: 0 });
      drawGroundTurf(ctx, SHIFT, teams[home.homeId], clash);
    }
    return c;
  };
  const grounds = { full: emptyGround('full'), broadcast: emptyGround('broadcast') };
  const fullBox = /** @type {HTMLInputElement} */ (document.getElementById('full'));
  const slow = /** @type {HTMLInputElement} */ (document.getElementById('slow'));

  /** @typedef {{ root: HTMLElement, ctx: CanvasRenderingContext2D, draw: (ctx: CanvasRenderingContext2D, t: number) => void, visible: boolean, offset: number, last: number }} Stage */
  /** @type {Stage[]} */
  const stages = [];
  const seen = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const s = stages.find((x) => x.root === en.target);
      if (s) s.visible = en.isIntersecting;
    }
  });
  /**
   * A looping stage over the ground: `parts` play in turn, each for its length.
   * @param {[number, Draw][]} parts @param {HTMLElement} [clock] Where to show the time through the loop.
   */
  function stage(parts, clock) {
    const root = el('div', 'stage');
    root.style.width = `${W * zoom}px`;
    root.style.height = `${H * zoom}px`;
    const { c, ctx } = canvasOf();
    root.append(c);
    const total = parts.reduce((n, [ms]) => n + ms, 0) + 600;
    /** @type {Stage} */
    const me = {
      root, ctx, visible: false, offset: 0, last: 0,
      draw: (g, t) => {
        me.last = t;
        t -= me.offset;
        const layout = fullBox.checked ? 'full' : 'broadcast';
        const R = layout === 'full' ? R_FULL : R_BROADCAST;
        g.drawImage(grounds[layout], 0, 0);
        g.save();
        g.beginPath();
        g.rect(R.x, R.y, R.w, R.h);
        g.clip();
        let ms = mod(t, total);
        if (clock) clock.textContent = `${(ms / 1000).toFixed(1)} s of ${(total / 1000).toFixed(1)}`;
        let drawn = false;
        for (const [len, draw] of parts) {
          if (ms < len) { draw(g, R, ms); drawn = true; break; }
          ms -= len;
        }
        if (!drawn) { g.fillStyle = '#000'; g.fillRect(R.x, R.y, R.w, R.h); }
        g.restore();
      },
    };
    stages.push(me);
    stageOf.set(root, me);
    seen.observe(root);
    return root;
  }
  /** Each stage by its element, to restart one from 0 (the review's "from the start, with its jingle"). @type {WeakMap<HTMLElement, Stage>} */
  const stageOf = new WeakMap();
  /** A titled stage with its running time under it. @param {string} title @param {[number, Draw][]} parts */
  const titled = (title, parts) => {
    const clock = el('div', 'time');
    return el('div', '', [el('h3', '', [title]), stage(parts, clock), clock]);
  };

  const box = /** @type {HTMLElement} */ (document.getElementById('options'));

  const audio = createAudio(config.settings.sound, config.settings.commentary);
  /**
   * An ad of Ad break: its scene (Broadcast, or Full with the box ticked), a button to play it from the start with its
   * jingle, and its still on its own and in place.
   * @param {any} ad @param {string} style @param {string} note
   */
  const showAd = (ad, style, note) => {
    const clock = el('div', 'time');
    const st = stage([[AD_MS, (ctx, R, ms) => drawAd(ctx, R, ms, ad, facts)]], clock);
    const play = el('button', '', ['From the start, with its jingle and sounds']);
    play.addEventListener('click', () => {
      audio.start();
      audio.setOn(true);
      const s = stageOf.get(st);
      if (s) s.offset = s.last;
      audio.play('jingle', { seed: ad.id, jingle: ad.jingle, delay: ad.jingle.at });
      // Its sound effects (Task 205), each at its moment.
      for (const e of ad.effects ?? []) audio.play('effect', { seed: `${ad.id}|${e.at}`, effect: e.effect, gain: e.gain ?? 1, delay: e.at });
    });
    box.append(el('h2', '', [`${ad.brand} (${ad.region}): ${style}`]), el('p', 'muted', [`${note} "${ad.tagline}" Jingle: ${ad.jingle.instrument}.`]), st, clock, play, stillBlock(`${ad.brand}: the still`, ad, facts));
  };

  // ---- Task 205: every ad with its sounds (the effects in data/spots.json, under the jingle), at the top for Tom's ear.
  box.append(el('div', 'part', ['Ad sounds (Task 205)']), el('p', 'muted', ['Every ad with its sound effects (Tom: the style on the sound board is right; make the rest the same way), each at its moment in the ad, under its jingle. Play one from the start to hear it; the effects are listed under each, with when they come (seconds in).']));
  for (const ad of config.ads.ads) {
    const list = (ad.effects ?? []).map((/** @type {any} */ e) => `${e.effect} ${e.at} s`).join(' · ') || 'none yet';
    showAd(ad, 'with its sounds', `Effects: ${list}.`);
  }

  // ---- Ad break, batch 3 (Task 161): the league's own three, at the top while Ad break goes on.
  box.append(el('div', 'part', ['Ad break, batch 3 (Task 161)']), el('p', 'muted', [`The league's own (Tom's picks), with the league's numbers at the sample's moment (the channel works them out at each break; the shop's rack stops on the next live match's home team, and its still shows the home team of the match on screen, Tom): ${league.burns} burns and ${league.goals} goals so far this season; the shop stops on the ${league.shop.name}. Their jingles: low and quick, flickering up and down like fire (Tom).`]));
  for (const ad of config.ads.ads.filter((/** @type {any} */ a) => a.id in BATCH_3)) showAd(ad, ...BATCH_3[ad.id]);

  // ---- Ad break, batch 2 (Task 160): the three new ads, at the top while Ad break goes on.
  box.append(el('div', 'part', ['Ad break, batch 2 (Task 160)']), el('p', 'muted', ['Tom\'s picks, with his tweak: the Orrery Bank still\'s name at twice the size, like the frieze. Their jingles are slower and lower than the others (Tom), a set of their own.']));
  for (const ad of config.ads.ads.filter((/** @type {any} */ a) => a.id in BATCH_2)) showAd(ad, ...BATCH_2[ad.id]);

  // ---- Ad break, batch 1 (Task 159): the four new ads, one from each region, at the top while Ad break goes on.
  box.append(el('div', 'part', ['Ad break, batch 1 (Task 159)']), el('p', 'muted', ['One new ad from each region (Tom\'s picks, with his tweaks: the wake off the quay, a new Steamvale jingle). Each: the 9 s scene (the whole screen as in Broadcast, or tick "Show in Full" for the ground), a button to play it from the start with its jingle as the brand comes up, and its still, on its own and in place beside the scorebug.']));
  for (const ad of config.ads.ads.filter((/** @type {any} */ a) => a.id in BATCH_1)) showAd(ad, ...BATCH_1[ad.id]);

  // ---- 1. the ident
  box.append(el('div', 'part', ['1. The opening ident']), el('p', 'muted', ['Once a day, before the presenters welcome viewers in (§16.5a): about 10 s, over the light bars (dimmed so the fire stands out). Three takes on Tom\'s direction, a ball covered in a bit of fire, almost like a comet. The fire is made of little flames that stream off the ball\'s back while it moves and lick upward round it when it\'s still, white-hot to red.']));
  const idents = /** @type {[string, string, Draw][]} */ ([
    ['A · the comet', 'The fireball streaks in from the bottom left on a curve, trailing fire, slows to a stop above the middle and keeps burning; SCORCHBALL burns in under it letter by letter, each flashing white first.', identComet],
    ['B · ignition', 'A plain white ball heats up through the match ball\'s own colours (white, yellow, orange, red), shaking and throwing sparks, then bursts into flame with a flash and a shockwave; SCORCHBALL slams up into place under it.', identIgnite],
    ['C · the O (Tom\'s pick)', 'The name sits dim with its O missing; the comet comes in from the left, makes one full turn of the oval round it trailing fire, carries on over the top to just above the gap, then drops straight down into it as the O (Tom: so it never slides across the S and C), and the letters light up outward from it.', identOrbit],
  ]);
  for (const [label, note, draw] of idents) {
    box.append(el('h2', '', [label]), el('p', 'muted', [note]), titled(label, [[IDENT_MS, draw]]));
  }

  // ---- 2. the ads
  box.append(el('div', 'part', ['2. The first ads']), el('p', 'muted', [`The first ads (Ad break's eleven are at the top), in different styles, 9 s each (§16.11), for invented products from the league's regions, and a channel promo in its two versions. Each ends on its brand and a tagline. The sponsored stat uses the real count of scorchers this season so far (${scorchers}).`]));
  const ads = /** @type {[string, string, Draw][]} */ ([
    ['Caravan Cola (Sunreach): a little story', 'A caravan crosses the dunes at sunset, a can rises in the middle fizzing, then the brand on a dark strip.', caravanCola],
    ['Tideline Sardines (the Gullcoast): a mascot', 'The gull swoops in, dives into the sea, comes up with a tin, hovers and winks.', tideline],
    ['Foundry Fuel (the Kettle): a sponsored stat', 'A real league number counting up, "brought to you by", sparks off a grinder, the can.', foundryFuel()],
    ['Ironvale Boots (the Kettle): a billboard', 'A billboard with chasing bulbs; a boot strikes a ball that heats from white to red as it flies (the sport\'s own heat), then the brand.', ironvale],
    ['Velours (Varenne): a product shot', 'Vineyards, a table, the bottle tilts and pours, the glass fills with bubbles. Very refined.', velours],
    ['Tickets (the league, Task 146): a little story', 'A turnstile clicks; a fan climbs the steps out of the dark into the light of a full stand, which rises cheering. Then TICKETS, Louder in person., ON SALE NOW (Tom) and the next live match from the calendar.', ticketsAd],
    ['Season tickets (the league, Task 146): a countdown', "A wall calendar flips through a team's seven home matches while a scarf in its colours grows a stripe for each, then drapes over a seat. The team is seeded per break; the season on sale is this one until the playoffs begin.", seasonTicketsAd],
    ['Season tickets, from the playoffs on', "The same, from the first semifinal's kick-off through the off-season: next season on sale (Tom).", seasonTicketsNext],
    ['Channel promo: the playoffs', 'Not an ad: the channel promoting its own big event, the trophy among sparks, the times, "only on SCORCHBALL". From midway through the regular season until the first semifinal kicks off (Task 111).', promo],
    ['Channel promo: the final', "From the first semifinal's kick-off until the final's: THE FINAL, and the finalists (better seed first) once both semifinals have finished.", promoFinal],
    ['Channel promo: the final, semifinals still on', "Between the first semifinal's kick-off and the end of the second, before the finalists are known.", promoFinalOpen],
  ]);
  const row = el('div', 'row');
  for (const [label, note, draw] of ads) row.append(el('div', '', [el('h3', '', [label]), el('p', 'muted', [note]), stage([[AD_MS, draw]], undefined)]));
  box.append(row);

  // ---- 3. a whole break
  box.append(el('div', 'part', ['3. A whole break']), el('p', 'muted', ['30 s: the bumper in (1.5 s), three ads (9 s each), the bumper out (1.5 s). Each gap between live matches shuffles the ads into its own order (Task 158, seeded, the same on every screen), and its breaks take them three at a time, carrying on from break to break; the stills take a fresh shuffle each time round.']));
  box.append(el('div', 'row', [
    titled('Bumper in', [[BUMPER_MS, bumper('WE\'LL BE RIGHT BACK')]]),
    titled('Bumper out', [[BUMPER_MS, bumper('BACK TO THE STUDIO')]]),
  ]));
  // The gaps after the last few matches played (the sample's moment), each with its breaks in order (Task 158).
  const { perBreak } = config.settings.ads;
  const promoNow = league.playoffs.stage;
  const gaps = done.slice(-6).map((m) => ({ id: m.id, order: adOrder(config.ads.ads, seed, m.id, promoNow) }));
  const breaksOf = (/** @type {any[]} */ order) => Array.from({ length: 5 }, (_, b) => Array.from({ length: perBreak }, (_, a) => order[adIndex(b, a, perBreak, order.length)]));
  const [first] = breaksOf(gaps[0].order);
  box.append(titled(`The break: the first after ${gaps[0].id}`, [[BUMPER_MS, bumper('WE\'LL BE RIGHT BACK')], ...first.map((ad) => /** @type {[number, Draw]} */ ([AD_MS, adDraw(ad.id)])), [BUMPER_MS, bumper('BACK TO THE STUDIO')]]));
  box.append(el('p', 'muted', [`A gap's first five breaks (about a gap's worth), for the gaps after the last six matches played at the sample's moment (the promo ${promoNow === 'off' ? 'out of' : 'in'} its window).`]));
  box.append(el('table', '', [
    el('tr', '', ['After', ...[1, 2, 3, 4, 5].map((b) => `Break ${b}`)].map((h) => el('th', '', [h]))),
    ...gaps.map((g) => el('tr', '', [el('td', '', [g.id]), ...breaksOf(g.order).map((brk) => el('td', '', [brk.map((ad) => ad.brand).join(', ')]))])),
  ]));

  // ---- 4. the brands
  /** @type {[string, string, string, string, boolean][]} */
  // The brands: every ad in data/spots.json but the channel's own promo (Ad break, Task 162: the slate of 18 is complete).
  /** @type {[string, string, string, string, boolean][]} */
  const BRANDS = config.ads.ads.filter((/** @type {any} */ a) => a.id !== 'playoffs_promo').map((/** @type {any} */ a) => [a.brand, a.product, a.region, a.tagline, true]);
  // ---- the ad stills (Task 113): one still per ad for the strip above the ground in Full, drawn once.
  box.append(el('div', 'part', ['The ad stills (Task 113)']), el('p', 'muted', [`In Full, during match pictures, the strip above the ground right of the scorebug shows one ad as a still: a snapshot of its animated ad, with its brand, changing every few minutes (Tom). ${STILL.w} × ${STILL.h} stage px, from just past the widest scorebug (HIGHLIGHTS) to the side panel. Shown ×4, then in place at the channel's size ×2, beside a LIVE scorebug and the wider HIGHLIGHTS one: each still stretches to fill from just past the scorebug to the side panel.`]));
  const stillAds = /** @type {[string, string, any][]} */ ([
    ['Caravan Cola', 'caravan_cola', facts], ['Tideline Sardines', 'tideline_sardines', facts], ['Foundry Fuel', 'foundry_fuel', facts],
    ['Ironvale Boots', 'ironvale_boots', facts], ['Velours', 'velours', facts],
    ['Tickets', 'tickets', facts], ['Season tickets', 'season_tickets', facts], ['Season tickets, from the playoffs on', 'season_tickets', nextSeason],
    ['The playoffs promo', 'playoffs_promo', facts],
    ['The final\'s promo', 'playoffs_promo', { scorchers, playoffs: { ...playoffs, stage: 'final', finalists: [fa, fb] } }],
    ['The final\'s promo, semifinals still on', 'playoffs_promo', { scorchers, playoffs: { ...playoffs, stage: 'final' } }],
  ]);
  const stillRow = el('div', 'row');
  for (const [label, id, f] of stillAds) stillRow.append(stillBlock(label, config.ads.ads.find((/** @type {any} */ a) => a.id === id), f));
  box.append(stillRow);

  /**
   * An ad's still ×4 on its own, then in place beside a LIVE and a HIGHLIGHTS scorebug.
   * @param {string} label @param {any} ad @param {any} f  Its facts.
   */
  function stillBlock(label, ad, f) {
    // ×4 on its own.
    const big = document.createElement('canvas');
    big.width = STILL.w;
    big.height = STILL.h;
    big.style.cssText = `width:${STILL.w * 4}px;height:${STILL.h * 4}px;image-rendering:pixelated;display:block`;
    const bctx = /** @type {CanvasRenderingContext2D} */ (big.getContext('2d'));
    drawAdStill(bctx, { x: 0, y: 0, w: STILL.w, h: STILL.h }, ad, f);
    // In place: the strip above the ground, a scorebug at its left (LIVE, then the wider HIGHLIGHTS), the still from
    // 4 px past it to the side panel, as the channel fits it.
    const strips = /** @type {[string, number, string][]} */ ([['LIVE', 186, PALETTE.live], ['HIGHLIGHTS', 210, PALETTE.replay]]).map(([bug, end, colour]) => {
      const strip = document.createElement('canvas');
      strip.width = 394;
      strip.height = 23;
      strip.style.cssText = 'width:788px;height:46px;image-rendering:pixelated;display:block;margin-top:6px';
      const sctx = /** @type {CanvasRenderingContext2D} */ (strip.getContext('2d'));
      sctx.fillStyle = PALETTE.backdrop; sctx.fillRect(0, 0, 394, 23);
      sctx.fillStyle = PALETTE.panel; sctx.fillRect(0, 0, end, 18);
      const tag = blockWidth(bug, 1) + 8;
      sctx.fillStyle = colour; sctx.fillRect(0, 0, tag, 18);
      sctx.fillStyle = PALETTE.accent; sctx.fillRect(0, 18, end - 36, 2);
      blockText(sctx, bug, 4, 6, 1, '#ffffff');
      blockText(sctx, 'GUL 2-1 STO   1H 14:02', tag + 8, 6, 1, PALETTE.panelInk);
      drawAdStill(sctx, { x: end + 4, y: 0, w: 394 - end - 4, h: STILL.h }, ad, f);
      return strip;
    });
    return el('div', '', [el('h3', '', [label]), big, ...strips]);
  }

  box.append(el('div', 'part', ['4. The brands']), el('p', 'muted', ['Invented, local to the league\'s regions, none meant to evoke a real brand, and none named after a team\'s city. Orange: in an ad above. For Tom to edit, add to or strike out.']));
  box.append(el('table', '', [
    el('tr', '', ['Brand', 'Product', 'From', 'Tagline'].map((h) => el('th', '', [h]))),
    ...BRANDS.map(([name, product, from, tag, used]) => el('tr', '', [el('td', used ? 'used' : '', [name]), el('td', '', [product]), el('td', '', [from]), el('td', '', [tag])])),
  ]));

  let clock = 0;
  let last = performance.now();
  const tick = (/** @type {number} */ nowMs) => {
    clock = freeze ?? clock + (nowMs - last) * (slow.checked ? 0.25 : 1);
    last = nowMs;
    for (const s of stages) if (s.visible) s.draw(s.ctx, clock);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

boot().catch((err) => {
  document.body.append(el('pre', 'bad', [String(err instanceof Error ? err.stack : err)]));
  console.error(err);
});
