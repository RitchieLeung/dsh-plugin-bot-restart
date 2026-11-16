#!/usr/bin/env node
/**
 * 自我重启的 worker：被 restart.js 的 buildRelaunchPlan 以 detached 方式拉起。
 *
 * 职责：
 *   1. 等旧进程（waitPid）真的死掉 —— 端口要等它释放；
 *   2. 等端口空出来（最多 10 秒，防止新进程 bind 失败直接没了）；
 *   3. 用同一条命令行、同一个 cwd/env 起一个新的 dsh，输出追加到日志文件。
 *
 * 它自己必须活过旧进程，所以由父进程 spawn 时带 detached + unref。
 */

import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import net from 'node:net';

const payload = JSON.parse(process.argv[2] || '{}');
const logPath = payload.logPath;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(message) {
  if (!logPath) return;
  try {
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, `[restart ${new Date().toISOString()}] ${message}\n`);
  } catch { /* logging is best effort */ }
}

function alive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function portFree(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(600);
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(true));
  });
}

// 1) 等旧进程下线
for (let tries = 0; tries < 300 && alive(payload.waitPid); tries += 1) await sleep(100);

// 2) 等端口空出来
if (payload.port) {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await portFree(payload.port)) break;
    await sleep(100);
  }
}

if (!payload.command || !Array.isArray(payload.args)) {
  log('缺少 command/args，放弃重启');
  process.exit(1);
}

log(`relaunching pid ${payload.waitPid} → ${payload.command} ${payload.args.join(' ')} (cwd ${payload.cwd})`);
try {
  mkdirSync(dirname(logPath), { recursive: true });
  const fd = openSync(logPath, 'a');
  const child = spawn(payload.command, payload.args, {
    cwd: payload.cwd || process.cwd(),
    env: process.env,
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  log(`spawned pid ${child.pid}`);
} catch (error) {
  log(`spawn failed: ${error.message}`);
  process.exit(1);
}
process.exit(0);
