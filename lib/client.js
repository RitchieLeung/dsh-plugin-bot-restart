/**
 * Client half of the 「服务」 panel.
 *
 * 三件事：看清这个 dsh 进程是谁、软重载插件（HMR 重组 profile）、真重启服务。
 * 重启后页面自己等新进程回来再刷新，不用人手点。
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-bot-restart',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const CSS = `
.sv-root{display:flex;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;-webkit-font-smoothing:antialiased}
.sv-main{flex:1;min-width:0;display:flex;flex-direction:column;overflow:auto}
.sv-head{display:flex;align-items:center;gap:10px;padding:14px 22px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}
.sv-head-title{font-weight:700;font-size:15px}
.sv-head-note{font-size:12px;color:var(--dsw-alias-state-success-primary);margin-left:auto}
.sv-body{padding:20px 22px 40px;max-width:820px}
.sv-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);padding:16px 18px;margin-bottom:16px}
.sv-pid{display:flex;align-items:baseline;gap:10px;margin-bottom:14px}
.sv-pid-value{font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.sv-pid-label{font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--dsw-alias-label-secondary);text-transform:uppercase}
.sv-pill{font-size:11.5px;font-weight:600;border-radius:999px;padding:2px 10px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}
.sv-pill[data-live="true"]{border-color:transparent;background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);color:var(--dsw-alias-state-success-primary)}
.sv-rows{display:flex;flex-direction:column;gap:8px}
.sv-row{display:flex;gap:14px;font-size:12.5px;line-height:1.55}
.sv-key{width:96px;flex:none;color:var(--dsw-alias-label-secondary)}
.sv-val{min-width:0;word-break:break-all;font-variant-numeric:tabular-nums}
.sv-val code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:1px 5px}
.sv-actions{display:flex;flex-wrap:wrap;gap:9px;align-items:center}
.sv-btn{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);padding:7px 15px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:500;font-family:inherit;transition:filter .1s}
.sv-btn:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.sv-btn:disabled{opacity:.45;cursor:default}
.sv-btn[data-kind="primary"]{border-color:transparent;background:var(--dsw-alias-brand-primary);color:#fff;font-weight:600}
.sv-btn[data-kind="danger"]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent);color:var(--dsw-alias-state-error-primary)}
.sv-btn[data-kind="danger"]:hover{border-color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary)}
.sv-hint{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.7;margin-top:12px}
.sv-note{font-size:12px;line-height:1.6;margin-top:12px;padding:9px 12px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}
.sv-note[data-kind="warn"]{border-color:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);color:var(--dsw-alias-state-warn-primary)}
.sv-note[data-kind="error"]{border-color:color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);color:var(--dsw-alias-state-error-primary)}
.sv-wait{display:flex;align-items:center;gap:12px;padding:16px 18px;border-radius:12px;border:1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 8%, transparent)}
.sv-spin{width:16px;height:16px;flex:none;border-radius:50%;border:2px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 35%, transparent);border-top-color:var(--dsw-alias-state-warn-primary);animation:sv-spin .9s linear infinite}
@keyframes sv-spin{to{transform:rotate(360deg)}}
.sv-wait-title{font-weight:600}
.sv-wait-sub{font-size:12px;color:var(--dsw-alias-label-secondary);margin-top:3px}
.sv-err{border:1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent);border-radius:12px;padding:14px 16px;margin-bottom:16px}
.sv-err-title{color:var(--dsw-alias-state-error-primary);font-weight:700;margin-bottom:6px}
.sv-err-detail{font-size:12px;color:var(--dsw-alias-label-secondary);word-break:break-all;line-height:1.6}
@media (max-width:768px){
.sv-head{padding:12px 14px}
.sv-body{padding:14px 14px 28px;max-width:none}
.sv-card{padding:14px}
.sv-pid{flex-wrap:wrap}
.sv-pid-value{font-size:22px}
.sv-row{flex-direction:column;gap:4px}
.sv-key{width:auto}
.sv-actions{flex-direction:column;align-items:stretch}
.sv-btn{width:100%}
}
`;

    async function call(action, payload) {
      const response = await fetch('/api/bot-restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ action }, payload || {})),
      });
      let json;
      try { json = await response.json(); } catch {
        throw Object.assign(new Error(`接口返回无法解析（HTTP ${response.status}）`), { code: 'BAD_RESPONSE' });
      }
      if (!json || json.ok !== true) {
        throw Object.assign(new Error(json?.error?.message || '未知错误'), { code: json?.error?.code || 'INTERNAL' });
      }
      return json.value;
    }

    function humanUptime(seconds) {
      const total = Math.max(0, Math.round(Number(seconds) || 0));
      if (total < 60) return `${total} 秒`;
      const minutes = Math.floor(total / 60);
      if (minutes < 60) return `${minutes} 分 ${total % 60} 秒`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours} 小时 ${minutes % 60} 分`;
      return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
    }

    function formatTime(ms) {
      if (typeof ms !== 'number') return '';
      try {
        return new Date(ms).toLocaleString('zh-CN', { hour12: false });
      } catch { return ''; }
    }

    function Row({ label, children }) {
      return h('div', { className: 'sv-row' }, h('span', { className: 'sv-key' }, label), h('span', { className: 'sv-val' }, children));
    }

    function Panel() {
      const [status, setStatus] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [busy, setBusy] = React.useState(null); // 'reload' | 'restart' | 'refresh'
      const [note, setNote] = React.useState(null);
      const [waiting, setWaiting] = React.useState(null); // { since, oldPid }
      const [elapsed, setElapsed] = React.useState(0);

      const load = React.useCallback(async () => {
        try {
          const value = await call('status');
          setStatus(value.status);
          setError(null);
          return value.status;
        } catch (caught) {
          setError(caught);
          return null;
        }
      }, []);

      React.useEffect(() => { load(); }, [load]);

      // 重启中：每 1.2 秒问一次，等新 pid 出现就把页面刷回来。
      React.useEffect(() => {
        if (!waiting) return undefined;
        let alive = true;
        let timer = null;
        const tick = async () => {
          const next = await load();
          if (!alive) return;
          if (next && next.pid && next.pid !== waiting.oldPid) {
            setNote('服务已经回来了，正在刷新页面…');
            setTimeout(() => { if (alive) window.location.reload(); }, 700);
            return;
          }
          timer = setTimeout(tick, 1200);
        };
        timer = setTimeout(tick, 1000);
        return () => { alive = false; if (timer) clearTimeout(timer); };
      }, [waiting, load]);

      React.useEffect(() => {
        if (!waiting) { setElapsed(0); return undefined; }
        const timer = setInterval(() => setElapsed(Math.round((Date.now() - waiting.since) / 1000)), 500);
        return () => clearInterval(timer);
      }, [waiting]);

      const doRefresh = async () => {
        setBusy('refresh'); setNote(null);
        try { await load(); setNote('状态已刷新'); } finally { setBusy(null); }
      };

      const doReload = async () => {
        setBusy('reload'); setNote(null); setError(null);
        try {
          const value = await call('reload');
          const warnings = Array.isArray(value?.warnings) ? value.warnings : [];
          const parts = ['已按当前磁盘重组 profile'];
          if (value?.restartReason) parts.push(`有改动需要重启才能生效（${value.restartReason}）`);
          if (value?.pending && value.pending.length) parts.push(`${value.pending.length} 个模块仍是旧代码，需要重启`);
          if (warnings.length) parts.push(warnings.slice(0, 3).join('；'));
          setNote(parts.join(' · '));
          await load();
        } catch (caught) {
          setError(caught);
        } finally { setBusy(null); }
      };

      const doRestart = async () => {
        const oldPid = status?.pid;
        if (!window.confirm('重启会中断正在跑的任务（会话本身不丢，页面会自动重连）。确定重启？')) return;
        setBusy('restart'); setNote(null); setError(null);
        try {
          const value = await call('restart', { by: 'panel' });
          setNote(value?.note || '已安排重启');
          setWaiting({ since: Date.now(), oldPid });
        } catch (caught) {
          setError(caught);
        } finally { setBusy(null); }
      };

      const canRestart = Boolean(status) && !waiting;
      return h('div', { className: 'sv-root' }, h('div', { className: 'sv-main' },
        h('div', { className: 'sv-head' },
          h('span', { className: 'sv-head-title' }, '服务'),
          status ? h('span', { className: 'sv-pill', 'data-live': String(!waiting) }, waiting ? '重启中' : '运行中') : null,
          note ? h('span', { className: 'sv-head-note' }, note) : null),
        h('div', { className: 'sv-body' },
          error ? h('div', { className: 'sv-err' },
            h('div', { className: 'sv-err-title' }, waiting ? '服务正在重启（连不上是正常的）' : '操作失败'),
            h('div', { className: 'sv-err-detail' }, error.message)) : null,
          waiting ? h('div', { className: 'sv-wait' },
            h('span', { className: 'sv-spin' }),
            h('div', null,
              h('div', { className: 'sv-wait-title' }, `正在重启服务… 已等待 ${elapsed} 秒`),
              h('div', { className: 'sv-wait-sub' }, '新进程起来后这个页面会自动刷新；如果超过 60 秒还没回来，去终端看日志。'))) : null,
          h('div', { className: 'sv-card' },
            h('div', { className: 'sv-pid' },
              h('span', { className: 'sv-pid-label' }, 'PID'),
              h('span', { className: 'sv-pid-value' }, status ? String(status.pid) : '—'),
              status ? h('span', { className: 'sv-pill' }, status.mode === 'systemd' ? 'systemd 托管' : '手动启动') : null,
              status ? h('span', { className: 'sv-pill' }, `已运行 ${humanUptime(status.uptimeSec)}`) : null),
            h('div', { className: 'sv-rows' },
              h(Row, { label: '端口' }, status ? String(status.port) : '—'),
              status && status.publicUrl ? h(Row, { label: '对外地址' }, status.publicUrl) : null,
              h(Row, { label: '工作目录' }, status ? status.cwd : '—'),
              h(Row, { label: '命令行' }, status ? h('code', null, (status.argv || []).join(' ')) : '—'),
              h(Row, { label: 'Node' }, status ? status.nodeVersion : '—'),
              h(Row, { label: '启动于' }, status ? formatTime(status.startedAt) : '—'),
              status && status.lastRestart ? h(Row, { label: '上次重启' },
                `${formatTime(status.lastRestart.at)}（${status.lastRestart.mode === 'systemd' ? 'systemd' : '自我 relaunch'}，旧 pid ${status.lastRestart.fromPid}）`) : null)),
          h('div', { className: 'sv-actions' },
            h('button', { className: 'sv-btn', type: 'button', disabled: busy === 'refresh', onClick: doRefresh }, busy === 'refresh' ? '刷新中…' : '刷新状态'),
            h('button', { className: 'sv-btn', type: 'button', disabled: busy === 'reload' || Boolean(waiting), onClick: doReload }, busy === 'reload' ? '重载中…' : '重载插件（不重启）'),
            h('button', { className: 'sv-btn', 'data-kind': 'danger', type: 'button', disabled: !canRestart || busy === 'restart', onClick: doRestart }, busy === 'restart' ? '提交中…' : '重启服务')),
          h('div', { className: 'sv-hint' },
            '「重载插件」只让 HMR 按当前磁盘重组 profile：link: 插件的 host 改动、刚装好的插件，通常这样就够了，不会断页面。',
            h('br'),
            '「重启服务」才会真的换进程：装了带原生依赖的包、HMR 报「需要重启」、或者进程发飘时用它。日志在 ',
            h('code', null, status?.argv ? '~/.dsh/logs/web.log' : '~/.dsh/logs/web.log'),
            '。'))));
    }

    function Icon({ size }) {
      const s = size || 16;
      return h('svg', { width: s, height: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' },
        h('path', { d: 'M12 3v9' }),
        h('path', { d: 'M6.3 6.3a8 8 0 1 0 11.4 0' }));
    }

    function apply(ctx) {
      const style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      ctx.effect(() => () => style.remove(), 'bot-restart: styles');
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: 'bot-restart', label: () => '服务', order: 50,
      }, Icon));
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main', key: 'bot-restart',
      }, Panel));
    }

    return { inject: ['slots'], apply };
  },
});
