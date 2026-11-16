# dsh-plugin-bot-restart

「服务」面板：看清这个 `dsh web` 进程是谁，**软重载插件**，以及**真的重启服务**。
就是为了不再「杀终端 → 重新敲 `dsh web`」。

## 两种动作，别搞混

| 动作 | 做了什么 | 什么时候用 |
|---|---|---|
| **重载插件（不重启）** | 调 `dsh-hmr` 的 `reconcileProfile()`：按当前磁盘重新组装 profile，停掉并重启变了的 plugin entry | 改了 `link:` 插件的 host 代码、刚 `dsh plugin add` 了新包——**大多数情况够用，页面不断** |
| **重启服务** | 换一个进程：手动启动时自我 relaunch，systemd 托管时退出交给 `Restart=always` | 装了带原生依赖的包、HMR 报「需要重启」、进程发飘、或者你就是想干净启动一次 |

重启后页面会自己等新进程回来（轮询 `/api/bot-restart` 的 pid 变了），然后刷新；
正在跑的 turn 会中断，会话本身不丢。

## 重启怎么实现的

- **手动启动（Mac）**：`lib/relaunch.mjs` 起一个 detached worker → 等旧 pid 死 → 等端口释放
  → 用同一条命令行 + 同一个 cwd/env exec 新的 dsh，输出追加到 `~/.dsh/logs/web.log`
  → 老进程 `process.exit(0)`。
- **systemd 托管（146）**：只 `process.exit(0)`，`Restart=always` 会拉回来。
  托管方式按 `INVOCATION_ID` / `JOURNAL_STREAM` / `NOTIFY_SOCKET` 自动判断，也可以
  `DSH_RESTART_MODE=manual|systemd` 强制。

下线前会写 `~/.dsh/bot/restart/last.json`（时间、旧 pid、托管方式），面板上显示
「上次重启」。

## 给 Bot 的工具

**故意不给**。重启会打断正在跑的 turn，这件事该由人点一次。

## 接口

`POST /api/bot-restart`，三种 action：

```jsonc
{"action":"status"}   // pid/ppid/mode/uptimeSec/port/publicUrl/argv/cwd/lastRestart
{"action":"reload"}   // {reloaded, warnings, restartReason?}
{"action":"restart"}  // {ok, mode, action, pid, workerPid?, logPath}
```

## 测试

```bash
node --test test/*.test.js
```

进程信息、spawn、exit、定时器全部依赖注入，所以「点了按钮会发生什么」是单测出来的，
不用真去杀一次服务。`relaunch.mjs` 单独跑过一次端到端（假旧进程 + `/bin/echo`）。
