// The desk remembers (Task 246a; src/channel/deskFacts.js, studio.js's sayer): which fact the desk says after and before
// a match, its fill, and lines naming a surname only with playerNames on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFacts } from '../src/chronicle/factsLeague.js';
import { deskAfter, deskBefore } from '../src/channel/deskFacts.js';
import { deskClipKey } from '../src/channel/speech.js';
import { sayer, teamsForTalk } from '../src/channel/studio.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { chronicle, after, before } = collectFacts(config, 'desk-tests', 12);
const teamById = Object.fromEntries(config.teams.teams.map((/** @type {any} */ t) => [t.id, t]));
const names = {
  team: (/** @type {string} */ id) => teamById[id].shortName,
  player: (/** @type {string} */ id) => String(chronicle.players.get(id)?.lastName).toUpperCase(),
  surname: (/** @type {string} */ id) => String(chronicle.players.get(id)?.lastName),
};
const from = config.chronicle.facts.deskFrom;
const lines = config.studio.lines;
const teams = teamsForTalk(teamById, config.studio.spokenTeam);

test('after a match: the heaviest fact the desk can say, from deskFrom, with a line in the data', () => {
  let said = 0;
  for (const x of after) {
    const line = deskAfter(x.facts, names, from);
    if (!line) continue;
    said++;
    assert.ok(lines[line.kind], line.kind);
    // Every blank in its ways is filled.
    for (const w of lines[line.kind].ways) {
      for (const [, k] of `${w.say} ${w.show ?? ''}`.matchAll(/\{(\w+)\}/g)) assert.ok(k in line.fill || k === 'team', `${line.kind} {${k}}`);
    }
  }
  const share = said / after.length;
  assert.ok(share > 0.15 && share < 0.6, `${share} of matches`);
});

test('before a match: last season\'s final, a run between the two, or a player facing an old club', () => {
  const said = before.map((x) => deskBefore(x.facts, names)).filter(Boolean);
  assert.ok(said.length > 0);
  for (const line of said) assert.ok(['teeUpRematch', 'teeUpRunOver', 'teeUpOldClub'].includes(/** @type {any} */ (line).kind));
});

test('a surname is said only with playerNames on, and its clip names it', () => {
  const fill = { player: 'C. PENHALLOW', surname: 'Penhallow', milestone: '100TH GOAL' };
  for (let i = 0; i < 6; i++) {
    const off = sayer(lines, `t${i}`, teams, false);
    off.say('factMilestone', fill);
    assert.ok(!off.said[0].text.includes('Penhallow') && !off.said[0].clip.surname);
  }
  // A rare line, always named (no namedShare); a frequent one, its namedShare of the time (Tom: mostly named).
  const on = sayer(lines, 'names', teams, true);
  for (let i = 0; i < 5; i++) on.say('factRecord', { ...fill, record: 'ALL-TIME GOALS RECORD · 153' });
  assert.ok(on.said.every((s) => s.clip.surname === 'Penhallow' && s.text.includes('Penhallow')));
  assert.match(deskClipKey('hedrek', on.said[0].clip), /^desk\/hedrek\/factRecord-\d-penhallow$/);
  const mix = sayer(lines, 'mix', teams, true);
  for (let i = 0; i < 600; i++) mix.say('factMilestone', fill);
  const share = mix.said.filter((s) => s.clip.surname).length / mix.said.length;
  assert.ok(Math.abs(share - lines.factMilestone.namedShare) < 0.06, `${share} named`);
});
