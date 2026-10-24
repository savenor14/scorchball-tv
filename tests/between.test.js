// The running order between matches (Task 95; docs/channel.md §16): every gap fills exactly, the show keeps its
// length, ads keep their spacing, talk never repeats the post-match bit, the opening comes once a day, the same seed
// gives the same order, and transitions sit on the edges between pictures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme, groundOf } from '../src/channel/programme.js';
import { lineTiming, talkEnd } from '../src/channel/studio.js';
import { talkContext, talkScript } from '../src/channel/talk.js';
import { createTimeline } from '../src/channel/timeline.js';
import { pictureOf, transitionAt } from '../src/channel/transitions.js';
import { identLanding } from '../src/channel/spotArt.js';
import { sceneRect } from '../src/channel/scene.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { segments, ads, studio, transitions } = config.settings;
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const MIN = 60_000;
const SEED = 'between-tests';

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);

/**
 * The running order from `from` to `to`, piece by piece, with the segment at each piece's start.
 * @param {number} from @param {number} to
 */
function rundown(from, to, seed = SEED) {
  const live = new LiveLeague(config, { now: from, seed });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ label: string, from: number, until: number, seg: any }[]} */
  const rows = [];
  for (let t = from; t < to;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    rows.push({ ...p, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  return { rows, programme, live };
}

const day2 = rundown(calendar.instant(1, 1440), calendar.instant(1, 2 * 1440));

test('every part follows the last with no gap or overlap, and each gap ends with the tee-up right at the pre-match', () => {
  const { rows } = day2;
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].from, rows[i - 1].until, `${rows[i - 1].label} → ${rows[i].label}`);
  const preMatches = rows.filter((r) => r.label.startsWith('pre-match'));
  assert.ok(preMatches.length >= 8);
  for (const p of preMatches) {
    const before = rows[rows.indexOf(p) - 1];
    assert.equal(before.label, 'talk · tee-up');
    // As long as its lines need (Task 187), teeUpSeconds at most.
    assert.ok(before.until - before.from > 0 && before.until - before.from <= studio.teeUpSeconds * 1000);
  }
});

test('the post-match show keeps its length: from the full-time card to the end of its block is postMatchMinutes', () => {
  const { rows } = day2;
  for (const ft of rows.filter((r) => r.label === 'full time')) {
    const i = rows.indexOf(ft);
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].seg.show) j++;
    // The show runs on from the full-time card, every part flagged, and ends exactly postMatchMinutes later.
    assert.equal(rows[j].until - ft.from, segments.postMatchMinutes * MIN, `show from ${new Date(ft.from).toISOString()}`);
    const labels = rows.slice(i, j + 1).map((r) => r.label);
    assert.deepEqual(labels.slice(0, 5), ['full time', 'talk · match', 'talk · interview tee-up', 'interview', 'talk · wrap-up']);
    assert.ok(labels.includes('ads · bumper in'), 'the show\'s block always has an ad break');
  }
});

test('the desk\'s pauses (Task 187): every talk runs as long as its lines need, its most length at most, and says what the channel shows', () => {
  const { rows, live } = day2;
  const timing = lineTiming(config);
  const most = /** @type {Record<string, number>} */ ({
    match: studio.matchTalkSeconds, round: studio.roundTalkSeconds, interview_tee_up: studio.interviewTeeUpSeconds, wrap_up: studio.wrapUpSeconds,
    clip: studio.clipSeconds, tee_up: studio.teeUpSeconds, welcome: config.settings.opening.talkSeconds,
  });
  // OFF THE BALL's episodes are talks of their own, sized in tests/podcast.test.js.
  const talks = rows.filter((r) => r.seg.kind === 'talk' && !r.seg.podcast);
  assert.ok(talks.length > 50);
  /** @type {number[]} */
  const matchTalks = [];
  for (const r of talks) {
    const { seg } = r;
    const length = r.until - r.from;
    assert.ok(Array.isArray(seg.script) && seg.script.length > 0, `${r.label}: its lines are on the segment`);
    assert.ok(length <= most[seg.topic] * 1000, `${r.label}: ${length} ms`);
    // To its last line and a beat (the welcome waits for the jingle first, inside its lines' times).
    assert.ok(Math.abs(length - Math.ceil(talkEnd(seg.script, timing))) <= 1, `${r.label}: ${length} ms for lines ending ${seg.script.at(-1).until}`);
    // The same lines the channel works out for that segment.
    assert.deepEqual(talkScript(seg, live, seg.wordsAt ?? seg.from, talkContext(live, timelineOf)), seg.script);
    if (seg.topic === 'match') matchTalks.push(length);
  }
  // The match talk ran 40 s for about 10 s of speech; now about 10–15 s.
  const mean = matchTalks.reduce((a, b) => a + b, 0) / matchTalks.length;
  assert.ok(mean > 8000 && mean < 20_000, `match talk ${Math.round(mean)} ms on average`);
});

