// @ts-nocheck
/**
 * skill-mcp-manager — host half.
 *
 * Model
 * -----
 * Skills come from named SOURCES: the DSH folder, the shared agents folder, and the
 * skill folder of every other coding agent on this machine. A scope decides which of
 * those sources it reads, whether each one is on, and which individual skills are off:
 *
 *     global  — every agent in this DSH installation
 *     project — every agent whose working directory belongs to one project root
 *     session — exactly one live session
 *
 * WHAT THE MODEL SEES is produced by a skill provider this plugin registers itself:
 *
 *   - the global scope registers its provider on the host context (the global layer);
 *   - a project or session scope registers one on `agent.ctx` (that agent's layer), so
 *     its decisions are invisible to every other agent.
 *
 * Inside one layer the provider emits, in source priority order, every skill of an
 * enabled source. A skill the user turned off is emitted as a HIDDEN twin — same name,
 * `modelInvocable` and `userInvocable` false, lower rank — which shadows the copy the
 * shipped provider would otherwise publish without touching a single file on disk.
 *
 * A session can also switch skills and MCP servers off for the coming turn only. Those
 * temporary names are applied exactly like the stored switches, and are dropped as soon
 * as the turn starts closing.
 *
 * MCP servers keep the earlier mechanism: a server record becomes a
 * `@deepseek-ai/dsh-mcp-client` row mounted at the scope's own context, which owns one
 * connection and publishes `mcp__<serverName>__<tool>` into that layer.
 *
 * Every store mutation re-plans: the dynamic children are disposed and rebuilt from the
 * new record. A predictable full re-apply rather than a diff engine whose stale cases
 * nobody would notice until a skill went missing.
 */
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { scopeOf } from '@deepseek-ai/dsh-scope'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'
import Schema from '@deepseek-ai/schemastery'
import { RPC_ENDPOINTS, RPC_SERVICE } from './endpoints.js'
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deleteSkill as deleteSkillDoc,
  listSkills as listSkillsOnDisk,
  locateSkill,
  readSkill as readSkillDoc,
  skillNameProblem,
  skillResources,
  writeSkill as writeSkillDoc,
} from './skills.js'
import {
  emptyStore,
  ensureRecord,
  hasTemp,
  mcpConfigOf,
  normalizeServer,
  normalizeStore,
  normalizeTemp,
  projectRootOf,
  recordOf,
  scopeLabel,
  serverConflicts,
  sourceStateOf,
  STORE_VERSION,
  tempOf,
} from './store.js'
import { catalogOf, resolveSources, SESSION_SOURCE_ID } from './sources.js'
import { planCandidates } from './plan.js'

export const name = 'skill-mcp-manager'

/**
 * Configuration. The defaults live here, the shape is checked when the row loads,
 * and a wrong value fails loudly instead of being ignored.
 */
export const Config = Schema.object({
  /** Where this plugin keeps its store. Empty selects `$DSH_HOME/dsh-skill-mcp-manager/store.json`. */
  storePath: Schema.string().default(''),
  /** Mount the dynamic skill providers and MCP rows. Off leaves the page as a pure editor. */
  mount: Schema.boolean().default(true),
})

export const inject = ['skills', 'tools', 'agents']

const HOME = homedir()
const DSH_HOME = process.env.DSH_HOME ?? join(HOME, '.dsh')
/**
 * Everything this plugin writes lives under one directory of its own. The name is pinned rather than
 * taken from the package: the npm scope is a publishing detail, and a rename must not orphan records.
 */
const DATA_DIR = 'dsh-skill-mcp-manager'
const STATE_DIR = join(DSH_HOME, DATA_DIR)
const STORE_FILE = join(STATE_DIR, 'store.json')
const HEARTBEAT_FILE = join(STATE_DIR, 'state.json')
/** Session skill folders live here unless a session points somewhere else. */
const SESSION_ROOT = join(STATE_DIR, 'sessions')
const SESSION_CACHE_DIR = join(DSH_HOME, 'storages', 'session_projcache', 'sessions')
const MAX_DIR_ENTRIES = 400
/** How long after a connection settles the page keeps re-reading tool names. */
const MCP_SETTLE_MS = 4000
/** The provider name every skill candidate of this plugin carries. */
const SKILL_PROVIDER = 'skill-mcp-manager'

export const PLUGIN_INFO = readPluginInfo()

function readPluginInfo() {
  try {
    const modulePath = fileURLToPath(import.meta.url)
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    return {
      name: typeof manifest.name === 'string' ? manifest.name : 'skill-mcp-manager',
      version: typeof manifest.version === 'string' ? manifest.version : '0.0.0',
      origin: modulePath.split(/[\\/]/u).includes('node_modules') ? 'npm' : 'local',
      modulePath,
    }
  } catch {
    return { name: 'skill-mcp-manager', version: '0.0.0', origin: 'local', modulePath: '' }
  }
}

const errorMessage = (error) => (error instanceof Error ? error.message : String(error))

// ─────────────────────────────────────────────────────────── store

