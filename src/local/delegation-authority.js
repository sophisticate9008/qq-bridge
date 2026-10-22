import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Only authenticated OneBot events can create a delegation authorization receipt.
export function createDelegationAuthority(root, ownerId) {
  const file = path.join(root, 'state/owner-delegations.json');
  let state = { messages: {}, tickets: {}, children: {} };
  try { state = JSON.parse(fs.readFileSync(file)); } catch {}
  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file + '.tmp', JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  };
  return {
    record(key, event) {
      const id = event.message_id ?? event.msg_id;
      if (String(event.user_id) !== String(ownerId()) || id == null) return;
      const text = (event.message ?? []).filter(s => s.type === 'text').map(s => s.data?.text ?? '').join('').trim();
      if (!text) return;
      const receipt = `${key}/${id}`;
      if (state.messages[receipt]) return; // replayed gateway event cannot restore consumed authority
      state.messages[receipt] = { key, messageId: String(id), userId: String(event.user_id), text: text.slice(0, 16000), time: Date.now() };
      for (const [k, m] of Object.entries(state.messages)) if (Date.now() - m.time > 86400000) delete state.messages[k];
      save();
    },
    authorize({ key, parentId, sourceMessageId, action = 'start', childId }) {
      const message = state.messages[`${key}/${sourceMessageId}`];
      if (!message || message.userId !== String(ownerId()) || Date.now() - message.time > 30 * 60000) throw new Error('必须使用本会话最近 30 分钟内主人本人消息的 messageId；引用和群友消息不授权工作');
      if (message.used) throw new Error('这条主人消息已经委派过，请复用已返回的子代理，不要重复启动；新要求需使用新消息 ID');
      if (action !== 'start') {
        const child = state.children[childId];
        if (!child || child.parentId !== parentId || child.key !== key || child.owner !== String(ownerId())) throw new Error('子代理不属于当前会话');
      }
      message.used = true;
      const ticket = randomUUID();
      state.tickets[ticket] = { key, parentId, owner: String(ownerId()), original: message.text, time: Date.now(), action };
      save();
      return { ticket, original: message.text };
    },
    register({ ticket, key, parentId, childId }) {
      const grant = state.tickets[ticket];
      if (!grant || grant.key !== key || grant.parentId !== parentId || grant.owner !== String(ownerId()) || Date.now() - grant.time > 60000 || grant.action !== 'start') throw new Error('委派凭据无效');
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(childId)) throw new Error('子代理 ID 无效');
      state.children[childId] = { ...grant, childId };
      delete state.tickets[ticket]; save();
      return { ok: true };
    },
    child(id) { const c = state.children[id]; return c?.owner === String(ownerId()) ? c : null; },
  };
}