test('ad breaks: whole (bumpers and the ads), at least minGapMinutes apart, never inside a match, re-air or package', () => {
  const { rows } = day2;
  const starts = rows.filter((r) => r.label === 'ads · bumper in');
  assert.ok(starts.length >= 20, `${starts.length} breaks in a day`);
  for (const s of starts) {
    const i = rows.indexOf(s);
    const parts = rows.slice(i, i + ads.perBreak + 2).map((r) => r.label);
    // The day's rows can end partway through its last break.
    if (i + ads.perBreak + 2 > rows.length) continue;
    assert.deepEqual(parts, ['ads · bumper in', ...Array.from({ length: ads.perBreak }, (_, k) => `ads · ad ${k + 1}`), 'ads · bumper out']);
    const before = rows[i - 1].label;
    assert.ok(!before.startsWith('live') && !before.startsWith('pre-match') && before !== 'walk-out', `an ad break after ${before}`);
  }
  // Spaced: between two breaks with no live match in between, at least minGapMinutes.
  for (let k = 1; k < starts.length; k++) {
    const between = rows.slice(rows.indexOf(starts[k - 1]), rows.indexOf(starts[k]));
    if (between.some((r) => r.label.startsWith('live'))) continue;
    assert.ok(starts[k].from - starts[k - 1].from >= ads.minGapMinutes * MIN, 'spaced');
  }
});

test('talk: the match talk once per live match and never in the gap; gap clips never the same kind twice running', () => {
  const { rows } = day2;
  const lives = rows.filter((r) => r.label.startsWith('live'));
  const matchTalk = rows.filter((r) => r.seg.kind === 'talk' && (r.seg.topic === 'match' || r.seg.topic === 'round'));
  assert.equal(matchTalk.length, rows.filter((r) => r.label === 'full time').length);
  for (const t of matchTalk) assert.ok(t.seg.show, 'only in the post-match show');
  assert.ok(lives.length >= 8);
  // Within each slot, clip kinds alternate.
  let prev = null;
  for (const r of rows) {
    if (r.label.startsWith('live')) prev = null;
    if (r.seg.kind === 'talk' && r.seg.topic === 'clip') {
      assert.notEqual(r.seg.clip, prev, `${r.seg.clip} twice running`);
      prev = r.seg.clip;
    }
  }
  // Re-airs never get the desk talk: after a re-air's interview comes a studio block.
  for (const r of rows.filter((x) => x.label.endsWith('· interview') && x.label.startsWith('re-air'))) {
    // The day can end on a re-air's interview.
    const next = rows[rows.indexOf(r) + 1]?.label;
    if (next === undefined) continue;
    assert.ok(next.startsWith('ads') || next.startsWith('talk · ') && !next.includes('match') || next.startsWith('card'), `after a re-air's interview: ${next}`);
  }
});

test('the channel\'s opening: once a day, right before the tee-up of the first live match from 06:00', () => {
  const { rows } = day2;
  const idents = rows.filter((r) => r.label === 'opening · ident');
  assert.equal(idents.length, 1);
  const i = rows.indexOf(idents[0]);
  assert.deepEqual(rows.slice(i, i + 3).map((r) => r.label), ['opening · ident', 'opening · welcome', 'talk · tee-up']);
  const six = calendar.instant(1, 1440 + 6 * 60);
  const teeUps = rows.filter((r) => r.label === 'talk · tee-up').map((r) => r.from);
  assert.equal(rows[i + 2].from, Math.min(...teeUps.filter((x) => x >= six)), 'the first tee-up from 06:00');
});

