#!/usr/bin/env python3
"""Lifecycle tests with fake screen/health peers; never touch running services."""
import fcntl
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent

class CliTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='qqbridge-cli-')
        self.root = Path(self.temp.name)
        for name in ['ops', 'bin', 'screens', 'runtime']:
            (self.root / name).mkdir()
        shutil.copy2(ROOT / 'ops/qqbridge', self.root / 'ops/qqbridge')
        (self.root / 'ops/health.mjs').write_text('''import fs from 'node:fs';
const s=process.argv[2],name=['zhenxun','qq-client'].includes(s)?s:'qq-'+s;
process.exit(fs.existsSync(process.env.QQBRIDGE_TEST_DIR+'/screens/'+name)?0:1);
''')
        (self.root / 'bin/screen').write_text('''#!/usr/bin/python3
import os,sys
from pathlib import Path
r=Path(os.environ['QQBRIDGE_TEST_DIR']);a=sys.argv[1:]
if '-ls' in a:
 for p in (r/'screens').iterdir():print('1234.'+p.name+' (Detached)')
elif '-dmS' in a:
 name=a[a.index('-dmS')+1]
 if name==os.environ.get('FAKE_FAIL_START'):sys.exit(1)
 try:os.fstat(9)
 except OSError:pass
 else:raise Exception('screen inherited the control lock')
 (r/'screens'/name).touch()
 with (r/'trace').open('a') as f:f.write('start '+name+'\\n')
elif '-S' in a:
 name=a[a.index('-S')+1];(r/'screens'/name).unlink()
 with (r/'trace').open('a') as f:f.write('stop '+name+'\\n')
''')
        (self.root / 'bin/sub2api-chroot').write_text('''#!/usr/bin/python3
import os,sys
from pathlib import Path
r=Path(os.environ['QQBRIDGE_TEST_DIR'])
if sys.argv[1]=='postgres-status':sys.exit(0 if (r/'postgres').exists() else 1)
if sys.argv[1]=='postgres-start':
 (r/'postgres').touch()
 with (r/'trace').open('a') as f:f.write('postgres-start\\n')
''')
        for file in (self.root / 'bin').iterdir():
            file.chmod(0o755)
        self.env = {**os.environ, 'PATH': str(self.root/'bin')+':'+os.environ['PATH'], 'QQBRIDGE_TEST_DIR': str(self.root)}
    def tearDown(self):
        self.temp.cleanup()
    def run_cli(self, *args, ok=True):
        p=subprocess.run([str(self.root/'ops/qqbridge'), *args], env=self.env, capture_output=True, text=True, timeout=15)
        self.assertEqual(p.returncode == 0, ok, p.stdout+p.stderr)
        return p
    def trace(self):
        p=self.root/'trace'
        return p.read_text().splitlines() if p.exists() else []
    def test_lifecycle_order_and_idempotence(self):
        self.run_cli()
        expected=['postgres-start']+['start '+s for s in ['zhenxun','qq-snowluma','qq-client','qq-dsh','qq-bridge']]
        self.assertEqual(self.trace(), expected)
        self.run_cli('start');self.assertEqual(self.trace(), expected)
        self.run_cli('restart','bridge')
        self.assertEqual(self.trace()[-2:], ['stop qq-bridge','start qq-bridge'])
        self.run_cli('stop')
        self.assertEqual(self.trace()[-5:], ['stop '+s for s in ['qq-bridge','qq-dsh','qq-client','qq-snowluma','zhenxun']])
        self.assertTrue((self.root/'postgres').exists())
    def test_failed_start_stops_dependency_chain(self):
        self.env['FAKE_FAIL_START']='qq-snowluma'
        self.run_cli('start',ok=False)
        self.assertEqual(self.trace(),['postgres-start','start zhenxun'])
    def test_invalid_component_and_control_lock(self):
        self.run_cli('restart','unknown',ok=False)
        self.assertEqual(self.trace(), [])
        with (self.root/'runtime/qqbridge-control.lock').open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            p=self.run_cli('start',ok=False)
            self.assertIn('另一个 qqbridge',p.stderr)
        self.assertEqual(self.trace(), [])

if __name__ == '__main__':unittest.main()
