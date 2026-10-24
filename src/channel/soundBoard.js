// The sound board (sounds.html, a dev page for Task 50): every synthesized sound with its variants, its level and the
// master volume, so Tom can judge them by ear. Sliders change this page only;
// the numbers they show are what goes into settings.sound.
import { loadConfig } from '../config.js';
import { createRng } from '../sim/rng.js';
import { createAudio } from './audio.js';
import { anthemInstrument, SOUND_KINDS } from './soundRecipes.js';
import { voiceAudition, voiceTries } from './voiceAudition.js';
import { nameTryout } from './nameTryout.js';
import { clipUrl, linesFor } from './commentary.js';
import { deskClipUrl } from './speech.js';
import { identTrack } from './spotArt.js';

/** The ident's comet's course over the ground in Full (Task 249), for the fire's three styles. */
const FIRE_TRACK = identTrack({ x: 0, y: 0, w: 358, h: 179 });

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

/** The studio jingle's variants (Task 137), on the anthems' brass: notes are MIDI, beats at the bpm. */
const STUDIO_JINGLES = /** @type {[string, object][]} */ ([["D1 · Tom's: chords stepping down in thirds, then the run",{"instrument":"brass","bpm":150,"at":0,"notes":[{"note":79,"with":[76],"beats":0.25},{"note":79,"with":[76],"beats":0.25},{"rest":true,"beats":0.5},{"note":76,"with":[72],"beats":0.25},{"note":76,"with":[72],"beats":0.25},{"rest":true,"beats":0.5},{"note":72,"with":[69],"beats":0.25},{"note":72,"with":[69],"beats":0.25},{"rest":true,"beats":0.5},{"note":69,"with":[65],"beats":0.25},{"note":69,"with":[65],"beats":0.25},{"rest":true,"beats":0.5},{"note":72,"with":[69],"beats":0.25},{"note":74,"with":[71],"beats":0.25},{"note":76,"with":[72],"beats":0.25},{"note":77,"with":[74],"beats":0.25},{"note":79,"with":[76],"beats":0.25},{"note":81,"with":[77],"beats":0.25},{"note":84,"with":[79,76],"beats":2.5}]}],["D2 · Tom's: chords stepping down a tone at a time, then the run",{"instrument":"brass","bpm":150,"at":0,"notes":[{"note":79,"with":[76],"beats":0.25},{"note":79,"with":[76],"beats":0.25},{"rest":true,"beats":0.5},{"note":77,"with":[74],"beats":0.25},{"note":77,"with":[74],"beats":0.25},{"rest":true,"beats":0.5},{"note":75,"with":[72],"beats":0.25},{"note":75,"with":[72],"beats":0.25},{"rest":true,"beats":0.5},{"note":73,"with":[70],"beats":0.25},{"note":73,"with":[70],"beats":0.25},{"rest":true,"beats":0.5},{"note":72,"with":[69],"beats":0.25},{"note":74,"with":[71],"beats":0.25},{"note":76,"with":[72],"beats":0.25},{"note":77,"with":[74],"beats":0.25},{"note":79,"with":[76],"beats":0.25},{"note":81,"with":[77],"beats":0.25},{"note":84,"with":[79,76],"beats":2.5}]}],["A · fanfare (da-da-da-DAAA)",{"instrument":"brass","bpm":132,"at":0,"notes":[{"note":67,"beats":0.5},{"note":67,"beats":0.5},{"note":67,"beats":0.5},{"note":72,"beats":2.5}]}],["B · call and answer",{"instrument":"brass","bpm":132,"at":0,"notes":[{"note":72,"beats":0.5},{"note":76,"beats":0.5},{"note":79,"beats":1},{"note":76,"beats":0.5},{"note":79,"beats":0.5},{"note":84,"beats":2}]}],["C · quick run to a held note",{"instrument":"brass","bpm":132,"at":0,"notes":[{"note":72,"beats":0.25},{"note":74,"beats":0.25},{"note":76,"beats":0.25},{"note":77,"beats":0.25},{"note":79,"beats":0.25},{"note":81,"beats":0.25},{"note":84,"beats":2.5}]}]]);

