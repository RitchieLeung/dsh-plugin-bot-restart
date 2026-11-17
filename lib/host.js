/**
 * Host half of the 「服务」 panel.
 *
 * One HTTP route (`/api/bot-restart`) with three actions:
 *   status  — pid/启动方式/运行时长/命令行（面板上展示）
 *   reload  — 软重载：让 HMR 按当前磁盘重组成 profile（Link 插件的 host 改动、新装插件）
 *   restart — 真重启：手动启动的自我 relaunch（relaunch.mjs 等旧 pid 死、端口释放再 exec），
 *             systemd 托管的只退出、交给 Restart=always
 *
 * 刻意不给 Bot 提供 restart 工具：重启会打断正在跑的 turn，这件事该由人点。
 */

import path from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRestartHandler } from './handler.js';
import { createRestartService } from './service.js';

// Cordis 要求先声明才能碰 ctx.connection：少了这行，冷启动时 entry 直接激活失败。
export const inject = ['connection'];

/** 标记文件（记录上次重启）和重启日志的位置。 */
export function restartPaths(config = {}) {
  const home = process.env.DSH_HOME ? path.resolve(process.env.DSH_HOME) : path.join(homedir(), '.dsh');
  return {
    markerPath: config.markerPath || path.join(home, 'bot', 'restart', 'last.json'),
    logPath: config.logPath || path.join(home, 'logs', 'web.log'),
  };
}

export function apply(ctx, config = {}) {
  const { markerPath, logPath } = restartPaths(config);
  const workerPath = config.workerPath || fileURLToPath(new URL('./relaunch.mjs', import.meta.url));
  const service = createRestartService({
    ctx,
    markerPath,
    logPath,
    workerPath,
    ...(config.execPath ? { execPath: config.execPath } : {}),
    ...(config.argv ? { argv: config.argv } : {}),
    ...(config.spawnFn ? { spawnFn: config.spawnFn } : {}),
    ...(config.exitFn ? { exitFn: config.exitFn } : {}),
    ...(config.schedule ? { schedule: config.schedule } : {}),
  });
  const handle = createRestartHandler({ service });

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/bot-restart',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      let result;
      try {
        result = await handle(await request.json());
      } catch (error) {
        result = { ok: false, error: { code: error.code || 'bot-restart/error', message: error.message } };
      }
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
    },
  }), 'bot-restart: HTTP route');
}
