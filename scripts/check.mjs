#!/usr/bin/env node
/**
 * 零依赖语法检查。
 *
 * 为什么需要：`lib/client.js` 是原样发给浏览器的脚本——服务端不解析、没有构建步骤，
 * 所以一个多余的 `)` 能一路活到线上：HTTP 拉取 200、loader 图里有条目，浏览器一解析
 * 就 SyntaxError，面板永远不出现。这个脚本把那道门补上。
 *
 * 用法：node scripts/check.mjs [目录...]（默认检查仓库根）
 * 退出码：有文件解析失败 = 1
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const SKIP_DIRS = new Set(['node_modules', '.git', 'coverage', '.cache']);
const CHECK_EXT = /\.(js|mjs|cjs)$/;

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      // 嵌套的独立仓库（自带 .git）不归本仓库管——例如 bot-knowledge 里套着的 dscord-fork。
      if (existsSync(join(full, '.git'))) continue;
      walk(full, out);
    } else if (entry.isFile() && CHECK_EXT.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const roots = process.argv.slice(2);
const files = [];
for (const root of roots.length ? roots : ['.']) {
  const abs = join(ROOT, root);
  if (!statSync(abs).isDirectory()) throw new Error(`不是目录：${abs}`);
  walk(abs, files);
}

if (files.length === 0) {
  console.error('✗ 一个 .js/.mjs/.cjs 都没找到——检查路径是不是错了');
  process.exit(1);
}

const failures = [];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures.push({ file, message: (result.stderr || '').trim() });
  }
}

if (failures.length === 0) {
  console.log(`✓ 语法检查通过：${files.length} 个文件`);
  process.exit(0);
}

console.error(`✗ ${failures.length}/${files.length} 个文件解析失败：\n`);
for (const { file, message } of failures) {
  console.error(`── ${relative(ROOT, file)}`);
  console.error(message.split('\n').slice(0, 6).join('\n'));
  console.error();
}
process.exit(1);
