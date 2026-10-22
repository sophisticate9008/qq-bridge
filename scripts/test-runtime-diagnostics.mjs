import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bridgeHarness } from './audit-bridge-harness.mjs';

const rejected = { result: { ok: false, error: { code: 'gateway/service-unavailable', message: 'sessionController unavailable' } } };
const event = { user_id: 123, group_id: 456, self_id: 789, message_id: 100,
  message: [{ type: 'text', data: { text: '鲸鲸在吗' } }], sender: { nickname: 'owner' } };
async function test(name, run) {
  const h = await bridgeHarness();
  try { await run(h); console.log('PASS', name); }
  finally { await h.close(); }
}

await test('rejected social delivery remains local and reports failure to caller', async h => {
  h.api.sessions.prompt = async () => rejected;
  const result = await h.deliverPrompt('group:456', 'fixture');
  assert.equal(result.ok, false);
  assert.equal(h.calls.sent.length, 0);
  assert.match(fs.readFileSync(path.join(h.temp, 'state/qq-activity.log'), 'utf8'), /投递被拒绝/);
});

await test('rejected ordinary chat does not publish infrastructure errors', async h => {
  h.setMode('chat');
  let attempted = 0;
  h.api.sessions.prompt = async () => { attempted++; return rejected; };
  await h.handleIncoming('group', 456, event, h.cfg);
  assert.equal(attempted, 1);
  assert.equal(h.calls.sent.length, 0);
});

await test('healthy settings with failed session service queues silently and recovers once', async h => {
  h.setMode('chat');
  h.api.sessions.list = async () => rejected;
  await h.checkDsh();
  await h.handleIncoming('group', 456, event, h.cfg);
  assert.equal(h.calls.prompts.length, 0);
  assert.equal(h.calls.sent.length, 0);
  h.api.sessions.list = async () => ({ result: { ok: true, value: { items: [] } } });
  await h.checkDsh();
  assert.equal(h.calls.prompts.length, 1);
  await h.checkDsh();
  assert.equal(h.calls.prompts.length, 1);
});

await test('runtime failures are logged locally and secrets are redacted', async h => {
  h.reportRuntimeFailure('group:456', 'agent 处理出错', 'service unavailable');
  const result = h.reportRuntimeFailure('group:456', 'agent 处理出错', 'password=fixture-secret');
  assert.match(result, /已隐藏/);
  assert.equal(h.calls.sent.length, 0);
});

await test('group sensitive-output block stays effective without a public notice', async h => {
  assert.equal(await h.auditAndSend('group:456', 'password=fixture-secret'), false);
  assert.equal(h.calls.sent.length, 0);
});
