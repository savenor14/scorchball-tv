// FROM THE VAULT (Tom's note 14; docs/channel.md §33): the story, when it airs, its running order, its cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar, zoneOffsets } from '../src/channel/calendar.js';
import { minuteOfDay } from '../src/channel/daylight.js';
import { buildDay } from '../src/channel/guide.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { vaultCard, vaultStory } from '../src/channel/vault.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const SEED = 'vault-tests';
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const zone = zoneOffsets(config.settings.live.timeZone);
const minutes = (/** @type {number} */ t) => minuteOfDay(t, zone.offsetAt(t));
const at = (/** @type {string} */ hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Every run of vault pieces between two moments. @param {number} from @param {number} until */
function vaultsBetween(from, until) {
  const live = new LiveLeague(config, { now: from, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ from: number, segs: any[] }[]} */
  const runs = [];
  let prev = false;
  for (let t = from; t < until;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = /** @type {any} */ (programme.at(Math.max(p.from, t)));
    if (seg.vault) {
      if (!prev) runs.push({ from: p.from, segs: [] });
      const run = runs[runs.length - 1];
      if (run.segs.at(-1)?.from !== seg.from || run.segs.at(-1)?.kind !== seg.kind) run.segs.push(seg);
    }
    prev = Boolean(seg.vault);
    t = p.until > t ? p.until : t + 1000;
  }
  return { runs, live };
}

test('the story: none in season 1; from season 2 last season\'s final, its headline never the result', () => {
  const s1 = calendar.slots(1)[10].kickoff;
  assert.equal(vaultStory(new LiveLeague(config, { now: s1, seed: SEED }), s1), null);
  const t = calendar.slots(2)[5].kickoff;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const story = vaultStory(live, t);
  assert.ok(story && story.match.season === 1 && story.match.stage === 'final');
  assert.equal(story.headline, 'THE LEAGUE\'S FIRST FINAL');
  const open = /** @type {any} */ (vaultCard('vault_open', live, t, { timelineOf }));
  assert.equal(open.homeId, story.match.homeId);
  assert.ok(!('homeGoals' in open) && !JSON.stringify(open).includes(`${story.match.summary.result.homeGoals}-${story.match.summary.result.awayGoals}`), 'no score on the opening');
  const since = /** @type {any} */ (vaultCard('vault_since', live, t, { timelineOf }));
  assert.deepEqual(since.sides.map((x) => x.then), ['CHAMPIONS', 'RUNNERS-UP']);
});

test('in season 2, about each of vault.at a day: the opening, the reel, SINCE THEN; none in season 1', () => {
  const s2 = calendar.seasonStart(2);
  const day = 1440 * 60_000;
  const { runs } = vaultsBetween(s2 + day, s2 + 2 * day);
  assert.equal(runs.length, config.settings.vault.at.length, runs.map((r) => new Date(r.from).toISOString()).join(' '));
  runs.forEach((r, i) => {
    // Near its time: up to a re-air's length early (it goes before a unit that would carry past it), or a while late.
    const off = minutes(r.from) - at(config.settings.vault.at[i]);
    assert.ok(off > -45 && off < 120, `${config.settings.vault.at[i]} aired ${off} minutes off`);
    assert.deepEqual(r.segs.map((s) => (s.kind === 'studio' ? s.card : s.kind)), ['vault_open', 'highlights', 'vault_since']);
    assert.equal(r.segs[1].match.stage, 'final');
  });
  const s1 = calendar.slots(1);
  assert.equal(vaultsBetween(s1[2].kickoff, s1[2].kickoff + day).runs.length, 0);
});

test('SCHEDULE lists it as one line, FROM THE VAULT', () => {
  const t = calendar.seasonStart(2) + 1440 * 60_000 + 12 * 3_600_000;
  const day = buildDay(config, t, SEED, timelineOf);
  assert.ok(day.entries.filter((e) => e.kind === 'vault').length >= 1);
});
