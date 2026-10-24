import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { potmCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { playerOfTheMatch, potmQuote, quoteChoice } from '../src/channel/potm.js';
import { deskClipUrl, interviewClipUrl, interviewVoice, typingSpeed } from '../src/channel/speech.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const regions = config.regions.regions;

test("a desk line's clip: the presenter, the kind and the way, and the team when it names one", () => {
  assert.equal(deskClipUrl('hedrek', { kind: 'win', way: 1, team: 't-gulls' }), 'assets/voices/desk/hedrek/win-1-t-gulls.mp3');
  assert.equal(deskClipUrl('ysolde', { kind: 'storyPlain', way: 0, team: null }), 'assets/voices/desk/ysolde/storyPlain-0.mp3');
});

test("the interview's voice: the player's birth region, a woman's for a woman's name, a man's otherwise", () => {
  for (const r of regions) {
    const woman = r.womensNames[0];
    const man = r.firstNames.find((/** @type {string} */ n) => !r.womensNames.includes(n));
    assert.equal(interviewVoice({ firstName: woman, region: r.id }, regions), `${r.id}-woman`);
    assert.equal(interviewVoice({ firstName: man, region: r.id }, regions), `${r.id}-man`);
    // Every region has both voices in the data.
    assert.ok(config.interviews.voices[r.id].man.voice && config.interviews.voices[r.id].woman.voice);
  }
  assert.equal(interviewVoice(undefined, regions), null);
  assert.equal(interviewVoice({ firstName: 'X', region: 'nowhere' }, regions), null);
  assert.equal(interviewClipUrl('kettle-woman', 'keeper-draw-2'), 'assets/voices/interview/kettle-woman/keeper-draw-2.mp3');
});

test("a match's quote and its clip agree: the key names the line shown, said in the player's own voice", () => {
  const slots = createCalendar(config).slots(1);
  const live = new LiveLeague(config, { now: slots[30].kickoff, seed: 'speech-tests' });
  const quotes = config.interviews.quotes;
  const matches = live.matchesIn(1).filter((m) => m.summary).slice(0, 20);
  assert.ok(matches.length >= 20);
  const voices = new Set();
  for (const m of matches) {
    const pick = playerOfTheMatch(m, config.interviews.potm);
    const player = live.league.players[pick.playerId];
    const isKeeper = player?.position === config.positions.keeper;
    const { line, key } = quoteChoice(pick, m, quotes, isKeeper);
    const [role, result, i] = key.split('-');
    assert.equal(quotes[role][result][Number(i)], line);
    assert.equal(potmQuote(pick, m, quotes, { isKeeper, teamName: (id) => id, city: (id) => id }), line);
    const card = potmCard(m, live, m.kickoff);
    // Task 247a: the canned quote as one part, or a reaction and a fact, each a clip of its own.
    if (card.fact) {
      assert.equal(card.parts.length, 2);
      assert.match(card.parts[0].key, /^reaction-(win|draw|loss)-\d$/);
      assert.match(card.parts[1].key, /^fact-[a-z_-]+-\d$/);
      assert.equal(card.quote, `${card.parts[0].text} ${card.parts[1].text}`);
      // Its strip, every blank filled (Task 247a).
      assert.ok(card.factStrip && !/[{}]/.test(card.factStrip) && card.factStrip === card.factStrip.toUpperCase(), String(card.factStrip));
    } else {
      assert.deepEqual(card.parts, [{ text: line, key }]);
      assert.equal(card.quote, line);
      assert.equal(card.quoteKey, key);
    }
    assert.equal(card.voice, interviewVoice(player, regions));
    voices.add(card.voice);
  }
  assert.ok(voices.size > 2, `several voices across matches: ${[...voices]}`);
});

test('typing keeps pace with the voice when its clip is loaded, the usual speed otherwise', () => {
  assert.equal(typingSpeed(40, 2, 25), 20);
  assert.equal(typingSpeed(40, null, 25), 25);
  assert.equal(typingSpeed(40, 0.1, 25), 25);
});
