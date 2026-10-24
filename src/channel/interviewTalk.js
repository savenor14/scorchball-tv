// What the player of the match says (Talk that remembers, Task 245; docs/channel.md §18): when the facts module has
// something about them or their team that fits the result, two sentences, a reaction and the fact, each its own clip;
// otherwise one of the canned quotes (potm.js's quoteChoice). Pure; the words are data/interviews.json's. Seeded by the
// match, so every screen hears the same.
import { createRng } from '../sim/rng.js';

/**
 * @typedef {import('../chronicle/facts.js').Fact} Fact
 * @typedef {'win' | 'draw' | 'loss'} Outcome
 * @typedef {{ say: string, key: string }} Sentence  key: the clip's name in the player's voice folder.
 */

/** Facts only the player they're about can speak to (the rest are their team's). */
const PLAYER_KINDS = new Set(['first_goal', 'milestone', 'record', 'back_from_injury', 'old_club', 'likely_last', 'one_more_season', 'scorcher_decider', 'late_decider', 'goal_haul']);

/**
 * A fact's sentences' key in data/interviews.json facts: its kind, or kind.variant (a milestone by its stat, an old club
 * by how they left, a late decider by what it decided, a likely last match won as champion, a final's rematch won in revenge).
 * @param {Fact} f
 */
export function factKey(f) {
  switch (f.kind) {
    case 'milestone': return `milestone.${f.stat}`;
    case 'old_club': return `old_club.${f.how}`;
    case 'late_decider': return `late_decider.${f.decider}`;
    case 'likely_last': return f.champion ? 'likely_last.champion' : 'likely_last';
    case 'final_rematch': return f.revenge ? 'final_rematch.revenge' : 'final_rematch';
    default: return f.kind;
  }
}

/**
 * The fact the player of the match speaks to, the heaviest first: their own, or their team's, with a sentence for the
 * result. Null when there's none.
 * @param {Fact[]} facts  factsAfter's, heaviest first.
 * @param {{ playerId: string, teamId: string, outcome: Outcome }} who
 * @param {Record<string, { say: string, results: Outcome[] }[]>} lines  interviews.facts
 */
export function interviewFact(facts, { playerId, teamId, outcome }, lines) {
  return facts.find((f) => {
    const mine = PLAYER_KINDS.has(f.kind) ? f.playerId === playerId : f.teamId === teamId;
    return mine && (lines[factKey(f)] ?? []).some((w) => w.results.includes(outcome));
  }) ?? null;
}

/**
 * The interview's two sentences when there's a fact to speak to, else null (the canned quote stands): a reaction to
 * the result, then the fact, each picked by a seeded roll among the ways that fit.
 * @param {Fact[]} facts @param {{ matchId: string, playerId: string, teamId: string, outcome: Outcome }} who
 * @param {{ reactions: Record<Outcome, string[]>, facts: Record<string, { say: string, results: Outcome[] }[]> }} data  interviews
 * @returns {{ fact: Fact, sentences: [Sentence, Sentence] } | null}
 */
export function interviewTalk(facts, who, data) {
  const fact = interviewFact(facts, who, data.facts);
  if (!fact) return null;
  const rng = createRng(`${who.matchId}|interview-talk`);
  const reactions = data.reactions[who.outcome];
  const r = rng.int(0, reactions.length - 1);
  const key = factKey(fact);
  const ways = data.facts[key].map((w, i) => ({ ...w, i })).filter((w) => w.results.includes(who.outcome));
  const way = ways[rng.int(0, ways.length - 1)];
  return {
    fact,
    sentences: [
      { say: reactions[r], key: `reaction-${who.outcome}-${r}` },
      { say: way.say, key: `fact-${key.replace('.', '-')}-${way.i}` },
    ],
  };
}
