import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guilders } from '../src/channel/money.js';

test('guilders: ƒ4.2M from a million up, ƒ850K below (Task 234)', () => {
  assert.equal(guilders(4200), 'ƒ4.2M');
  assert.equal(guilders(20000), 'ƒ20.0M');
  assert.equal(guilders(1000), 'ƒ1.0M');
  assert.equal(guilders(850), 'ƒ850K');
  assert.equal(guilders(27.4), 'ƒ27K');
});