/** Read the store, reporting a file that exists but cannot be used. */
export const loadStore = (storePath) => {
  let text
  try {
    text = readFileSync(storePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { store: emptyStore(), reset: undefined }
    return { store: emptyStore(), reset: { reason: errorMessage(error) } }
  }
  try {
    const parsed = JSON.parse(text)
    return { store: normalizeStore(parsed), reset: undefined }
  } catch (error) {
    return { store: emptyStore(), reset: { reason: `JSON 解析失败：${errorMessage(error)}` } }
  }
}

/** Write one file completely, or leave the previous content untouched. */
export const writeFileDurable = (path, text, mode = 0o600) => {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  const fd = openSync(temporary, 'w', mode)
  try {
    writeFileSync(fd, text)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
  try {
    const directory = openSync(dirname(path), 'r')
    try {
      fsyncSync(directory)
    } finally {
      closeSync(directory)
    }
  } catch {
    /* directory fsync is unavailable on some filesystems */
  }
}

export const persist = (store, storePath) => {
  const next = { ...store, version: STORE_VERSION }
  writeFileDurable(storePath, `${JSON.stringify(next, null, 2)}\n`)
  return next
}

/** The file the model must not rewrite: it holds the records the page edits. */
export const storeGuardReason = (execution, storePath, cwd) => {
  const name = String(execution?.name ?? '')
  if (name !== 'write' && name !== 'edit' && name !== 'multi_edit') return undefined
  const args = execution?.args ?? {}
  const target = typeof args.path === 'string' ? args.path : typeof args.file_path === 'string' ? args.file_path : ''
  if (target === '') return undefined
  const absolute = resolve(cwd ?? process.cwd(), target)
  return absolute === storePath ? `skill 与 MCP 记录 ${storePath} 归设置页管理` : undefined
}

// ─────────────────────────────────────────────────────────── sessions

const headerOf = (agent) => agent?.session?.header ?? agent?.session ?? {}

/** The session id and working directory one agent carries. */
export const subjectOf = (agent) => {
  const header = headerOf(agent)
  const id = typeof header?.id === 'string' && header.id !== '' ? header.id : agent?.id
  const cwd = typeof header?.cwd === 'string' && header.cwd !== '' ? resolve(header.cwd) : undefined
  return { sessionId: typeof id === 'string' ? id : '', cwd }
}

/** One entry of the session picker: which workspace it belongs to and what the conversation is called. */
export const sessionRow = ({ id, title = '', cwd = '', updatedAt = 0, live = false }) => {
  const projectRoot = cwd === '' ? '' : projectRootOf(cwd)
  const workspace = projectRoot === '' ? (cwd === '' ? '' : basename(cwd)) : basename(projectRoot)
  const name = title === '' ? `未命名会话(${id})` : title
  return {
    id,
    title: name,
    workspace,
    label: workspace === '' ? name : `[${workspace}] ${name}`,
    cwd,
    projectRoot,
    updatedAt,
    live,
  }
}

/**
 * Sessions the page can offer: the ones this plugin already manages, the live ones,
 * and the recent ones the host has cached on disk.
 */
export const collectSessions = ({ store, agents = [], cacheDir = SESSION_CACHE_DIR, titleOf }) => {
  const rows = new Map()
  for (const id of Object.keys(store.sessions)) {
    const stored = store.sessions[id]
    rows.set(id, sessionRow({ id, title: typeof stored?.title === 'string' ? stored.title : '' }))
  }
  for (const agent of agents) {
    const { sessionId, cwd } = subjectOf(agent)
    if (sessionId === '') continue
    const title = typeof titleOf === 'function' ? titleOf(agent) : ''
    rows.set(sessionId, { ...sessionRow({ id: sessionId, title, cwd, live: true }), live: true })
  }
  for (const cached of recentSessionFiles(cacheDir)) {
    if (rows.has(cached.id)) continue
    rows.set(cached.id, sessionRow(cached))
  }
  return [...rows.values()].sort((left, right) => {
    if (left.live !== right.live) return left.live ? -1 : 1
    return (right.updatedAt ?? 0) - (left.updatedAt ?? 0)
  })
}

const recentSessionFiles = (cacheDir) => {
  let entries
  try {
    entries = readdirSync(cacheDir, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = join(cacheDir, entry.name)
    try {
      const stat = statSync(path)
      files.push({ path, modified: stat.mtimeMs })
    } catch {
      /* the cache entry vanished */
    }
  }
  files.sort((left, right) => right.modified - left.modified)
  const rows = []
  for (const file of files.slice(0, 100)) {
    try {
      const parsed = JSON.parse(readFileSync(file.path, 'utf8'))
      const header = parsed?.header ?? parsed ?? {}
      const id = typeof header.id === 'string' ? header.id : basename(file.path, '.json')
      if (id === '') continue
      rows.push({
        id,
        title: typeof header.title === 'string' ? header.title : '',
        cwd: typeof header.cwd === 'string' ? resolve(header.cwd) : '',
        updatedAt: file.modified,
      })
    } catch {
      /* an unreadable cache entry is simply not offered */
    }
  }
  return rows
}

/** The project roots the page can offer, newest sources first. */
export const collectProjects = ({ store, sessions = [], cwd = '' }) => {
  const roots = new Map()
  const add = (root, source) => {
    if (typeof root !== 'string' || root === '') return
    if (!roots.has(root)) roots.set(root, { root, sources: [] })
    if (!roots.get(root).sources.includes(source)) roots.get(root).sources.push(source)
  }
  for (const root of Object.keys(store.projects)) add(root, 'store')
  for (const session of sessions) if (session.projectRoot !== '') add(session.projectRoot, 'session')
  if (cwd !== '') add(projectRootOf(cwd), 'cwd')
  return [...roots.values()].sort((left, right) => left.root.localeCompare(right.root))
}

// ─────────────────────────────────────────────────────────── directory picker

/** One level of directories, so the page can pick a skill folder without typing it. */
export const listDirectory = (path) => {
  const target = resolve(typeof path === 'string' && path.trim() !== '' ? path.trim() : DSH_HOME)
  let entries = []
  let error = ''
  try {
    const stat = statSync(target)
    if (!stat.isDirectory()) error = `${target} 不是目录`
    else {
      entries = readdirSync(target, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .map((entry) => ({ name: entry.name, path: join(target, entry.name) }))
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, MAX_DIR_ENTRIES)
    }
  } catch (caught) {
    error = caught?.code === 'ENOENT' ? '目录不存在' : errorMessage(caught)
  }
  return {
    path: target,
    parent: dirname(target) === target ? '' : dirname(target),
    entries,
    error,
  }
}

// ─────────────────────────────────────────────────────────── remote markers

const MARKER_INITIALIZERS = []
/** Attach `@Remote` markers without decorator syntax. */
const markRemote = (target, methods) => {
  for (const method of methods) {
    Remote(target.prototype[method], {
      kind: 'method',
      name: method,
      static: false,
      private: false,
      addInitializer: (initializer) => MARKER_INITIALIZERS.push(initializer),
    })
  }
}

class SkillMcpManagerService extends TypertRemoteService {
  constructor(ctx, runtime) {
    super(ctx, RPC_SERVICE)
    for (const initializer of MARKER_INITIALIZERS) initializer.call(this)
    this.runtime = runtime
  }

  snapshot() {
    return settled(() => this.runtime.view())
  }

  refreshSkills() {
    return settled(() => this.runtime.refreshSkills())
  }

  saveSource(input) {
    return settled(() => this.runtime.saveSource(input))
  }

  addSource(input) {
    return settled(() => this.runtime.addSource(input))
  }

  removeSource(input) {
    return settled(() => this.runtime.removeSource(input))
  }

  toggleSkills(input) {
    return settled(() => this.runtime.toggleSkills(input))
  }

  saveServers(input) {
    return settled(() => this.runtime.saveServers(input))
  }

  savePrefs(input) {
    return settled(() => this.runtime.savePrefs(input))
  }

  setTemp(input) {
    return settled(() => this.runtime.setTemp(input))
  }

  composerState(input) {
    return settled(() => this.runtime.composerState(input))
  }

  deleteScope(input) {
    return settled(() => this.runtime.deleteScope(input))
  }

  listSkills(input) {
    return settled(() => this.runtime.skills(input))
  }

  readSkill(input) {
    return settled(() => this.runtime.readSkill(input))
  }

  saveSkill(input) {
    return settled(() => this.runtime.saveSkill(input))
  }

  deleteSkill(input) {
    return settled(() => this.runtime.deleteSkill(input))
  }

  skillCatalog(input) {
    return settled(() => this.runtime.skillCatalog(input))
  }

  mcpStatus() {
    return settled(() => this.runtime.mcpStatus())
  }

  listSessions() {
    return settled(() => this.runtime.sessions())
  }

  listProjects() {
    return settled(() => this.runtime.projects())
  }

  listDir(input) {
    return settled(() => this.runtime.listDir(input))
  }
}

/** Every remote answer is data: a thrown error would be lost on the way to the browser. */
const settled = async (run) => {
  try {
    return await run()
  } catch (error) {
    return { error: errorMessage(error) }
  }
}

markRemote(SkillMcpManagerService, [...RPC_ENDPOINTS])

// ─────────────────────────────────────────────────────────── plugin

export function apply(ctx, config = {}) {
  const logger = ctx.logger ?? console
  const warn = (message, error) => logger.warn?.(`[skill-mcp-manager] ${message}${error === undefined ? '' : `：${errorMessage(error)}`}`)
  const info = (message) => logger.info?.(`[skill-mcp-manager] ${message}`)

  const storePath = typeof config?.storePath === 'string' && config.storePath !== ''
    ? resolve(config.storePath)
    : STORE_FILE
  const mountEnabled = config?.mount !== false
  try {
    mkdirSync(dirname(storePath), { recursive: true })
  } catch (error) {
    warn(`无法创建 ${dirname(storePath)}`, error)
  }

  let loaded = loadStore(storePath)
  let store = loaded.store
  let resetNote = loaded.reset
  let storeStamp = stampOf()

  function stampOf() {
    try {
      const stat = statSync(storePath, { bigint: true })
      return `${stat.mtimeNs}:${stat.size}`
    } catch {
      return 'missing'
    }
  }

  const reload = () => {
    const stamp = stampOf()
    if (stamp !== storeStamp) {
      loaded = loadStore(storePath)
      store = loaded.store
      resetNote = loaded.reset
      storeStamp = stamp
    }
    return store
  }

  const currentStore = () => (storeStamp === stampOf() ? store : reload())

  /** The one path through which the in-memory store changes. */
  const commit = (next) => {
    const normalized = normalizeStore(next)
    pruneEmpty(normalized)
    store = persist(normalized, storePath)
    storeStamp = stampOf()
    resetNote = undefined
    replan()
    return store
  }

  /** A source row nobody configured: no switch touched, no directory, no hidden skill. */
  const pristine = (state) => state.enabled === null && state.dir === '' && state.disabled.length === 0 && (state.forced ?? []).length === 0

  /** A project or session that keeps nothing is removed instead of leaving an empty card. */
  const pruneEmpty = (next) => {
    const empty = (record) => record.mcpServers.length === 0 && Object.values(record.sources).every(pristine)
    for (const [root, record] of Object.entries(next.projects)) {
      if (empty(record)) delete next.projects[root]
    }
    for (const [id, record] of Object.entries(next.sessions)) {
      if (empty(record) && !hasTemp(record)) delete next.sessions[id]
    }
  }

  const editable = () => JSON.parse(JSON.stringify(currentStore()))

  // ── live agents
  const agentIndex = new Map()

  const liveAgents = () => {
    try {
      return ctx.get('agents')?.list?.() ?? []
    } catch {
      return []
    }
  }

  const sessionIndexFor = () => {
    const rows = new Map()
    for (const agent of liveAgents()) {
      const { sessionId, cwd } = subjectOf(agent)
      if (sessionId === '') continue
      rows.set(sessionId, { agent, sessionId, cwd: cwd ?? '', projectRoot: cwd === undefined ? '' : projectRootOf(cwd) })
    }
    return rows
  }

  // ── scope arguments

  /** The scope one request addresses, with the identity that scope needs. */
  const scopeArgsOf = (input) => {
    const scope = input?.scope
    if (scope !== 'global' && scope !== 'project' && scope !== 'session') {
      throw new Error(`缺少范围：scope 必须是 global、project、session 之一，收到 ${JSON.stringify(scope ?? null)}`)
    }
    if (scope === 'global') return { scope, projectRoot: '', sessionId: '' }
    if (scope === 'project') {
      const root = String(input?.root ?? '').trim()
      if (root === '') throw new Error('缺少项目根目录')
      return { scope, projectRoot: resolve(root), sessionId: '' }
    }
    const id = String(input?.sessionId ?? '')
    if (id === '') throw new Error('缺少会话 ID')
    return { scope, projectRoot: '', sessionId: id }
  }

  const listArgsOf = (input) => scopeArgsOf(input)

  const sourceOptionsOf = (target) => ({
    scope: target.scope,
    projectRoot: target.projectRoot,
    sessionId: target.sessionId,
    sessionRoot: SESSION_ROOT,
    home: HOME,
    env: process.env,
  })

  const sourcesOf = (target) => resolveSources(recordOf(currentStore(), target), sourceOptionsOf(target))

  /** 这个来源此刻是不是整组开着：只有「整组关掉」的默认值才算关，单独开过的技能另外记。 */
  const enabledOf = (store, key, target) => {
    const found = resolveSources(recordOf(store, target), sourceOptionsOf(target)).find((source) => source.key === key)
    if (found === undefined) throw new Error(`没有名为「${key}」的技能来源`)
    return found.enabled
  }

  const requireSource = (target, key) => {
    const found = sourcesOf(target).find((source) => source.key === key)
    if (found === undefined) {
      throw new Error(`${scopeLabel(target.scope, target)}里没有名为「${key}」的技能来源`)
    }
    return found
  }

  // ── dynamic mounts
  /** Mounted children by identity, so a re-plan can dispose exactly what it built. */
  const mounts = new Map()
  const mountErrors = new Map()

  const registerMount = (key, label, kind, scope, fiber, extra = {}) => {
    const mount = { key, label, kind, scope, fiber, at: Date.now(), ...extra }
    mounts.set(key, mount)
    mountErrors.delete(key)
    Promise.resolve()
      .then(() => fiber.await())
      .then(() => {
        mount.settledAt = Date.now()
        if (fiber.state === 3) mountErrors.set(key, '插件启动失败')
      }, (error) => {
        mount.settledAt = Date.now()
        mountErrors.set(key, errorMessage(error))
        warn(`${label} 启动失败`, error)
      })
    return fiber
  }

  /** A skill provider row: registered synchronously, so it is live before this returns. */
  const registerProviderRow = (key, label, scope, control, dispose, extra = {}) => {
    mounts.set(key, { key, label, kind: 'skills', scope, control, dispose, at: Date.now(), settledAt: Date.now(), ...extra })
    mountErrors.delete(key)
  }

  const disposeMounts = (filter = () => true) => {
    for (const [key, mount] of [...mounts]) {
      if (!filter(mount)) continue
      mounts.delete(key)
      try {
        const closed = mount.dispose !== undefined ? mount.dispose() : mount.fiber.dispose()
        Promise.resolve(closed).catch((error) => warn(`卸载 ${mount.label} 失败`, error))
      } catch (error) {
        warn(`卸载 ${mount.label} 失败`, error)
      }
    }
  }

  const mountMcpServer = (targetCtx, server, key, label, meta = {}) => {
    try {
      const fiber = targetCtx.plugin(McpClient, mcpConfigOf(server))
      registerMount(key, label, 'mcp', meta.scope ?? 'server', fiber, { serverName: server.name, mountName: mcpConfigOf(server).serverName, sessionId: meta.sessionId ?? '' })
    } catch (error) {
      mountErrors.set(key, errorMessage(error))
      warn(`挂载 MCP 服务器 ${server.name} 失败`, error)
    }
  }

  // ── skill candidates

  const safeList = (dir) => {
    try {
      return listSkillsOnDisk(dir)
    } catch (error) {
      warn(`无法读取技能目录 ${dir}`, error)
      return []
    }
  }

  /**
   * One scope's ordered sources, each with the skills on disk. The caller layers these
   * groups in priority order: a session's own folder, then its project's, or the global
   * catalog for the host layer.
   */
  const groupsOf = (entries) => entries.map(({ record, options }) => ({
    sources: resolveSources(record, options).map((source) => ({
      source,
      skills: source.exists ? safeList(source.dir) : [],
    })),
  }))

  /**
   * The coming-turn switches of one session ride on top of the stored ones: a skill
   * checked off in the composer joins every source's hidden list, and one checked on
   * leaves it, which is exactly how a stored switch takes a skill away from the model.
   */
  /**
   * The switches of the coming turn ride on top of the record.
   *
   * A switch belongs to the session, so it outranks both the project and the global
   * record: taking a name off hides it here even when a closer record enables it, and
   * putting a name back shows it here even when every record has it switched off.
   */
  const withTemp = (groups, temp) => {
    if (temp.offSkills.length === 0 && temp.onSkills.length === 0) return groups
    const off = new Set(temp.offSkills)
    const on = new Set(temp.onSkills)
    return groups.map((group) => ({
      sources: group.sources.map((entry) => ({
        source: {
          ...entry.source,
          disabled: [...new Set([...entry.source.disabled.filter((name) => !on.has(name)), ...off])].sort(),
          forced: [...on].sort(),
        },
        skills: entry.skills,
      })),
    }))
  }

  /** True when this server should answer in the coming turn of that session. */
  const serverWanted = (server, temp) => {
    if (temp.onServers.includes(server.name)) return true
    return server.enabled && !temp.offServers.includes(server.name)
  }

  const providerOf = (groupsFor) => ({
    name: SKILL_PROVIDER,
    async list() {
      return planCandidates(groupsFor(), SKILL_PROVIDER)
    },    async get(candidate) {
      const locator = candidate?.locator ?? {}
      if (locator.hidden === true || typeof locator.root !== 'string') return undefined
      const skill = readSkillDoc(locator.root, candidate.name)
      if (skill === undefined) return undefined
      return {
        name: skill.name,
        description: skill.description,
        ...(skill.whenToUse === '' ? {} : { whenToUse: skill.whenToUse }),
        invocation: { modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable },
        source: candidate.source,
        provider: SKILL_PROVIDER,
        resourceBase: { kind: 'directory', path: locator.root },
        path: skill.path,
        content: skill.content,
      }
    },
  })

  /**
   * Register the provider for one agent layer.
   *
   * An agent context does not resolve the registry on its own, so the provider is
   * installed from a context that asks for it. That child context keeps the agent's
   * scope tag, which is what puts the provider in the agent's own layer, and its fiber
   * is what takes the provider away again when the session ends.
   */
  const registerSkillProvider = (targetCtx, key, label, scope, groupsFor, extra = {}) => {
    let control = { invalidate: () => {} }
    const holders = { fiber: undefined }
    try {
      holders.fiber = targetCtx.inject(['skills'], (scoped) => {
        scoped.skills.registerProvider((given) => {
          control = given
          return providerOf(groupsFor)
        })
      })
      registerProviderRow(key, label, scope, () => control, () => holders.fiber?.dispose(), extra)
    } catch (error) {
      mountErrors.set(key, errorMessage(error))
      warn(`${label} 注册失败`, error)
    }
  }

  /** Rebuild every dynamic child from the current store. */
  const replan = () => {
    if (!mountEnabled) return
    disposeMounts()
    const current = currentStore()
    const sessions = sessionIndexFor()

    for (const row of sessions.values()) {
      attachAgent(row.agent, row)
    }
    for (const [sessionId, agent] of agentIndex) {
      if (sessions.has(sessionId)) continue
      agentIndex.delete(sessionId)
      if (agent?.ctx !== undefined) disposeMounts((mount) => mount.key.includes(`:${sessionId}`))
    }
  }

  /**
   * Mount one agent's project- and session-scoped children on ITS context. Anything
   * registered here is invisible to every other agent, which is the whole mechanism.
   */
  const attachAgent = (agent, row = undefined) => {
    if (!mountEnabled || agent?.ctx === undefined) return
    const { sessionId, cwd } = subjectOf(agent)
    if (sessionId === '') return
    const projectRoot = row?.projectRoot ?? (cwd === undefined ? '' : projectRootOf(cwd))
    const current = currentStore()
    const scopeKey = safeScopeOf(agent.ctx)
    agentIndex.set(sessionId, agent)
    // Mount rows are read by a person, so they carry the conversation's own name
    // rather than an id.
    const who = row?.label !== undefined && row.label !== '' ? row.label : sessionRow({ id: sessionId, title: titleOf(agent), cwd: cwd ?? '' }).label

    // All three scopes publish into the agent's own layer: the shipped folder readers
    // register there too, so a folder or skill switched off here has to answer in the
    // same layer to take the name away, and the session folder is read first so its
    // skill wins over the project and global skills that share the name.
    registerSkillProvider(
      agent.ctx,
      `skills:agent:${sessionId}`,
      who,
      'agent',
      () => withTemp(groupsOf([
        { record: currentStore().sessions[sessionId], options: { scope: 'session', projectRoot: '', sessionId, sessionRoot: SESSION_ROOT, home: HOME, env: process.env } },
        ...(projectRoot === '' ? [] : [{ record: currentStore().projects[projectRoot], options: { scope: 'project', projectRoot, sessionId: '', sessionRoot: SESSION_ROOT, home: HOME, env: process.env } }]),
        { record: currentStore().global, options: { scope: 'global', projectRoot: '', sessionId: '', sessionRoot: SESSION_ROOT, home: HOME, env: process.env } },
      ]), tempOf(currentStore().sessions[sessionId])),
      { providerName: SKILL_PROVIDER, sessionId, projectRoot },
    )

    // MCP servers mount on the agent's own context as well: a server switched off for
    // the coming turn has to stop answering in that session alone. A name is claimed by
    // the closest scope that defines it, so a session server shadows the project one.
    const temp = tempOf(current.sessions[sessionId])
    const claimed = new Set()
    const layers = [
      { scope: 'session', prefix: `mcp:session:${sessionId}`, label: (name) => `${name} · ${who}`, servers: current.sessions[sessionId]?.mcpServers ?? [] },
      ...(projectRoot === ''
        ? []
        : [{ scope: 'project', prefix: `mcp:project:${projectRoot}`, label: (name) => `${name} · ${basename(projectRoot) || projectRoot}`, servers: current.projects[projectRoot]?.mcpServers ?? [] }]),
      { scope: 'global', prefix: 'mcp:global', label: (name) => name, servers: current.global.mcpServers },
    ]
    for (const layer of layers) {
      for (const server of layer.servers) {
        if (claimed.has(server.name)) continue
        claimed.add(server.name)
        if (!serverWanted(server, temp)) continue
        mountMcpServer(agent.ctx, server, `${layer.prefix}:${server.name}@${sessionId}`, layer.label(server.name), { scope: layer.scope, sessionId })
      }
    }
    if (scopeKey !== undefined) scopeKeys.set(sessionId, scopeKey)
  }

  const scopeKeys = new Map()

  const safeScopeOf = (context) => {
    try {
      return scopeOf(context)
    } catch {
      return undefined
    }
  }

  // ── reflection
  const toolNamesFor = (mountName, sessionId = '') => {
    try {
      const scopeKey = sessionId === '' ? undefined : scopeKeys.get(sessionId)
      const schemas = ctx.tools?.schemas?.(scopeKey) ?? []
      const prefix = `mcp__${mountName}__`
      return schemas.filter((schema) => typeof schema?.name === 'string' && schema.name.startsWith(prefix)).map((schema) => schema.name)
    } catch {
      return []
    }
  }

  const toolNamesOfSessions = (serverName, sessionIds) => {
    const names = new Set()
    for (const sessionId of sessionIds) {
      for (const name of toolNamesFor(serverName, sessionId)) names.add(name)
    }
    return [...names].sort()
  }

  /**
   * True while a child is still coming up, or a just-connected MCP server has not
   * published its tools yet. The page keeps asking until this turns false.
   */
  const mountsPending = () => {
    const now = Date.now()
    return [...mounts.values()].some((mount) => {
      if (mount.settledAt === undefined) return true
      return mount.kind === 'mcp' && now - mount.settledAt < MCP_SETTLE_MS
    })
  }

  /** Every provider registration, so a manual refresh can drop their caches. */
  const refreshProviders = () => {
    let count = 0
    for (const mount of mounts.values()) {
      if (mount.kind !== 'skills') continue
      try {
        mount.control?.()?.invalidate?.()
        count += 1
      } catch (error) {
        warn(`刷新 ${mount.label} 失败`, error)
      }
    }
    return count
  }

  // ── scope views

  /**
   * One scope's sources with the skills on disk. `kept` names the source that keeps a
   * disabled skill visible, which happens when the same name is enabled elsewhere in
   * the scope; the registry resolves a name once per layer, not per source.
   */
  const sourceRowsOf = (target) => {
    const sources = sourcesOf(target)
    const rows = sources.map((source) => ({
      ...source,
      skills: (source.exists ? safeList(source.dir) : []).map((skill) => ({
        ...skill,
        // 来源整组关掉只是一个总开关：单独开启过的技能照样算开着
        enabled: (source.enabled || source.forced.includes(skill.name)) && !source.disabled.includes(skill.name),
        forced: source.forced.includes(skill.name),
      })),
      error: source.exists ? '' : '目录不存在',
    }))
    const enabledNames = new Set()
    for (const row of rows) {
      if (!row.enabled) continue
      for (const skill of row.skills) if (skill.enabled && skill.valid) enabledNames.add(skill.name)
    }
    for (const row of rows) {
      for (const skill of row.skills) {
        if (skill.enabled) continue
        const kept = rows.find((other) => other !== row && other.enabled && other.skills.some((candidate) => candidate.name === skill.name && candidate.enabled))
        if (kept === undefined) continue
        skill.kept = kept.label
      }
    }
    return rows
  }

  const countsOf = (rows) => {
    let skills = 0
    let enabled = 0
    for (const row of rows) {
      for (const skill of row.skills) {
        skills += 1
        if (skill.enabled) enabled += 1
      }
    }
    return { skills, enabled, disabled: skills - enabled, sources: rows.length, activeSources: rows.filter((row) => row.enabled).length }
  }

  const serversOf = (target) => recordOf(currentStore(), target)?.mcpServers ?? []

  const conflictsOf = (target) => {
    const current = currentStore()
    const projectEntry = target.scope === 'project' ? recordOf(current, target) : undefined
    const sessionEntry = target.scope === 'session' ? recordOf(current, target) : undefined
    return serverConflicts({
      global: current.global.mcpServers,
      project: projectEntry?.mcpServers ?? [],
      session: sessionEntry?.mcpServers ?? [],
    })
  }

  const scopeViewOf = (target) => {
    const sources = sourceRowsOf(target)
    return {
      sources,
      counts: countsOf(sources),
      servers: serversOf(target),
      conflicts: conflictsOf(target),
      managed: recordOf(currentStore(), target) !== undefined,
    }
  }

  /**
   * The scopes one scope reads, nearest first: a session reads its own folder, then its
   * project's, then the global ones. This is the order the registry resolves a name in.
   */
  const catalogGroupsOf = (target) => {
    const current = currentStore()
    const options = (scope, projectRoot, sessionId) => ({ scope, projectRoot, sessionId, sessionRoot: SESSION_ROOT, home: HOME, env: process.env })
    if (target.scope === 'global') return [{ record: current.global, options: options('global', '', '') }]
    if (target.scope === 'project') {
      return [
        { record: current.projects[target.projectRoot], options: options('project', target.projectRoot, '') },
        { record: current.global, options: options('global', '', '') },
      ]
    }
    const projectRoot = sessionIndexFor().get(target.sessionId)?.projectRoot ?? ''
    return [
      { record: current.sessions[target.sessionId], options: options('session', '', target.sessionId) },
      ...(projectRoot === '' ? [] : [{ record: current.projects[projectRoot], options: options('project', projectRoot, '') }]),
      { record: current.global, options: options('global', '', '') },
    ]
  }

  /**
   * Every skill name the model would see in this scope, with the nearest one winning.
   * Read from the folders rather than the registry, so a scope without a live session
   * still answers — the registry only knows scopes an agent is open in.
   */
  const catalogOfScope = (target) => {
    const temp = tempOf(currentStore().sessions[target.sessionId] ?? {})
    const namedSeen = new Set()
    const names = []
    for (const { record, options } of catalogGroupsOf(target)) {
      for (const source of resolveSources(record, options)) {
        if (!source.exists) continue
        for (const skill of safeList(source.dir)) {
          if (!skill.valid || namedSeen.has(skill.name)) continue
          namedSeen.add(skill.name)
          // 记录里的状态：整组关着时，单独叫起来过的技能照样算开着
          const storedOn = (source.enabled || source.forced.includes(skill.name)) && !source.disabled.includes(skill.name)
          const off = temp.offSkills.includes(skill.name)
          const forced = temp.onSkills.includes(skill.name)
          const enabled = (storedOn || forced) && off === false
          names.push({
            name: skill.name,
            source: source.id,
            sourceLabel: source.label,
            scope: options.scope,
            dir: source.dir,
            provider: source.hostScanned ? 'filesystem' : SKILL_PROVIDER,
            enabled: enabled && skill.modelInvocable !== false,
            modelInvocable: enabled && skill.modelInvocable !== false,
          })
        }
      }
    }
    return {
      layer: target.scope === 'global' ? 'global' : 'agent',
      names,
      visible: names.filter((row) => row.modelInvocable).length,
    }
  }

  // ── session titles

  /** What the sidebar calls this conversation, straight from the host's own title service. */
  const titleOf = (agent) => {
    try {
      const snapshot = ctx.get('sessionTitle')?.get?.(agent?.session)
      if (snapshot !== null && typeof snapshot === 'object' && typeof snapshot.title === 'string' && snapshot.title !== '') return snapshot.title
    } catch {
      /* the title service is optional */
    }
    const header = headerOf(agent)
    return typeof header?.title === 'string' ? header.title : ''
  }

  // ── runtime surface
  const runtime = {
    view() {
      const current = currentStore()
      const sessions = sessionIndexFor()
      const rows = collectSessions({ store: current, agents: liveAgents(), cacheDir: SESSION_CACHE_DIR, titleOf })

      // Every project the page can select, not only the stored ones: a project that
      // has never been configured still shows the folders its agents read.
      const roots = new Set(Object.keys(current.projects))
      for (const row of sessions.values()) if (row.projectRoot !== '') roots.add(row.projectRoot)
      for (const row of rows) if (row.projectRoot !== '') roots.add(row.projectRoot)

      const projectRows = [...roots].sort().map((root) => ({
        root,
        name: basename(root) || root,
        live: [...sessions.values()].filter((row) => row.projectRoot === root).length,
        ...scopeViewOf({ scope: 'project', projectRoot: root, sessionId: '' }),
      }))

      const sessionRows = rows.map((row) => ({
        ...row,
        temp: tempOf(current.sessions[row.id] ?? {}),
        ...scopeViewOf({ scope: 'session', projectRoot: '', sessionId: row.id }),
      }))

      return {
        version: STORE_VERSION,
        plugin: PLUGIN_INFO,
        storePath,
        prefs: current.prefs,
        health: resetNote === undefined ? { status: 'ok', path: storePath } : { status: 'reset', path: storePath, reason: resetNote.reason },
        defaults: {
          home: HOME,
          dshHome: DSH_HOME,
          sessionRoot: SESSION_ROOT,
          toolCallTimeoutMs: 60000,
        },
        global: scopeViewOf({ scope: 'global', projectRoot: '', sessionId: '' }),
        projects: projectRows,
        projectCandidates: collectProjects({ store: current, sessions: rows })
          .filter((candidate) => !roots.has(candidate.root))
          .map((candidate) => ({
            root: candidate.root,
            name: basename(candidate.root) || candidate.root,
            sources: candidate.sources,
            live: rows.filter((row) => row.projectRoot === candidate.root).length,
          })),
        sessions: sessionRows,
      }
    },

    refreshSkills() {
      return { invalidated: refreshProviders() }
    },

    skills(input) {
      const target = listArgsOf(input)
      const rows = sourceRowsOf(target)
      return {
        scope: target.scope,
        sources: rows,
        counts: countsOf(rows),
      }
    },

    readSkill(input) {
      const target = scopeArgsOf(input)
      const source = requireSource(target, String(input?.source ?? ''))
      const skillName = String(input?.name ?? '')
      const skill = readSkillDoc(source.dir, skillName)
      if (skill === undefined) throw new Error(`「${skillName}」不存在（可能已被删除）`)
      return { ...skill, scope: target.scope, source: source.id, sourceLabel: source.label, dir: source.dir, resources: skillResources(source.dir, skill.name) }
    },

    saveSkill(input) {
      const target = scopeArgsOf(input)
      const source = requireSource(target, String(input?.source ?? ''))
      const record = {
        name: String(input?.name ?? '').trim(),
        description: String(input?.description ?? '').trim(),
        whenToUse: String(input?.whenToUse ?? '').trim(),
        modelInvocable: input?.modelInvocable !== false,
        userInvocable: input?.userInvocable !== false,
        content: typeof input?.content === 'string' ? input.content : '',
      }
      const problem = skillNameProblem(record.name)
      if (problem !== '') throw new Error(problem)
      if (record.description === '') throw new Error('必须填写 description：模型只靠它决定要不要加载这个技能')
      const written = writeSkillDoc(source.dir, record, {
        renameFrom: String(input?.renameFrom ?? ''),
        form: input?.form === 'file' ? 'file' : 'dir',
      })
      info(`wrote skill "${record.name}" to ${written.path}`)
      refreshProviders()
      return runtime.view()
    },

    deleteSkill(input) {
      const target = scopeArgsOf(input)
      const source = requireSource(target, String(input?.source ?? ''))
      const skillName = String(input?.name ?? '')
      const removed = deleteSkillDoc(source.dir, skillName)
      info(`deleted skill "${skillName}" from ${removed.path}`)
      refreshProviders()
      return runtime.view()
    },

    saveSource(input) {
      const target = scopeArgsOf(input)
      const key = String(input?.source ?? '')
      if (key === '') throw new Error('缺少技能来源')
      const next = editable()
      const record = ensureRecord(next, target)
      const state = { ...sourceStateOf(record, key) }
      if (typeof input?.enabled === 'boolean') state.enabled = input.enabled
      if (typeof input?.dir === 'string') {
        const dir = input.dir.trim()
        if (key === SESSION_SOURCE_ID) throw new Error('会话技能目录不能指向别处，请添加一个新的来源')
        if (catalogOf(key) === undefined) throw new Error(`「${key}」是自定义目录，目录就是它的标识，不能改写`)
        state.dir = dir === '' ? '' : resolve(dir)
      }
      record.sources[key] = state
      commit(next)
      return runtime.view()
    },

    addSource(input) {
      const target = scopeArgsOf(input)
      const dir = resolve(String(input?.dir ?? '').trim())
      if (dir === '') throw new Error('缺少目录')
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`${dir} 不是一个存在的目录`)
      const next = editable()
      const record = ensureRecord(next, target)
      if (record.sources[dir] !== undefined) throw new Error(`${dir} 已经在这个范围里了`)
      record.sources[dir] = { enabled: true, dir: '', disabled: [], forced: [] }
      commit(next)
      return runtime.view()
    },

    removeSource(input) {
      const target = scopeArgsOf(input)
      const key = String(input?.source ?? '')
      const next = editable()
      const record = recordOf(next, target)
      if (record === undefined || record.sources[key] === undefined) throw new Error(`没有名为「${key}」的技能来源`)
      delete record.sources[key]
      commit(next)
      return runtime.view()
    },

    toggleSkills(input) {
      const target = scopeArgsOf(input)
      const key = String(input?.source ?? '')
      const names = Array.isArray(input?.names) ? input.names.map((name) => String(name)).filter((name) => name !== '') : []
      const wholeGroup = input?.wholeGroup === true
      if (names.length === 0) throw new Error('缺少技能名称')
      const enabled = input?.enabled !== false
      const next = editable()
      const record = ensureRecord(next, target)
      const state = { ...sourceStateOf(record, key) }
      const groupOn = enabledOf(next, key, target)
      const disabled = new Set(state.disabled)
      const forced = new Set(Array.isArray(state.forced) ? state.forced : [])
      for (const name of names) {
        // 一次把整组技能按同一个状态设置：总开关留给来源卡片，这里不去动它
        if (wholeGroup) {
          if (enabled) disabled.delete(name)
          else disabled.add(name)
          forced.delete(name)
          continue
        }
        if (enabled) {
          disabled.delete(name)
          // 来源整组关着，单独叫起来的技能要记下来，否则它还是被总开关压着
          if (!groupOn) forced.add(name)
          else forced.delete(name)
        } else {
          disabled.add(name)
          forced.delete(name)
        }
      }
      state.disabled = [...disabled].sort()
      state.forced = [...forced].sort()
      record.sources[key] = state
      commit(next)
      return runtime.view()
    },

    saveServers(input) {
      const target = scopeArgsOf(input)
      if (!Array.isArray(input?.mcpServers)) throw new Error('缺少 mcpServers')
      const next = editable()
      const record = ensureRecord(next, target)
      record.mcpServers = input.mcpServers.map((server, index) => normalizeServer(server, index))
      commit(next)
      return runtime.view()
    },

    savePrefs(input) {
      const next = editable()
      const prefs = next.prefs ?? {}
      next.prefs = {
        sidebarSkills: input?.sidebarSkills === true ? true : input?.sidebarSkills === false ? false : prefs.sidebarSkills === true,
        sidebarMcp: input?.sidebarMcp === true ? true : input?.sidebarMcp === false ? false : prefs.sidebarMcp === true,
        tabSkills: input?.tabSkills === true ? true : input?.tabSkills === false ? false : prefs.tabSkills === true,
        tabMcp: input?.tabMcp === true ? true : input?.tabMcp === false ? false : prefs.tabMcp === true,
      }
      commit(next)
      return runtime.view()
    },

    /** Change what the coming turn of one session carries, without touching the stored switches. */
    setTemp(input) {
      const sessionId = String(input?.sessionId ?? '')
      if (sessionId === '') throw new Error('缺少会话 ID')
      const next = editable()
      const record = ensureRecord(next, { scope: 'session', projectRoot: '', sessionId })
      record.temp = normalizeTemp({
        offSkills: input?.offSkills ?? [],
        onSkills: input?.onSkills ?? [],
        offServers: input?.offServers ?? [],
        onServers: input?.onServers ?? [],
      })
      commit(next)
      return runtime.view()
    },

    /** What the composer offers for one session: everything it could send, and what it left out. */
    composerState(input) {
      const sessionId = String(input?.sessionId ?? '')
      if (sessionId === '') throw new Error('缺少会话 ID')
      const target = { scope: 'session', projectRoot: '', sessionId }
      const temp = tempOf(currentStore().sessions[sessionId] ?? {})
      const skills = catalogOfScope(target).names.map((row) => {
        const off = temp.offSkills.includes(row.name)
        const forced = temp.onSkills.includes(row.name)
        return { ...row, off, forced, effective: row.enabled === true || forced ? !off : false }
      })
      const servers = []
      const addServers = (scope, serversOfScope) => {
        for (const server of serversOfScope) {
          const off = temp.offServers.includes(server.name)
          const forced = temp.onServers.includes(server.name)
          servers.push({
            name: server.name,
            scope,
            enabled: server.enabled,
            transport: server.transport,
            off,
            forced,
            effective: server.enabled === true || forced ? !off : false,
          })
        }
      }
      const current = currentStore()
      const projectRoot = sessionIndexFor().get(sessionId)?.projectRoot ?? ''
      addServers('session', current.sessions[sessionId]?.mcpServers ?? [])
      addServers('project', projectRoot === '' ? [] : current.projects[projectRoot]?.mcpServers ?? [])
      addServers('global', current.global.mcpServers)
      return { sessionId, skills, servers, temp }
    },

    deleteScope(input) {
      const target = scopeArgsOf(input)
      if (target.scope === 'global') throw new Error('全局范围不能删除，只能逐个移除来源和服务器')
      const next = editable()
      if (target.scope === 'project') delete next.projects[target.projectRoot]
      else delete next.sessions[target.sessionId]
      commit(next)
      return runtime.view()
    },

    skillCatalog(input) {
      const target = scopeArgsOf(input)
      return catalogOfScope(target)
    },

    mcpStatus() {
      const current = currentStore()
      const sessions = sessionIndexFor()
      const rows = []
      const mountFor = (scope, name, sessionIds) => [...mounts.values()].find((mount) => mount.kind === 'mcp'
        && mount.scope === scope
        && mount.serverName === name
        && (sessionIds.length === 0 ? true : sessionIds.includes(mount.sessionId)))
      const push = (scope, server, sessionIds = []) => {
        const mountName = server.mountName ?? server.name
        const tools = sessionIds.length === 0
          ? toolNamesFor(mountName, '')
          : toolNamesOfSessions(mountName, sessionIds)
        const mount = mountFor(scope, server.name, sessionIds)
        rows.push({
          scope,
          sessionId: mount?.sessionId ?? '',
          serverName: server.name,
          mountName,
          id: server.id,
          enabled: server.enabled,
          transport: server.transport,
          tools,
          toolCount: tools.length,
          mounted: mount !== undefined,
          live: sessionIds.length > 0,
          error: mount === undefined ? '' : mountErrors.get(mount.key) ?? '',
        })
      }
      for (const server of current.global.mcpServers) push('global', server, [...sessions.keys()].sort())
      for (const [root, entry] of Object.entries(current.projects)) {
        // A project server lives on the context of each live session inside that project,
        // so its tools are only readable through those sessions' scopes.
        const sessionIds = [...sessions.values()].filter((row) => row.projectRoot === root).map((row) => row.sessionId).sort()
        for (const server of entry.mcpServers) push('project', { ...server, id: `${root}#${server.id}` }, sessionIds)
      }
      for (const [id, entry] of Object.entries(current.sessions)) {
        for (const server of entry.mcpServers) push('session', server, [id])
      }
      return { servers: rows, sessions: [...sessions.keys()], pending: mountsPending() }
    },

    sessions() {
      const current = currentStore()
      return { sessions: collectSessions({ store: current, agents: liveAgents(), cacheDir: SESSION_CACHE_DIR, titleOf }) }
    },

    projects() {
      const current = currentStore()
      const sessions = collectSessions({ store: current, agents: liveAgents(), cacheDir: SESSION_CACHE_DIR, titleOf })
      let cwd = ''
      try {
        cwd = ctx.get('workingDirectory')?.current?.() ?? process.cwd()
      } catch {
        cwd = process.cwd()
      }
      return { projects: collectProjects({ store: current, sessions, cwd }) }
    },

    listDir(input) {
      return listDirectory(input?.path)
    },
  }

  // ── guard the store against the model's own write tools
  ctx.effect(() => ctx.tools.guard((execution) => {
    try {
      let cwd = ''
      try {
        cwd = ctx.get('workingDirectory')?.current?.() ?? process.cwd()
      } catch {
        cwd = process.cwd()
      }
      return storeGuardReason(execution, storePath, cwd)
    } catch {
      return undefined
    }
  }), 'capabilities store guard')

  // ── agent lifecycle: attach project/session children to each agent's own context
  ctx.on('agent/created', function (payload) {
    const agent = payload?.agent ?? this
    if (agent === undefined) return
    try {
      attachAgent(agent)
    } catch (error) {
      warn('无法为该会话挂载能力', error)
    }
  })

  ctx.on('agent/disposed', function (payload) {
    const agent = payload?.agent ?? this
    const { sessionId } = subjectOf(agent)
    if (sessionId === '') return
    agentIndex.delete(sessionId)
    scopeKeys.delete(sessionId)
    disposeMounts((mount) => mount.key.includes(`:${sessionId}`))
  })

  // ── the coming-turn switches last exactly one turn
  ctx.on('agent/turn-stopping', function (payload) {
    const { sessionId } = subjectOf(payload?.agent ?? this)
    if (sessionId === '') return
    if (!hasTemp(currentStore().sessions[sessionId])) return
    const next = editable()
    if (next.sessions[sessionId] === undefined) return
    next.sessions[sessionId].temp = normalizeTemp(undefined)
    commit(next)
  })

  ctx.effect(() => () => {
    disposeMounts()
  }, 'capabilities mounts')

  // ── first plan, then the service, then the heartbeat
  try {
    replan()
  } catch (error) {
    warn('首次挂载失败', error)
  }

  try {
    new SkillMcpManagerService(ctx, runtime)
    info(`remote namespace "${RPC_SERVICE}" registered`)
  } catch (error) {
    warn(`无法注册 ${RPC_SERVICE} 服务`, error)
  }

  try {
    writeFileDurable(HEARTBEAT_FILE, `${JSON.stringify({
      loadedAt: new Date().toISOString(),
      loadedModule: fileURLToPath(import.meta.url),
      pluginVersion: PLUGIN_INFO.version,
      installOrigin: PLUGIN_INFO.origin,
      storePath,
      sessions: SESSION_ROOT,
      mounts: mounts.size,
    }, null, 2)}\n`, 0o600)
  } catch (error) {
    warn('无法写入加载心跳', error)
  }
}
