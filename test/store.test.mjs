/**
 * Offline assertions for the store model: three scopes, the per-source records that
 * decide which skill folders a scope reads, the validation every MCP record goes
 * through, and the mapping from a record to the plugin config that makes it real.
 *
 * Node built-ins only, run with `npm test`. Project roots are built under .test-tmp/
 * inside this package.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

let assertions = 0
for (const name of ['equal', 'deepEqual', 'ok', 'match', 'notEqual', 'throws']) {
  const original = assert[name]
  assert[name] = (...args) => {
    assertions += 1
    return original(...args)
  }
}

const root = dirname(dirname(fileURLToPath(import.meta.url)))
mkdirSync(join(root, '.test-tmp'), { recursive: true })
const scratch = mkdtempSync(join(root, '.test-tmp', 'store-'))

const {
  DEFAULT_TOOL_TIMEOUT_MS,
  SCOPE_KINDS,
  SERVER_NAME_PATTERN,
  STORE_VERSION,
  TRANSPORTS,
  emptyScope,
  emptySession,
  emptyStore,
  enabledServers,
  ensureRecord,
  hasTemp,
  mcpConfigOf,
  mountKey,
  mountNameOf,
  normalizeScope,
  normalizeServer,
  normalizeServers,
  normalizeSource,
  normalizeStore,
  normalizeTemp,
  projectRootOf,
  recordOf,
  scopeLabel,
  serverConflicts,
  sourceStateOf,
  tempOf,
} = await import(new URL('../lib/store.js', import.meta.url).href)

// ── constants ──────────────────────────────────────────────────────────────

assert.equal(STORE_VERSION, 3)
assert.deepEqual(SCOPE_KINDS, ['global', 'project', 'session'])
assert.deepEqual(TRANSPORTS, ['stdio', 'streamable-http'])
assert.equal(SERVER_NAME_PATTERN.test('my-tools'), true)
assert.equal(SERVER_NAME_PATTERN.test('my_tools2'), true)
assert.equal(SERVER_NAME_PATTERN.test('my tools'), false)
assert.equal(SERVER_NAME_PATTERN.test(''), false)
assert.equal(SERVER_NAME_PATTERN.test('x'.repeat(33)), false)
assert.equal(DEFAULT_TOOL_TIMEOUT_MS, 60000)

assert.equal(mountNameOf('my-tools'), 'my-tools', '本来合法的名字原样挂上去')
assert.equal(mountNameOf('有效中心').startsWith('server-'), true, '全是中文时前缀退成 server')
assert.equal(SERVER_NAME_PATTERN.test(mountNameOf('有效中心')), true)
assert.equal(mountNameOf('有效中心'), mountNameOf('有效中心'), '同一个名字每次都得到同一个挂载名')
assert.notEqual(mountNameOf('有效中心'), mountNameOf('有效中心2'), '不同的中文名不能撞到同一个挂载名')
assert.equal(SERVER_NAME_PATTERN.test(mountNameOf('a'.repeat(33))), true, '超过 32 个字的名字也要能挂上去')
assert.equal(mountNameOf('a'.repeat(33)).length <= 32, true)
assert.equal(mountNameOf('a'.repeat(33)).startsWith('a'.repeat(25)), true, '尽量留住原来的字母')

assert.deepEqual(emptyScope(), { sources: {}, mcpServers: [] })
assert.deepEqual(emptyStore(), {
  version: 3,
  prefs: { sidebarSkills: false, sidebarMcp: false, tabSkills: false, tabMcp: false },
  global: { sources: {}, mcpServers: [] },
  projects: {},
  sessions: {},
})

// ── one server ─────────────────────────────────────────────────────────────

{
  const server = normalizeServer({
    name: 'my-tools',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', 'my-mcp-server', '  ', 7],
    env: { API_KEY: 'k', EMPTY: 1 },
    cwd: '/work/dir',
    toolCallTimeoutMs: 1500,
  })
  assert.equal(server.id, 'my-tools')
  assert.equal(server.enabled, true)
  assert.equal(server.transport, 'stdio')
  assert.deepEqual(server.args, ['-y', 'my-mcp-server'], '空参数与非字符串参数都不留')
  assert.deepEqual(server.env, { API_KEY: 'k' })
  assert.equal(server.cwd, '/work/dir')
  assert.equal(server.toolCallTimeoutMs, 1500)
}

{
  const server = normalizeServer({ name: 'no-timeout', command: 'node' })
  assert.equal(server.toolCallTimeoutMs, DEFAULT_TOOL_TIMEOUT_MS)
  assert.equal(server.transport, 'stdio', '没写连接方式时按本地进程处理')
  assert.equal(server.enabled, true)
  assert.deepEqual(server.args, [])
  assert.deepEqual(server.env, {})
  assert.deepEqual(server.headers, {})
  assert.equal(server.cwd, '')
  assert.equal(server.url, '')
}

assert.throws(() => normalizeServer({}), /服务器名称不能为空/)
assert.throws(() => normalizeServer({ name: '  ' }), /服务器名称不能为空/)
assert.equal(normalizeServer({ name: '有中文', command: 'node' }).name, '有中文', '名称给人看，中文照原样留着')
assert.equal(normalizeServer({ name: 'a'.repeat(33), command: 'node' }).name.length, 33, '名称没有长度上限')
assert.throws(() => normalizeServer({ name: 'stdio-no-command' }), /stdio 服务器必须填写启动命令/)
assert.throws(() => normalizeServer({ name: 'http-no-url', transport: 'streamable-http' }), /HTTP 服务器必须填写 URL/)
assert.throws(() => normalizeServer({ name: 'bad-url', transport: 'streamable-http', url: '不是地址' }), /不是合法地址/)
assert.throws(() => normalizeServer({ name: 'ftp', transport: 'streamable-http', url: 'ftp://example.com/x' }), /必须使用 http 或 https/)
assert.equal(normalizeServer({ name: 'unknown-transport', transport: 'grpc', command: 'node' }).transport, 'stdio', '不认识的连接方式退回本地进程')
assert.equal(normalizeServer({ name: 'off', command: 'node', enabled: false }).enabled, false)
assert.equal(normalizeServer({ name: 'kept-id', id: 'custom-id', command: 'node' }).id, 'custom-id')
assert.equal(normalizeServer({ name: 'my_tools2', command: 'node' }).id, 'my_tools2', '没写 id 时用名字当 id')
assert.equal(SERVER_NAME_PATTERN.test(normalizeServer({ name: '有效中心', command: 'node' }).id), true, '中文名也要能生成一个能放进地址的 id')
assert.notEqual(normalizeServer({ name: '有效中心', command: 'node' }).id, normalizeServer({ name: '有效中心2', command: 'node' }).id, '不同的中文名不能共用一个 id')
assert.equal(normalizeServer({ name: '有效中心', command: 'node' }).id, normalizeServer({ name: '有效中心', command: 'node' }).id, '同一个名字每次都是同一个 id')

{
  const http = normalizeServer({ name: 'remote', transport: 'streamable-http', url: 'http://127.0.0.1:3000/mcp', headers: { Authorization: 'Bearer x' } })
  assert.equal(http.transport, 'streamable-http')
  assert.equal(http.url, 'http://127.0.0.1:3000/mcp')
  assert.deepEqual(http.headers, { Authorization: 'Bearer x' })
}

// ── server lists ───────────────────────────────────────────────────────────

{
  const list = normalizeServers([
    { name: 'a', command: 'node' },
    { name: 'a', command: 'other' },
    { name: '带空格的名字', command: 'node' },
    { name: '', command: 'node' },
    { name: 'b', command: 'node' },
  ])
  assert.deepEqual(list.map((server) => server.name), ['a', '带空格的名字', 'b'], '同名只留第一个，坏条目直接跳过')
  assert.deepEqual(normalizeServers(undefined), [])
  assert.deepEqual(normalizeServers('不是数组'), [])
}

// ── one source ─────────────────────────────────────────────────────────────

{
  const source = normalizeSource({ enabled: false, dir: '  /custom/skills  ', disabled: ['pdf', '  ', 7, 'pdf'] })
  assert.equal(source.enabled, false)
  assert.equal(source.dir, '/custom/skills', '目录去掉两端空白')
  assert.deepEqual(source.disabled, ['pdf'], '停用名单只留非空字符串，重复的去掉')
}

{
  const source = normalizeSource(undefined)
  assert.equal(source.enabled, null, '没写启用状态时跟随目录表默认值')
  assert.equal(source.dir, '')
  assert.deepEqual(source.disabled, [])
  assert.deepEqual(normalizeSource({ enabled: 'yes' }).enabled, null, '不是布尔值的启用状态不算数')
}

// ── whole store ────────────────────────────────────────────────────────────

{
  const store = normalizeStore({
    global: {
      sources: { dsh: { dir: '  /custom/skills  ', disabled: ['pdf'] }, claude: { enabled: true } },
      mcpServers: [{ name: 'g', command: 'node' }],
    },
    projects: { '/proj/one': { sources: { codex: {} }, mcpServers: [{ name: 'p', command: 'node' }] } },
    sessions: { 'session-a': { mcpServers: [{ name: 's', command: 'node' }] } },
  })
  assert.equal(store.global.sources.dsh.dir, '/custom/skills')
  assert.deepEqual(store.global.sources.dsh.disabled, ['pdf'])
  assert.equal(store.global.sources.claude.enabled, true)
  assert.equal(store.global.mcpServers.length, 1)
  assert.deepEqual(store.projects['/proj/one'].sources.codex, { enabled: null, dir: '', disabled: [], forced: [] })
  assert.equal(store.sessions['session-a'].mcpServers.length, 1)
  assert.deepEqual(store.sessions['session-a'].sources, {})
}

{
  // The v1 record kept one directory per scope; it becomes the DSH source directory.
  const store = normalizeStore({ global: { skillDir: '/old/global' }, sessions: { 'session-a': { skillDir: '/old/session' } } })
  assert.equal(store.global.sources.dsh.dir, '/old/global', '旧记录里的目录迁移成 DSH 来源的目录')
  assert.equal(store.sessions['session-a'].sources.dsh.dir, '/old/session')
  assert.equal(normalizeScope({ skillDir: '   ' }).sources.dsh, undefined, '空目录不写进来源表')
}

assert.deepEqual(normalizeStore(undefined), emptyStore(), '坏输入退回空白记录而不是抛错')
assert.deepEqual(normalizeStore('字符串'), emptyStore())
assert.deepEqual(normalizeStore({ global: { mcpServers: '不是数组' } }).global.mcpServers, [])
assert.deepEqual(normalizeStore({ projects: { '': { sources: {} } } }).projects, {}, '空根目录不进记录')

// ── coming-turn switches and where the manager shows up ────────────────────

assert.deepEqual(emptySession(), {
  sources: {},
  mcpServers: [],
  temp: { offSkills: [], onSkills: [], offServers: [], onServers: [] },
})

{
  assert.deepEqual(normalizeTemp(undefined), { offSkills: [], onSkills: [], offServers: [], onServers: [] })
  assert.deepEqual(normalizeTemp({ offSkills: ['b', 'a', 'a'], onSkills: ['  '], offServers: [7], onServers: ['m'] }), {
    offSkills: ['a', 'b'],
    onSkills: [],
    offServers: [],
    onServers: ['m'],
  }, '四组名字各自去重排序，非字符串丢弃')
  assert.deepEqual(normalizeTemp('字符串'), { offSkills: [], onSkills: [], offServers: [], onServers: [] })
}

{
  const bare = emptySession()
  assert.deepEqual(tempOf(bare), { offSkills: [], onSkills: [], offServers: [], onServers: [] })
  assert.equal(hasTemp(bare), false, '没有临时开关的会话不该被留在记录里')
  assert.equal(hasTemp({ temp: { offSkills: ['pdf'] } }), true)
  assert.deepEqual(tempOf(undefined), { offSkills: [], onSkills: [], offServers: [], onServers: [] })
}

{
  const store = normalizeStore({
    prefs: { sidebarSkills: true, tabMcp: 'yes' },
    sessions: { 'session-a': { temp: { offSkills: ['pdf'], onServers: ['m'] } } },
  })
  assert.deepEqual(store.prefs, { sidebarSkills: true, sidebarMcp: false, tabSkills: false, tabMcp: false }, '只有真正为 true 的开关算打开')
  assert.deepEqual(store.sessions['session-a'].temp, { offSkills: ['pdf'], onSkills: [], offServers: [], onServers: ['m'] })
  assert.equal(normalizeStore({ sessions: { 'session-b': {} } }).sessions['session-b'].temp.offSkills.length, 0, '旧记录补齐临时开关')
}

// ── scope records ──────────────────────────────────────────────────────────

{
  const store = emptyStore()
  assert.equal(recordOf(store, { scope: 'global' }), store.global, '全局记录总是存在')
  assert.equal(recordOf(store, { scope: 'project', projectRoot: '/proj/one' }), undefined, '没配置过的项目没有记录')
  assert.equal(recordOf(store, { scope: 'session', sessionId: 'session-a' }), undefined)
  assert.equal(recordOf(store, { scope: 'project', projectRoot: '' }), undefined, '空根目录没有记录')
  assert.throws(() => recordOf(store, { scope: 'nowhere' }), /未知范围：nowhere/)
}

{
  const store = emptyStore()
  const project = ensureRecord(store, { scope: 'project', projectRoot: '/proj/one' })
  assert.deepEqual(project, emptyScope())
  assert.equal(store.projects['/proj/one'], project, '缺记录时就地补一个')
  assert.equal(ensureRecord(store, { scope: 'project', projectRoot: '/proj/one' }), project, '已经有了就复用')
  const session = ensureRecord(store, { scope: 'session', sessionId: 'session-a' })
  assert.equal(store.sessions['session-a'], session)
  assert.throws(() => ensureRecord(store, { scope: 'project', projectRoot: '' }), /缺少项目根目录/)
  assert.throws(() => ensureRecord(store, { scope: 'session', sessionId: '' }), /缺少会话 ID/)
  assert.throws(() => ensureRecord(store, { scope: 'root' }), /未知范围：root/)
}

{
  const record = ensureRecord(emptyStore(), { scope: 'project', projectRoot: '/proj/one' })
  assert.deepEqual(sourceStateOf(record, 'dsh'), { enabled: null, dir: '', disabled: [], forced: [] }, '没配置的来源给出空状态')
  record.sources.dsh = { enabled: true, dir: '/custom', disabled: ['pdf'], forced: ['archify'] }
  assert.deepEqual(sourceStateOf(record, 'dsh'), { enabled: true, dir: '/custom', disabled: ['pdf'], forced: ['archify'] })
  assert.deepEqual(sourceStateOf(undefined, 'dsh'), { enabled: null, dir: '', disabled: [], forced: [] })
}

// ── project roots ──────────────────────────────────────────────────────────

{
  const projectRoot = join(scratch, 'repo')
  const nested = join(projectRoot, 'packages', 'app', 'src')
  mkdirSync(nested, { recursive: true })
  assert.equal(projectRootOf(nested), nested, '没有 .git 的路径自己就是根')
  writeFileSync(join(projectRoot, '.git'), 'gitdir: elsewhere\n')
  assert.equal(projectRootOf(nested), projectRoot, '找到最近的 .git 祖先')
  assert.equal(projectRootOf(join(scratch, 'no-such-dir')), join(scratch, 'no-such-dir'))
  assert.equal(projectRootOf(''), '')
}

// ── plugin configs ─────────────────────────────────────────────────────────

{
  const stdio = normalizeServer({ name: 'local', command: 'node', args: ['server.js'], env: { A: '1' }, toolCallTimeoutMs: 900 })
  const config = mcpConfigOf(stdio)
  assert.deepEqual(config, {
    serverName: 'local',
    toolCallTimeoutMs: 900,
    failOnStartupError: false,
    transport: 'stdio',
    command: 'node',
    args: ['server.js'],
    env: { A: '1' },
  }, '没有工作目录时连这个键都不出现')
  const withCwd = mcpConfigOf(normalizeServer({ name: 'local2', command: 'node', cwd: '/work' }))
  assert.equal(withCwd.cwd, '/work')
  const http = mcpConfigOf(normalizeServer({ name: 'far', transport: 'streamable-http', url: 'https://example.com/mcp', headers: { X: 'y' } }))
  assert.deepEqual(http, {
    serverName: 'far',
    toolCallTimeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    failOnStartupError: false,
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    headers: { X: 'y' },
  })
}

{
  const servers = [{ name: 'a', enabled: true }, { name: 'b', enabled: false }, { name: 'c' }]
  assert.deepEqual(enabledServers(servers).map((server) => server.name), ['a'], '只有明确启用过的才挂载，缺字段按未启用算')
  assert.deepEqual(enabledServers(undefined), [])
}

// ── conflicts ──────────────────────────────────────────────────────────────

{
  const on = (name) => ({ name, enabled: true })
  assert.deepEqual(serverConflicts({ global: [on('shared')], project: [on('shared')], session: [on('shared')] }), [
    { name: 'shared', scopes: ['global', 'project', 'session'] },
  ])
  assert.deepEqual(serverConflicts({ global: [on('a')], project: [on('b')], session: [on('c')] }), [])
  assert.deepEqual(serverConflicts({ global: [on('a'), { name: 'a', enabled: false }] }), [], '停用的记录不占名字')
  assert.deepEqual(serverConflicts({ global: [], project: [], session: [] }), [])
}

// ── labels ─────────────────────────────────────────────────────────────────

assert.equal(mountKey('mcp', 'session', 'abc:my-tools'), 'mcp:session:abc:my-tools')
assert.equal(mountKey('skill', 'global', '/x'), 'skill:global:/x')
assert.equal(scopeLabel('global'), '全局')
assert.equal(scopeLabel('project', { projectRoot: '/code/app' }), '项目 app')
assert.equal(scopeLabel('session', { sessionId: 'session-1ddd81ab-cd57' }), '这条会话')
assert.equal(scopeLabel('session'), '这条会话')

rmSync(scratch, { recursive: true, force: true })
console.log(`store: ${assertions} assertions passed`)
