// The talk at the desk (Task 58's proof of concept, Task 98; docs/channel.md §14.6, §16.7): the two presenters, the
// same for the league's whole history, taking turns to say short lines built from real facts with a seeded grammar.
// The lines and the presenters' possible looks are data (data/studio.json); each kind of line carries the gesture the
// speaker makes. Pure: who the presenters are, what they say, how and when. Tasks 99 and 101 wrote the talk for each kind
// of segment (talk.js), and Task 106 the welcome; these stand-in lines only fill in when a talk has nothing to say.
import { createRng } from '../sim/rng.js';
import { pickName } from '../sim/players.js';
import { deskClipKey, saidSeconds } from './speech.js';

/**
 * @typedef {'talk' | 'open' | 'point' | 'laugh' | 'both'} Gesture
 * @typedef {{ name: string, shirt: string, skin: number, tie: string, hair: string, style: 'short' | 'long' | 'bun', woman?: boolean, id?: string, voice?: string }} Presenter
 * @typedef {{ id: string, name: string, look: number, woman?: boolean, voice: string }} Cast  data/studio.json's
 *   presenters (Task 132): the name, which of the seeded looks they wear, a woman or not, their ElevenLabs voice.
 *   shirt: the jacket's colour; skin: an index into the skin tones.
 * @typedef {{ kind: string, way: number, team: string | null, surname?: string }} Clip  Which recorded line goes with it
 *   (Task 131): the kind, the way (its index), the team it names, if it names one, and the surname it says, if it says
 *   one (Task 246a).
 * @typedef {{ who: 0 | 1, text: string, show: string | null, clip: Clip, gesture: Gesture, from: number, until: number, showUntil: number | null }} Line
 *   text: what's said (and typed in the bubble). show: the graphic under the speaker, in capitals (Task 131).
 *   from, until: ms since the segment began. showUntil: when its graphic goes (Task 187: it outlasts the line, up
 *   until the next graphic or the talk's end); null without one.
 * @typedef {{ text: string, show: string | null, clip: Clip, gesture: Gesture, who?: 0 | 1, beatMs?: number }} Said  `beatMs`: a pause before it
 *   (OFF THE BALL's new topics, Tom 2026-10-21). `who`: the seat that says it, where a
 *   talk sets it (the playoff analyst's); otherwise the two take turns, the left first.
 * @typedef {object} StudioFacts
 * @property {{ home: string, away: string, homeGoals: number, awayGoals: number } | null} result  The latest result.
 * @property {{ name: string, points: number } | null} leader  Top of the table.
 * @property {{ home: string, away: string, when: string } | null} next  The next match.
 * @typedef {{ jackets: string[], ties: string[], hair: string[], hairStyles: ('short' | 'long' | 'bun')[] }} Looks
 * @typedef {Record<string, { gesture: Gesture, subject?: string, namedShare?: number, ways: { say: string, show?: string, not?: TalkStage[] }[] }>} Lines  data/studio.json's lines.
 * @typedef {'season' | 'settled' | 'semis' | 'finalSet' | 'done'} TalkStage  Where the season stands as a talk airs: the
 *   regular season running, over (no semifinal finished yet), one semifinal finished, the final set, the final finished.
 * @typedef {{ idByName: Record<string, string>, spoken: (teamId: string) => string }} Teams  For the one team a said
 *   line may name: its id from the name in the fill, and how it's spoken ("the Gulls").
 * @typedef {object} LineTiming  How the desk's lines are timed (Task 187; settings.studio).
 * @property {number} leadMs  Before the first line.
 * @property {number} holdMs  A line stays up this long after its clip ends...
 * @property {number} gapMs  ...then nothing for this long before the next.
 * @property {number} tailMs  After the last line, before the talk ends.
 * @property {(said: Said, who: 0 | 1) => number} lengthMs  How long the line is said for, by whom.
 * @property {(show: string) => number} readMs  How long a graphic stays up at least, to be read.
 */

/**
 * The desk's line timing from the config: the beats from settings.studio, each line as long as its clip
 * (config.voiceLengths) in the voice of whoever says it.
 * @param {import('../config.js').Config} config @param {{ id: string }[]} [cast]  Who sits where (left first): the
 *   presenters, or the playoff analyst and the host for theirs.
 * @param {(id: string, clip: Clip) => string} [keyOf]  A line's clip key by who says it (the desk's; OFF THE BALL's its own).
 * @returns {LineTiming}
 */
export function lineTiming(config, cast = /** @type {Cast[]} */ (config.studio.presenters), keyOf = deskClipKey) {
  const s = config.settings.studio;
  const usual = config.settings.captions.quoteCharsPerSecond;
  return {
    leadMs: s.lineLeadSeconds * 1000,
    holdMs: s.lineHoldSeconds * 1000,
    gapMs: s.lineGapSeconds * 1000,
    tailMs: s.talkTailSeconds * 1000,
    lengthMs: (said, who) => saidSeconds(config.voiceLengths, cast[who] ? keyOf(cast[who].id, said.clip) : null, said.text, usual) * 1000,
    readMs: (show) => Math.max(s.showMinSeconds, show.length / s.showCharsPerSecond) * 1000,
  };
}

