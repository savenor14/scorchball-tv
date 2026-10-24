// People round the play who aren't players: the referee (Task 47), and the managers (Task 48). Pure and DOM-free.
// See docs/channel.md §14.4. Positions are in pitch fractions, like formation.js; distances count the pitch as twice
// as long as it is wide, as in motion.js.
//
// The referee follows play on a diagonal (low on the left, high on the right, like a real referee's diagonal), a little
// behind the ball and toward the middle, keeping clear of the ball, the players and the creases. They follow where the
// ball has been over the last refereeTrackMs, which gives the lag, caps their speed and blends smoothly into and out of
// the restarts, so they never jump. Before each kick-off, at the breaks and through the end of the match they stand by
// the centre circle (REF_KICKOFF), which is where the walk-out leaves them (ceremonies.js), so kick-off has no jump.
// During a pause their target holds where it was. After a goal or a foul they raise an arm for refereeSignalMs. In a
// free shot's pause (Task 143) they're scripted from motion.js's staging: to the ball, carrying it to the mark, aside
// with an arm up for the kick, then back into following over FREE_BLEND_MS. In any other foul's pause (Task 144) they
// come over to the ball, set it where it lies, and head back into following as play restarts.
//
// Each manager (Task 48) stands on the touchline in the open stretch between their dugout and the tunnel, pacing
// slowly along it with the ball (left end when it's at the left goal, right end at the right), following where it has
// been over managerTrackMs. After their team scores they throw their arms up, after conceding they put their hands on
// their head, for goalCelebrateMs. At half-time and before overtime (Task 66) each walks out to where their players
// gather by the bench and talks to them (an arm up now and then), then walks back to their stretch before the
// restart. Their names are generated from the team's region, seeded by the league and the team,
// at presentation time: nothing in the sim or the event log.
import { PALETTE } from './palette.js';
import { colourDistance } from './kits.js';
import { outOfCrease } from './formation.js';
import { benchArea, seat, TUNNEL } from './sidelines.js';

/** Where the referee stands for a kick-off: just outside the centre circle, toward the top touchline. */
export const REF_KICKOFF = Object.freeze({ x: 0.5, y: 0.33 });
/** Where they stand in a shootout (Task 277b, Tom): on the goal line by the top wall, clear of the keepers and the takers. */
const REF_SHOOTOUT_LINE = Object.freeze({ x: 0.965, y: 0.06 });
/** The diagonal: how far the referee follows the ball along the pitch, and how steeply they cross it. */
const FOLLOW = 0.75;
const DIAGONAL = 0.75;
/** Keep this far (pitch lengths) from the ball, and from any player (pushed away smoothly inside it). */
const BALL_CLEAR = 0.1;
const PLAYER_CLEAR = 0.06;
/** The quick sidestep: from anyone within DODGE_CLEAR (pitch lengths), averaged over DODGE_MS. */
const DODGE_CLEAR = 0.04;
const DODGE_MS = 500;
/** Never closer than this to the boards (pitch fractions). */
const EDGE = 0.06;
/** After a free shot, how long the referee takes to blend from their spot aside back into following (ms). */
const FREE_BLEND_MS = 3000;
/** In any other foul's pause (Task 144): the referee is by the ball this share of the way in, and leaves it at SET_UNTIL. */
const SET_AT = 0.45;
const SET_UNTIL = 0.75;
/** In a free shot's pause the referee covers ground at most this many times runSpeed: from far off they arrive late rather than sprint. */
const FREE_RUN = 2;
/** The tracking grid, ms. */
const GRID_MS = 100;
const PLAYING = new Set(['first_half', 'second_half', 'overtime']);

/**
 * The referee's kits, in order of preference: black with yellow, then the change kits. A match uses the first that
 * doesn't clash with either team's shirt, either keeper's shirt or the turf (settings.kits.clashDistance).
 */
export const REFEREE_KITS = Object.freeze([
  Object.freeze({ primary: '#17181c', secondary: '#f2d22e' }),
  Object.freeze({ primary: '#e8a020', secondary: '#17181c' }),
  Object.freeze({ primary: '#6c3fc4', secondary: '#f4f4f4' }),
  Object.freeze({ primary: '#9aa1b2', secondary: '#17181c' }),
]);

/**
 * The referee's kit for a match: the first of REFEREE_KITS far enough from everything else on the pitch.
 * @param {{ home: import('./kits.js').Kit, away: import('./kits.js').Kit }} kits  The kits worn in the match.
 * @param {number} clashDistance
 * @returns {import('./kits.js').Kit}
 */
