// The Director's desk, server side (Task 264; docs/director.md §8): what director.html reads and the actions it takes,
// served by the dev server on this computer only (never published). Approving writes the proposal's entry to its data
// file (data/ruleChanges.json, or a poll's result in data/polls.json) once the whole config still validates with it;
// rejecting adds it to data/rejections.json. Both take it off the proposals. Tom commits and publishes after. The
// roadmap (Task 265b, data/roadmap.json): growth ideas with their status and notes, and the viewers' notes linked to each.
// Viewers (Task 277e): the channel's hellos, counted (src/director/viewers.js), the live site's and this dev server's.
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCalendar } from '../channel/calendar.js';
import { LiveLeague } from '../channel/liveLeague.js';
import { tableAt } from '../channel/onScreen.js';
import { talkContext } from '../channel/talk.js';
import { createTimeline } from '../channel/timeline.js';
import { dayPost } from '../director/dailyPost.js';
import { secretSeed } from './daykey.js';
import { allPolls } from '../channel/polls.js';
import { loadConfig } from '../config.js';
import { viewerStats, visitsFromHellos, withoutMine } from '../director/viewers.js';
import { finishedSeasons } from '../director/watchers.js';
import { arrayOf, check, int, obj, oneOf, optional, pattern, str } from '../schema.js';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** A roadmap idea's statuses, in order. */
export const ROADMAP_STATUSES = /** @type {const} */ (['idea', 'considering', 'planned', 'building', 'done']);

const ROADMAP_SCHEMA = obj({
  ideas: arrayOf(obj({
    id: pattern(/^[a-z0-9_]+$/, 'a lower-case id'), title: str(), what: str(), needs: optional(str()), status: oneOf(...ROADMAP_STATUSES),
    notes: optional(str()), doneSeason: optional(int(0)),
  })),
});

const REJECTIONS_SCHEMA = obj({
  rejections: arrayOf(obj({
    id: str(), kind: oneOf('rule_change', 'poll_result'), watcher: optional(str()), finished: int(0), rejected: str(), summary: str(), note: optional(str()),
  })),
});

/**
 * Where the desk reads and writes. Tests point it at a copy.
 * @typedef {object} DeskPaths
 * @property {string} root  The project folder (data/ under it).
 * @property {string} proposals  output/director/proposals.json
 * @property {string} votes  output/audience/votes.jsonl
 * @property {string} notes  output/audience/notes.jsonl
 * @property {string} notesState  output/audience/notes-state.json (read, tag, the roadmap idea it's linked to)
 * @property {string} hellos  output/audience/hellos.jsonl (Task 277e: the dev server's)
 * @property {string} viewersState  output/audience/viewers-state.json (Task 278: `me`, the tags Tom marked as his own)
 */

/** @param {string} [root] @returns {DeskPaths} */
export function deskPaths(root = PROJECT_ROOT) {
  return {
    root,
    proposals: join(root, 'output', 'director', 'proposals.json'),
    votes: join(root, 'output', 'audience', 'votes.jsonl'),
    notes: join(root, 'output', 'audience', 'notes.jsonl'),
    notesState: join(root, 'output', 'audience', 'notes-state.json'),
    hellos: join(root, 'output', 'audience', 'hellos.jsonl'),
    viewersState: join(root, 'output', 'audience', 'viewers-state.json'),
  };
}

