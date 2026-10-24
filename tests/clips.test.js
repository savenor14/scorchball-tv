// The clip tool (getting the word out, docs/launch-plan.md): the moments worth a clip (src/channel/clipMoments.js) and
// ffmpeg's arguments for a wide or tall MP4 (src/cli/clip.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clipMoments } from '../src/channel/clipMoments.js';
import { clipArgs } from '../src/cli/clip.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const settings = config.settings.clips;
const S = 1000;

/** A goal at `at` ms after kick-off. @param {number} at @param {string} who @param {boolean} [scorcher] */
const goal = (at, who, scorcher = false) => ({ at, event: { type: 'goal', playerId: who, clock: at / 1000, data: { scorcher, score: [1, 0] } } });

/** A match and its timeline. @param {string} id @param {number} kickoff @param {any[]} events @param {object} [extra] */
function match(id, kickoff, events, extra = {}) {
  const m = /** @type {any} */ ({ id, season: 2, stage: 'regular', round: 3, kickoff, homeId: 'h', awayId: 'a', ...extra });
  const tl = /** @type {any} */ ({ events, duration: 40 * 60 * S, goldenAt: -1, ...(/** @type {any} */ (extra).tl ?? {}) });
  return { m, tl };
}

test('the moments: a golden goal and a shootout first, then the final\'s last goal and a fifth goal, then scorchers; only what has aired', () => {
  const day = Date.parse('2026-11-10T00:00:00Z');
  const plain = match('m1', day, [goal(60 * S, 'p1'), goal(120 * S, 'p2', true), goal(200 * S, 'p1')]);
  const haul = match('m2', day + 3600 * S, [1, 2, 3, 4, 5].map((k) => goal(k * 100 * S, 'p9')));
  const golden = match('m3', day + 7200 * S, [goal(2000 * S, 'p4')], { tl: { goldenAt: 2000 * S } });
  const shootout = match('m4', day + 10800 * S, [{ at: 2300 * S, event: { type: 'shootout_kick', playerId: 'p5', clock: 2400, data: { shootout: [4, 3] } } }]);
  const final = match('m5', day + 14400 * S, [goal(300 * S, 'p6'), goal(900 * S, 'p7')], { stage: 'final' });
  const later = match('m6', day + 100 * 3600 * S, [goal(60 * S, 'p8', true)]);
  const all = [plain, haul, golden, shootout, final, later];
  const timelines = new Map(all.map(({ m, tl }) => [m.id, tl]));
  const now = day + 20 * 3600 * S;
  const out = clipMoments({ matches: all.map((x) => x.m), timelineOf: (m) => timelines.get(m.id), playerName: (id) => `P. ${id}`, abbr: (id) => id.toUpperCase(), settings, now });
  assert.deepEqual(out.map((x) => x.kind), ['golden', 'finalGoal', 'shootout', 'haul', 'scorcher'], 'the later match hasn\'t aired');
  const g = out[0];
  assert.equal(g.moment, day + 7200 * S + 2000 * S);
  assert.equal(g.at, g.moment - settings.leadSeconds.golden * S, 'a lead-in before the moment');
  assert.equal(g.seconds, settings.leadSeconds.golden + settings.tailSeconds.golden);
  assert.match(g.label, /^S2 R3 · H 1-0 A · 34' GOLDEN GOAL · P\. p4$/);
  assert.match(out[2].label, /SHOOTOUT, THE DECIDING KICK 4-3 · P\. p5/);
  assert.match(out[3].label, /FIVE GOALS · P\. p9/);
  assert.equal(out.filter((x) => x.kind === 'scorcher').length, 1, 'a plain goal isn\'t listed');
});

test('ffmpeg\'s arguments: wide at 1920 × 1080; tall at 1080 × 1920 with the title above and the address below; the start trimmed', () => {
  const wide = clipArgs({ input: 'in.webm', output: 'out.mp4', tall: false, titleFile: null, trim: 1 });
  assert.deepEqual(wide.slice(0, 6), ['-y', '-v', 'error', '-ss', '1', '-i']);
  assert.match(wide[wide.indexOf('-vf') + 1], /^scale=1920:1080:force_original_aspect_ratio=decrease.*pad=1920:1080/);
  assert.ok(wide.includes('libx264') && wide.includes('+faststart') && wide.at(-1) === 'out.mp4');
  const tall = clipArgs({ input: 'in.webm', output: 'out.mp4', tall: true, titleFile: 'output/clips/title.txt', trim: 0.5 });
  const graph = tall[tall.indexOf('-filter_complex') + 1];
  assert.match(graph, /color=c=0x151924:s=1080x1920/, 'the panel colour behind');
  assert.match(graph, /scale=1080:608/, 'the whole 16:9 picture across the width');
  assert.match(graph, /textfile=output\/clips\/title\.txt/, 'the title from its file, a relative path');
  assert.match(graph, /text=SCORCHBALL\.TV:fontcolor=0xff8f1c/, 'the address in the accent');
  assert.ok(tall.includes('0:a?'), 'the sound kept if there is any');
  assert.ok(!clipArgs({ input: 'i', output: 'o', tall: true, titleFile: null, trim: 0 })[5 + 2].includes('textfile'));
});

test('the vertical camera eases after the ball, keeps inside its bounds, holds still when held, centres without a ball', async () => {
  const { followBounds, followStep } = await import('../src/channel/followCam.js');
  const pitch = { x: 18, y: 46, w: 358, h: 179 };
  const b = followBounds('full', pitch, { w: 480, h: 270 });
  assert.deepEqual(b, { x0: 10, x1: 384, y0: 16, y1: 239 });
  const half = { w: 40, h: 50 };
  const ease = { x: 0.45, y: 0.7 };
  const cam = { x: 200, y: 130, nudgeX: 0, nudgeY: 0, held: false };
  // A second of frames toward a ball at (300, 140): most of the way there, never past it.
  for (let i = 0; i < 60; i++) followStep(cam, { x: 300, y: 140 }, b, half, 1 / 60, ease);
  assert.ok(cam.x > 280 && cam.x < 300, `x ${cam.x}`);
  // A ball by the corner flag: the window stops at the bounds' edge.
  for (let i = 0; i < 600; i++) followStep(cam, { x: 384, y: 239 }, b, half, 1 / 60, ease);
  assert.deepEqual([Math.round(cam.x), Math.round(cam.y)], [384 - 40, 239 - 50]);
  // Held: the ball moves, the camera doesn't.
  cam.held = true;
  followStep(cam, { x: 50, y: 60 }, b, half, 1, ease);
  assert.deepEqual([Math.round(cam.x), Math.round(cam.y)], [344, 189]);
  // No ball (a card, the studio): back to the middle; a nudge moves the target.
  Object.assign(cam, { held: false, nudgeX: 12, nudgeY: 0 });
  for (let i = 0; i < 600; i++) followStep(cam, null, b, half, 1 / 60, ease);
  assert.deepEqual([Math.round(cam.x), Math.round(cam.y)], [Math.round((10 + 384) / 2 + 12), Math.round((16 + 239) / 2)]);
  // Broadcast may look anywhere on the picture; a window wider than the room sits in its middle.
  assert.deepEqual(followBounds('broadcast', pitch, { w: 480, h: 270 }), { x0: 0, x1: 480, y0: 0, y1: 270 });
  const wide = followStep({ x: 0, y: 0, nudgeX: 0, nudgeY: 0, held: true }, null, b, { w: 500, h: 50 }, 0, ease);
  assert.equal(wide.x, (10 + 384) / 2);
});
