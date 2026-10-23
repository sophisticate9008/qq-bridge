// Sync only the V2 persona into the local deployment override, preserving tools,
// permissions, model routes, chat state and other deployment-specific settings.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { renderPatch } from '../scripts/build-agent-preset-patches.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'dsh/home/profiles/web/cordis.patch.yml');
const profile = yaml.load(fs.readFileSync(file, 'utf8'));
const source = yaml.load(renderPatch('qq-chat-v2'))[0].insert[0];
const target = profile.find(row => row.id === 'preset-qq-chat-v2');
const persona = target?.config?.plugins?.find(row => row.id === 'persona');
if (!persona) throw new Error('Local V2 persona override not found; configure the deployment first');
const backupDir = path.join(root, 'runtime', `persona-backup-${Date.now()}`);
fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const backup = path.join(backupDir, 'cordis.patch.yml');
fs.copyFileSync(file, backup);
fs.chmodSync(backup, 0o600);
persona.config.prefix = source.config.plugins.find(row => row.id === 'persona').config.prefix;
persona.config.suffix = ''; // The deployed runtime does not expose {{cwd}} here.
fs.writeFileSync(file, yaml.dump(profile, { lineWidth: 140 }), { mode: 0o600 });
console.log('V2 persona synced. Restart DSH to load; existing conversations are preserved.');
