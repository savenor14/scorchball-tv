import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { captionAt } from '../src/channel/captions.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { captions } = config.settings;

/** A regular match and a shootout match, plus the league for names. */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId)).push(e); }] });
const league = createLeague(config, 'caption-tests', log);
/** @type {Record<string, any>} */
const found = {};
for (let s = 0; s < 60 && !found.shootout; s++) {
  runOffseason(league, config, log, runSeason(league, config, log));
  for (const [id, events] of byMatch) {
    const r = events.at(-1).data;
    found[r.decidedBy] ??= { id, events, homeId: r.homeId, awayId: r.awayId };
    byMatch.delete(id);
  }
}
const ctx = {
  playerName: (/** @type {string} */ id) => `${league.players[id].firstName[0]}. ${league.players[id].lastName}`,
  teamName: (/** @type {string} */ id) => league.teams[id].shortName,
  captions,
};
const regular = createTimeline(found.regulation, config);

test('a goal caption appears exactly when the goal happens and stays for goalMs', () => {
  const goal = /** @type {any} */ (regular.events.find((t) => t.event.type === 'goal'));
  const before = captionAt(regular, goal.at - 1, ctx);
  assert.ok(!before || !['goal', 'scorcher'].includes(before.kind));
  const c = captionAt(regular, goal.at, ctx);
  assert.equal(c?.kind, goal.event.data.scorcher ? 'scorcher' : 'goal');
  assert.equal(c?.title, goal.event.data.scorcher ? 'SCORCHER!' : goal.event.data.freeShot ? 'GOAL! (FREE SHOT)' : 'GOAL!');
  assert.ok(c?.detail.includes(ctx.playerName(goal.event.playerId)));
  assert.ok(c?.detail.endsWith(`${goal.event.data.score[0]}–${goal.event.data.score[1]}`));
  assert.equal(c?.teamId, goal.event.teamId);
  // Halfway through (unless a newer goal has taken over), and gone once goalMs has passed.
  const mid = captionAt(regular, goal.at + captions.goalMs / 2, ctx);
  if (mid?.key === c?.key) assert.ok(Math.abs(mid.f - 0.5) < 1e-9);
  assert.notEqual(captionAt(regular, goal.at + captions.goalMs, ctx)?.key, c?.key);
});

test('a lesser caption never cuts a goal short', () => {
  for (const { at } of regular.events.filter((t) => t.event.type === 'goal')) {
    for (const dt of [0, captions.goalMs * 0.3, captions.goalMs * 0.6, captions.goalMs - 1]) {
      const c = captionAt(regular, at + dt, ctx);
      assert.ok(c && ['goal', 'scorcher'].includes(c.kind), `goal caption replaced by ${c?.kind} after ${dt} ms`);
    }
  }
});

test('half-time and burns get captions; ordinary play does not', () => {
  const ht = /** @type {any} */ (regular.events.find((t) => t.event.type === 'half_time'));
  const c = captionAt(regular, ht.at + 10, ctx);
  assert.equal(c?.title, 'HALF-TIME');
  assert.equal(c?.detail, `${ht.event.data.score[0]}–${ht.event.data.score[1]}`);
  const burn = regular.events.find((t) => t.event.type === 'burn');
  if (burn) {
    const b = captionAt(regular, burn.at + 10, ctx);
    assert.ok(b?.kind === 'burn' || b?.kind === 'goal' || b?.kind === 'scorcher' || b?.kind === 'period');
  }
  // Long stretches with no captionable events show nothing.
  const quiet = regular.events.find((t, i) => t.event.type === 'advance' && i > 5
    && regular.events.slice(0, i).every((u) => u.at < t.at - captions.goalMs || !['goal', 'burn', 'free_shot', 'substitution', 'injury', 'half_time', 'full_time', 'overtime_start', 'shootout_kick'].includes(u.event.type)));
  if (quiet) assert.equal(captionAt(regular, quiet.at, ctx), null);
});

test('shootout kicks get captions with the running tally', { skip: !found.shootout }, () => {
  const tl = createTimeline(found.shootout, config);
  const kicks = tl.events.filter((t) => t.event.type === 'shootout_kick');
  const first = captionAt(tl, kicks[0].at, ctx);
  assert.ok(first?.title.startsWith('SHOOTOUT'));
  const last = /** @type {any} */ (kicks.at(-1));
  const c = captionAt(tl, last.at, ctx);
  assert.equal(c?.kind, 'shootout');
  assert.ok(c?.detail.endsWith(`${last.event.data.shootout[0]}–${last.event.data.shootout[1]}`));
});
