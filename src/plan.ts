// @ts-nocheck
/**
 * Turning ordered skill sources into the candidates one provider publishes.
 *
 * The provider never edits a skill file: a folder or a single skill the user switched
 * off is expressed as a hidden twin of the same name, which the registry places ahead
 * of the shipped provider and which the model-facing tool filters out. Only folders
 * the shipped providers read on their own need such a twin: a folder nobody else
 * publishes can simply stay silent, and staying silent keeps the registry honest about
 * what the model really sees.
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

const forcedOn = (source, skill) => (source.forced ?? []).includes(skill.name)

const isOn = (source, skill) => (source.enabled || forcedOn(source, skill)) && !source.disabled.includes(skill.name)

/**
 * Which candidates to publish for one registry layer.
 *
 * A name is decided once per layer: an enabled copy anywhere in the layer keeps the
 * name visible, and the shipped folder's copy becomes a hidden twin when nobody
 * enables it. That way switching off the DSH copy of `pdf` leaves the Claude copy
 * readable, while switching off every copy really removes the name from the model's
 * catalog.
 * @param groups - sources in priority order, each with the skills found on disk.
 * @param providerName - the provider name every candidate must carry.
 * @returns candidates, hidden twins included.
 */
export const planCandidates = (groups, providerName) => {
  const enabledNames = new Set()
  for (const group of groups) {
    for (const { source, skills } of group.sources) {
      for (const skill of skills) {
        if (skill.valid && isOn(source, skill)) enabledNames.add(skill.name)
      }
    }
  }
  const rows = []
  const shadowed = new Set()
  let rank = 10
  for (const group of groups) {
    for (const { source, skills } of group.sources) {
      const sourceRank = rank++
      for (const skill of skills) {
        if (!skill.valid) continue
        if (isOn(source, skill)) {
          // The shipped provider already publishes this folder; a second copy of the
          // same candidate would only race with it for the same name.
          if (source.hostScanned) continue
          rows.push(candidateOf(source, skill, sourceRank, false, providerName))
          continue
        }
        if (enabledNames.has(skill.name) || shadowed.has(skill.name)) continue
        // Nothing else publishes this folder, so a twin would only add a name to the
        // registry list that the model was never able to see in the first place.
        if (!source.hostScanned) continue
        shadowed.add(skill.name)
        rows.push(candidateOf(source, skill, sourceRank, true, providerName))
      }
    }
  }
  return rows
}
