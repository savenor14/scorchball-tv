// Playoff grounds (Task 117; docs/channel.md §17.3): what marks each stage's ground (Tom's picks).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playoffMarks } from '../src/channel/playoffArt.js';

test('the regular season is unmarked; SEMIFINALS on the pitch; FINALS with gold boards (no trophy, Tom)', () => {
  assert.equal(playoffMarks('regular'), null);
  assert.equal(playoffMarks(undefined), null);
  assert.deepEqual(playoffMarks('semifinal'), { words: 'SEMIFINALS', trophy: false, boards: false });
  assert.deepEqual(playoffMarks('final'), { words: 'FINALS', trophy: false, boards: true });
});
