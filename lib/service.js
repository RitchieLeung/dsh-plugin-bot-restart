/**
 * 「服务」面板背后的动作：读状态、软重载（HMR 重组 profile）、真重启。
 *
 * 全部依赖注入（进程信息、spawn、exit、定时器），所以「点按钮会发生什么」能单测，
 * 不用真去杀一次进程来验证。
 */

import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildRelaunchPlan, describeStatus, portOf, readMarker, supervisorMode } from './restart.js';

function failure(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createRestartService({
  ctx = null,
  markerPath = '',
  logPath = '',
  workerPath = '',
  execPath = process.execPath,
  argv = process.argv,
  cwd = process.cwd(),
  pid = process.pid,
  ppid = process.ppid,
  startedAt = Date.now() - Math.round(process.uptime() * 1000),
  nodeVersion = process.version,
  env = process.env,
  spawnFn = spawn,
  exitFn = code => process.exit(code),
  schedule = (fn, ms) => setTimeout(fn, ms),
  restartDelayMs = 500,
  disposeTimeoutMs = 2500,
} = {}) {
  // 正在重启/重载时挡掉重复点击：两个 restart 同时来会把端口搞成打架。
  let pending = null;

  function status() {
    return describeStatus({
      pid, ppid, argv, cwd, startedAt, nodeVersion,
      mode: supervisorMode(env),
      lastRestart: markerPath ? readMarker(markerPath) : null,
    });
  }

  /** 软重载：让 HMR 按当前磁盘重组成 profile（新装的 link: 插件、改过的 host 代码都会生效）。 */
  async function reload() {
    const hmr = typeof ctx?.get === 'function' ? ctx.get('hmr') : null;
    if (hmr && typeof hmr.runExclusive === 'function' && typeof hmr.reconcileProfile === 'function') {
      const result = await hmr.runExclusive(() => hmr.reconcileProfile());
      return { reloaded: true, ...result };
    }
    const pluginManager = typeof ctx?.get === 'function' ? ctx.get('pluginManager') : null;
    if (pluginManager && typeof pluginManager.reload === 'function') {
      return { reloaded: true, ...(await pluginManager.reload()) };
    }
    throw failure('HMR_UNAVAILABLE', '这台 dsh 没有 HMR，只能重启服务');
  }

  /** 真重启：写标记 → 拉起（或交给 systemd）→ 退出。 */
  function restart({ by = 'panel' } = {}) {
    if (pending) throw failure('RESTART_PENDING', `已经在${pending}了，等它完成`);
    const mode = supervisorMode(env);
    const at = Date.now();
    if (markerPath) {
      try {
        mkdirSync(dirname(markerPath), { recursive: true });
        writeFileSync(markerPath, `${JSON.stringify({ at, fromPid: pid, mode, by }, null, 2)}\n`);
      } catch { /* marker is best effort */ }
    }

    const shutdown = () => {
      // 先尽量优雅收摊（把会话/插件状态落盘），超时就硬退出。
      const disposer = ctx?.root?.scope?.dispose;
      const graceful = typeof disposer === 'function'
        ? Promise.resolve()
          .then(() => disposer.call(ctx.root.scope))
          .catch(() => {})
        : Promise.resolve();
      Promise.race([graceful, sleep(disposeTimeoutMs)]).finally(() => exitFn(0));
    };

    if (mode === 'systemd') {
      pending = '重启';
      schedule(shutdown, restartDelayMs);
      return { ok: true, mode, action: 'exit', pid, logPath, note: 'systemd 托管：退出后由 Restart=always 拉回来' };
    }

    const plan = buildRelaunchPlan({ execPath, argv, cwd, pid, port: portOf(argv), logPath, workerPath, env });
    let child;
    try {
      child = spawnFn(plan.spawn.command, plan.spawn.args, plan.spawn.options);
    } catch (error) {
      pending = null;
      throw failure('RELAUNCH_FAILED', `起重启进程失败：${error.message}`);
    }
    child?.unref?.();
    pending = '重启';
    schedule(shutdown, restartDelayMs);
    return {
      ok: true,
      mode,
      action: plan.action,
      pid,
      workerPid: child?.pid ?? null,
      logPath,
      port: plan.port,
      note: '已安排自我重启，页面会自己重连',
    };
  }

  return { status, restart, reload, paths: { markerPath, logPath } };
}