/** @param {string} file @param {any} fallback */
async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** @param {string} file @returns {Promise<any[]>} */
async function readLines(file) {
  try {
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * The live site's votes or notes from the audience service (Task 276), with the desk's token: AUDIENCE_TOKEN from the
 * environment or .env (never in the repo). None (and the desk's local files alone) without a token or a connection.
 * @param {string} root @param {string} service  settings.audience.service @param {'votes' | 'notes' | 'visits'} kind
 * @returns {Promise<any[] | null>}  null without a token or a connection.
 */
export async function serviceLines(root, service, kind) {
  const env = await readFile(join(root, '.env'), 'utf8').catch(() => '');
  const token = process.env.AUDIENCE_TOKEN ?? env.split(/\r?\n/).find((l) => l.startsWith('AUDIENCE_TOKEN='))?.slice('AUDIENCE_TOKEN='.length).trim();
  if (!token) return null;
  try {
    const res = await fetch(`${service}/admin/${kind}`, { headers: { authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** @param {string} file @param {any} value */
async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** The project's config read from `root`, with some files' text replaced (to check an approval before writing it). @param {string} root @param {Record<string, string>} [replaced] */
const configFrom = (root, replaced = {}) => loadConfig((path) => (path in replaced ? Promise.resolve(replaced[path]) : readFile(join(root, path), 'utf8')));

/** data/rejections.json, checked. @param {string} root @returns {Promise<import('../director/watchers.js').Rejection[]>} */
export async function readRejections(root = PROJECT_ROOT) {
  return readChecked(root, 'rejections', REJECTIONS_SCHEMA).then((json) => json.rejections.map((/** @type {any} */ r) => ({ watcher: null, note: '', ...r })));
}

/** data/roadmap.json, checked. @param {string} root */
export async function readRoadmap(root = PROJECT_ROOT) {
  // Notes are left out when empty (the schema's strings aren't).
  return readChecked(root, 'roadmap', ROADMAP_SCHEMA);
}

/** A desk-only data file, checked against its schema. @param {string} root @param {'rejections' | 'roadmap'} name @param {any} schema */
async function readChecked(root, name, schema) {
  const json = await readJson(join(root, 'data', `${name}.json`), name === 'roadmap' ? { ideas: [] } : { rejections: [] });
  const errors = check(json, schema);
  if (errors.length) throw new Error(`data/${name}.json → ${errors.join('; ')}`);
  return json;
}

/**
 * Everything the desk shows: the latest proposals, the rejections, each poll's running tally (the votes kept so far;
 * Tom's eyes only), the notes newest first with their read, tag and roadmap link, and the roadmap: each idea with the
 * notes linked to it and its announcements, beside the seasons played and since the last idea was done.
 * @param {DeskPaths} p
 */
export async function deskState(p) {
  const config = await configFrom(p.root);
  // The dev server's (output/audience/) and the live site's (the audience service, Task 276).
  const votes = [...(await readLines(p.votes)), ...((await serviceLines(p.root, config.settings.audience.service, 'votes')) ?? [])];
  const notesState = await readJson(p.notesState, {});
  const now = Date.now();
  const polls = allPolls(config, createCalendar(config), now).map((poll) => {
    /** @type {Record<string, number>} */
    const counts = Object.fromEntries(poll.options.map((o) => [o.id, 0]));
    for (const v of votes) if (v.pollId === poll.id && v.optionId in counts) counts[v.optionId]++;
    const labels = Object.fromEntries(poll.options.map((o) => [o.id, o.label]));
    return { id: poll.id, question: poll.question, opensAt: poll.opensAt, closesAt: poll.closesAt, status: now < poll.opensAt ? 'upcoming' : poll.status, announced: poll.votes !== null || /** @type {any[]} */ (config.polls.polls).some((x) => x.id === poll.id && x.result), counts, labels };
  });
  const notes = [...(await readLines(p.notes)), ...((await serviceLines(p.root, config.settings.audience.service, 'notes')) ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1)).reverse().map((n) => ({ ...n, read: !!notesState[n.at]?.read, tag: notesState[n.at]?.tag ?? null, roadmap: notesState[n.at]?.roadmap ?? null }));
  const finished = finishedSeasons(config, createCalendar(config), now);
  const { ideas } = await readRoadmap(p.root);
  const lastDone = Math.max(-1, ...ideas.filter((i) => i.status === 'done' && i.doneSeason !== undefined).map((i) => i.doneSeason));
  const roadmap = {
    finished,
    sinceLastBigChange: lastDone < 0 ? null : finished - lastDone,
    ideas: ideas.map((i) => ({
      ...i,
      notes: i.notes ?? '',
      linkedNotes: notes.filter((n) => n.roadmap === i.id),
      announcements: /** @type {any[]} */ (config.decisions.decisions).filter((d) => d.kind === 'announcement' && d.roadmap === i.id).map((d) => ({ id: d.id, headline: d.headline, announced: d.announced })),
    })),
  };
  // Viewers (Task 277e): the live site's (null when the service can't be reached) and this dev server's, apart. The
  // tags Tom marked as his own are left out of the figures (Task 278), and listed so he can find and mark them.
  const counting = { timeZone: config.settings.live.timeZone, watchingMinutes: config.settings.audience.watchingMinutes };
  const liveVisits = await serviceLines(p.root, config.settings.audience.service, 'visits');
  const me = new Set(/** @type {string[]} */ ((await readJson(p.viewersState, { me: [] })).me));
  const live = liveVisits ? withoutMine(liveVisits, me, now, counting) : null;
  const viewers = {
    live: live?.stats ?? null,
    list: live?.list ?? [],
    dev: viewerStats(visitsFromHellos(await readLines(p.hellos)), now, counting),
    helloMinutes: config.settings.audience.helloMinutes,
  };
  return { report: await readJson(p.proposals, null), rejections: await readRejections(p.root), polls, notes, roadmap, viewers };
}

/** The proposal with this id, and the report it's in. @param {DeskPaths} p @param {string} id */
async function findProposal(p, id) {
  const report = await readJson(p.proposals, null);
  const proposal = report?.proposals?.find((/** @type {any} */ x) => x.id === id);
  if (!proposal) throw new Error(`No proposal "${id}" (run the Director again?)`);
  return { report, proposal };
}

/** Take a proposal off the list. @param {DeskPaths} p @param {any} report @param {string} id */
async function dropProposal(p, report, id) {
  report.proposals = report.proposals.filter((/** @type {any} */ x) => x.id !== id);
  await writeJson(p.proposals, report);
}

/**
 * Approve a proposal: its entry written to its data file, if the whole config still validates with it.
 * @param {DeskPaths} p @param {string} id
 * @param {string} [reason]  A rule change's reason as Tom edited it (kept with it; never announced, Task 265).
 * @returns {Promise<{ file: string }>}
 */
export async function approve(p, id, reason) {
  const { report, proposal } = await findProposal(p, id);
  if (proposal.kind === 'rule_change' && reason?.trim()) proposal.change.reason = reason.trim();
  const file = proposal.kind === 'rule_change' ? 'data/ruleChanges.json' : 'data/polls.json';
  const json = JSON.parse(await readFile(join(p.root, file), 'utf8'));
  if (proposal.kind === 'rule_change') {
    if (json.changes.some((/** @type {any} */ c) => c.id === proposal.change.id)) throw new Error(`${proposal.change.id} is already in ${file}`);
    json.changes.push(proposal.change);
  } else {
    const poll = json.polls.find((/** @type {any} */ x) => x.id === proposal.id);
    if (!poll) throw new Error(`No poll "${proposal.id}" in ${file}`);
    if (poll.result) throw new Error(`${proposal.id} already has its result`);
    poll.result = proposal.result;
  }
  const text = `${JSON.stringify(json, null, 2)}\n`;
  // Throws (ConfigError) if the league's data wouldn't load with it: nothing is written.
  await configFrom(p.root, { [file]: text });
  await writeFile(join(p.root, file), text);
  await dropProposal(p, report, id);
  return { file };
}

/**
 * Reject a proposal: kept in data/rejections.json (silencing its watcher, Task 264) and taken off the list.
 * @param {DeskPaths} p @param {string} id @param {string} note
 */
export async function reject(p, id, note) {
  const { report, proposal } = await findProposal(p, id);
  const file = join(p.root, 'data', 'rejections.json');
  const json = await readJson(file, { rejections: [] });
  const summary = proposal.kind === 'rule_change'
    ? `${proposal.evidence.measure} ${proposal.evidence.side} (${proposal.evidence.seasons.map((/** @type {any} */ s) => `S${s.season} ${s.value}`).join(', ')}): ${proposal.lever.path} ${proposal.lever.from} → ${proposal.lever.to}`
    : `${proposal.question} ${proposal.total} votes`;
  json.rejections.push({ id, kind: proposal.kind, ...(proposal.watcher ? { watcher: proposal.watcher } : {}), finished: report.finished, rejected: new Date().toISOString(), summary, ...(String(note ?? '').trim() ? { note: String(note).trim().slice(0, 500) } : {}) });
  await writeJson(file, json);
  await dropProposal(p, report, id);
}

/**
 * Mark a note read or tag it.
 * @param {DeskPaths} p @param {string} at  The note's time, its key.
 * @param {{ read?: boolean, tag?: 'bug' | 'idea' | null, roadmap?: string | null }} patch  `roadmap`: link the note to an idea (Task 265b), or null.
 */
export async function markNote(p, at, patch) {
  const state = await readJson(p.notesState, {});
  const next = { ...(state[at] ?? {}) };
  if (typeof patch.read === 'boolean') next.read = patch.read;
  if (patch.tag === null || patch.tag === 'bug' || patch.tag === 'idea') next.tag = patch.tag;
  if (patch.roadmap === null) next.roadmap = null;
  else if (typeof patch.roadmap === 'string') {
    const { ideas } = await readRoadmap(p.root);
    if (!ideas.some((i) => i.id === patch.roadmap)) throw new Error(`No roadmap idea "${patch.roadmap}"`);
    next.roadmap = patch.roadmap;
  }
  state[at] = next;
  await writeJson(p.notesState, state);
}

/**
 * Mark a viewer's tag as Tom's own (left out of the figures) or not (Task 278). Kept on Tom's computer only.
 * @param {DeskPaths} p @param {string} viewer  The 12-character tag. @param {boolean} me
 */
export async function markViewer(p, viewer, me) {
  if (!/^[0-9a-f]{12}$/.test(viewer)) throw new Error(`Not a viewer's tag: "${viewer}"`);
  const state = await readJson(p.viewersState, { me: [] });
  const tags = new Set(/** @type {string[]} */ (state.me));
  if (me) tags.add(viewer);
  else tags.delete(viewer);
  await writeJson(p.viewersState, { ...state, me: [...tags].sort() });
}

/**
 * Change a roadmap idea's status or notes (data/roadmap.json). Marked done, it keeps the last finished season, for
 * "seasons since the last big change"; moved off done, it loses it.
 * @param {DeskPaths} p @param {string} id @param {{ status?: string, notes?: string }} patch
 */
export async function updateIdea(p, id, patch) {
  const json = await readRoadmap(p.root);
  const idea = json.ideas.find((/** @type {any} */ i) => i.id === id);
  if (!idea) throw new Error(`No roadmap idea "${id}"`);
  if (patch.status !== undefined) {
    if (!ROADMAP_STATUSES.includes(/** @type {any} */ (patch.status))) throw new Error(`A status is one of ${ROADMAP_STATUSES.join(', ')}`);
    if (patch.status === 'done' && idea.status !== 'done') {
      const config = await configFrom(p.root);
      idea.doneSeason = finishedSeasons(config, createCalendar(config), Date.now());
    }
    if (patch.status !== 'done') delete idea.doneSeason;
    idea.status = patch.status;
  }
  if (typeof patch.notes === 'string') {
    if (patch.notes.trim()) idea.notes = patch.notes.trim().slice(0, 4000);
    else delete idea.notes;
  }
  await writeJson(join(p.root, 'data', 'roadmap.json'), json);
}

/**
 * Run the Director (`npm run director`) in its own process, so the dev server keeps serving while it works.
 * @param {DeskPaths} p @param {string | null} at  A date-time to run it at, or null for now.
 * @returns {Promise<string>} What it printed.
 */
export function runDirectorProcess(p, at) {
  const args = [join(p.root, 'src', 'cli', 'director.js'), ...(at ? ['--at', at] : [])];
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: p.root, timeout: 300_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim() || err.message));
      else resolve(stdout);
    });
  });
}

/**
 * TODAY (getting the word out, docs/launch-plan.md): each finished day's post for the league's Bluesky account, newest
 * first, from the live league rebuilt here (SCORCHBALL_SEED in .env, never printed; the dev league's seed without
 * keys). A day is offered only once its last match has finished by the real clock (the day keys are out 12 hours
 * ahead: a post before then would spoil it). The current season's days and the last one's.
 * @param {DeskPaths} p @param {number} [now] @param {string | null} [seedFor]  Another seed (the tests: the dev league).
 */
export async function todayPosts(p, now = Date.now(), seedFor = null) {
  const config = await configFrom(p.root);
  const keys = config.settings.live.mode === 'keys' && !seedFor;
  const seed = seedFor ?? (keys ? secretSeed() : config.settings.live.seed);
  if (!seed) throw new Error('No SCORCHBALL_SEED in .env: the live league can\'t be rebuilt here.');
  const live = new LiveLeague(config, { now, seed });
  /** @type {Map<string, import('../channel/timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('../channel/liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
  const durationOf = (/** @type {import('../channel/liveLeague.js').LiveMatch} */ m) => timelineOf(m).duration;
  const calendar = live.calendar;
  const { timeZone } = config.settings.live;
  const weekday = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'long' });
  const ctx = talkContext(live, timelineOf);
  const abbr = (/** @type {string} */ id) => live.league.teams[id].abbr;
  const season = calendar.seasonAt(now);
  const days = [];
  for (const s of [season, season - 1].filter((x) => x >= 1)) {
    const matches = live.matchesIn(s);
    for (let d = config.settings.calendar.seasonDays - 1; d >= 0; d--) {
      const from = calendar.instant(s, d * 1440);
      const to = calendar.instant(s, (d + 1) * 1440);
      const day = matches.filter((m) => m.kickoff >= from && m.kickoff < to);
      // Every match played and over (a day still under way, or not reached, isn't offered).
      if (!day.length || day.some((m) => m.kickoff + durationOf(m) > now)) continue;
      const has = (/** @type {string} */ st) => day.some((m) => m.stage === st);
      const stage = has('final') ? (has('semifinal') ? 'the semifinals and the final' : 'the final') : has('semifinal') ? 'the semifinals' : weekday.format(from);
      const end = Math.max(...day.map((m) => m.kickoff + durationOf(m)));
      const standings = tableAt(live, s, end, durationOf).map((r) => ({ teamId: r.teamId, points: r.points, won: r.won, drawn: r.drawn, lost: r.lost }));
      const table = day.every((m) => m.stage === 'regular') ? standings : [];
      const post = dayPost({ heading: `Scorchball · Season ${s}, ${stage}`, matches: day, timelineOf, playerName: ctx.playerName, abbr, clipSettings: config.settings.clips, table, link: 'scorchball.tv/?from=bsky', fullTable: standings, potm: config.interviews.potm, dayKey: `s${s}d${d}` });
      days.push({ key: `s${s}d${d}`, label: `Season ${s}, ${stage} (${new Date(from).toISOString().slice(0, 10)})`, endedAt: new Date(end).toISOString(), ...post });
    }
  }
  return { league: keys ? 'live' : seed, days };
}
