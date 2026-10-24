// The farewells and the draft lottery on air (the off-season show, Task 192; src/channel/offseasonShow.js, docs/channel.md
// §19.3–19.4): who's notable and what their card says, the lottery's odds and draw as the sim made them, their beats, and
// where they come in the night.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { groupEntries, guideKind } from '../src/channel/guide.js';
import { liftLength } from '../src/channel/trophyLift.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { draftPicks, lotteryBeats, lotteryLength, lotteryView, movesBeats, movesLength, movesView, notableRetirements, pickBeats, projection } from '../src/channel/offseasonShow.js';
import { talkContext, talkScript } from '../src/channel/talk.js';
import { createProgramme } from '../src/channel/programme.js';
import { reelClips } from '../src/channel/highlights.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { farewells: fw, lottery: lot } = config.settings;

test('notable retirements: long careers and awards (Tom), from a team, up to four, each award counted', () => {
  const ev = (/** @type {string} */ id, /** @type {number} */ seasons, reason = 'retired', teamId = 't-a') => /** @type {any} */ ({ type: 'retirement', season: 7, playerId: id, teamId, data: { reason, age: 33, position: 'D', seasonsPlayed: seasons } });
  const events = [ev('a', 7), ev('b', 4), ev('c', 6), ev('d', 2), ev('e', 9, 'unsigned'), ev('f', 8, 'retired', /** @type {any} */ (null)), ev('g', 3)];
  const history = [{ season: 3, awards: [{ award: 'quell', playerId: 'b' }] }, { season: 5, awards: [{ award: 'quell', playerId: 'b' }, { award: 'blaze', playerId: 'd' }] }];
  const list = notableRetirements(events, history, 7, { max: 4, awardWeight: 3 }, config.rules.awards, (id) => id.toUpperCase());
  // b: 4 + 2 awards × 3 = 10; a 7; c 6; d: 2 + 3 = 5. Not e (out of free agency) or f (no team).
  assert.deepEqual(list.map((f) => f.playerId), ['b', 'a', 'c', 'd']);
  assert.deepEqual(list[0].awards, ['2× THE QUELL']);
  assert.deepEqual(list[3].awards, ['THE BLAZE']);
  assert.equal(list[1].name, 'A');
});

/** The night after season 1's final. */
const cal = createCalendar(config);
const slots = cal.slots(1);
/** @type {Map<string, any>} */
const tls = new Map();
const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
const live = new LiveLeague(config, { now: slots[58].kickoff, seed: 'offseason-show-tests' });
const final = live.matchesIn(1)[58];
const end = final.kickoff + timelineOf(final).duration;
live.advanceTo(end + 90 * 60_000);

test('the lottery: the four who missed the playoffs, worst first at 40/30/20/10, and the sim\'s draw', () => {
  const summary = /** @type {any} */ (live.league.history.find((h) => h.season === 1));
  const v = lotteryView(live.leagueEvents, 1, summary, config.rules);
  const missed = summary.table.slice(config.rules.playoffs.teams).map((/** @type {any} */ r) => r.teamId).reverse();
  assert.deepEqual(v.odds.map((o) => o.teamId), missed);
  assert.deepEqual(v.odds.map((o) => o.pct), [40, 30, 20, 10]);
  assert.equal(v.odds[0].finished, summary.table.length, 'the worst first');
  const order = /** @type {any} */ (live.leagueEvents.find((e) => e.type === 'draft_lottery' && e.season === 1)).data.order;
  assert.deepEqual(v.picks, order.slice(0, 4));
  assert.deepEqual(new Set(v.picks), new Set(missed));
});

test('the lottery\'s beats: the odds, then each pick drawn in turn, last first, its row filled once it lands', () => {
  const at = (/** @type {number} */ s) => lotteryBeats(s * 1000, 4, lot);
  assert.deepEqual(at(1), { reveal: -1, into: 1000, shown: 0, dropping: 0 });
  assert.equal(at(lot.oddsSeconds + 1).reveal, 0);
  assert.equal(at(lot.oddsSeconds + lot.dropAt - 0.1).dropping, 0);
  assert.equal(at(lot.oddsSeconds + lot.dropAt + 1).shown, 1);
  assert.equal(at(lot.oddsSeconds + 3 * lot.revealSeconds + lot.dropAt + 1).shown, 4, 'the No. 1 last');
  assert.equal(lotteryLength(4, lot), (lot.oddsSeconds + 4 * lot.revealSeconds) * 1000);
});

