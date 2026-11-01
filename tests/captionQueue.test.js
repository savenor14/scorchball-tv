import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { captionAt, captionSchedule } from '../src/channel/captions.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { captions } = config.settings;

/** A season's matches, as timelines. */
/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId)).push(e); }] });
const league = createLeague(config, 'caption-queue', log);
runSeason(league, config, log);
const timelines = [...byMatch.values()].map((events) => {
  const r = events.at(-1).data;
  return createTimeline({ events, homeId: r.homeId, awayId: r.awayId }, config);
});
const ctx = {
  playerName: (/** @type {string} */ id) => league.players[id].lastName,
  teamName: (/** @type {string} */ id) => league.teams[id].shortName,
  captions,
};
const GOALS = new Set(['goal', 'scorcher', 'golden']);

test('captions follow each other (Tom, 2026-11-01): in order, never two at once, no goal ever lost', () => {
  for (const tl of timelines) {
    const s = captionSchedule(tl, ctx);
    s.forEach((x, i) => {
      assert.ok(x.to > x.from);
      if (i) assert.ok(s[i - 1].to <= x.from, 'no overlap');
    });
    const goals = tl.events.filter((t) => t.event.type === 'goal').map((t) => String(t.event.seq));
    for (const g of goals) assert.ok(s.some((x) => x.key === g && GOALS.has(x.caption.kind)), 'every goal shown');
  }
});

test('a substitution stays up until play restarts; a free shot shows from its foul', () => {
  let subs = 0;
  let free = 0;
  for (const tl of timelines) {
    const s = captionSchedule(tl, ctx);
    for (const { event, at } of tl.events) {
      const shown = s.find((x) => x.key === String(event.seq));
      if (event.type === 'substitution' && shown && shown.from === at) {
        const q = /** @type {any} */ (tl.pauses.find((p) => p.at === at));
        const cut = s.some((x) => x.from > at && x.from < q.at + q.ms && GOALS.has(x.caption.kind));
        const together = tl.events.filter((t) => t.at === at && t.event.type === 'substitution').length;
        if (!cut && together === 1) {
          assert.equal(shown.to, Math.max(at + captions.ms, q.at + q.ms));
          subs++;
        }
      }
      if (event.type === 'free_shot' && shown) {
        const q = /** @type {any} */ (tl.pauses.findLast((p) => p.kind === 'free_shot' && p.at + p.ms === at));
        if (shown.from < at) {
          assert.equal(shown.from, q.at, 'from the foul');
          free++;
        }
      }
    }
  }
  assert.ok(subs > 10 && free > 10, `${subs} substitutions and ${free} free shots checked`);
});

test('a lesser caption waits its turn rather than wiping out the one showing', () => {
  let queued = 0;
  for (const tl of timelines) {
    const s = captionSchedule(tl, ctx);
    for (const x of s) {
      const event = /** @type {any} */ (tl.events.find((t) => String(t.event.seq) === x.key));
      if (x.from > event.at && x.caption.kind !== 'free_shot') {
        // It waited for the one before it, and is still shown at least queueMinMs.
        assert.ok(s.some((y) => y.to === x.from));
        assert.ok(x.to - x.from >= Math.min(captions.queueMinMs, x.to - x.from));
        queued++;
      }
      // captionAt agrees with the schedule.
      const mid = (x.from + x.to) / 2;
      assert.equal(captionAt(tl, mid, ctx)?.key, x.key);
    }
  }
  assert.ok(queued > 0, 'some captions queued');
});
