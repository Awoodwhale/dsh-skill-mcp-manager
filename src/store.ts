// @ts-nocheck
/**
 * The store model: three scopes of skills and MCP servers, and the deterministic
 * mapping from a store record to the plugin configs that make it real.
 *
 * No DSH service is touched here, so the offline tests can drive every rule.
 */
import { existsSync, statSync } from 'node:fs'
import { basename, join, resolve, sep } from 'node:path'

export const STORE_VERSION = 3
/** The three places a skill source or an MCP server can be attached. */
export const SCOPE_KINDS = ['global', 'project', 'session']
export const TRANSPORTS = ['stdio', 'streamable-http']
/** Same contract the MCP client enforces: `mcp__<serverName>__<tool>`. */
export const SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u
export const MOUNT_HASH_LENGTH = 6
export const DEFAULT_TOOL_TIMEOUT_MS = 60000

/** FNV-1a over the UTF-16 code units, so the browser half can reproduce it without crypto. */
const hashHex = (text) => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * The name a server mounts under. A person may call a server anything; the host builds
 * tool names as `mcp__<serverName>__<tool>` and only accepts the ASCII grammar, so a name
 * outside it is folded into the allowed characters plus a stable suffix.
 */
export const mountNameOf = (name) => {
  const text = String(name ?? '')
  if (SERVER_NAME_PATTERN.test(text)) return text
  const tail = `-${hashHex(text).slice(0, MOUNT_HASH_LENGTH)}`
  const head = text.replace(/[^A-Za-z0-9_-]/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '')
  const room = 32 - tail.length
  const trimmed = head.slice(0, room).replace(/-$/u, '')
  return `${trimmed === '' ? 'server' : trimmed}${tail}`
}

/** One place a scope reads skills from, plus its MCP servers. */
export const emptyScope = () => ({ sources: {}, mcpServers: [] })

/** A session record also remembers the switches made just for the coming turn. */
export const emptySession = () => ({ ...emptyScope(), temp: { offSkills: [], onSkills: [], offServers: [], onServers: [] } })

/** Where the manager itself shows up: a sidebar entry and a conversation tab, each optional. */
export const emptyPrefs = () => ({ sidebarSkills: false, sidebarMcp: false, tabSkills: false, tabMcp: false })

export const emptyStore = () => ({
  version: STORE_VERSION,
  prefs: emptyPrefs(),
  global: emptyScope(),
  projects: {},
  sessions: {},
})

const asString = (value, fallback = '') => (typeof value === 'string' ? value : fallback)
const asBool = (value, fallback) => (typeof value === 'boolean' ? value : fallback)
const asRecord = (value) => (value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {})

const stringMap = (value) => {
  const source = asRecord(value)
  const out = {}
  for (const [key, entry] of Object.entries(source)) {
    if (typeof key === 'string' && key !== '' && typeof entry === 'string') out[key] = entry
  }
  return out
}

