// 该文件由 scripts/generate-remote.mjs 生成，请勿手改（改 src/endpoints.ts 后重新生成）。
import { z } from "zod"

const PKG = "@awoodwhale/dsh-skill-mcp-manager"
const SERVICE = "skillMcpManager"
const direct = { kind: "direct" }
const jsonCodec = (typeSymbol) => {
  const schema = z.unknown()
  return {
    mode: "strict",
    typeSymbol: `${PKG}#${typeSymbol}`,
    schema,
    create: () => schema,
    decode: (v) => v,
    encode: (v) => v,
  }
}
const result = (typeSymbol) => jsonCodec(typeSymbol)

export const TYPERT = {
  package: PKG,
  face: "host",
  schemas: [],
  model: {
    services: [
      {
        tags: [],
        key: SERVICE,
        exportName: SERVICE,
        description: "Project- and session-scoped skills and MCP servers.",
        summary: "Agent capability management service",
        jsDoc: "The host service for listing, editing, and mounting skills and MCP servers per scope.",
        members: [
          { name: "snapshot", kind: "method", signature: "(): Promise<unknown>" },
          { name: "refreshSkills", kind: "method", signature: "(): Promise<unknown>" },
          { name: "saveSource", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "addSource", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "removeSource", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "toggleSkills", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "saveServers", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "savePrefs", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "setTemp", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "composerState", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "deleteScope", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "listSkills", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "readSkill", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "saveSkill", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "deleteSkill", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "skillCatalog", kind: "method", signature: "(input: unknown): Promise<unknown>" },
          { name: "mcpStatus", kind: "method", signature: "(): Promise<unknown>" },
          { name: "listSessions", kind: "method", signature: "(): Promise<unknown>" },
          { name: "listProjects", kind: "method", signature: "(): Promise<unknown>" },
          { name: "listDir", kind: "method", signature: "(input: unknown): Promise<unknown>" },
        ],
        types: [],
      },
    ],
    events: [],
    objects: [],
  },
  invocations: [
        {
          id: `${PKG}#${SERVICE}/snapshot`,
          service: SERVICE,
          namespace: SERVICE,
          method: "snapshot",
          invocation: direct,
          parameters: [],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/refreshSkills`,
          service: SERVICE,
          namespace: SERVICE,
          method: "refreshSkills",
          invocation: direct,
          parameters: [],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/saveSource`,
          service: SERVICE,
          namespace: SERVICE,
          method: "saveSource",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/addSource`,
          service: SERVICE,
          namespace: SERVICE,
          method: "addSource",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/removeSource`,
          service: SERVICE,
          namespace: SERVICE,
          method: "removeSource",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/toggleSkills`,
          service: SERVICE,
          namespace: SERVICE,
          method: "toggleSkills",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/saveServers`,
          service: SERVICE,
          namespace: SERVICE,
          method: "saveServers",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/savePrefs`,
          service: SERVICE,
          namespace: SERVICE,
          method: "savePrefs",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/setTemp`,
          service: SERVICE,
          namespace: SERVICE,
          method: "setTemp",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/composerState`,
          service: SERVICE,
          namespace: SERVICE,
          method: "composerState",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/deleteScope`,
          service: SERVICE,
          namespace: SERVICE,
          method: "deleteScope",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/listSkills`,
          service: SERVICE,
          namespace: SERVICE,
          method: "listSkills",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/readSkill`,
          service: SERVICE,
          namespace: SERVICE,
          method: "readSkill",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/saveSkill`,
          service: SERVICE,
          namespace: SERVICE,
          method: "saveSkill",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/deleteSkill`,
          service: SERVICE,
          namespace: SERVICE,
          method: "deleteSkill",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/skillCatalog`,
          service: SERVICE,
          namespace: SERVICE,
          method: "skillCatalog",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/mcpStatus`,
          service: SERVICE,
          namespace: SERVICE,
          method: "mcpStatus",
          invocation: direct,
          parameters: [],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/listSessions`,
          service: SERVICE,
          namespace: SERVICE,
          method: "listSessions",
          invocation: direct,
          parameters: [],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/listProjects`,
          service: SERVICE,
          namespace: SERVICE,
          method: "listProjects",
          invocation: direct,
          parameters: [],
          result: result("Json"),
        },
        {
          id: `${PKG}#${SERVICE}/listDir`,
          service: SERVICE,
          namespace: SERVICE,
          method: "listDir",
          invocation: direct,
          parameters: [
        {
          name: "input",
          wire: "input",
          source: "json",
          codec: jsonCodec("Json"),
        },
      ],
          result: result("Json"),
        },
  ],
}
