import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, loadConfig, validateConfig } from '../src/config.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const real = await loadConfigFromDisk();

/** A mutable copy of the real config, for breaking one value at a time. */
function copy() {
  return structuredClone(real);
}

test('the committed config files are valid', () => {
  assert.deepEqual(validateConfig(copy()), []);
});

test('loaded config is deeply frozen', () => {
  assert.ok(Object.isFrozen(real.rules.heat));
  assert.throws(() => { real.rules.heat.burnSeconds = 1; }, TypeError);
});

test('schema errors name the file and field', () => {
  const c = copy();
  c.rules.heat.burnSeconds = 0;
  delete c.settings.match.realMinutes;
  c.positions.typo = true;
  const errors = validateConfig(c);
  assert.ok(errors.includes('config/settings.json → match.realMinutes: missing'));
  assert.ok(errors.some((e) => e.startsWith('data/rules.json → heat.burnSeconds: expected a number ≥ 1')));
  assert.ok(errors.includes('data/positions.json → typo: unknown key (typo?)'));
});

test('cross-checks: heat stages must be ordered', () => {
  const c = copy();
  c.rules.heat.hotAt = 40;
  assert.deepEqual(validateConfig(c), ['data/rules.json → heat: need warmAt < hotAt < 100']);
});

test('cross-checks: position weights must sum to 1 and use real attributes', () => {
  const c = copy();
  c.positions.overallWeights.S.shooting = 0.5;
  c.positions.overallWeights.K.flying = 0;
  const errors = validateConfig(c);
  assert.ok(errors.some((e) => /overallWeights\.S: weights sum to 1\.1/.test(e)));
  assert.ok(errors.some((e) => /overallWeights\.K\.flying: unknown/.test(e)));
});

test('cross-checks: roster counts must match positions and fit the roster', () => {
  const c = copy();
  delete c.rules.roster.lineup.S;
  c.rules.roster.minimums.D = 9;
  const errors = validateConfig(c);
  assert.ok(errors.includes('data/rules.json → roster.lineup.S: missing'));
  assert.ok(errors.some((e) => /roster\.minimums: total \(15\) exceeds roster size \(10\)/.test(e)));
});

test('cross-checks: tiebreakers must end with lots, points must be ordered', () => {
  const c = copy();
  c.rules.tiebreakers = ['points', 'goalDifference'];
  c.rules.points.draw = 3;
  const errors = validateConfig(c);
  assert.ok(errors.some((e) => /tiebreakers: last entry must be "lots"/.test(e)));
  assert.ok(errors.some((e) => /points: need win > draw/.test(e)));
});

test('cross-checks: teams must be unique, in real regions, and fit the playoff and lottery setup', () => {
  const c = copy();
  c.teams.teams[1].abbr = c.teams.teams[0].abbr;
  c.teams.teams[2].region = 'atlantis';
  c.teams.teams[3].colours.primary = c.teams.teams[0].colours.primary.toLowerCase();
  c.rules.draft.lotteryWeights = [50, 50];
  const errors = validateConfig(c);
  assert.ok(errors.includes('data/teams.json → teams: duplicate abbr "PCG"'));
  assert.ok(errors.some((e) => /teams\[2\]\.region: "atlantis" is not a region/.test(e)));
  assert.ok(errors.some((e) => /duplicate primary colour/.test(e)));
  assert.ok(errors.some((e) => /lotteryWeights: need one weight per non-playoff team \(4\), got 2/.test(e)));
});

test('schema: names must be plain ASCII and colours must be hex', () => {
  const c = copy();
  c.regions.regions[0].firstNames[0] = 'Zoë';
  c.teams.teams[0].colours.primary = 'teal';
  const errors = validateConfig(c);
  assert.ok(errors.some((e) => /regions\[0\]\.firstNames\[0\]: expected a name in plain ASCII/.test(e)));
  assert.ok(errors.some((e) => /teams\[0\]\.colours\.primary: expected a colour/.test(e)));
});

test('cross-checks: the live league needs a real Monday and a known time zone', () => {
  const c = copy();
  c.settings.live.firstSeasonStarts = '2026-10-06';
  c.settings.live.timeZone = 'Mars/Olympus_Mons';
  assert.deepEqual(validateConfig(c), [
    'config/settings.json → live.firstSeasonStarts: 2026-10-06 must be a Monday',
    'config/settings.json → live.timeZone: "Mars/Olympus_Mons" is not a known time zone (use one like "America/New_York")',
  ]);
  c.settings.live.firstSeasonStarts = '2026-02-30';
  c.settings.live.timeZone = 'Europe/London';
  assert.deepEqual(validateConfig(c), ['config/settings.json → live.firstSeasonStarts: "2026-02-30" is not a real date']);
});

