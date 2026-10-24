import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jingleLayers, recipe, SOUND_KINDS } from '../src/channel/soundRecipes.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();

test('every sound has a recipe that Web Audio can play: positive frequencies, gains 0–1, a few seconds at most (a big roar up to 7)', () => {
  for (const kind of SOUND_KINDS) {
    for (const opts of [{}, { power: 0 }, { power: 1 }, { held: true }, { blast: /** @type {const} */ ('full_time') }]) {
      const r = recipe(kind, 'test', opts);
      assert.equal(r.kind, kind);
      assert.ok(r.layers.length > 0, `${kind} has layers`);
      // The anthem repeats to fill; the off-season's music is one pass of its loop (Task 203), a draw of the lottery ~8 s.
      assert.ok(r.duration > 0 && r.duration <= (kind === 'anthem' ? 30 : kind === 'music' ? 60 : kind === 'lottery' ? 10 : 7), `${kind} lasts ${r.duration} s`);
      for (const l of r.layers) {
        assert.ok(l.gain > 0 && l.gain <= 1, `${kind} gain ${l.gain}`);
        assert.ok(l.start >= 0 && l.attack > 0 && l.hold >= 0 && l.release > 0, `${kind} envelope`);
        // Exponential ramps in Web Audio need values above zero.
        assert.ok(l.freq > 0 && (l.freqEnd === undefined || l.freqEnd > 0), `${kind} frequency`);
      }
    }
  }
});

test('the same seed gives the same sound; another seed varies it a little', () => {
  for (const kind of SOUND_KINDS) {
    assert.deepEqual(recipe(kind, 'm1|1200'), recipe(kind, 'm1|1200'));
    // Music (anthems, stings, the studio bed's chords, the ads' jingles; Task 203: the off-season's music, the lottery's
    // draws, the ads' effects) is the same every time on purpose.
    if (!['anthem', 'sting', 'jingle', 'music', 'lottery', 'effect'].includes(kind)) assert.notDeepEqual(recipe(kind, 'm1|1200'), recipe(kind, 'm1|1201'), `${kind} varies`);
  }
});

test('options: full time is three blasts, a long blast is long, a held save is louder, power makes a shot and a roar bigger', () => {
  const blasts = (/** @type {any} */ opts) => new Set(recipe('whistle', 's', opts).layers.map((l) => l.start)).size;
  assert.equal(blasts({ blast: 'full_time' }), 3);
  assert.equal(blasts({ blast: 'short' }), 1);
  assert.ok(recipe('whistle', 's', { blast: 'long' }).duration > 3 * recipe('whistle', 's', { blast: 'short' }).duration);
  const loudest = (/** @type {any} */ r) => Math.max(...r.layers.map((/** @type {any} */ l) => l.gain));
  assert.ok(loudest(recipe('save', 's', { held: true })) > loudest(recipe('save', 's', { held: false })));
  assert.ok(loudest(recipe('shot', 's', { power: 1 })) > loudest(recipe('shot', 's', { power: 0 })));
  assert.ok(recipe('roar', 's', { power: 1 }).duration > recipe('roar', 's', { power: 0 }).duration);
});

test('settings.sound has a level for every sound and the commentator, and nothing else', () => {
  assert.deepEqual(Object.keys(config.settings.sound.levels).sort(), [...SOUND_KINDS, 'commentary', 'speech'].sort());
});

test('the crowd is voices: roars, groans, oohs and boos are vowel-shaped tones at voice pitches', () => {
  for (const kind of /** @type {const} */ (['roar', 'groan', 'ooh', 'jeer'])) {
    const v = recipe(kind, 's').layers.filter((l) => l.source === 'osc' && l.formants);
    assert.ok(v.length >= 12, `${kind} has many voices`);
    for (const l of v) assert.ok(l.source === 'osc' && l.freq >= 80 && l.freq <= 420 && l.fade === 'linear', `${kind} voice pitch and an even fade`);
  }
  // Boos are low and sag; groans fall; oohs and roars rise.
  const mean = (/** @type {any[]} */ ls, /** @type {(l: any) => number} */ f) => ls.reduce((t, l) => t + f(l), 0) / ls.length;
  const voicesOf = (/** @type {any} */ kind) => recipe(kind, 's').layers.filter((l) => l.source === 'osc' && l.formants);
  assert.ok(mean(voicesOf('jeer'), (l) => l.freq) < mean(voicesOf('roar'), (l) => l.freq), 'boos are lower than cheers');
  assert.ok(mean(voicesOf('groan'), (l) => l.freqEnd / l.freq) < 0.8 && mean(voicesOf('ooh'), (l) => l.freqEnd / l.freq) > 1.2);
});