/**
 * The channel's two presenters: the same for the league's whole history. Names and jackets come from the league's
 * seed as they always have; hair and ties (Task 98) from a stream of their own, so they didn't change anyone's name.
 * @param {string} leagueSeed @param {{ id: string, firstNames: string[], lastNames: string[] }[]} regions @param {Looks} looks
 * @returns {[Presenter, Presenter]}
 * @param {Cast[]} [cast]  Who they are (data/studio.json); without it, the seeded people (the dev pages).
 */
export function presenters(leagueSeed, regions, looks, cast) {
  const rng = createRng(`${leagueSeed}|presenters`);
  const style = createRng(`${leagueSeed}|presenters|hair`);
  const taken = new Set();
  const one = () => {
    const { firstName, lastName } = pickName(rng, rng.pick(regions), taken);
    return { name: `${firstName} ${lastName}`, shirt: rng.pick(looks.jackets), skin: rng.int(0, 3), tie: style.pick(looks.ties), hair: style.pick(looks.hair), style: style.pick(looks.hairStyles) };
  };
  const seeded = [one(), one()];
  if (!cast) return seeded;
  // Who they are now (Task 132, Tom): names from the data, each in one of the seeded looks; a woman wears her hair in a bun.
  return /** @type {[Presenter, Presenter]} */ (cast.map((c) => ({ ...seeded[c.look], id: c.id, name: c.name, voice: c.voice, ...(c.woman ? { woman: true, style: /** @type {const} */ ('bun') } : {}) })));
}

/**
 * What the presenters say, in turn, and when: up to four lines sharing `total` ms, so each has time to type out in its
 * bubble and be read, each with its kind's gesture. The same facts and seed always give the same script.
 * @param {StudioFacts} facts @param {string} seed  Varies the wording (the segment).
 * @param {{ total: number }} o @param {Lines} lines  data/studio.json's lines. @param {Teams} teams
 * @param {LineTiming} timing
 * @returns {Line[]}
 */
export function studioScript(facts, seed, { total }, lines, teams, timing) {
  const { said, say } = sayer(lines, `studio|${seed}`, teams);
  const r = facts.result;
  if (r) {
    const margin = Math.abs(r.homeGoals - r.awayGoals);
    const [winner, loser] = r.homeGoals > r.awayGoals ? [r.home, r.away] : [r.away, r.home];
    const score = `${Math.max(r.homeGoals, r.awayGoals)}-${Math.min(r.homeGoals, r.awayGoals)}`;
    if (margin === 0) {
      say('draw', { home: r.home, away: r.away, score: `${r.homeGoals}-${r.awayGoals}` });
      say('drawReaction', {});
    } else {
      say('win', { winner, loser, score });
      say(margin >= 3 ? 'bigReaction' : 'reaction', { winner, loser });
    }
  }
  if (facts.leader) say('leader', facts.leader);
  if (facts.next) say('next', facts.next);
  return timeLines(said, total, timing);
}

/**
 * Time a talk's lines one after another, the presenters taking turns (the first line presenter 0's): each as long as
 * its clip, held a moment, a short gap before the next (Task 187; until then the talk's length was shared evenly, so
 * a 2 s line sat in a 7 s slot). A line's graphic outlasts it (Tom: gone with the voice, it was too quick to read):
 * it stays up until the next line with a graphic, or the talk's end, and for its reading time at least, so a line
 * with a graphic waits for the one before's to be read, and the talk for its last. Lines that wouldn't fit in `total`
 * are squeezed in proportion (the programme sizes each talk to its lines, so only a talk at its most could need it).
 * @param {Said[]} said @param {number} total  The talk's length, ms.
 * @param {LineTiming} timing
 * @param {number} [quietMs]  How long the desk waits before the first line beyond the usual (Task 180: the studio
 *   jingle playing).
 * @returns {Line[]}
 */
export function timeLines(said, total, timing, quietMs = 0) {
  const first = timing.leadMs + quietMs;
  let at = first;
  /** When the graphic up now has been read. */
  let readBy = 0;
  /** @type {Line[]} */
  const lines = said.map((l, i) => {
    const who = l.who ?? /** @type {0 | 1} */ (i % 2);
    if (l.beatMs) at += l.beatMs;
    const from = l.show ? Math.max(at, readBy) : at;
    const until = from + timing.lengthMs(l, who) + timing.holdMs;
    if (l.show) readBy = from + timing.readMs(l.show);
    at = until + timing.gapMs;
    return { who, ...l, from, until, showUntil: null };
  });
  // Each graphic stays up to the next one, the last to the talk's end.
  const last = lines.at(-1);
  const end = last ? Math.max(last.until + timing.tailMs, readBy) : first;
  let next = end;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].show) continue;
    lines[i].showUntil = next;
    next = lines[i].from;
  }
  if (end <= total) return lines;
  const k = Math.max(0, total - first) / (end - first);
  const squeeze = (/** @type {number} */ x) => first + (x - first) * k;
  return lines.map((l) => ({ ...l, from: squeeze(l.from), until: squeeze(l.until), showUntil: l.showUntil === null ? null : squeeze(l.showUntil) }));
}

