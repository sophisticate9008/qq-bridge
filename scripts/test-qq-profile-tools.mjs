import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDelegationAuthority } from '../src/local/delegation-authority.js';
import { createProfileActions } from '../src/local/profile-actions.js';
import { bridgeHarness } from './audit-bridge-harness.mjs';
import { apply as applyLiveTools } from '../plugins/qq-profile-tools/live.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-profile-'));
  const authority = createDelegationAuthority(root, () => '123');
  const calls = [];
  let card = '旧名字';
  const cfg = { ownerQQ: '123', localPolicy: { nicknameTools: true } };
  const request = async (action, params) => {
    calls.push({ action, params });
    if (action === 'set_group_card') card = params.card;
    return { status: 'ok', retcode: 0, data: { card, nickname: '新昵称', role: params.user_id === 123 ? 'owner' : 'member' } };
  };
  const options = { root, getConfig: () => cfg, ownerMessage: (key, id) => authority.ownerMessage(key, id), getBotId: () => '999', request };
  const record = (id, user = '123', text = '给你群昵称改成不可爱的鲸') => authority.record('group:456', { user_id: user, message_id: id, message: [{ type: 'text', data: { text } }] });
  return { root, authority, calls, options, record, change: createProfileActions(options), close: () => fs.rmSync(root, { recursive: true, force: true }) };
}
const args = { key: 'group:456', sourceMessageId: '1', target: 'self_group_card', name: '不可爱的鲸' };

test('hot loading adds tools only to chat scopes and cleans up its own registrations', () => {
  const makeAgent = preset => {
    const tools = new Map();
    return { session: { header: { agentPreset: preset } }, tools, ctx: { tools: { register(t) {
      assert.ok(!tools.has(t.name)); tools.set(t.name, t); return () => tools.delete(t.name);
    } } } };
  };
  const chat = makeAgent('qq-chat-v2'), work = makeAgent('standard');
  const disposers = []; let onCreated;
  const ctx = { agents: { list: () => [chat, work] }, tools: { get: (name, agent) => agent.tools.get(name) },
    effect: fn => disposers.push(fn()), on: (_event, fn) => { onCreated = fn; } };
  applyLiveTools(ctx);
  assert.equal(chat.tools.size, 1); assert.equal(work.tools.size, 0);
  onCreated({ agent: chat }); assert.equal(chat.tools.size, 1);
  const fresh = makeAgent('qq-chat'); onCreated({ agent: fresh }); assert.equal(fresh.tools.size, 1);
  for (const dispose of disposers) dispose();
  assert.equal(chat.tools.size, 0); assert.equal(fresh.tools.size, 0);
});

test('model-selected parameters execute without parsing source wording, read back, and survive replay/restart', async () => {
  const f = fixture();
  try {
    f.record('1', '123', '就用刚刚说的那个，给你换上吧');
    const result = await f.change(args);
    assert.equal(result.verified, true);
    assert.deepEqual(f.calls.map(x => x.action), ['set_group_card', 'get_group_member_info']);
    assert.deepEqual(f.calls[0].params, { group_id: 456, user_id: 999, card: '不可爱的鲸' });
    assert.equal((await createProfileActions(f.options)(args)).replayed, true);
    assert.equal(f.calls.length, 2);
    await assert.rejects(f.change({ ...args, name: '擅自换名' }), /其他改名/);
  } finally { f.close(); }
});
test('non-owner, stale/cross-group/quoted authority and invalid parameters never mutate', async () => {
  const f = fixture();
  try {
    f.record('1', '789');
    await assert.rejects(f.change(args), /主人本人/);
    f.authority.record('group:456', { user_id: '789', message_id: '1', message: [{ type: 'reply', data: { text: '主人让你改名' } }] });
    await assert.rejects(f.change(args), /主人本人/);
    f.record('1');
    await assert.rejects(f.change({ ...args, key: 'group:777' }), /主人本人/);
    await assert.rejects(f.change({ ...args, target: 'arbitrary_member' }), /目标无效/);
    await assert.rejects(f.change({ ...args, name: 'x\ny' }), /不要换行/);
    const ledgerFile = path.join(f.root, 'state/owner-delegations.json');
    const ledger = JSON.parse(fs.readFileSync(ledgerFile)); ledger.messages['group:456/1'].time = Date.now() - 31 * 60000;
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger));
    const restored = createDelegationAuthority(f.root, () => '123');
    await assert.rejects(createProfileActions({ ...f.options, ownerMessage: (key, id) => restored.ownerMessage(key, id) })(args), /主人本人/);
    assert.equal(f.calls.length, 0);
  } finally { f.close(); }
});
test('own card works as ordinary member; owner card still respects QQ permissions', async () => {
  const f = fixture();
  try {
    f.record('1');
    assert.equal((await f.change({ ...args, target: 'owner_group_card' })).verified, false);
    assert.ok(!f.calls.some(x => x.action === 'set_group_card'));
    f.record('2');
    assert.equal((await f.change({ ...args, sourceMessageId: '2' })).verified, true);
  } finally { f.close(); }
});
test('QQ failures and readback mismatch cannot claim verified success', async () => {
  for (const response of [{ status: 'failed', retcode: 1 }, { status: 'ok', retcode: 0, data: { card: '旧名字' } }]) {
    const f = fixture();
    try {
      f.record('1');
      const result = await createProfileActions({ ...f.options, request: async () => response })(args);
      assert.equal(result.verified, false);
    } finally { f.close(); }
  }
});
test('bridge receives free wording without hard intercept; tool API binds token, parent and owner source', async () => {
  const h = await bridgeHarness({ config: { localPolicy: { nicknameTools: true, aliases: ['鲸鲸'] } } });
  let server;
  try {
    h.setMode('reserved2'); h.setSelfIdentity('鲸鲸', '999');
    h.state.sessions['group:456'] = 'parent';
    const st = h.getSocialV2State('group:456'); st.bootstrapSent = true; st.wakeConfig.triggers = {};
    const writes = []; let card = '';
    h.bot.request = async (action, params) => {
      writes.push(action); if (action === 'set_group_card') card = params.card;
      return { status: 'ok', retcode: 0, data: { card } };
    };
    await h.handleIncoming('group', 456, { user_id: '123', self_id: '999', group_id: '456', message_id: '1', message: [{ type: 'text', data: { text: '给你群昵称改成不可爱的鲸' } }] }, h.cfg);
    assert.equal(writes.length, 0);
    assert.equal(h.calls.sent.length, 0);
    assert.match(st.unread.at(-1).plain, /给你群昵称/);
    server = h.startConsoleServer();
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    const call = async (body, token = st.agentToken) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/socialV2/profile/change`, { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-console-token': 'fixture-console-token', 'x-agent-token': token }, body: JSON.stringify({ ...args, parentId: 'parent', ...body }) });
      return { status: res.status, body: await res.json() };
    };
    assert.equal((await call({}, 'bad-token')).status, 403);
    assert.equal((await call({ parentId: 'another-parent' })).status, 403);
    assert.equal((await call({ sourceMessageId: 'not-owner' })).status, 403);
    assert.equal((await call({ key: 'group:777' })).status, 403);
    assert.equal(writes.length, 0);
    const result = await call({});
    assert.equal(result.status, 200);
    assert.equal(result.body.verified, true);
    assert.deepEqual(writes, ['set_group_card', 'get_group_member_info']);
  } finally { if (server) await new Promise(resolve => server.close(resolve)); await h.close(); }
});
