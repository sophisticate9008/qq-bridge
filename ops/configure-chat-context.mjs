// Apply the conversation capacity policy; never reset conversations implicitly.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileFile = path.join(root, 'dsh/home/profiles/web/cordis.patch.yml');
const configFile = path.join(root, 'config.json');
const backup = path.join(root, 'runtime', `chat-context-backup-${Date.now()}`);
fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
for (const file of [profileFile, configFile]) {
  const dest = path.join(backup, path.basename(file));
  fs.copyFileSync(file, dest);
  fs.chmodSync(dest, 0o600);
}
await import('./configure-token-economy.mjs');
const profile = yaml.load(fs.readFileSync(profileFile, 'utf8'));
if (!profile.flatMap(p => p.insert ?? []).some(p => p.id === 'qq-context-routing')) {
  profile.push({ insert: [{ id: 'qq-context-routing', name: 'qq-agent-presets/qq-context-routing.mjs' }] });
  fs.writeFileSync(profileFile, yaml.dump(profile, { lineWidth: 140 }), { mode: 0o600 });
}
const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
config.dsh.conversationContext = true;
fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
console.log('Chat capacity routing installed: group 172K, private 384K. Restart DSH and Bridge; GPT configuration is preserved.');