test('the same seed gives the same running order; another seed a different one', () => {
  const from = calendar.instant(1, 1440);
  const to = from + 6 * 60 * MIN;
  const a = rundown(from, to).rows.map((r) => `${r.from}|${r.label}`);
  const b = rundown(from, to).rows.map((r) => `${r.from}|${r.label}`);
  assert.deepEqual(a, b);
  const c = rundown(from, to, 'another seed').rows.map((r) => `${r.from}|${r.label}`);
  assert.notDeepEqual(a, c);
});

test('after the final: the champions opening with talk, the show to the sign-off, then the night of repeats', () => {
  const final = slots.at(-1).kickoff;
  const { rows } = rundown(final, final + 6 * 60 * MIN);
  const labels = rows.map((r) => r.label);
  // Tom (after Task 258): the wrap-up, then the final's highlights, then the champions' cards with no talk before them.
  const i = labels.indexOf('champions');
  assert.ok(i > 0);
  assert.equal(labels[i - 2], 'talk · wrap-up');
  assert.ok(labels[i - 1].startsWith('highlights · ') && labels[i - 1].endsWith('-f'), labels[i - 1]);
  assert.ok(!labels.includes('talk · champions'));
  assert.equal(labels[i + 1], 'talk · awards');
  const j = labels.indexOf('talk · sign-off');
  assert.ok(j > i);
  assert.ok(labels.slice(j).some((l) => l.startsWith('re-air')) && labels.slice(j).some((l) => l.startsWith('repeat ·')), 're-airs and repeats after the show');
});

test('transitions: the glass sweep on the stadium side of every edge with the scene, the band centred on cuts and between clips, the package opening with its name', () => {
  const { rows, programme } = day2;
  const at = (/** @type {number} */ t) => programme.at(t);
  const { sceneMs, clipStingMs, openStingSeconds, cutMs } = transitions;
  let into = 0;
  let out = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1].seg;
    const b = rows[i].seg;
    const edge = rows[i].from;
    if (b.kind === 'highlights' || a.kind === 'live') continue;
    const pa = pictureOf(a);
    const pb = pictureOf(b);
    if (pa === pb) continue;
    const before = transitionAt(at, edge - 100, transitions);
    const after = transitionAt(at, edge + 100, transitions);
    if (pa === 'stadium') {
      // Into the scene: over the stadium's last sceneMs, nearly done just before the edge, gone after it.
      assert.equal(before?.kind, 'into_scene', `${rows[i - 1].label} → ${rows[i].label}`);
      assert.ok(before && before.p > 1 - 200 / sceneMs && before.edge === edge);
      assert.equal(transitionAt(at, edge - sceneMs + 50, transitions)?.kind, 'into_scene', 'starts sceneMs before');
      assert.ok(after === null || after.kind !== 'into_scene');
      into++;
    } else if (pb === 'stadium') {
      // Out of it: over the stadium's first sceneMs, just begun after the edge.
      assert.equal(after?.kind, 'out_of_scene', `${rows[i - 1].label} → ${rows[i].label}`);
      assert.ok(after && after.p < 200 / sceneMs && after.edge === edge);
      assert.ok(before === null || before.kind !== 'out_of_scene');
      out++;
    } else {
      // The desk and the interview: the band, centred on the edge.
      assert.equal(before?.kind, 'cut');
      assert.ok(before && after && before.q < 0.5 && after.q > 0.5 && Math.abs(before.edge - edge) < 1);
      assert.ok(cutMs > 200);
    }
  }
  assert.ok(into > 10 && out > 10, `${into} sweeps in and ${out} out in a day`);
  // Into a package: the band comes down just before it, holds on the name, lifts openStingSeconds after it starts.
  const pkg = rows.find((r) => r.seg.kind === 'highlights' && r.seg.clips > 1 && rows.indexOf(r) > 0 && !rows[rows.indexOf(r) - 1].label.startsWith('live'));
  assert.ok(pkg);
  const down = transitionAt(at, pkg.from - clipStingMs / 4, transitions);
  assert.ok(down?.kind === 'open_sting' && down.q > 0 && down.q < 0.5 && !down.title);
  const held = transitionAt(at, pkg.from + 500, transitions);
  assert.ok(held?.kind === 'open_sting' && held.q === 0.5 && held.title && held.match?.id === pkg.seg.match.id);
  const lifting = transitionAt(at, pkg.from + openStingSeconds * 1000 - clipStingMs / 4, transitions);
  assert.ok(lifting?.kind === 'open_sting' && lifting.q > 0.5 && !lifting.title);
  // Between clips: the band centred on the cut.
  const second = /** @type {any} */ (at(pkg.from + 1)).clipUntil;
  const a = transitionAt(at, second - 50, transitions);
  const b = transitionAt(at, second + 50, transitions);
  assert.ok(a?.kind === 'clip_sting' && b?.kind === 'clip_sting' && a.q < 0.5 && b.q > 0.5 && a.edge === second);
  // Away from any edge, nothing.
  const mid = rows.find((r) => r.label.startsWith('live'));
  assert.equal(transitionAt(at, (mid.from + mid.until) / 2, transitions), null);
});

