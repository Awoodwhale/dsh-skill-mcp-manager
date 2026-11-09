// 该文件由 scripts/generate-remote.mjs 生成，请勿手改（改 src/endpoints.ts 后重新生成）。
const PKG = "dsh-skill-mcp-manager"
const SERVICE = "skillMcpManager"
const CHANNEL = "/skill-mcp-manager"

const codec = (typeSymbol, parse) => {
  const schema = { parse }
  return {
    mode: "strict",
    typeSymbol: `${PKG}#${typeSymbol}`,
    schema,
    create: () => schema,
    decode: (v) => v,
    encode: (v) => v,
  }
}
const passthrough = (value) => value
const asInput = (value) => {
  if (value === undefined || value === null) return {}
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("input must be an object")
  return value
}
const withInput = () => [
  { name: "input", wire: "input", source: "json", codec: codec("Input", asInput) },
]
const method = (name, parameters) => ({
  id: `${PKG}#${SERVICE}/${name}`,
  channel: CHANNEL,
  service: SERVICE,
  namespace: SERVICE,
  method: name,
  invocation: { kind: "direct" },
  parameters,
  result: codec("View", passthrough),
})

/**
 * What the browser half mounts: ctx.remote.$mount(RPC_REMOTE). The field set matches the shape that
 * worked before this file was generated — an id per descriptor, a strict codec for the input, and an
 * empty parameter list for the reads that take none.
 */
export const RPC_REMOTE = {
  package: PKG,
  descriptors: [
    method("snapshot", []),
    method("refreshSkills", []),
    method("saveSource", withInput()),
    method("addSource", withInput()),
    method("removeSource", withInput()),
    method("toggleSkills", withInput()),
    method("saveServers", withInput()),
    method("savePrefs", withInput()),
    method("setTemp", withInput()),
    method("composerState", withInput()),
    method("deleteScope", withInput()),
    method("listSkills", withInput()),
    method("readSkill", withInput()),
    method("saveSkill", withInput()),
    method("deleteSkill", withInput()),
    method("skillCatalog", withInput()),
    method("mcpStatus", []),
    method("listSessions", []),
    method("listProjects", []),
    method("listDir", withInput()),
  ],
}
