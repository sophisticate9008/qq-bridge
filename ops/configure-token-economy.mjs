// Local deployment policy; credentials stay in DSH's private store.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeCookie, probeRpc } from '../scripts/probe-auth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DSH_HOME = path.join(root, 'dsh/home');
const file = path.join(root, 'config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const rpc = probeRpc(probeCookie({ base: config.dsh.baseUrl }), { base: config.dsh.baseUrl });
const settings = await rpc('settings/describe', {});
if (!settings.ok) throw new Error('DSH settings unavailable');
const ns = settings.value.namespaces.find(n => n.ns === 'llm-pi-ai');
if (!ns?.value?.providers?.['deepseek-primary']) throw new Error('Primary DeepSeek provider is not configured');
const updated = await rpc('settings/update', {
  ns: ns.ns, expectedRevision: ns.revision,
  patch: { providers: { 'deepseek-primary': {
    timeoutMs: 180000,
    streamIdleTimeoutMs: 120000,
    retryPolicy: { mode: 'normal', maxRetries: 2,
      backoff: { initialDelayMs: 1000, maxDelayMs: 4000, jitterRatio: 0.1 } },
  } } },
});
if (!updated.ok) throw new Error(`DSH rejected timeout settings: ${updated.error?.code}`);
config.socialV2.context.deduplicateWakePolicy = true;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
console.log('Primary provider timeouts updated live; restart Bridge to enable accepted-policy reuse.');
