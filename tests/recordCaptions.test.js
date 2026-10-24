// A record broken on air (Task 220b): the live league knows a match's records from its kick-off (live.records, ahead of
// the screen), and the record caption takes the caption bar after the goal's caption, gold, for captions.recordMs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionAt, recordCaptions } from '../src/channel/captions.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const { captions } = config.settings;
const ctx = { playerName: (/** @type {string} */ id) => id, teamName: (/** @type {string} */ id) => id, captions };

// Build on to the start of season 10 to find a goal record in a regular-season match (records count from season 5).
// The live seed (flareball) has goal records from season 9 on (since the rookie rule, Task 230); assert below that one was found.
const scan = new LiveLeague(config, { now: calendar.seasonStart(10), seed: 'flareball' });
const goalRecord = scan.records.broken.find((r) => r.stat === 'goals' && scan.chronicle.matches.get(r.matchId)?.stage === 'regular');

test('the live league\'s record watch agrees with the chronicle, and knows a match\'s records before it has aired', () => {
  assert.ok(scan.records.broken.length > 0);
  assert.ok(goalRecord, 'a goal record to test with');
  // Everything up to season 9 has aired: the same records.
  const aired = scan.chronicle.recordsBroken.filter((r) => r.season <= 9);
  assert.deepEqual(scan.records.broken.filter((r) => r.season <= 9), aired);
  for (const r of scan.records.broken) assert.ok(r.season >= config.chronicle.history.recordsFrom);
});

test('a goal record: its caption after the goal\'s, then gone; none in a match without one', { skip: !goalRecord }, () => {
  const r = /** @type {import('../src/chronicle/chronicle.js').RecordBroken} */ (goalRecord);
  const slot = calendar.slots(r.season)[scan.chronicle.season(r.season).matchIds.indexOf(r.matchId)];
  // At its kick-off: the chronicle doesn't have it yet, the record watch does.
  const live = new LiveLeague(config, { now: slot.kickoff + 1, seed: 'flareball' });
  const m = /** @type {import('../src/channel/liveLeague.js').LiveMatch} */ (live.matches.get(r.matchId));
  assert.ok(!live.chronicle.matches.has(m.id));
  const broken = live.records.inMatch(m.id);
  assert.ok(broken.some((b) => b.stat === 'goals' && b.playerId === r.playerId));
  const tl = createTimeline(m, config);
  const recs = recordCaptions(broken, tl, ctx);
  const rec = /** @type {import('../src/channel/captions.js').RecordCaption} */ (recs.find((x) => x.detail.startsWith(r.playerId)));
  assert.ok(rec, 'a caption for it');
  assert.match(rec.title, /^(ALL-TIME|SEASON) RECORD$/);
  assert.match(rec.detail, r.scope === 'career' ? /career goals, passing / : /goals this season, past .*'s \d+ \(S\d+\)$/);
  // The goal that broke it shows its own caption first, then the record's for recordMs.
  const goal = /** @type {any} */ (tl.events.find((x) => x.at === rec.at - captions.goalMs && x.event.type === 'goal'));
  assert.ok(goal, 'the record comes the goal caption\'s length after a goal');
  const withRecords = { ...ctx, records: recs };
  assert.match(String(captionAt(tl, goal.at + 100, withRecords)?.kind), /goal|scorcher/);
  assert.equal(captionAt(tl, rec.at + 100, withRecords)?.kind, 'record');
  assert.notEqual(captionAt(tl, rec.at + captions.recordMs + 100, withRecords)?.kind, 'record');
  // Without the records (highlights): no record caption.
  assert.notEqual(captionAt(tl, rec.at + 100, ctx)?.kind, 'record');
});
