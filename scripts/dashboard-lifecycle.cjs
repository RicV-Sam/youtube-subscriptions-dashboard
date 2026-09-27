const http = require('http');
const { WebSocketServer } = require('ws');
const ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

// Each open dashboard tab holds one connection. Background tabs keep their
// connection without JavaScript timers; ping/pong detects crashed browsers.
function createLifecycle({ port = 3010, root, onEmpty, graceMs = 10000, startupMs = 120000, pingMs = 30000 }) {
  const server = http.createServer((req, res) => {
    if (req.url !== '/status') { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ application: 'youtube-dashboard-lifecycle', root, tabs: sockets.clients.size }));
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  let timer, closed = false;
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(() => { if (!closed && sockets.clients.size === 0) onEmpty(); }, delay);
  }
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/dashboard' || !ORIGINS.has(req.headers.origin)) { socket.destroy(); return; }
    sockets.handleUpgrade(req, socket, head, client => sockets.emit('connection', client));
  });
  sockets.on('connection', client => {
    clearTimeout(timer);
    client.alive = true;
    client.on('pong', () => { client.alive = true; });
    client.on('error', () => client.terminate());
    client.on('close', () => { if (!closed && sockets.clients.size === 0) schedule(graceMs); });
  });
  const heartbeat = setInterval(() => {
    for (const client of sockets.clients) {
      if (!client.alive) client.terminate();
      else { client.alive = false; client.ping(); }
    }
  }, pingMs);
  server.once('listening', () => schedule(startupMs));
  server.listen(port, '127.0.0.1');
  return {
    server,
    close() {
      closed = true; clearTimeout(timer); clearInterval(heartbeat);
      for (const client of sockets.clients) client.terminate();
      sockets.close(); server.close();
    },
  };
}
module.exports = { createLifecycle };
