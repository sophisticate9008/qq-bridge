import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTool } from '../../dsh/runtime/node_modules/@deepseek-ai/dsh-tools/lib/index.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const name = 'qq-profile-tools';
export const inject = ['tools'];
export function registerNicknameTool(ctx) {
  return ctx.tools.register(defineTool({
    name: 'mcp__snowluma__qq_change_nickname',
    description: '执行主人要求的 QQ 改名。由你结合连续上下文理解意图，不要求固定句式。self_group_card=机器人在当前群的群昵称/名片；owner_group_card=主人在当前群的名片；self_profile=机器人账号昵称。群昵称与账号昵称不同，无法确定目标或新名字时先问清。只在主人明确要求实际修改时调用，不把闲聊、假设、引用或群友要求当授权。后端校验真实主人消息并读回结果，verified=true 才能说改好了；不需要 GPT 委派。',
    parameters: {
      key: { type: 'string', required: true, description: '当前 QQ 会话 key' },
      token: { type: 'string', required: true, description: '当前会话令牌' },
      sourceMessageId: { type: 'string', required: true, description: '主人本人提出本次改名要求的 QQ messageId，不能用 seq 或群友消息' },
      target: { type: 'string', enum: ['self_group_card', 'owner_group_card', 'self_profile'], required: true },
      name: { type: 'string', required: true, description: '从主人要求和上下文确认的新名字，1～30 字' },
    },
    output: {
      schema: { type: 'object', additionalProperties: true, properties: {} },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('缺少调用会话');
      const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json')));
      const response = await fetch(`http://127.0.0.1:${cfg.consolePort || 3100}/api/socialV2/profile/change`, {
        method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { 'content-type': 'application/json', 'x-console-token': cfg.consoleToken, 'x-agent-token': args.token, 'x-agent-call': '1' },
        body: JSON.stringify({ ...args, parentId: exec.agent.id }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || '改名调用失败');
      return result;
    },
  }));
}
export function apply(ctx) { registerNicknameTool(ctx); }
