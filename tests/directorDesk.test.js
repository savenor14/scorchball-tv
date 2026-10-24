import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { approve, deskPaths, deskState, markNote, markViewer, readRejections, reject, updateIdea } from '../src/cli/directorDesk.js';
import { createStaticServer } from '../src/cli/serve.js';
import { ruleProposals, silenced } from '../src/director/watchers.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const real = await loadConfigFromDisk();

/** A copy of the project's config and data to work on, with these proposals; removed after. @param {import('node:test').TestContext} t @param {any[]} proposals */
async function copy(t, proposals) {
  const root = await mkdtemp(join(tmpdir(), 'desk-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(ROOT, 'config'), join(root, 'config'), { recursive: true });
  await cp(join(ROOT, 'data'), join(root, 'data'), { recursive: true });
  await mkdir(join(root, 'assets', 'voices'), { recursive: true });
  await cp(join(ROOT, 'assets', 'voices', 'lengths.json'), join(root, 'assets', 'voices', 'lengths.json'));
  const p = deskPaths(root);
  await mkdir(join(root, 'output', 'director'), { recursive: true });
  await writeFile(p.proposals, JSON.stringify({ at: '2027-03-29T03:00:00.000Z', seed: 'flareball', season: 25, finished: 25, measures: [], proposals }));
  return p;
}

const seasons = (/** @type {number[]} */ goals, first = 1) => goals.map((g, i) => ({ season: first + i, matches: 56, goalsPerMatch: g, scorcherShare: 25, burnsPerMatch: 3.5 }));
const [goalsChange] = ruleProposals(real, seasons([7, 7, 8.4, 8.6, 8.5]), 6);
const pollResult = { id: 'favourite_team', kind: 'poll_result', question: "WHO'S YOUR FAVOURITE TEAM?", votes: { 't-gulls': 2 }, total: 2, result: { announced: { season: 5, at: 'day 7 22:00' }, votes: { 't-gulls': 2 } } };

test('approving a rule change writes it to data/ruleChanges.json, with the reason as edited, and takes it off the list', async (t) => {
  const p = await copy(t, [goalsChange, pollResult]);
  assert.deepEqual(await approve(p, 'goals_s6', 'The League narrows the goalmouth.'), { file: 'data/ruleChanges.json' });
  const changes = JSON.parse(await readFile(join(p.root, 'data', 'ruleChanges.json'), 'utf8')).changes;
  assert.deepEqual(changes.at(-1), { ...goalsChange.change, reason: 'The League narrows the goalmouth.' });
  assert.ok(changes[0]._comment === undefined && changes[0].id === 'rookie_rule', 'the rest kept');
  const state = await deskState(p);
  assert.deepEqual(state.report.proposals.map((/** @type {any} */ x) => x.id), ['favourite_team']);
  await assert.rejects(approve(p, 'goals_s6'), /No proposal "goals_s6"/);
});

test('approving a poll result writes it to the poll; an approval the config rejects writes nothing', async (t) => {
  const bad = { ...pollResult, id: 'favourite_team', result: { announced: { season: 5, at: 'day 7 20:00' }, votes: { 't-gulls': 2 } } };
  const p = await copy(t, [bad]);
  const before = await readFile(join(p.root, 'data', 'polls.json'), 'utf8');
  await assert.rejects(approve(p, 'favourite_team'), /no earlier than the poll closes/);
  assert.equal(await readFile(join(p.root, 'data', 'polls.json'), 'utf8'), before);
  const q = await copy(t, [pollResult]);
  await approve(q, 'favourite_team');
  const poll = JSON.parse(await readFile(join(q.root, 'data', 'polls.json'), 'utf8')).polls[0];
  assert.deepEqual(poll.result, pollResult.result);
});

test('rejecting keeps it in data/rejections.json, and the watcher stays silent until its measure is back in its band', async (t) => {
  const p = await copy(t, [goalsChange, pollResult]);
  await reject(p, 'goals_s6', 'Let the league find its way.');
  await reject(p, 'favourite_team', '');
  const rejections = await readRejections(p.root);
  assert.deepEqual(rejections.map((r) => [r.id, r.kind, r.watcher, r.finished, r.note]), [['goals_s6', 'rule_change', 'goals', 25, 'Let the league find its way.'], ['favourite_team', 'poll_result', null, 25, '']]);
  assert.match(rejections[0].summary, /goalsPerMatch high .* contests\.save\.bias 1\.05 → 1\.15/);
  const w = real.director.watchers[0];
  assert.ok(silenced(w, seasons([8.5, 8.6, 8.7, 8.4], 23), rejections), 'still out since');
  assert.ok(!silenced(w, seasons([8.5, 8.6, 8.7, 7.2], 23), rejections), 'back in the band in season 26');
  assert.equal(ruleProposals(real, seasons([8.5, 8.6, 8.7, 8.4], 23), 27, rejections).filter((x) => x.watcher === 'goals').length, 0);
  assert.equal(ruleProposals(real, seasons([8.5, 8.6, 8.7, 7.2, 8.3, 8.4, 8.5], 23), 30, rejections).filter((x) => x.watcher === 'goals').length, 1, 'tripped again');
});

test('notes are marked read and tagged; the state shows each poll\'s running tally and the notes newest first', async (t) => {
  const p = await copy(t, []);
  await mkdir(join(p.root, 'output', 'audience'), { recursive: true });
  await writeFile(p.votes, `${JSON.stringify({ at: 'x', pollId: 'favourite_team', optionId: 't-gulls' })}\n${JSON.stringify({ at: 'y', pollId: 'favourite_team', optionId: 't-gulls' })}\n`);
  await writeFile(p.notes, `${JSON.stringify({ at: '2026-10-12T01:00:00.000Z', text: 'first', onAir: 'S2' })}\n${JSON.stringify({ at: '2026-10-12T02:00:00.000Z', text: 'second', onAir: 'S2' })}\n`);
  await markNote(p, '2026-10-12T01:00:00.000Z', { read: true, tag: 'bug' });
  const s = await deskState(p);
  assert.deepEqual(s.notes.map((/** @type {any} */ n) => [n.text, n.read, n.tag]), [['second', false, null], ['first', true, 'bug']]);
  assert.equal(s.polls[0].counts['t-gulls'], 2);
  assert.equal(s.polls[0].labels['t-gulls'], 'GULLS');
});

test('the desk\'s endpoints answer only with the x-director header', async (t) => {
  const p = await copy(t, []);
  const server = createStaticServer(ROOT, { desk: p });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  t.after(() => server.close());
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const url = `http://127.0.0.1:${port}/api/director/state`;
  assert.equal((await fetch(url)).status, 403);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/director/reject`, { method: 'POST', body: '{"id":"x"}' })).status, 403);
  const ok = await fetch(url, { headers: { 'x-director': '1' } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).report.season, 25);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/director/approve`, { method: 'POST', headers: { 'x-director': '1' }, body: '{"id":"nope"}' })).status, 400);
});

