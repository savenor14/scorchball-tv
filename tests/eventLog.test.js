import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventLog, memorySink, parseJsonLines, toJsonLine } from '../src/chronicle/eventLog.js';
import { createJsonlFileSink } from '../src/cli/jsonlFileSink.js';

const goal = {
  season: 3, stage: 'regular', round: 7, matchId: 's3-r7-m2', clock: 734,
  type: 'goal', teamId: 't-gulls', playerId: 'p-000231', data: { assistId: 'p-000198', scorcher: true, score: [3, 2] },
};

test('events get the full record shape in a fixed field order', () => {
  const event = new EventLog().append(goal);
  assert.equal(
    JSON.stringify(event),
    '{"v":1,"seq":1,"season":3,"stage":"regular","round":7,"matchId":"s3-r7-m2","clock":734,"type":"goal",'
      + '"teamId":"t-gulls","playerId":"p-000231","data":{"assistId":"p-000198","scorcher":true,"score":[3,2]}}',
  );
});

test('optional fields default to null and data to {}', () => {
  const event = new EventLog().append({ season: 1, stage: 'offseason', type: 'draft_lottery' });
  assert.deepEqual(
    { round: event.round, matchId: event.matchId, clock: event.clock, teamId: event.teamId, playerId: event.playerId, data: event.data },
    { round: null, matchId: null, clock: null, teamId: null, playerId: null, data: {} },
  );
});

test('seq increases by one per event and can continue an existing log', () => {
  const log = new EventLog();
  assert.deepEqual([log.append(goal).seq, log.append(goal).seq, log.append(goal).seq], [1, 2, 3]);
  assert.equal(log.lastSeq, 3);
  assert.equal(new EventLog({ lastSeq: 500 }).append(goal).seq, 501);
});

test('events are frozen, including data, and copied from the input', () => {
  const data = { scorcher: true };
  const event = new EventLog().append({ ...goal, data });
  assert.ok(Object.isFrozen(event) && Object.isFrozen(event.data));
  data.scorcher = false;
  assert.equal(event.data.scorcher, true);
});

test('every sink receives every event in order', () => {
  const a = memorySink();
  const b = memorySink();
  const log = new EventLog({ sinks: [a.sink] });
  log.addSink(b.sink);
  log.append(goal);
  log.append({ ...goal, type: 'save' });
  assert.deepEqual(a.events.map((e) => e.seq), [1, 2]);
  assert.deepEqual(b.events, a.events);
});

test('scoped() fills in shared context', () => {
  const { events, sink } = memorySink();
  const emit = new EventLog({ sinks: [sink] }).scoped({ season: 2, stage: 'final', matchId: 's2-f' });
  emit('kickoff', { clock: 0, teamId: 't-a' });
  emit('goal', { clock: 61, teamId: 't-a', playerId: 'p-1', data: { scorcher: false } });
  assert.deepEqual(events.map((e) => [e.season, e.stage, e.round, e.matchId, e.type, e.clock]), [
    [2, 'final', null, 's2-f', 'kickoff', 0],
    [2, 'final', null, 's2-f', 'goal', 61],
  ]);
});

test('invalid events are rejected with a clear message and do not use up a seq', () => {
  const log = new EventLog();
  const bad = [
    [{ ...goal, type: 'gaol' }, /unknown type "gaol"/],
    [{ ...goal, player: 'p-1' }, /unknown field "player"/],
    [{ ...goal, season: 0 }, /season must be/],
    [{ ...goal, stage: 'playoffs' }, /stage must be one of/],
    [{ ...goal, round: 0 }, /round must be/],
    [{ ...goal, matchId: null }, /match events need a matchId/],
    [{ ...goal, clock: -1 }, /match events need a clock/],
    [{ season: 1, stage: 'offseason', type: 'retirement', clock: 5 }, /league events must not have a matchId or clock/],
    [{ ...goal, data: [1] }, /data must be an object/],
  ];
  for (const [input, message] of bad) assert.throws(() => log.append(/** @type {any} */ (input)), message);
  assert.equal(log.lastSeq, 0);
});

test('JSONL round-trips and reports bad line numbers', () => {
  const log = new EventLog();
  const events = [log.append(goal), log.append({ season: 3, stage: 'offseason', type: 'retirement', playerId: 'p-9' })];
  const text = events.map(toJsonLine).join('');
  assert.deepEqual(parseJsonLines(`${text}\n`), events);
  assert.throws(() => parseJsonLines(`${text}{oops\n`), /^SyntaxError: Line 3:/);
});

test('the file sink writes every event as JSONL, across buffer flushes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sim-league-'));
  try {
    const path = join(dir, 'run', 'events.jsonl');
    const file = createJsonlFileSink(path, { bufferLines: 3 });
    const log = new EventLog({ sinks: [file.sink] });
    for (let i = 0; i < 10; i++) log.append({ ...goal, clock: i });
    file.close();
    const events = parseJsonLines(readFileSync(path, 'utf8'));
    assert.deepEqual(events.map((e) => e.seq), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.throws(() => log.append(goal), /after .* was closed/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
