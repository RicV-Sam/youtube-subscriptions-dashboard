// Build an isolated synthetic demo; never connect a real Google account.
const path = require('node:path');
async function main() {
  const { build, preview } = await import('vite');
  const root = path.resolve(__dirname, '..');
  const config = { root, configFile: path.join(root, 'vite.config.mjs'), mode: 'demo' };
  await build(config);
  const server = await preview(config);
  console.log('Synthetic fixture preview: http://localhost:3001 (no Google account connected)');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await server.close(); });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
