const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { inspectDashboard } = require('./launch-dashboard.cjs');
async function withServer(handler, check) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await check(server.address().port); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
function fixture(overrides = {}) {
  const routes = {
    '/dashboard-info.json': '{"application":"youtube-dashboard","launcherVersion":2}',
    '/': '<script type="module" src="/@vite/client"></script><script type="module" src="/src/index.jsx"></script>',
    '/src/index.jsx': 'ReactDOM.createRoot(document.getElementById("root"));',
    '/src/Dashboard.jsx': 'Continue watching',
    '/src/LibraryTools.jsx': 'Manage channel groups',
    ...overrides,
  };
  return (req, res) => {
    if (!(req.url in routes)) { res.writeHead(404).end(); return; }
    res.end(routes[req.url]);
  };
}

test('recognises a ready Vite app even when the Vite client script comes first', async () => {
  await withServer(fixture(), async port => assert.equal(await inspectDashboard(port), 'ready'));
});

test('does not accept an unrelated server on the same port', async () => {
  await withServer((req, res) => res.end('<h1>Another application</h1>'), async port => assert.equal(await inspectDashboard(port), 'occupied'));
});

test('waits for all current modules instead of accepting incomplete app code', async () => {
  await withServer(fixture({ '/src/LibraryTools.jsx': 'Old application module' }), async port => assert.equal(await inspectDashboard(port), 'starting'));
});

test('does not identify an older dashboard checkout as the migrated app', async () => {
  await withServer(fixture({ '/dashboard-info.json': '{"application":"youtube-dashboard","launcherVersion":1}' }), async port => assert.equal(await inspectDashboard(port), 'occupied'));
});

test('rejects external script origins without fetching them', async () => {
  await withServer(fixture({ '/': '<script src="https://unrelated.example/src/index.jsx"></script>' }), async port => assert.equal(await inspectDashboard(port), 'occupied'));
});

test('a Vite client alone is not a ready dashboard', async () => {
  await withServer(fixture({ '/': '<script src="/@vite/client"></script>' }), async port => assert.equal(await inspectDashboard(port), 'starting'));
});

test('recognises a stopped server', async () => {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  assert.equal(await inspectDashboard(port), 'stopped');
});
