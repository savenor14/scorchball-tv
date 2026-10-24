// The talk at the desk (Tasks 99, 101; docs/channel.md §16.7): facts from real matches, and the scripts for the match, the
// final round, round the interview, the champions, the off-season, the gap clips and the tee-up, from real talk segments.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { playerOfTheMatch, winnerOf } from '../src/channel/potm.js';
import { createProgramme } from '../src/channel/programme.js';
import { lineTiming } from '../src/channel/studio.js';
import { matchFacts, talkScript, talkStage } from '../src/channel/talk.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const SEED = 'talk-tests';
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id, formatTime: (/** @type {number} */ t) => `DAY ${new Date(t).toISOString().slice(11, 16)}` };
const timing = lineTiming(config);

/** Every talk segment between `from` and `to`, with the league as it stood then. @param {number} from @param {number} to */
function talks(from, to) {
  const live = new LiveLeague(config, { now: from, seed: SEED });
  // With this file's names and times, so each talk is sized for the lines checked here (Task 187).
  const programme = createProgramme(live, timelineOf, ctx);
  /** @type {{ seg: any, script: any }[]} */
  const out = [];
  for (let t = from; t < to;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'talk') out.push({ seg, script: talkScript(seg, live, seg.from, ctx) });
    t = p.until > t ? p.until : t + 1000;
  }
  return { live, out };
}

/** What a line says and shows (Task 131: names, scores and times are on the graphic), in capitals. @param {any} l */
const seen = (l) => `${l.text} ${l.show ?? ''}`.toUpperCase();
/** A kind's said lines. @param {{ ways: { say: string }[] }} kind */
const says = (kind) => kind.ways.map((w) => w.say);

/**
 * Each line reads well: no blanks left, a capital first, inside the talk, time for its clip and a beat to read it
 * (Task 187: the bubble types at the clip's pace).
 * @param {any[]} script @param {any} seg
 */
function readable(script, seg) {
  const total = seg.until - seg.from;
  for (const l of script) {
    assert.ok(!/\{|\}|undefined|null/.test(`${l.text} ${l.show ?? ''}`), `filled: ${l.text} / ${l.show}`);
    assert.equal(l.text[0], l.text[0].toUpperCase());
    assert.ok(l.from >= 0 && l.until <= total && l.until > l.from);
    assert.ok(l.until - l.from >= timing.lengthMs(l, l.who) + timing.holdMs - 1, `time to say and read: ${l.text}`);
  }
  for (let i = 1; i < script.length; i++) assert.notEqual(script[i].who, script[i - 1].who, 'taking turns');
}

test('match facts from real matches: comebacks, late winners and hat-tricks are what the goals say', () => {
  const live = new LiveLeague(config, { now: slots[48].kickoff, seed: SEED });
  const lateFrom = 0.85 * 2 * config.rules.match.halfMinutes * 60;
  const seen = { comeback: 0, lateWinner: 0, hatTrick: 0, scorchers: 0, table: 0 };
  for (const m of live.matchesIn(1).filter((x) => x.summary)) {
    const f = matchFacts(m, live, ctx);
    const goals = timelineOf(m).events.filter((/** @type {any} */ e) => e.event.type === 'goal').map((/** @type {any} */ e) => e.event);
    const winner = winnerOf(m);
    // The winner's worst deficit, from the goals themselves.
    let worst = 0;
    for (const g of goals) worst = Math.min(worst, winner === m.homeId ? g.data.score[0] - g.data.score[1] : g.data.score[1] - g.data.score[0]);
    if (winner && m.summary.result.decidedBy !== 'shootout') assert.equal(Boolean(f.comeback), worst <= -2, `${m.id} comeback`);
    else assert.equal(f.comeback, null);
    if (f.lateWinner) {
      assert.ok(winner && m.summary.result.decidedBy === 'regulation');
      const minute = Number(f.lateWinner.minute.replace(/\D/g, ''));
      assert.ok((minute - 1) * 60 >= lateFrom - 60, `${m.id} late winner in the ${f.lateWinner.minute}`);
    }
    const most = Math.max(...Object.values(m.summary.playerStats).map((s) => s.goals));
    assert.equal(Boolean(f.hatTrick), most >= 3, `${m.id} hat-trick`);
    if (f.scorchers) assert.ok(m.summary.teamStats.home.scorchers + m.summary.teamStats.away.scorchers >= 3);
    if (f.winner) assert.equal(f.winner, live.league.teams[/** @type {string} */ (winner)].shortName);
    for (const k of /** @type {const} */ (['comeback', 'lateWinner', 'hatTrick', 'scorchers', 'table'])) if (f[k]) seen[k]++;
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `some matches have a ${k}`);
});

