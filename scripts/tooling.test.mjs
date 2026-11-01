import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { ESLint } from 'eslint';

test('ESLint checks source and tooling patterns while ignoring generated output', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const eslint = new ESLint({ cwd: root });
  for (const [filePath, code] of [
    ['src/lint-probe.jsx', 'export default function Probe() { return <main>{missingValue}</main>; }'],
    ['scripts/lint-probe.mjs', 'export const value = missingValue;'],
  ]) {
    const [result] = await eslint.lintText(code, { filePath });
    assert.ok(result.messages.some(message => message.ruleId === 'no-undef'), `${filePath} must be linted`);
  }
  for (const directory of ['build', '.preview-build', 'node_modules', 'output', '.publication-audit']) {
    assert.equal(await eslint.isPathIgnored(`${root}/${directory}/probe.js`), true, `${directory} must stay ignored`);
  }
});

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
    const gitMetadata = await stat(new URL('../.git', import.meta.url));
    const gitPath = gitMetadata.isDirectory() ? '/.git/config' : '/.git';
    for (const pathname of [gitPath, `/.publication-audit/tooling-probe-${process.pid}.txt`]) {
      const response = await fetch(origin + pathname);
      assert.equal(response.status, 403, `${pathname} must be blocked`);
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
