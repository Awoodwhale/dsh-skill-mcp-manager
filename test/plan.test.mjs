/**
 * Offline assertions for the candidate planner: which skills one registry layer
 * publishes, how a switched-off source or skill becomes a hidden twin, and how a
 * name shared by two sources is decided once per layer.
 *
 * Node built-ins only, run with `npm test`.
 */
import assert from 'node:assert/strict'

let assertions = 0
for (const name of ['equal', 'deepEqual', 'ok', 'match', 'notEqual', 'throws']) {
  const original = assert[name]
  assert[name] = (...args) => {
    assertions += 1
    return original(...args)
  }
}

const { planCandidates } = await import(new URL('../lib/plan.js', import.meta.url).href)

const PROVIDER = 'agent-capabilities'

const skill = (name, extra = {}) => ({
  name,
  description: `${name} 的说明`,
  whenToUse: '',
  form: 'dir',
  path: `/skills/${name}/SKILL.md`,
  modelInvocable: true,
  userInvocable: true,
  valid: true,
  error: '',
  ...extra,
})

const source = (id, extra = {}) => ({
  key: id,
  id,
  label: id,
  kind: 'catalog',
  dir: `/skills/${id}`,
  defaultDir: `/skills/${id}`,
  custom: false,
  hostScanned: false,
  enabled: true,
  disabled: [],
  exists: true,
  rank: 10,
  ...extra,
})

const group = (sources) => ({ sources })

const names = (rows) => rows.map((row) => row.name)
const byName = (rows, name) => rows.find((row) => row.name === name)

// ── an enabled folder is published as it is ────────────────────────────────

