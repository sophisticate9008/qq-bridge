// Apply our deploy-time persona/config without editing upstream preset bundles.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(root, 'config.json');
const cfg = JSON.parse(fs.readFileSync(configFile));
cfg.localPolicy = { ...cfg.localPolicy, ownerAlwaysWake: true, nicknameCommands: true, delegation: true,
  displayName: '小鲸鱼', aliases: ['小鲸鱼', '鲸鲸', '大肥鱼'] };
delete cfg.localPolicy.autoWork;
cfg.dsh.reasoningEffort = 'off';
cfg.socialV2.autoReplyCheckEnabled = false;
Object.assign(cfg.socialV2.wake, { preSleepWaitEnabled: false, batchWindowMs: 1000,
  maxWakePerMinute: 20, maxWakePerHour: 300,
  recommendedHint: '快速聊天：主人消息及小鲸鱼、鲸鲸、大肥鱼均可触发；读完回复后直接标记已读，不需要沉睡前等待。' });
Object.assign(cfg.socialV2.wait, { defaultQuietMs: 1000, minQuietAfterNewMs: 500, burstQuietMs: 1500, unfinishedQuietMs: 3000 });
Object.assign(cfg.socialV2.send, { maxSendPerMinute: 30, maxSendPerHour: 300 });
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
writeJson(configFile, cfg);
const profileFile = path.join(root, 'dsh/home/profiles/web/cordis.patch.yml');
const profile = yaml.load(fs.readFileSync(profileFile, 'utf8'));
const prefix = fs.readFileSync(path.join(root, 'dsh/deployment/chat-persona.txt'), 'utf8');
for (const name of ['qq-chat', 'qq-chat-v2']) {
  const generated = yaml.load(fs.readFileSync(path.join(root, `plugins/qq-agent-presets/presets/${name}.patch.yml`), 'utf8'));
  const row = generated.flatMap(p => p.insert ?? []).find(p => p.config?.id === name);
  const persona = row.config.plugins.find(p => p.id === 'persona');
  // V2's editable source is authoritative, including the local delegation policy.
  // Do not silently replace it with the shorter deployment prefix during sync.
  if (name === 'qq-chat') persona.config.prefix = prefix;
  persona.config.suffix = '';
  row.config.plugins.push({ id: 'owner-delegation', name: 'qq-agent-presets/owner-delegation.mjs' });
  let override = profile.find(p => p.id === `preset-${name}`);
  if (!override) { override = { id: `preset-${name}` }; profile.push(override); }
  override.config = row.config;
}
const deepseek = profile.find(p => p.id === 'llm-deepseek');
if (deepseek) deepseek.config.reasoningEffort = 'off';
const defaultModel = profile.find(p => p.id === 'agent-default-model');
if (defaultModel) defaultModel.config.reasoningEffort = 'off';
fs.writeFileSync(profileFile, yaml.dump(profile, { lineWidth: 140 }), { mode: 0o600 });
const roleFile = path.join(root, 'state/current-role.json');
const role = JSON.parse(fs.readFileSync(roleFile));
role.role = '鲸鲸';
writeJson(roleFile, role);
console.log('Local chat persona and fast-chat policy applied. Restart DSH and bridge to load.');
