// The player-of-the-match interview (Task 100; docs/channel.md §16.8): set A, the board. Where everything goes in
// Full and Broadcast, what the player does while the quote types, how they look, and RECORDED in re-airs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { potmCard } from '../src/channel/cards.js';
import { charsAt, interviewLayout, interviewParts, interviewPose, playerLook, quoteSchedule, recordedMark } from '../src/channel/interview.js';
import { drawFigure } from '../src/channel/studioSet.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { keeperShirt, skinOf } from '../src/channel/pitch.js';
import { createProgramme } from '../src/channel/programme.js';
import { sceneRect } from '../src/channel/scene.js';
import { interviewClipKey } from '../src/channel/speech.js';
import { createTimeline } from '../src/channel/timeline.js';
import { pictureOf } from '../src/channel/transitions.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const o = { delayMs: 1500, charsPerSecond: 25, nodEveryMs: 1400 };

test('in Full and Broadcast, the player, the bubble, the badge, the caption bar and RECORDED sit inside the picture', () => {
  for (const [slide, scale] of [[0, 4], [1, 5]]) {
    const R = sceneRect(slide);
    const L = interviewLayout(R);
    assert.equal(L.scale, scale);
    const inside = (/** @type {number} */ x, /** @type {number} */ y) => x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h;
    // The figure is 12 cells wide (and an arm each side).
    assert.ok(inside(L.player.x - 8 * L.scale, L.player.y) && inside(L.player.x + 8 * L.scale, L.player.y));
    assert.equal(L.player.bottom, R.y + R.h);
    assert.ok(inside(L.bubble.x, L.bubble.y) && inside(L.bubble.x + L.bubble.w, L.bubble.y));
    // The bubble stays clear of the player, to their left (their tail points at them).
    assert.ok(L.bubble.x + L.bubble.w < L.player.x - 6 * L.scale);
    assert.ok(inside(L.lower.x, L.lower.y) && inside(L.lower.x + L.lower.w, L.lower.y + L.lower.h));
    assert.ok(L.badge.y < L.lower.y && inside(L.badge.x, L.badge.y));
    assert.ok(inside(L.rec.right, L.rec.y));
  }
});

test('the player listens and nods, talks while the quote types, then rests with a nod now and then', () => {
  const len = 50;
  assert.deepEqual(interviewPose(0, len, o), { pose: 'nod', mouth: false, chars: 0 });
  assert.equal(interviewPose(1499, len, o).chars, 0);
  const talking = interviewPose(2500, len, o);
  assert.equal(talking.pose, 'talk');
  assert.equal(talking.mouth, true);
  assert.equal(talking.chars, 25);
  // Typed out by 1.5 s + 2 s.
  const done = 1500 + 2000;
  assert.equal(interviewPose(done, len, o).chars, len);
  assert.equal(interviewPose(done, len, o).mouth, false);
  const poses = new Set();
  for (let t = done; t < 45_000; t += 100) {
    const p = interviewPose(t, len, o);
    assert.equal(p.chars, len);
    poses.add(p.pose);
  }
  assert.deepEqual([...poses].sort(), ['nod', 'rest']);
  // The same moment, the same pose.
  assert.deepEqual(interviewPose(12_345, len, o), interviewPose(12_345, len, o));
});

test('the player looks as on the pitch: their skin, the kit they wore, a keeper in the keeper\'s shirt', () => {
  const kit = { primary: '#aa0000', secondary: '#ffffff' };
  const looks = config.studio.looks;
  const a = playerLook('p-17', kit, { keeper: false, side: 'home' }, looks);
  assert.deepEqual(a, playerLook('p-17', kit, { keeper: false, side: 'home' }, looks));
  assert.equal(a.skin, skinOf('p-17'));
  assert.deepEqual(a.kit, kit);
  assert.ok(looks.hair.includes(a.hair) && looks.hairStyles.includes(a.style));
  const k = playerLook('p-17', kit, { keeper: true, side: 'away' }, looks);
  assert.deepEqual(k.kit, { primary: keeperShirt('away'), secondary: kit.primary });
});

test('RECORDED, with when it was played, only in re-airs', () => {
  const fmt = (/** @type {number} */ t) => `T${t}`;
  assert.equal(recordedMark(true, 42, fmt), 'RECORDED · T42');
  assert.equal(recordedMark(false, 42, fmt), null);
});

