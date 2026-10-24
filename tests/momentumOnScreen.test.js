// momentum on screen (Task 238; src/channel/momentum.js): who has it at a moment of the picture, how much is left.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { firstMatches } from '../src/channel/pitchmap.js';
import { momentumAt } from '../src/channel/momentum.js';

const config = await loadConfigFromDisk();
const seconds = config.rules.momentum.seconds;

test('momentum from its event: full as it is gained, fading with the clock, gone at the next kick-off or once faded', () => {
  let seen = 0;
  for (const m of firstMatches(config, 'momentum-screen', 6)) {
    const tl = m.timeline;
    for (const x of tl.events.filter((t) => t.event.type === 'momentum')) {
      const mo = momentumAt(tl, x.at, seconds);
      assert.ok(mo, 'momentum shown as it is gained');
      assert.equal(mo.teamId, x.event.teamId);
      assert.ok(mo.left > 0.95 && mo.left <= 1, `left ${mo.left}`);
      assert.ok(mo.since >= 0);
      const later = momentumAt(tl, x.at + 15_000, seconds);
      if (later && later.teamId === mo.teamId) assert.ok(later.left <= mo.left);
      seen++;
    }
    // Nobody has it before the first kick-off's first momentum, nor after the final whistle.
    assert.equal(momentumAt(tl, 0, seconds), null);
    assert.equal(momentumAt(tl, tl.duration + 1, seconds), null);
  }
  assert.ok(seen > 10, `${seen} momentum events`);
});

test('a scorcher\'s momentum is shown from its goal, through the celebration, as a burn\'s is; the rings once', () => {
  let seen = 0;
  for (const m of firstMatches(config, 'momentum-screen', 6)) {
    const tl = m.timeline;
    for (const x of tl.events.filter((t) => t.event.type === 'momentum' && /** @type {any} */ (t.event.data).cause === 'scorcher')) {
      const goal = tl.events.findLast((t) => t.event.type === 'goal' && t.event.clock === x.event.clock && t.at <= x.at);
      assert.ok(goal, 'its goal');
      if (goal.at === x.at) continue;
      // Just after the goal, in the celebration: already shown, full, the rings starting from the goal.
      const during = momentumAt(tl, goal.at + 100, seconds);
      assert.ok(during && during.teamId === x.event.teamId, 'shown in the celebration');
      assert.ok(during.left > 0.99);
      assert.ok(Math.abs(during.since - 100) < 1);
      // At the restart, the same momentum, still timed from the goal (the rings don't start again).
      const restart = momentumAt(tl, x.at, seconds);
      assert.ok(restart && restart.since >= x.at - goal.at - 1, `since ${restart?.since}`);
      seen++;
    }
  }
  assert.ok(seen > 2, `${seen} scorchers`);
});
