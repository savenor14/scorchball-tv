// OFF THE BALL, the podcast (docs/podcast.md; src/channel/podcastTalk.js): what an episode says, its clips, its
// schedule of themes and discussions, PICKS, and that every screen hears the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { isFinished, tableAt } from '../src/channel/onScreen.js';
import { buildDay } from '../src/channel/guide.js';
import { podcastClipKey, podcastEpisode, podcastEpisodes, podcastRepeatAt, SEATS, themesOf } from '../src/channel/podcastTalk.js';
import { boothLayout } from '../src/channel/podcastBooth.js';
import { createProgramme } from '../src/channel/programme.js';
import { sceneRect } from '../src/channel/scene.js';
import { pictureOf, transitionAt } from '../src/channel/transitions.js';
import { talkContext } from '../src/channel/talk.js';
import { createTimeline } from '../src/channel/timeline.js';
import { winnerOf } from '../src/sim/potm.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const SEEDS = ['podcast-tests', 'podcast-tests-2'];
const SEASONS = 3;
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const durationOf = (/** @type {any} */ m) => timelineOf(m).duration;

/** A league played to the end of season `season`, with every episode of seasons 1 to `season`. @param {string} seed */
function league(seed, season = SEASONS) {
  const end = new LiveLeague(config, { now: 0, seed }).calendar.seasonStart(season + 1) - 1;
  const live = new LiveLeague(config, { now: end, seed });
  const ctx = talkContext(live, timelineOf);
  // Only this season's and last season's matches are kept.
  const episodes = [season - 1, season].filter((s) => s >= 1).flatMap((s) => podcastEpisodes(live, s, ctx).map((slot) => ({ slot, ep: podcastEpisode(live, slot, ctx) })));
  return { live, ctx, episodes };
}
const leagues = SEEDS.map((seed) => league(seed));

test('the data: every theme\'s discussions exist, each with lines from both; each pundit has a voice and interjections', () => {
  const pod = config.podcast;
  for (const [id, theme] of Object.entries(pod.themes)) {
    if (id.startsWith('_')) continue;
    for (const d of /** @type {any} */ (theme).discussions) {
      assert.ok(pod.discussions[d], `${id}: no discussion ${d}`);
      assert.deepEqual(new Set(pod.discussions[d].lines.map((/** @type {any} */ l) => l.who)), new Set(SEATS), `${d}: both talk`);
    }
  }
  for (const who of SEATS) assert.ok(pod.pair[who].voice && pod.interjections[who].length);
});

test('a season: SEASON AHEAD on day 1 at settings.podcast.at, a daily one each later day with matches, SEASON REVIEW after the final', () => {
  for (const { live, ctx } of leagues) {
    const eps = podcastEpisodes(live, SEASONS, ctx);
    assert.deepEqual(eps.map((e) => e.kind), ['ahead', 'daily', 'daily', 'daily', 'daily', 'daily', 'review']);
    const final = /** @type {any} */ (live.matchesIn(SEASONS).find((m) => m.stage === 'final'));
    assert.equal(eps.at(-1)?.at, final.kickoff + durationOf(final));
    for (const e of eps.slice(0, -1)) assert.ok(e.at < final.kickoff);
  }
});

test('every line has its clip, in the voice of the seat that says it, the interjections too; nothing unfilled', () => {
  for (const { episodes } of leagues) {
    for (const { ep } of episodes) {
      for (const l of ep.parts.flat()) {
        const key = podcastClipKey(SEATS[l.who], l.clip);
        assert.ok(config.voiceLengths[key], `no clip ${key} (${l.text})`);
        assert.ok(!/[{}]/.test(l.text) && !/[{}]/.test(l.show ?? ''), `unfilled: ${l.text} / ${l.show}`);
        if (l.under) {
          assert.notEqual(l.under.who, l.who, 'the listener interjects');
          assert.ok(config.voiceLengths[podcastClipKey(SEATS[l.under.who], l.under.clip)], `no clip for ${l.under.text}`);
          assert.ok(l.text.length >= config.settings.podcast.interjectionChars);
        }
      }
      // The discussions as written, whole, three of them, three themes.
      assert.equal(ep.discussions.length, config.settings.podcast.discussions);
      assert.equal(new Set(ep.discussions.map((d) => d.theme)).size, ep.discussions.length);
      for (const d of ep.discussions) {
        const talk = config.podcast.discussions[d.id];
        assert.deepEqual(ep.parts[d.part].slice(d.first, d.last + 1).map((l) => l.text), talk.lines.map((/** @type {any} */ l) => l.say));
      }
    }
  }
});

