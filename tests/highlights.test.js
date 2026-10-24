import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { highlightClips, packageMs } from '../src/channel/highlights.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { highlights } = config.settings;

/** Some regular matches and a shootout. */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId)).push(e); }] });
const league = createLeague(config, 'highlight-tests', log);
/** @type {any[]} */
const regular = [];
/** @type {any} */
let shootout = null;
for (let s = 0; s < 60 && !shootout; s++) {
  runOffseason(league, config, log, runSeason(league, config, log));
  for (const [id, events] of byMatch) {
    const r = events.at(-1).data;
    const m = { id, events, homeId: r.homeId, awayId: r.awayId };
    if (r.decidedBy === 'shootout') shootout ??= m;
    else if (regular.length < 20) regular.push(m);
    byMatch.delete(id);
  }
}

test('every goal is in the package, clips are in order, apart, and inside the match', () => {
  for (const m of regular) {
    const tl = createTimeline(m, config);
    const clips = highlightClips(tl, highlights);
    const goals = tl.events.filter((t) => t.event.type === 'goal').map((t) => t.at);
    assert.ok(clips.length > 0 && clips.length <= Math.max(highlights.maxClips, goals.length));
    for (let i = 0; i < clips.length; i++) {
      assert.ok(clips[i].from < clips[i].to && clips[i].from >= 0 && clips[i].to <= tl.duration);
      if (i > 0) assert.ok(clips[i].from > clips[i - 1].to, 'clips never overlap');
    }
    for (const g of goals) assert.ok(clips.some((c) => c.from <= g && g <= c.to), `goal at ${g} missing`);
  }
});

test('a clip never reaches back across half-time', () => {
  for (const m of regular) {
    const tl = createTimeline(m, config);
    for (const c of highlightClips(tl, highlights)) {
      for (const phase of [tl.stateAt(c.from).phase, tl.stateAt(c.to - 1).phase]) assert.notEqual(phase, 'half_time');
    }
  }
});

test('a package lasts a couple of minutes on screen', () => {
  const lengths = regular.map((m) => packageMs(highlightClips(createTimeline(m, config), highlights), highlights.speed));
  for (const ms of lengths) assert.ok(ms > 0);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  assert.ok(mean > 30_000 && mean < 180_000, `mean package ${Math.round(mean / 1000)} s`);
});

test('a shootout is shown as one clip covering every kick', { skip: !shootout }, () => {
  const tl = createTimeline(shootout, config);
  const clips = highlightClips(tl, highlights);
  const kicks = tl.events.filter((t) => t.event.type === 'shootout_kick').map((t) => t.at);
  const clip = clips.find((c) => c.from <= kicks[0] && kicks.at(-1) <= c.to);
  assert.ok(clip, 'one clip holds every kick');
});
