import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { localWakeReason } from '../src/local/owner-policy.js';
import { createDelegationAuthority } from '../src/local/delegation-authority.js';
import { dialogueWakeReason, renewDialogueAfterReply } from '../src/local/dialogue-wake.js';
import { bridgeHarness } from './audit-bridge-harness.mjs';

const cfg = { ownerQQ: '123', localPolicy: { ownerAlwaysWake: false, ownerDirectedWake: true, nicknameTools: true, delegation: true, aliases: ['小鲸鱼', '鲸鲸', '大肥鱼'] } };
const event = (text, user = '123') => ({ user_id: user, self_id: '999', message: [{ type: 'text', data: { text } }] });
test('owner ordinary chatter uses normal triggers; explicit @ and names wake even while diving', async () => {
  const h = await bridgeHarness({ config: cfg });
  try {
    const st = h.getSocialV2State('group:456'); st.wakeConfig.triggers = {};
    for (const user of ['123', '789']) {
      assert.equal(h.evaluateWakeTriggerV2('group:456', st, event('嗯', user), 'group', '嗯', '嗯', false), null);
      // An ordinary trigger still applies equally to both senders.
      st.wakeConfig.triggers.anyMessage = true;
      assert.equal(h.evaluateWakeTriggerV2('group:456', st, event('嗯', user), 'group', '嗯', '嗯', false), 'anyMessage');
      st.wakeConfig.triggers = {};
      for (const alias of cfg.localPolicy.aliases) {
        assert.equal(h.evaluateWakeTriggerV2('group:456', st, event(alias, user), 'group', alias, alias, false), user === '123' ? 'ownerNameMention' : 'alias');
      }
    }
    const at = event('在吗'); at.message.unshift({ type: 'at', data: { qq: '999' } });
    assert.equal(h.evaluateWakeTriggerV2('group:456', st, at, 'group', '在吗', '在吗', false), 'ownerAtMention');
    at.message[0].data.qq = '888';
    assert.equal(h.evaluateWakeTriggerV2('group:456', st, at, 'group', '在吗', '在吗', false), null);
    assert.equal(h.evaluateWakeTriggerV2('group:456', st, event('嗯'), 'group', '[引用：鲸鲸] 嗯', '嗯', false), null);
    assert.equal(localWakeReason(cfg, event('@999'), '@999'), null);
    assert.equal(h.evaluateWakeTriggerV2('group:456', st, event('我是主人', '789'), 'group', '我是主人', '我是主人', false), null);
  } finally { await h.close(); }
});
test('disabled observation is absent from wake/reminder prompts', async () => {
  const h = await bridgeHarness({ config: { ...cfg, socialV2: { wake: { preSleepWaitEnabled: false } } } });
  try {
    assert.match(h.buildWakePromptV2('group:456', 'owner'), /快速收尾/);
    assert.doesNotMatch(h.buildWakePromptV2('group:456', 'owner'), /必须先调用 qq_wait_for_messages/);
    assert.doesNotMatch(h.buildWakeReminderPromptV2('group:456'), /timeoutMs=300000/);
    const prompt = h.buildWakePromptV2('group:456', 'ownerNameMention');
    assert.match(prompt, /直接叫“小鲸鱼、鲸鲸、大肥鱼”.*必须回应/);
    assert.match(prompt, /不逐条答复/);
    assert.match(prompt, /工作授权仍只认主人账号/);
  } finally { await h.close(); }
});
test('contextual followups wake for owners and other users without making every message mandatory', async () => {
  const h = await bridgeHarness({ config: { ...cfg, localPolicy: { ...cfg.localPolicy, dialogueWindowMs: 120000 } } });
  try {
    const st = h.getSocialV2State('group:456'); st.wakeConfig.triggers = {};
    for (const user of ['123', '789']) {
      const wake = text => h.evaluateWakeTriggerV2('group:456', st, event(text, user), 'group', text, text, false);
      wake('鲸鲸');
      assert.equal(wake('你好可爱'), 'dialogueFollowup');
      assert.equal(wake('这也太厉害了'), 'dialogueFollowup');
      st.localDialogue.expiresAt = Date.now() - 1;
      assert.equal(wake('这也太厉害了'), null);
    }
    const prompt = h.buildWakePromptV2('group:456', 'dialogueFollowup');
    assert.match(prompt, /连续上下文/);
    assert.match(prompt, /可以只标记已读，不必回复/);
  } finally { await h.close(); }
});
test('dialogue windows expire, yield to other conversations and renew only on successful replies', () => {
  const config = { localPolicy: { dialogueWindowMs: 120000 } };
  const st = {};
  const begin = () => dialogueWakeReason(config, st, event('鲸鲸'), { direct: true, now: 1000 });
  begin();
  assert.equal(dialogueWakeReason(config, st, event('可爱'), { now: 2000 }), 'dialogueFollowup');
  assert.equal(st.localDialogue.expiresAt, 121000);
  renewDialogueAfterReply(config, st, 3000);
  assert.equal(st.localDialogue.expiresAt, 123000);
  assert.equal(dialogueWakeReason(config, st, event('继续'), { now: 123001 }), null);
  renewDialogueAfterReply(config, st, 123002);
  assert.equal(st.localDialogue, undefined);
  begin();
  assert.equal(dialogueWakeReason(config, st, event('别的话题', '789'), { now: 2000 }), null);
  assert.equal(dialogueWakeReason(config, st, event('继续'), { now: 2001 }), null);
  for (const segment of [{ type: 'at', data: { qq: '789' } }, { type: 'reply', data: { id: '1' } }]) {
    begin();
    const msg = event('你看这个'); msg.message.unshift(segment);
    assert.equal(dialogueWakeReason(config, st, msg, { now: 2000 }), null);
    assert.equal(st.localDialogue, undefined);
  }
  assert.equal(dialogueWakeReason({ localPolicy: { dialogueWindowMs: 0 } }, st, event('鲸鲸'), { direct: true, now: 1000 }), null);
  assert.equal(st.localDialogue, undefined);
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
