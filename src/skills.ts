// @ts-nocheck
/**
 * Skill documents on disk, in the shape `@deepseek-ai/dsh-skill-filesystem` reads.
 *
 * One skill is either a directory bundle `<root>/<name>/SKILL.md` (which may carry
 * resource files next to it) or a flat file `<root>/<name>.md`. Only the top level of
 * a skill root is scanned; nested `SKILL.md` files are deliberately invisible to the
 * provider, so this module writes exactly the two forms it can read back.
 *
 * Everything here is plain filesystem work with no DSH dependency, which is what the
 * offline tests exercise.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

/** Directory bundles are the default: they can carry resource files next to SKILL.md. */
export const SKILL_FORMS = ['dir', 'file']
/** Frontmatter keys this manager writes, in the order the file shows them. */
export const SKILL_FIELDS = ['name', 'description', 'whenToUse', 'disable-model-invocation', 'user-invocable']

const SKILL_FILE = 'SKILL.md'
/** The public skill-name grammar: kebab-case segments joined by single hyphens. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/** A skill name is the kebab-case token the registry accepts, nothing else. */
export const skillNameProblem = (name) => {
  const text = typeof name === 'string' ? name.trim() : ''
  if (text === '') return '技能名称不能为空'
  if (text.length > 64) return '技能名称不能超过 64 个字符'
  if (!SKILL_NAME.test(text)) return '技能名称只能由小写字母、数字和连字符组成，例如 pdf-tools'
  return ''
}

const emptyRecord = () => ({
  name: '',
  description: '',
  whenToUse: '',
  modelInvocable: true,
  userInvocable: true,
  content: '',
})

/** Split `---` frontmatter from the Markdown body; a document without it parses to an empty map. */
export const splitFrontmatter = (text) => {
  const source = typeof text === 'string' ? text : ''
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/.exec(source)
  if (match === null) return { frontmatter: {}, body: source, present: false }
  let frontmatter = {}
  try {
    const parsed = parseYaml(match[1])
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) frontmatter = parsed
  } catch (error) {
    throw new Error(`frontmatter 不是合法的 YAML：${error.message}`)
  }
  return { frontmatter, body: source.slice(match[0].length), present: true }
}

/** Turn one parsed document into the record the settings page edits. */
export const recordOf = (text, fallbackName = '') => {
  const { frontmatter, body } = splitFrontmatter(text)
  const record = emptyRecord()
  record.name = typeof frontmatter.name === 'string' ? frontmatter.name.trim() : fallbackName
  record.description = typeof frontmatter.description === 'string' ? frontmatter.description.trim() : ''
  record.whenToUse = typeof frontmatter.whenToUse === 'string' ? frontmatter.whenToUse.trim() : ''
  if (frontmatterBoolean(frontmatter, 'disable-model-invocation') === true) record.modelInvocable = false
  if (frontmatterBoolean(frontmatter, 'user-invocable') === false) record.userInvocable = false
  record.content = body.replace(/^\r?\n/, '')
  return record
}

/** 与宿主自带读取器同一套布尔写法：true/false、1/0、yes/no、on/off。 */
const frontmatterBoolean = (frontmatter, key) => {
  if (!Object.hasOwn(frontmatter, key)) return undefined
  const value = frontmatter[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    const word = value.toLowerCase()
    if (word === 'true' || word === 'yes' || word === 'on') return true
    if (word === 'false' || word === 'no' || word === 'off') return false
  }
  throw new Error(`frontmatter 字段 ${key} 必须是布尔值，收到 ${JSON.stringify(value)}`)
}

/** 宿主读取器同样的门槛：frontmatter 里要有合法的 name 和非空的 description。 */
const recordProblem = (text, record) => {
  const { present, frontmatter } = splitFrontmatter(text)
  if (!present) return '缺少 frontmatter'
  if (typeof frontmatter.name !== 'string' || frontmatter.name.trim() === '') return 'frontmatter 缺少 name'
  const problem = skillNameProblem(record.name)
  if (problem !== '') return problem
  if (record.description === '') return 'frontmatter 缺少 description'
  return ''
}

/** Render a record back into the file the provider reads. */
export const documentOf = (record) => {
  const frontmatter = {
    name: record.name,
    description: record.description,
  }
  if (record.whenToUse !== '') frontmatter.whenToUse = record.whenToUse
  if (record.modelInvocable === false) frontmatter['disable-model-invocation'] = true
  if (record.userInvocable === false) frontmatter['user-invocable'] = false
  const body = typeof record.content === 'string' ? record.content : ''
  const text = stringifyYaml(frontmatter, { lineWidth: 0 })
  return `---\n${text}---\n\n${body.replace(/\s+$/, '')}\n`
}

/** Where a named skill lives inside a root, in the form asked for. */
export const skillPathOf = (root, name, form = 'dir') =>
  form === 'file' ? join(root, `${name}.md`) : join(root, name, SKILL_FILE)

/**
 * Every top-level entry the provider would read, in the order the shipped reader walks
 * them: by entry name. When two entries claim the same skill name, the first one here is
 * the one the registry keeps.
 */
const entriesOf = (root) => {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const skills = []
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      const file = join(root, entry.name, SKILL_FILE)
      if (!existsSync(file)) continue
      skills.push(skillEntryOf(file, entry.name, 'dir', join(root, entry.name)))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const stem = entry.name.slice(0, -3)
      if (stem === '') continue
      skills.push(skillEntryOf(join(root, entry.name), stem, 'file', undefined))
    }
  }
  return skills
}