test('schema: calendar times must look like "day N HH:MM"', () => {
  const c = copy();
  c.settings.calendar.firstKickoff = 'Monday 00:30';
  c.settings.playoffs.kickoffs[0] = 'day 7 24:00';
  const errors = validateConfig(c);
  assert.ok(errors.some((e) => /calendar\.firstKickoff: expected a time like "day 6 20:00"/.test(e)));
  assert.ok(errors.some((e) => /playoffs\.kickoffs\[0\]: expected a time like/.test(e)));
});

/** Real minutes a regular-season slot and a knockout (overtime and a shootout included) need, from the settings. */
const { match: m, segments: seg, studio: st, opening: op } = real.settings;
// The run-in (Task 95): the tee-up talk, and once a day the channel's opening.
const runIn = (st.teeUpSeconds + op.identSeconds + op.talkSeconds) / 60;
const slotNeeds = runIn + m.realMinutes + m.halfTimeRealMinutes + m.pauseAllowanceMinutes + seg.preMatchMinutes + seg.walkOutMinutes + seg.handshakeMinutes + seg.postMatchMinutes;
const knockoutNeeds = Math.ceil(slotNeeds + 2 * m.overtimeBreakRealMinutes
  + real.rules.match.overtimeMinutes * (m.realMinutes / (2 * real.rules.match.halfMinutes))
  + (2 * (real.rules.playoffs.shootoutKicks + 2) * m.shootoutKickRealSeconds + m.goalPauseSeconds) / 60);

test('cross-checks: regular-season matches must not overlap', () => {
  const c = copy();
  c.settings.calendar.firstKickoff = 'day 6 00:00';
  const errors = validateConfig(c);
  assert.equal(errors.length, 1);
  assert.match(errors[0], new RegExp(`calendar: regular-season matches would be 23 min apart, but each needs ${slotNeeds} `));
  c.settings.calendar.firstKickoff = 'day 6 20:00';
  assert.deepEqual(validateConfig(c), ['config/settings.json → calendar: finalRoundKickoff must be after firstKickoff']);
});

test('cross-checks: playoff kick-offs fit the playoff format, leave room for overtime, and end within the week', () => {
  const c = copy();
  c.settings.playoffs.kickoffs = ['day 7 16:00', 'day 7 20:00'];
  assert.deepEqual(validateConfig(c), ['config/settings.json → playoffs.kickoffs: need 3 (one per knockout match with 4 playoff teams), got 2']);

  c.settings.playoffs.kickoffs = ['day 6 20:10', 'day 7 16:20', 'day 7 23:50'];
  const errors = validateConfig(c);
  assert.ok(errors.some((e) => e.includes(`playoffs.kickoffs[0]: must be at least ${slotNeeds} min after calendar.finalRoundKickoff`)));
  assert.ok(errors.some((e) => /playoffs\.kickoffs: the final, champion and off-season segments run past the end of day 7/.test(e)));

  c.settings.playoffs.kickoffs = ['day 7 16:00', 'day 7 16:20', 'day 8 01:00'];
  const more = validateConfig(c);
  assert.ok(more.some((e) => e.includes(`playoffs.kickoffs[1]: must be at least ${knockoutNeeds} min after the previous knockout`)));
  assert.ok(more.some((e) => /playoffs\.kickoffs\[2\]: "day 8 01:00" is after the season's last day \(7\)/.test(e)));
});

test('loadConfig reports unreadable and malformed files together', async () => {
  const files = {
    'config/settings.json': '{ not json',
    'data/rules.json': JSON.stringify(real.rules),
  };
  const read = async (/** @type {string} */ path) => {
    if (!(path in files)) throw new Error('file not found');
    return files[/** @type {keyof typeof files} */ (path)];
  };
  await assert.rejects(loadConfig(read), (err) => {
    assert.ok(err instanceof ConfigError);
    assert.equal(err.errors.length, 20);
    assert.match(err.errors[0], /^config\/settings\.json → could not read or parse/);
    assert.match(err.errors[1], /^data\/ruleChanges\.json → could not read or parse: file not found/);
    assert.match(err.errors[2], /^data\/positions\.json → could not read or parse: file not found/);
    assert.match(err.errors[4], /^data\/teams\.json → could not read or parse: file not found/);
    assert.match(err.errors[5], /^data\/interviews\.json → could not read or parse: file not found/);
    assert.match(err.errors[6], /^data\/studio\.json → could not read or parse: file not found/);
    return true;
  });
});