test('the post-match talk: the result, the story, a reaction, what it means; the interview tee-up names the player of the match', () => {
  const { live, out } = talks(calendar.instant(1, 1440), calendar.instant(1, 2 * 1440));
  const match = out.filter((x) => x.seg.topic === 'match');
  assert.ok(match.length >= 8);
  for (const { seg, script } of match) {
    // The result, the story, a reaction, what it means, and (Task 246a) what it means in the long run, if anything.
    assert.ok(script && script.length >= 3 && script.length <= 5, `${script?.length} lines`);
    readable(script, seg);
    const r = seg.match.summary.result;
    const f = matchFacts(seg.match, live, ctx);
    assert.ok(seen(script[0]).includes(f.home.toUpperCase()) && seen(script[0]).includes(f.away.toUpperCase()), `the result first: ${seen(script[0])}`);
    assert.ok(seen(script[0]).includes(f.score), 'with the score');
    assert.equal(script[0].gesture, 'open');
    assert.ok(r);
  }
  for (const { seg, script } of out.filter((x) => x.seg.topic === 'interview_tee_up')) {
    const pick = playerOfTheMatch(seg.match, config.interviews.potm);
    const p = live.league.players[pick.playerId];
    assert.equal(script.length, 1);
    assert.ok(seen(script[0]).includes(`${p.firstName} ${p.lastName}`.toUpperCase()), seen(script[0]));
    readable(script, seg);
  }
  for (const { seg, script } of out.filter((x) => x.seg.topic === 'wrap_up')) {
    assert.equal(script.length, 2);
    readable(script, seg);
  }
  // The welcome (Task 106): the day, where the season stands, today's first live match by name, then perhaps the leader.
  assert.ok(out.some((x) => x.seg.topic === 'welcome'), 'a welcome on day 2');
  for (const { seg, script } of out.filter((x) => x.seg.topic === 'welcome')) {
    readable(script, seg);
    assert.ok(script.length >= 3 && script.length <= 4);
    assert.ok(says(config.studio.lines.welcomeHello).includes(script[0].text));
    assert.ok(script.some((/** @type {any} */ l) => seen(l).includes(live.league.teams[seg.next.homeId].shortName.toUpperCase()) && seen(l).includes(live.league.teams[seg.next.awayId].shortName.toUpperCase())), 'names the first match');
  }
  // The same segment always says the same; different matches say different things.
  const again = talkScript(match[0].seg, live, match[0].seg.from, ctx);
  assert.deepEqual(again, match[0].script);
  assert.ok(new Set(match.map((x) => x.script.map(seen).join('|'))).size === match.length);
});

test('the final round: each result, the playoff four and the Shield, in its longer talk', () => {
  const kickoff = slots[52].kickoff;
  const { live, out } = talks(kickoff + 15 * 60_000, kickoff + 60 * 60_000);
  const round = out.find((x) => x.seg.topic === 'round');
  assert.ok(round, 'a round talk');
  const lines = round.script.map(seen);
  assert.equal(lines.length, 1 + 4 + 2);
  readable(round.script, round.seg);
  const table = /** @type {any} */ (live.league.teams);
  assert.ok(lines.at(-2).split(',').length >= 3, `the four: ${lines.at(-2)}`);
  assert.ok(Object.values(table).some((/** @type {any} */ t) => lines.at(-1).includes(t.shortName.toUpperCase())), 'the Shield winner');
});

