// Capacities include input and output; compaction reserves headroom within them.
export const CHAT_CONTEXT_WINDOWS = Object.freeze({ group: 172 * 1024, private: 384 * 1024 });
export const GROUP_CHAT_ROUTES = Object.freeze({
  'deepseek-primary': 'deepseek-primary-group',
  'deepseek-official': 'deepseek-official-group',
});

export function chatProviderForKey(provider, key, enabled) {
  if (!enabled) return provider;
  const base = Object.entries(GROUP_CHAT_ROUTES).find(([base, alias]) => provider === base || provider === alias)?.[0];
  if (!base) return provider; // GPT and other explicit selections are untouched.
  if (String(key).startsWith('private:')) return base;
  if (String(key).startsWith('group:')) return GROUP_CHAT_ROUTES[base];
  return provider;
}