/** What each sound is for, and its variants (label → options). */
const ABOUT = /** @type {Record<string, [string, [string, object][]]>} */ ({
  whistle: ['The referee: kick-offs, goals and fouls (short), half-time (long), full time (three).', [['short', { blast: 'short' }], ['long', { blast: 'long' }], ['full time', { blast: 'full_time' }]]],
  kick: ['Every pass: soft for a short one, harder for a long one.', [['short pass', { power: 0.2 }], ['long pass', { power: 0.9 }]]],
  shot: ['A shot as it\'s struck.', [['soft', { power: 0.2 }], ['hard', { power: 1 }]]],
  net: ['A goal, as the ball hits the net.', [['play', {}]]],
  save: ['The keeper\'s glove.', [['parried', { held: false }], ['held', { held: true }]]],
  post: ['A miss that shaves a post.', [['play', {}]]],
  block: ['A defender blocks a shot.', [['play', {}]]],
  burn: ['The ball burns out.', [['play', {}]]],
  sub: ['The chime as sound is turned on (substitutions get a short whistle now, Task 61).', [['play', {}]]],
  roar: ['The crowd at a goal (bigger for a home goal, a scorcher, a late winner). Tom, 2026-10-20: new cheers to mix in with the plain roar, each on top of it, small (as for the walk-out or handshakes in place of the applause) and big (a goal): whoops (high voices whooping up), whistles (fingers in the mouth), hey (a shout as one, the roar behind), clapping (hands under the roar).', [['small', { power: 0.2 }], ['big', { power: 1 }], ...['whoops', 'whistles', 'hey', 'clapping'].flatMap((cheer) => [[`${cheer} · small`, { power: 0.4, cheer }], [`${cheer} · big`, { power: 1, cheer }]])]],
  groan: ['A miss near goal.', [['play', {}]]],
  ooh: ['A save (full), a steal (smaller), a tackle or block (soft).', [['save', { gain: 1 }], ['steal', { gain: 0.5 }], ['tackle', { gain: 0.3 }]]],
  applause: ['The walk-out, the anthems, the handshakes: a wash of hands, the hiss alone fluttering (Tom, 2026-10-18: C ripple, the claps out).', [['play', {}]]],
  anthem: ['Each team\'s anthem in the walk-out (here once through; in the walk-out it repeats to fill the caption).', []],
  sting: ['The post-match show opening, each highlights package, a re-air\'s intro card.', [['show', { sting: 'show' }], ['highlights', { sting: 'highlights' }], ['replay', { sting: 'replay' }]]],
  murmur: ['Under the play: a small roar played quietly, a new one every second or so, overlapping (as in a match).', [['once', {}]]],
  chant: ['The crowd singing "o-lé, o-lé o-lé o-lé, o-lé, o-lé" now and then.', [['play', {}]]],
  jeer: ['Booing: a foul by the away side, and under an away goal\'s cheer.', [['play', {}]]],
  whoosh: ['The glass sweep into and out of the scene between matches (Task 97).', [['play', {}]]],
  swish: ['The diagonal band between highlight clips, into each package, and between the desk and the interview (Task 97).', [['play', {}]]],
  fire: ["Task 249 (Tom): the ident's fire, from the comet's entry to its landing (about 4.6 s), following it round SCORCHBALL: panned left and right with it, louder and brighter across the front of the name and with speed, fading as the landing chord comes (played after the whoosh, before the chord). Pick one (settings.sound.identFire). A · crackle: a fire's crackles and pops over a low rumble. B · torch: a roaring flame that swells with speed. C · comet: a fizzing hiss and sparks. To hear one in place, open the channel at the opening with ?fire=crackle, ?fire=torch or ?fire=comet.", [['A · crackle', { style: 'crackle', track: FIRE_TRACK }], ['B · torch', { style: 'torch', track: FIRE_TRACK }], ['C · comet', { style: 'comet', track: FIRE_TRACK }]]],
  ident: ["The channel's opening ident, as the comet lands as the O (Task 106; a whoosh plays as it comes in).", [['play', {}]]],
  music: ["Task 203: the off-season's music, one pass of each loop (on air it loops seamlessly under the off-season's scenes, cut while the desk talks, out for the lottery and the trophy lift); Stop ends it. Tom: C was the closest of the first three (lounge and bossa dropped); D–F go further that way, more modern and upbeat, still background. C · mellow synth: pads swelling into each bar, a bell arpeggio, a soft beat (46 s). D · pulse: a soft four-on-the-floor, claps, offbeat hats, a pad pumping with the beat, plucked chords, an offbeat bass, a bell hook the second time round (34 s). E · chillhop: warm detuned keys, a soft boom-bap, swung hats, vinyl crackle, a gentle lead (45 s). F · tropical: marimba arpeggios, a light dancehall beat, a soft pad, a flute-like lead (38 s). Task 278h (Tom: pulse re-invented a couple of ways, to take turns with it under the studio cards): D2 · new chords (E-flat's IV–V–iii–vi, Ab Bb Gm Cm, home to E-flat each eight; a new hook the second time round); D3 · a new hook (catchier, both times round) and running plucks; D4 · laid back (half-time: the kick on 1 and 3, a clap on 3, a held pad; pulse's hook). All 34 s.", [['C · mellow synth', { style: 'synth' }], ['D · pulse', { style: 'pulse' }], ['D2 · pulse, new chords', { style: 'pulseB' }], ['D3 · pulse, new hook', { style: 'pulseC' }], ['D4 · pulse, laid back', { style: 'pulseD' }], ['E · chillhop', { style: 'chillhop' }], ['F · tropical', { style: 'tropical' }]]],
  lottery: ["Task 203: one draw of the draft lottery, for Tom to pick: the drum spins up, the ball drops at 6 s (as on air), rolls down the chute and lands, and the reveal. A · a mechanical rattle quickening over a rumble, a clunk into the tray, a bell. B · a ticking clock quickening, a timpani roll swelling to the drop, a brass hit. C · an airy whirr rising, a soft plop, a chime.", [['A · rattle', { style: 'rattle' }], ['B · drum roll', { style: 'drumroll' }], ['C · whirr', { style: 'whirr' }]]],
  effect: ["Task 203: a sample of the ads' effects (Task 205 gives every ad its own, under its jingle): a can's fizz (Caravan Cola), a gull's cries (Tideline, Gullwing), a splash (Tideline), a boot's strike (Ironvale), a till's bell (the League Shop). NEW (Tom's note 14, AROUND THE GROUNDS' groundstaff): the mower (played every 2.6 s while it works, so takes run together), an impact sprinkler (two, every 1.8 s), a hammer on the nets, a broom in the dugouts.", [['fizz', { effect: 'fizz' }], ['gull', { effect: 'gull' }], ['splash', { effect: 'splash' }], ['boot', { effect: 'boot' }], ['till', { effect: 'till' }], ['mower (NEW)', { effect: 'mower' }], ['sprinkler (NEW)', { effect: 'sprinkler' }], ['hammer (NEW)', { effect: 'tap' }], ['broom (NEW)', { effect: 'broom' }], ['crickets (NEW, nights)', { effect: 'crickets' }], ['walkie-talkie (NEW, the night watch)', { effect: 'radio' }], ['page turn (NEW, the manager)', { effect: 'page' }]]],
  jingle: ["The bumper sound (Task 168, Tom's pick of three): \"We'll be right back\" going into a break, \"Back to the studio\" coming out, on the studio jingle's brass. Then the studio's jingle as it returns (Task 137: Tom's tune in two readings, D1 on the channel, beside the first three variants), then each ad's jingle as its brand comes up (Task 105; the tunes are in data/spots.json).", []],
});

