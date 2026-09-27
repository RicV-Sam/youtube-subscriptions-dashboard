// Launch with an absolute script path so process ownership can be verified.
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.execPath, [path.join(__dirname, 'start-dev.mjs')], { stdio: 'inherit', windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