export function refereeKit(kits, clashDistance) {
  const others = [kits.home.primary, kits.away.primary, PALETTE.keeperHome, PALETTE.keeperAway, PALETTE.turf, PALETTE.turfStripe];
  return REFEREE_KITS.find((k) => others.every((c) => colourDistance(k.primary, c) >= clashDistance)) ?? REFEREE_KITS[0];
}

/**
 * Where the referee wants to be for a ball at `ball`: on the diagonal, toward the middle, clear of the ball and the creases.
 * @param {{ x: number, y: number }} ball
 */
export function refereeSpot(ball) {
  const x = 0.5 + FOLLOW * (ball.x - 0.5);
  let p = { x, y: 0.5 + DIAGONAL * (0.5 - x) };
  // Off the ball: straight away from it, out to BALL_CLEAR.
  const d = dist(p, ball);
  if (d < BALL_CLEAR) {
    const [ux, uy] = d < 1e-9 ? [0, -1] : [(p.x - ball.x) / d, (p.y - ball.y) / 2 / d];
    p = { x: ball.x + ux * BALL_CLEAR, y: ball.y + uy * BALL_CLEAR * 2 };
  }
  return outOfCrease(inside(p));
}

/**
 * The referee through a match.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ at: (e: number) => import('./motion.js').Pose | null, freeShotAt?: import('./motion.js').Motion['freeShotAt'], foulAt?: import('./motion.js').Motion['foulAt'] }} motion
 * @param {{ refereeTrackMs: number, refereeSignalMs: number, runSpeed?: number }} animation
 */
