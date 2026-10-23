// Local deployment policy; credentials stay in DSH's private store.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeCookie, probeRpc } from '../scripts/probe-auth.mjs';
import { CHAT_CONTEXT_WINDOWS } from '../src/local/chat-context-policy.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.DSH_HOME = path.join(root, 'dsh/home');
const file = path.join(root, 'config.json');
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const rpc = probeRpc(probeCookie({ base: config.dsh.baseUrl }), { base: config.dsh.baseUrl });
const settings = await rpc('settings/describe', {});
if (!settings.ok) throw new Error('DSH settings unavailable');
const ns = settings.value.namespaces.find(n => n.ns === 'llm-pi-ai');
if (!ns?.value?.providers?.['deepseek-primary']) throw new Error('Primary DeepSeek provider is not configured');
const contextWindow = CHAT_CONTEXT_WINDOWS.private;
const providers = { 'deepseek-primary': {
  defaultContextWindow: contextWindow,
  models: ns.value.providers['deepseek-primary'].models.map(model => ({ ...model, contextWindow })),
  timeoutMs: 180000,
  streamIdleTimeoutMs: 120000,
  retryPolicy: { mode: 'normal', maxRetries: 2,
    backoff: { initialDelayMs: 1000, maxDelayMs: 4000, jitterRatio: 0.1 } },
} };
const updated = await rpc('settings/update', {
  ns: ns.ns, expectedRevision: ns.revision,
  patch: { providers },
});
if (!updated.ok) throw new Error(`DSH rejected timeout settings: ${updated.error?.code}`);
// A settings write can advance the profile revision shared by other namespaces.
const afterPrimary = await rpc('settings/describe', {});
if (!afterPrimary.ok) throw new Error('DSH settings unavailable after primary update');
const official = afterPrimary.value.namespaces.find(n => n.ns === 'llm-deepseek');
if (official) {
  const result = await rpc('settings/update', {
    ns: official.ns, expectedRevision: official.revision,
    patch: { defaultContextWindow: contextWindow,
      models: official.value.models.map(model => ({ ...model, contextWindow })) },
  });
  if (!result.ok) throw new Error(`DSH rejected fallback context settings: ${result.error?.code}`);
}
config.socialV2.context.deduplicateWakePolicy = true;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
console.log('Primary timeouts and DeepSeek base/private windows (384K) updated live; group aliases use 172K. GPT settings preserved.');
