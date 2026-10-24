import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTiming, presenters, sayer, studioScript, talkEnd, teamsForTalk, timeLines } from '../src/channel/studio.js';
import { figurePoses, setLayout } from '../src/channel/studioSet.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const regions = config.regions.regions;
const { looks, lines } = config.studio;
const teams = teamsForTalk(Object.fromEntries(config.teams.teams.map((/** @type {any} */ t) => [t.id, t])), config.studio.spokenTeam);
const facts = {
  result: { home: 'Sunhawks', away: 'Gulls', homeGoals: 7, awayGoals: 4 },
  leader: { name: 'Anvils', points: 12 },
  next: { home: 'Rime', away: 'Oasis', when: 'TUE 14:10' },
};
const timing = lineTiming(config);

test('the presenters: two different people, the same for the whole history, different in another league', () => {
  const [a, b] = presenters('flareball', regions, looks);
  // Their looks come from data/studio.json (Task 98); hair and ties from a stream of their own.
  for (const p of [a, b]) {
    assert.ok(looks.jackets.includes(p.shirt) && looks.ties.includes(p.tie) && looks.hair.includes(p.hair) && looks.hairStyles.includes(p.style));
  }
  assert.notEqual(a.name, b.name);
  assert.deepEqual(presenters('flareball', regions, looks), [a, b]);
  assert.notDeepEqual(presenters('another', regions, looks), [a, b]);
  // Who sits at the desk comes from the data (Task 132): Hedrek on the left in his seeded look, Ysolde (a woman, in a
  // bun) on the right in the other.
  const cast = config.studio.presenters;
  const [left, right] = presenters('flareball', regions, looks, cast);
  assert.deepEqual([left.name, right.name], ['Hedrek Vosper', 'Ysolde Stavik']);
  assert.equal(left.shirt, [a, b][cast[0].look].shirt);
  assert.ok(!left.woman && right.woman && right.style === 'bun');
  assert.ok(cast.every((/** @type {any} */ c) => c.voice));
});

test('the script: the result, a reaction, the top of the table and the next match, in turn, within the segment, the same every time', () => {
  const total = config.settings.segments.studioCardSeconds * 1000;
  const script = studioScript(facts, 's1', { total }, lines, teams, timing);
  assert.equal(script.length, 4);
  assert.deepEqual(script.map((l) => l.who), [0, 1, 0, 1], 'taking turns');
  // Said: the team, as spoken (Task 131); shown: the facts, in capitals.
  assert.match(script[0].text, /the Sunhawks/i);
  assert.match(String(script[0].show), /SUNHAWKS 7-4 GULLS/);
  assert.match(script[2].text, /the Anvils/i);
  assert.match(String(script[2].show), /ANVILS · 12 PTS/);
  assert.match(script[3].text, /the Rime/i);
  assert.match(String(script[3].show), /RIME v OASIS · TUE 14:10/i);
  // Each line names its clip: the kind, the way, and the team it names (if any).
  assert.deepEqual(script[0].clip, { kind: 'win', way: script[0].clip.way, team: 't-sunhawks' });
  assert.ok(lines.win.ways[script[0].clip.way].say.includes('{team}'));
  for (const l of script) {
    assert.ok(l.from >= 0 && l.until > l.from && l.until <= total, 'inside the segment');
    assert.ok(!/\{|\}/.test(l.text + (l.show ?? '')), 'no blanks left');
    assert.equal(l.text[0], l.text[0].toUpperCase(), 'starts with a capital');
    // Each line has time for its clip and a beat after (Task 187: it types at the clip's pace).
    assert.ok(l.until - l.from >= timing.lengthMs(l, l.who) + timing.holdMs - 1, `time to say and read: ${l.text}`);
  }
  for (let i = 1; i < script.length; i++) assert.ok(script[i].from >= script[i - 1].until, 'one at a time');
  assert.deepEqual(studioScript(facts, 's1', { total }, lines, teams, timing), script);
  // A draw, and a season with nothing played yet, still make sense.
  const draw = studioScript({ ...facts, result: { ...facts.result, awayGoals: 7 } }, 's2', { total }, lines, teams, timing);
  assert.match(String(draw[0].show), /7-7/);
  assert.deepEqual(studioScript({ result: null, leader: null, next: facts.next }, 's3', { total }, lines, teams, timing).length, 1);
});

