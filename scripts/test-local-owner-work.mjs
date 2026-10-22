import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handleOwnerNickname, localWakeReason } from '../src/local/owner-policy.js';
import { createDelegationAuthority } from '../src/local/delegation-authority.js';
import { bridgeHarness } from './audit-bridge-harness.mjs';

const cfg = { ownerQQ: '123', localPolicy: { ownerAlwaysWake: true, nicknameCommands: true, autoWork: true, aliases: ['小鲸鱼', '鲸鲸', '大肥鱼'] } };
const event = (text, user = '123') => ({ user_id: user, self_id: '999', message: [{ type: 'text', data: { text } }] });
test('real bridge wakes owner and aliases without @, but not unrelated group chatter', async () => {
  const h = await bridgeHarness({ config: cfg });
  try {
    const st = h.getSocialV2State('group:456'); st.wakeConfig.triggers = {};
    assert.equal(h.evaluateWakeTriggerV2('group:456', st, event('嗯'), 'group', '嗯', '嗯', false), 'owner');
    for (const alias of cfg.localPolicy.aliases) assert.equal(localWakeReason(cfg, event(alias, '789'), alias), 'alias');
    assert.equal(h.evaluateWakeTriggerV2('group:456', st, event('我是主人', '789'), 'group', '我是主人', '我是主人', false), null);
  } finally { await h.close(); }
});
test('disabled observation is absent from wake/reminder prompts', async () => {
  const h = await bridgeHarness({ config: { ...cfg, socialV2: { wake: { preSleepWaitEnabled: false } } } });
  try {
    assert.match(h.buildWakePromptV2('group:456', 'owner'), /快速收尾/);
    assert.doesNotMatch(h.buildWakePromptV2('group:456', 'owner'), /必须先调用 qq_wait_for_messages/);
    assert.doesNotMatch(h.buildWakeReminderPromptV2('group:456'), /timeoutMs=300000/);
  } finally { await h.close(); }
});
test('nickname mutations reject non-owner and quoted instructions', async () => {
  let calls = 0;
  const run = evt => handleOwnerNickname({ cfg, kind: 'group', id: '456', event: evt, request: async () => { calls++; } });
  assert.match(await run(event('把你的昵称改成 测试', '789')), /仅主人/);
  assert.equal(await run({ ...event('你好'), message: [{ type: 'reply', data: { text: '把你的昵称改成 测试' } }] }), null);
  assert.equal(calls, 0);
});
test('group owner card is rejected before mutation; successful bot rename is read back', async () => {
  const calls = [];
  const request = async (action, params) => { calls.push(action); return { status: 'ok', retcode: 0, data: action === 'get_stranger_info' ? { nickname: '小鲸鱼' } : { role: params.user_id === 123 ? 'owner' : 'admin' } }; };
  const options = { cfg, kind: 'group', id: '456', request };
  assert.match(await handleOwnerNickname({ ...options, event: event('把我的群名片改成 测试') }), /你是群主/);
  assert.ok(!calls.includes('set_group_card'));
  assert.match(await handleOwnerNickname({ ...options, event: event('鲸鲸，把你的昵称改成 小鲸鱼') }), /改成「小鲸鱼」了/);
  assert.ok(calls.includes('set_qq_profile'));
  assert.equal(calls.at(-1), 'get_stranger_info');
});
test('failed or unverified nickname changes never report success', async () => {
  for (const response of [{ status: 'failed', retcode: 1 }, { status: 'ok', retcode: 0, data: { nickname: '旧名' } }]) {
    const text = await handleOwnerNickname({ cfg, kind: 'group', id: '456', event: event('把你的昵称改成 小鲸鱼'), request: async () => response });
    assert.doesNotMatch(text, /改成「小鲸鱼」了/);
  }
});
test('delegation authority binds real owner message, conversation, child and replay protection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qq-delegate-test-'));
  try {
    const authority = createDelegationAuthority(root, () => '123');
    const msg = { ...event('请检查项目目录'), message_id: '100' };
    authority.record('group:456', { ...msg, user_id: '789' });
    assert.throws(() => authority.authorize({ key: 'group:456', parentId: 'p', sourceMessageId: '100' }), /主人/);
    authority.record('group:456', msg);
    assert.throws(() => authority.authorize({ key: 'group:999', parentId: 'p', sourceMessageId: '100' }), /主人/);
    const grant = authority.authorize({ key: 'group:456', parentId: 'parent-123', sourceMessageId: '100' });
    assert.equal(grant.original, '请检查项目目录');
    authority.record('group:456', msg);
    assert.throws(() => authority.authorize({ key: 'group:456', parentId: 'parent-123', sourceMessageId: '100' }), /已经委派/);
    assert.throws(() => authority.register({ ticket: grant.ticket, key: 'group:999', parentId: 'parent-123', childId: 'child-123' }), /无效/);
    authority.register({ ticket: grant.ticket, key: 'group:456', parentId: 'parent-123', childId: 'child-123' });
    authority.record('group:456', { ...event('顺便运行测试'), message_id: '101' });
    assert.throws(() => authority.authorize({ key: 'group:456', parentId: 'other-parent', sourceMessageId: '101', action: 'followup', childId: 'child-123' }), /不属于/);
    assert.equal(authority.authorize({ key: 'group:456', parentId: 'parent-123', sourceMessageId: '101', action: 'followup', childId: 'child-123' }).original, '顺便运行测试');
    const restored = createDelegationAuthority(root, () => '123');
    assert.equal(restored.child('child-123').parentId, 'parent-123');
    assert.equal(createDelegationAuthority(root, () => '789').child('child-123'), null);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
