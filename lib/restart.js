/**
 * 重启服务的纯逻辑：判断托管方式、拼自我重启的计划、描述进程状态。
 *
 * 刻意不碰 Cordis、不直接调 process.exit —— 全部依赖注入，所以「点了按钮之后到底会
 * 发生什么」是可以单测的，而不是只能靠真去杀一次进程验证。
 */

import { readFileSync } from 'node:fs';

export const DEFAULT_PORT = 3080;

/**
 * 谁在托管这个进程：
 * - `systemd`：退出就行，Restart=always 会把它拉回来（146 就是这种）。
 * - `manual`：没人管，得先起一个脱离父进程的 worker，等旧进程死掉再 exec 同一条命令（Mac 是这种）。
 *
 * `DSH_RESTART_MODE` 可以强制指定，方便特殊部署。
 */
export function supervisorMode(env = process.env) {
  const forced = typeof env.DSH_RESTART_MODE === 'string' ? env.DSH_RESTART_MODE.trim() : '';
  if (forced === 'systemd' || forced === 'manual') return forced;
  // systemd 给服务的环境里一定有 INVOCATION_ID（新版本还有 JOURNAL_STREAM）。
  if (env.INVOCATION_ID || env.JOURNAL_STREAM || env.NOTIFY_SOCKET) return 'systemd';
  return 'manual';
}

function flagValue(argv, name) {
  const args = (argv || []).map(String);
  for (let index = 0; index < args.length; index += 1) {
    const match = new RegExp(`^--${name}(?:=(.*))?$`).exec(args[index]);
    if (!match) continue;
    const inline = match[1];
    if (inline !== undefined) return inline;
    const next = args[index + 1];
    return next && !next.startsWith('--') ? next : '';
  }
  return undefined;
}

/** `--port`（默认 3080），用来在重启时等端口释放。 */
export function portOf(argv = []) {
  const raw = flagValue(argv, 'port');
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PORT;
}

/** `--public-url`，只在面板上展示。 */
export function publicUrlOf(argv = []) {
  const raw = flagValue(argv, 'public-url');
  return typeof raw === 'string' && raw.trim() ? raw.trim() : '';
}

/**
 * 手动托管的自我重启计划：起一个 detached worker，它等旧 pid 消失、端口释放，
 * 再用同一条命令行 exec 一个新的 dsh，日志追加到 logPath。
 */
export function buildRelaunchPlan({ execPath, argv, cwd, pid, port, logPath, workerPath, env = process.env }) {
  const payload = {
    waitPid: pid,
    command: execPath,
    args: (argv || []).slice(1),
    cwd,
    port,
    logPath,
  };
  return {
    action: 'relaunch',
    logPath,
    port,
    // 这些原样喂给 child_process.spawn
    spawn: {
      command: execPath,
      args: [workerPath, JSON.stringify(payload)],
      options: { cwd, env, detached: true, stdio: 'ignore' },
    },
  };
}

/** 面板上展示的进程状态（不含任何密钥）。 */
export function describeStatus({ pid, ppid, argv = [], cwd = '', startedAt, nodeVersion, now = Date.now(), lastRestart = null, mode }) {
  return {
    pid,
    ppid,
    mode,
    argv,
    cwd,
    nodeVersion,
    startedAt,
    uptimeSec: Math.max(0, Math.round((now - startedAt) / 1000)),
    port: portOf(argv),
    publicUrl: publicUrlOf(argv),
    lastRestart,
  };
}

/** 上次重启的标记文件（写在下线之前，用来告诉面板「这次重启是什么时候发生的」）。 */
export function readMarker(markerPath) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** 人类可读的时长：2 小时 13 分 / 44 秒。 */
export function humanUptime(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  if (total < 60) return `${total} 秒`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} 分 ${total % 60} 秒`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时 ${minutes % 60} 分`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}