const stringList = (value) => (Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').map((entry) => entry.trim()).filter((entry) => entry !== '') : [])

/**
 * A stable id so the page can address one server record across edits. Names may hold
 * anything, so the id is the mount name plus a short digest of the exact spelling:
 * two names that fold to the same mount name still get distinct ids.
 */
export const serverIdOf = (name, index = 0) => {
  const text = String(name ?? '').trim()
  if (text === '') return `server-${index}`
  const stem = mountNameOf(text)
  return SERVER_NAME_PATTERN.test(text) ? stem : `${stem}-${hashHex(text).slice(0, 4)}`
}

/**
 * Validate and normalise one MCP server record. Anything that would make the client
 * row fail to start is rejected here, with the reason the page shows.
 */
export const normalizeServer = (raw, index = 0) => {
  const source = asRecord(raw)
  const name = asString(source.name).trim()
  if (name === '') throw new Error('服务器名称不能为空')
  const transport = TRANSPORTS.includes(asString(source.transport)) ? source.transport : 'stdio'
  const server = {
    id: asString(source.id).trim() || serverIdOf(name, index),
    name,
    mountName: mountNameOf(name),
    enabled: asBool(source.enabled, true),
    transport,
    command: asString(source.command).trim(),
    args: stringList(source.args),
    env: stringMap(source.env),
    cwd: asString(source.cwd).trim(),
    url: asString(source.url).trim(),
    headers: stringMap(source.headers),
    toolCallTimeoutMs: Number.isFinite(source.toolCallTimeoutMs) && source.toolCallTimeoutMs > 0
      ? Math.trunc(source.toolCallTimeoutMs)
      : DEFAULT_TOOL_TIMEOUT_MS,
  }
  if (transport === 'stdio') {
    if (server.command === '') throw new Error('stdio 服务器必须填写启动命令，例如 npx')
  } else {
    if (server.url === '') throw new Error('HTTP 服务器必须填写 URL')
    let parsed
    try {
      parsed = new URL(server.url)
    } catch {
      throw new Error('HTTP 服务器的 URL 不是合法地址')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('HTTP 服务器的 URL 必须使用 http 或 https')
  }
  return server
}

/** One scope's server list, de-duplicated by name (the client allows one live row per name). */
export const normalizeServers = (raw) => {
  const list = Array.isArray(raw) ? raw : []
  const seen = new Set()
  const out = []
  for (const entry of list) {
    let server
    try {
      server = normalizeServer(entry, out.length)
    } catch {
      continue
    }
    if (seen.has(server.name)) continue
    seen.add(server.name)
    out.push(server)
  }
  return out
}

/** One stored source entry; `enabled: null` means "follow the catalog default". */
export const normalizeSource = (raw) => {
  const source = asRecord(raw)
  return {
    enabled: typeof source.enabled === 'boolean' ? source.enabled : null,
    dir: asString(source.dir).trim(),
    disabled: [...new Set(stringList(source.disabled))],
    forced: [...new Set(stringList(source.forced))],
  }
}

/** Every source entry of one scope, keyed by catalog id or by absolute directory. */
export const normalizeSources = (raw) => {
  const out = {}
  for (const [key, entry] of Object.entries(asRecord(raw))) {
    const trimed = key.trim()
    if (trimed === '') continue
    out[trimed] = normalizeSource(entry)
  }
  return out
}

/** Fill every default so the rest of the code never has to ask whether a field exists. */
export const normalizeScope = (raw) => {
  const record = asRecord(raw)
  const scope = emptyScope()
  scope.sources = normalizeSources(record.sources)
  const legacy = asString(record.skillDir).trim()
  if (legacy !== '') {
    const previous = scope.sources.dsh ?? { enabled: null, dir: '', disabled: [], forced: [] }
    if (previous.dir === '') scope.sources.dsh = { ...previous, dir: legacy }
  }
  scope.mcpServers = normalizeServers(record.mcpServers)
  return scope
}

export const normalizeStore = (raw) => {
  const source = asRecord(raw)
  const store = emptyStore()
  const prefs = asRecord(source.prefs)
  store.prefs = {
    sidebarSkills: asBool(prefs.sidebarSkills, false),
    sidebarMcp: asBool(prefs.sidebarMcp, false),
    tabSkills: asBool(prefs.tabSkills, false),
    tabMcp: asBool(prefs.tabMcp, false),
  }
  store.global = normalizeScope(source.global)
  for (const [root, entry] of Object.entries(asRecord(source.projects))) {
    if (root === '') continue
    store.projects[root] = normalizeScope(entry)
  }
  for (const [id, entry] of Object.entries(asRecord(source.sessions))) {
    if (id === '') continue
    store.sessions[id] = { ...normalizeScope(entry), temp: normalizeTemp(asRecord(entry).temp) }
  }
  return store
}

/** The coming-turn switches of one session: what to leave out, and what to force in. */
export const normalizeTemp = (raw) => ({
  offSkills: [...new Set(stringList(asRecord(raw).offSkills))].sort(),
  onSkills: [...new Set(stringList(asRecord(raw).onSkills))].sort(),
  offServers: [...new Set(stringList(asRecord(raw).offServers))].sort(),
  onServers: [...new Set(stringList(asRecord(raw).onServers))].sort(),
})

/** The temporary switches of one session. */
export const tempOf = (record) => normalizeTemp(record?.temp)

/** True when this session changed something for the coming turn only. */
export const hasTemp = (record) => {
  const temp = tempOf(record)
  return temp.offSkills.length > 0 || temp.onSkills.length > 0 || temp.offServers.length > 0 || temp.onServers.length > 0
}

/** The stored record of one scope, undefined when the scope was never configured. */
export const recordOf = (store, { scope, projectRoot = '', sessionId = '' }) => {
  if (scope === 'global') return store.global
  if (scope === 'project') return projectRoot === '' ? undefined : store.projects[projectRoot]
  if (scope === 'session') return sessionId === '' ? undefined : store.sessions[sessionId]
  throw new Error(`未知范围：${scope}`)
}

/** The stored record of one scope, created in place when it is missing. */
export const ensureRecord = (store, target) => {
  const existing = recordOf(store, target)
  if (existing !== undefined) return existing
  const created = target.scope === 'session' ? emptySession() : emptyScope()
  if (target.scope === 'project') {
    if (target.projectRoot === '') throw new Error('缺少项目根目录')
    store.projects[target.projectRoot] = created
  } else if (target.scope === 'session') {
    if (target.sessionId === '') throw new Error('缺少会话 ID')
    store.sessions[target.sessionId] = created
  } else {
    throw new Error('全局范围的记录不该缺失')
  }
  return created
}

/** One source entry, or the empty state a fresh scope starts from. */
export const sourceStateOf = (record, key) => record?.sources?.[key] ?? { enabled: null, dir: '', disabled: [], forced: [] }

/** The project root a working directory belongs to: the nearest ancestor holding `.git`. */
export const projectRootOf = (cwd, isDirectory = (path) => existsSync(path) && statSync(path).isDirectory()) => {
  if (typeof cwd !== 'string' || cwd === '') return ''
  let current = resolve(cwd)
  const start = current
  for (;;) {
    if (existsSync(join(current, '.git'))) return current
    const parent = resolve(current, '..')
    if (parent === current || parent === sep) break
    current = parent
  }
  return start
}

/** The config object one live MCP client row needs for this record. */
export const mcpConfigOf = (server) => {
  const common = {
    serverName: server.mountName ?? mountNameOf(server.name),
    toolCallTimeoutMs: server.toolCallTimeoutMs,
    failOnStartupError: false,
  }
  if (server.transport === 'stdio') {
    return {
      ...common,
      transport: 'stdio',
      command: server.command,
      args: [...server.args],
      env: { ...server.env },
      ...(server.cwd !== '' ? { cwd: server.cwd } : {}),
    }
  }
  return { ...common, transport: 'streamable-http', url: server.url, headers: { ...server.headers } }
}

/** Only enabled servers become plugin rows; a disabled record stays as a parked definition. */
export const enabledServers = (servers) => (Array.isArray(servers) ? servers.filter((server) => server.enabled) : [])

/**
 * Server names that would land twice in one agent's tool namespace. Global rows are
 * one connection shared by every agent, so a project or session row reusing that name
 * cannot be told apart from it in `mcp__<name>__<tool>`.
 */
export const serverConflicts = ({ global = [], project = [], session = [] }) => {
  const owners = new Map()
  const note = (servers, scope) => {
    for (const server of enabledServers(servers)) {
      if (!owners.has(server.name)) owners.set(server.name, [])
      owners.get(server.name).push(scope)
    }
  }
  note(global, 'global')
  note(project, 'project')
  note(session, 'session')
  const conflicts = []
  for (const [name, scopes] of owners) {
    if (scopes.length > 1) conflicts.push({ name, scopes })
  }
  return conflicts
}

/** The mount identity of one dynamic row, so a re-plan can tell what changed. */
export const mountKey = (kind, scope, detail) => `${kind}:${scope}:${detail}`

/** A short human label for a scope, used in logs and status rows. */
export const scopeLabel = (scope, { projectRoot = '' } = {}) => {
  if (scope === 'global') return '全局'
  if (scope === 'project') return `项目 ${basename(projectRoot) || projectRoot}`
  return '这条会话'
}
