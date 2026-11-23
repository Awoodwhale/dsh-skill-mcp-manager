/**
 * Turning ordered skill sources into the candidates one provider publishes.
 *
 * A name is decided once for the whole scope. The scope's sources arrive nearest
 * first (a session's own folder, then its project's, then the global ones), and the
 * nearest copy decides whether the name is on. Publishing one candidate per name is
 * what keeps the model and the slash menu agreeing: the registry resolves a name once
 * per scope, so two candidates of the same name would let the later one answer a
 * question the earlier one already answered.
 *
 * A name that is off still needs an answer, because the registry merges every layer and
 * the shipped folder readers publish their own copies at ranks this plugin must not
 * outrank. The answer is a hidden twin: same name, both invocation flags false, rank
 * one lower than the source it stands for. The registry sorts candidates by rank before
 * it de-duplicates names, so the twin wins the name and then publishes nothing, which
 * takes the name out of the model's list and out of the slash menu whichever reader
 * would otherwise have supplied it.
 */

import { skillOn } from './sources.js'

/** Ranks the shipped folder readers use; a twin has to sort ahead of the copy it covers. */
const SHIPPED_RANKS = { 'project-dsh': 100, 'project-agents': 200, custom: 300, 'user-dsh': 400, 'user-agents': 500, bundled: 600 }

/** One candidate for one skill on disk. */
export const candidateOf = (source, skill, rank, hidden, providerName) => ({
  name: skill.name,
  description: skill.description,
  ...(skill.whenToUse === '' ? {} : { whenToUse: skill.whenToUse }),
  invocation: hidden
    ? { modelInvocable: false, userInvocable: false }
    : { modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable },
  source: source.id,
  provider: providerName,
  rank,
  locator: { root: source.dir, name: skill.name, path: skill.path, hidden },
  path: skill.path,
  // 资源文件相对技能自己的目录：目录形态是那个文件夹，单文件形态是来源目录本身
  resourceBase: { kind: 'directory', path: skill.resourceDir },
})

const isOn = (source, skill) => skillOn(source, skill.name)

/**
 * The rank a source's copies are published at.
 *
 * The source's own rank is the order the scope resolved its folders in, so a nearer
 * folder already outranks the ones behind it. A folder the shipped readers also publish
 * is the exception: its twin has to sort ahead of that reader's copy, and the reader
 * numbers its roots on its own scale, so the source's rank gives way to the reader's.
 * @param source - the resolved source.
 * @returns a positive integer rank.
 */
const rankOf = (source, hidden) => {
  const base = source.hostScanned ? Math.max(1, (SHIPPED_RANKS[readerOf(source)] ?? SHIPPED_RANKS.bundled) - 1) : source.rank
  return hidden ? Math.max(1, base - 1) : base
}

/**
 * Which reader publishes a folder this plugin also publishes.
 * @param source - the resolved source.
 * @returns the reader key whose rank the twin has to undercut.
 */
const readerOf = (source) => {
  if (source.kind === 'custom') return 'custom'
  if (source.scope === 'project') return source.id === 'agents' ? 'project-agents' : 'project-dsh'
  return source.id === 'agents' ? 'user-agents' : 'user-dsh'
}

/**
 * The copy that speaks for one name in this scope, and whether it is audible.
 *
 * `copies` arrives in registry priority order. The nearest copy decides: switched on,
 * it is the one the model and the slash menu may see; switched off, the name is off for
 * this whole scope whichever folders further out still hold a copy, and that answer
 * travels to the registry as a hidden twin.
 * @param copies - every copy of one name, nearest first.
 * @returns the copy to publish, or undefined when there is nothing to hold the name.
 */
const decide = (copies) => {
  const nearest = copies[0]
  if (isOn(nearest.source, nearest.skill)) return { copy: nearest, hidden: false }
  return { copy: nearest, hidden: true }
}

/**
 * The switches of the coming turn ride on top of the record.
 *
 * A switch belongs to the session, so it outranks both the project and the global
 * record: taking a name off hides it here even when a closer record enables it, and
 * putting a name back shows it here even when every record has it switched off.
 * @param groups - sources in priority order, each with the skills found on disk.
 * @param temp - `offSkills` and `onSkills` of the coming turn.
 * @returns groups whose sources carry the turn's switches.
 */
export const withTemp = (groups, temp) => {
  if (temp.offSkills.length === 0 && temp.onSkills.length === 0) return groups
  const off = new Set(temp.offSkills)
  const on = new Set(temp.onSkills)
  return groups.map((group) => ({
    sources: group.sources.map((entry) => ({
      source: {
        ...entry.source,
        // 这一回合带上的名字要穿过整组关着的来源：来源对外开门，名字记进单独开启的名单
        enabled: entry.source.enabled || on.size > 0,
        disabled: [...new Set([...entry.source.disabled.filter((name) => !on.has(name)), ...off])].sort(),
        forced: [...new Set([...(entry.source.forced ?? []), ...on])].sort(),
      },
      skills: entry.skills,
    })),
  }))
}

/**
 * Which candidates to publish for one registry layer.
 * @param groups - sources in priority order, each with the skills found on disk.
 * @param providerName - the provider name every candidate must carry.
 * @returns candidates, hidden twins included, one per name.
 */
export const planCandidates = (groups, providerName) => {
  /** name -> every copy of it, nearest first, with the rank of the source it came from. */
  const copies = new Map()
  for (const group of groups) {
    for (const { source, skills } of group.sources) {
      for (const skill of skills) {
        if (!skill.valid) continue
        const seen = copies.get(skill.name)
        const copy = { source, skill }
        if (seen === undefined) copies.set(skill.name, [copy])
        else seen.push(copy)
      }
    }
  }

  const rows = []
  for (const list of copies.values()) {
    const { copy, hidden } = decide(list)
    // 宿主自己就会把这个目录发出来，可见的候选再发一份只会和它抢同一个名字
    if (hidden === false && copy.source.hostScanned) continue
    rows.push(candidateOf(copy.source, copy.skill, rankOf(copy.source, hidden), hidden, providerName))
  }
  return rows
}
