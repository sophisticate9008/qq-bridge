import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { bridgeHarness } from './audit-bridge-harness.mjs';

for (const bind of ['127.0.0.1', '0.0.0.0']) {
  const h = await bridgeHarness({ config: { consoleHost: bind }, globals: {
    os: { ...os, networkInterfaces: () => ({ lan: [{ family: 'IPv4', address: '192.0.2.10' }] }) },
  } });
  const server = h.startConsoleServer();
  try {
    if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
    assert.equal(server.address().address, bind);
    const port = server.address().port;
    const call = (headers = {}, method = 'GET') => new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/status', method,
        headers: { host: `192.0.2.10:${port}`, 'content-type': 'application/json',
          'x-console-token': 'fixture-console-token', ...headers } }, res => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      });
      req.on('error', reject);
      req.setTimeout(3000, () => req.destroy(new Error('request timeout')));
      req.end(method === 'GET' ? undefined : '{}');
    });
    assert.equal(await call(), bind === '0.0.0.0' ? 200 : 403);
    if (bind === '0.0.0.0') {
      assert.equal(await call({ 'x-console-token': '' }), 401);
      assert.equal(await call({ host: `evil.example:${port}` }), 403);
      assert.equal(await call({ host: `192.0.2.11:${port}` }), 403);
      assert.equal(await call({ origin: `http://evil.example:${port}` }, 'POST'), 403);
      // This GET-only route returns 404 for POST, after passing the origin fence.
      assert.equal(await call({ origin: `http://192.0.2.10:${port}` }, 'POST'), 404);
    }
    console.log(`PASS ${bind}: bind, Host, authentication and Origin checks`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await h.close();
  }
}
