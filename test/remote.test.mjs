/**
 * Assertions on the generated artifacts and the two halves' contract with the host:
 * the browser descriptors agree with the endpoint list, the typert manifest names the
 * same service, the host module implements every endpoint, and the client bundle
 * registers itself under the id the patch row expects.
 *
 * Node built-ins only, run with `npm test`.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import YAML from 'yaml'

let assertions = 0
for (const name of ['equal', 'deepEqual', 'ok', 'match', 'notEqual', 'throws']) {
  const original = assert[name]
  assert[name] = (...args) => {
    assertions += 1
    return original(...args)
  }
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const load = (relative) => import(new URL(`../${relative}`, import.meta.url).href)
const text = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')

const endpoints = await load('lib/endpoints.js')
const { RPC_REMOTE } = await load('lib/remote.js')
const { TYPERT } = await load('lib/typert.js')

const { RPC_CHANNEL, RPC_ENDPOINTS, RPC_NO_INPUT, RPC_PACKAGE, RPC_SERVICE } = endpoints

// ── the endpoint list itself ───────────────────────────────────────────────

assert.equal(RPC_PACKAGE, '@awoodwhale/dsh-skill-mcp-manager')
assert.equal(RPC_SERVICE, 'skillMcpManager')
assert.equal(RPC_CHANNEL, '/skill-mcp-manager')
assert.equal(new Set(RPC_ENDPOINTS).size, RPC_ENDPOINTS.length, '端点不能重复')
assert.equal(RPC_ENDPOINTS.length, 20)
for (const name of RPC_NO_INPUT) {
  assert.equal(RPC_ENDPOINTS.includes(name), true, `${name} 在不带输入的清单里，就必须是端点之一`)
}

// ── browser descriptors ────────────────────────────────────────────────────

assert.equal(RPC_REMOTE.package, RPC_PACKAGE)
assert.equal(RPC_REMOTE.descriptors.length, RPC_ENDPOINTS.length)
for (const [index, method] of RPC_ENDPOINTS.entries()) {
  const descriptor = RPC_REMOTE.descriptors[index]
  assert.equal(descriptor.id, `${RPC_PACKAGE}#${RPC_SERVICE}/${method}`)
  assert.equal(descriptor.method, method)
  assert.equal(descriptor.service, RPC_SERVICE)
  assert.equal(descriptor.namespace, RPC_SERVICE)
  assert.equal(descriptor.channel, RPC_CHANNEL)
  assert.equal(descriptor.invocation.kind, 'direct')
  assert.equal(descriptor.result.mode, 'strict', 'codec 只接受 strict 模式')
  assert.equal(typeof descriptor.result.schema.parse, 'function')
  const hasInput = !RPC_NO_INPUT.includes(method)
  assert.equal(descriptor.parameters.length, hasInput ? 1 : 0, `${method} 的参数个数`)
  if (hasInput) {
    assert.equal(descriptor.parameters[0].name, 'input')
    assert.equal(descriptor.parameters[0].source, 'json')
    assert.equal(descriptor.parameters[0].codec.mode, 'strict')
    assert.equal(typeof descriptor.parameters[0].codec.schema.parse, 'function')
    assert.deepEqual(descriptor.parameters[0].codec.schema.parse(undefined), {}, '没有输入时按空对象处理')
    assert.deepEqual(descriptor.parameters[0].codec.schema.parse({ any: 1 }), { any: 1 })
    assert.throws(() => descriptor.parameters[0].codec.schema.parse('字符串'), /input must be an object/)
    assert.throws(() => descriptor.parameters[0].codec.schema.parse([]), /input must be an object/)
  }
}

// ── typert manifest ────────────────────────────────────────────────────────

assert.equal(TYPERT.package, RPC_PACKAGE)
assert.equal(TYPERT.face, 'host')
assert.equal(TYPERT.model.services.length, 1)
{
  const service = TYPERT.model.services[0]
  assert.equal(service.key, RPC_SERVICE)
  assert.equal(service.exportName, RPC_SERVICE)
  assert.equal(service.members.length, RPC_ENDPOINTS.length)
  for (const [index, method] of RPC_ENDPOINTS.entries()) {
    assert.equal(service.members[index].name, method)
    assert.equal(service.members[index].kind, 'method')
    assert.equal(service.members[index].signature.startsWith('('), true)
    assert.equal(service.members[index].signature.endsWith('Promise<unknown>'), true)
  }
}
assert.equal(TYPERT.invocations.length, RPC_ENDPOINTS.length)
for (const [index, method] of RPC_ENDPOINTS.entries()) {
  const invocation = TYPERT.invocations[index]
  assert.equal(invocation.id, `${RPC_PACKAGE}#${RPC_SERVICE}/${method}`)
  assert.equal(invocation.service, RPC_SERVICE)
  assert.equal(invocation.method, method)
  assert.equal(invocation.invocation.kind, 'direct')
  assert.equal(invocation.parameters.length, RPC_NO_INPUT.includes(method) ? 0 : 1)
}

// ── the host half implements every endpoint ────────────────────────────────

{
  const host = text('lib/index.js')
  assert.equal(/export\s*\{[^}]*\bname\b/.test(host) || /const name = /.test(host), true)
  assert.equal(host.includes(`const name = 'skill-mcp-manager'`) || host.includes('const name = "skill-mcp-manager"'), true, '插件名与 patch 行一致')
  for (const method of RPC_ENDPOINTS) {
    assert.equal(new RegExp(`\\b${method}\\s*\\(`).test(host), true, `宿主没有实现 ${method}`)
  }
  assert.equal(host.includes('RPC_SERVICE'), true, '服务名从端点表取，两半才行得一致')
  assert.equal(host.includes("'agent/created'") || host.includes('"agent/created"'), true, '要监听 agent/created 才能给已有会话挂载')
  assert.equal(host.includes('registerProvider'), true, '技能来源自己注册 provider，才能控制目录表里的每个来源')
  assert.equal(host.includes('skills:agent:'), true, '每个会话的技能来源注册在该会话的层上')
  assert.equal(host.includes("inject(['skills']"), true, 'agent 上下文不解析注册表，必须通过 inject 取到它再注册')
  assert.equal(host.includes('includeDefaultRoots'), false, '不再借用 skill-filesystem 挂载，出厂 root 由宿主自己扫描')
  assert.equal(host.includes('缺少范围：scope 必须是'), true, '缺 scope 时必须直接报错，不能静默写到全局目录')
  assert.equal(host.includes('sessionId.slice(0, 8)'), false, '会话标识不能按固定长度截断，否则每条会话都显示成同一个前缀')
  assert.equal(host.includes('shortSessionId'), false, '界面上不再出现会话标识，别名辅助函数也一起去掉')
  assert.equal(host.includes('会话 MCP ${name}（'), false, '挂载行写给人看，标签里不能塞会话标识')
  assert.equal(host.includes("'agent/turn-stopping'") || host.includes('"agent/turn-stopping"'), true, '临时开关要随回合结束清空')
  assert.equal(host.includes('hasTemp'), true, '清空只处理真正带临时开关的会话')
  assert.equal(host.includes('serverWanted'), true, 'MCP 服务器也要能被这一次发送挡掉')
  assert.equal(host.includes('withTemp(groupsOf('), true, '这一次的开关要叠在记录上再交给候选规划器')
  assert.equal(host.includes("'sessionTitle'") || host.includes('"sessionTitle"'), true, '会话列表要用会话标题，只显示标识看不出是哪一条')
}

// ── the browser half registers itself ──────────────────────────────────────

{
  const captured = []
  globalThis.window = {
    __ModuleLoader__: {
      load: (entry) => {
        captured.push(entry)
      },
    },
  }
  await load('lib/client.js')
  assert.equal(captured.length, 1, '客户端只注册一个模块')
  const entry = captured[0]
  assert.equal(entry.id, RPC_PACKAGE, '模块 id 必须是包名，浏览器侧的模块系统按包名找它')
  assert.equal(typeof entry.factory, 'function')
  delete globalThis.window

  const client = text('lib/client.js')
  assert.equal(client.includes("ctx.locale.register(LOCALE_NS, { zh: zhTable, en })"), true, '两种语言的词条要注册到 locale 服务，否则语言一换这里还是旧语言')
  assert.equal(client.includes("ctx.locale.bind(LOCALE_NS)"), true, '取词条要走 locale 服务，跟随界面语言')
  assert.equal(client.includes('localeListeners.add('), true, '语言变化要通知页面重画，否则要点一次刷新才看得到')
  const prefsAt = client.indexOf('let localePrefs')
  assert.equal(prefsAt >= 0 && prefsAt < client.indexOf('ctx.locale.subscribe('), true, 'locale 服务在挂载远程之前就会通知订阅者，订阅回调读的 localePrefs 必须先声明，否则启动时抛 ReferenceError')
  assert.equal(client.includes('settings.section'), true)
  const decoded = client
    .replace(/\\u([0-9a-fA-F]{4})/gu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/gu, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
  assert.equal(decoded.includes('SKILL管理'), true, '设置页标签保留原文（esbuild 会把非 ASCII 写成转义）')
  assert.equal(decoded.includes('MCP管理'), true, '设置页里 skill 与 mcp 是两页')
  assert.equal(client.includes('order: 23') || client.includes('order:23'), true)
  assert.equal(client.includes('skillMcpManager'), true, '客户端取的服务名必须与宿主登记的一致')
  assert.equal(client.includes('acap-root'), true)
  assert.equal(decoded.includes("scope: 'project'") || decoded.includes('scope: "project"'), true, '客户端调用技能端点时必须显式带上 scope')
  assert.equal(decoded.includes("scope: 'session'") || decoded.includes('scope: "session"'), true)
  assert.equal(decoded.includes("scope: 'global'") || decoded.includes('scope: "global"'), true)
  assert.equal(decoded.includes('按名称或目录筛选'), true, '会话列表要能按名字筛选，否则几十条会话里找不到目标')
  assert.equal(client.includes('sidebar.panellist'), true, '侧边栏入口要能插进主页')
  assert.equal(client.includes('conversation.view'), true, '对话页顶部的技能与 MCP 页要能插进 tab')
  assert.equal(client.includes('conversation.input.left'), true, '输入框左下角要有这一次发送的开关')
  assert.equal(decoded.includes('这一次发送带上什么'), true)
  assert.equal(decoded.includes('入口'), true, '可选入口要能在同一个弹窗里开关')
  assert.equal(client.includes('data-embedded'), true, '对话页里的整页要单独排版，不能沿用设置页的边距')
  assert.equal(decoded.includes('只对这一次发送有效'), true, '这一次发送的开关只对这一次发送有效')
  assert.equal(decoded.includes('acap-temp-group-toggle'), true, '这一次发送的清单要按来源分组，看得出技能属于哪个 agent')
  assert.equal(decoded.includes('flipGroup'), true, '每个来源要能一次带走或带回整组技能')
  assert.equal(decoded.includes('?? true'), true, '这一次发送的清单默认全部收起，先给人看分组')
  assert.equal(decoded.includes('shell.overlay'), true, '操作结果要走框架的 toast 浮层，不能挤在页面里')
  assert.equal(decoded.includes('primitives.Toast'), true, '提示要用框架自带的 Toast 组件')
  assert.equal(decoded.includes('AGENT_LOGO'), true, '来源标记要画各家的官方图标，不是字母方块')
  assert.equal(decoded.includes('LOGO_ALIAS'), true, '共用同一套图标的来源要能映射到同一个品牌')
  assert.equal(decoded.includes('workbuddy:"codebuddy"') || decoded.includes('workbuddy: "codebuddy"'), true, 'workbuddy 与 codebuddy 共用同一个图标')
  assert.equal(decoded.includes('agoOf'), true, '没有目录的会话要给出时间，否则一排同名行分不出谁是谁')
  assert.equal(decoded.includes('acap-session-item'), true, '会话选择器按行排版，名称与目录分两行')
  assert.equal(decoded.includes('acap-picker-current'), true, '会话选择器要显示当前选中的那条')
  assert.equal(decoded.includes('acap-zone-head'), true, '对话页里的两页按范围分段，每段自己一个开关条')
  assert.equal(decoded.includes('会话未激活'), true, '没有活动会话时不能把 0 个工具说成连上了但没工具')
  assert.equal(decoded.includes('data-hue'), true, '来源与范围的标签要按色相区分，不能全是一个颜色')
  assert.equal(decoded.includes('hueOf('), true, '颜色按来源标识稳定派生')
  assert.equal(decoded.includes('aria-expanded'), true, '这一次发送的清单要能按来源收起')
  assert.equal(decoded.includes('composer.chip.label'), true, '输入框左下角的按钮要靠图标与提示说明用途，不写 SKILL·MCP 这种缩写')
  assert.equal(decoded.includes('SKILL·MCP'), false, '输入框左下角不再出现 SKILL·MCP 字样')
  assert.equal(decoded.includes('acap-chip-chevron'), true, '输入框左下角的按钮要跟权限按钮一样带箭头')
  assert.equal(decoded.includes('--dsw-alias-label-secondary'), true, '输入框左下角的按钮字色要跟权限按钮一致')
  assert.equal(decoded.includes('plugins.bundle.config'), true, '插件自己的页面要展示显示位置开关，不用先打开设置页')
  assert.equal(decoded.includes('acap-plugin-settings'), true, '插件页面上的开关要有自己的排版')
  assert.equal(decoded.includes('acap-pair-row'), true, '请求头与环境变量要按行填键和值，值里的等号才不会丢')
  assert.equal(decoded.includes('mountNameOf'), true, '名称随便写，挂载名要另外派生')
  assert.equal(decoded.includes('不超过 32 个字符'), false, '名称不该再被 32 个字符限制拦住')
  assert.equal(decoded.includes('这个范围里已经有一台叫'), true, '新加同名服务器要在编辑器里说出来，否则保存后会被静默丢掉')
  // 页面调用的每个远程方法都必须在 host 侧存在，否则会出现「宿主没有提供 …」的 toast
  const called = new Set([...client.matchAll(/(?:this\.(?:run|call)|\.call)\(\s*['"]([A-Za-z]+)['"]/g)].map((match) => match[1]))
  assert.equal(called.size > 10, true, '没有读到页面调用的远程方法')
  for (const method of called) {
    assert.equal(RPC_ENDPOINTS.includes(method), true, `页面调用了 host 没有提供的 ${method}`)
  }
  assert.equal(decoded.includes('session-1ddd81ab'), false, '界面文案里不能出现会话标识')
  assert.equal(decoded.includes('单独开启'), true, '来源里被单独打开的那几个，那一行要看得出来')
  assert.equal(text('lib/index.js').includes('state.forced'), true, '整组关掉后单独开的技能要写进来源记录')
  assert.equal(/^\s*import\s/m.test(client), false, '打包产物里不能留下 import 语句')
}

// ── the package manifest agrees with all of the above ──────────────────────

{
  const manifest = JSON.parse(text('package.json'))
  assert.equal(manifest.name, RPC_PACKAGE)
  assert.equal(manifest.main, 'lib/index.js')
  assert.equal(manifest.exports['.'].default, './lib/index.js')
  assert.equal(manifest.exports['./client'].default, './lib/client.js')
  assert.equal(manifest.exports['./remote'].default, './lib/remote.js')
  assert.equal(manifest.exports['./typert'].default, './lib/typert.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-slots'), true)
  assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-remotes'), true)
  for (const peer of ['@deepseek-ai/dsh-skill', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-agent', '@deepseek-ai/cordis']) {
    assert.equal(typeof manifest.peerDependencies[peer], 'string', `${peer} 要在 peerDependencies 里声明`)
  }
  // 插件装进 profile 之后，profile 的 node_modules 里只有插件自己；这四个包要在运行时
  // 从 dsh 的安装里取，声明成 peer 会让 pnpm 在 profile 里装第二份、并且连带缺更多包。
  for (const borrowed of ['@deepseek-ai/dsh-typert-protocol', '@deepseek-ai/dsh-scope', '@deepseek-ai/dsh-mcp-client', '@deepseek-ai/schemastery']) {
    assert.equal(manifest.peerDependencies[borrowed], undefined, `${borrowed} 不能声明成 peer 依赖`)
  }
  assert.equal(text('lib/index.js').includes('hostModule('), true, '宿主侧的包要用 hostModule 从 dsh 安装里取')
  assert.equal(/from '@deepseek-ai\/dsh-(typert-protocol|scope|mcp-client)'/.test(text('lib/index.js')), false, '产物里不能静态 import 这四个包')
  const patch = text('cordis.patch.yml')
  assert.equal(patch.includes('id: skill-mcp-manager'), true)
  const rows = YAML.parse(patch)
  assert.equal(rows[0].insert[0].name, manifest.name, 'patch 里的 loader 行要用包名')
  // The plugin list draws the package icon from this field; a missing file or an
  // oversized one leaves the page with a blank square.
  assert.equal(manifest.icon, 'assets/icon.svg')
  const icon = text(manifest.icon)
  assert.equal(icon.includes('<svg'), true, '图标要是一份 SVG')
  assert.equal(Buffer.byteLength(icon, 'utf8') <= 256 * 1024, true, '图标不能超过 256 KiB')
  assert.equal(icon.includes('</svg>'), true)
}

// ── the locale files reach the host and the plugin detail page ─────────────

{
  const manifest = JSON.parse(text('package.json'))
  // The host reads <package>/locale/<language>.json to name the plugin in the list,
  // so the directory has to be in the tarball and importable by path.
  assert.equal(manifest.files.includes('locale'), true, 'locale 目录要跟着包发布')
  assert.equal(manifest.files.includes('README_EN.md'), true, '英文说明要跟着包发布')
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  for (const [language, key] of [['zh', 'zh'], ['en', 'en']]) {
    const meta = JSON.parse(text(`locale/${language}.json`)).meta
    assert.equal(meta.title.length > 0, true, `locale/${language}.json 要有 meta.title`)
    assert.equal(meta.description.length > 0, true, `locale/${language}.json 要有 meta.description`)
    // The detail page reads the Markdown this points at; a path outside the package
    // or one that is missing leaves the page with the README instead.
    assert.equal(meta.detail.endsWith('.md'), true, `${key} 的详情要指一份 Markdown`)
    assert.equal(meta.detail.startsWith('docs/'), true, `${key} 的详情要在包内`)
    assert.equal(text(meta.detail).length > 200, true, `${key} 的详情页要有内容`)
    assert.equal(manifest.files.includes(meta.detail), true, `${meta.detail} 要跟着包发布`)
  }
}

console.log(`remote: ${assertions} assertions passed`)
