// AROUND THE GROUNDS (Tom's note 14; docs/channel.md §32): the tour's order and scenes, and where it airs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { SCENES, tourCaption, tourVisits } from '../src/channel/groundsTour.js';
import { buildDay } from '../src/channel/guide.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const SEED = 'grounds-tour-tests';
const TEAMS = config.teams.teams.map((/** @type {{ id: string }} */ x) => x.id);
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const staff = (/** @type {string} */ k) => SCENES[k].staff;

test('the tour visits every ground once, ending at the next match\'s, the same for the same gap', () => {
  const v = tourVisits(TEAMS, { key: 's1-r3-m2', lastId: 't-rime', staffOnly: false });
  assert.deepEqual([...v.map((x) => x.teamId)].sort(), [...TEAMS].sort());
  assert.equal(v.at(-1)?.teamId, 't-rime');
  assert.deepEqual(tourVisits(TEAMS, { key: 's1-r3-m2', lastId: 't-rime', staffOnly: false }), v);
  assert.notDeepEqual(tourVisits(TEAMS, { key: 's1-r3-m3', lastId: 't-rime', staffOnly: false }).map((x) => x.teamId), v.map((x) => x.teamId));
});

test('its scenes are dealt: none twice in a tour, by day or (round 4) at night; at night only those fit for it; the night watch never by day', () => {
  for (let k = 0; k < 40; k++) {
    const day = tourVisits(TEAMS, { key: `k${k}`, lastId: null, staffOnly: false }).map((x) => x.scene);
    assert.equal(new Set(day).size, day.length);
    const night = tourVisits(TEAMS, { key: `k${k}`, lastId: null, staffOnly: true }).map((x) => x.scene);
    assert.ok(night.every(staff));
    assert.equal(new Set(night).size, night.length);
    assert.ok(!day.includes('guard'));
  }
});

test('the caption names the ground in capitals and whose home it is', () => {
  const c = tourCaption({ ground: 'the Rookery', name: 'Wrenhollow Stormcrows' });
  assert.equal(c.title, 'THE ROOKERY');
  assert.equal(c.detail, 'Home of the Wrenhollow Stormcrows');
});

/** The tours in the programme between two moments: each run of visits in a row. @param {number} from @param {number} until */
function toursBetween(from, until) {
  const live = new LiveLeague(config, { now: from, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ from: number, visits: any[] }[]} */
  const tours = [];
  let prev = null;
  for (let t = from; t < until;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'grounds') {
      if (prev?.kind !== 'grounds') tours.push({ from: p.from, visits: [] });
      tours[tours.length - 1].visits.push(seg);
    }
    prev = seg;
    t = p.until > t ? p.until : t + 1000;
  }
  return tours;
}

test('one tour in each regular-season gap that has room, every ground in turn, ending at the next match\'s', () => {
  const tours = toursBetween(slots[2].kickoff, slots[8].kickoff);
  assert.ok(tours.length >= 4, `${tours.length} tours`);
  for (const tour of tours) {
    assert.equal(tour.visits.length, TEAMS.length);
    assert.deepEqual([...tour.visits.map((v) => v.teamId)].sort(), [...TEAMS].sort());
    assert.equal(tour.visits.at(-1).teamId, tour.visits[0].next?.homeId);
    assert.ok(tour.visits.every((v, i) => v.visit === i && v.tourFrom === tour.from && v.until - v.from === config.settings.groundsTour.visitSeconds * 1000));
  }
  // At most one a gap.
  const kicks = slots.slice(2, 9).map((s) => s.kickoff);
  for (let i = 0; i + 1 < kicks.length; i++) assert.ok(tours.filter((x) => x.from > kicks[i] && x.from < kicks[i + 1]).length <= 1);
});

test('none between the second semifinal and the final; groundstaff only on the night after it', () => {
  const [, sf2, final] = slots.slice(calendar.regularCount).map((s) => s.kickoff);
  assert.equal(toursBetween(sf2, final).length, 0);
  const next = createCalendar(config).slots(2)[0].kickoff;
  const night = toursBetween(final, next);
  assert.equal(night.length, 1);
  assert.ok(night[0].visits.every((v) => staff(v.scene)));
});

