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
  if (frontmatter['disable-model-invocation'] === true) record.modelInvocable = false
  if (frontmatter['user-invocable'] === false) record.userInvocable = false
  record.content = body.replace(/^\r?\n/, '')
  return record
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
 * Locate an existing skill by name, preferring the directory bundle. Returns
 * `undefined` when the root holds neither form.
 */
export const locateSkill = (root, name) => {
  const bundle = join(root, name)
  try {
    if (statSync(join(bundle, SKILL_FILE)).isFile()) return { form: 'dir', path: join(bundle, SKILL_FILE), bundle }
  } catch {
    /* not a directory bundle */
  }
  const flat = join(root, `${name}.md`)
  try {
    if (statSync(flat).isFile()) return { form: 'file', path: flat, bundle: undefined }
  } catch {
    /* not a flat skill */
  }
  return undefined
}

/**
 * Every skill entry the provider would discover under `root`, in name order.
 * A broken entry is reported with its parse error instead of being dropped, so the
 * settings page can show why a skill the model never sees is invisible.
 */
export const listSkills = (root) => {
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const skills = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      const file = join(root, entry.name, SKILL_FILE)
      if (!existsSync(file)) continue
      skills.push(skillEntryOf(file, entry.name, 'dir'))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      const name = entry.name.slice(0, -3)
      if (name === '') continue
      skills.push(skillEntryOf(join(root, entry.name), name, 'file'))
    }
  }
  skills.sort((left, right) => left.name.localeCompare(right.name))
  return skills
}

const skillEntryOf = (file, fallbackName, form) => {
  const base = { name: fallbackName, form, path: file, description: '', whenToUse: '', modelInvocable: true, userInvocable: true, valid: true, error: '' }
  try {
    const stat = statSync(file)
    const text = readFileSync(file, 'utf8')
    const record = recordOf(text, fallbackName)
    const problem = skillNameProblem(record.name)
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

/** Read one skill in full, or `undefined` when the root no longer holds it. */
export const readSkill = (root, name) => {
  const located = locateSkill(root, name)
  if (located === undefined) return undefined
  const text = readFileSync(located.path, 'utf8')
  let record
  let problem = ''
  try {
    record = recordOf(text, name)
    problem = skillNameProblem(record.name)
  } catch (error) {
    record = { ...emptyRecord(), name, content: text }
    problem = error.message
  }
  return { ...record, form: located.form, path: located.path, valid: problem === '', error: problem, text }
}

/**
 * Write one skill, creating or replacing it. `renameFrom` moves an existing entry
 * instead of leaving a duplicate behind. The body lands through a temporary file in
 * the same directory so a reader never sees half a document.
 */
export const writeSkill = (root, record, { renameFrom = '', form = 'dir' } = {}) => {
  const problem = skillNameProblem(record.name)
  if (problem !== '') throw new Error(problem)
  mkdirSync(root, { recursive: true })
  const target = skillPathOf(root, record.name, form)
  const previous = renameFrom !== '' && renameFrom !== record.name ? locateSkill(root, renameFrom) : undefined
  const existing = locateSkill(root, record.name)
  if (existing !== undefined && previous !== undefined) throw new Error(`「${record.name}」已存在，不能把「${renameFrom}」改名到它上面`)
  const targetForm = existing?.form ?? previous?.form ?? form
  const finalPath = skillPathOf(root, record.name, targetForm)
  mkdirSync(dirname(finalPath), { recursive: true })
  const text = documentOf(record)
  const temporary = `${finalPath}.tmp-${process.pid}`
  writeFileSync(temporary, text, { encoding: 'utf8', mode: 0o644 })
  renameSync(temporary, finalPath)
  if (previous !== undefined) {
    try {
      rmSync(previous.form === 'dir' ? join(root, renameFrom) : join(root, `${renameFrom}.md`), { recursive: true, force: true })
    } catch {
      /* the old entry is gone already */
    }
  }
  return { path: finalPath, form: targetForm, created: existing === undefined && previous === undefined }
}

/** Remove one skill entry (directory bundle or flat file). */
export const deleteSkill = (root, name) => {
  const located = locateSkill(root, name)
  if (located === undefined) throw new Error(`「${name}」不存在（可能已被删除）`)
  rmSync(located.form === 'dir' ? join(root, name) : located.path, { recursive: true, force: true })
  return { path: located.path, form: located.form }
}

/** Resource files a directory bundle carries next to SKILL.md. */
export const skillResources = (root, name) => {
  const located = locateSkill(root, name)
  if (located === undefined || located.form !== 'dir') return []
  const directory = join(root, name)
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name !== SKILL_FILE && !entry.name.startsWith('.'))
      .map((entry) => ({ name: entry.name, directory: entry.isDirectory() }))
      .sort((left, right) => left.name.localeCompare(right.name))
  } catch {
    return []
  }
}

/** True when the root already holds a skill of that name, in either form. */
export const hasSkill = (root, name) => locateSkill(root, name) !== undefined
