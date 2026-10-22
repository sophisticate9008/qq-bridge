#!/usr/bin/env python3
"""Install the host CLI and migrate this host's existing boot dispatcher."""
from pathlib import Path
from datetime import datetime
import shutil
import re

root = Path(__file__).resolve().parent.parent
boot = Path('/root/service_boot/service-boot.sh')
cli = Path('/usr/local/bin/qqbridge')
target = root / 'ops/qqbridge'
source = boot.read_text()
updated = source.replace('/root/qq-bridge/ops/stack.sh', str(cli))
updated = updated.replace('    start_zhenxun || failed_services+=("zhenxun")\n', '')
updated = updated.replace('failed_services+=("qq-stack")', 'failed_services+=("qqbridge")')
updated = updated.replace('    stop_screen zhenxun\n', '')
updated = updated.replace(f'    {cli} stop || return 1\n', '')
updated = updated.replace(f'    {cli} stop\n', '')
updated = updated.replace('stop_all() {\n', f'stop_all() {{\n    {cli} stop || return 1\n', 1)
old_status = '''    if zhenxun_is_healthy; then
        printf '  %-10s running (HTTP OK)\\n' "zhenxun"
    elif screen_is_running "zhenxun"; then
        printf '  %-10s unhealthy/starting (screen exists, HTTP failed)\\n' "zhenxun"
    else
        printf '  %-10s stopped\\n' "zhenxun"
    fi
'''
updated = updated.replace(old_status, '')
updated = updated.replace('        zhenxun|gscore|porthub)', '        gscore|porthub)')
if 'qqbridge|bridge|dsh|snowluma|qq-client|zhenxun)' not in updated:
    updated = updated.replace('    case "$service" in\n', '''    case "$service" in
        qqbridge|bridge|dsh|snowluma|qq-client|zhenxun)
            if [[ "$service" == qqbridge ]]; then service=bridge; fi
            /usr/local/bin/qqbridge logs "$service" -f
            ;;
''', 1)
updated = updated.replace('logs {sub2api|zhenxun|gscore|napcat|', 'logs {qqbridge|bridge|dsh|snowluma|qq-client|zhenxun|sub2api|gscore|napcat|')
updated = updated.replace('    restart)\n        stop_all\n        start_all', '    restart)\n        stop_all || exit $?\n        start_all')
# Remove the retired protocol's entrypoints as well as its old startup call.
updated = re.sub(r'^start_napcat\(\) \{\n.*?^\}\n\n?', '', updated, flags=re.M | re.S)
updated = re.sub(r'^NAPCAT_DIR=.*\n', '', updated, flags=re.M)
updated = updated.replace('    start_napcat || failed_services+=("napcat")\n', '')
updated = updated.replace('    stop_screen napcat\n', '')
updated = updated.replace('        napcat)\n            screen -r napcat\n            ;;\n', '')
updated = updated.replace('|napcat|', '|')
# QQ_NUMBER belonged to the old NapCat command; retain it if still referenced.
if not re.search(r'\$(?:QQ_NUMBER\b|\{QQ_NUMBER\b)', updated):
    updated = re.sub(r'^QQ_NUMBER=.*\n', '', updated, flags=re.M)
if re.search(r'napcat', updated, flags=re.I):
    raise SystemExit('boot shape changed: unrecognized NapCat reference remains')
# Fail before modifying either entrypoint if the expected boot shape has changed.
for entry in ['start', 'stop', 'status']:
    if f'{cli} {entry}' not in updated:
        raise SystemExit(f'boot shape changed: missing qqbridge {entry}')
if cli.exists() or cli.is_symlink():
    if cli.resolve() != target.resolve():
        raise SystemExit('qqbridge command already exists and belongs to another installation')
if source != updated:
    backup = root / 'ops/backups' / ('boot-before-qqbridge-' + datetime.now().strftime('%Y%m%d-%H%M%S'))
    backup.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    shutil.copy2(boot, backup)
    temporary = boot.with_suffix('.qqbridge.tmp')
    temporary.write_text(updated)
    temporary.chmod(boot.stat().st_mode & 0o777)
    # Check syntax before replacing the live boot script.
    import subprocess
    subprocess.run(['bash', '-n', str(temporary)], check=True)
    temporary.replace(boot)
target.chmod(0o755)
if not cli.is_symlink():
    cli.symlink_to(target)
print('Installed /usr/local/bin/qqbridge; boot start/stop/status/logs now use it.')
