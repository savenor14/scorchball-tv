import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLayout } from '../src/channel/layout.js';
import { awayCorner, bowlAreas, crowdLayout, GROUND_TURF } from '../src/channel/stands.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { shiftPx, slideMs } = config.settings.broadcast;

test('the layout: starts in Full, slides smoothly to Broadcast and back, and a switch mid-slide carries on from where it is', () => {
  const layout = createLayout({ slideMs });
  assert.equal(layout.mode, 'full');
  assert.equal(layout.progress(0), 0);
  layout.toggle(1000);
  assert.equal(layout.mode, 'broadcast');
  assert.equal(layout.progress(1000), 0);
  let prev = 0;
  for (let t = 1000; t <= 1000 + slideMs; t += 10) {
    const p = layout.progress(t);
    assert.ok(p >= prev && p - prev < 0.06, `smooth at ${t}`);
    prev = p;
  }
  assert.equal(layout.progress(1000 + slideMs + 1), 1);
  // Back again halfway through: no jump.
  const mid = 2000 + slideMs / 2;
  layout.toggle(2000);
  const before = layout.progress(mid);
  layout.toggle(mid);
  assert.equal(layout.progress(mid), before, 'no jump when switching mid-slide');
  assert.equal(layout.progress(mid + slideMs + 1), 1);
});

test('the bowl: stands all round the centred ground, never on it; the away end by the away dugout, and a few away groups elsewhere', () => {
  const areas = bowlAreas(shiftPx);
  // The ground (394 px wide, from y 23 to 236) moved right by shiftPx is left clear.
  for (const a of areas) {
    const overlapsX = a.x < shiftPx + 394 && a.x + a.w > shiftPx;
    const overlapsY = a.y < 236 && a.y + a.h > 23;
    assert.ok(!(overlapsX && overlapsY), `stand ${JSON.stringify(a)} over the ground`);
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= 480 && a.y + a.h <= 270);
  }
  assert.equal(shiftPx * 2 + 394, 480, 'the ground is centred');
  const colours = { home: { primary: '#d62d2d', secondary: '#ffffff' }, away: { primary: '#1fa3a3', secondary: '#f5f5f0' } };
  const corner = awayCorner(shiftPx, 254);
  const fans = crowdLayout(areas, colours, 't-sunhawks', { away: corner });
  assert.deepEqual(crowdLayout(areas, colours, 't-sunhawks', { away: corner }), fans, 'the same crowd every time');
  const away = fans.filter((f) => f.side === 'away');
  const home = fans.filter((f) => f.side === 'home');
  assert.ok(home.length > away.length * 2, 'mostly home fans');
  const inCorner = (/** @type {{ x: number, y: number }} */ f) => corner.some((r) => f.x >= r.x && f.x < r.x + r.w && f.y - 2 >= r.y && f.y - 2 < r.y + r.h);
  assert.ok(away.filter(inCorner).length > away.length / 2, 'most away fans in the corner by the away dugout');
  assert.ok(away.some((f) => !inCorner(f)), 'and a few elsewhere');
  for (const f of fans) assert.ok(areas.some((a) => f.x >= a.x && f.x < a.x + a.w && f.y > a.y && f.y <= a.y + a.h), 'every fan in a stand');
  // Under the ground the turf (Task 72) takes the gap below the apron and the stand's top two rows; the corners keep
  // their full stand, five rows, and three rows stay under the turf. No fans on the turf.
  const turf = { ...GROUND_TURF, x: GROUND_TURF.x + shiftPx };
  assert.ok(turf.w === 394 && turf.y < 236 && turf.y + turf.h <= 270);
  const rowsIn = (/** @type {(x: number) => boolean} */ where) => new Set(fans.filter((f) => f.y > 236 && where(f.x)).map((f) => f.y)).size;
  assert.equal(rowsIn((x) => x < shiftPx), 5);
  assert.equal(rowsIn((x) => x > shiftPx + 2 && x < shiftPx + 392), 3);
  assert.ok(fans.every((f) => !(f.x >= turf.x && f.x < turf.x + turf.w && f.y - 4 < turf.y + turf.h && f.y > turf.y)), 'nothing on the turf');
});
