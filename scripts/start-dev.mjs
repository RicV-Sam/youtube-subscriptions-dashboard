import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({ root, configFile: fileURLToPath(new URL('../vite.config.mjs', import.meta.url)) });
await server.listen();
server.printUrls();
let closing = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  if (closing) return;
  closing = true;
  await server.close();
});
