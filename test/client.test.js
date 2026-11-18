import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/**
 * 客户端模块的守门测试。
 *
 * 为什么需要：`lib/client.js` 是浏览器脚本，host 侧只是把文件原样吐给浏览器。
 * 服务器返回 200、http 拉得下来，都**不能**证明它可用——语法错误只有浏览器解析时才
 * 暴露。这个文件曾经因为 return 表达式多了一个 `)`，导致面板从未真正出现过，而当时
 * 20 个测试全绿。
 *
 * 所以这里真的把文件跑一遍：解析 → 捕获 __ModuleLoader__.load 的定义 → 调 factory →
 * 调 apply，确认它会注册侧边栏和主面板两个 slot。
 */

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');

function loadDefinition() {
  let definition = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (d) => { definition = d; } } },
    document: {
      createElement: () => ({ textContent: '', remove() {} }),
      head: { appendChild() {} },
    },
    console,
  };
  vm.runInNewContext(SOURCE, sandbox, { filename: 'lib/client.js' });
  assert.ok(definition, 'client.js 必须调用 window.__ModuleLoader__.load 注册模块');
  return definition;
}

function fakeReact() {
  return {
    createElement: () => null,
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (current) => ({ current }),
  };
}

test('client.js parses and exposes a module definition', () => {
  const definition = loadDefinition();
  assert.equal(definition.id, 'dsh-plugin-bot-restart');
  assert.equal(typeof definition.factory, 'function');
});

test('client.js factory only needs react and returns inject/apply', () => {
  const definition = loadDefinition();
  const asked = [];
  const plugin = definition.factory((name) => {
    asked.push(name);
    assert.equal(name, 'react');
    return fakeReact();
  });
  assert.deepEqual(asked, ['react']);
  assert.ok(Array.isArray(plugin.inject) && plugin.inject.includes('slots'), '必须声明 inject slots');
  assert.equal(typeof plugin.apply, 'function');
});

test('apply registers the sidebar entry and the main panel', () => {
  const definition = loadDefinition();
  const plugin = definition.factory(() => fakeReact());

  const registrations = [];
  const cleanups = [];
  const ctx = {
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      return () => {};
    },
    slots: {
      inject: (_slot, fn) => fn(),
      register: (slot, component) => {
        registrations.push({ slot, component });
        return {};
      },
    },
  };

  plugin.apply(ctx);

  assert.equal(registrations.length, 2, `应注册 2 个 slot，实际 ${registrations.length}`);

  const [sidebar, main] = registrations;
  assert.equal(sidebar.slot.name, 'sidebar.panellist');
  assert.equal(sidebar.slot.id, 'bot-restart');
  assert.equal(typeof sidebar.slot.label, 'function');
  assert.equal(sidebar.slot.label(), '服务');
  assert.equal(main.slot.name, 'main');
  assert.equal(main.slot.key, 'bot-restart');

  for (const entry of registrations) {
    assert.equal(typeof entry.component, 'function', 'slot 组件必须是函数');
  }

  // effect 的清理函数应当可调用（样式会被移除）
  for (const cleanup of cleanups) cleanup();
});

test('Panel renders without throwing when there is no status yet', () => {
  const definition = loadDefinition();
  const react = fakeReact();
  // createElement 返回标记对象，方便确认渲染树非空
  react.createElement = (type, props, ...children) => ({ type, props, children });
  const plugin = definition.factory(() => react);

  let Panel = null;
  plugin.apply({
    effect: (fn) => { fn(); return () => {}; },
    slots: {
      inject: (_slot, fn) => fn(),
      register: (slot, component) => { if (slot.key === 'bot-restart') Panel = component; return {}; },
    },
  });

  assert.ok(Panel, '主面板组件应当被注册');
  const tree = Panel();
  assert.ok(tree, '无 status 时也应当渲染出骨架，而不是抛错/返回空');
});

test('client.js 声明手机断点与响应式布局', () => {
  // 服务面板无侧栏，手机上主要靠断点里的单列布局 + 全宽按钮适配。
  assert.match(SOURCE, /@media\s*\(max-width:\s*768px\)/, '必须有手机断点');
  assert.match(SOURCE, /\.sv-row\{flex-direction:column/, '信息行在手机上要上下堆叠');
  assert.match(SOURCE, /\.sv-btn\{width:100%\}/, '按钮在手机上要占满宽');
});
