import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRestartHandler } from '../lib/handler.js';
import { createRestartService } from '../lib/service.js';
import * as host from '../lib/host.js';

function fakeService(overrides = {}) {
  const calls = [];
  const base = {
    status: () => ({ pid: 1234, mode: 'manual', uptimeSec: 9 }),
    reload: async () => { calls.push('reload'); return { reloaded: true, warnings: [] }; },
    restart: () => { calls.push('restart'); return { ok: true, mode: 'manual', action: 'relaunch', pid: 1234 }; },
    paths: { markerPath: '/tmp/last.json', logPath: '/tmp/web.log' },
  };
  return { handle: createRestartHandler({ service: { ...base, ...overrides } }), calls };
}

test('status returns the process view and the paths', async () => {
  const { handle } = fakeService();
  const result = await handle({ action: 'status' });
  assert.equal(result.ok, true);
  assert.equal(result.value.status.pid, 1234);
  assert.equal(result.value.paths.logPath, '/tmp/web.log');
});

test('reload and restart are routed to the service', async () => {
  const { handle, calls } = fakeService();
  assert.equal((await handle({ action: 'reload' })).value.reloaded, true);
  assert.equal((await handle({ action: 'restart', by: 'test' })).value.action, 'relaunch');
  assert.deepEqual(calls, ['reload', 'restart']);
});

test('errors carry their code through the contract', async () => {
  const { handle } = fakeService({
    restart: () => { throw Object.assign(new Error('已经在重启了'), { code: 'RESTART_PENDING' }); },
  });
  const result = await handle({ action: 'restart' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'RESTART_PENDING');
});

test('bad requests are rejected', async () => {
  const { handle } = fakeService();
  assert.equal((await handle('nope')).error.code, 'INVALID_BODY');
  assert.equal((await handle({ action: 'explode' })).error.code, 'UNKNOWN_ACTION');
});

test('declares the connection injection (without it a cold boot fails to activate)', async () => {
  const module = await import('../lib/host.js');
  assert.ok(Array.isArray(module.inject), 'host.js 必须导出 inject 数组');
  assert.ok(module.inject.includes('connection'), "inject 必须包含 'connection'");
});

test('host registers the route with the real service behind it', () => {
  const routes = [];
  const effects = [];
  const ctx = {
    effect(fn, label) { effects.push(label); const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {}; },
    connection: { fetch: { register(def) { routes.push(def); return () => {}; } } },
    get: () => null,
  };
  const dir = mkdtempSync(join(tmpdir(), 'restart-host-'));
  host.apply(ctx, { markerPath: join(dir, 'last.json'), logPath: join(dir, 'web.log'), workerPath: '/plugin/relaunch.mjs' });
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, '/api/bot-restart');
  assert.ok(effects.includes('bot-restart: HTTP route'));
});

test('restartPaths honours config and DSH_HOME', () => {
  assert.equal(host.restartPaths({ markerPath: '/custom/last.json' }).markerPath, '/custom/last.json');
  const previous = process.env.DSH_HOME;
  process.env.DSH_HOME = '/tmp/fake-home';
  try {
    const paths = host.restartPaths();
    assert.equal(paths.markerPath, '/tmp/fake-home/bot/restart/last.json');
    assert.equal(paths.logPath, '/tmp/fake-home/logs/web.log');
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previous;
  }
});

test('the service exposes the same status shape the route returns', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'restart-status-'));
  const service = createRestartService({
    markerPath: join(dir, 'last.json'), logPath: join(dir, 'web.log'), workerPath: '/plugin/relaunch.mjs',
    execPath: '/usr/bin/node', argv: ['/usr/bin/node', '/opt/dsh/bin/dsh', 'web', '--port', '3080'],
    cwd: '/work', pid: 7, ppid: 1, startedAt: 0, env: {}, spawnFn: () => ({ pid: 9, unref() {} }), exitFn: () => {}, schedule: () => 0,
  });
  const handle = createRestartHandler({ service });
  const value = (await handle({ action: 'status' })).value;
  assert.equal(value.status.pid, 7);
  assert.equal(value.status.port, 3080);
  assert.equal(value.status.mode, 'manual');
});
