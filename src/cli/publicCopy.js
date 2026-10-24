// The public copy (the hand-off's item 2, 2026-10-23; docs/launch-plan.md, A public repo; Tom's pick A): the project's
// files as they stand at HEAD, copied from an allowlist into a separate folder that is its own git repo, one new commit
// a refresh, never this repo's history. Its README and LICENSE come from public/. It stops, writing no commit, if a file
// to copy has uncommitted changes, if any value from .env or the secrets in the environment is in a copied file, or if
// this computer's own git email (or any @gmail.com address) is; it commits only as a GitHub no-reply address. Never pushes.
// Usage: npm run public -- [--out ../scorchball-tv] [--email <id>+savenor14@users.noreply.github.com] [--dry]
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { secretsIn, secretsOf } from './publish.js';

/** What goes in, relative to the root: a folder (everything tracked under it) or a file. */
export const PUBLIC = [
  'index.html', 'about.html', 'how-it-was-built.html', 'check.html', 'manifest.webmanifest', 'robots.txt', 'sitemap.xml',
  'director.html', 'kits.html', 'sounds.html', 'recordings.html', 'clipends.html', 'teamvoices.html', 'pitchmap.html',
  'interviews.html', 'desklines.html', 'rulebook.html', 'ads.html', 'podcast.html', 'analyst.html', 'clips.html',
  'src', 'config', 'data', 'assets', 'keys', 'snapshots', 'worker', 'tests',
  'package.json', 'package-lock.json', 'jsconfig.json', '.gitignore', '.gitattributes', 'CLAUDE.md',
  // The design docs (Tom, 2026-10-23: the internal ones stay out, and moments.md, which gives the secrets away).
  'docs/vision.md', 'docs/sport.md', 'docs/simulation.md', 'docs/channel.md', 'docs/colours.md', 'docs/finances.md',
  'docs/director.md', 'docs/podcast.md', 'docs/studio-cards.md',
];

/** Left out from inside what goes in: the voice clips (ElevenLabs'; their lengths stay, the talk is timed by them), and
 * the dev pages' scripts that aren't the channel's (Ko-fi's pictures). */
export const NOT_PUBLIC = [/^assets\/voices\/.*\.mp3$/, /^src\/channel\/kofiSheet\.js$/];

/** Copied in from public/ as the copy's own (their paths in the copy). */
export const OWN = { 'public/README.md': 'README.md', 'public/LICENSE': 'LICENSE' };

/** GitHub's private address, the only one the copy commits as. */
export const NO_REPLY = /^\d+\+[A-Za-z0-9-]+@users\.noreply\.github\.com$/;

/** Whether a tracked path (forward slashes) goes in the public copy. @param {string} path */
export function isPublic(path) {
  if (NOT_PUBLIC.some((re) => re.test(path))) return false;
  return PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Text files an address or a secret could hide in. */
const TEXT = /\.(js|mjs|json|jsonc|html|css|md|txt|xml|sql|yml|webmanifest|svg)$|(^|\/)(LICENSE|\.gitignore|\.gitattributes)$/;

/**
 * Copied files holding an email address that mustn't be public: `own` (this computer's git email) or any Gmail one.
 * @param {string} out @param {string[]} paths @param {string} own @returns {Promise<string[]>}
 */
export async function addressesIn(out, paths, own) {
  const hits = [];
  for (const path of paths) {
    if (!TEXT.test(path)) continue;
    const text = (await readFile(join(out, path), 'utf8')).toLowerCase();
    if ((own && text.includes(own.toLowerCase())) || /[a-z0-9._%+-]+@gmail\.com/.test(text)) hits.push(path);
  }
  return hits;
}

/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

async function main() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const { values } = parseArgs({ options: { out: { type: 'string', default: resolve(root, '../scorchball-tv') }, email: { type: 'string' }, dry: { type: 'boolean', default: false } } });
  const out = resolve(values.out);
  if (out === resolve(root) || out.startsWith(resolve(root) + (process.platform === 'win32' ? '\\' : '/'))) throw new Error('--out must be outside this repo');

  const paths = git(['ls-files', '-z'], root).split('\0').filter(Boolean).filter(isPublic);
  const changed = new Set(git(['status', '--porcelain', '-z', '--', ...PUBLIC, ...Object.keys(OWN)], root).split('\0').filter(Boolean).map((l) => l.slice(3)));
  const dirty = paths.filter((p) => changed.has(p)).concat(Object.keys(OWN).filter((p) => changed.has(p)));
  if (dirty.length) throw new Error(`Commit these first, so the copy is HEAD as it stands:\n  ${dirty.join('\n  ')}`);

  // Refresh: everything but the copy's .git goes, then the files as they stand.
  await mkdir(out, { recursive: true });
  for (const name of await readdir(out)) if (name !== '.git') await rm(join(out, name), { recursive: true, force: true });
  for (const p of paths) {
    await mkdir(dirname(join(out, p)), { recursive: true });
    await cp(join(root, p), join(out, p));
  }
  for (const [from, to] of Object.entries(OWN)) await cp(join(root, from), join(out, to));
  const all = [...paths, ...Object.values(OWN)];

  const secrets = await secretsIn(out, await secretsOf(root));
  if (secrets.length) throw new Error(`A secret is in the copy (nothing committed): ${secrets.map((s) => `${s.path} holds ${s.name}`).join('; ')}`);
  let own = '';
  try { own = git(['config', '--global', 'user.email']); } catch { /* none set */ }
  const addresses = await addressesIn(out, all, own);
  if (addresses.length) throw new Error(`An email address is in the copy (nothing committed): ${addresses.join(', ')}`);
  let bytes = 0;
  for (const p of all) bytes += (await stat(join(out, p))).size;
  console.log(`Copied ${all.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB) into ${out}; no secret or email address in them.`);
  if (values.dry) return console.log('Dry run: nothing committed.');

  // The copy's own repo and identity, set in that repo only (never this computer's global one).
  const fresh = !(await stat(join(out, '.git')).catch(() => null));
  if (fresh) git(['init', '-q', '-b', 'main'], out);
  if (values.email) {
    if (!NO_REPLY.test(values.email)) throw new Error('--email must be a GitHub no-reply address (<id>+<username>@users.noreply.github.com)');
    git(['config', 'user.name', 'savenor14'], out);
    git(['config', 'user.email', values.email], out);
  }
  let email = '';
  try { email = git(['config', '--local', 'user.email'], out); } catch { /* none yet */ }
  if (!NO_REPLY.test(email)) throw new Error('The copy has no no-reply identity yet: run again with --email <id>+savenor14@users.noreply.github.com (Settings → Emails on GitHub)');
  git(['add', '-A'], out);
  if (!git(['status', '--porcelain'], out)) return console.log('Nothing changed since the last refresh: no commit.');
  const date = new Date().toISOString().slice(0, 10);
  git(['commit', '-q', '-m', fresh ? `Scorchball TV, as of ${date}` : `Update, ${date}`], out);
  console.log(`Committed as ${email}: ${git(['log', '--oneline', '-1'], out)}. Not pushed.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
