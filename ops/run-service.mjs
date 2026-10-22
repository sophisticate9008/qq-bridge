// Deployment launcher with isolated component directories.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const service = process.argv[2];
const env = {
  ...process.env,
  PATH: `/usr/local/bin:${root}/dsh/runtime/node_modules/.bin:${process.env.PATH}`,
  DSH_HOME: `${root}/dsh/home`,
  DSH_INSTALL_MODULES: `${root}/dsh/runtime/node_modules`,
};
const commands = {
  dsh: [process.execPath, [`${root}/dsh/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js`, 'web', '--host', '127.0.0.1', '--port', '3080', '--no-open'], root],
  bridge: [process.execPath, [`${root}/src/bridge.js`], root],
  snowluma: [process.execPath, ['index.mjs'], `${root}/protocols/snowluma/vendor`],
  'qq-client': ['xvfb-run', ['-a', `${root}/protocols/qq-client/vendor/qq`, '--no-sandbox', '-q', String(JSON.parse(fs.readFileSync(`${root}/config/local/deployment.json`)).botQQ)], root],
};
if (!commands[service]) throw new Error('Service must be dsh, bridge, snowluma or qq-client');
if (service === 'snowluma') {
  env.SNOWLUMA_ACCEPT_EULA = '1';
  env.SNOWLUMA_ACCEPT_PRIVACY = '1';
}
if (service === 'bridge') {
  const models = JSON.parse(fs.readFileSync(`${root}/config/local/models.json`));
  env.DEEPSEEK_API_KEY = models.deepseek.apiKey;
  env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --import=${root}/ops/node-websocket.mjs`.trim();
}
const [command, args, cwd] = commands[service];
const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