test('the themes: each once in every run of eight discussions, never twice in an episode or running; a theme\'s discussions all air before one comes back', () => {
  const live = leagues[0].live;
  const ids = Object.keys(config.podcast.themes).filter((k) => !k.startsWith('_'));
  const slots = [];
  // Long after the first poll opened, so every discussion is in its theme's deck (the next test: before it).
  const late = live.calendar.seasonStart(99);
  for (let season = 1; season <= 12; season++) for (let n = 0; n < 7; n++) slots.push({ kind: /** @type {const} */ ('daily'), season, n, at: late });
  const episodes = slots.map((s) => themesOf(live, s));
  for (const e of episodes) assert.equal(new Set(e.map((r) => r.theme)).size, e.length, 'three themes an episode');
  const runs = episodes.flat();
  for (let i = 0; i + ids.length <= runs.length; i += ids.length) assert.equal(new Set(runs.slice(i, i + ids.length).map((r) => r.theme)).size, ids.length);
  for (let i = 1; i < runs.length; i++) assert.notEqual(runs[i].theme, runs[i - 1].theme);
  for (const id of ids) {
    const talks = runs.filter((r) => r.theme === id).map((r) => r.discussion);
    const n = config.podcast.themes[id].discussions.length;
    for (let i = 0; i + n <= talks.length; i += n) assert.equal(new Set(talks.slice(i, i + n)).size, n, `${id}: ${talks.join(' ')}`);
  }
});

test('a discussion that says there are polls waits for the first poll to open (Tom, 2026-10-21); the theme\'s others still take turns', () => {
  const live = leagues[0].live;
  const firstPoll = live.calendar.instant(config.polls.polls[0].season, 0);
  const fans = (/** @type {number} */ at) => {
    const slots = [];
    for (let season = 1; season <= 12; season++) for (let n = 0; n < 7; n++) slots.push({ kind: /** @type {const} */ ('daily'), season, n, at });
    return slots.flatMap((sl) => themesOf(live, sl)).filter((r) => r.theme === 'fans').map((r) => r.discussion);
  };
  const before = fans(firstPoll - 1);
  assert.ok(before.length >= 6 && !before.includes('fansWant'), before.join(' '));
  for (let i = 0; i + 3 <= before.length; i += 3) assert.equal(new Set(before.slice(i, i + 3)).size, 3, before.join(' '));
  assert.ok(fans(firstPoll).includes('fansWant'));
});

test('said only when true: the leader, the day\'s goals, the picks owned up to by how the match went', () => {
  for (const { live, ctx, episodes } of leagues) {
    for (const { slot, ep } of episodes) {
      const said = ep.parts.flat();
      const kinds = said.map((l) => l.clip.kind);
      const table = tableAt(live, slot.season, slot.at, durationOf);
      if (kinds.includes('tableTop')) {
        const top = said.find((l) => l.clip.kind === 'tableTop');
        assert.equal(top?.clip.team, table[0].teamId);
      }
      // The day's goals: the day's matches finished when it was made; called for and wrapped up only with them.
      for (const id of ep.goals) assert.ok(isFinished(/** @type {any} */ (live.matches.get(id)), slot.at, durationOf), 'the goals had aired');
      assert.equal(kinds.includes('reelAsk'), ep.goals.length > 0);
      assert.equal(kinds.includes('reelEnd'), ep.goals.length > 0);
      assert.ok(ep.parts[1].some((l) => l.clip.kind === 'breakInto') && ep.parts[2][0].clip.kind === 'breakBack');
      if (ep.picks) {
        assert.ok(ep.picks.kickoff > slot.at, 'a pick is of a match still to come');
        assert.ok([ep.picks.homeId, ep.picks.awayId].includes(ep.picks.tamsin) && [ep.picks.homeId, ep.picks.awayId].includes(ep.picks.samir));
      }
      // Owning up: the last episode's pick, by its match's result.
      const before = podcastEpisodes(live, slot.season, ctx).filter((s) => s.n < slot.n && s.kind !== 'review').at(-1);
      const last = before && episodes.find((x) => x.slot.season === before.season && x.slot.n === before.n)?.ep.picks;
      for (const who of /** @type {const} */ (['Tamsin', 'Samir'])) {
        const owned = kinds.find((k) => k === `pickRight${who}` || k === `pickWrong${who}`);
        if (!owned) continue;
        assert.ok(last);
        const [season, n] = last.key.split('-').map(Number);
        const m = /** @type {any} */ (live.matchesIn(season).find((x) => x.slot === n));
        assert.equal(owned.startsWith('pickRight'), winnerOf(m) === last[/** @type {'tamsin' | 'samir'} */ (who.toLowerCase())]);
      }
      if (slot.kind === 'ahead' && slot.season === 1) assert.ok(!kinds.includes('aheadChampions'), 'no champions before season 2');
      if (slot.season === 1) assert.ok(!kinds.includes('archiveAsk') && !kinds.includes('kidsAsk'));
    }
  }
});

