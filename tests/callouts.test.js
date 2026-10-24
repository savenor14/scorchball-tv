import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calloutAt, subCalloutsAt } from '../src/channel/callouts.js';
import { createTimeline } from '../src/channel/timeline.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createCalendar } from '../src/channel/calendar.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { calloutMs } = config.settings.captions;
const slots = createCalendar(config).slots(1);
const live = new LiveLeague(config, { now: slots[slots.length - 1].kickoff, seed: 'callout-tests' });
const matches = live.matchesIn(1).map((m) => ({ m, tl: createTimeline(m, config) }));
const ctx = { calloutMs };

test('a winning tackle puts TACKLE! (or STEAL! for a pass cut out) over the tackler, in their team', () => {
  let checked = 0;
  const seen = new Set();
  for (const { tl } of matches.slice(0, 5)) {
    for (const { event, at } of tl.events) {
      if (event.type !== 'possession_change' || event.data.reason !== 'tackle') continue;
      const c = calloutAt(tl, at + 1, ctx);
      // A rarer moment at the same instant can outrank it; otherwise it's the tackle.
      if (c?.key !== String(event.seq)) continue;
      assert.equal(c.text, event.data.steal ? 'STEAL!' : 'TACKLE!');
      assert.equal(c.playerId, event.playerId);
      assert.equal(c.teamId, event.teamId);
      seen.add(c.text);
      checked++;
    }
  }
  assert.ok(checked > 50);
  assert.deepEqual([...seen].sort(), ['STEAL!', 'TACKLE!']);
});

test('saves, blocks, misses, fouls and burns each get theirs; the referee calls fouls and burns', () => {
  /** @type {Record<string, string>} */
  const want = { save: 'SAVE!', block: 'BLOCK!', miss: 'MISS!', foul: 'FOUL!', burn: 'BURN!' };
  const seen = new Set();
  for (const { tl } of matches) {
    for (const { event, at } of tl.events) {
      if (!(event.type in want)) continue;
      const c = calloutAt(tl, at, ctx);
      assert.ok(c, `nothing for ${event.type}`);
      // The highest-ranked moment wins: a foul or burn beats a save, a save beats a block, and so on.
      if (c.key !== String(event.seq)) continue;
      assert.equal(c.text, want[event.type]);
      assert.equal(c.playerId, event.type === 'burn' || event.type === 'foul' ? null : event.playerId);
      // The referee calls the foul (Task 64) and the burn (Tom, 2026-10-18).
      assert.equal(c.referee, event.type === 'foul' || event.type === 'burn');
      if (event.type === 'foul') assert.equal(c.kind, 'foul');
      seen.add(event.type);
    }
  }
  for (const type of ['save', 'block', 'miss', 'foul']) assert.ok(seen.has(type), `never saw ${type}`);
});

test('a callout lasts calloutMs, then clears; the referee says GOAL!', () => {
  const { tl } = matches[0];
  const tackle = tl.events.find((t) => t.event.type === 'possession_change' && t.event.data.reason === 'tackle');
  assert.ok(tackle);
  const mid = calloutAt(tl, tackle.at + calloutMs / 2, ctx);
  if (mid?.key === String(tackle.event.seq)) assert.ok(Math.abs(mid.f - 0.5) < 1e-9);
  const after = calloutAt(tl, tackle.at + calloutMs + 1, ctx);
  assert.notEqual(after?.key, String(tackle.event.seq));
  for (const { tl: t } of matches) {
    for (const { event, at } of t.events) {
      if (event.type !== 'goal') continue;
      const c = calloutAt(t, at + 1, ctx);
      // The golden goal says so (Task 147).
      const text = at === t.goldenAt ? 'GOLDEN GOAL!' : 'GOAL!';
      assert.ok(c?.key === String(event.seq) && c.text === text && c.referee && c.teamId === event.teamId, `${text} from the referee at ${at}`);
    }
  }
});

test('only the most recent moment counts: a newer tackle replaces an older save', () => {
  for (const { tl } of matches) {
    const ev = tl.events;
    for (let i = 1; i < ev.length; i++) {
      const c = calloutAt(tl, ev[i].at, ctx);
      if (!c) continue;
      const shown = ev.find((t) => String(t.event.seq) === c.key);
      assert.ok(shown && shown.at <= ev[i].at && shown.at > ev[i].at - calloutMs);
    }
  }
});

test('KICK-OFF! from the referee as each period starts', () => {
  const { tl } = matches[0];
  const kickoffs = tl.events.filter((t) => t.event.type === 'kickoff');
  for (const k of kickoffs) {
    const c = calloutAt(tl, k.at + 100, config.settings.captions);
    assert.equal(c?.text, 'KICK-OFF!');
    assert.equal(c?.playerId, null);
    assert.equal(c?.referee, true);
  }
});

test('a breakaway puts BREAKAWAY! over the player as they break through, before the shot', () => {
  let checked = 0;
  for (const { tl } of matches) {
    for (const { event, at } of tl.events) {
      if (event.type !== 'advance' || !event.data.breakaway) continue;
      const c = calloutAt(tl, at + 1, ctx);
      if (c?.key !== String(event.seq)) continue;
      assert.equal(c.text, 'BREAKAWAY!');
      assert.equal(c.playerId, event.playerId);
      checked++;
    }
  }
  assert.ok(checked > 3, `only ${checked} breakaways`);
});

test('a substitution: the referee says SUB ON, once for the moment, alongside any other bubble', () => {
  let checked = 0;
  const subCalloutMs = config.settings.captions.subCalloutMs;
  for (const { tl } of matches) {
    for (const { event, at } of tl.events) {
      if (event.type !== 'substitution') continue;
      const subs = subCalloutsAt(tl, at + 1, { subCalloutMs });
      assert.equal(subs.length, 1);
      const [c] = subs;
      assert.equal(c.text, 'SUB ON');
      assert.ok(c.referee && c.playerId === null);
      if (c.key === `sub|${at}`) checked++;
      assert.equal(subCalloutsAt(tl, at + subCalloutMs + 1, { subCalloutMs }).filter((x) => x.key === `sub|${at}`).length, 0, 'gone after its time');
    }
  }
  assert.ok(checked > 5);
});
