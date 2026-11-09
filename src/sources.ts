// @ts-nocheck
/**
 * Skill directories of the coding agents that keep them on this machine.
 *
 * One catalog entry per agent: where its skills live under the user home, which
 * environment variable relocates that root, and the folder it reads inside a
 * project. A scope resolves the catalog plus the extra directories the user
 * attached, in priority order; the first row of a scope wins a shared name.
 */
import { statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

/** The one source only a session has: the plugin's own directory for that session. */
export const SESSION_SOURCE_ID = 'session'

/**
 * `root` is the agent's own directory under the user home, `env` the variable that
 * relocates it, `project` the folder it reads inside a project root, `enabled` the
 * state a fresh installation starts in, and `hostScanned` marks the two roots the
 * shipped DSH provider already reads on its own.
 */
export const SOURCE_CATALOG = [
  { id: 'dsh', label: 'DSH', root: '.dsh', env: 'DSH_HOME', project: '.dsh/skills', enabled: true, hostScanned: true },
  { id: 'agents', label: '通用 Agent', root: '.agents', env: 'DSH_AGENTS_HOME', project: '.agents/skills', enabled: true, hostScanned: true },
  { id: 'claude', label: 'Claude Code', root: '.claude', env: 'DSH_CLAUDE_HOME', project: '.claude/skills', enabled: false },
  { id: 'codex', label: 'Codex', root: '.codex', env: 'DSH_CODEX_HOME', project: '.codex/skills', enabled: false },
  { id: 'gemini', label: 'Gemini CLI', root: '.gemini', env: 'DSH_GEMINI_HOME', project: '.gemini/skills', enabled: false },
  { id: 'cursor', label: 'Cursor', root: '.cursor', env: 'DSH_CURSOR_HOME', project: '.cursor/skills', enabled: false },
  { id: 'copilot', label: 'GitHub Copilot', root: '.copilot', env: 'DSH_COPILOT_HOME', project: '.github/skills', enabled: false },
  { id: 'opencode', label: 'OpenCode', root: '.config/opencode', env: 'DSH_OPENCODE_HOME', project: '.opencode/skills', enabled: false },
  { id: 'windsurf', label: 'Windsurf', root: '.codeium/windsurf', env: '', project: '.windsurf/skills', enabled: false },
  { id: 'trae', label: 'Trae', root: '.trae', env: '', project: '.trae/skills', enabled: false },
  { id: 'qoder', label: 'Qoder', root: '.qoder', env: '', project: '.qoder/skills', enabled: false },
  { id: 'roo', label: 'Roo Code', root: '.roo', env: '', project: '.roo/skills', enabled: false },
  { id: 'codebuddy', label: 'CodeBuddy', root: '.codebuddy', env: '', project: '.codebuddy/skills', enabled: false },
  { id: 'workbuddy', label: 'WorkBuddy', root: '.workbuddy', env: '', project: '.workbuddy/skills', enabled: false },
  { id: 'openclaw', label: 'OpenClaw', root: '.openclaw', env: '', project: '', enabled: false },
]

/** The catalog entry behind one stored key, or undefined for a directory the user added. */
export const catalogOf = (id) => SOURCE_CATALOG.find((spec) => spec.id === id)

const isDirectory = (path) => {
  if (typeof path !== 'string' || path === '') return false
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/** The agent root under the user home, honouring the variable that relocates it. */
export const rootDirOf = (spec, { home, env }) => {
  const override = spec.env === '' ? '' : String(env?.[spec.env] ?? '').trim()
  return override === '' ? join(home, spec.root) : resolve(override)
}

/** The directory one catalog source reads in one scope. */
export const sourceDirOf = (spec, options) => {
  if (options.scope === 'session') return ''
  if (options.scope === 'project') {
    if (spec.project === '' || options.projectRoot === '') return ''
    return join(options.projectRoot, spec.project)
  }
  return join(rootDirOf(spec, options), 'skills')
}

const enabledOf = (state, fallback) => (typeof state?.enabled === 'boolean' ? state.enabled : fallback)

const disabledOf = (state) => (Array.isArray(state?.disabled) ? state.disabled : [])

/** 整组关掉之后又被单独叫起来的技能名。 */
const forcedOf = (state) => (Array.isArray(state?.forced) ? state.forced : [])

/**
 * One scope's skill sources, highest priority first.
 *
 * Rows are the catalog entries that exist on disk (or that the user already
 * configured), the session directory for a session scope, and every extra
 * directory the user attached. Two rows never share a directory.
 * @param record - the stored scope record, possibly undefined for a fresh scope.
 * @param options - `scope`, `projectRoot`, `sessionId`, `sessionRoot`, `home`, `env`.
 * @returns resolved sources with `rank` ascending by priority.
 */
export const resolveSources = (record, options) => {
  const scope = options?.scope
  const states = record?.sources ?? {}
  const rows = []
  const push = (row) => {
    if (rows.some((other) => other.dir === row.dir)) return
    rows.push({ ...row, rank: 10 + rows.length })
  }

  if (scope === 'session') {
    const state = states[SESSION_SOURCE_ID]
    const defaultDir = join(options.sessionRoot, String(options.sessionId ?? ''), 'skills')
    const dir = typeof state?.dir === 'string' && state.dir !== '' ? resolve(state.dir) : defaultDir
    push({
      key: SESSION_SOURCE_ID,
      id: SESSION_SOURCE_ID,
      label: '会话技能',
      kind: 'session',
      dir,
      defaultDir,
      custom: dir !== defaultDir,
      hostScanned: false,
      enabled: enabledOf(state, true),
      disabled: disabledOf(state),
      forced: forcedOf(state),
      exists: isDirectory(dir),
    })
  } else if (scope === 'project' || scope === 'global') {
    for (const spec of SOURCE_CATALOG) {
      const state = states[spec.id]
      const defaultDir = sourceDirOf(spec, options)
      if (defaultDir === '') continue
      const dir = typeof state?.dir === 'string' && state.dir !== '' ? resolve(state.dir) : defaultDir
      const configured = state !== undefined
      if (!configured && spec.id !== 'dsh' && !isDirectory(dir)) continue
      push({
        key: spec.id,
        id: spec.id,
        label: spec.label,
        kind: 'catalog',
        dir,
        defaultDir,
        custom: dir !== defaultDir,
        hostScanned: spec.hostScanned === true && dir === defaultDir,
        enabled: enabledOf(state, spec.enabled),
        disabled: disabledOf(state),
        forced: forcedOf(state),
        exists: isDirectory(dir),
      })
    }
  }

  for (const [key, state] of Object.entries(states)) {
    if (key === SESSION_SOURCE_ID || catalogOf(key) !== undefined) continue
    push({
      key,
      id: key,
      label: basename(key) || key,
      kind: 'custom',
      dir: key,
      defaultDir: '',
      custom: true,
      hostScanned: false,
      enabled: enabledOf(state, true),
      disabled: disabledOf(state),
      forced: forcedOf(state),
      exists: isDirectory(key),
    })
  }

  return rows
}
