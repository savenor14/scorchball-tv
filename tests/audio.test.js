// The audio graph (Task 181; docs/channel.md §14.2), against a stand-in for the browser's AudioContext that records
// what's scheduled: a sound joined part-way swells in, and a hidden tab goes quiet and comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAudio, renderRecipe } from '../src/channel/audio.js';
import { recipe } from '../src/channel/soundRecipes.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();

/** An AudioParam that records its automation. */
const param = (value = 1) => ({
  value,
  /** @type {[string, ...number[]][]} */ calls: [],
  setValueAtTime(/** @type {number} */ v, /** @type {number} */ t) { this.calls.push(['set', v, t]); },
  linearRampToValueAtTime(/** @type {number} */ v, /** @type {number} */ t) { this.calls.push(['linear', v, t]); },
  exponentialRampToValueAtTime(/** @type {number} */ v, /** @type {number} */ t) { this.calls.push(['exp', v, t]); },
  setTargetAtTime(/** @type {number} */ v, /** @type {number} */ t) { this.calls.push(['target', v, t]); },
  cancelScheduledValues() {},
});
const node = (/** @type {object} */ extra = {}) => ({ connect(/** @type {any} */ n) { return n; }, disconnect() {}, start() {}, stop() {}, ...extra });
class FakeContext {
  currentTime = 10;
  destination = node();
  sampleRate = 8000;
  createGain() { return node({ gain: param() }); }
  createOscillator() { return node({ frequency: param(), type: 'sine' }); }
  createBufferSource() { return node({ buffer: null, loop: false }); }
  createBiquadFilter() { return node({ frequency: param(), Q: param(), type: 'lowpass' }); }
  createBuffer(/** @type {number} */ _c, /** @type {number} */ n) { return { getChannelData: () => new Float32Array(n) }; }
  resume() { return Promise.resolve(); }
}

test('a sound joined part-way swells in over fadeIn, and one from its start comes in as before (Task 181)', () => {
  const ctx = /** @type {any} */ (new FakeContext());
  const r = recipe('roar', 'x', { power: 1 });
  const swelled = /** @type {any} */ (renderRecipe(ctx, ctx.destination, /** @type {any} */ ({}), r, 0.8, 10, 'x', 1.5, 0.7));
  assert.deepEqual(swelled.gain.calls, [['set', 0, 10], ['linear', 0.8, 10.7]]);
  const plain = /** @type {any} */ (renderRecipe(ctx, ctx.destination, /** @type {any} */ ({}), r, 0.8, 10, 'x'));
  assert.deepEqual(plain.gain.calls, []);
  assert.equal(plain.gain.value, 0.8);
});

test('a hidden tab goes quiet and plays nothing new; shown again it comes back (Task 181)', () => {
  const was = /** @type {any} */ (globalThis).AudioContext;
  /** @type {any} */ (globalThis).AudioContext = FakeContext;
  try {
    const audio = createAudio(config.settings.sound, config.settings.commentary);
    audio.start();
    audio.setOn(true);
    const master = /** @type {any} */ (audio.output);
    audio.play('whistle', { seed: 'a' });
    assert.equal(audio.played, 1);
    audio.setHidden(true, 300);
    assert.deepEqual(master.gain.calls.at(-1).slice(0, 2), ['target', 0]);
    assert.equal(audio.audible, false);
    audio.play('whistle', { seed: 'b' });
    assert.equal(audio.played, 1, 'nothing new while hidden');
    assert.equal(audio.playClip('x.mp3'), true, 'a voice is let go, not retried on return');
    audio.setHidden(false, 300);
    assert.deepEqual(master.gain.calls.at(-1).slice(0, 2), ['target', config.settings.sound.master]);
    assert.equal(audio.audible, true);
    audio.play('whistle', { seed: 'c' });
    assert.equal(audio.played, 2);
  } finally {
    /** @type {any} */ (globalThis).AudioContext = was;
  }
});

test('switching matches: every sound but the voices dips and comes back (Task 181)', () => {
  const was = /** @type {any} */ (globalThis).AudioContext;
  /** @type {any[]} */
  const gains = [];
  /** @type {any} */ (globalThis).AudioContext = class extends FakeContext {
    createGain() { const g = super.createGain(); gains.push(g); return g; }
  };
  try {
    const audio = createAudio(config.settings.sound, config.settings.commentary);
    audio.enter(0.5, 2500); // before start(): nothing to dip, no error
    audio.start();
    audio.setOn(true);
    audio.enter(0.5, 2500);
    const dipped = gains.filter((g) => g.gain.calls.length);
    const entry = dipped.find((g) => g !== audio.output);
    assert.ok(entry, 'a gain of its own, not the master');
    assert.deepEqual(entry.gain.calls, [['set', 0.5, 10], ['linear', 1, 12.5]]);
    // The hush (Tom, to find the spike): the roars silent for 2 s, then in over 1.5 s; the murmur left alone.
    const before = gains.map((g) => g.gain.calls.length);
    audio.hush(['roar'], 2000, 1500);
    const hushed = gains.filter((g, i) => g.gain.calls.length > before[i]);
    assert.equal(hushed.length, 1, 'one bus');
    assert.deepEqual(hushed[0].gain.calls.slice(-3), [['set', 0, 10], ['set', 0, 12], ['linear', 1, 13.5]]);
  } finally {
    /** @type {any} */ (globalThis).AudioContext = was;
  }
});
