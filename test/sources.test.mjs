/**
 * Offline assertions for the source table: which agent folders a scope reads, in
 * which order, which rows survive when a folder is missing, and how a stored
 * record turns a row off.
 *
 * Node built-ins only, run with `npm test`. Every directory is created under
 * .test-tmp/ inside this package.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
const scratch = mkdtempSync(join(root, '.test-tmp', 'sources-'))
const home = join(scratch, 'home')
const project = join(scratch, 'project')
const sessionRoot = join(scratch, 'sessions')
mkdirSync(join(home, '.dsh', 'skills'), { recursive: true })
mkdirSync(join(home, '.claude', 'skills'), { recursive: true })
mkdirSync(join(project, '.codex', 'skills'), { recursive: true })
mkdirSync(join(sessionRoot, 'session-a', 'skills'), { recursive: true })
const extra = join(scratch, 'extra-skills')
mkdirSync(extra, { recursive: true })

const {
  SESSION_SOURCE_ID,
  SOURCE_CATALOG,
  catalogOf,
  resolveSources,
  rootDirOf,
  sourceDirOf,
} = await import(new URL('../lib/sources.js', import.meta.url).href)

const options = { home, env: {}, projectRoot: project, sessionId: 'session-a', sessionRoot }
const keysOf = (rows) => rows.map((row) => row.key)

// ── catalog ────────────────────────────────────────────────────────────────

assert.equal(SOURCE_CATALOG.length, 15)
assert.equal(new Set(SOURCE_CATALOG.map((spec) => spec.id)).size, SOURCE_CATALOG.length, '目录表里不会有重复的标识')
assert.equal(catalogOf('claude').label, 'Claude Code')
assert.equal(catalogOf('nothing'), undefined)
assert.equal(SOURCE_CATALOG.filter((spec) => spec.hostScanned).map((spec) => spec.id).join(','), 'dsh,agents', '只有内置读取的两个目录交给宿主扫描')
assert.equal(SOURCE_CATALOG.filter((spec) => spec.enabled).map((spec) => spec.id).join(','), 'dsh,agents', '新装时只默认启用这两个')
assert.equal(SESSION_SOURCE_ID, 'session')

// ── directories ────────────────────────────────────────────────────────────

assert.equal(rootDirOf(catalogOf('dsh'), { home, env: {} }), join(home, '.dsh'))
assert.equal(rootDirOf(catalogOf('dsh'), { home, env: { DSH_HOME: '/elsewhere/dsh' } }), resolve('/elsewhere/dsh'), '环境变量可以搬走 Agent 根目录')
assert.equal(rootDirOf(catalogOf('windsurf'), { home, env: { DSH_HOME: '/elsewhere/dsh' } }), join(home, '.codeium/windsurf'), '没有环境变量的来源只认用户目录')

assert.equal(sourceDirOf(catalogOf('claude'), { ...options, scope: 'global' }), join(home, '.claude', 'skills'))
assert.equal(sourceDirOf(catalogOf('claude'), { ...options, scope: 'project' }), join(project, '.claude', 'skills'))
assert.equal(sourceDirOf(catalogOf('copilot'), { ...options, scope: 'project' }), join(project, '.github', 'skills'))
assert.equal(sourceDirOf(catalogOf('openclaw'), { ...options, scope: 'project' }), '', '只在用户目录出现的来源没有项目目录')
assert.equal(sourceDirOf(catalogOf('claude'), { ...options, scope: 'session' }), '', '会话范围只读会话自己的目录')
assert.equal(sourceDirOf(catalogOf('claude'), { ...options, scope: 'project', projectRoot: '' }), '')

// ── global scope ───────────────────────────────────────────────────────────

{
  const rows = resolveSources(undefined, { ...options, scope: 'global' })
  assert.deepEqual(keysOf(rows), ['dsh', 'claude'], '只留下存在目录的来源，再加上总是出现的 DSH')
  assert.equal(rows[0].rank, 10)
  assert.equal(rows[1].rank, 11)
  assert.equal(rows[0].enabled, true)
  assert.equal(rows[0].hostScanned, true, '默认目录交给宿主扫描')
  assert.equal(rows[1].enabled, false, '外部来源默认停用')
  assert.equal(rows[1].hostScanned, false)
  assert.equal(rows[1].exists, true)
  assert.equal(rows[1].kind, 'catalog')
  assert.equal(rows[1].custom, false)
  assert.equal(rows[1].defaultDir, join(home, '.claude', 'skills'))
}

{
  const rows = resolveSources(undefined, { ...options, scope: 'global', home: join(scratch, 'empty-home'), env: {} })
  assert.deepEqual(keysOf(rows), ['dsh'], '什么都没有时装完也只有一个 DSH 行，页面才有地方放新建技能')
  assert.equal(rows[0].exists, false)
}

{
  const rows = resolveSources({ sources: { codex: {} } }, { ...options, scope: 'global' })
  assert.deepEqual(keysOf(rows), ['dsh', 'claude', 'codex'], '配置过的来源即使目录不存在也留在表里，页面才能显示路径')
  assert.equal(rows[2].exists, false)
}

{
  const rows = resolveSources({ sources: { claude: { enabled: true, disabled: ['pdf'] } } }, { ...options, scope: 'global' })
  const claude = rows.find((row) => row.key === 'claude')
  assert.equal(claude.enabled, true)
  assert.deepEqual(claude.disabled, ['pdf'])
  assert.deepEqual(claude.forced, [], '没单独叫起来过的来源不带这一栏')
}

{
  // 整组关掉之后单独开起来的技能要一路带到界面与候选规划器
  const rows = resolveSources({ sources: { claude: { enabled: false, forced: ['pdf', 'docx'] } } }, { ...options, scope: 'global' })
  const claude = rows.find((row) => row.key === 'claude')
  assert.equal(claude.enabled, false)
  assert.deepEqual(claude.forced, ['pdf', 'docx'])
}

{
  const rows = resolveSources({ sources: { dsh: { dir: extra } } }, { ...options, scope: 'global' })
  const dsh = rows.find((row) => row.key === 'dsh')
  assert.equal(dsh.dir, resolve(extra))
  assert.equal(dsh.custom, true)
  assert.equal(dsh.hostScanned, false, '换过目录就不再交给宿主扫描，否则会被读两遍')
}

// ── project scope ──────────────────────────────────────────────────────────

{
  const rows = resolveSources(undefined, { ...options, scope: 'project' })
  assert.deepEqual(keysOf(rows), ['dsh', 'codex'], '项目范围按项目里的目录判断，不看用户目录')
  assert.equal(rows[0].dir, join(project, '.dsh', 'skills'))
  assert.equal(rows[0].exists, false)
  assert.equal(rows[0].hostScanned, true)
  assert.equal(rows[1].dir, join(project, '.codex', 'skills'))
  assert.equal(rows[1].exists, true)
  assert.equal(rows[1].label, 'Codex')
}

// ── session scope ──────────────────────────────────────────────────────────

{
  const rows = resolveSources(undefined, { ...options, scope: 'session' })
  assert.deepEqual(keysOf(rows), ['session'])
  assert.equal(rows[0].dir, join(sessionRoot, 'session-a', 'skills'))
  assert.equal(rows[0].defaultDir, join(sessionRoot, 'session-a', 'skills'))
  assert.equal(rows[0].custom, false)
  assert.equal(rows[0].enabled, true, '会话目录默认启用，新建技能立刻生效')
  assert.equal(rows[0].exists, true)
  assert.equal(rows[0].kind, 'session')
  assert.equal(rows[0].label, '会话技能')
}

{
  const rows = resolveSources({ sources: { session: { dir: extra, enabled: false } } }, { ...options, scope: 'session' })
  assert.equal(rows[0].dir, resolve(extra))
  assert.equal(rows[0].custom, true)
  assert.equal(rows[0].enabled, false)
}

// ── extra directories ──────────────────────────────────────────────────────

{
  const rows = resolveSources({ sources: { [extra]: { disabled: ['pdf'] } } }, { ...options, scope: 'global' })
  const custom = rows.find((row) => row.key === extra)
  assert.equal(custom.kind, 'custom')
  assert.equal(custom.label, 'extra-skills')
  assert.equal(custom.dir, extra)
  assert.equal(custom.defaultDir, '')
  assert.equal(custom.custom, true)
  assert.equal(custom.enabled, true, '手动加进来的目录默认启用')
  assert.deepEqual(custom.disabled, ['pdf'])
  assert.equal(custom.rank, rows[rows.length - 1].rank, '额外目录排在目录表之后')
}

{
  const rows = resolveSources({ sources: { claude: { dir: extra } } }, { ...options, scope: 'global' })
  assert.equal(keysOf(rows).filter((key) => key === extra).length, 0, '同一个目录不会出现两行')
  assert.equal(rows.find((row) => row.key === 'claude').dir, resolve(extra))
}

{
  const rows = resolveSources({ sources: { [extra]: {} } }, { ...options, scope: 'project' })
  assert.equal(rows[rows.length - 1].key, extra, '额外目录在项目范围里也生效')
}

rmSync(scratch, { recursive: true, force: true })
console.log(`sources: ${assertions} assertions passed`)
