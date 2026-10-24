// The tour (Milestone 5⅞): where a step's box goes, and that it's offered only once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { BOX_WIDTH, PHONE_BOX, TOUR_KEY, markOffered, placeBox, placePhoneBox, tourOffered, tourSteps, union } from '../src/channel/tour.js';

test('a step\'s box goes below what it points at, above it near the bottom, beside something tall, always on the stage', () => {
  const scorebug = { left: 0, top: 0, right: 158, bottom: 19 };
  const below = placeBox(scorebug, 50);
  assert.equal(below.arrow, 'up');
  assert.equal(below.top, 27);
  assert.ok(below.left >= 4);
  const button = { left: 450, top: 240, right: 462, bottom: 254 };
  const above = placeBox(button, 50);
  assert.equal(above.arrow, 'down');
  assert.equal(above.top, 240 - 8 - 50);
  assert.ok(above.left + BOX_WIDTH <= 476, 'kept on the stage');
  assert.ok(above.arrowAt > 0 && above.arrowAt < BOX_WIDTH, 'the arrow on the box');
  const side = placeBox(union([{ left: 394, top: 0, right: 480, bottom: 20 }, { left: 394, top: 20, right: 480, bottom: 238 }]), 60);
  assert.equal(side.arrow, 'right');
  assert.equal(side.left, 394 - BOX_WIDTH - 8);
});

test('the tour is offered once: taken, finished or turned down, it\'s remembered; with storage blocked it\'s offered again', () => {
  /** @type {Map<string, string>} */
  const mem = new Map();
  const storage = /** @type {any} */ ({ getItem: (/** @type {string} */ k) => mem.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => mem.set(k, v) });
  assert.equal(tourOffered(storage), false);
  markOffered(storage, 'declined');
  assert.equal(tourOffered(storage), true);
  assert.equal(mem.get(TOUR_KEY), 'declined');
  const blocked = /** @type {any} */ ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  assert.equal(tourOffered(blocked), false);
  assert.doesNotThrow(() => markOffered(blocked, 'taken'));
  assert.equal(tourOffered(null), false);
});

test('every step points at something the channel has, MOMENTS\' with the example ticket; Fan Coins\' only while they\'re on', async () => {
  const config = await loadConfigFromDisk();
  const desk = (/** @type {boolean} */ coins) => tourSteps(config.tour, { phone: false, coins });
  assert.deepEqual(desk(false).map((/** @type {any} */ s) => s.target), ['scorebug', 'layout', 'side', 'schedule', 'audience', 'info']);
  assert.deepEqual(desk(true).map((/** @type {any} */ s) => s.title), ['THE SCOREBUG', 'FULL OR BROADCAST', 'THE SIDE PANEL', "WHAT'S ON", 'MOMENTS', 'FAN COINS', "THAT'S IT"]);
  assert.equal(desk(true).find((/** @type {any} */ s) => s.notice)?.title, 'MOMENTS');
});

test('a phone has its own fewer steps, pointing at its buttons, with no keys named', async () => {
  const config = await loadConfigFromDisk();
  const phone = (/** @type {boolean} */ coins) => tourSteps(config.tour, { phone: true, coins });
  assert.deepEqual(phone(false).map((/** @type {any} */ s) => s.target), ['scorebug', 'buttons', 'audience', 'close']);
  assert.deepEqual(phone(true).map((/** @type {any} */ s) => s.title), ['THE SCOREBUG', 'THE BUTTONS', 'MOMENTS', 'FAN COINS', "THAT'S IT"]);
  for (const s of phone(true)) assert.doesNotMatch(s.text, /\([A-Z]\)/, `${s.title} names no key`);
});

test('on a phone the box goes over the picture beside what it points at: left of the right band, right of the left, below the scorebug', () => {
  const pic = { left: 122, top: 0, right: 605, bottom: 272 };
  const w = 260;
  const right = placePhoneBox({ left: 605, top: 0, right: 728, bottom: 272 }, pic, w, 150);
  assert.equal(right.arrow, 'right');
  assert.equal(right.left, 605 - w - PHONE_BOX.gap);
  assert.equal(right.top, 61, 'level with its middle');
  const audience = placePhoneBox({ left: 25, top: 150, right: 97, bottom: 187 }, pic, w, 170);
  assert.equal(audience.arrow, 'left');
  assert.equal(audience.left, 122 + PHONE_BOX.gap);
  assert.ok(audience.top + 170 <= 272 - PHONE_BOX.edge, 'kept on the picture');
  assert.ok(audience.arrowAt > 0 && audience.arrowAt < 170, 'the arrow on the box');
  const bug = placePhoneBox({ left: 122, top: 0, right: 280, bottom: 19 }, pic, w, 150);
  assert.equal(bug.arrow, 'up');
  assert.equal(bug.top, 19 + PHONE_BOX.below);
  assert.ok(bug.left >= pic.left && bug.left + w <= pic.right);
});
