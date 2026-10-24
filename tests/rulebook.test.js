// The Rulebook and About (Task 163; docs/channel.md §17.2; data/rulebook.json): every blank names a fact, the facts
// come from the rules and settings, and a changed rule changes the text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { about, fillFacts, guide, rulebook, rulebookFacts } from '../src/channel/rulebook.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();

test('every blank in the Rulebook and About is filled', () => {
  const book = rulebook(config);
  const g = guide(config);
  const text = [book.intro, ...book.sections.flatMap((s) => [s.tab, s.title, ...s.rules]), ...about(config).paragraphs, ...g.sections.flatMap((s) => [s.title, ...s.items.map((i) => i.text)])];
  for (const t of text) assert.doesNotMatch(t, /[{}]/, t);
  assert.ok(book.sections.length >= 4);
  assert.equal(new Set(book.sections.map((s) => s.id)).size, book.sections.length, 'section ids are unique');
  // The tabs share the 86 px pane's row (Task 164): short labels, in capitals like the guide's.
  for (const s of book.sections) assert.match(s.tab, /^[A-Z]{1,6}$/, s.tab);
});

test('the facts come from the rules and settings', () => {
  const f = rulebookFacts(config);
  assert.equal(f.onPitch, 5);
  assert.equal(f.halfMinutes, config.rules.match.halfMinutes);
  assert.equal(f.burnSeconds, config.rules.heat.burnSeconds);
  assert.equal(f.warmSeconds, Math.round((config.rules.heat.burnSeconds * config.rules.heat.warmAt) / 100));
  assert.equal(f.teams, config.teams.teams.length);
  assert.equal(f.rounds, 2 * (config.teams.teams.length - 1));
  assert.equal(f.playoffTeams, config.rules.playoffs.teams);
  assert.equal(f.finalRoundMatches, config.teams.teams.length / 2);
});

test('a changed rule changes the text', () => {
  const changed = { ...config, rules: { ...config.rules, heat: { ...config.rules.heat, burnSeconds: 50 } } };
  const heat = rulebook(/** @type {any} */ (changed)).sections.find((s) => s.id === 'heat');
  assert.ok(heat?.rules.some((r) => r.includes('At 50 seconds the ball burns')));
});

test('blanks: numbers as words, and an unknown blank is an error', () => {
  assert.equal(fillFacts('{n|word} a side, {n} players', { n: 5 }), 'five a side, 5 players');
  assert.equal(fillFacts('{n|word}', { n: 40 }), '40');
  assert.throws(() => fillFacts('{nope}', { n: 5 }), /nope/);
});

test('About\'s guide (Task 172): a second tab, its numbers from the settings and the calendar', () => {
  const f = rulebookFacts(config);
  assert.equal(f.realMinutes, config.settings.match.realMinutes);
  assert.equal(f.matches, config.teams.teams.length * (config.teams.teams.length - 1));
  assert.match(String(f.liveEvery), /^\d+h \d\dm$|^\d+m$/);
  assert.equal(f.finalRoundDay, 6);
  const g = guide(config);
  assert.match(g.tab, /^[A-Z]{1,6}$/);
  assert.match(about(config).tab, /^[A-Z]{1,6}$/);
  // No clock times (local times are on the backlog): "14:00" would be the league's zone, not the viewer's.
  for (const s of g.sections) for (const i of s.items) assert.doesNotMatch(i.text, /\d:\d\d/, i.text);
});