export function createReferee(timeline, motion, { refereeTrackMs, refereeSignalMs, runSpeed = 0.11 }) {
  const freePauses = timeline.pauses.filter((q) => q.kind === 'free_shot');
  const foulPauses = timeline.pauses.filter((q) => q.kind === 'foul');
  /** @type {Map<number, { x: number, y: number }>} */
  const grid = new Map();
  // Their arm up for a goal or a foul, and for each kick scored in a shootout (Task 277b, pointing to it).
  const signals = timeline.events.filter((t) => t.event.type === 'goal' || t.event.type === 'foul' || (t.event.type === 'shootout_kick' && /** @type {any} */ (t.event.data).scored)).map((t) => t.at);
  /** @type {Map<number, { x: number, y: number }[]>} Each free shot's chase, by its pause's start. */
  const chases = new Map();

  /** Where they want to be at grid moment i. @param {number} i @returns {{ x: number, y: number }} */
  function want(i) {
    let w = grid.get(i);
    if (w) return w;
    const g = i * GRID_MS;
    const s = timeline.stateAt(Math.max(0, g));
    if (g <= 0 || g >= timeline.duration) w = REF_KICKOFF;
    else if (s.phase === 'shootout' || s.phase === 'shootout_break') w = REF_SHOOTOUT_LINE;
    else if (!PLAYING.has(s.phase)) w = REF_KICKOFF;
    else if (s.paused) {
      // Hold: where they wanted to be as the pause began.
      const from = timeline.pauses.findLast((q) => q.at <= g)?.at ?? g;
      w = want(Math.min(i - 1, Math.floor((from - 1) / GRID_MS)));
    } else {
      const pose = motion.at(g);
      w = pose?.ball ? clearOf(refereeSpot(pose.ball), pose.players, PLAYER_CLEAR) : REF_KICKOFF;
    }
    grid.set(i, w);
    return w;
  }

  /**
   * Where the referee is at `e` (ms since kick-off), and whether their arm is up.
   * @param {number} e
   * @returns {{ x: number, y: number, arm: boolean }}
   */
  function at(e) {
    const arm = signals.some((s) => e >= s && e < s + refereeSignalMs);
    // A free shot's pause, or just after one (Task 143).
    const q = freePauses.find((p) => e >= p.at && e < p.at + p.ms + FREE_BLEND_MS);
    const f = q && motion.freeShotAt ? motion.freeShotAt(q.at) : null;
    if (q && f) {
      const end = q.at + q.ms;
      // The staged spot, chased at no more than FREE_RUN times running pace (Task 175: a foul far from the referee had
      // them sprint at three and a half). From close by they keep to it; from far off they reach the ball late, on its
      // way to the mark. Worked out once per pause in GRID_MS steps.
      let path = chases.get(q.at);
      if (!path) {
        const whistle = following(q.at);
        const step = (FREE_RUN * runSpeed * GRID_MS) / 1000;
        path = [whistle];
        for (let t = GRID_MS; t <= q.ms; t += GRID_MS) {
          const prev = path[path.length - 1];
          const s = freeShotSpot(f, t, whistle);
          const d = dist(prev, s);
          path.push(d <= step ? s : lerp(prev, s, step / d));
        }
        chases.set(q.at, path);
      }
      const chased = path;
      const staged = (/** @type {number} */ t) => {
        const k = Math.max(0, t - q.at) / GRID_MS;
        const i = Math.min(chased.length - 1, Math.floor(k));
        return lerp(chased[i], chased[Math.min(chased.length - 1, i + 1)], k - i);
      };
      if (e < end) return { ...staged(e), arm: arm || (e - q.at >= f.stage.cleared && e - q.at < f.stage.kick) };
      const g = (e - end) / FREE_BLEND_MS;
      const from = staged(end - 1);
      const to = following(e);
      const k = g * g * (3 - 2 * g);
      return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, arm };
    }
    // Any other foul's pause (Task 144): over to the ball by SET_AT of it, standing by it to SET_UNTIL, then back
    // toward where following will have them as play restarts, and into following over FREE_BLEND_MS.
    const r = foulPauses.find((p) => e >= p.at && e < p.at + p.ms + FREE_BLEND_MS);
    const g = r && motion.foulAt ? motion.foulAt(r.at) : null;
    if (r && g) {
      const end = r.at + r.ms;
      const ease = (/** @type {number} */ v) => { const k = Math.min(1, Math.max(0, v)); return k * k * (3 - 2 * k); };
      const start = following(r.at);
      // As close as a run gets them in the time (from far off, not quite all the way).
      const ball = { x: g.spot.x - g.dir * 0.015, y: g.spot.y + (g.spot.y < 0.5 ? 0.03 : -0.03) };
      const reach = (runSpeed * SET_AT * r.ms) / 1000;
      // Never into a crease (Task 241 found a foul right by the goal taking them in).
      const by = outOfCrease(lerp(start, ball, Math.min(1, reach / Math.max(1e-9, dist(start, ball)))));
      if (e < r.at + SET_AT * r.ms) return { ...lerp(start, by, ease((e - r.at) / (SET_AT * r.ms))), arm };
      if (e < r.at + SET_UNTIL * r.ms) return { ...by, arm };
      return { ...lerp(by, following(e), ease((e - r.at - SET_UNTIL * r.ms) / (end + FREE_BLEND_MS - r.at - SET_UNTIL * r.ms))), arm };
    }
    return { ...following(e), arm };
  }

  /** Where the following puts them, plus a quick sidestep from anyone close, averaged over DODGE_MS so it stays smooth. @param {number} e */
  function following(e) {
    const base = follow(e);
    const d = windowAverage((t) => between(dodgeAt, t), e, DODGE_MS);
    return outOfCrease(inside({ x: base.x + d.x, y: base.y + d.y }));
  }

  /** @type {Map<number, { x: number, y: number }>} The sidestep at each grid moment. */
  const dodges = new Map();

  /** The sidestep at grid moment i: away from the players there, from where the following puts them. @param {number} i */
  function dodgeAt(i) {
    let d = dodges.get(i);
    if (d) return d;
    const g = i * GRID_MS;
    const players = g > 0 && g < timeline.duration ? motion.at(g)?.players ?? [] : [];
    const base = follow(g);
    const to = clearOf(base, players, DODGE_CLEAR);
    d = { x: to.x - base.x, y: to.y - base.y };
    dodges.set(i, d);
    return d;
  }

  /** Where following the target puts them at e: its exact average over [e - refereeTrackMs, e]. @param {number} e */
  const follow = (e) => windowAverage((t) => between(want, t), e, refereeTrackMs);

  return { at };
}

/**
 * The referee in a free shot's pause (Task 143), `since` ms into it: from where they were at the whistle to just
 * behind the ball, carrying it to the mark (beside it, as motion.js moves the ball), then aside, off the side of the box
 * between the mark and the goal, clear of the arc.
 * @param {{ foul: { x: number, y: number }, mark: { x: number, y: number }, dir: 1 | -1, stage: ReturnType<typeof import('./motion.js').freeShotStaging> }} f
 * @param {number} since @param {{ x: number, y: number }} from
 */