test('SCHEDULE lists the tour as one line', () => {
  const t = slots[3].kickoff;
  const day = buildDay(config, t, SEED, timelineOf);
  const lines = day.entries.filter((e) => e.kind === 'grounds');
  assert.ok(lines.length >= 1);
  assert.ok(lines.every((e) => e.until - e.from === TEAMS.length * config.settings.groundsTour.visitSeconds * 1000));
});

test('each scene\'s sounds fall inside its visit, the same for the same moment (task 3)', async () => {
  const { sceneCues } = await import('../src/channel/groundScenes.js');
  const g = { team: { id: 't-rime' }, keepers: ['k1', 'k2'], outfield: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] };
  const from = slots[5].kickoff + 12_345;
  const until = from + config.settings.groundsTour.visitSeconds * 1000;
  for (const scene of Object.keys(SCENES)) {
    const cues = sceneCues(scene, /** @type {any} */ (g), from, until);
    assert.ok(cues.every((c) => c.at >= 0 && c.at < until - from), scene);
    assert.ok(cues.every((c, i) => i === 0 || c.at >= cues[i - 1].at), `${scene} in order`);
    assert.deepEqual(sceneCues(scene, /** @type {any} */ (g), from, until), cues);
    // By day the quiet ones are quiet; at night the crickets come under all but the mower, sprinklers and broom.
    const quiet = ['lines', 'turfName', 'goalmouth'];
    if (!quiet.includes(scene)) assert.ok(cues.length > 0, `${scene} has sounds`);
    const crickets = sceneCues(scene, /** @type {any} */ (g), from, until, { night: true }).filter((c) => c.effect === 'crickets');
    assert.equal(crickets.length > 0, !['mowing', 'emblem', 'dugouts'].includes(scene), `${scene}'s crickets`);
    assert.ok(crickets.length <= 3, `${scene}: ${crickets.length} crickets`);
  }
});

test('the grounds\' names elsewhere: the pre-match card, the walk-out\'s welcome, the team card, the Rulebook (task 4)', async () => {
  const { groundName } = await import('../src/channel/groundsTour.js');
  const { preMatchCard } = await import('../src/channel/cards.js');
  const { walkOutCaption, walkOutParts } = await import('../src/channel/ceremonies.js');
  const { rulebook } = await import('../src/channel/rulebook.js');
  assert.equal(groundName(config, 't-stormcrows'), 'the Rookery');
  // The pre-match card: the home side's ground and town.
  const slot = slots[4];
  const live = new LiveLeague(config, { now: slot.kickoff - 60_000, seed: SEED });
  const f = /** @type {any} */ (createProgramme(live, timelineOf).at(slot.kickoff - 60_000));
  const fixture = f.fixture;
  const card = preMatchCard(fixture, live, slot.kickoff - 60_000, { timelineOf, playerName: (/** @type {string} */ id) => id });
  assert.equal(card.venue, `at ${groundName(config, fixture.homeId)}, ${live.league.teams[fixture.homeId].city}`);
  // The walk-out: a welcome to the ground first, then the teams walking out.
  const c = config.settings.ceremonies;
  const total = config.settings.segments.walkOutMinutes * 60_000;
  const home = { ground: 'the Rookery', city: 'Wrenhollow' };
  const name = (/** @type {string} */ id) => id;
  const at = (/** @type {number} */ since) => walkOutCaption(since, total - since, { homeId: 'a', awayId: 'b' }, name, c, home);
  assert.equal(at(0).title, 'WELCOME TO THE ROOKERY');
  assert.equal(at(0).detail, 'Wrenhollow');
  assert.equal(at(walkOutParts(total, c).anthemsFrom - 1).title, 'THE TEAMS WALK OUT');
  // The Rulebook's LEAGUE tab: every club at its ground.
  const league = rulebook(config).sections.find((s) => s.tab === 'LEAGUE');
  const line = league?.rules.find((r) => r.startsWith('Each club plays its home matches at its own ground'));
  assert.ok(line && config.teams.teams.every((/** @type {any} */ t) => line.includes(`the ${t.name} at ${t.ground}`)), line);
});