test('the roadmap: seeded with four ideas; status and notes saved, done stamped with the season; notes linked to an idea', async (t) => {
  const p = await copy(t, []);
  let s = await deskState(p);
  assert.deepEqual(s.roadmap.ideas.map((/** @type {any} */ i) => [i.id, i.status, i.notes]), [['expansion', 'idea', ''], ['extra_player', 'idea', ''], ['world_view', 'idea', ''], ['guest_panellist', 'idea', '']]);
  assert.equal(s.roadmap.sinceLastBigChange, null);
  await updateIdea(p, 'extra_player', { status: 'considering', notes: 'Worth weighing with expansion.' });
  await updateIdea(p, 'world_view', { status: 'done' });
  const file = JSON.parse(await readFile(join(p.root, 'data', 'roadmap.json'), 'utf8'));
  const world = file.ideas.find((/** @type {any} */ i) => i.id === 'world_view');
  assert.equal(typeof world.doneSeason, 'number');
  await updateIdea(p, 'extra_player', { notes: '   ' });
  assert.equal(JSON.parse(await readFile(join(p.root, 'data', 'roadmap.json'), 'utf8')).ideas[1].notes, undefined, 'empty notes left out');
  await assert.rejects(updateIdea(p, 'extra_player', { status: 'someday' }), /A status is one of/);
  await assert.rejects(updateIdea(p, 'nope', { status: 'idea' }), /No roadmap idea/);
  // A note linked to an idea counts behind it; a link to no idea is refused.
  await mkdir(join(p.root, 'output', 'audience'), { recursive: true });
  await writeFile(p.notes, `${JSON.stringify({ at: '2026-10-12T01:00:00.000Z', text: 'More teams please!', onAir: 'S2' })}\n`);
  await markNote(p, '2026-10-12T01:00:00.000Z', { roadmap: 'expansion' });
  await assert.rejects(markNote(p, '2026-10-12T01:00:00.000Z', { roadmap: 'nope' }), /No roadmap idea/);
  s = await deskState(p);
  const expansion = s.roadmap.ideas.find((/** @type {any} */ i) => i.id === 'expansion');
  assert.deepEqual(expansion.linkedNotes.map((/** @type {any} */ n) => n.text), ['More teams please!']);
  assert.equal(s.roadmap.sinceLastBigChange, s.roadmap.finished - world.doneSeason);
  await updateIdea(p, 'world_view', { status: 'building' });
  assert.equal(JSON.parse(await readFile(join(p.root, 'data', 'roadmap.json'), 'utf8')).ideas[2].doneSeason, undefined, 'off done, off the stamp');
});

test('a viewer\'s tag marked as Tom\'s own and unmarked, kept in output/; anything but a tag refused (Task 278)', async (t) => {
  const p = await copy(t, []);
  await markViewer(p, '0123456789ab', true);
  await markViewer(p, 'ba9876543210', true);
  await markViewer(p, '0123456789ab', false);
  assert.deepEqual(JSON.parse(await readFile(p.viewersState, 'utf8')), { me: ['ba9876543210'] });
  await assert.rejects(markViewer(p, '../nope', true), /Not a viewer's tag/);
});
