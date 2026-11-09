// 一个最小的 MCP stdio 服务，用来手动验证「添加服务器 → 连上 → 列出工具 → 调用工具」这条链路。
// 换行分隔的 JSON-RPC 2.0，没有第三方依赖：
//
//   node test/fixture/mcp-server.mjs
//
// 在「能力管理」里添加：连接方式「本地进程」、命令 node、参数 test/fixture/mcp-server.mjs。
import { createInterface } from 'node:readline'

const SERVER_INFO = { name: 'fixture-tools', version: '1.0.0' }

const TOOLS = [
  {
    name: 'echo',
    description: '回显传入的文本',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: '要回显的文本' } },
      required: ['text'],
    },
  },
  {
    name: 'add',
    description: '把两个整数相加',
    inputSchema: {
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    },
  },
]

const reply = (id, result) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

const fail = (id, code, message) => {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
}

const answerTool = (name, args) => {
  if (name === 'echo') {
    const text = typeof args?.text === 'string' ? args.text : ''
    return { content: [{ type: 'text', text: `echo: ${text}` }] }
  }
  if (name === 'add') {
    const total = Number(args?.a ?? 0) + Number(args?.b ?? 0)
    return { content: [{ type: 'text', text: String(total) }] }
  }
  return undefined
}

const handle = (message) => {
  const { id, method, params } = message
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : '2024-11-05',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
    })
    return
  }
  if (method === 'tools/list') {
    reply(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    const result = answerTool(params?.name, params?.arguments)
    if (result === undefined) fail(id, -32602, `未知工具：${String(params?.name)}`)
    else reply(id, result)
    return
  }
  if (method === 'ping') {
    reply(id, {})
    return
  }
  if (id === undefined) return
  fail(id, -32601, `不支持的方法：${String(method)}`)
}

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })
lines.on('line', (line) => {
  const text = line.trim()
  if (text === '') return
  const message = JSON.parse(text)
  handle(message)
})
