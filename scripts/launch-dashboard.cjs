// Keep one dashboard on the OAuth origin and open it only once it responds.
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { createLifecycle } = require('./dashboard-lifecycle.cjs');
const ROOT = path.resolve(__dirname, '..');
const PORT = 3000;
const LIFECYCLE_PORT = 3010;

function ownedServerPid() {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', '$ids = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($ids.Count -eq 1) { $process = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $ids[0]); if ($process.Name -eq "node.exe" -and $process.CommandLine.IndexOf($env:DASHBOARD_EXPECTED_SCRIPT, [StringComparison]::OrdinalIgnoreCase) -ge 0) { $ids[0] } }'], {
    encoding: 'utf8', windowsHide: true,
    env: { ...process.env, DASHBOARD_EXPECTED_SCRIPT: path.join(ROOT, 'scripts', 'start-dev.mjs') },
  });
  const value = result.stdout?.trim();
  return /^\d+$/.test(value || '') ? Number(value) : null;
}

function request(url) {
  return new Promise(resolve => {
    const req = http.get(url, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 15000000) req.destroy(); });
      response.on('end', () => resolve({ status: response.statusCode, body }));
      response.on('error', () => resolve(null));
    });
    req.setTimeout(3000, () => req.destroy());
    req.on('error', () => resolve(null));
  });
}
function portIsOpen(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const done = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    socket.setTimeout(1000, () => done(true)); // Do not launch over an unresponsive listener.
  });
}
async function inspectDashboard(port = PORT) {
  if (!await portIsOpen(port)) return 'stopped';
  const origin = `http://127.0.0.1:${port}`;
  const marker = await request(`${origin}/dashboard-info.json`);
  try {
    const identity = JSON.parse(marker?.body);
    if (identity.application !== 'youtube-dashboard' || identity.launcherVersion !== 2) return 'occupied';
  }
  catch { return 'occupied'; }
  const page = await request(origin);
  if (page?.status !== 200) return 'starting';
  // Vite injects its client before the app entry; it no longer serves one bundle.
  const scripts = [...page.body.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(match => new URL(match[1], origin));
  if (scripts.some(url => url.origin !== origin)) return 'occupied';
  if (!scripts.some(url => url.pathname === '/src/index.jsx')) return 'starting';
  const modules = await Promise.all(['/src/index.jsx', '/src/Dashboard.jsx', '/src/LibraryTools.jsx'].map(url => request(origin + url)));
  const expected = ['createRoot', 'Continue watching', 'Manage channel groups'];
  return modules.every((result, index) => result?.status === 200 && result.body.includes(expected[index])) ? 'ready' : 'starting';
}
function openDashboard() {
  // A fresh navigation avoids reopening an old tab's in-memory UI state.
  const url = `http://localhost:${PORT}/?launch=${Date.now()}`;
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true });
  browser.on('error', () => console.error(`Open ${url} in your browser.`));
  browser.unref();
}
async function main() {
  const state = await inspectDashboard();
  if (process.argv.includes('--check')) {
    console.log(`Dashboard on port ${PORT}: ${state}`);
    process.exitCode = state === 'ready' ? 0 : 1;
    return;
  }
  if (state === 'occupied') throw new Error('Port 3000 is occupied by a different or unrecognised server. Close that server, then run this launcher again. No other app was stopped.');
  if (await portIsOpen(LIFECYCLE_PORT)) {
    const status = await request(`http://127.0.0.1:${LIFECYCLE_PORT}/status`);
    let owner;
    try { owner = JSON.parse(status?.body); } catch { /* Unknown local service. */ }
    if (owner?.application !== 'youtube-dashboard-lifecycle' || owner.root !== ROOT) throw new Error('Port 3010 is used by another service. This launcher has not stopped it.');
    if (state === 'ready') { console.log('Using the existing managed dashboard.'); if (!process.argv.includes('--no-open')) openDashboard(); return; }
    throw new Error('The managed dashboard is still starting. Please retry shortly.');
  }
  const adoptedPid = state !== 'stopped' ? ownedServerPid() : null;
  if (state !== 'stopped' && !adoptedPid) throw new Error('The existing dashboard was not confirmed as this folder’s Vite server. Close its console and run this launcher again so page-close shutdown can be managed safely.');
  let server;
  let stopping = false;
  const lifecycle = createLifecycle({ root: ROOT, onEmpty: stopServer });
  function stopServer() {
    if (stopping) return;
    stopping = true;
    console.log('No dashboard pages remain open. Stopping the server.');
    lifecycle.close();
    const pid = server && server.exitCode === null ? server.pid : adoptedPid && ownedServerPid() === adoptedPid ? adoptedPid : null;
    if (pid) {
      const stop = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      stop.on('error', error => console.error(`Could not stop dashboard: ${error.message}`));
    }
  }
  await new Promise((resolve, reject) => { lifecycle.server.once('listening', resolve); lifecycle.server.once('error', error => { lifecycle.close(); reject(error); }); });
  process.once('SIGINT', stopServer);
  process.once('SIGTERM', stopServer);
  if (state === 'stopped') {
    console.log('Starting this folder\'s dashboard on http://localhost:3000 ...');
    server = spawn(process.execPath, [path.join(ROOT, 'scripts', 'start-dev.mjs')], {
      cwd: ROOT, stdio: 'inherit', windowsHide: true, env: { ...process.env, CI: 'true' },
    });
    server.on('error', error => { console.error(error.message); lifecycle.close(); });
    server.on('exit', code => { lifecycle.close(); if (code && !stopping) process.exitCode = code; });
  } else console.log('Using the dashboard already running on port 3000.');
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (server && server.exitCode !== null) throw new Error('The dashboard server stopped before it was ready. See the error above.');
    if (await inspectDashboard() === 'ready') {
      console.log(process.argv.includes('--no-open') ? 'Latest library controls are ready. Page-close shutdown is active.' : 'Latest library controls are ready. Opening dashboard.');
      if (!process.argv.includes('--no-open')) openDashboard();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  stopServer();
  throw new Error('The dashboard did not become ready within two minutes. Check the server output, then retry.');
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { inspectDashboard };
