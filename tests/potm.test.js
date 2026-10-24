import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { potmCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { playerOfTheMatch, potmQuote, statLine, winnerOf } from '../src/channel/potm.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const slots = createCalendar(config).slots(1);
const live = new LiveLeague(config, { now: slots[slots.length - 1].kickoff, seed: 'potm-tests' });
const matches = live.matchesIn(1);
const { potm, quotes } = config.interviews;

test('the pick is the best weighted stat line, the same every time, and usually from the winning side', () => {
  let fromWinner = 0;
  let decided = 0;
  for (const m of matches) {
    const pick = playerOfTheMatch(m, potm);
    assert.deepEqual(playerOfTheMatch(m, potm), pick);
    assert.ok(pick.teamId === m.homeId || pick.teamId === m.awayId);
    // Nobody scores higher.
    for (const [id, s] of Object.entries(m.summary.playerStats)) {
      let score = 0;
      for (const [k, w] of Object.entries(potm.weights)) score += w * /** @type {any} */ (s)[k];
      if (s.teamId === winnerOf(m)) score += potm.winBonus;
      assert.ok(score <= pick.score + 1e-9, `${id} scores ${score} over the pick's ${pick.score}`);
    }
    const w = winnerOf(m);
    if (w) {
      decided++;
      if (pick.teamId === w) fromWinner++;
    }
  }
  assert.ok(fromWinner / decided > 0.7, `${fromWinner} of ${decided} from the winners`);
});

test('the stat line: goals with scorchers, assists, saves', () => {
  const base = { teamId: 't', started: true, secondsPlayed: 2400, goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0 };
  assert.equal(statLine({ ...base, goals: 2, scorchers: 1, assists: 1 }), '2 goals (1 scorcher) · 1 assist');
  assert.equal(statLine({ ...base, saves: 7 }), '7 saves');
  assert.equal(statLine({ ...base, goals: 1 }), '1 goal');
  assert.equal(statLine(base), 'A tireless shift');
});

test('quotes fit the role and result, with every placeholder filled', () => {
  const all = Object.values(quotes).flatMap((byResult) => Object.values(byResult).flat());
  for (const m of matches) {
    const pick = playerOfTheMatch(m, potm);
    const q = potmQuote(pick, m, quotes, { isKeeper: false, teamName: (id) => id.toUpperCase(), city: () => 'Somewhere' });
    assert.ok(!q.includes('{') && !q.includes('}'), q);
    assert.equal(q[0], q[0].toUpperCase());
    const outcome = winnerOf(m) === null ? 'draw' : winnerOf(m) === pick.teamId ? 'win' : 'loss';
    const role = pick.stats.goals > 0 ? 'scorer' : 'other';
    const templates = quotes[role][outcome];
    // A template matches if its fixed pieces (between placeholders) all appear in the quote, in order.
    const fits = (/** @type {string} */ t) => {
      let from = 0;
      for (const piece of t.toLowerCase().split(/\{\w+\}/)) {
        const at = q.toLowerCase().indexOf(piece, from);
        if (at < 0) return false;
        from = at + piece.length;
      }
      return true;
    };
    assert.ok(templates.some(fits), `"${q}" is a ${role}/${outcome} line`);
  }
  assert.ok(all.length >= 27);
});

test('the card: name, team, stat line and quote, never an empty quote', () => {
  const m = matches[3];
  const card = potmCard(m, live, 1000);
  assert.equal(card.kind, 'potm');
  assert.ok(card.name.includes(' '));
  assert.ok(card.stats.length > 0 && card.quote.length > 10);
  assert.equal(card.from, 1000);
});