test('after the final: the champions\' talk and the sign-off, from what the sim decided', () => {
  const final = slots.at(-1).kickoff;
  const { live, out } = talks(final + 15 * 60_000, final + 80 * 60_000);
  // No champions' talk after the final (Tom, after Task 258): the match talk crowns them.
  assert.ok(!out.some((x) => String(x.seg.topic) === 'champions'));
  const match = out.find((x) => x.seg.topic === 'match');
  const signoff = out.find((x) => x.seg.topic === 'signoff');
  assert.ok(match && signoff);
  readable(signoff.script, signoff.seg);
  const champ = live.league.teams[live.league.history[0].championId].shortName;
  assert.ok(match.script.some((/** @type {any} */ l) => String(l.text).includes(champ) || seen(l).includes(champ.toUpperCase())), 'the champions named in the match talk');
  assert.equal(signoff.script.length, 3);
  // The off-season's talk no longer follows the show (Task 195; removed, Task 207).
  assert.ok(!out.some((x) => String(x.seg.topic) === 'offseason'));
  // The wrap-up after the final leads into its highlights, as after any match.
  const wrap = out.find((x) => x.seg.topic === 'wrap_up');
  assert.ok(wrap && says(config.studio.lines.highlightsNext).includes(wrap.script[1].text));
});

test('gap clips (Task 101): standings, scorers and upcoming read well, never name a result, and vary by seed', () => {
  const { out } = talks(slots[20].kickoff, slots[30].kickoff);
  const clips = out.filter((x) => x.seg.topic === 'clip');
  const lines = config.studio.lines;
  /** @type {Record<string, number>} */
  const kinds = {};
  for (const { seg, script } of clips) {
    assert.ok(script && script.length >= 2 && script.length <= 4, `${seg.clip}: two to four lines`);
    readable(script, seg);
    // No scores at all, so nothing re-airing in the gap is spoiled (the table and the goal counts include it, §16.7).
    for (const l of script) assert.ok(!/\d+\s*-\s*\d+/.test(seen(l)), `no result: ${seen(l)}`);
    kinds[seg.clip] = (kinds[seg.clip] ?? 0) + 1;
  }
  assert.ok(kinds.standings > 0 && kinds.scorers > 0 && kinds.upcoming > 0, 'every kind of clip airs');
  // The standings clip opens with the leader; the reactions come in more than one way.
  const standings = clips.filter((x) => x.seg.clip === 'standings');
  assert.ok(standings.every((x) => ['standingsLeader', 'standingsLevel', 'standingsFinal'].includes(x.script[0].clip.kind)));
  const reactions = new Set(clips.map((x) => x.script.at(-1).text).filter((t) => says(lines.standingsReact).includes(t) || says(lines.scorersReact).includes(t)));
  assert.ok(reactions.size > 1, 'lines vary by seed');
  // The same segment always says the same.
  const live = new LiveLeague(config, { now: slots[30].kickoff, seed: SEED });
  for (const { seg, script } of clips.slice(0, 5)) assert.deepEqual(talkScript(seg, live, seg.from, ctx), script);
});

test('gap clips before a season\'s first goal fall back to what\'s coming up', () => {
  // From the end of the off-season into season 2, before its first match finishes.
  const { out } = talks(calendar.seasonStart(2) - 3600_000, calendar.slots(2)[0].kickoff);
  const lines = config.studio.lines;
  const clips = out.filter((x) => x.seg.topic === 'clip');
  assert.ok(clips.length > 0);
  for (const { seg, script } of clips) readable(script, seg);
  // In season 2 before its first match (whether a clip airs there depends on how the gap's talks fall, Task 187), each
  // kind of clip: what's coming up, not season 1's table or scorers.
  const t = calendar.seasonStart(2) + 10 * 60_000;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  for (const clip of ['standings', 'scorers', 'upcoming']) {
    const seg = /** @type {any} */ ({ kind: 'talk', topic: 'clip', clip, from: t, until: t + 45_000, match: null, group: [] });
    const script = /** @type {any[]} */ (talkScript(seg, live, t, ctx));
    readable(script, seg);
    if (clip === 'standings') assert.ok(says(lines.standingsEarly).includes(script[0].text));
    if (clip === 'scorers') assert.ok(says(lines.scorersNone).includes(script[0].text));
    assert.ok(script.some((/** @type {any} */ l) => /DAY \d\d:\d\d/i.test(seen(l))), 'shows when the next games are');
  }
});

