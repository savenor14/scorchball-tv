// The channel on a phone (phones, step 4; src/channel/phone.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buttonHeight, isPhone, phoneBands } from '../src/channel/phone.js';

test('a phone is a touch screen with a short side of 500 CSS px or less; ?phone= decides either way', () => {
  assert.equal(isPhone({ coarse: true, screenW: 360, screenH: 804 }, null), true);
  assert.equal(isPhone({ coarse: true, screenW: 804, screenH: 360 }, null), true);
  assert.equal(isPhone({ coarse: true, screenW: 800, screenH: 1280 }, null), false, 'a tablet');
  assert.equal(isPhone({ coarse: false, screenW: 1366, screenH: 768 }, null), false, 'a desktop');
  assert.equal(isPhone({ coarse: false, screenW: 400, screenH: 700 }, null), false, 'a small window with a mouse');
  assert.equal(isPhone({ coarse: false, screenW: 1920, screenH: 1080 }, true), true);
  assert.equal(isPhone({ coarse: true, screenW: 360, screenH: 804 }, false), false);
});

test('Broadcast has sound and the layout; Full adds INFO and AUDIENCE on the left and the side panel and panes on the right', () => {
  assert.deepEqual(phoneBands('broadcast', { fullscreen: true }), { left: { top: ['sound', 'levels'], bottom: ['fullscreen', 'layout'] }, right: [] });
  const full = phoneBands('full', { fullscreen: false });
  assert.deepEqual(full.left, { top: ['sound', 'levels', 'info', 'audience'], bottom: ['layout'] });
  assert.deepEqual(full.right, ['stats', 'table', 'top', 'week', 'guide', 'rulebook', 'chronicle']);
});

test('buttons as tall as fit in a band, within limits', () => {
  // Chrome sideways on Tom's phone: 272 px for seven buttons.
  assert.equal(buttonHeight(272, 7), 37);
  assert.equal(buttonHeight(360, 7), 48);
  assert.equal(buttonHeight(200, 7), 32);
  assert.equal(buttonHeight(272, 0), 48);
});
