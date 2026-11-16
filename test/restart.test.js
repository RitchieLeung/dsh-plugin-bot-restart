import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRelaunchPlan, describeStatus, humanUptime, portOf, publicUrlOf, readMarker, supervisorMode } from '../lib/restart.js';
import { createRestartService } from '../lib/service.js';

const ARGV = ['/usr/bin/node', '/opt/dsh/bin/dsh', 'web', '--no-open', '--port', '3080', '--public-url', 'https://dsh.example.com'];

test('supervisorMode: systemd env vs manual, with an explicit override', () => {
  assert.equal(supervisorMode({}), 'manual');
  assert.equal(supervisorMode({ INVOCATION_ID: 'abc' }), 'systemd');
  assert.equal(supervisorMode({ JOURNAL_STREAM: '1:2' }), 'systemd');
  assert.equal(supervisorMode({ INVOCATION_ID: 'abc', DSH_RESTART_MODE: 'manual' }), 'manual');
  assert.equal(supervisorMode({ DSH_RESTART_MODE: 'systemd' }), 'systemd');
});

test('portOf and publicUrlOf read the app flags', () => {
  assert.equal(portOf(ARGV), 3080);
  assert.equal(portOf(['node', 'dsh', 'web', '--port=4000']), 4000);
  assert.equal(portOf(['node', 'dsh', 'web']), 3080);
  assert.equal(publicUrlOf(ARGV), 'https://dsh.example.com');
  assert.equal(publicUrlOf(['node', 'dsh', 'web']), '');
});

test('buildRelaunchPlan hands the worker a self-contained payload', () => {
  const plan = buildRelaunchPlan({
    execPath: '/usr/bin/node', argv: ARGV, cwd: '/work', pid: 1234, port: 3080,
    logPath: '/logs/web.log', workerPath: '/plugin/lib/relaunch.mjs', env: { A: '1' },
  });
  assert.equal(plan.action, 'relaunch');
  assert.equal(plan.spawn.command, '/usr/bin/node');
  assert.equal(plan.spawn.args[0], '/plugin/lib/relaunch.mjs');
  const payload = JSON.parse(plan.spawn.args[1]);
  assert.equal(payload.waitPid, 1234);
  assert.equal(payload.command, '/usr/bin/node');
  assert.deepEqual(payload.args, ['/opt/dsh/bin/dsh', 'web', '--no-open', '--port', '3080', '--public-url', 'https://dsh.example.com']);
  assert.equal(payload.cwd, '/work');
  assert.equal(payload.port, 3080);
  assert.equal(payload.logPath, '/logs/web.log');
  assert.equal(plan.spawn.options.detached, true);
  assert.equal(plan.spawn.options.env.A, '1');
});

test('describeStatus reports uptime, port and the last restart', () => {
  const status = describeStatus({
    pid: 42, ppid: 1, argv: ARGV, cwd: '/work', startedAt: 1_000, nodeVersion: 'v24.0.0',
    now: 61_000, mode: 'manual', lastRestart: { at: 900, mode: 'manual', fromPid: 41 },
  });
  assert.equal(status.uptimeSec, 60);
  assert.equal(status.port, 3080);
  assert.equal(status.publicUrl, 'https://dsh.example.com');
  assert.deepEqual(status.lastRestart, { at: 900, mode: 'manual', fromPid: 41 });
});

test('humanUptime formats seconds, minutes, hours and days', () => {
  assert.equal(humanUptime(0), '0 秒');
  assert.equal(humanUptime(75), '1 分 15 秒');
  assert.equal(humanUptime(3660), '1 小时 1 分');
  assert.equal(humanUptime(90_000), '1 天 1 小时');
});

test('readMarker tolerates a missing or broken file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'restart-marker-'));
  assert.equal(readMarker(join(dir, 'nope.json')), null);
});

function makeService(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'restart-svc-'));
  const state = { spawned: [], exits: [], scheduled: [] };
  const service = createRestartService({
    markerPath: join(dir, 'last.json'),
    logPath: join(dir, 'web.log'),
    workerPath: '/plugin/relaunch.mjs',
    execPath: '/usr/bin/node',
    argv: ARGV,
    cwd: '/work',
    pid: 1234,
    ppid: 1,
    startedAt: 1_000,
    env: {},
    spawnFn: (command, args, options) => {
      state.spawned.push({ command, args, options });
      return { pid: 4321, unref() {} };
    },
    exitFn: code => state.exits.push(code),
    schedule: (fn, ms) => { state.scheduled.push({ fn, ms }); return 0; },
    ...overrides,
  });
  return { service, state, dir };
}

test('manual mode: restart spawns the worker, writes the marker, then exits', async () => {
  const { service, state, dir } = makeService();
  const value = service.restart({ by: 'test' });
  assert.equal(value.ok, true);
  assert.equal(value.mode, 'manual');
  assert.equal(value.action, 'relaunch');
  assert.equal(value.workerPid, 4321);
  assert.equal(state.spawned.length, 1);
  assert.equal(state.spawned[0].args[0], '/plugin/relaunch.mjs');

  const marker = readMarker(join(dir, 'last.json'));
  assert.equal(marker.fromPid, 1234);
  assert.equal(marker.mode, 'manual');
  assert.equal(marker.by, 'test');

  // 响应先回去，退出排在后面
  assert.equal(state.scheduled.length, 1);
  assert.ok(state.scheduled[0].ms >= 0);
  state.scheduled[0].fn();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(state.exits, [0]);
});

test('systemd mode: restart only exits, systemd brings it back', async () => {
  const { service, state } = makeService({ env: { INVOCATION_ID: 'abc' } });
  const value = service.restart();
  assert.equal(value.mode, 'systemd');
  assert.equal(value.action, 'exit');
  assert.equal(state.spawned.length, 0);
  state.scheduled[0].fn();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(state.exits, [0]);
});

test('a second restart while one is pending is refused', () => {
  const { service } = makeService();
  service.restart();
  assert.throws(() => service.restart(), err => err.code === 'RESTART_PENDING');
});

test('status carries the marker from the previous restart', () => {
  const { service } = makeService();
  service.restart();
  const status = service.status();
  assert.equal(status.pid, 1234);
  assert.equal(status.mode, 'manual');
  assert.equal(status.lastRestart.fromPid, 1234);
});

test('reload calls HMR inside runExclusive, and reports when HMR is missing', async () => {
  const calls = [];
  const hmr = {
    runExclusive: fn => { calls.push('runExclusive'); return Promise.resolve(fn()); },
    reconcileProfile: () => { calls.push('reconcile'); return { warnings: ['w'] }; },
  };
  const { service } = makeService({ ctx: { get: name => (name === 'hmr' ? hmr : null) } });
  const result = await service.reload();
  assert.deepEqual(calls, ['runExclusive', 'reconcile']);
  assert.deepEqual(result.warnings, ['w']);

  const bare = makeService({ ctx: { get: () => null } }).service;
  await assert.rejects(() => bare.reload(), err => err.code === 'HMR_UNAVAILABLE');
});

test('reload falls back to pluginManager when HMR is absent', async () => {
  const pluginManager = { reload: async () => ({ warnings: ['from-manager'] }) };
  const { service } = makeService({ ctx: { get: name => (name === 'pluginManager' ? pluginManager : null) } });
  const result = await service.reload();
  assert.deepEqual(result.warnings, ['from-manager']);
});
