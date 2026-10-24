import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMatch, breakawayWindows, cellOf, emptyMap, firstMatches, formatTarget, GRID, inCorner, measures, meets } from '../src/channel/pitchmap.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const keeperSlot = config.positions.keeper;
const [m] = firstMatches(config, 'pitchmap-tests', 1);

test('cells: sixths along and quarters across, the edges kept inside', () => {
  assert.equal(cellOf(0, 0), 0);
  assert.equal(cellOf(1, 1), GRID.along * GRID.across - 1);
  assert.equal(cellOf(0.5, 0.3), 3 * GRID.across + 1);
  assert.ok(inCorner(0.9, 0.1) && inCorner(0.05, 0.9));
  assert.ok(!inCorner(0.9, 0.5) && !inCorner(0.5, 0.1));
});

test('breakaway windows run from the breakaway to what ends it', () => {
  const ev = m.timeline.events;
  for (const [from, to] of breakawayWindows(m.timeline)) {
    assert.ok(to >= from);
    assert.ok(ev.some((t) => t.at === from && t.event.type === 'advance' && /** @type {any} */ (t.event.data)?.breakaway));
  }
});

test('a match adds up: every sample in one cell, shares between 0 and 1, the same every time', () => {
  const map = addMatch(emptyMap(), m.timeline, m.motion, { homeId: m.homeId, keeperSlot });
  assert.equal(map.matches, 1);
  assert.ok(map.samples > 1000);
  assert.equal(map.ball.reduce((s, v) => s + v, 0), map.samples);
  // Ten players a sample (keepers included in their grids).
  const placed = Object.values(map.players).flat().reduce((s, v) => s + v, 0);
  assert.equal(placed, 10 * map.samples);
  const ms = measures(map, config.settings.play.tether);
  for (const [k, v] of Object.entries(ms)) if (k !== 'worstGap' && k !== 'breakawaysPerMatch' && k !== 'loosePerMatch') assert.ok(v >= 0 && v <= 1, `${k} ${v}`);
  assert.ok(ms.playersY5 < ms.playersY95);
  assert.deepEqual(measures(addMatch(emptyMap(), m.timeline, m.motion, { homeId: m.homeId, keeperSlot }), config.settings.play.tether), ms);
});

test('targets: met, missed, or none; formatted for the report', () => {
  assert.equal(meets('wide', 0.31), true);
  assert.equal(meets('wide', 0.2), false);
  assert.equal(meets('cornerAttacking', 0.08), false);
  assert.equal(meets('far', 0.5), null);
  assert.equal(formatTarget('cornerAttacking'), '5%–7.5%');
  assert.equal(formatTarget('middleThird'), '≤ 50%');
});
