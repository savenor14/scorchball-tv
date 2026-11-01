import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { commentaryCalls } from '../src/channel/commentary.js';
import { crowdCues } from '../src/channel/crowd.js';
import { createTimeline } from '../src/channel/timeline.js';
import { eventCues } from '../src/channel/sounds.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();

/** The first shootout a league plays. */
/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId)).push(e); }] });
const league = createLeague(config, 'shootout-show', log);
/** @type {any} */
let match = null;
for (let s = 0; s < 60 && !match; s++) {
  runOffseason(league, config, log, runSeason(league, config, log));
  for (const [id, events] of byMatch) {
    const r = events.at(-1).data;
    if (r.decidedBy === 'shootout') match ??= { id, events, homeId: r.homeId, awayId: r.awayId };
  }
  byMatch.clear();
}

test('the shootout on air (Tom, 2026-11-01): a whistle to end overtime, the crowd and a call on every kick, the whistle soon after the last', { skip: !match }, () => {
  const tl = createTimeline(match, config);
  const kicks = tl.events.filter((t) => t.event.type === 'shootout_kick');
  const sounds = eventCues(tl, { matchId: match.id, shotMs: config.settings.animation.shotMs });
  assert.ok(sounds.some((c) => c.kind === 'whistle' && c.blast === 'long' && c.at === tl.shootoutBreakAt), 'overtime ends with a long blast');

  const crowd = crowdCues(tl, { matchId: match.id, homeId: match.homeId, bigStage: true, halfMinutes: config.rules.match.halfMinutes, goalPauseMs: config.settings.match.goalPauseSeconds * 1000 });
  for (const k of kicks) assert.ok(crowd.some((c) => c.at === k.at && (c.kind === 'roar' || c.kind === 'groan' || c.kind === 'ooh')), 'the crowd reacts to every kick');

  const calls = commentaryCalls(tl, { matchId: match.id, homeId: match.homeId, commentatorId: config.commentary.playoffs, data: config.commentary, settings: config.settings.commentary, stage: 'semifinal' });
  assert.ok(calls.some((c) => c.at > tl.shootoutBreakAt && c.at < kicks[0].at && c.moment === 'full_time_level'), 'a line as overtime ends');
  for (const k of kicks) assert.ok(calls.some((c) => c.at > k.at && c.at < k.at + config.settings.match.shootoutKickRealSeconds * 1000), 'a call on every kick');

  // A miss is a save only when the keeper reaches it: a save sound and a save call go together.
  for (const k of kicks.filter((x) => !/** @type {any} */ (x.event.data).scored)) {
    const saved = sounds.some((c) => c.kind === 'save' && c.at === k.at);
    const call = /** @type {any} */ (calls.find((c) => c.at > k.at && c.at < k.at + 5000));
    assert.equal(call.moment, saved ? 'save' : 'wide');
  }

  const result = /** @type {any} */ (tl.events.at(-1));
  assert.equal(result.at, /** @type {any} */ (kicks.at(-1)).at + config.settings.match.shootoutWhistleSeconds * 1000);
  assert.ok(sounds.some((c) => c.kind === 'whistle' && c.blast === 'full_time' && c.at === result.at));
  assert.ok(crowd.some((c) => c.kind === 'roar' && c.at > result.at && c.at < result.at + 1000), 'the crowd at the whistle');
});