test('the draft\'s picks: in order, the sim\'s, projected in words, home-grown marked', () => {
  const picks = draftPicks(live.leagueEvents, 1, live.league.players, live.league.teams, config.regions.regions);
  const events = live.leagueEvents.filter((e) => e.type === 'draft_pick' && e.season === 1);
  assert.equal(picks.length, events.length);
  assert.deepEqual(picks.map((p) => p.pick), events.map((e) => /** @type {any} */ (e.data).pick).sort((a, b) => a - b));
  for (const p of picks) {
    const pl = live.league.players[p.playerId];
    assert.equal(p.homeGrown, pl.region === live.league.teams[p.teamId].region);
    assert.ok(p.age >= 17 && p.age <= 22, `age ${p.age}`);
  }
  // The No. 1 is a headline prospect, good on arrival (Task 175): a star or a starter, ready now.
  assert.ok(['STAR PLAYER', 'STARTER'].includes(picks[0].projection.role) && picks[0].projection.when === 'READY TO PLAY NOW', JSON.stringify(picks[0].projection));
  assert.deepEqual(projection(50, 60), { role: 'LONG-TERM PROJECT', when: 'THREE SEASONS OR SO AWAY' });
  assert.deepEqual(projection(62, 78), { role: 'STARTER', when: 'A SEASON OR TWO AWAY' });
  // Round 1's beats: on the clock, the walk, the cut, then the kit and the card together a moment later (Task 198), the cheer.
  const d = config.settings.draft;
  assert.ok(!pickBeats(1000, d).closeUp && pickBeats(1000, d).walk === 0);
  assert.ok(pickBeats(d.cutAt * 1000, d).closeUp && pickBeats(d.cutAt * 1000, d).kit === 0 && pickBeats(d.cutAt * 1000, d).card === 0);
  assert.ok(d.kitAt > d.cutAt);
  const set = pickBeats((d.kitAt + 1) * 1000, d);
  assert.ok(set.kit === 1 && set.card === 1, 'the shirt and the card together');
});

