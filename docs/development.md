# 开发

面向要改这个插件的人。最重要的三件事：改了哪一半、怎么让它生效、跑什么检查。

## 仓库结构

```
.
├── src/
│   ├── index.ts            # host 半边（Cordis 插件）
│   ├── client.ts           # client 半边，被打成单文件 IIFE
│   ├── endpoints.ts        # 远程面的唯一来源：20 个方法名
│   ├── remote.ts           # ⚙ 生成物：客户端 $mount 的描述符
│   ├── typert.ts           # ⚙ 生成物：同一份面的清单对象
│   ├── store.ts            # 记录文件的规范化与目录规则
│   ├── sources.ts          # 本机上各个 agent 的技能目录表
│   ├── plan.ts             # 来源与技能状态 → 注册表候选
│   └── skills.ts           # SKILL.md 的解析与渲染
├── lib/                    # ⚙ 构建产物，不进 git
├── assets/
│   ├── icon.svg            # 插件在插件列表里的图标
│   ├── branding/banner.png # README 头图
│   └── logos/*.svg         # 15 个 agent 的单色图标（生成 src/logos.ts 的输入）
├── scripts/
│   ├── generate-remote.mjs # endpoints.ts → remote.ts / typert.ts
│   ├── generate-logos.mjs  # assets/logos/*.svg → src/logos.ts
│   └── install.sh          # 装进某个 profile
├── test/
│   ├── skills.test.mjs     # SKILL.md 的解析与渲染
│   ├── sources.test.mjs    # 目录解析与优先级
│   ├── plan.test.mjs       # 候选规划与隐藏占位
│   ├── store.test.mjs      # 记录规范化、目录规则、名称派生
│   ├── remote.test.mjs     # 两端产物一致性、端点覆盖、manifest
│   └── fixture/mcp-server.mjs  # 零依赖的 MCP stdio 服务，echo 与 add
├── docs/                   # 本文与 architecture.md
├── cordis.patch.yml        # bundle patch：插入一条 loader 行
├── tsconfig.json           # host：tsc 产出 lib/
└── tsconfig.client.json    # client：只做类型检查，产出交给 esbuild
```

## 命令

```bash
npm install          # 装开发依赖；prepare 会跑一次 build
npm run build        # generate:remote → generate:logos → tsc → esbuild
npm run typecheck    # 两个 tsconfig 都检查，不产出
npm test             # 五个测试文件 + 两份生成物的漂移比对
```

`npm test` 的最后两步是 `generate-remote.mjs --check` 与 `generate-logos.mjs --check`：它们重新生成一遍再和磁盘上的文件比对。改了 `endpoints.ts` 或 `assets/logos/*.svg` 却没重新生成，测试会红。

## 改了代码怎么让它生效

| 改动 | 生效方式 |
|---|---|
| `lib/client.js`（浏览器半边） | 刷新页面 |
| `lib/index.js`（宿主半边） | **重启 `dsh web`**。ESM 按 URL 缓存模块，改文件不会被重新 import |
| `cordis.patch.yml` | 重启。profile 的 bundle 行只在启动时读 |
| `src/endpoints.ts` | 重新 `npm run build`，然后重启 |
| `assets/icon.svg` / `assets/logos/*.svg` | 重新 `npm run build`，然后重启（图标是打包进 manifest 与 bundle 的） |

只重启宿主不刷新页面，会看到"页面调用了新方法、宿主还是旧产物"，通常表现为 `宿主没有提供 snapshot` 之类的提示条。

## 本地跑一遍

1. `npm install && npm run build`
2. 装进一个测试 profile：`bash scripts/install.sh capsui3 .`
3. 起服务：`dsh --profile capsui3 --port 3105 --no-open`，日志尾行给带 token 的地址
4. 打开地址，走完欢迎引导，点账号菜单 → 设置 → SKILL管理 / MCP管理

测试时建议用一个全新 profile，避免自己的 skill 目录干扰判断。

### 手工验证 MCP 链路

`test/fixture/mcp-server.mjs` 是一个换行分隔 JSON-RPC 的 stdio 服务，提供 `echo` 与 `add`：

- MCP 页 → 添加服务器 → 本地进程
- 命令 `node`，参数 `test/fixture/mcp-server.mjs`，工作目录填仓库根
- 保存后卡片上应出现 `mcp__<挂载名>__echo` 与 `mcp__<挂载名>__add`

会话没有活动时卡片显示「会话未激活」，在对话里发一条消息后再看，工具名会出来。

## 测试覆盖了什么

| 文件 | 关注点 |
|---|---|
| `skills.test.mjs` | frontmatter 解析、正文渲染、名称合法性、目录形式的写入 |
| `sources.test.mjs` | 十五行目录表、环境变量覆盖、会话来源、额外目录、优先级、`forced` 透传 |
| `plan.test.mjs` | 三组展开顺序、隐藏占位、只对宿主扫的目录发占位、`forced` 在整组关闭时仍发布 |
| `store.test.mjs` | 记录规范化、空记录清理、`mountNameOf` 派生、服务器 id 稳定性 |
| `remote.test.mjs` | 端点表与宿主侧逐条对应、页面调用的每个方法都存在、产物注释与 manifest、生成物与源码不一致 |

`remote.test.mjs` 里有一条特别的检查：从 `lib/client.js` 里正则抓出所有 `this.run('X')` / `this.call('X')`，逐个核对是否在 `RPC_ENDPOINTS` 里。之前出现过页面调 `toggleSkill`、宿主只有 `toggleSkills` 的问题，那条断言就是为了让这类错在 CI 里失败。

## 常见坑

**agent 上下文的依赖要 inject 拿。** 在 `agent/created` 事件里直接 `agent.ctx.skills` 会抛 `cannot get property "skills" without inject`。正确写法是 `agent.ctx.inject(['skills'], (scoped) => scoped.skills.registerProvider(...))`，返回值是可以 dispose 的 fiber。

**会话 id 不要出现在界面上。** 用户看到的是会话标题；没有标题时用 `未命名会话(session-…)`。挂载标签、选择器、提示条都按这条规则。

**不要给服务器名加长度或字符集限制。** 名称是标签，标识符由 `mountNameOf` 派生。界面上的限制会让中文名直接不能用。

**记录写入一律整份。** 想改一个字段也要走 `editable()` → 改副本 → `commit()`，不要就地 mutate 再写。

**新槽位先确认存在。** 用 `cordis_inspect_query` 的 `Slots.listSubTree` 查 `settings.section`、`sidebar.panellist`、`main`、`conversation.view`、`conversation.input.left`、`plugins.bundle.config`、`shell.overlay` 的注册参数与已占用 key，别凭印象写。

**组件用 class。** 槽位里的组件如果 render 抛错会被错误边界永久退位（页面上出现 `data-slot-error`），所以 `render` 里要 try/catch 兜住。

## 发布前

1. `npm run build && npm run typecheck && npm test` 全绿
2. `package.json` 提版本，`CHANGELOG.md` 加一段
3. `npm pack`，在干净目录里 `npm install` 那个 `.tgz`，确认 `lib/index.js` 与 `lib/client.js` 都在
4. 用新 profile 装这个 tgz 走一遍安装流程