async function boot() {
  const config = await loadConfig(fetchText);
  const audio = createAudio(config.settings.sound, config.settings.commentary);
  let n = 0;
  const fixedSeed = /** @type {HTMLInputElement} */ (el('input'));
  fixedSeed.type = 'checkbox';
  const seed = () => (fixedSeed.checked ? 'fixed' : `board|${n++}`);

  /** A 0–1 slider with its value shown. @param {number} value @param {(v: number) => void} change */
  const slider = (value, change) => {
    const input = /** @type {HTMLInputElement} */ (el('input'));
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.05';
    input.value = String(value);
    const shown = el('span', 'val', [value.toFixed(2)]);
    input.addEventListener('input', () => {
      shown.textContent = Number(input.value).toFixed(2);
      change(Number(input.value));
    });
    return el('span', 'slider', [input, shown]);
  };
  /** @param {string} label @param {() => void} click */
  const button = (label, click) => {
    const b = el('button', '', [label]);
    b.addEventListener('click', click);
    return b;
  };

  const startBtn = button('Start sound', () => {
    audio.start();
    audio.setOn(true);
    // Every line each commentator speaks, new moments' too (Task 150: to hear them before they go on air).
    audio.loadClips(config.commentary.commentators.flatMap((/** @type {any} */ c) => linesFor(config.commentary, c.id, { all: true }).map((l) => clipUrl(c.id, l.id))));
    startBtn.textContent = 'Sound is on';
    startBtn.setAttribute('disabled', '');
  });
  const root = /** @type {HTMLElement} */ (document.getElementById('board'));
  root.append(
    el('p', '', [startBtn, ' Browsers only play sound after a click, so start here first.']),
    el('p', '', ['Master volume ', slider(config.settings.sound.master, (v) => audio.setVolume(v)), ' · ', el('label', '', [fixedSeed, ' same variation every time (otherwise each play varies a little, as in a match)'])]),
  );
  // The surname try-out (Task 244), first while it's being judged.
  const names = el('div');
  root.append(names);
  void nameTryout(names, audio, { el, button, slider });

  // The commentators' clips as the channel plays them (Task 124): every line of every moment, at the commentary
  // level, ducking whatever else is playing.
  const lineText = new Map(config.commentary.lines.map((/** @type {any} */ l) => [l.id, l.say]));
  const commentary = el('table');
  commentary.append(el('tr', '', [el('th', '', ['Moment']), ...config.commentary.commentators.map((/** @type {any} */ c) => el('th', '', [c.onAir ? c.name : `${c.name} (off air)`])), el('th', '', ['Rate · chance when close to another'])]));
  for (const [moment, spec] of Object.entries(config.commentary.moments)) {
    // A moment not on air yet (Task 149) is marked NEW; each commentator shows only the lines they speak.
    const speaks = (/** @type {any} */ c) => new Set(linesFor(config.commentary, c.id, { all: true }).map((l) => l.id));
    commentary.append(el('tr', '', [
      el('td', 'name', [spec.onAir === false ? `${moment} (NEW, off air)` : moment]),
      ...config.commentary.commentators.map((/** @type {any} */ c) => { const mine = speaks(c); return el('td', '', spec.lines.filter((/** @type {string} */ id) => mine.has(id)).map((/** @type {string} */ id) => button(lineText.get(id), () => audio.playClip(clipUrl(c.id, id))))); }),
      el('td', 'muted', [`${spec.rate ?? 1} · ${spec.chance}`]),
    ]));
  }
  // The desk's lines that name no team (Task 155: the playoffs' new ones first, to hear before they come up on the
  // channel, which is only on playoff day): each presenter's clip of each way.
  const NEW_DESK = ['playoffsOtherSemi', 'playoffsFinalSet', 'playoffsReact', 'scorersPlayoffs'];
  const studio = config.studio;
  const desk = el('table');
  desk.append(el('tr', '', [el('th', '', ['Line']), ...studio.presenters.map((/** @type {any} */ pr) => el('th', '', [pr.name]))]));
  for (const kind of NEW_DESK) {
    const spec = studio.lines[kind];
    if (!spec) continue;
    desk.append(el('tr', '', [
      el('td', 'name', [`${kind} (NEW)`]),
      ...studio.presenters.map((/** @type {any} */ pr) => el('td', '', spec.ways.map((/** @type {any} */ w, /** @type {number} */ i) => button(w.say, () => {
        const url = deskClipUrl(pr.id, { kind, way: i, team: null });
        audio.loadClips([url]);
        if (!audio.playClip(url, { kind: 'speech' })) setTimeout(() => audio.playClip(url, { kind: 'speech' }), 400);
      })))),
    ]));
  }
  root.append(el('h2', '', ["The desk: the playoffs' new lines (Task 155)"]), el('p', 'muted', ["The studio talk after a semifinal: who's through, the final ahead, the playoffs' scorers. Click Start sound first; a clip plays a moment after its first click while it loads."]), desk);

  root.append(
    el('h2', '', ['Commentary (Tasks 123–125)']),
    el('p', 'muted', ["Each commentator's clips for each moment, as the channel plays them (data/commentary.json; npm.cmd run voices -- --assets remakes them). Try one over a looping murmur to judge the level and the dip."]),
    el('p', '', ['Commentary level ', slider(audio.levels.commentary ?? 0.5, (v) => audio.setLevel('commentary', v))]),
    commentary,
  );

  // Voices tried as commentators (Task 126), then the voice audition (Task 122): they load their clips while the
  // cues below are built.
  const tries = el('div');
  const voices = el('div');
  root.append(tries, voices, el('h2', '', ['Sounds']));
  const voicesReady = voiceTries(tries, audio, { el, button, slider }).then(() => voiceAudition(voices, audio, { el, button, slider }));

  /** A button that keeps the murmur going, as in a match: a new take every 0.6–1.1 s. */
  const gaps = createRng('board|murmur');
  const murmurLoop = () => {
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    const b = button('loop', () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
        b.textContent = 'loop';
        return;
      }
      b.textContent = 'stop loop';
      const next = () => {
        audio.play('murmur', { seed: seed() });
        timer = setTimeout(next, gaps.float(600, 1100));
      };
      next();
    });
    return b;
  };
  const table = el('table');
  table.append(el('tr', '', ['Sound', 'For', 'Play', 'Level'].map((h) => el('th', '', [h]))));
  for (const kind of SOUND_KINDS) {
    const [about, listed] = ABOUT[kind];
    // Anthems: one button per team, named with its instrument.
    const variants = kind === 'anthem'
      ? config.teams.teams.map((/** @type {any} */ t) => /** @type {[string, object]} */ ([`${t.shortName} (${anthemInstrument(t.anthem)})`, { team: t.anthem }]))
      : kind === 'jingle'
      ? [
        // The bumper sound (Task 168, Tom's pick A from three takes): into a break and out of it.
        /** @type {[string, object]} */ (['Bumper in: WE\'LL BE RIGHT BACK', { jingle: config.studio.bumpers.in }]),
        /** @type {[string, object]} */ (['Bumper out: BACK TO THE STUDIO', { jingle: config.studio.bumpers.out }]),
        // The studio's jingle as it returns (Task 137): three variants on brass for Tom to pick from, then the ads'.
        ...STUDIO_JINGLES.map(([label, j]) => /** @type {[string, object]} */ ([`Studio ${label}`, { jingle: j }])),
        ...config.ads.ads.map((/** @type {any} */ a) => /** @type {[string, object]} */ ([`${a.brand} (${a.jingle.instrument})`, { jingle: a.jingle }])),
      ]
      : listed;
    table.append(el('tr', '', [
      el('td', 'name', [kind]),
      el('td', 'muted', [about]),
      el('td', '', [
        ...variants.map(([label, opts]) => button(label, () => audio.play(kind, { seed: seed(), ...opts }))),
        ...(kind === 'murmur' ? [murmurLoop()] : []),
        // The music's passes are long (Task 203, Tom): a Stop.
        ...(kind === 'music' ? [button('Stop', () => audio.stop('music'))] : []),
      ]),
      el('td', '', [slider(audio.levels[kind] ?? 0.5, (v) => audio.setLevel(kind, v))]),
    ]));
  }
  root.append(table);

  // A few sounds together, roughly as a goal would sound.
  /** @param {[number, import('./soundRecipes.js').SoundKind, object][]} steps */
  const sequence = (steps) => () => {
    for (const [at, kind, opts] of steps) audio.play(kind, { seed: seed(), delay: at, ...opts });
  };
  /** @param {boolean} boos @returns {[number, import('./soundRecipes.js').SoundKind, object][]} */
  const awayGoal = (boos) => [
    [0, 'shot', { power: 0.9 }], [0.3, 'net', {}], [1.0, 'whistle', { blast: 'short' }],
    ...[[0, 1], [2.4, 0.85], [4.6, 0.7], [6.6, 0.5]].map(([at, size]) => /** @type {[number, import('./soundRecipes.js').SoundKind, object]} */ ([0.3 + at, 'roar', { power: 0.15 * size, gain: 0.6 * size }])),
    ...(boos ? /** @type {[number, import('./soundRecipes.js').SoundKind, object][]} */ ([[0.8, 'jeer', { gain: 0.6 }], [2.5, 'jeer', { gain: 0.4 }]]) : []),
  ];
  root.append(
    el('h2', '', ['Together']),
    el('p', '', [
      button('A goal', sequence([[0, 'kick', { power: 0.3 }], [0.6, 'kick', { power: 0.8 }], [1.4, 'shot', { power: 0.9 }], [1.7, 'net', {}], [1.75, 'roar', { power: 0.9 }], [2.1, 'whistle', { blast: 'short' }]])),
      ' ',
      // An away goal as crowd.js plays it (Task 61): the away end's cheer, lingering and smaller, with home boos under it.
      button('An away goal', sequence(awayGoal(true))),
      ' ',
      button('… without the boos', sequence(awayGoal(false))),
      ' ',
      button('A save', sequence([[0, 'kick', { power: 0.4 }], [0.7, 'shot', { power: 0.7 }], [1.0, 'save', { held: false }], [1.05, 'ooh', {}]])),
      ' ',
      button('A miss', sequence([[0, 'shot', { power: 0.8 }], [0.35, 'post', {}], [0.4, 'groan', {}]])),
      ' ',
      button('An away foul', sequence([[0, 'whistle', { blast: 'short' }], [0.2, 'jeer', {}]])),
      ' ',
      button('Full time', sequence([[0, 'whistle', { blast: 'full_time' }], [1.6, 'roar', { power: 0.3 }]])),
    ]),
  );
  await voicesReady;
}

boot().catch((err) => {
  document.body.append(el('p', 'bad', [`Error: ${err.message}`]));
  throw err;
});