test('no transition at kick-off or during a match, with the league only as far as "now" (as on the channel)', () => {
  // Tom found a sweep over the end of every walk-out: looking ahead to the kick-off, before that match was played.
  for (const i of [0, 1, 4]) {
    const k = slots[i].kickoff;
    const live = new LiveLeague(config, { now: k - 5000, seed: SEED });
    const programme = createProgramme(live, timelineOf);
    for (let t = k - 3000; t < k + 3000; t += 100) {
      live.advanceTo(t);
      assert.equal(transitionAt(programme.at, t, transitions), null, `at ${t - k} ms from kick-off ${i}`);
    }
    // The match's own breaks (half-time) and its end, up to the whistle.
    const m = /** @type {any} */ (live.matchesIn(1).find((x) => x.kickoff === k));
    const tl = timelineOf(m);
    for (const b of tl.breaks) {
      for (let e = b.from - 1500; e < b.to + 1500; e += 100) {
        live.advanceTo(k + e);
        assert.equal(transitionAt(programme.at, k + e, transitions), null, `at ${e} ms into match ${m.id}`);
      }
    }
  }
});

test('calendar checks count the run-in: a tee-up too long for the gaps is rejected', () => {
  // Matches 47 minutes apart: room for everything with the usual run-in (about 45 minutes in all), but not with a
  // ten-minute tee-up.
  const tight = structuredClone(config);
  tight.settings.calendar.finalRoundKickoff = 'day 2 17:14';
  const crowded = (/** @type {any} */ c) => validateConfig(c).some((e) => e.includes('regular-season matches would be'));
  assert.equal(crowded(tight), false);
  const bad = structuredClone(tight);
  bad.settings.studio.teeUpSeconds = 600;
  assert.equal(crowded(bad), true);
  const show = structuredClone(config);
  show.settings.studio.roundTalkSeconds = 600;
  assert.ok(validateConfig(show).some((e) => e.includes('post-match show')));
});

