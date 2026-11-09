/**
 * Offline assertions for the skill document layer: the two on-disk forms, the
 * frontmatter round trip, the listing rules the provider applies, and the error
 * messages the page shows when a write is refused.
 *
 * Node built-ins only, run with `npm test`. The working directories live under
 * .test-tmp/ inside this package so nothing is written outside the repository.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
const scratch = mkdtempSync(join(root, '.test-tmp', 'skills-'))
const skillsRoot = join(scratch, 'skills')
mkdirSync(skillsRoot, { recursive: true })

const {
  SKILL_FIELDS,
  SKILL_FORMS,
  deleteSkill,
  documentOf,
  hasSkill,
  listSkills,
  locateSkill,
  readSkill,
  recordOf,
  skillNameProblem,
  skillPathOf,
  skillResources,
  splitFrontmatter,
  writeSkill,
} = await import(new URL('../lib/skills.js', import.meta.url).href)

// ── names ──────────────────────────────────────────────────────────────────

assert.deepEqual(SKILL_FORMS, ['dir', 'file'])
assert.deepEqual(SKILL_FIELDS, ['name', 'description', 'whenToUse', 'disable-model-invocation', 'user-invocable'])
assert.equal(skillNameProblem(''), '技能名称不能为空')
assert.equal(skillNameProblem('   '), '技能名称不能为空')
assert.equal(skillNameProblem('x'.repeat(65)).includes('64'), true)
assert.equal(skillNameProblem('Pdf_Tools'), '技能名称只能由小写字母、数字和连字符组成，例如 pdf-tools')
assert.equal(skillNameProblem('-lead'), '技能名称只能由小写字母、数字和连字符组成，例如 pdf-tools')
assert.equal(skillNameProblem('pdf-tools'), '')
assert.equal(skillNameProblem('pdf2csv'), '')

// ── frontmatter ────────────────────────────────────────────────────────────

{
  const plain = splitFrontmatter('# 标题\n\n正文')
  assert.equal(plain.present, false)
  assert.deepEqual(plain.frontmatter, {})
  assert.equal(plain.body, '# 标题\n\n正文')
}

{
  const split = splitFrontmatter('---\nname: demo\ndescription: 演示\n---\n\n正文第一行\n')
  assert.equal(split.present, true)
  assert.equal(split.frontmatter.name, 'demo')
  assert.equal(split.frontmatter.description, '演示')
  assert.equal(split.body, '\n正文第一行\n', '正文从分隔行之后开始，空行留给 recordOf 去掉')
}

assert.throws(
  () => splitFrontmatter('---\nname: [未闭合\n---\n正文'),
  /frontmatter 不是合法的 YAML/
)

{
  const record = recordOf('---\nname: demo\ndescription: 演示\nwhenToUse: 需要时\ndisable-model-invocation: true\nuser-invocable: false\n---\n\n正文\n', 'fallback')
  assert.equal(record.name, 'demo')
  assert.equal(record.description, '演示')
  assert.equal(record.whenToUse, '需要时')
  assert.equal(record.modelInvocable, false)
  assert.equal(record.userInvocable, false)
  assert.equal(record.content, '正文\n')
}

{
  const fallback = recordOf('没有 frontmatter 的文件', 'from-file-name')
  assert.equal(fallback.name, 'from-file-name')
  assert.equal(fallback.description, '')
  assert.equal(fallback.modelInvocable, true)
  assert.equal(fallback.userInvocable, true)
  assert.equal(fallback.content, '没有 frontmatter 的文件')
}

// ── rendering ──────────────────────────────────────────────────────────────

{
  const text = documentOf({ name: 'demo', description: '演示', whenToUse: '', modelInvocable: true, userInvocable: true, content: '正文' })
  assert.equal(text.startsWith('---\n'), true)
  assert.equal(text.includes('whenToUse'), false, '一个空的 whenToUse 不写进文件')
  assert.equal(text.includes('disable-model-invocation'), false)
  assert.equal(text.includes('user-invocable'), false)
  assert.equal(text.endsWith('正文\n'), true)
}

{
  const text = documentOf({ name: 'demo', description: '演示', whenToUse: '需要时', modelInvocable: false, userInvocable: false, content: '正文' })
  assert.equal(text.includes('whenToUse: 需要时'), true)
  assert.equal(text.includes('disable-model-invocation: true'), true)
  assert.equal(text.includes('user-invocable: false'), true)
}

{
  const record = { name: 'round-trip', description: '往返', whenToUse: '任何需要往返的时候，比如测试', modelInvocable: false, userInvocable: true, content: '第一行\n\n- 列表项\n' }
  const back = recordOf(documentOf(record), 'ignored')
  assert.equal(back.name, record.name)
  assert.equal(back.description, record.description)
  assert.equal(back.whenToUse, record.whenToUse)
  assert.equal(back.modelInvocable, false)
  assert.equal(back.userInvocable, true)
  assert.equal(back.content.trim(), record.content.trim())
}

// ── paths and locating ─────────────────────────────────────────────────────

assert.equal(skillPathOf('/a/b', 'demo', 'dir'), join('/a/b', 'demo', 'SKILL.md'))
assert.equal(skillPathOf('/a/b', 'demo', 'file'), join('/a/b', 'demo.md'))
assert.equal(locateSkill(skillsRoot, 'missing'), undefined)

// ── writing ────────────────────────────────────────────────────────────────

{
  const created = writeSkill(skillsRoot, { name: 'first', description: '第一个', whenToUse: '', modelInvocable: true, userInvocable: true, content: '做点什么\n' }, { form: 'dir' })
  assert.equal(created.created, true)
  assert.equal(created.form, 'dir')
  assert.equal(created.path, join(skillsRoot, 'first', 'SKILL.md'))
  assert.equal(readFileSync(created.path, 'utf8').includes('description: 第一个'), true)
}

{
  const updated = writeSkill(skillsRoot, { name: 'first', description: '改过的', whenToUse: '', modelInvocable: true, userInvocable: true, content: '另一些内容\n' })
  assert.equal(updated.created, false)
  assert.equal(updated.form, 'dir', '已有目录包时不管传什么形式都写回同一个位置')
  assert.equal(readSkill(skillsRoot, 'first').description, '改过的')
}

{
  const flat = writeSkill(skillsRoot, { name: 'flat-one', description: '单文件', whenToUse: '', modelInvocable: true, userInvocable: true, content: '内容\n' }, { form: 'file' })
  assert.equal(flat.form, 'file')
  assert.equal(flat.path, join(skillsRoot, 'flat-one.md'))
  assert.equal(hasSkill(skillsRoot, 'flat-one'), true)
}

{
  const renamed = writeSkill(skillsRoot, { name: 'second', description: '改名后', whenToUse: '', modelInvocable: true, userInvocable: true, content: '内容\n' }, { renameFrom: 'first' })
  assert.equal(renamed.form, 'dir')
  assert.equal(locateSkill(skillsRoot, 'first'), undefined, '改名后旧条目必须消失')
  assert.equal(hasSkill(skillsRoot, 'second'), true)
}

{
  writeSkill(skillsRoot, { name: 'taken', description: '占位', whenToUse: '', modelInvocable: true, userInvocable: true, content: '内容\n' })
  assert.throws(
    () => writeSkill(skillsRoot, { name: 'taken', description: '另一个', whenToUse: '', modelInvocable: true, userInvocable: true, content: '内容\n' }, { renameFrom: 'second' }),
    /已存在，不能把「second」改名到它上面/
  )
  assert.equal(hasSkill(skillsRoot, 'second'), true, '失败时两边都不能被动过')
}

assert.throws(
  () => writeSkill(skillsRoot, { name: 'Bad Name', description: 'x', whenToUse: '', modelInvocable: true, userInvocable: true, content: '' }),
  /技能名称只能由小写字母、数字和连字符组成/
)

// ── listing ────────────────────────────────────────────────────────────────

{
  mkdirSync(join(skillsRoot, '.hidden'), { recursive: true })
  writeFileSync(join(skillsRoot, '.hidden', 'SKILL.md'), '---\nname: hidden\ndescription: 隐藏\n---\n正文\n')
  mkdirSync(join(skillsRoot, 'no-skill-md'), { recursive: true })
  writeFileSync(join(skillsRoot, 'broken.md'), '---\nname: Bad_Name\ndescription: 名字不合法\n---\n正文\n')
  writeFileSync(join(skillsRoot, 'notes.txt'), '不是技能')
  const listed = listSkills(skillsRoot)
  const names = listed.map((entry) => entry.name)
  assert.equal(names.includes('hidden'), false, '点开头的目录不参与扫描')
  assert.equal(names.includes('notes'), false, '非 Markdown 文件不算技能')
  assert.equal(names.includes('no-skill-md'), false, '没有 SKILL.md 的目录不算技能')
  assert.deepEqual([...names].sort(), ['Bad_Name', 'flat-one', 'second', 'taken'], '条目名取文件里声明的 name，坏名字也要显示出来')
  const broken = listed.find((entry) => entry.name === 'Bad_Name')
  assert.equal(broken.valid, false)
  assert.equal(broken.error, '技能名称只能由小写字母、数字和连字符组成，例如 pdf-tools')
  assert.equal(broken.form, 'file')
  const second = listed.find((entry) => entry.name === 'second')
  assert.equal(second.valid, true)
  assert.equal(second.form, 'dir')
  assert.equal(second.modelInvocable, true)
}

assert.deepEqual(listSkills(join(scratch, 'nowhere')), [], '目录不存在时是空列表，不是异常')

// ── resources ──────────────────────────────────────────────────────────────

{
  writeFileSync(join(skillsRoot, 'second', 'template.csv'), 'a,b\n')
  mkdirSync(join(skillsRoot, 'second', 'examples'), { recursive: true })
  writeFileSync(join(skillsRoot, '.DS_Store'), 'x')
  const resources = skillResources(skillsRoot, 'second')
  assert.deepEqual(resources.map((entry) => entry.name), ['examples', 'template.csv'])
  assert.equal(resources.find((entry) => entry.name === 'examples').directory, true)
  assert.deepEqual(skillResources(skillsRoot, 'flat-one'), [], '单文件技能没有旁边文件')
}

// ── reading and deleting ───────────────────────────────────────────────────

{
  const read = readSkill(skillsRoot, 'second')
  assert.equal(read.valid, true)
  assert.equal(read.form, 'dir')
  assert.equal(read.path, join(skillsRoot, 'second', 'SKILL.md'))
  assert.equal(typeof read.text, 'string')
  assert.equal(readSkill(skillsRoot, 'nothing-here'), undefined)
}

{
  const removed = deleteSkill(skillsRoot, 'second')
  assert.equal(removed.form, 'dir')
  assert.equal(hasSkill(skillsRoot, 'second'), false)
  assert.equal(deleteSkill(skillsRoot, 'flat-one').form, 'file')
  assert.equal(hasSkill(skillsRoot, 'flat-one'), false)
  assert.throws(() => deleteSkill(skillsRoot, 'flat-one'), /「flat-one」不存在（可能已被删除）/)
}

rmSync(scratch, { recursive: true, force: true })
console.log(`skills: ${assertions} assertions passed`)
