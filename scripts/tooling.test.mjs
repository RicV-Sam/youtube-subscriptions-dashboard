import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

test('Vite serves the app, exposes only the configured client ID and blocks private files', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const auditDir = new URL('../.publication-audit/', import.meta.url);
  const probe = new URL(`tooling-probe-${process.pid}.txt`, auditDir);
  await mkdir(auditDir, { recursive: true });
  await writeFile(probe, 'private-test-content');
  const names = ['REACT_APP_GOOGLE_CLIENT_ID', 'REACT_APP_PRIVATE_TOKEN'];
  const previous = names.map(name => process.env[name]);
  process.env.REACT_APP_GOOGLE_CLIENT_ID = 'synthetic-tooling-client';
  process.env.REACT_APP_PRIVATE_TOKEN = 'synthetic-private-value';
  let server;
  try {
    server = await createServer({ root, configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)), server: { port: 0 }, logLevel: 'silent' });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src\/index\.jsx/);
    const app = await fetch(`${origin}/src/App.jsx`);
    assert.equal(app.status, 200);
    // Vite's dev client installs configured defines via its env module.
    const environment = await fetch(`${origin}/@vite/env`);
    assert.equal(environment.status, 200);
    const code = (await app.text()) + (await environment.text());
    assert.ok(code.includes('synthetic-tooling-client'));
    assert.ok(!code.includes('synthetic-private-value'));
    for (const pathname of ['/.git/config', `/.publication-audit/tooling-probe-${process.pid}.txt`]) {
      const response = await fetch(origin + pathname);
      assert.equal(response.status, 403);
      assert.ok(!(await response.text()).includes('private-test-content'));
    }
    const icon = await fetch(`${origin}/feed.svg`);
    assert.equal(icon.status, 200);
    assert.match(await icon.text(), /<svg/);
  } finally {
    await server?.close();
    await rm(probe, { force: true });
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
