// The interview's two sentences (Task 245; src/channel/interviewTalk.js): the fact spoken to is the player's own or
// their team's, fits the result, and the words keep Tom's rules (first person, gender-neutral, no numbers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectFacts } from '../src/chronicle/factsLeague.js';
import { factKey, interviewFact, interviewTalk } from '../src/channel/interviewTalk.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const data = config.interviews;
const { chronicle, after } = collectFacts(config, 'interview-tests', 12);

/** Every fact kind the module can give, and the variants the interview keys by. */
const KINDS = Object.keys(config.chronicle.facts.weights);

test('every sentence keeps the rules: gender-neutral, no numbers, a known fact', () => {
  const sentences = [...Object.values(data.reactions).flat(), ...Object.values(data.facts).flat().map((/** @type {any} */ w) => w.say)];
  for (const say of sentences) {
    assert.doesNotMatch(say, /\b(he|she|his|her|hers|him|himself|herself|lads|guys|girls|boys)\b/i, say);
    assert.doesNotMatch(say, /\d/, say);
  }
  for (const key of Object.keys(data.facts)) assert.ok(KINDS.includes(key.split('.')[0]), key);
  for (const r of /** @type {const} */ (['win', 'draw', 'loss'])) assert.ok(data.reactions[r].length >= 3, r);
});

test('the player of the match speaks to their own fact or their team\'s, one that fits the result', () => {
  let spoken = 0;
  for (const x of after) {
    if (!x.potm) continue;
    const m = /** @type {any} */ (chronicle.matches.get(x.matchId));
    const outcome = m.winnerId === null ? 'draw' : m.winnerId === x.potm.teamId ? 'win' : 'loss';
    const who = { matchId: m.id, playerId: x.potm.playerId, teamId: x.potm.teamId, outcome: /** @type {const} */ (outcome) };
    const talk = interviewTalk(x.facts, who, data);
    if (!talk) {
      // Nothing to say: no fact of theirs has a sentence for this result.
      assert.equal(interviewFact(x.facts, who, data.facts), null);
      continue;
    }
    spoken++;
    const f = talk.fact;
    assert.ok(f.playerId === who.playerId || (f.teamId === who.teamId && !['first_goal', 'milestone', 'record', 'old_club', 'likely_last'].includes(f.kind)), f.kind);
    const way = data.facts[factKey(f)].find((/** @type {any} */ w) => w.say === talk.sentences[1].say);
    assert.ok(way.results.includes(outcome));
    assert.ok(data.reactions[outcome].includes(talk.sentences[0].say));
    // The heaviest that fits.
    assert.ok(x.facts.every((g) => g.weight <= f.weight || interviewFact([g], who, data.facts) === null));
    // The same match, the same words.
    assert.deepEqual(interviewTalk(x.facts, who, data), talk);
  }
  const share = spoken / after.length;
  assert.ok(share > 0.3 && share < 0.8, `${share} of interviews speak to a fact`);
});

test('the clips\' keys: a reaction by result, a fact by its key and way', () => {
  const f = /** @type {any} */ ({ kind: 'old_club', weight: 7, playerId: 'p', teamId: 't', how: 'let_go' });
  const talk = /** @type {any} */ (interviewTalk([f], { matchId: 'm1', playerId: 'p', teamId: 't', outcome: 'win' }, data));
  assert.match(talk.sentences[0].key, /^reaction-win-\d$/);
  assert.match(talk.sentences[1].key, /^fact-old_club-let_go-\d$/);
  assert.equal(interviewTalk([f], { matchId: 'm1', playerId: 'p', teamId: 't', outcome: 'loss' }, data), null, 'no old-club line after a loss');
  assert.equal(interviewTalk([f], { matchId: 'm1', playerId: 'q', teamId: 't', outcome: 'win' }, data), null, 'a teammate does not speak to it');
});

test('the fact strip (Task 247a): words for every fact the interview speaks to, every blank filled', () => {
  for (const key of Object.keys(data.facts)) assert.ok(data.strip[key], `strip words for ${key}`);
});