test('anthems: each team has its own tune, the same every time, repeated to fill the anthem without running over', () => {
  const teams = config.teams.teams.map((/** @type {any} */ t) => t.id);
  const tunes = teams.map((id) => JSON.stringify(recipe('anthem', 'any', { team: id }).layers));
  assert.equal(new Set(tunes).size, teams.length, 'every team different');
  assert.deepEqual(recipe('anthem', 'a', { team: teams[0] }), recipe('anthem', 'b', { team: teams[0] }), 'the seed does not change it');
  const fit = config.settings.ceremonies.anthemSeconds;
  for (const id of teams) {
    const once = recipe('anthem', 's', { team: id });
    const filled = recipe('anthem', 's', { team: id, fit });
    assert.ok(once.duration >= 8 && once.duration <= 14, `${id}: one tune ${once.duration.toFixed(1)} s`);
    assert.ok(filled.duration <= fit + 2 && filled.duration >= fit * 0.5, `${id}: filled ${filled.duration.toFixed(1)} s`);
  }
});

test('stings: short, and a different shape for the show, highlights and a replay', () => {
  const shapes = /** @type {const} */ (['show', 'highlights', 'replay']).map((sting) => recipe('sting', 's', { sting }));
  for (const r of shapes) assert.ok(r.duration < 2);
  assert.equal(new Set(shapes.map((r) => JSON.stringify(r.layers.map((l) => l.freq)))).size, 3);
});

test('each team plays its own anthem from data (Tom swapped two): every tune used exactly once', () => {
  const teams = config.teams.teams;
  assert.deepEqual(teams.map((/** @type {any} */ t) => t.anthem).sort(), teams.map((/** @type {any} */ t) => t.id).sort());
});

test("jingles play chords and rests (Task 137): every note of a chord at the same moment, a rest only takes time", () => {
  const one = jingleLayers({ instrument: 'brass', bpm: 120, notes: [{ note: 72, beats: 1 }] });
  const tune = jingleLayers({ instrument: 'brass', bpm: 120, notes: [{ note: 72, with: [76, 79], beats: 1 }, { rest: true, beats: 1 }, { note: 84, beats: 1 }] });
  const at = (/** @type {number} */ t) => tune.filter((l) => Math.abs(l.start - t) < 1e-9);
  assert.equal(at(0).length, one.length * 3, 'three notes at once');
  assert.ok(at(0).every((l, k) => l.gain < one[k % one.length].gain), 'each a little quieter in a chord');
  assert.equal(at(0.5).length, 0, 'nothing in the rest');
  assert.equal(at(1).length, one.length, 'the next note after the rest');
  // The studio's own jingle (data/studio.json) is chords, with its pauses.
  const studio = config.studio.jingle.notes;
  assert.ok(studio.some((/** @type {any} */ n) => n.rest) && studio.some((/** @type {any} */ n) => n.with?.length));
});

test('the bumper sound (Task 168): in and out each end inside the bumper, on the studio jingle\'s brass', async () => {
  const { loadConfigFromDisk } = await import('../src/cli/loadConfigFromDisk.js');
  const config = await loadConfigFromDisk();
  for (const part of ['in', 'out']) {
    const j = config.studio.bumpers[part];
    assert.equal(j.instrument, config.studio.jingle.instrument, part);
    const end = Math.max(...jingleLayers(j).map((l) => l.start + l.attack + l.hold + l.release));
    assert.ok(end <= config.settings.ads.bumperSeconds, `${part}: ends at ${end.toFixed(2)} s`);
  }
});
