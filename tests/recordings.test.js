// The recordings (phones; src/channel/recordings.js, assets/sounds/): every sound the channel asks for has one, and
// every one is there and fresh (recorded from its recipe as it is now).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { EventLog } from '../src/chronicle/eventLog.js';
import { ceremonyCues, crowdCues } from '../src/channel/crowd.js';
import { createMotion } from '../src/channel/motion.js';
import { MUSIC_STYLES } from '../src/channel/musicRecipes.js';
import { catalogue, recipeHash, recordingOf } from '../src/channel/recordings.js';
import { sceneRect } from '../src/channel/scene.js';
import { eventCues, kickCues } from '../src/channel/sounds.js';
import { identTrack } from '../src/channel/spotArt.js';
import { createTimeline } from '../src/channel/timeline.js';
import { liftCues } from '../src/channel/trophyLift.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const rs = config.settings.sound.recordings;
const list = catalogue(config);
const keys = new Set(list.map((r) => r.key));
const index = JSON.parse(readFileSync(new URL('../assets/sounds/index.json', import.meta.url), 'utf8')).recordings;

test('every recording is in assets/sounds/, recorded from its recipe as it is now (else: recordings.html, RECORD MISSING AND STALE)', () => {
  const missing = list.filter((r) => !index[r.key]).map((r) => r.key);
  const stale = list.filter((r) => index[r.key] && index[r.key].hash !== recipeHash(r)).map((r) => r.key);
  assert.deepEqual({ missing, stale }, { missing: [], stale: [] });
  for (const r of list) assert.ok(existsSync(new URL(`../assets/sounds/${index[r.key].file}`, import.meta.url)), index[r.key].file);
  // Nothing left over that the channel no longer asks for.
  assert.deepEqual(Object.keys(index).filter((k) => !keys.has(k)), []);
});

test('every sound a season\'s matches, ceremonies and the lift ask for has a recording', () => {
  /** @type {Map<string, any[]>} */
  const byMatch = new Map();
  const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
  const league = createLeague(config, 'recordings-tests', log);
  runSeason(league, config, log);
  /** @type {{ kind: any, seed: string }[]} */
  const cues = [];
  for (const [id, events] of [...byMatch].slice(0, 6)) {
    const r = events.at(-1).data;
    const timeline = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
    const motion = createMotion(timeline, { matchId: id, homeId: r.homeId, keeperSlot: config.positions.keeper, animation: config.settings.animation, play: config.settings.play });
    cues.push(...eventCues(timeline, { matchId: id, shotMs: config.settings.animation.shotMs }));
    cues.push(...kickCues(motion, 0, timeline.duration, id));
    for (const bigStage of [false, true]) cues.push(...crowdCues(timeline, { matchId: id, homeId: r.homeId, bigStage, halfMinutes: config.rules.match.halfMinutes, goalPauseMs: config.settings.match.goalPauseSeconds * 1000 }));
  }
  const tune = Object.values(config.teams.teams)[0].anthem;
  for (const kind of /** @type {const} */ (['walk_out', 'handshakes'])) cues.push(...ceremonyCues(kind, 10 * 60_000, config.settings.ceremonies, 'k', { homeId: 'a', awayId: 'b' }, () => tune));
  cues.push(...liftCues(config.settings.trophyLift, 'k', tune));
  const kinds = new Set(cues.map((c) => c.kind));
  // No applause since Tom, 2026-10-20: small cheers in its place.
  for (const k of ['whistle', 'kick', 'shot', 'net', 'save', 'roar', 'ooh', 'groan', 'anthem']) assert.ok(kinds.has(k), k);
  const without = cues.map((c) => recordingOf(c.kind, c.seed, c, rs)).filter((r) => !r || !keys.has(r.key));
  assert.deepEqual(without, []);
});

test('and every sound between matches: the murmur, stings, transitions, the jingles, ads\' effects, the ident, music, the lottery', () => {
  /** @type {[any, object][]} */
  const asks = [
    ['murmur', {}], ['sting', { sting: 'show' }], ['sting', { sting: 'highlights' }], ['sting', { sting: 'replay' }], ['whoosh', {}], ['swish', {}], ['sub', {}], ['ident', {}],
    ['jingle', { jingle: config.studio.jingle }], ['jingle', { jingle: config.studio.bumpers.in }], ['jingle', { jingle: config.studio.bumpers.out }],
    ...config.ads.ads.map((a) => /** @type {[any, object]} */ (['jingle', { jingle: a.jingle }])),
    ...config.ads.ads.flatMap((a) => (a.effects ?? []).map((e) => /** @type {[any, object]} */ (['effect', { effect: e.effect }]))),
    ...[0, 1].map((slide) => /** @type {[any, object]} */ (['fire', { style: config.settings.sound.identFire, track: identTrack(sceneRect(slide)) }])),
    ...config.settings.sound.music.tracks.map((style) => /** @type {[any, object]} */ (['music', { style }])),
    ['lottery', { style: config.settings.lottery.sound, dropAt: config.settings.lottery.dropAt }],
  ];
  for (const [kind, opts] of asks) for (const seed of ['a', 'b', 'c|1', '2026-10-13']) {
    const r = recordingOf(kind, seed, opts, rs);
    assert.ok(r && keys.has(r.key), `${kind} ${JSON.stringify(opts).slice(0, 60)}`);
  }
  assert.ok(MUSIC_STYLES.every((style) => keys.has(`music/${style}`)));
});

test('a sound plays the same take wherever it\'s heard: picked by its seed, spread over the takes', () => {
  const a = recordingOf('kick', 'm1|kick|1200', { power: 0.42 }, rs);
  assert.deepEqual(recordingOf('kick', 'm1|kick|1200', { power: 0.42 }, rs), a);
  const takes = new Set(Array.from({ length: 200 }, (_, i) => recordingOf('kick', `m|kick|${i}`, { power: 0.5 }, rs)?.key));
  assert.equal(takes.size, rs.variants);
  // A kick's strength rounded to its levels: 0, the top and beyond it.
  assert.match(String(recordingOf('kick', 's', { power: 0 }, rs)?.key), /^kick\/p0-/);
  assert.match(String(recordingOf('kick', 's', { power: 1.2 }, rs)?.key), new RegExp(`^kick/p${rs.kickLevels - 1}-`));
});
