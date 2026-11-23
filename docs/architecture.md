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

写入一律经过「读整份 → 改一份副本 → 规范化 → 整份写回」。`normalize*` 系列函数是记录与磁盘之间唯一的翻译层：坏字段被丢弃或补默认值，从未见过的来源键按自定义目录处理，`forced` 与 `disabled` 去重。

`src/sources.ts` 决定一个作用域从哪些目录读技能：内置目录表 15 行、会话自己的目录、以及用户额外添加的绝对路径，按优先级排序，前面的同名技能压过后面的。

同一个目录还有一份心跳 `state.json`：这次加载的时间、产物的绝对路径、插件版本、是本地副本还是 npm 安装、记录文件位置、当前的挂载数（每条会话一个技能供应商，加上每个已连接的 MCP 服务器）。它不参与任何判定，页面与支持问题排查读它。

## 3. 模型看到什么

宿主有一个技能注册表（`ctx.skills`），它把各个 supplier 提供的候选合起来发布给模型。本插件在每个 agent 自己的层上注册一个供应商，一次发布三组：会话组、项目组、全局组。`src/plan.ts` 把三组按顺序展开，按名字分组，每组只发一条候选——最近的那一份副本说了算。这条规则让"会话压过项目、项目压过全局"不需要在注册表之外再写一遍。

`src/plan.ts` 的判定：

```
开着 = (这一次带上 || 记录里开着) && 不在 temp.offSkills 里
记录里开着 = 来源开着 && 不在 disabled 里 && (整组开着 || 在 forced 里)
```

`src/sources.ts` 的 `switchesOf` 先把记录换算成四栏：`groupOn` 是总开关；`forced` 是整组关着时单独打开的名字，整组开着时为空；`enabled` 表示这个来源有没有名字可发（整组开着，或者单独开了至少一个）；`disabled` 是记录里单独关掉的名字减去被单独打开的那些。`skillOn` 按上面第二行判定一个名字。这一次的开关由 `withTemp` 叠在记录上：`onSkills` 里的名字从 `disabled` 里拿掉并加进 `forced`，`offSkills` 里的名字加进 `disabled`。

一个名字在一层里只发一条候选，是模型清单与斜杠菜单口径一致的来源：注册表对每个名字只解析一次，先按排名排序，再去重同名。

最近的副本关着，这个名字就在整个作用域里关掉，更远的层不会把它接回去。这一层于是发一条同名的不可调用候选，两个调用开关都是 `false`，排名比它自己的来源再往前一位。注册表按排名排序再去重同名，所以这条占位一定先占住名字，然后什么都不发，名字就从模型清单与斜杠菜单里一起消失。

**为什么靠排名而不是靠不发**：注册表把全局层和作用域的每一层合在一起，同名时靠后的一层覆盖靠前的一层。本插件只发自己那部分时，宿主自带读取器扫到的同名副本仍会在登记表里，名字照样出现。占位必须排到那份副本前面才压得住它，所以对宿主自己会扫的目录（DSH 与通用 Agent 两行），来源的排名取那个读取器的排名减一，占位再往前一位，也就是读取器的排名减二（`SHIPPED_RANKS`：项目 DSH 100、项目 Agent 200、自定义 300、用户 DSH 400、用户 Agent 500、内置 600）。

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
| 输入框左下角 | `conversation.input.left` | `ComposerToggles`，按钮上的文字是 `能力` |
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
