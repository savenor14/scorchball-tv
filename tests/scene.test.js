// The scene between matches (Task 96; docs/channel.md §16.1): the light bars, pure and seeded, looping, in the right
// place for each layout, and on exactly the segments between matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { sceneRect, sceneState, showsScene } from '../src/channel/scene.js';
import { GROUND } from '../src/channel/stands.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const s = config.settings.scene;
const R = { x: 0, y: 0, w: 480, h: 270 };

test('the same moment always draws the same scene; the twinkles are seeded and inside it', () => {
  const a = sceneState(s, R, 123_456);
  const b = sceneState(s, R, 123_456);
  assert.deepEqual(a, b);
  assert.equal(a.sparkles.length, s.sparkles);
  for (const p of a.sparkles) {
    assert.ok(p.x >= 0 && p.x <= R.w && p.y >= 0 && p.y <= R.h);
    assert.ok(p.b >= 0 && p.b <= 1);
  }
  assert.notDeepEqual(sceneState(s, R, 0).bars, sceneState(s, R, 5000).bars, 'it moves');
});

test('each bar slides right and comes round again seamlessly, never jumping on screen', () => {
  const lean = R.h * s.slope;
  s.bars.forEach((bar, i) => {
    const period = R.w + lean + bar.w + 60;
    const loop = (period / bar.speed) * 1000;
    const at = (/** @type {number} */ t) => sceneState(s, R, t).bars[i].x;
    assert.ok(Math.abs(at(1000) - at(1000 + loop)) < 1e-6, `bar ${i} loops`);
    // Where it wraps, it's off screen on both sides of the jump: past the right edge before, left of the left after.
    for (let t = 0; t < loop; t += 200) {
      const x0 = at(t);
      const x1 = at(t + 200);
      if (x1 < x0) {
        // The bar's leftmost pixel is its bottom row (x), its rightmost the top row's end (x + lean + w).
        assert.ok(x0 >= R.w, `bar ${i} has left past the right edge before it wraps`);
        assert.ok(x1 + lean + bar.w <= bar.speed * 0.2 + 1, `bar ${i} comes back from beyond the left edge`);
      }
    }
  });
});

test('the orange line sits at lineAt and the run moves along it', () => {
  assert.equal(sceneState(s, R, 0).line, Math.round(R.h * s.lineAt));
  assert.ok(sceneState(s, R, 1000).run > sceneState(s, R, 0).run);
});

test('where it goes: over the ground in Full, the whole screen in Broadcast, sliding between them', () => {
  assert.deepEqual(sceneRect(0), { x: 0, y: GROUND.top, w: GROUND.w, h: GROUND.bottom - GROUND.top });
  assert.deepEqual(sceneRect(1), { x: 0, y: 0, w: 480, h: 270 });
  const mid = sceneRect(0.5);
  assert.ok(mid.w > GROUND.w && mid.w < 480 && mid.y < GROUND.top && mid.y > 0);
});

test('on screen exactly between matches: talk, cards, ads, the opening, the champions, the off-season', () => {
  const calendar = createCalendar(config);
  const from = calendar.instant(1, 1440);
  const live = new LiveLeague(config, { now: from, seed: 'scene-tests' });
  /** @type {Map<string, any>} */
  const tls = new Map();
  const programme = createProgramme(live, (m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id));
  /** @type {Record<string, boolean>} */
  const seen = {};
  for (let t = from; t < from + 6 * 3600_000; t += 15_000) {
    live.advanceTo(t);
    const seg = programme.at(t);
    // (OFF THE BALL's day's goals play on the booth's screen: the scene's, as its talk.)
    const key = seg.kind === 'reair' ? `reair:${seg.part}` : seg.kind === 'highlights' && seg.podcast ? 'talk' : seg.kind;
    const on = showsScene(seg);
    if (key in seen) assert.equal(seen[key], on, `${key} always the same`);
    seen[key] = on;
  }
  for (const k of ['talk', 'studio', 'ads']) assert.equal(seen[k], true, `${k} shows the scene`);
  for (const k of ['live', 'pre_match', 'walk_out', 'handshakes', 'full_time', 'highlights', 'potm', 'reair:match', 'reair:full_time']) {
    if (k in seen) assert.equal(seen[k], false, `${k} doesn't`);
  }
  assert.equal(showsScene(/** @type {any} */ ({ kind: 'champion' })), true);
  // The opening ident draws its own (dimmed) light bars, with a band cutting into and out of it (Task 106).
  assert.equal(showsScene(/** @type {any} */ ({ kind: 'ident' })), false);
});