function freeShotSpot(f, since, from) {
  const st = f.stage;
  const back = -f.dir;
  const beside = (/** @type {{ x: number, y: number }} */ p) => ({ x: p.x + back * 0.012, y: p.y - 0.02 });
  const ease = (/** @type {number} */ v) => { const g = Math.min(1, Math.max(0, v)); return g * g * (3 - 2 * g); };
  // Setting off at the whistle.
  if (since < st.pickUp) return lerp(from, beside(f.foul), ease(since / st.pickUp));
  if (since < st.placed) return lerp(beside(f.foul), beside(f.mark), ease((since - st.pickUp) / (st.placed - st.pickUp)));
  return lerp(beside(f.mark), { x: f.mark.x + f.dir * 0.07, y: 0.2 }, ease((since - st.placed) / (st.aside - st.placed)));
}

/**
 * A grid-sampled path at time t: linear between the GRID_MS moments either side.
 * @param {(i: number) => { x: number, y: number }} sample  The path at grid moment i. @param {number} t
 */
function between(sample, t) {
  const k = t / GRID_MS;
  const k0 = Math.floor(k);
  const [a, b] = [sample(k0), sample(k0 + 1)];
  return { x: a.x + (b.x - a.x) * (k - k0), y: a.y + (b.y - a.y) * (k - k0) };
}

/**
 * A spot moved clear of the players: pushed away from anyone within PLAYER_CLEAR (smoothly, more the closer they are).
 * @param {{ x: number, y: number }} p @param {{ x: number, y: number }[]} players @param {number} clear
 */
function clearOf(p, players, clear) {
  let px = 0;
  let py = 0;
  for (const q of players) {
    const d = dist(p, q);
    if (d >= clear || d < 1e-9) continue;
    const push = (clear - d) / d;
    px += (p.x - q.x) * push;
    py += (p.y - q.y) * push;
  }
  return outOfCrease(inside({ x: p.x + px, y: p.y + py }));
}

/** The managers' feet line: just above the top boards, like the tunnel mouth. */
export const MANAGER_Y = TUNNEL.mouth.y;
/** Room left between a manager's stretch and the dugout or the tunnel wall, in pitch fractions. */
const AREA_GAP = 0.03;

/**
 * The stretch of touchline a team's manager paces: from just past the end of their dugout to just short of the tunnel.
 * @param {'home' | 'away'} side
 * @returns {{ lo: number, hi: number }}  x, left to right.
 */
export function managerArea(side) {
  const dugoutEnd = seat(side, 0).x;
  const wall = side === 'home' ? TUNNEL.mouth.x - TUNNEL.halfW : TUNNEL.mouth.x + TUNNEL.halfW;
  return side === 'home' ? { lo: dugoutEnd + AREA_GAP, hi: wall - AREA_GAP } : { lo: wall + AREA_GAP, hi: dugoutEnd - AREA_GAP };
}

/** Where a manager stands when there's no ball to follow: the middle of their stretch. @param {'home' | 'away'} side */
export function managerRest(side) {
  const { lo, hi } = managerArea(side);
  return { x: (lo + hi) / 2, y: MANAGER_Y };
}

/**
 * @typedef {'pace' | 'cheer' | 'despair' | 'talk'} ManagerMood  cheer: arms up. despair: hands on head. talk: the
 *   half-time talk, an arm up now and then.
 * @typedef {{ side: 'home' | 'away', x: number, y: number, mood: ManagerMood }} Manager
 */

/**
 * Both managers through a match.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ at: (e: number) => import('./motion.js').Pose | null }} motion
 * @param {{ managerTrackMs: number, goalCelebrateMs: number, jogSpeed: number }} animation
 * @param {{ breakLineMs?: number }} [o]  breakLineMs: the restart's lead-in after a break (ceremonies.breakLineSeconds);
 *   with it, the managers go out to talk to their players at the breaks.
 */
