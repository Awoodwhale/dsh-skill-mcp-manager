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
 * A folder the shipped providers read on their own is special. Even when this plugin
 * publishes nothing for it, that reader still publishes the name, so a name switched
 * off there has to be answered in the same scope with a hidden twin of the same name.
 * A folder nobody else reads needs no twin: staying silent already removes the name.
 */

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
  resourceBase: { kind: 'directory', path: source.dir },
})

const isOn = (source, skill) => source.enabled && !source.disabled.includes(skill.name)

/**
 * The copy that speaks for one name in this scope, and whether it is audible.
 *
 * `copies` arrives in registry priority order. The nearest copy decides: switched on,
 * it is the one the model and the slash menu may see; switched off, the name is off for
 * this whole scope, whichever folders further out still hold a copy. Only when the
 * nearest copy sits in a folder a shipped reader publishes on its own does that reader
 * need an answer — a hidden twin there covers the name it is about to give out. A folder
 * nobody else reads needs no twin, so the name simply disappears.
 * @param copies - every copy of one name, nearest first.
 * @returns the copy to publish, or undefined when the name simply disappears.
 */
const decide = (copies) => {
  const nearest = copies[0]
  if (isOn(nearest.source, nearest.skill)) return { ...nearest, hidden: false }
  if (!nearest.source.hostScanned) return undefined
  return { ...nearest, hidden: true }
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
  let rank = 10
  for (const group of groups) {
    for (const { source, skills } of group.sources) {
      const sourceRank = rank++
      for (const skill of skills) {
        if (!skill.valid) continue
        const seen = copies.get(skill.name)
        const copy = { source, skill, rank: sourceRank }
        if (seen === undefined) copies.set(skill.name, [copy])
        else seen.push(copy)
      }
    }
  }

  const rows = []
  for (const list of copies.values()) {
    const chosen = decide(list)
    if (chosen === undefined) continue
    // 宿主自带的读取器自己就会发布这个目录，这里再发一份只会和它抢同一个名字
    if (chosen.hidden === false && chosen.source.hostScanned) continue
    rows.push(candidateOf(chosen.source, chosen.skill, chosen.rank, chosen.hidden, providerName))
  }
  return rows
}
