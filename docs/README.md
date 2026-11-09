# 仓库说明

这是 `dsh-skill-mcp-manager` 这个 DSH 插件的源码仓库。仓库里没有第三方生成物，唯一的来源是 `src/`，其余都是它的构建结果或辅助材料。

## 目录

| 路径 | 是什么 |
|---|---|
| `src/` | 源码。`index.ts` 是宿主半边，`client.ts` 是浏览器半边，`endpoints.ts` 是远程面唯一来源，`store.ts`/`sources.ts`/`plan.ts`/`skills.ts` 是纯逻辑，`remote.ts`/`typert.ts`/`logos.ts` 是生成物 |
| `lib/` | 构建产物，不进 git。由 `npm run build` 产出，`main` 与 `exports` 指向这里 |
| `assets/` | 图标源。`icon.svg` 是插件列表与设置页用的图标，`branding/banner.jpg` 是文档头图，`logos/*.svg` 是十个品牌的单色图标（WorkBuddy 与 CodeBuddy 共用同一个） |
| `scripts/` | `generate-remote.mjs` 由端点表生成两份描述文件，`generate-logos.mjs` 由图标源生成 `src/logos.ts`，`install.sh` 把插件装进一个 profile |
| `test/` | 五个测试文件与一个零依赖的 MCP stdio 服务（`test/fixture/mcp-server.mjs`） |
| `docs/` | 面向开发者的说明：`architecture.md` 讲结构，`development.md` 讲怎么跑、怎么改、哪里容易踩到问题，`images/` 是 README 用的截图 |
| `.github/workflows/ci.yml` | 每个提交跑两个任务：全平台测试与打包冒烟 |

## 三条不许破的规矩

**`src/remote.ts` 与 `src/typert.ts` 不要手改。** 它们是 `src/endpoints.ts` 的投影，`npm test` 与 CI 都会重新生成一次再比对，改错或漏改都会让检查失败。要加方法，就去 `endpoints.ts` 里加一行。

**`src/logos.ts` 不要手改。** 它由 `assets/logos/*.svg` 生成，每个图标必须恰好一条 `path` 且 `viewBox` 是 `0 0 24 24`。加新图标就放一个新 svg 进去再生成。

**界面不出现会话 id。** 会话是给人看的，标签用标题；没有标题时是 `未命名会话(session-…)`。挂载标签、选择器、提示条都按这条规则走。

## 提交之前

```bash
npm run build && npm run typecheck && npm test
```

三条都过再提交。改了 `endpoints.ts` 或 `assets/logos/` 却忘了生成，第二条会直接指出哪个文件漂移了。

版本号、改动记录写在 `package.json` 与 `CHANGELOG.md` 里，两者同步更新。

## 与其他仓库的关系

- 安装与使用说明在根目录 `README.md`，面向使用者。
- 想改这个插件，从 `docs/development.md` 开始。
- 想知道为什么这样设计，看 `docs/architecture.md`。