test('the tee-up (Task 101): before every live match, both teams named first, kick-off in five minutes last', () => {
  const lines = config.studio.lines;
  const { out } = talks(slots[10].kickoff, slots.at(-1).kickoff);
  const teeUps = out.filter((x) => x.seg.topic === 'tee_up');
  assert.ok(teeUps.length >= 20);
  const stages = new Set();
  let places = 0;
  for (const { seg, script, } of teeUps) {
    readable(script, seg);
    const f = seg.next;
    const live = new LiveLeague(config, { now: seg.from, seed: SEED });
    const opening = script.slice(0, seg.group.length > 1 ? 2 : 1).map(seen).join(' ');
    assert.ok(opening.includes(live.league.teams[f.homeId].shortName.toUpperCase()) && opening.includes(live.league.teams[f.awayId].shortName.toUpperCase()), opening);
    assert.ok(says(lines.teeUpKickoff).includes(script.at(-1).text));
    stages.add(seg.group.length > 1 ? 'round' : f.stage);
    if (script.some((/** @type {any} */ l) => /\d(st|nd|rd|th)\b/i.test(seen(l)))) places++;
  }
  assert.deepEqual([...stages].sort(), ['final', 'regular', 'round', 'semifinal']);
  assert.ok(places > 10, 'table places once the season is under way');
});

test('in the playoffs the studio talks about the playoffs, not the settled table (Task 155)', () => {
  const sl = createCalendar(config).slots(1);
  const [sf1, sf2] = sl.filter((s) => s.stage === 'semifinal');
  const finalSlot = /** @type {any} */ (sl.find((s) => s.stage === 'final'));
  const lines = (/** @type {number} */ t, /** @type {'standings' | 'scorers'} */ clip) => {
    const live = new LiveLeague(config, { now: t, seed: 'talk-playoffs' });
    const seg = /** @type {any} */ ({ kind: 'talk', topic: 'clip', clip, from: t, until: t + 45_000, match: null });
    return (talkScript(seg, live, t, ctx) ?? []).map((l) => `${l.text}|${l.show ?? ''}`);
  };
  // One semifinal over (an hour after it kicked off, before the second): who's through, the other semifinal.
  const one = lines(Math.min(sf1.kickoff + 60 * 60_000, sf2.kickoff - 60_000), 'standings');
  assert.ok(one.some((l) => /into the final|on to the final/i.test(l)), one.join(' / '));
  assert.ok(one.some((l) => l.includes('SEMIFINAL ·')), 'the other semifinal on screen');
  // Both over, the final to come: the final set.
  const both = lines(finalSlot.kickoff - 30 * 60_000, 'standings');
  assert.ok(both.some((l) => l.includes('THE FINAL ·')), both.join(' / '));
  assert.ok(!both.some((l) => /top four|finished bottom/i.test(l)), 'no talk of the settled table');
  // The scorers clip: the playoffs' scorers too.
  assert.ok(lines(finalSlot.kickoff - 30 * 60_000, 'scorers').some((l) => l.includes('PLAYOFF SCORERS')));
});

test('after the regular season the desk never says a line that only makes sense mid-season or outside the knockouts (2026-10-18)', () => {
  const sl = createCalendar(config).slots(1);
  const lastRound = /** @type {any} */ (sl.filter((s) => s.stage === 'regular').at(-1));
  const { live, out } = talks(lastRound.kickoff, calendar.instant(2, 0));
  const lines = config.studio.lines;
  /** @type {Record<string, number>} */
  const stages = {};
  for (const { seg, script } of out) {
    const stage = talkStage(live, seg.from, ctx);
    stages[stage] = (stages[stage] ?? 0) + 1;
    for (const l of script ?? []) {
      const way = lines[l.clip.kind]?.ways[l.clip.way];
      if (way) assert.ok(!way.not?.includes(stage), `${stage}: ${l.clip.kind} "${l.text}"`);
    }
    const kinds = (script ?? []).map((/** @type {any} */ l) => l.clip.kind);
    if (seg.clip === 'scorers' && stage !== 'season') {
      assert.ok(!kinds.includes('scorersLeader'), `${stage}: the race is over: ${kinds}`);
      assert.ok(kinds.includes('scorersFinal') || kinds.includes('scorersShared'), `${stage}: how it finished: ${kinds}`);
    }
    if (stage === 'done') assert.ok(!kinds.includes('playoffsReact') && !kinds.includes('scorersPlayoffs'), `after the final: ${kinds}`);
    if (stage === 'done' && seg.clip === 'scorers') assert.ok(kinds.includes('seasonDoneReact'), `the season looked back on: ${kinds}`);
  }
  // Every stage from the final round's show to the night after the final came round.
  for (const s of ['settled', 'semis', 'finalSet', 'done']) assert.ok(stages[s] > 0, `${s}: ${JSON.stringify(stages)}`);
});
