import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticServer, localHost, resolveRequest } from '../src/cli/serve.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('resolveRequest keeps requests inside the project and away from dot-folders', () => {
  assert.equal(resolveRequest(root, '/'), join(root, 'index.html'));
  assert.equal(resolveRequest(root, '/src/config.js'), join(root, 'src', 'config.js'));
  assert.equal(resolveRequest(root, '/docs/'), join(root, 'docs', 'index.html'));
  for (const bad of ['/../package.json', '/%2e%2e/%2e%2e/secret', '/src/..%2f..%2fsecret', '/.git/config', '/a/.env', '/%E0%A4%A', '/x%00y']) {
    assert.equal(resolveRequest(root, bad), null, bad);
  }
});

test('the server serves project files with the right type and refuses the rest', async (t) => {
  const server = createStaticServer(root);
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  t.after(() => server.close());
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const get = (/** @type {string} */ path, method = 'GET') => fetch(`http://127.0.0.1:${port}${path}`, { method });

  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(await page.text(), /src\/channel\/main\.js/);

  const settings = await get('/config/settings.json');
  assert.equal(settings.status, 200);
  assert.match(settings.headers.get('content-type') ?? '', /^application\/json/);
  assert.equal((await settings.json()).live.timeZone, 'America/New_York');

  assert.match((await get('/src/sim/match.js')).headers.get('content-type') ?? '', /^text\/javascript/);
  assert.equal((await get('/.git/HEAD')).status, 403);
  assert.equal((await get('/no-such-file.js')).status, 404);
  assert.equal((await get('/', 'POST')).status, 405);
});

test('only a page that names this computer is served (DNS rebinding), and the recordings take only recordings.html\'s header', async (t) => {
  for (const ok of ['localhost:8080', '127.0.0.1:8081', '[::1]:8080', 'localhost', 'app.localhost:3000']) assert.equal(localHost(ok), true, ok);
  for (const bad of [undefined, '', 'evil.example:8080', 'localhost.evil.example', '127.0.0.1.nip.io']) assert.equal(localHost(bad), false, String(bad));
  const server = createStaticServer(root);
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  t.after(() => server.close());
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const { request } = await import('node:http');
  /** @param {string} host @param {string} path @param {string} [method] @returns {Promise<number>} */
  const statusFor = (host, path, method = 'GET') => new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host } }, (res) => { res.resume(); done(res.statusCode ?? 0); });
    req.on('error', fail);
    req.end();
  });
  assert.equal(await statusFor(`localhost:${port}`, '/'), 200);
  assert.equal(await statusFor('evil.example', '/'), 403);
  assert.equal(await statusFor('evil.example', '/api/director/state'), 403);
  assert.equal(await statusFor(`localhost:${port}`, '/api/recordings?key=x', 'POST'), 403, 'no x-recordings header');
});

test('a hello that asks hears how many are watching, as the service answers it (the ticker\'s count)', async (t) => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const server = createStaticServer(root, { audienceDir: await mkdtemp(join(tmpdir(), 'hellos-')) });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  t.after(() => server.close());
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const hello = (/** @type {object} */ body) => fetch(`http://127.0.0.1:${port}/api/audience/hello`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await hello({ session: '0123456789abcdef' })).status, 204, 'not asked: nothing to say');
  const asked = await hello({ session: 'fedcba9876543210', watching: true });
  assert.deepEqual(await asked.json(), { hello: true, watching: 1 }, 'one household here');
});