/**
 * How long a talk needs, ms: to its last line's end and a beat, and its last graphic read (or just the lead-in with
 * nothing said).
 * @param {Line[]} lines @param {LineTiming} timing @param {number} [quietMs]
 */
export function talkEnd(lines, timing, quietMs = 0) {
  const last = lines.at(-1);
  if (!last) return timing.leadMs + quietMs;
  return Math.max(last.until + timing.tailMs, ...lines.map((l) => l.showUntil ?? 0));
}

/**
 * A seeded way of picking and filling lines: `say(kind, fill)` adds one of the kind's ways to `said` (Task 131):
 * what's said, its {team} the kind's subject as spoken ("the Gulls") and its first letter a capital; what's shown, its
 * blanks filled from the facts, in capitals; and the clip that goes with it.
 * A way whose `not` lists the talk's stage is never dealt (lines that only make sense mid-season, or outside the
 * knockouts); a kind with no way left for the stage says nothing.
 * @param {Lines} lines @param {string} seed @param {Teams} teams @param {boolean} [playerNames]
 * @param {TalkStage | null} [stage]  Where the season stands as the talk airs.
 */
export function sayer(lines, seed, teams, playerNames = false, stage = null) {
  const rng = createRng(`talk|${seed}`);
  /** @type {Said[]} */
  const said = [];
  /** @type {Record<string, number[]>} Each kind's ways still to deal in this talk (Task 184: the final round's four results). */
  const decks = {};
  /** @type {{ key: string, n: number } | null} A talk's place in a series (Task 257), if it has one. */
  let turn = null;
  /** @param {string} kind @param {Record<string, string | number>} [fill] */
  const say = (kind, fill = {}) => {
    const spec = lines[kind];
    // Dealt from a shuffle, so no way comes twice in a talk until all the others have had a turn (Task 184: four wins
    // in the final round's talk repeated a way).
    // A way that says a surname (Task 246a) is dealt only with playerNames on and a surname to say, and then (Tom) its
    // kind's namedShare of the time (always without one); the other ways the rest. Named and plain ways have their own decks.
    const says = (/** @type {{ say: string }} */ w) => w.say.includes('{surname}');
    const canName = playerNames && Boolean(fill.surname) && spec.ways.some(says);
    // A kind of named ways only (interviewTeeUpNamed: its share is rolled where it's chosen) is always named.
    const onlyNamed = spec.ways.every(says);
    const withName = canName && (spec.namedShare === undefined || onlyNamed || rng.chance(spec.namedShare));
    const deck = `${kind}|${withName ? 'named' : 'plain'}`;
    if (!decks[deck]?.length) {
      decks[deck] = rng.shuffle(spec.ways.map((_, i) => i).filter((i) => says(spec.ways[i]) === withName && !(stage && spec.ways[i].not?.includes(stage))));
      if (!decks[deck].length) return;
      // In a series (Task 257: the opening, a day each), each kind's first way follows the series' own seeded order,
      // so a kind of N ways comes round again only after N turns (talk by talk it was a fresh shuffle each time).
      if (turn && !withName) {
        const order = createRng(`turn|${turn.key}|${kind}`).shuffle([...decks[deck]].sort((a, b) => a - b));
        const first = order[turn.n % order.length];
        decks[deck] = [...decks[deck].filter((i) => i !== first), first];
      }
    }
    const way = spec.ways[/** @type {number} */ (decks[deck].pop())];
    const named = way.say.includes('{team}') && spec.subject ? teams.idByName[String(fill[spec.subject])] ?? null : null;
    const surname = says(way) ? String(fill.surname) : null;
    const text = way.say.replace(/\{team\}/g, named ? teams.spoken(named) : String(fill.team ?? '')).replace(/\{surname\}/g, surname ?? '');
    const show = way.show ? way.show.replace(/\{(\w+)\}/g, (_, k) => String(fill[k] ?? '')).toUpperCase() : null;
    said.push({ text: text.charAt(0).toUpperCase() + text.slice(1), show, clip: { kind, way: spec.ways.indexOf(way), team: named, ...(surname ? { surname } : {}) }, gesture: spec.gesture });
  };
  /** Set the talk's place in a series: `key` names it (and its season), `n` counts its turns. @param {string} key @param {number} n */
  const setTurn = (key, n) => { turn = { key, n }; };
  return { said, say, rng, setTurn };
}

/**
 * The teams as a said line names them (Task 131): by id from their short name, spoken with data/studio.json's
 * spokenTeam ("the {name}").
 * @param {Record<string, { shortName: string }>} teams @param {string} spokenTeam
 * @returns {Teams}
 */
export function teamsForTalk(teams, spokenTeam) {
  return {
    idByName: Object.fromEntries(Object.entries(teams).map(([id, t]) => [t.shortName, id])),
    spoken: (id) => spokenTeam.replace('{name}', teams[id]?.shortName ?? ''),
  };
}
