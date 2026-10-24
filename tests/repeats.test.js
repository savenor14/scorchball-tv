// How soon voiced lines come round again (Task 257; src/channel/repeats.js, npm run repeats).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countRepeats } from '../src/channel/repeats.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { days, groups } = countRepeats(config, config.settings.live.seed, 2);
const group = (/** @type {string} */ voice, /** @type {string} */ name) => groups.find((g) => g.voice === voice && g.group === name);

test('Task 257: every voice counted over the season, soonest first', () => {
  assert.equal(days, 7);
  for (const voice of ['desk', 'commentary', 'interview']) assert.ok(groups.some((g) => g.voice === voice), voice);
  for (let i = 1; i < groups.length; i++) assert.ok(groups[i - 1].hoursBetween <= groups[i].hoursBetween);
  assert.ok(/** @type {any} */ (group('commentary', 'tackle')).perMatch > 0);
});

test('Task 257: the opening never says the same line two days running (each kind dealt a day at a time)', () => {
  for (const kind of ['welcomeHello', 'welcomeToday', 'welcomeLeader']) {
    const g = /** @type {any} */ (group('desk', kind));
    assert.ok(g.soonestHours > 48, `${kind}: heard again after ${g.soonestHours.toFixed(1)} h`);
  }
});
