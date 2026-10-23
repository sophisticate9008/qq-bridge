import assert from 'node:assert/strict';
import { CHAT_CONTEXT_WINDOWS, chatProviderForKey } from '../src/local/chat-context-policy.js';
import { GroupChatAdapter } from '../plugins/qq-context-routing/index.mjs';
import { bridgeHarness } from './audit-bridge-harness.mjs';

assert.deepEqual(CHAT_CONTEXT_WINDOWS, { group: 176128, private: 393216 });
for (const base of ['deepseek-primary', 'deepseek-official']) {
  assert.equal(chatProviderForKey(base, 'group:456', true), base + '-group');
  assert.equal(chatProviderForKey(base + '-group', 'private:123', true), base);
  assert.equal(chatProviderForKey(base, 'private:123', true), base);
  assert.equal(chatProviderForKey(base, 'group:456', false), base);
  assert.equal(chatProviderForKey(base, 'internal:learner', true), base);
}
assert.equal(chatProviderForKey('local-gpt', 'group:456', true), 'local-gpt');

let sent;
const metadata = { provider: 'deepseek-primary', id: 'deepseek-v4.1-flash', name: 'Flash',
  context: { contextWindow: 393216 }, defaultMaxTokens: 4096, inputModalities: ['text', 'image'] };
const policy = { maxRetries: 2 };
const llm = { adapters: new Map([['deepseek-primary', { retryPolicy: policy, adapter: {
  resolveModel: async () => metadata,
  listModels: async () => [metadata],
  imageRequestPricing: () => ({ kind: 'fixture-pricing' }),
  imageRequestTarget: (_p, _m, image) => ({ width: image.width, height: image.height, maxBytes: 1024 }),
  prepareCall: async (provider, model, signal) => {
    assert.equal(provider, 'deepseek-primary'); assert.equal(model, metadata.id); assert(signal);
    return { model: metadata, stream: async function* (options) { sent = options; yield { type: 'finish', reason: { kind: 'stop' } }; } };
  },
} }]]) };
const adapter = new GroupChatAdapter(llm);
const group = 'deepseek-primary-group';
assert.equal((await adapter.resolveModel(group, metadata.id)).context.contextWindow, 176128);
assert.equal(metadata.context.contextWindow, 393216, 'group metadata must not mutate the private route');
assert.equal((await adapter.listModels(group))[0].provider, group);
assert.equal(adapter.providerRetryPolicy(group), policy);
assert.equal(adapter.imageRequestTarget(group, metadata.id, { width: 12, height: 24 }).height, 24);
const prepared = await adapter.prepareCall(group, metadata.id, new AbortController().signal);
const messages = Object.freeze([{ role: 'user', content: Object.freeze([{ type: 'text', text: 'fixed prefix' }]) }]);
const tools = Object.freeze([{ name: 'fixture-tool' }]);
llm.adapters.set('deepseek-primary', { adapter: { prepareCall() { throw new Error('wrong generation'); } } });
for await (const _ of prepared.stream({ provider: group, model: metadata.id, messages, tools })) {}
assert.equal(sent.provider, 'deepseek-primary');
assert.equal(sent.model, metadata.id);
assert.equal(sent.messages, messages, 'transport must preserve the exact history');
assert.equal(sent.tools, tools, 'transport must preserve the exact tool list');
const assistant = { role: 'assistant', source: { kind: 'model', provider: group, model: metadata.id,
  replayState: { response: { provider: 'deepseek-primary' } } }, content: [{ type: 'text', text: 'native reply' }] };
const history = [...messages, assistant];
for await (const _ of prepared.stream({ provider: group, model: metadata.id, messages: history, tools })) {}
assert.equal(sent.messages[1].source.provider, 'deepseek-primary', 'native replay source must match its transport provider');
assert.equal(sent.messages[1].source.replayState, assistant.source.replayState);
assert.equal(sent.messages[1].content, assistant.content);
assert.equal(assistant.source.provider, group, 'never rewrite durable history');
await assert.rejects(adapter.resolveModel('local-gpt', 'gpt-6.1-sol'), /unavailable/);

for (const provider of ['deepseek-primary', 'deepseek-official', 'local-gpt']) {
  const h = await bridgeHarness({ config: { dsh: { provider, model: 'fixture-model', reasoningEffort: 'off', conversationContext: true } } });
  try {
    const selections = [];
    h.api.sessions.selectModel = async request => {
      selections.push(request);
      return { result: { ok: true, value: { selected: request } } };
    };
    h.setMode('reserved2');
    const groupId = await h.ensureSession('group:456');
    const privateId = await h.ensureSession('private:123');
    assert.equal(selections[0].provider, provider === 'local-gpt' ? provider : provider + '-group');
    assert.equal(selections[1].provider, provider);
    assert.equal(await h.ensureSession('group:456'), groupId);
    assert.equal(await h.ensureSession('private:123'), privateId);
    assert.equal(selections.length, 2, 'reuse continuous sessions without repeated model changes');
  } finally { await h.close(); }
}
console.log('PASS conversation routing, GPT isolation, capacity metadata, image policy, frozen transport generation and unchanged request prefix');
