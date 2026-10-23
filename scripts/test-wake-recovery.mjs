import assert from 'node:assert/strict';
import { bridgeHarness } from './audit-bridge-harness.mjs';

let passed = 0;
async function test(name, run) {
  let now = Date.now();
  class Clock extends Date { static now() { return now; } }
  const h = await bridgeHarness({ globals: { Date: Clock }, files: { 'state/mode.json': { mode: 'reserved2' } },
    config: { socialV2: { autoReplyCheckEnabled: false } } });
  try {
    h.setMode('reserved2');
    const key = 'group:456';
    const sid = await h.ensureSession(key);
    const st = h.getSocialV2State(key);
    st.bootstrapSent = true;
    const row = { sessionId: sid, agentAvailable: true, running: false,
      projections: { values: { inbox: { 'next-turn': [], 'next-step': [] } } } };
    const arm = () => { h.pendingWakeKeys.add(key); h.armPendingWakeLease(key); };
    const poll = () => h.reconcileWakeStatesV2([row], h.captureWakeStatesV2());
    const advance = () => { now += h.WAKE_IDLE_CONFIRM_MS + 1; };
    await run({ h, key, sid, st, row, arm, poll, advance });
    console.log('PASS ' + name); passed++;
  } finally { await h.close(); }
}

await test('orphan turn/end cannot block pending wakes for 30 minutes', ({h,key,sid,st,arm,poll,advance}) => {
  arm(); h.v2TurnStartAt.set(sid, Date.now());
  h.trackTurnEvent(sid, {type:'turn/end',data:{turn:7,reason:{kind:'completed'}}});
  st.unread = [{seq:10}]; st.pendingWakeReasons = [{reason:'atMention',seq:10}];
  poll(); assert(h.pendingWakeKeys.has(key)); assert(!st.pendingWakeTimer);
  advance(); poll(); assert(!h.pendingWakeKeys.has(key)); assert(st.pendingWakeTimer);
  assert.equal(h.state.sessions[key],sid); assert.equal(h.calls.cancelled.length,0);
});
await test('a live long tool/model turn stays busy across idle checks', ({h,key,row,arm,poll,advance}) => {
  arm(); row.running=true; for(let i=0;i<400;i++){advance();poll();}
  assert(h.pendingWakeKeys.has(key)); assert.equal(h.calls.cancelled.length,0);
});
await test('accepted queued prompts are never mistaken for idle', ({h,key,row,arm,poll,advance}) => {
  arm(); row.projections.values.inbox['next-turn']=[{id:'queued'}]; poll(); advance();poll();
  assert(h.pendingWakeKeys.has(key));
});
await test('unknown inbox or unavailable agent cannot prove idleness', ({h,key,row,arm,poll,advance}) => {
  arm(); delete row.projections.values.inbox; poll();advance();poll();assert(h.pendingWakeKeys.has(key));
  row.projections.values.inbox={'next-turn':[],'next-step':[]};row.agentAvailable=false;poll();advance();poll();assert(h.pendingWakeKeys.has(key));
});
await test('new delivery invalidates a concurrent idle response', ({h,key,row,arm,poll,advance}) => {
  arm();poll();advance();const old=h.captureWakeStatesV2();arm();h.reconcileWakeStatesV2([row],old);
  assert(h.pendingWakeKeys.has(key)); assert(!h.wakeIdleObservations.has(key));
});
await test('live progress invalidates a concurrent idle response', ({h,key,sid,row,arm,poll,advance}) => {
  arm();poll();advance();const old=h.captureWakeStatesV2();h.recordSessionUsage(sid,{type:'fixture/progress'});
  h.reconcileWakeStatesV2([row],old);assert(h.pendingWakeKeys.has(key));assert(!h.wakeIdleObservations.has(key));
});
await test('local in-flight delivery prevents recovery even when DSH looks idle', ({h,key,arm,poll,advance}) => {
  arm();poll();advance();h.promptQueues.set(key,{running:true,queue:[]});poll();assert(h.pendingWakeKeys.has(key));
});
await test('paused dispatch preserves wakes and never schedules a model call', ({h,key,st,arm,poll,advance}) => {
  arm();st.unread=[{seq:1}];st.pendingWakeReasons=[{reason:'atMention',seq:1}];poll();advance();h.socialV2.paused=true;poll();
  assert(h.pendingWakeKeys.has(key));assert.equal(h.replayPendingWakeReasonsV2(key),null);assert(!st.pendingWakeTimer);
});
await test('reset/replaced session cannot be affected by an old probe', ({h,key,sid,row,arm,poll,advance}) => {
  arm();poll();advance();const old=h.captureWakeStatesV2();h.state.sessions[key]='replacement';h.resetEpoch();
  h.reconcileWakeStatesV2([row],old);assert.equal(h.state.sessions[key],'replacement');assert(h.pendingWakeKeys.has(key));
});
await test('message backlog coalesces into the strongest single wake', ({h,key,st}) => {
  st.unread=[{seq:20}];st.pendingWakeReasons=[{reason:'probability',seq:10},{reason:'atMention',seq:20},{reason:'dialogueFollowup',seq:19}];
  assert.equal(h.replayPendingWakeReasonsV2(key).reason,'atMention');assert(st.pendingWakeTimer);assert.equal(st.pendingWakeReasons.length,0);
  assert.equal(h.replayPendingWakeReasonsV2(key),null);
});
await test('stale message heads do not strand an actionable timer behind them', ({h,key,st}) => {
  st.unread=[];st.pendingWakeReasons=[{reason:'atMention',seq:1},{reason:'dialogueFollowup',seq:2},{reason:'admin',seq:0}];
  assert.equal(h.replayPendingWakeReasonsV2(key).reason,'admin');assert(st.pendingWakeTimer);
});
await test('busy reminder preserves the original backlog sequence', ({h,key,st,arm}) => {
  arm();st.unread=[{seq:20}];st.lastUnreadSeq=20;st.pendingWakeReasons=[{reason:'atMention',seq:4}];
  assert.equal(h.replayPendingWakeReasonsV2(key),null);assert.equal(st.pendingWakeReasons[0].seq,4);
});
await test('health polling uses authoritative rows without model requests', async ({h,key,row,arm,advance}) => {
  arm();h.api.sessions.list=async()=>({result:{ok:true,value:{items:[row]}}});
  await h.checkDsh();assert(h.pendingWakeKeys.has(key));advance();await h.checkDsh();
  assert(!h.pendingWakeKeys.has(key));assert.equal(h.calls.prompts.length,0);assert.equal(h.calls.sent.length,0);
});
await test('failed health request resets the two-observation proof', async ({h,key,row,arm,advance}) => {
  arm();h.api.sessions.list=async()=>({result:{ok:true,value:{items:[row]}}});await h.checkDsh();advance();
  h.api.sessions.list=async()=>{throw Error('fixture unavailable')};await h.checkDsh();
  h.api.sessions.list=async()=>({result:{ok:true,value:{items:[row]}}});await h.checkDsh();assert(h.pendingWakeKeys.has(key));
  advance();await h.checkDsh();assert(!h.pendingWakeKeys.has(key));
});
console.log(`PASS ${passed} wake recovery regressions`);
