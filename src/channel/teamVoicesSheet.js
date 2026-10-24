// teamvoices.html (Task 278e): every desk clip naming one team, with its words, to hear how the name is said and mark
// the wrong ones for re-voicing. The clips and their words follow src/cli/voices.js makeSpeech's rule: each way of each
// line with {team}, per presenter, spoken as studio.sayAs or spokenTeam, and per surname where it has {surname}.
// ?team=all: every team; ?line=factDynasty: one kind of line; ?marked: only the clips marked wrong (to hear them re-voiced).

const json = (/** @type {string} */ f) => fetch(f).then((r) => r.json());
const [studio, { teams }, { regions }] = await Promise.all([json('data/studio.json'), json('data/teams.json'), json('data/regions.json')]);
const params = new URLSearchParams(location.search);
const teamId = params.get('team') ?? 't-rime';
const picked = teamId === 'all' ? teams : teams.filter((/** @type {any} */ t) => t.id === teamId);
const onlyLine = params.get('line');
const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
if (!picked.length) throw new Error(`No team ${teamId}`);
const team = teamId === 'all' ? { id: 'all', name: 'Every team' } : picked[0];
const surnames = regions.flatMap((/** @type {any} */ r) => r.lastNames);
const spokenOf = (/** @type {any} */ t) => studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName);

/** @type {{ who: string, file: string, said: string }[]} */
let clips = [];
for (const [kind, k] of Object.entries(/** @type {Record<string, any>} */ (studio.lines))) {
  if (onlyLine && kind !== onlyLine) continue;
  k.ways.forEach((/** @type {any} */ w, /** @type {number} */ way) => {
    if (!w.say.includes('{team}')) return;
    for (const t of picked) {
      for (const n of w.say.includes('{surname}') ? surnames : [null]) {
        const said = w.say.replace(/\{team\}/g, spokenOf(t)).replace(/\{surname\}/g, n ?? '');
        for (const p of studio.presenters) {
          clips.push({ who: p.name.split(' ')[0], file: `assets/voices/desk/${p.id}/${kind}-${way}-${t.id}${n ? `-${n.toLowerCase()}` : ''}.mp3`, said: said.charAt(0).toUpperCase() + said.slice(1) });
        }
      }
    }
  });
}

const KEY = `teamvoices|${team.id}`;
/** @type {Set<string>} */
let bad = new Set();
try { bad = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]')); } catch { /* none kept */ }
if (params.has('marked')) clips = clips.filter((c) => bad.has(c.file));
const keep = () => {
  try { localStorage.setItem(KEY, JSON.stringify([...bad])); } catch { /* not kept */ }
  /** @type {HTMLTextAreaElement} */ ($('bad')).value = clips.filter((c) => bad.has(c.file)).map((c) => `${c.file}  "${c.said}"`).join('\n');
};

const audio = new Audio();
let now = -1;
let playingAll = false;
const rows = clips.map((c, i) => {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td><button>▶</button></td><td><button>✗</button></td><td class="who"></td><td class="said"></td><td class="file"></td>`;
  /** @type {HTMLElement} */ (tr.children[2]).textContent = c.who;
  /** @type {HTMLElement} */ (tr.children[3]).textContent = c.said;
  /** @type {HTMLElement} */ (tr.children[4]).textContent = c.file.split('/').pop() ?? '';
  tr.children[0].firstElementChild?.addEventListener('click', () => { playingAll = false; play(i); });
  tr.children[1].firstElementChild?.addEventListener('click', () => toggle(i));
  tr.classList.toggle('bad', bad.has(c.file));
  return tr;
});
const toggle = (/** @type {number} */ i) => {
  const f = clips[i].file;
  if (bad.has(f)) bad.delete(f); else bad.add(f);
  rows[i].classList.toggle('bad', bad.has(f));
  keep();
};
const play = (/** @type {number} */ i) => {
  if (now >= 0 && now < rows.length) rows[now].classList.remove('now');
  now = i;
  if (i >= clips.length) { playingAll = false; $('state').textContent = 'Done.'; return; }
  rows[i].classList.add('now');
  rows[i].scrollIntoView({ block: 'center' });
  $('state').textContent = `${i + 1} of ${clips.length}`;
  audio.src = clips[i].file;
  void audio.play();
};
audio.addEventListener('ended', () => { if (playingAll) setTimeout(() => { if (playingAll) play(now + 1); }, 400); });
$('all').addEventListener('click', () => { playingAll = true; play(now >= 0 && now < clips.length ? now : 0); });
$('stop').addEventListener('click', () => { playingAll = false; audio.pause(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'x' || e.key === 'X') { if (now >= 0 && now < clips.length) toggle(now); }
  else if (e.key === ' ') { e.preventDefault(); if (audio.paused) { void audio.play(); } else audio.pause(); }
});

const table = document.createElement('table');
table.append(...rows);
const said = teamId === 'all' ? 'each as it is spoken' : `spoken "${spokenOf(team)}"`;
$('sheet').replaceChildren(Object.assign(document.createElement('p'), { className: 'muted', textContent: `${team.name}, ${said}${onlyLine ? `, ${onlyLine} only` : ''}${params.has('marked') ? ', marked only' : ''}: ${clips.length} clips, each line by ${studio.presenters.map((/** @type {any} */ p) => p.name.split(' ')[0]).join(' and ')}.` }), table);
keep();