test('the same on every screen: an episode made when it first airs says what it says at SEASON REVIEW (its last airing)', () => {
  const seed = SEEDS[0];
  // The money and the archive come from the chronicle, which the off-season changes only once it has aired, after
  // the season's episodes (settings.chronicle.offseasonAiredMinutes after the final's kick-off).
  const probe = new LiveLeague(config, { now: 0, seed });
  const final = probe.calendar.slots(SEASONS).at(-1);
  const late = new LiveLeague(config, { now: /** @type {any} */ (final).kickoff + (config.settings.chronicle.offseasonAiredMinutes - 1) * 60_000, seed });
  const lateCtx = talkContext(late, timelineOf);
  for (const slot of podcastEpisodes(late, SEASONS, lateCtx)) {
    const ep = podcastEpisode(late, slot, lateCtx);
    const early = new LiveLeague(config, { now: slot.at + 60_000, seed });
    assert.deepEqual(podcastEpisode(early, slot, talkContext(early, timelineOf)), ep, `${slot.kind} ${slot.n}`);
  }
});

/** Every OFF THE BALL airing between two moments, from the programme as the channel plays it. @param {string} seed @param {number} from @param {number} until */
function airingsBetween(seed, from, until) {
  const live = new LiveLeague(config, { now: from, seed });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ key: string, from: number, until: number, seg: any, pieces: { from: number, seg: any }[] }[]} */
  const out = [];
  for (let t = from; t < until;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = /** @type {any} */ (programme.at(Math.max(p.from, t)));
    const key = seg.podcast ? `${seg.podcast.season}|${seg.podcast.n}|${Boolean(seg.repeat)}` : null;
    const last = out.at(-1);
    if (key && last?.key === key && last.until >= p.from) {
      if (last.pieces.at(-1)?.from !== p.from) last.pieces.push({ from: p.from, seg });
      last.until = p.until;
    } else if (key) out.push({ key, from: p.from, until: p.until, seg, pieces: [{ from: p.from, seg }] });
    t = p.until > t ? p.until : t + 1000;
  }
  return { live, out, programme };
}

test('on air: each episode from its time (never before), again overnight; SEASON REVIEW twice the night after the final; none in PLAYOFF PREVIEW\'s gap', () => {
  const seed = SEEDS[0];
  const probe = new LiveLeague(config, { now: 0, seed });
  const s = 2;
  const { live, out } = airingsBetween(seed, probe.calendar.seasonStart(s), probe.calendar.seasonStart(s + 1) + 6 * 3_600_000);
  const ctx = talkContext(live, timelineOf);
  const eps = podcastEpisodes(live, s, ctx);
  for (const slot of eps) {
    const airs = out.filter((a) => a.seg.podcast.season === s && a.seg.podcast.n === slot.n);
    assert.ok(airs[0], `${slot.kind} ${slot.n} aired`);
    assert.ok(airs[0].from >= slot.at && airs[0].from - slot.at < 3 * 3_600_000, `${slot.kind} ${slot.n}: first airing ${(airs[0].from - slot.at) / 60_000} minutes after it was made`);
    assert.ok(!airs[0].seg.repeat && airs.slice(1).every((a) => a.seg.repeat));
    // Its running order (the first talk, the day's goals, the second talk, the ads, the third talk), about 7-10
    // minutes; the same words every airing.
    const order = (/** @type {typeof airs[number]} */ a) => a.pieces.map((p) => (p.seg.kind === 'talk' ? 'talk' : p.seg.kind === 'highlights' ? 'goals' : p.seg.part === 'ad' ? 'ad' : p.seg.part));
    assert.deepEqual(order(airs[0]).filter((k, i, all) => k !== all[i - 1]), ['talk', ...(order(airs[0]).includes('goals') ? ['goals'] : []), 'talk', 'bumper_in', 'ad', 'bumper_out', 'talk']);
    const minutes = (airs[0].until - airs[0].from) / 60_000;
    assert.ok(minutes > 6 && minutes < 11, `${slot.kind} ${slot.n}: ${minutes.toFixed(1)} minutes`);
    const words = (/** @type {typeof airs[number]} */ a) => a.pieces.filter((p) => p.seg.kind === 'talk').flatMap((p) => p.seg.script.map((/** @type {any} */ l) => l.text));
    for (const a of airs) assert.deepEqual(words(a), words(airs[0]));
    if (slot.kind === 'review') assert.equal(airs.length, 2);
    else if (slot.n < eps.length - 2) {
      assert.equal(airs.length, 2, `${slot.kind} ${slot.n} aired again`);
      assert.ok(airs[1].from >= podcastRepeatAt(live, slot));
    } else assert.equal(airs.length, 1, 'the last daily one: its night is PLAYOFF PREVIEW\'s');
  }
  // Nothing between the final round's start and the final's end but SEASON REVIEW's.
  const slots = live.calendar.slots(s);
  const finalRound = slots[live.calendar.regularCount - 1].kickoff;
  assert.ok(out.filter((a) => a.from > finalRound + 3_600_000 && a.from < slots.at(-1).kickoff).length === 0);
});