test('the run-in (Task 103): the scene lifts off the next home ground, which the pre-match and walk-out show, the match that kicks off', () => {
  const from = slots[2].kickoff - 30 * MIN;
  const to = slots[6].kickoff + 10;
  const live = new LiveLeague(config, { now: from, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  let preMatches = 0;
  for (let t = from; t < to; t += 15_000) {
    live.advanceTo(t);
    const seg = programme.at(t);
    const g = groundOf(seg);
    if (seg.kind === 'pre_match' || seg.kind === 'walk_out') {
      assert.equal(g, seg.fixture);
      // The ground shown is the one the next kick-off is played at.
      const next = calendar.slots(1).find((s) => s.kickoff === seg.fixture.kickoff);
      assert.ok(next);
      if (seg.kind === 'pre_match') {
        preMatches++;
        // Into the pre-match from the tee-up talk: the sweep lifting the scene, over the pre-match's first sceneMs.
        const before = programme.at(seg.until - segments.preMatchMinutes * MIN - 1);
        assert.equal(before.kind, 'talk');
        assert.equal(/** @type {any} */ (before).topic, 'tee_up');
      }
    } else if (seg.kind === 'handshakes') assert.equal(g, seg.match);
    else if (seg.kind === 'reair' && (seg.part === 'lineup' || seg.part === 'handshakes')) assert.equal(g, seg.match);
    else assert.equal(g, null, seg.kind);
  }
  assert.ok(preMatches > 0);
  // The sweep at the pre-match's start.
  const k = slots[4].kickoff;
  const edge = k - (segments.preMatchMinutes + segments.walkOutMinutes) * MIN;
  const lateLive = new LiveLeague(config, { now: edge + 100, seed: SEED });
  const tr = transitionAt(createProgramme(lateLive, timelineOf).at, edge + 100, transitions);
  assert.equal(tr?.kind, 'out_of_scene');
});

test('highlights units in the gap (Task 104): after the re-airs, recent matches already played, the one just shown last, each opening with its name', () => {
  // Day 2, and the long gaps after the final round and the knockouts.
  const regular = calendar.regularCount;
  const late = rundown(slots[regular - 1].kickoff - 30 * MIN, slots[regular + 2].kickoff);
  let units = 0;
  for (const { rows } of [day2, late]) {
    /** @type {{ show: any, gap: any[] }[]} */
    const slotsSeen = [];
    for (const r of rows) {
      if (r.seg.kind === 'full_time' && (slotsSeen.length === 0 || slotsSeen.at(-1)?.show.seg.match.id !== r.seg.match.id)) slotsSeen.push({ show: r, gap: [] });
      else if (slotsSeen.length > 0 && !r.seg.show) slotsSeen.at(-1)?.gap.push(r);
    }
    for (const { show, gap } of slotsSeen) {
      const shown = new Set(show.seg.group.map((/** @type {any} */ m) => m.id));
      // The PLAYOFF PREVIEW show's reels (the big matches promoted) are the show's, not the gap's highlights units.
      // (Nor is OFF THE BALL's day's goals, on the booth's screen.)
      const packages = gap.filter((r) => r.seg.kind === 'highlights' && !r.seg.preview && !r.seg.podcast);
      const firstPackage = gap.findIndex((r) => r.seg.kind === 'highlights' && !r.seg.preview && !r.seg.podcast);
      packages.forEach((p, i) => {
        units++;
        const m = p.seg.match;
        // Only matches already played when the gap began.
        assert.ok(m.kickoff + timelineOf(m).duration <= show.from, `${m.id} was played`);
        // The ones just shown in the post-match show only after every other match in the pool has had its turn.
        if (shown.has(m.id)) {
          const others = new Set(packages.slice(0, i).map((x) => x.seg.match.id).filter((id) => !shown.has(id)));
          const pool = new Set(packages.map((x) => x.seg.match.id).filter((id) => !shown.has(id)));
          assert.equal(others.size, pool.size, `${m.id} waits its turn`);
        }
        // The opening sting: the band down with the match's name just after the package starts.
        const tr = transitionAt((t) => (t < p.from ? gap[gap.indexOf(p) - 1].seg : p.seg), p.from + 500, transitions);
        assert.ok(tr?.kind === 'open_sting' && tr.title && tr.match?.id === m.id);
      });
      // Re-airs all come before the first package, and a unit's block has no talk clip.
      if (firstPackage >= 0) {
        assert.ok(!gap.slice(firstPackage).some((r) => r.seg.kind === 'reair'), 'no re-air after the highlights');
        for (let i = firstPackage; i < gap.length; i++) {
          const nextPkg = gap.findIndex((r, j) => j > i && r.seg.kind === 'highlights');
          // OFF THE BALL or FROM THE VAULT between two units brings its own block.
          if (gap[i].seg.kind !== 'highlights' || nextPkg < 0 || gap.slice(i + 1, nextPkg).some((r) => r.seg.podcast || r.seg.vault)) continue;
          assert.ok(!gap.slice(i + 1, nextPkg).some((r) => r.seg.kind === 'talk'), 'a highlights unit\'s block has no talk');
        }
      }
    }
  }
  assert.ok(units > 10, `${units} units`);
});

test('the opening ident (Task 106): a band cuts into it and out of it to the welcome; the comet lands well inside it, in Full and Broadcast', () => {
  const { rows, programme } = day2;
  const ident = rows.find((r) => r.label === 'opening · ident');
  assert.ok(ident);
  for (const edge of [ident.from, ident.until]) {
    const tr = transitionAt(programme.at, edge, transitions);
    assert.equal(tr?.kind, 'cut');
    assert.equal(tr?.edge, edge);
  }
  for (const slide of [0, 1]) {
    const { enter, land } = identLanding(sceneRect(slide));
    assert.ok(enter < land && land < config.settings.opening.identSeconds * 1000 - 2000, `lands at ${Math.round(land)} ms`);
  }
});
