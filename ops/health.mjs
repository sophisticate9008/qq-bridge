// Read-only readiness checks; never print credentials or HTTP response bodies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json')));
const deployment = JSON.parse(fs.readFileSync(path.join(root, 'config/local/deployment.json')));
const quiet = process.argv.includes('--quiet');
const requested = process.argv[2] || 'all';
if (process.argv.includes('--listening')) {
  const ports = { zhenxun: 8080, snowluma: 5099, dsh: Number(new URL(cfg.dsh.baseUrl).port) || 80, bridge: cfg.consolePort || 3100 };
  if (!ports[requested]) process.exit(2);
  const socket = net.createConnection({ host: '127.0.0.1', port: ports[requested] });
  socket.setTimeout(1000);
  socket.once('connect', () => { socket.destroy(); process.exit(0); });
  socket.once('error', () => process.exit(1));
  socket.once('timeout', () => { socket.destroy(); process.exit(1); });
  await new Promise(() => {});
}
async function http(url, options) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(2500) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}
async function onebot(action) {
  const r = await http(`${cfg.snowluma.httpUrl}/${action}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.snowluma.accessToken}` }, body: '{}',
  });
  const data = await r.json();
  if (data.status !== 'ok' || data.retcode !== 0) throw new Error('OneBot 未就绪');
  return data.data;
}
const checks = {
  zhenxun: async () => { const r = await http('http://127.0.0.1:8080/'); await r.body?.cancel(); return 'HTTP ready'; },
  snowluma: async () => { const r = await http('http://127.0.0.1:5099/'); await r.body?.cancel(); return 'WebUI ready'; },
  'qq-client': async () => {
    const status = await onebot('get_status');
    const login = await onebot('get_login_info');
    if (!status.online || status.good === false) throw new Error('QQ 未在线，需要检查登录');
    if (String(login.user_id) !== String(deployment.botQQ)) throw new Error('QQ 登录账号与部署配置不一致');
    return 'QQ online, account verified';
  },
  dsh: async () => {
    process.env.DSH_HOME = path.join(root, 'dsh/home');
    const { discoverDshSessionCookie } = await import('../src/dsh-client.js');
    const cookie = discoverDshSessionCookie(cfg.dsh.baseUrl);
    const r = await http(cfg.dsh.baseUrl, { headers: { cookie } });
    await r.body?.cancel();
    return 'authenticated HTTP ready';
  },
  bridge: async () => {
    const token = cfg.consoleToken || fs.readFileSync(path.join(root, 'state/console-token'), 'utf8').trim();
    const data = await (await http(`http://127.0.0.1:${cfg.consolePort || 3100}/api/status`, { headers: { 'x-console-token': token } })).json();
    if (!data.dshReady) throw new Error('Bridge 已启动，DSH 尚未就绪');
    return 'Bridge + DSH ready';
  },
};
const names = requested === 'all' ? Object.keys(checks) : [requested];
if (names.some(name => !checks[name])) { console.error('未知检查组件'); process.exit(2); }
const results = await Promise.all(names.map(async name => {
  try { return { name, ok: true, detail: await checks[name]() }; }
  catch (error) { return { name, ok: false, detail: error.message === 'fetch failed' ? '无法连接服务' : error.name === 'TimeoutError' ? '连接超时' : error.message }; }
}));
if (!quiet) for (const r of results) console.log(`${r.ok ? 'OK' : 'FAIL'} ${r.name.padEnd(10)} ${r.detail}`);
process.exitCode = results.every(r => r.ok) ? 0 : 1;