test('SCHEDULE lists an episode as one gold line, OFF THE BALL, REP when it airs again', () => {
  const probe = new LiveLeague(config, { now: 0, seed: SEEDS[0] });
  const day = buildDay(config, probe.calendar.seasonStart(2) + 2 * 86_400_000 + 12 * 3_600_000, SEEDS[0], timelineOf);
  const lines = day.entries.filter((e) => e.kind === 'podcast');
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((e) => Boolean(e.repeat)), [true, false]);
});

test('the booth: the day\'s goals stay on its screen (no stings), the pair reacting to each goal in turn with a voiced line', () => {
  const seed = SEEDS[0];
  const probe = new LiveLeague(config, { now: 0, seed });
  const day = probe.calendar.seasonStart(2) + 2 * 86_400_000;
  const { out } = airingsBetween(seed, day + 17 * 3_600_000, day + 22 * 3_600_000);
  const reel = out.flatMap((a) => a.pieces).find((p) => p.seg.kind === 'highlights');
  assert.ok(reel, 'the day\'s goals aired');
  const seg = reel.seg;
  assert.equal(pictureOf(seg), 'scene');
  assert.equal(transitionAt(() => seg, seg.from + 100, config.settings.transitions), null, 'no opening sting over the booth');
  assert.equal(seg.reacts.length, seg.clips);
  seg.reacts.forEach((/** @type {any} */ r, /** @type {number} */ k) => {
    if (k > 0) assert.notEqual(r.who, seg.reacts[k - 1].who, 'they take turns');
    assert.ok(config.voiceLengths[podcastClipKey(SEATS[r.who], r.clip)], `no clip for ${r.text}`);
  });
});

test('the booth\'s layout stays inside its rect in Full and Broadcast: the window, its middle pane, the seats, the lower third', () => {
  for (const slide of [0, 1]) {
    const R = sceneRect(slide);
    const L = boothLayout(R);
    const inside = (/** @type {{ x: number, y: number, w?: number, h?: number }} */ b) => b.x >= R.x && b.y >= R.y && b.x + (b.w ?? 0) <= R.x + R.w && b.y + (b.h ?? 0) <= R.y + R.h;
    assert.ok(inside(L.win) && inside(L.screen) && L.seats.every(inside) && L.lowerY < R.y + R.h, `slide ${slide}`);
    assert.ok(L.screen.x > L.win.x && L.screen.x + L.screen.w < L.win.x + L.win.w, 'the screen is the middle pane');
  }
});

test('back to the studio: the band in the show\'s last moments, never over the studio\'s first line (Tom, 2026-10-21)', () => {
  const seed = SEEDS[0];
  const probe = new LiveLeague(config, { now: 0, seed });
  const day = probe.calendar.seasonStart(2) + 2 * 86_400_000;
  const { out, programme } = airingsBetween(seed, day + 17 * 3_600_000, day + 22 * 3_600_000);
  const at = (/** @type {number} */ t) => programme.at(t);
  const s = config.settings.transitions;
  let checked = 0;
  for (const airing of out) {
    const end = airing.until;
    const next = /** @type {any} */ (at(end));
    if (next.kind === 'ads' || next.podcast) continue;
    checked++;
    // The band's title up in the show's last moments, over the booth, after its last line.
    const mid = /** @type {any} */ (transitionAt(at, end - s.openStingSeconds * 1000 / 2, s));
    assert.equal(mid?.reel?.title, 'BACK TO THE STUDIO');
    const last = airing.pieces.at(-1)?.seg;
    assert.ok(last.from + last.script.at(-1).until <= end - s.openStingSeconds * 1000, 'after the last line');
    // It lifts off onto the studio (Tom: not back onto the booth), gone before the studio's first line.
    assert.equal(/** @type {any} */ (transitionAt(at, end + 100, s))?.reel?.title, 'BACK TO THE STUDIO');
    for (let x = s.clipStingMs / 2; x < 3000; x += 250) assert.equal(transitionAt(at, end + x, s), null, `${x} ms into the studio`);
    if (next.kind === 'talk') assert.ok(next.script[0].from >= s.clipStingMs / 2, 'the first line after the lift');
  }
  assert.ok(checked > 0);
});
