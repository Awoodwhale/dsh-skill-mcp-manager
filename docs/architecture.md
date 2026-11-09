# 架构

这个插件在 DSH 里做了三件事：给每个作用域注册一个技能供应商、给每条会话挂上它该有的 MCP 连接、把这套记录用界面暴露出来。本文按这顺序讲，面向要改它的人。

## 1. 两个半边与构建

| 半边 | 源码 | 产物 | 跑在哪 | 干什么 |
|---|---|---|---|---|
| host | `src/index.ts` | `lib/index.js` + `.d.ts` | DSH 的 Node 进程 | 读写记录、注册技能供应商、挂载 MCP 连接、对外提供 `skillMcpManager` 远程服务 |
| client | `src/client.ts` | `lib/client.js`（单文件 IIFE） | 浏览器 | 设置两页、侧边栏面板、对话页 tab、输入框临时开关、toast |

```
src/endpoints.ts ──(scripts/generate-remote.mjs)──▶ src/remote.ts + src/typert.ts
                                                        │
src/index.ts    ──tsc──▶ lib/index.js + lib/index.d.ts   │（被 client import 后内联进 bundle）
src/client.ts   ──esbuild --bundle──▶ lib/client.js ◀────┘
```

- `src/endpoints.ts` 是远程面的唯一来源：20 个方法名、服务名 `skillMcpManager`、通道 `/skill-mcp-manager`，以及哪些方法不收参数。
- `src/remote.ts` / `src/typert.ts` 是生成物，不要手改。改完 `endpoints.ts` 跑 `npm run generate:remote`；`npm test` 最后一步会重新生成并比对，漂移就失败。
- `package.json` 里 `dsh.bundle.patch` 指向 `cordis.patch.yml`，那个文件只有一行 `insert`，把本包作为一条 loader 行插进 profile。`dsh.client` 声明了 `platform: web` 与四个要注入的客户端服务，client-modules 顺着这行找到 `exports["./client"]` 并提供给浏览器。

## 2. 记录：一个文件三个作用域

```
$DSH_HOME/dsh-skill-mcp-manager/store.json
```

`src/store.ts` 负责这个文件的形状与规则，`version` 当前是 3。

```
Store
├── prefs          四个显示位置开关
├── global         Scope
├── projects       { 项目根 → Scope }
└── sessions       { 会话 ID → SessionScope（Scope + temp） }

Scope
├── sources        { 来源 id 或绝对路径 → { enabled, dir, disabled, forced } }
└── mcpServers     Server[]
```

写入一律经过「读整份 → 改一份副本 → 规范化 → 整份写回」。`normalize*` 系列函数是记录与磁盘之间唯一的翻译层：坏字段被丢弃或补默认值，从未见过的来源键按自定义目录处理，`forced` 与 `disabled` 去重排序。

`src/sources.ts` 决定一个作用域从哪些目录读技能：内置目录表 15 行、会话自己的目录、以及用户额外添加的绝对路径，按优先级排序，前面的同名技能压过后面的。

## 3. 模型看到什么

宿主有一个技能注册表（`ctx.skills`），它把各个 supplier 提供的候选合起来发布给模型。本插件贡献两类内容：

**全局作用域的供应商**注册在宿主上下文的 global 层。它读 `global` 记录，把开着的技能报上去，把关掉的技能以同名但 `modelInvocable: false` 的隐藏候选报上去。

**每条会话的供应商**注册在那个 agent 自己的层上，一次发布三组：会话组、项目组、全局组。`src/plan.ts` 把三组按顺序展开为候选列表，第一个出现某个名字的那一层就是这个名字的最终归属。这条规则让"会话压过项目、项目压过全局"不需要在注册表之外再写一遍。

`src/plan.ts` 的判定：

```
开着 = (来源开着 || 这个技能在 forced 里) && 不在 disabled 里 && 不在 temp.offSkills 里
       或者 在 temp.onSkills 里
```

关掉的、以及在作用域里被更靠前来源盖住的名字，都发一个 hidden twin：名字占位、不可调用。宿主自带的目录读取器会无视这些占位继续读文件，但模型的清单里同名条目只会保留一个——就是这一层发的那个。

**为什么 hidden twin 是必要的**：DSH 与通用 Agent 两行是宿主自己扫的目录。如果本插件只对自己注册的目录负责，"关掉"就只是少发一个已经被人发过的名字，等于没关。发同名的不可调用占位，才能把名字从模型那里拿走。

## 4. MCP 连接

服务器记录跟着作用域走，连接由宿主启动。挂载流程是：对一个会话，按 会话 → 项目 → 全局 收集服务器记录，同名只取最近的一层，然后逐个连接，注册到那个 agent 的工具层。

因此同一条会话能临时拿掉某个服务器——它没有被放进这一轮的连接集合。

连接刚建立时工具名还没到，`mcpStatus` 会返回 `pending: true`，页面隔一秒重读，直到数字稳定（`MCP_SETTLE_MS` 是 4 秒的宽限期）。

名字派生：`mountNameOf` 把服务器名变成宿主接受的 `serverName`。能直接用的原样用，否则清洗字符并接一段由名字算出的短后缀（FNV-1a 取 6 位），确保稳定、不撞。工具名是 `mcp__<挂载名>__<工具名>`。

## 5. 界面挂在哪

| 界面 | 槽位 | 谁渲染 |
|---|---|---|
| 设置左栏两项 | `settings.section`（order 23 / 24） | `ManagerPage`，`page` 属性区分 skill 与 mcp |
| 左侧栏图标 | `sidebar.panellist` | 两个图标，点击切到同名 `main` 面板 |
| 对话页顶部 tab | `conversation.view` | 同一个 `ManagerPage`，`sessionId` 属性让它进入内嵌模式 |
| 输入框左下角 | `conversation.input.left` | `ComposerToggles` |
| 插件详情页 | `plugins.bundle.config` | `PluginSettings`，四个显示位置开关 |
| 提示条 | `shell.overlay` | `NoticeHost`，订阅模块里的 `notify` |

后四处受 `prefs` 控制：`syncShell(prefs)` 在一次 prefs 变化时重新注册或注销对应槽位，所以开关一拨立刻生效，不用刷新。

`ManagerPage` 在内嵌模式下去掉作用域 tab，改成纵向堆叠三段（这条会话 → 项目 → 全局），每段自带来源卡片与开关，操作作用在各自的记录上。设置页沿用作用域 tab，一次只看一层。

## 6. 远程调用

宿主把 `CapabilitiesService extends TypertRemoteService` 挂在服务名 `skillMcpManager` 上，页面这边 `await ctx.remote.$mount(RPC_REMOTE)` 之后 `ctx.get('remote.skillMcpManager')` 拿到客户端对象。

返回值有两种形状：直接的值，或者 `{ ok: true, value }` / `{ ok: false, error }` 信封。`unwrap` 统一展开，失败抛错，`call` 再把它变成 `{ error: string }` 交给调用点。调用有 20 秒上限，传输层卡住时页面不会一直转圈。

每次变更（保存、删除、启停、改动位置）都返回整份 `view()`，页面直接替换状态，不需要再拉一次快照。

## 7. 为什么不写 config

MCP 连接如果写进 profile 的 `cordis.patch.yml`，它只能表达"这台机器上全局有一行"，无法表达"只在这个项目""只在这一条会话"。本插件因此全部在运行时挂载：记录是数据，连接是挂载动作的结果，配置层面只有一条 loader 行。