/**
 * Locate an existing skill by the name its frontmatter declares, which is the name the
 * registry and the settings page use. The folder or file it sits in may be named
 * differently. Returns `undefined` when no entry in the root declares that name.
 */
export const locateSkill = (root, name) => {
  if (typeof name !== 'string' || name === '') return undefined
  const found = entriesOf(root).find((skill) => skill.name === name)
  if (found === undefined) return undefined
  return { form: found.form, path: found.path, bundle: found.bundle }
}

/**
 * Every skill entry the provider would discover under `root`, in name order.
 * A broken entry is reported with its parse error instead of being dropped, so the
 * settings page can show why a skill the model never sees is invisible.
 */
export const listSkills = (root) =>
  entriesOf(root).sort((left, right) => left.name.localeCompare(right.name))

const skillEntryOf = (file, fallbackName, form, bundle) => {
  const base = { name: fallbackName, form, path: file, bundle, resourceDir: dirname(file), description: '', whenToUse: '', modelInvocable: true, userInvocable: true, valid: true, error: '' }
  try {
    const stat = statSync(file)
    const text = readFileSync(file, 'utf8')
    const record = recordOf(text, fallbackName)
    const problem = recordProblem(text, record)
    return {
      ...base,
      name: record.name,
      description: record.description,
      whenToUse: record.whenToUse,
      modelInvocable: record.modelInvocable,
      userInvocable: record.userInvocable,
      size: stat.size,
      modified: Math.round(stat.mtimeMs),
      valid: problem === '',
      error: problem,
    }
  } catch (error) {
    return { ...base, valid: false, error: `读取失败：${error.message}` }
  }
}

/**
 * Read one skill in full, or `undefined` when the root no longer holds it. A broken
 * document still comes back with its whole text as `content`, so the editor can repair
 * it; `problem` says what is wrong with it.
 */
export const readSkill = (root, name) => {
  const located = locateSkill(root, name)
  if (located === undefined) return undefined
  const text = readFileSync(located.path, 'utf8')
  let record
  let problem = ''
  try {
    record = recordOf(text, name)
    problem = recordProblem(text, record)
  } catch (error) {
    record = { ...emptyRecord(), name, content: text }
    problem = error.message
  }
  return { ...record, form: located.form, path: located.path, bundle: located.bundle, valid: problem === '', problem, text }
}

/**
 * Write one skill, creating or replacing it. An existing skill is rewritten where it
 * sits, whatever its folder is called. `renameFrom` moves an existing entry: a directory
 * bundle moves as a whole, resource files included. The body lands through a temporary
 * file in the same directory so a reader never sees half a document.
 */
export const writeSkill = (root, record, { renameFrom = '', form = 'dir' } = {}) => {
  const problem = skillNameProblem(record.name)
  if (problem !== '') throw new Error(problem)
  if (typeof record.description !== 'string' || record.description.trim() === '') throw new Error('说明不能为空：宿主读不到没有 description 的技能')
  mkdirSync(root, { recursive: true })
  const renaming = renameFrom !== '' && renameFrom !== record.name
  const previous = renaming ? locateSkill(root, renameFrom) : undefined
  if (renaming && previous === undefined) throw new Error(`「${renameFrom}」不存在（可能已被删除）`)
  const existing = locateSkill(root, record.name)
  if (existing !== undefined && renaming) throw new Error(`「${record.name}」已存在，不能把「${renameFrom}」改名到它上面`)
  const targetForm = existing?.form ?? previous?.form ?? form
  let finalPath = existing?.path
  if (finalPath === undefined) {
    finalPath = skillPathOf(root, record.name, targetForm)
    const occupied = targetForm === 'dir' ? join(root, record.name) : finalPath
    if (existsSync(occupied)) throw new Error(`${occupied} 已被占用，换一个名字`)
    if (previous?.form === 'dir') renameSync(previous.bundle, occupied)
    else mkdirSync(dirname(finalPath), { recursive: true })
  }
  const temporary = `${finalPath}.tmp-${process.pid}`
  writeFileSync(temporary, documentOf(record), { encoding: 'utf8', mode: 0o644 })
  renameSync(temporary, finalPath)
  if (previous?.form === 'file') rmSync(previous.path)
  return { path: finalPath, form: targetForm, created: existing === undefined && previous === undefined }
}

/** Remove one skill entry (directory bundle or flat file). */
export const deleteSkill = (root, name) => {
  const located = locateSkill(root, name)
  if (located === undefined) throw new Error(`「${name}」不存在（可能已被删除）`)
  rmSync(located.bundle ?? located.path, { recursive: true, force: true })
  return { path: located.path, form: located.form }
}

/** Resource files a directory bundle carries next to SKILL.md. */
export const skillResources = (root, name) => {
  const located = locateSkill(root, name)
  if (located === undefined || located.bundle === undefined) return []
  return readdirSync(located.bundle, { withFileTypes: true })
    .filter((entry) => entry.name !== SKILL_FILE && !entry.name.startsWith('.'))
    .map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
    .sort((left, right) => left.name.localeCompare(right.name))
}

/** True when the root already holds a skill of that name, in either form. */
export const hasSkill = (root, name) => locateSkill(root, name) !== undefined