{
  const rows = planCandidates([group([{ source: source('claude'), skills: [skill('pdf'), skill('docx')] }])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf', 'docx'], '按目录顺序，名字不去重')
  assert.equal(byName(rows, 'pdf').invocation.modelInvocable, true)
  assert.equal(byName(rows, 'pdf').provider, PROVIDER, '候选必须带上自己的 provider 名，否则注册表会拒收')
  assert.equal(byName(rows, 'pdf').source, 'claude')
  assert.equal(byName(rows, 'pdf').path, '/skills/pdf/SKILL.md')
  assert.deepEqual(byName(rows, 'pdf').locator, { root: '/skills/claude', name: 'pdf', path: '/skills/pdf/SKILL.md', hidden: false })
  assert.equal(byName(rows, 'pdf').resourceBase.path, '/skills/claude')
}

{
  const rows = planCandidates([group([{ source: source('claude'), skills: [skill('pdf', { whenToUse: '用户要求处理 PDF 时' })] }])], PROVIDER)
  assert.equal(byName(rows, 'pdf').whenToUse, '用户要求处理 PDF 时')
  const plain = planCandidates([group([{ source: source('claude'), skills: [skill('pdf')] }])], PROVIDER)
  assert.equal('whenToUse' in byName(plain, 'pdf'), false, '没有适用时机时连这个键都不出现')
}

{
  const rows = planCandidates([group([{ source: source('claude'), skills: [skill('pdf', { modelInvocable: false, userInvocable: true })] }])], PROVIDER)
  assert.deepEqual(byName(rows, 'pdf').invocation, { modelInvocable: false, userInvocable: true }, '技能自己声明的调用方式要原样带出去')
}

{
  const rows = planCandidates([group([{ source: source('claude'), skills: [skill('ok'), skill('broken', { valid: false, error: '缺少说明' })] }])], PROVIDER)
  assert.deepEqual(names(rows), ['ok'], '解析失败的技能不进候选，页面里单独提示')
}

// ── the shipped folders are not published twice ────────────────────────────

{
  const rows = planCandidates([group([{ source: source('dsh', { hostScanned: true }), skills: [skill('pdf')] }])], PROVIDER)
  assert.deepEqual(rows, [], '宿主已经在扫描这个目录，再发一份只会抢同一个名字')
}

{
  const rows = planCandidates([group([{ source: source('dsh', { hostScanned: true, enabled: false }), skills: [skill('pdf')] }])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf'], '整目录停用时反而必须发候选，否则宿主那份还看得见')
  assert.equal(byName(rows, 'pdf').invocation.modelInvocable, false)
  assert.equal(byName(rows, 'pdf').locator.hidden, true)
}

{
  const rows = planCandidates([group([{ source: source('dsh', { hostScanned: true, disabled: ['pdf'] }), skills: [skill('pdf'), skill('docx')] }])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf'], '只停用其中一个时只发那一个的影子')
  assert.equal(byName(rows, 'pdf').locator.hidden, true)
}

// ── a shared name is decided once per layer ────────────────────────────────

{
  const rows = planCandidates([group([
    { source: source('claude', { enabled: false }), skills: [skill('pdf')] },
    { source: source('codex'), skills: [skill('pdf')] },
  ])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf'], '停用的副本不再产生影子，否则会把另一个来源的启用副本一起藏掉')
  assert.equal(byName(rows, 'pdf').source, 'codex')
  assert.equal(byName(rows, 'pdf').locator.hidden, false)
  assert.equal(byName(rows, 'pdf').invocation.modelInvocable, true)
}

{
  const rows = planCandidates([group([
    { source: source('dsh', { hostScanned: true, enabled: false }), skills: [skill('pdf')] },
    { source: source('agents', { hostScanned: true, enabled: false }), skills: [skill('pdf')] },
  ])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf'], '两个自带目录都停用时只留一个影子')
  assert.equal(rows.length, 1)
  assert.equal(byName(rows, 'pdf').source, 'dsh', '影子来自排在前面的来源')
  assert.equal(byName(rows, 'pdf').locator.hidden, true)
}

{
  const rows = planCandidates([group([
    { source: source('claude', { enabled: false }), skills: [skill('pdf')] },
  ])], PROVIDER)
  assert.deepEqual(rows, [], '只有宿主自己会读的目录需要影子，别的目录停用后本来就看不见')
}

{
  const rows = planCandidates([group([
    { source: source('claude'), skills: [skill('pdf')] },
    { source: source('codex'), skills: [skill('pdf')] },
  ])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf', 'pdf'], '两个来源都启用时各发一份，注册表按 rank 取前面那个')
  assert.equal(rows[0].rank < rows[1].rank, true)
  assert.equal(rows[0].source, 'claude')
}

// ── rank follows the order the layers give ─────────────────────────────────

{
  const rows = planCandidates([
    group([{ source: source('session', { kind: 'session' }), skills: [skill('session-only')] }]),
    group([{ source: source('claude'), skills: [skill('pdf')] }]),
  ], PROVIDER)
  assert.deepEqual(names(rows), ['session-only', 'pdf'])
  assert.equal(rows[0].rank, 10, '第一组第一个来源从 10 开始')
  assert.equal(rows[1].rank, 11, '后面的组排在后面，同一层里最近的层先出现')
}

{
  const rows = planCandidates([group([
    { source: source('dsh', { hostScanned: true }), skills: [] },
    { source: source('claude'), skills: [skill('pdf')] },
  ])], PROVIDER)
  assert.equal(rows[0].rank, 11, '排在前面的来源占掉一个号，后面的来源不会因为不出候选就提前')
}

{
  const rows = planCandidates([
    group([{ source: source('claude'), skills: [skill('pdf')] }]),
    group([{ source: source('claude'), skills: [skill('pdf')] }]),
  ], PROVIDER)
  assert.equal(rows[0].rank !== rows[1].rank, true, '两组来源各占一个号')
}

// ── the switches of the coming turn outrank the record ─────────────────────

{
  const rows = planCandidates([group([
    { source: source('claude', { enabled: false, forced: ['pdf'] }), skills: [skill('pdf'), skill('docx')] },
  ])], PROVIDER)
  assert.deepEqual(names(rows), ['pdf'], '整个来源在记录里停用时，这一次带上的名字仍然要发布')
  assert.equal(rows[0].locator.hidden, false, '这一次带上的是可见候选')
}

{
  const rows = planCandidates([group([
    { source: source('dsh', { hostScanned: true, enabled: false, forced: ['pdf'] }), skills: [skill('pdf')] },
  ])], PROVIDER)
  assert.deepEqual(names(rows), [], '自带目录这一次带上时不发影子，名字就回到可见')
}

// ── nothing to publish ─────────────────────────────────────────────────────

assert.deepEqual(planCandidates([], PROVIDER), [])
assert.deepEqual(planCandidates([group([])], PROVIDER), [])
assert.deepEqual(planCandidates([group([{ source: source('claude'), skills: [] }])], PROVIDER), [])

console.log(`plan: ${assertions} assertions passed`)