export function createManagers(timeline, motion, { managerTrackMs, goalCelebrateMs, jogSpeed }, { breakLineMs } = {}) {
  /** @type {Map<number, number>} Where along their stretch (0 = left end, 1 = right) each wants to be, by grid moment. */
  const grid = new Map();
  const goals = timeline.events.filter((t) => t.event.type === 'goal').map((t) => ({ at: t.at, teamId: t.event.teamId }));

  /** @param {number} i */
  function want(i) {
    let w = grid.get(i);
    if (w !== undefined) return w;
    const g = i * GRID_MS;
    const s = timeline.stateAt(Math.max(0, g));
    const ball = g > 0 && g < timeline.duration && PLAYING.has(s.phase) && !s.paused ? motion.at(g)?.ball : null;
    w = ball ? Math.min(1, Math.max(0, ball.x)) : 0.5;
    grid.set(i, w);
    return w;
  }

  /** Where along their stretch both pace at `e` (0 = left end, 1 = right). @param {number} e */
  const along = (e) => windowAverage((t) => between((i) => ({ x: want(i), y: 0 }), t), e, managerTrackMs).x;

  /**
   * Both managers at `e` (ms since kick-off).
   * @param {number} e
   * @returns {Manager[]}
   */
  function at(e) {
    const f = along(e);
    const goal = goals.findLast((q) => e >= q.at && e < q.at + goalCelebrateMs);
    const brk = breakLineMs === undefined ? null : timeline.breaks.find((b) => e >= b.from && e < b.to) ?? null;
    return /** @type {const} */ (['home', 'away']).map((side) => {
      const { lo, hi } = managerArea(side);
      const teamId = side === 'home' ? timeline.homeId : timeline.awayId;
      const pacing = { x: lo + (hi - lo) * f, y: MANAGER_Y };
      if (brk) return { side, ...halfTimeTalk(side, brk, e, pacing), };
      /** @type {ManagerMood} */
      const mood = !goal ? 'pace' : goal.teamId === teamId ? 'cheer' : 'despair';
      return { side, ...pacing, mood };
    });
  }

  /**
   * A manager through a break (Task 66): out from their stretch to stand in front of their players where they gather
   * by the bench, talking (an arm up now and then), then back to their stretch, there by the restart.
   * @param {'home' | 'away'} side @param {{ from: number, to: number }} brk @param {number} e
   * @param {{ x: number, y: number }} pacing  Where they'd be on their stretch now.
   * @returns {{ x: number, y: number, mood: ManagerMood }}
   */
  function halfTimeTalk(side, brk, e, pacing) {
    const outfield = Math.max(1, (timeline.stateAt(brk.from).onPitch[side].length || 1) - 1);
    const ends = [benchArea(side, 0), benchArea(side, outfield - 1)];
    const talk = { x: (ends[0].x + ends[1].x) / 2, y: TALK_Y };
    const v = jogSpeed / 1000;
    const start = { x: managerArea(side).lo + (managerArea(side).hi - managerArea(side).lo) * along(brk.from), y: MANAGER_Y };
    const outMs = dist(start, talk) / v;
    const back = Math.max(brk.from + outMs, brk.to - /** @type {number} */ (breakLineMs));
    const backMs = Math.max(1, Math.min(brk.to - back, dist(talk, pacing) / v));
    if (e < brk.from + TALK_DELAY_MS) return { ...start, mood: 'pace' };
    if (e < back) {
      const f = Math.min(1, (e - brk.from - TALK_DELAY_MS) / outMs);
      if (f < 1) return { ...lerp(start, talk, ease(f)), mood: 'pace' };
      // Talking: an arm up for a moment every so often.
      const up = Math.floor((e - brk.from) / TALK_BEAT_MS) % 3 === 0;
      return { ...talk, mood: up ? 'talk' : 'pace' };
    }
    const f = Math.min(1, (e - back) / backMs);
    return { ...lerp(talk, pacing, ease(f)), mood: 'pace' };
  }

  return { at };
}

/**
 * The exact average of a piecewise-linear path (linear between GRID_MS moments) over [e - ms, e].
 * @param {(t: number) => { x: number, y: number }} point @param {number} e @param {number} ms
 */
function windowAverage(point, e, ms) {
  let x = 0;
  let y = 0;
  for (let t = e - ms; t < e;) {
    const next = Math.min(e, (Math.floor(t / GRID_MS) + 1) * GRID_MS);
    const [a, b] = [point(t), point(next)];
    x += ((a.x + b.x) / 2) * (next - t);
    y += ((a.y + b.y) / 2) * (next - t);
    t = next;
  }
  return { x: x / ms, y: y / ms };
}

/** Where a manager stands to talk to their players at a break: in front of them (pitch fractions down), and how long
 * they wait before setting off, and the rhythm of their gestures (ms). */
const TALK_Y = 0.17;
const TALK_DELAY_MS = 1500;
const TALK_BEAT_MS = 900;

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b @param {number} f */
const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
/** @param {number} f */
const ease = (f) => f * f * (3 - 2 * f);

/** @param {{ x: number, y: number }} p */
const inside = (p) => ({ x: Math.min(1 - EDGE, Math.max(EDGE, p.x)), y: Math.min(1 - EDGE, Math.max(EDGE, p.y)) });

/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b */
const dist = (a, b) => Math.hypot(b.x - a.x, (b.y - a.y) / 2);
