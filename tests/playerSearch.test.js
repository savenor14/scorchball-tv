import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPlayers } from '../src/channel/playerSearch.js';

const line = (teamId, appearances) => ({ totals: { appearances }, seasons: { 1: { regular: { teamId } } } });
const chronicle = { players: new Map([
  ['p1', line('t-gulls', 29)], ['p2', line('t-gulls', 40)], ['p3', line('t-royale', 12)], ['p4', line('t-rime', 3)],
]) };
const league = { players: {
  p1: { firstName: 'Kerra', lastName: 'Penhallow', teamId: null, status: 'retired' },
  p2: { firstName: 'Endelyn', lastName: 'Penhaligon', teamId: 't-gulls', status: 'active' },
  p3: { firstName: 'Noemi', lastName: 'Carpentier', teamId: null, status: 'active' },
  p4: { firstName: 'Ana', lastName: 'Opens', teamId: 't-rime', status: 'active' },
} };
const opts = { minLetters: 3, shown: 2 };

test('FIND A PLAYER: nothing until three letters, then any part of a name, the most-played first, and N more', () => {
  assert.equal(findPlayers(chronicle, league, '  ', opts).state, 'empty');
  assert.equal(findPlayers(chronicle, league, 'pe', opts).state, 'short');
  const r = findPlayers(chronicle, league, 'PEN', opts);
  assert.equal(r.state, 'hits');
  assert.deepEqual(r.hits.map((h) => h.id), ['p2', 'p1']);
  assert.equal(r.more, 2);
  assert.equal(findPlayers(chronicle, league, 'zzz', opts).state, 'none');
});

test('FIND A PLAYER: each match its short name, its club now or its last, and whether retired or a free agent', () => {
  const { hits } = findPlayers(chronicle, league, 'pen', { minLetters: 3, shown: 6 });
  assert.deepEqual(hits.find((h) => h.id === 'p1'), { id: 'p1', name: 'K. Penhallow', teamId: 't-gulls', status: 'retired' });
  assert.deepEqual(hits.find((h) => h.id === 'p3'), { id: 'p3', name: 'N. Carpentier', teamId: 't-royale', status: 'free' });
  assert.equal(hits.find((h) => h.id === 'p2')?.status, 'team');
});