test('the interview is on the board, live after the match talk and recorded in re-airs, with the same player', () => {
  const calendar = createCalendar(config);
  const slots = calendar.slots(1);
  const live = new LiveLeague(config, { now: slots[0].kickoff, seed: 'interview-tests' });
  /** @type {Map<string, any>} */
  const tls = new Map();
  const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
  const programme = createProgramme(live, timelineOf);
  /** @type {any} */
  let liveSeen = null;
  /** @type {any} */
  let reairSeen = null;
  for (let t = slots[0].kickoff; t < slots[4].kickoff && !(liveSeen && reairSeen);) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (pictureOf(seg) === 'interview') {
      if (seg.kind === 'potm') liveSeen ??= seg;
      if (seg.kind === 'reair') reairSeen ??= seg;
    }
    t = p.until > t ? p.until : t + 1000;
  }
  assert.ok(liveSeen && reairSeen, 'a live interview and a recorded one');
  // As long as the nod, the quote's clips (its parts since Task 247a: a reaction, and a fact sentence when there's one,
  // a short gap between) and a moment to read the caption bar (Task 187), never more than before.
  const s = config.settings;
  const needs = (/** @type {any} */ m) => {
    const card = potmCard(m, live, 0);
    assert.ok(card.voice, 'every player here has a voice');
    const quote = config.voiceLengths[interviewClipKey(/** @type {string} */ (card.voice), card.quoteKey)];
    assert.ok(quote > 1, 'its clip is in the list of lengths');
    const parts = interviewParts(card, config.voiceLengths);
    const spoken = quoteSchedule(parts, s.captions.quoteCharsPerSecond, s.studio.interviewPartGapSeconds * 1000).ms / 1000;
    assert.ok(spoken >= quote, 'the parts take at least the first clip');
    return Math.ceil((s.studio.interviewQuoteDelaySeconds + spoken + s.studio.interviewHoldSeconds) * 1000);
  };
  assert.equal(liveSeen.until - liveSeen.from, Math.min(s.segments.potmSeconds * 1000, needs(liveSeen.match)));
  assert.equal(reairSeen.until - reairSeen.from, Math.min(s.reairs.interviewSeconds * 1000, needs(reairSeen.match)));
  assert.ok(liveSeen.until - liveSeen.from < 15_000, 'no long wait after the quote');
  // A re-air's interview is the same as on the day: the same pick, the same words.
  const m = reairSeen.match;
  assert.deepEqual(potmCard(m, live, 0), potmCard(m, live, 0));
  assert.ok(potmCard(m, live, 0).quote.length > 0);
});

test('the crest, or the small mark, sits on the kit\'s left chest (the viewer\'s right) whichever way the figure faces (Task 209)', () => {
  const kit = { primary: '#aa0000', secondary: '#ffffff' };
  const look = playerLook('p-17', kit, { keeper: false, side: 'home' }, config.studio.looks);
  // Anything the figure draws besides rects is ignored.
  const ctx = (/** @type {(x: number, y: number, style: string) => void} */ onRect) => new Proxy({ fillStyle: '' }, {
    get: (t, k) => (k === 'fillRect' ? (/** @type {number} */ x, /** @type {number} */ y) => onRect(x, y, /** @type {any} */ (t).fillStyle) : k in t ? /** @type {any} */ (t)[k] : () => {}),
    set: (t, k, v) => { /** @type {any} */ (t)[k] = v; return true; },
  });
  for (const facing of /** @type {const} */ ([1, -1])) {
    /** @type {number[]} */
    const at = [];
    drawFigure(ctx(() => {}), 100, 50, 3, look, 'rest', 0, facing, { toBottom: 200, badge: (cx) => at.push(cx) });
    assert.deepEqual(at, [109], `crest, facing ${facing}`);
    // Without a crest: the mark's rects in the second colour below the collar (rows 12–14) all right of centre.
    /** @type {number[]} */
    const marks = [];
    drawFigure(ctx((x, y, style) => { if (style === kit.secondary && y >= 50 + 12 * 3 && y <= 50 + 14 * 3) marks.push(x); }), 100, 50, 3, look, 'rest', 0, facing);
    assert.equal(marks.length, 2, `mark, facing ${facing}`);
    assert.ok(marks.every((x) => x > 100), `mark, facing ${facing}: ${marks}`);
  }
});

test('a quote in parts (Task 247a): each typed over its clip, a pause between, the mouth still in the pause', () => {
  const s = quoteSchedule([{ chars: 20, seconds: 2 }, { chars: 30, seconds: null }], 15, 400);
  assert.deepEqual(s.parts.map((p) => [p.from, p.until, p.before]), [[0, 2000, 0], [2400, 4400, 21]]);
  assert.equal(s.ms, 4400);
  assert.equal(s.total, 51);
  assert.equal(charsAt(s, 1000), 10);
  assert.equal(charsAt(s, 2200), 21, 'the space typed in the pause');
  assert.equal(charsAt(s, 9000), 51);
  const o = { delayMs: 1500, charsPerSecond: 15, nodEveryMs: 1400, schedule: s };
  assert.equal(interviewPose(1500 + 2200, 51, o).mouth, false);
  assert.equal(interviewPose(1500 + 2200, 51, o).pose, 'talk');
  assert.equal(interviewPose(1500 + 3000, 51, o).mouth, true);
  assert.notEqual(interviewPose(1500 + 5000, 51, o).pose, 'talk');
});