test('after the awards: each farewell, the lottery, the draft, the off-season\'s talk, all inside the off-season, listed as OFF-SEASON', () => {
  const programme = createProgramme(live, timelineOf);
  /** @type {any[]} */
  const segs = [];
  for (let t = end; t < end + 60 * 60_000;) {
    const p = programme.pieceAt(t);
    segs.push({ ...p, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  const lastAward = segs.findLastIndex((x) => x.seg.kind === 'award');
  const farewells = segs.filter((x) => x.seg.kind === 'farewell');
  assert.ok(farewells.length > 0 && farewells.length <= fw.max);
  assert.equal(segs[lastAward + 1].seg.kind, 'farewell');
  farewells.forEach((x, i) => { assert.equal(x.seg.index, i); assert.equal(x.until - x.from, fw.perPlayerSeconds * 1000); });
  const li = segs.findIndex((x) => x.seg.kind === 'lottery');
  assert.equal(segs[li - 1].seg.kind, 'farewell');
  assert.equal(segs[li].until - segs[li].from, lotteryLength(4, lot));
  // The draft (Task 193): every pick in order, round 1 at round1Seconds, round 2 at round2Seconds; then the talk.
  const dr = config.settings.draft;
  const drafts = segs.filter((x) => x.seg.kind === 'draft');
  assert.equal(segs[li + 1].seg.kind, 'draft');
  assert.equal(drafts.length, 8 * config.rules.draft.rounds);
  drafts.forEach((x, i) => { assert.equal(x.seg.index, i); assert.equal(x.until - x.from, (i < 8 ? dr.round1Seconds : dr.round2Seconds) * 1000); });
  // The moves board (Task 194) after the draft, sized to its lines; the sign-off, then the off-season's talk.
  const mi = segs.indexOf(/** @type {any} */ (drafts.at(-1))) + 1;
  assert.equal(segs[mi].seg.kind, 'moves');
  assert.equal(segs[mi].until - segs[mi].from, movesLength(segs[mi].seg.lines, config.settings.moves));
  assert.ok(segs[mi + 1].seg.kind === 'talk' && segs[mi + 1].seg.topic === 'signoff', 'the sign-off after the moves');
  for (const x of [...farewells, segs[li], ...drafts, segs[mi], segs[mi + 1]]) assert.equal(guideKind(x.seg), 'offseason');
  // Task 195: the show ends with the sign-off (the off-season's talk and cards no longer follow), inside its length.
  assert.notEqual(segs[mi + 2].seg.kind, 'offseason');
  assert.ok(segs[mi + 1].until - farewells[0].from <= config.settings.segments.offseasonSummaryMinutes * 60_000);
});

test('the night after the show (Task 195): filler, then the final and the show in turn, ending on the show, every ad and the new season\'s countdown (Task 277b), up to the run-in', () => {
  const nextKickoff = cal.slots(2)[0].kickoff;
  const night = new LiveLeague(config, { now: end, seed: 'offseason-show-tests' });
  const programme = createProgramme(night, timelineOf);
  /** @type {any[]} */
  const segs = [];
  for (let t = end; t < nextKickoff;) {
    night.advanceTo(t);
    const p = programme.pieceAt(t);
    segs.push({ from: p.from, until: p.until, label: p.label, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  const signoff = segs.findIndex((x) => x.seg.kind === 'talk' && x.seg.topic === 'signoff');
  const after = segs.slice(signoff + 1);
  // The show as it aired: from the champions' talk to the sign-off.
  const showStart = segs.findIndex((x) => x.seg.kind === 'champion');
  const show = segs.slice(showStart, signoff + 1);
  // Each repeat: the same pieces, the same lengths and words, marked as a repeat.
  // (OFF THE BALL's SEASON REVIEW airing again is a repeat of its own.)
  const showRepeat = (/** @type {any} */ x) => Boolean(x?.seg.repeat && !x.seg.podcast);
  const firstOfRepeats = after.map((x, i) => (showRepeat(x) && !showRepeat(after[i - 1]) ? i : -1)).filter((i) => i >= 0);
  assert.ok(firstOfRepeats.length >= 2, `${firstOfRepeats.length} repeats of the show`);
  for (const i of firstOfRepeats) {
    const rep = after.slice(i, i + show.length);
    rep.forEach((x, k) => {
      assert.ok(x.seg.repeat, x.label);
      assert.equal(x.seg.kind, show[k].seg.kind);
      assert.equal(x.until - x.from, show[k].until - show[k].from, x.label);
      if (x.seg.kind === 'talk') assert.deepEqual(x.seg.script, show[k].seg.script, 'the same words');
      if (x.seg.kind === 'draft') assert.equal(x.seg.index, show[k].seg.index);
    });
    // The final re-aired before each, its trophy lift in the handshakes' place.
    const before = after.slice(0, i);
    const lift = before.findLast((x) => x.seg.kind === 'reair' && x.seg.part === 'handshakes');
    assert.ok(lift && lift.seg.lift && lift.seg.match.stage === 'final');
    assert.equal(lift.until - lift.from, liftLength(config.settings.trophyLift));
  }
  // Filler before the first final: highlights, never the final's.
  const firstReair = after.findIndex((x) => x.seg.kind === 'reair');
  assert.ok(after.slice(0, firstReair).every((x) => x.seg.kind !== 'reair' && x.seg.match?.stage !== 'final'));
  // After the last show: every ad straight away (Task 277b: no studio block, its cards a season out), then the run-in.
  const lastShow = after.findLastIndex((x) => x.seg.repeat);
  const tail = after.slice(lastShow + 1);
  assert.equal(tail[0].seg.kind, 'ads');
  const closing = tail.filter((x) => x.seg.kind === 'ads' && x.seg.part === 'ad');
  assert.equal(closing.length, config.ads.ads.filter((/** @type {any} */ a) => a.id !== 'playoffs_promo').length * config.settings.ads.closingSlates);
  assert.deepEqual(closing.map((x) => x.seg.ad), closing.map((_, i) => i), 'each ad once');
  const bumperOut = tail.findIndex((x) => x.seg.kind === 'ads' && x.seg.part === 'bumper_out');
  // Then the new season's countdown, about countdownSeconds, up to the ident.
  const countdown = tail[bumperOut + 1];
  assert.equal(countdown.seg.kind, 'countdown');
  assert.equal(countdown.seg.season, 2);
  assert.ok(Math.abs(countdown.until - countdown.from - config.settings.opening.countdownSeconds * 1000) <= 15_000, `${(countdown.until - countdown.from) / 1000} s`);
  assert.equal(tail[bumperOut + 2].seg.kind, 'ident', 'then the run-in');
  // Listed in the guide as repeats.
  const entries = groupEntries(segs.map((x) => ({ from: x.from, until: x.until, seg: x.seg })));
  assert.ok(entries.some((e) => e.kind === 'champions' && e.repeat) && entries.some((e) => e.kind === 'offseason' && e.repeat));
  assert.ok(entries.some((e) => e.kind === 'reair' && e.stage === 'final'));
});

test('the moves (Task 194): signings, then veteran releases most notable first, then call-ups; never this draft\'s picks or expired reserves', () => {
  const players = /** @type {Record<string, any>} */ ({});
  const P = (/** @type {string} */ id, o = {}) => (players[id] = { id, firstName: 'A', lastName: id.toUpperCase(), position: 'D', birthSeason: -20, joinedSeason: 1, region: 'r1', draft: null, ...o });
  const teams = { 't-a': { id: 't-a', shortName: 'Ants', region: 'r1' }, 't-b': { id: 't-b', shortName: 'Bees', region: 'r2' } };
  ['vet', 'old', 'rookie', 'expired', 'moved', 'signed'].forEach((id) => P(id));
  P('vet', { joinedSeason: 2 });
  P('up', { draft: { season: 3, round: 2, pick: 12, teamId: 't-a' } });
  const ev = (/** @type {string} */ type, /** @type {string} */ id, /** @type {string} */ teamId, data = {}) => /** @type {any} */ ({ type, season: 5, stage: 'offseason', playerId: id, teamId, data });
  const events = [
    ev('draft_pick', 'rookie', 't-a'),
    ev('call_up', 'up', 't-a', { reason: 'better' }),
    ev('release', 'old', 't-a', { reason: 'call_up' }), ev('release', 'vet', 't-b', { reason: 'roster' }),
    ev('release', 'rookie', 't-a', { reason: 'position' }), ev('release', 'expired', 't-a', { reason: 'rights_expired' }),
    ev('release', 'moved', 't-a', { reason: 'roster' }), ev('signing', 'moved', 't-b'), ev('signing', 'signed', 't-a'),
  ];
  const history = [{ season: 4, awards: [{ award: 'quell', playerId: 'vet' }, { award: 'quell', playerId: 'vet' }] }, { season: 6, awards: [{ award: 'quell', playerId: 'old' }] }];
  const awards = { list: [{ id: 'quell', name: 'The Quell' }] };
  const moves = movesView(events, 5, history, players, teams, awards, { maxLines: 10 }, 3);
  assert.deepEqual(moves.map((m) => `${m.kind} ${m.playerId}`), ['signed moved', 'signed signed', 'released vet', 'released old', 'called_up up']);
  assert.equal(moves[0].fromId, 't-a', 'released by the Ants, signed by the Bees');
  assert.equal(moves[1].fromId, null);
  assert.deepEqual(moves[2].awards, ['2× THE QUELL'], 'awards to this season only');
  assert.deepEqual(moves[3].awards, []);
  assert.equal(moves[3].seasons, 5);
  assert.deepEqual(moves[4].drafted, { season: 3, round: 2, pick: 12 });
  assert.equal(moves[4].seasons, 2, 'two seasons in the Kindling League');
  assert.equal(movesView(events, 5, history, players, teams, awards, { maxLines: 3 }, 3).length, 3);
});

test('the moves board\'s beats and length: a lead-in, a line a turn, pages of perPage', () => {
  const s = { leadSeconds: 2, lineSeconds: 10, tailSeconds: 4, minSeconds: 30, perPage: 3 };
  assert.equal(movesLength(1, s), 30_000);
  assert.equal(movesLength(6, s), 66_000);
  assert.deepEqual(movesBeats(1000, 6, s), { line: -1, into: 1000, page: 0 });
  assert.deepEqual(movesBeats(2500, 6, s), { line: 0, into: 500, page: 0 });
  assert.deepEqual(movesBeats(35_000, 6, s), { line: 3, into: 3000, page: 1 });
  assert.equal(movesBeats(65_000, 6, s).line, 5, 'the last line stays lit through the tail');
});

test('the draft marks the picks sent to the Kindling League; the sign-off names the new season\'s opener', () => {
  const season = live.league.history[0].season;
  const picks = draftPicks(live.leagueEvents, season, live.league.players, live.league.teams, config.regions.regions);
  const down = new Set(live.leagueEvents.filter((e) => e.type === 'reserve' && e.season === season).map((e) => e.playerId));
  assert.ok(down.size > 0);
  for (const pk of picks) assert.equal(pk.reserve, down.has(pk.playerId));
  const ctx = talkContext(live, timelineOf);
  const f = { id: 'x', homeId: 't-gulls', awayId: 't-anvils', stage: 'regular', season: season + 1, round: 1, kickoff: live.calendar.slots(season + 1)[0].kickoff, slot: 0 };
  const seg = /** @type {any} */ ({ kind: 'talk', topic: 'signoff', clip: null, match: final, group: [], next: f, from: end, until: end + 30_000 });
  const lines = /** @type {any[]} */ (talkScript(seg, live, end, ctx));
  assert.equal(lines.length, 3);
  assert.match(lines[1].text, /Gulls/);
  assert.match(lines[1].show, new RegExp(`SEASON ${season + 1} · MONDAY \\d\\d:\\d\\d · GULLS V ANVILS`));
  assert.ok(!/\d/.test(lines.map((l) => l.text).join(' ')), 'no numbers said aloud: the clips are made ahead');
});

test('Task 204: the music under the awards, farewells, lottery (softly), draft and moves, each unbroken run from its own start; not under the desk or the champions; the repeats shifted; under the studio cards too (Task 211)', () => {
  const nextKickoff = cal.slots(2)[0].kickoff;
  const night = new LiveLeague(config, { now: end, seed: 'offseason-show-tests' });
  const programme = createProgramme(night, timelineOf);
  /** @type {any[]} */
  const segs = [];
  for (let t = end; t < nextKickoff;) {
    night.advanceTo(t);
    const p = programme.pieceAt(t);
    segs.push({ from: p.from, until: p.until, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  const music = new Set(['award', 'farewell', 'lottery', 'draft', 'moves', 'studio']);
  const lead = config.settings.sound.music.studioLeadSeconds * 1000;
  for (const x of segs) {
    const has = typeof x.seg.musicFrom === 'number';
    if (music.has(x.seg.kind)) assert.ok(has, `${x.seg.kind} has music`);
    else assert.ok(!has, `${x.seg.kind}${x.seg.topic ? `:${x.seg.topic}` : ''} has none`);
  }
  // Each run: its pieces share one start, the first piece's own.
  for (let i = 0; i < segs.length; i++) {
    const x = segs[i];
    if (typeof x.seg.musicFrom !== 'number') continue;
    const prev = segs[i - 1];
    if (prev && music.has(prev.seg.kind) && prev.until === x.from) assert.equal(x.seg.musicFrom, prev.seg.musicFrom);
    // A run of studio cards starts it after the jingle.
    else assert.equal(x.seg.musicFrom, x.from + (x.seg.kind === 'studio' ? lead : 0), 'a run starts the loop at its own start');
  }
  // The awards through the lottery and the draft to the moves is one run (no talk between).
  const firstAward = segs.find((x) => x.seg.kind === 'award');
  const lastMoves = segs.find((x) => x.seg.kind === 'moves' && !x.seg.repeat);
  assert.equal(lastMoves.seg.musicFrom, firstAward.seg.musicFrom);
  // A repeat's runs start at the repeat's own times.
  const repeated = segs.find((x) => x.seg.kind === 'award' && x.seg.repeat);
  assert.ok(repeated && repeated.seg.musicFrom >= repeated.from - 5 * 60_000 && repeated.seg.musicFrom <= repeated.from);
  assert.ok(segs.some((x) => x.seg.kind === 'studio' && typeof x.seg.musicFrom === 'number'), 'the studio cards after the off-season have it');
});

test('Task 213: on the night after the final, the semis\' packages, then the playoffs\' reels (goals, saves, scorchers) twice round, then the semis again; each reel the playoffs\' moments of its kind in the order played', () => {
  const nextKickoff = cal.slots(2)[0].kickoff;
  const night = new LiveLeague(config, { now: end, seed: 'offseason-show-tests' });
  const programme = createProgramme(night, timelineOf);
  /** @type {any[]} */
  const segs = [];
  for (let t = end; t < nextKickoff;) {
    night.advanceTo(t);
    const p = programme.pieceAt(t);
    segs.push({ from: p.from, until: p.until, label: p.label, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  const signoff = segs.findIndex((x) => x.seg.kind === 'talk' && x.seg.topic === 'signoff');
  const firstReair = segs.findIndex((x, i) => i > signoff && x.seg.kind === 'reair');
  // (OFF THE BALL's SEASON REVIEW has the day's goals of its own.)
  const filler = segs.slice(signoff + 1, firstReair).filter((x) => x.seg.kind === 'highlights' && !x.seg.podcast);
  const playoffs = night.matchesIn(1).filter((m) => m.stage !== 'regular');
  const kinds = /** @type {const} */ (['goals', 'saves', 'scorchers']).filter((k) => reelClips(playoffs, k, timelineOf, config.settings.highlights).length > 0);
  const label = (/** @type {any} */ x) => x.seg.reel ? `reel:${x.seg.reel.kind}` : x.seg.match.id;
  // No regular-season package on the night any more; the semis (later first), the reels twice, the semis again (as they fit).
  assert.ok(filler.every((x) => x.seg.reel || x.seg.match.stage === 'semifinal'), filler.map(label).join(' '));
  const semis = ['s1-sf2', 's1-sf1'];
  const expected = [...semis, ...kinds.map((k) => `reel:${k}`), ...kinds.map((k) => `reel:${k}`), ...semis];
  assert.deepEqual(filler.map(label), expected.slice(0, filler.length));
  // Every reel once at least (twice as they fit: OFF THE BALL's SEASON REVIEW, twice, takes some of the night since 2026-10-20).
  assert.ok(filler.length >= semis.length + kinds.length, 'every reel once');
  for (const x of filler.filter((y) => y.seg.reel)) {
    const k = x.seg.reel.kind;
    assert.equal(x.seg.reel.title, config.settings.highlights.reels[k]);
    // Walk the reel: its clips in the order played, each naming its own match.
    const seen = [];
    for (let t = x.from; t < x.until; t += 500) {
      const s = programme.at(t);
      if (seen.at(-1)?.clip !== s.clip) seen.push({ clip: s.clip, match: s.match.id, at: s.elapsed });
    }
    const order = seen.map((c) => playoffs.findIndex((m) => m.id === c.match));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${k}: in the order played`);
    // Every clip holds a moment of its kind.
    for (const c of reelClips(playoffs, k, timelineOf, config.settings.highlights)) {
      const tl = timelineOf(c.match);
      const has = tl.events.some(({ event, at }) => at >= c.from && at <= c.to && (k === 'saves' ? event.type === 'save' : event.type === 'goal' && (k === 'goals' || /** @type {any} */ (event.data)?.scorcher)));
      assert.ok(has, `${k} clip with its moment`);
    }
  }
  // The TV guide lists each reel by its name.
  assert.ok(groupEntries(segs.slice(signoff + 1, firstReair)).some((e) => e.title === config.settings.highlights.reels.goals));
});

test('Task 213: a reel takes only its kind: every goal, the saves off hot shots, every scorcher', () => {
  const ms = live.matchesIn(1).filter((m) => m.stage !== 'regular');
  const opts = { ...config.settings.highlights, leadMs: 0, tailMs: 0 };
  const count = (/** @type {(e: any, ev: any[]) => boolean} */ f) => ms.reduce((n, m) => n + new Set(timelineOf(m).events.filter(({ event }) => f(event, timelineOf(m).events)).map(({ at }) => at)).size, 0);
  assert.equal(reelClips(ms, 'goals', timelineOf, opts).length, count((e) => e.type === 'goal'));
  assert.equal(reelClips(ms, 'scorchers', timelineOf, opts).length, count((e) => e.type === 'goal' && e.data?.scorcher));
  const saves = reelClips(ms, 'saves', timelineOf, opts).length;
  assert.ok(saves > 0 && saves < count((e) => e.type === 'save'), 'only the big saves');
});
