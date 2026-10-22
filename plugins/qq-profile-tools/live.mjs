// Existing DSH agents retain their preset generation. Install this new capability
// in those chat scopes without rebuilding sessions or interrupting work children.
import { registerNicknameTool } from './index.mjs?live-v1';
export const name = 'qq-profile-live';
export const inject = ['agents', 'tools'];
export function apply(ctx) {
  const install = agent => {
    if (!['qq-chat', 'qq-chat-v2'].includes(agent.session.header.agentPreset)) return;
    if (ctx.tools.get('mcp__snowluma__qq_change_nickname', agent)) return;
    ctx.effect(() => registerNicknameTool(agent.ctx));
  };
  for (const agent of ctx.agents.list()) install(agent);
  ctx.on('agent/created', ({ agent }) => install(agent));
}