test("lines are data: each says its kind's gesture, the result with an open hand, the leader by pointing at the screens", () => {
  const total = config.settings.segments.studioCardSeconds * 1000;
  const script = studioScript(facts, 's1', { total }, lines, teams, timing);
  assert.deepEqual(script.map((l) => l.gesture), [lines.win.gesture, lines.bigReaction.gesture, lines.leader.gesture, lines.next.gesture]);
  for (const kind of Object.values(lines)) {
    for (const way of kind.ways) {
      assert.ok(!/\{(?!\w+\})/.test(way.say + (way.show ?? '')), 'blanks are well formed');
      // Said lines are made ahead (vision §12): fixed, or naming the kind's subject team as {team}, or (Task 246a) a
      // player's surname as {surname}.
      assert.ok(/^[^{}]*(\{(team|surname)\}[^{}]*)?$/.test(way.say) && (!way.say.includes('{team}') || kind.subject), way.say);
    }
  }
});

test("set B's layout: everything inside its rect, 3× over the ground and 4× on the whole screen, the desk centred", () => {
  for (const R of [{ x: 0, y: 23, w: 394, h: 213 }, { x: 0, y: 0, w: 480, h: 270 }]) {
    const L = setLayout(R);
    assert.equal(L.scale, R.h >= 250 ? 4 : 3);
    const inside = (/** @type {any} */ r) => r.x >= R.x && r.y >= R.y && r.x + r.w <= R.x + R.w && r.y + r.h <= R.y + R.h;
    assert.ok(inside(L.screen) && inside(L.sides[0]) && inside(L.sides[1]));
    assert.ok(inside({ x: L.desk.x, y: L.deskTop, w: L.desk.w, h: L.desk.h }));
    assert.ok(Math.abs(L.desk.x + L.desk.w / 2 - (R.x + R.w / 2)) <= 1, 'centred (to a pixel)');
    // The presenters sit behind the desk, in front of the screen, side by side.
    for (const seat of L.seats) assert.ok(seat.y > R.y && seat.y + 17 * L.scale === L.deskTop && seat.x > L.desk.x && seat.x < L.desk.x + L.desk.w);
    assert.ok(L.seats[0].x < L.seats[1].x);
  }
});

test('who does what: the one talking gestures then talks, facing their partner (away when pointing at the screens); the other listens and nods', () => {
  const total = 40_000;
  // Lines of 6 s, longer than the gesture (most clips are about 2 s, so they're gestured through).
  const script = studioScript(facts, 's1', { total }, lines, teams, { ...timing, lengthMs: () => 6000 });
  const o = { gestureMs: 2600, nodEveryMs: 1400, charsPerSecond: 25 };
  const first = script[0];
  const [talker, listener] = figurePoses(script, first.from + 100, o);
  assert.equal(talker.pose, first.gesture);
  assert.equal(talker.facing, 1, 'presenter 0 faces right, to presenter 1');
  assert.ok(talker.mouth);
  assert.equal(listener.facing, -1);
  assert.ok(listener.pose === 'rest' || listener.pose === 'nod');
  assert.equal(figurePoses(script, first.from + 3000, o)[0].pose, 'talk', 'just talking after the gesture');
  const leader = script[2];
  const pointing = figurePoses(script, leader.from + 100, o)[leader.who];
  assert.ok(pointing.pose === 'point' && pointing.facing === (leader.who === 0 ? -1 : 1), 'turned to the screens');
  // The listener nods now and then.
  const nods = new Set(Array.from({ length: 30 }, (_, k) => figurePoses(script, first.from + k * 300, o)[1].pose));
  assert.ok(nods.has('nod') && nods.has('rest'));
  // Between lines (and before the first), both rest.
  assert.deepEqual(figurePoses(script, 0, o).map((p) => p.pose), ['rest', 'rest']);
});

