// The Record book's pages (Task 167; src/channel/recordBook.js): worked out from a fast-forwarded league's chronicle
// (Task 216).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';
import { allTimeRecords, seasonPage } from '../src/channel/recordBook.js';

const config = await loadConfigFromDisk();
const chronicle = new Chronicle(config.chronicle);
const log = new EventLog({ sinks: [chronicle.add] });
const league = createLeague(config, 'record-book-tests', log);
const records = [];
for (let i = 0; i < 4; i++) {
  const r = runSeason(league, config, log);
  runOffseason(league, config, log, r);
  records.push(r);
}
const teamIds = Object.keys(league.teams);

test("a season page: the Cup, the Pennant, the table, the playoffs, the final from the champion's side", () => {
  for (const r of records) {
    const p = seasonPage(chronicle, r.season, league.players);
    assert.equal(p.cupId, r.championId);
    assert.equal(p.pennantId, r.table[0].teamId);
    assert.equal(p.table.length, teamIds.length);
    assert.equal(p.playoffs.length, config.rules.playoffs.teams - 1);
    assert.equal(p.playoffs[0].stage, 'final', 'the final listed first');
    const [w, l] = p.finalScore.split(' ')[0].split('-').map(Number);
    assert.ok(w >= l, `${p.finalScore}: the champion's goals first`);
    for (const list of [p.regular.goals, p.regular.assists, p.playoffLeaders.goals]) {
      for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].value >= list[i].value);
    }
  }
});

test('the all-time records: honours add up, the lists are in order', () => {
  const a = allTimeRecords(chronicle, league.players, config.chronicle.records);
  assert.equal(a.seasons, records.length);
  assert.equal(a.teamHistory.length, teamIds.length);
  assert.equal(a.teamHistory.reduce((n, h) => n + h.cups.length, 0), records.length);
  assert.equal(a.teamHistory.reduce((n, h) => n + h.pennants.length, 0), records.length);
  for (const [list, key] of /** @type {const} */ ([[a.seasonGoals, 'value'], [a.careerGoals, 'value'], [a.careerBurns, 'value'], [a.winningGoals, 'value'], [a.winningRuns, 'length'], [a.mostPoints, 'value']])) {
    assert.ok(list.length > 0 && list.length <= 5);
    for (let i = 1; i < list.length; i++) assert.ok(/** @type {any} */ (list[i - 1])[key] >= /** @type {any} */ (list[i])[key], key);
  }
  // A career is at least its best season.
  assert.ok(a.careerGoals[0].value >= a.seasonGoals[0].value);
  for (const r of a.winningRuns) assert.ok(r.length >= 1 && r.season >= 1);
});
