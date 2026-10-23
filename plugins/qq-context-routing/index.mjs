// Group-chat capacity aliases over the existing transports. No new credentials,
// endpoint, wire model, content rewriting, or additional inference call.
import { LlmAdapter, LlmError } from '../../dsh/runtime/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import { CHAT_CONTEXT_WINDOWS, GROUP_CHAT_ROUTES } from '../../src/local/chat-context-policy.js';

export const name = 'qq-context-routing';
export const inject = ['llm'];

export class GroupChatAdapter extends LlmAdapter {
  constructor(llm) { super(); this.llm = llm; }
  base(provider) {
    const base = Object.entries(GROUP_CHAT_ROUTES).find(([, alias]) => alias === provider)?.[0];
    const adapter = base && this.llm.adapters.get(base)?.adapter;
    if (!adapter) throw new LlmError(`Chat context route unavailable: ${provider}`, 'NO_ADAPTER');
    return { base, adapter };
  }
  providerInfo(provider) { return { id: provider, name: `${provider.replace('-group', '')} · 群聊 172K` }; }
  providerRetryPolicy(provider) {
    const base = Object.entries(GROUP_CHAT_ROUTES).find(([, alias]) => alias === provider)?.[0];
    return this.llm.adapters.get(base)?.retryPolicy;
  }
  imageRequestPricing(provider, model) {
    const { base, adapter } = this.base(provider);
    return adapter.imageRequestPricing(base, model);
  }
  imageRequestTarget(provider, model, image) {
    const { base, adapter } = this.base(provider);
    return adapter.imageRequestTarget(base, model, image);
  }
  async listModels(provider) {
    const { base, adapter } = this.base(provider);
    return (await adapter.listModels(base)).map(model => ({ ...model, provider }));
  }
  withCapacity(info, provider) {
    return { ...info, provider, context: { ...info.context, contextWindow: CHAT_CONTEXT_WINDOWS.group } };
  }
  async resolveModel(provider, model, signal) {
    const { base, adapter } = this.base(provider);
    return this.withCapacity(await adapter.resolveModel(base, model, signal), provider);
  }
  async prepareCall(provider, model, signal) {
    const { base, adapter } = this.base(provider);
    const prepared = await adapter.prepareCall(base, model, signal);
    return {
      model: this.withCapacity(prepared.model, provider),
      stream: options => {
        // Harness records the alias as the assistant source, while native replay
        // metadata belongs to the underlying adapter. Restore that source label
        // at the transport boundary so reasoning/signatures replay losslessly.
        // Durable history, text, tool calls and images remain unchanged.
        const messages = options.messages.some(message => message.source?.kind === 'model' && message.source.provider === provider)
          ? options.messages.map(message => message.source?.kind === 'model' && message.source.provider === provider
            ? { ...message, source: { ...message.source, provider: base } } : message)
          : options.messages;
        return prepared.stream({ ...options, provider: base, messages });
      },
    };
  }
  async *stream(options) {
    const prepared = await this.prepareCall(options.provider, options.model, options.signal);
    yield* prepared.stream(options);
  }
}

export function apply(ctx) {
  const routes = Object.values(GROUP_CHAT_ROUTES);
  const bases = Object.keys(GROUP_CHAT_ROUTES);
  const snapshot = () => bases.map(base => ctx.llm.adapters.get(base));
  let previous = snapshot();
  const registration = ctx.llm.registerAdapter(routes, new GroupChatAdapter(ctx.llm));
  ctx.on('llm/adapters-updated', () => {
    const next = snapshot();
    if (next.every((entry, i) => entry === previous[i])) return;
    previous = next; // Set before replace emits its own adapters-updated event.
    registration.replace(routes);
  });
}