test('the desk\'s pauses (Task 187): each line as long as its clip, a beat, then the next; the talk ends a beat after the last', () => {
  const total = 40_000;
  const script = studioScript(facts, 's1', { total }, lines, teams, timing);
  const [hedrek, ysolde] = config.studio.presenters;
  // Every line here has a recorded clip, in its speaker's voice, and runs for it.
  for (const l of script) {
    const key = `desk/${[hedrek, ysolde][l.who].id}/${l.clip.kind}-${l.clip.way}${l.clip.team ? `-${l.clip.team}` : ''}`;
    assert.ok(config.voiceLengths[key] > 0.3, `a clip for ${key}`);
    assert.ok(Math.abs(l.until - l.from - (config.voiceLengths[key] * 1000 + timing.holdMs)) < 1);
  }
  assert.equal(script[0].from, timing.leadMs);
  const graphics = script.filter((l) => l.show);
  assert.ok(graphics.length >= 2);
  for (let i = 1; i < script.length; i++) {
    const l = script[i];
    // A short gap, not a slot; longer only for a line with a graphic, to let the one up be read.
    const before = graphics.filter((g) => g.from < l.from).at(-1);
    const readBy = l.show && before ? before.from + timing.readMs(/** @type {string} */ (before.show)) : 0;
    assert.ok(Math.abs(l.from - Math.max(script[i - 1].until + timing.gapMs, readBy)) < 1, `line ${i} at ${l.from}`);
  }
  // Each graphic outlasts its line (Tom): up to the next graphic, the last to the talk's end, each long enough to read.
  const end = talkEnd(script, timing);
  graphics.forEach((l, i) => {
    assert.equal(l.showUntil, i + 1 < graphics.length ? graphics[i + 1].from : end);
    assert.ok(/** @type {number} */ (l.showUntil) - l.from >= timing.readMs(/** @type {string} */ (l.show)) - 1 && /** @type {number} */ (l.showUntil) >= l.until);
  });
  assert.ok(script.every((l) => l.show || l.showUntil === null));
  assert.ok(timing.readMs('ANVILS 2-1 GULLS') === config.settings.studio.showMinSeconds * 1000 && timing.readMs('X'.repeat(60)) > 3000);
  // Four lines of about 2 s need about 12–15 s, not the 40 there were.
  assert.ok(end > 6000 && end < 18_000, `${end} ms`);
  // A talk shorter than its lines need squeezes them in, in order, inside it.
  const tight = timeLines(script, 5000, timing);
  assert.ok(tight.every((l, i) => l.until <= 5000 && (i === 0 || l.from >= tight[i - 1].until)));
  // A line without a graphic doesn't wait: the graphic before stays up through it.
  const [a, b, c] = graphics.length >= 3 ? graphics : [graphics[0], script[1], graphics[1]];
  const mixed = timeLines([a, { ...b, show: null }, c], 40_000, timing);
  assert.ok(Math.abs(mixed[1].from - mixed[0].until - timing.gapMs) < 1, 'no wait for a line without a graphic');
  assert.equal(mixed[1].showUntil, null);
  assert.equal(mixed[0].showUntil, mixed[2].from, 'the first graphic stays up through the second line');
});

test('a talk never repeats a way until the others have had a turn: the final round\'s four results (Task 184)', () => {
  const lines = config.studio.lines;
  const name = config.teams.teams[0].shortName;
  for (const [kind, fill] of /** @type {const} */ ([['matchWin', { winner: name, loser: 'X', score: '2-1' }], ['matchDraw', { home: 'A', away: 'B', score: '1-1' }]])) {
    assert.ok(lines[kind].ways.length >= 5, `${kind}: enough ways for a final round of four`);
    for (let seed = 0; seed < 20; seed++) {
      const { said, say } = sayer(lines, `t${seed}`, teams);
      for (let i = 0; i < lines[kind].ways.length; i++) say(kind, fill);
      assert.equal(new Set(said.map((s) => s.clip.way)).size, lines[kind].ways.length, `${kind}, seed ${seed}: each way once`);
    }
  }
});
