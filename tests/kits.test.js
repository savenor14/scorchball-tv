import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colourDistance, matchKits } from '../src/channel/kits.js';

const red = { primary: '#D62D2D', secondary: '#F0D9A0' };
const orange = { primary: '#E8641E', secondary: '#2F2F35' };
const blue = { primary: '#1B2F5E', secondary: '#8FD3F4' };

test('colour distance runs from 0 for the same colour to about 442 for black against white', () => {
  assert.equal(colourDistance('#123456', '#123456'), 0);
  assert.equal(Math.round(colourDistance('#000000', '#FFFFFF')), 442);
  assert.equal(colourDistance('#ff0000', '#000000'), 255);
});

test('distinct kits are left alone', () => {
  const kits = matchKits(red, blue, 80);
  assert.equal(kits.awayChanged, false);
  assert.deepEqual(kits.away, blue);
  assert.deepEqual(kits.home, red);
});

test('a clash puts the away team in its secondary, with its primary as trim', () => {
  const kits = matchKits(red, orange, 80);
  assert.equal(kits.awayChanged, true);
  assert.deepEqual(kits.away, { primary: '#2F2F35', secondary: '#E8641E' });
  assert.deepEqual(kits.home, red);
  assert.ok(kits.distance < 80);
});

test('the threshold decides, and the away team never changes into something closer', () => {
  assert.equal(matchKits(red, orange, 10).awayChanged, false);
  const lookalike = { primary: '#D83030', secondary: '#D62D2E' }; // its change kit is even closer to red
  assert.equal(matchKits(red, lookalike, 80).awayChanged, false);
});
