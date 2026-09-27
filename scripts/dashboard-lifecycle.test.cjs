const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createLifecycle } = require('./dashboard-lifecycle.cjs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function setup(t, options = {}) {
  let stops = 0;
  const manager = createLifecycle({ port: 0, root: 'test-project', graceMs: 60, startupMs: 2000, pingMs: 50, onEmpty: () => { stops++; }, ...options });
  t.after(() => manager.close());
  await once(manager.server, 'listening');
  const url = `ws://127.0.0.1:${manager.server.address().port}/dashboard`;
  const connect = async () => {
    const socket = new WebSocket(url, { origin: 'http://localhost:3000' });
    await once(socket, 'open'); return socket;
  };
  return { connect, url, stops: () => stops };
}
async function close(socket) { const done = once(socket, 'close'); socket.close(); await done; }

test('closing one tab keeps server alive; closing the last tab schedules shutdown', async t => {
  const state = await setup(t);
  const first = await state.connect(), second = await state.connect();
  await close(first); await sleep(100);
  assert.equal(state.stops(), 0);
  await close(second); await sleep(100);
  assert.equal(state.stops(), 1);
});

test('refresh reconnect cancels pending shutdown and background sockets remain alive', async t => {
  const state = await setup(t);
  const old = await state.connect();
  await close(old);
  const refreshed = await state.connect();
  await sleep(200);
  assert.equal(state.stops(), 0);
  await close(refreshed); await sleep(100);
  assert.equal(state.stops(), 1);
});

test('no initial browser connection times out instead of orphaning the server', async t => {
  const state = await setup(t, { startupMs: 30 });
  await sleep(80); assert.equal(state.stops(), 1);
});

test('rejects browser connections from other origins', async t => {
  const state = await setup(t);
  const socket = new WebSocket(state.url, { origin: 'https://unrelated.example' });
  const error = await new Promise(resolve => socket.once('error', resolve));
  assert.ok(error); assert.equal(state.stops(), 0);
});
