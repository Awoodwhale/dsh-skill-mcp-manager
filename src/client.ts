/**
 * skill-mcp-manager — browser half.
 *
 * Two settings pages, one sidebar entry each, a conversation tab each, and a
 * coming-turn list in the composer. Every page draws only what the host snapshot
 * says: a group exists because the directory exists, a skill exists because a file
 * parses. Every edit goes back through one remote call that answers with a fresh
 * snapshot, so a second tab cannot leave this one stale.
 */
import { RPC_REMOTE } from './remote.js'
import { AGENT_LOGO } from './logos.js'

declare global {
  interface Window {
    /** The client runtime hands every plugin this loader; see the DSH plugin standard. */
    __ModuleLoader__: {
      load: (entry: { id: string; factory: (require: (name: string) => any) => unknown }) => void
    }
  }
}

window.__ModuleLoader__.load({
  // The module system keys this entry by package name, so the id must be the
  // package name verbatim; a pseudo name leaves the plugin unregistered.
  id: '@awoodwhale/dsh-skill-mcp-manager',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    /** The published package name. Slot keys that name a bundle use it verbatim. */
    const PACKAGE_NAME = '@awoodwhale/dsh-skill-mcp-manager'
    const Button = primitives.Button
    const Input = primitives.Input
    const Modal = primitives.Modal
    const SegmentedControl = primitives.SegmentedControl
    const Switch = primitives.Switch
    const Tooltip = primitives.Tooltip

    const NS = 'skill-mcp-manager'
    /** The locale namespace this plugin owns; nothing else registers under it. */
    const LOCALE_NS = 'skillMcpManager'

    /**
     * Bumped whenever the language changes. Every page reads it into its state and
     * redraws on the new number, so a switch in the language menu reaches this
     * plugin's pages the same way it reaches the shipped ones.
     */
    let localeRevision = 0
    const localeListeners: Set<() => void> = new Set()
    const watchLocale = () => {
      localeRevision += 1
      for (const listener of localeListeners) listener()
    }

    /**
     * Icons are looked up by name: a primitives build that drops one must cost that
     * icon, not the whole settings entry (an uncaught render error in a slot cell is
     * permanent).
     */
    const iconOf = (name, size) => {
      const component = primitives[name]
      if (component === undefined || component === null) return undefined
      return (props) => h(component, { size, ...props })
    }
    const IconPlus = iconOf('IconPlusOutlineRegular', 14)
    const IconTrash = iconOf('IconTrashOutlineRegular', 14)
    const IconRefresh = iconOf('IconRefreshOutlineRegular', 14)
    const IconFolder = iconOf('IconFolderOpenRegular', 14)
    const IconEdit = iconOf('IconEditOutlineRegular', 14)
    const IconClose = iconOf('IconCloseOutlineRegular', 14)
    const IconSearch = iconOf('IconSearchOutlineRegular', 14)
    const IconChevron = iconOf('IconChevronDownOutlineRegular', 14)
    const IconCheck = iconOf('IconCheckOutlineRegular', 14)
    const IconWarning = iconOf('IconWarningOutlineRegular', 14)
    const IconSkill = iconOf('IconSkillOutlineRegular', 16)
    const IconServer = iconOf('IconApiOutlineRegular', 16)
    const icon = (Component, props) => (Component === undefined ? null : h(Component, props))

    /** Sidebar icons take the size the shell hands them. */
    const SkillsPanelIcon = ({ size }) => (IconSkill === undefined ? null : h(IconSkill, { size }))
    const ServersPanelIcon = ({ size }) => (IconServer === undefined ? null : h(IconServer, { size }))

    const PANEL_SKILLS = 'skill-mcp-manager-skills'
    const PANEL_MCP = 'skill-mcp-manager-mcp'

    /**
     * Every string this plugin draws, in both languages. The key names the place
     * it appears; a sentence that holds a number keeps the number inside the
     * sentence, because Chinese and English order the count and the noun
     * differently and a shared prefix cannot serve both.
     */
    const zh = {
      'scope.global': '全局技能',
      'scope.global.hint': '这台机器上每个会话都读到的技能',
      'scope.project': '项目技能',
      'scope.project.hint': '只在某一个项目里读到的技能',
      'scope.session': '会话技能',
      'scope.session.hint': '只在一条会话里读到的技能',
      'scope.global.short': '全局',
      'scope.project.short': '项目',
      'scope.session.short': '会话',
      'transport.stdio': '本地进程',
      'transport.stdio.hint': '用一条命令启动服务器，两者通过标准输入输出通信',
      'transport.http': 'HTTP',
      'transport.http.hint': '连到已经在运行的服务器地址',
      'state.all': '全部状态',
      'state.enabled': '已启用',
      'state.disabled': '已停用',
      'state.broken': '解析异常',
      'form.dir': '目录',
      'form.dir.hint': '一个技能一个目录，可以在 SKILL.md 旁边放资源文件',
      'form.file': '单文件',
      'form.file.hint': '一个技能一个 .md 文件，写起来快，放不了附件',
      'title.skills': 'SKILL管理',
      'title.mcp': 'MCP管理',
      'title.both': 'SKILL 与 MCP',
      'sub.skills': '技能按存放它的 Agent 分组，来源与单个技能都可以随时停用。停用不会改动磁盘上的任何文件，只影响模型能不能看到。',
      'sub.mcp': 'MCP 服务器按范围连接，最近的那个范围里同名服务器生效。这里改的连接只在保存后生效，工具以 mcp__挂载名__ 前缀出现在模型里。',
      'head.entry': '入口',
      'head.entry.title': '选择这个插件出现在哪些位置',
      'head.refresh': '刷新',
      'head.refreshing': '刷新中…',
      'head.record': '记录文件',
      'head.record.reset': '记录已重置',
      'anchor.project': '项目',
      'anchor.project.pick': '选择项目',
      'anchor.project.none': '选择项目目录',
      'anchor.project.other': '换一个项目',
      'anchor.project.recent': '会话里出现过的项目',
      'anchor.session': '会话',
      'anchor.live': '{n} 条在线',
      'anchor.unnamed': '未命名会话',
      'anchor.session.filter': '按名称或目录筛选',
      'anchor.session.filter.label': '筛选会话',
      'anchor.this': '这一层',
      'action.create': '新建技能',
      'action.addSource': '添加目录',
      'action.catalog': '核对模型视角',
      'stats.skills': '个技能',
      'stats.enabled': '个已启用',
      'stats.disabled': '个已停用',
      'stats.sources': '个来源在用',
      'filter.source': '按来源筛选',
      'filter.source.all': '全部来源',
      'filter.source.option': '{label}（{n}）',
      'filter.state': '按状态筛选',
      'filter.query': '搜索技能名称或说明',
      'filter.query.label': '搜索技能',
      'empty.noProject': '还没有选中的项目',
      'empty.noSession': '还没有已知的会话',
      'empty.noProject.body': '选一个项目目录，就能看到它里面各个 Agent 的技能目录。',
      'empty.noSession.body': '开一条会话之后，这里会列出它的技能目录。',
      'empty.noSource': '这个范围还没有技能来源',
      'empty.noMatch': '没有符合筛选条件的技能',
      'empty.noSource.body': '添加一个目录，或者新建一个技能。',
      'empty.noMatch.body': '换一个来源或状态再试。',
      'source.tag.session': '会话目录',
      'source.tag.custom': '自定义目录',
      'source.tag.host': '内置读取',
      'source.tag.off': '已停用',
      'source.tag.forced': '单独开启 {n} 个',
      'source.group.off': '整组停用',
      'source.group.on': '整组启用',
      'source.group.off.title': '把这一组技能全部停用',
      'source.group.on.title': '把这一组技能全部启用',
      'source.enable': '启用来源 {label}',
      'source.enable.title': '启停这个来源里的全部技能',
      'source.remove': '移除 {label}',
      'source.fold': '收起 {label}',
      'source.path.missing': '这个目录还不存在，换一个路径，或者先建好目录。',
      'source.path.empty': '这个目录里还没有技能。',
      'source.path.session': '这个目录会在第一次新建技能时创建。',
      'skill.tag.file': '单文件',
      'skill.tag.broken': '解析异常',
      'skill.tag.forced': '单独开启',
      'skill.tag.noModel': '不自动加载',
      'skill.tag.noUser': '不接受 / 命令',
      'skill.noDescription': '没有写说明',
      'skill.enable': '启用技能 {name}',
      'skill.edit': '编辑 {name}',
      'skill.delete': '删除 {name}',
      'server.tag.stdio': '本地进程',
      'server.tag.http': 'HTTP',
      'server.tag.dormant': '会话未激活',
      'server.tools': '{n} 个工具',
      'server.live.hint': '这条会话还没有活动，工具要等会话开始后才连上',
      'server.edit': '编辑服务器 {name}',
      'server.delete': '删除服务器 {name}',
      'server.refresh': '刷新状态',
      'server.add': '添加服务器',
      'server.empty': '这个范围还没有 MCP 服务器',
      'server.empty.body': '添加之后，它的工具会以 mcp__挂载名__ 前缀出现在这个范围的模型里。',
      'zone.session': '这条会话',
      'zone.session.hint': '只在这条会话里生效，比项目和全局都近',
      'zone.project.hint': '同一个项目里的每条会话都会读到',
      'zone.global': '全局',
      'zone.global.hint': '所有项目和会话都会读到',
      'zone.servers': '{n} 个服务器',
      'zone.skills': '{n} 个技能',
      'zone.empty.session': '这条会话还没有自己的技能',
      'zone.empty.session.body': '新建技能会写进这条会话自己的目录，只有它读得到。',
      'catalog.title': '模型现在能看到的技能',
      'catalog.noAnchor': '这个范围还没有目标',
      'catalog.sub': '这一份名单来自技能注册表本身，是模型决定加载技能时读到的目录。',
      'catalog.loading': '正在读取…',
      'catalog.empty': '这个范围里没有模型能看到的技能。',
      'catalog.hidden': '另有 {n} 个名字被停用或被更近的范围挡在后面。',
      'catalog.hidden.more': '另有 {n} 个名字被停用或被更近的范围挡在后面，模型读不到。',
      'editor.create': '新建技能',
      'editor.edit': '编辑 {name}',
      'editor.create.sub': '写进所选来源的目录。保存之后，这条会话立刻能从目录里看到它。',
      'editor.edit.sub': '改名字等于改目录名；正文与说明直接写进 SKILL.md。',
      'editor.new': '新技能',
      'editor.editing': '修改中',
      'editor.cancel': '取消',
      'editor.save': '保存',
      'editor.saving': '保存中…',
      'field.name': '名称',
      'field.name.hint': '小写字母、数字和连字符，也是目录名',
      'field.name.label': '技能名称',
      'field.when': '什么时候用',
      'field.when.hint': '可选，写给模型的触发条件',
      'field.when.label': '触发条件',
      'field.when.placeholder': '用户要求处理 PDF 时',
      'field.description': '说明',
      'field.description.count': '{n} 字',
      'field.description.hint': '模型只靠这句话判断要不要加载这个技能，写清楚它能做什么。',
      'field.description.label': '技能说明',
      'field.description.placeholder': '把 PDF 逐页导成图片，并抽出其中的表格。',
      'field.body': '正文',
      'field.body.hint': '加载技能时读到的 Markdown，可以在目录里放资源文件再引用。',
      'field.body.label': '技能正文',
      'field.form': '存放形式',
      'field.willWrite': '将写入',
      'field.alsoInDir': '目录里还有',
      'toggle.model': '允许模型自动加载',
      'toggle.model.hint': '关掉后只在 / 命令里出现',
      'toggle.user': '允许用户用 / 命令调用',
      'toggle.user.title': '允许 / 命令调用',
      'toggle.user.hint': '关掉后输入框里不出现它',
      'points.saved': '保存之后，{anchor}的技能目录里立刻能读到它。',
      'points.modelReads': '模型只读名称、说明和触发条件，正文在真正加载时才读。',
      'points.hideOnly': '把技能停用只是把它藏起来，磁盘上的文件不会被改动。',
      'serverEditor.create': '添加 MCP 服务器',
      'serverEditor.sub': '连接成功后，工具会以 mcp__挂载名__ 前缀出现，模型按需调用。挂载名就是服务器名，名字里有宿主不接受的字符时换成右侧预览里的 serverName。',
      'serverEditor.scope': '写入范围 · {anchor}',
      'field.serverName': '名称',
      'field.serverName.hint': '随便起名，中文也行；重名会被更靠近的范围遮住',
      'field.serverName.label': '服务器名称',
      'field.transport': '连接方式',
      'field.command': '命令',
      'field.command.hint': '相对路径按工作目录解析。',
      'field.command.label': '启动命令',
      'field.url': '地址',
      'field.url.hint': '已经跑起来的服务器，例如 http://127.0.0.1:8931/mcp',
      'field.url.label': '服务器地址',
      'field.args': '参数',
      'field.args.count': '{n} 个',
      'field.args.hint': '一行一个，直接交给进程，不经过 shell。',
      'field.args.label': '命令参数',
      'field.cwd': '工作目录',
      'field.cwd.hint': '进程从这里启动，留空用宿主的工作目录',
      'field.cwd.label': '工作目录',
      'field.cwd.pick': '选择',
      'field.env': '环境变量',
      'field.env.hint': '逐条列出，会加到子进程的环境里。',
      'field.header': '请求头',
      'field.header.hint': '逐条列出，随每次请求发出。值里可以有等号。',
      'field.pair.key': '第 {n} 条的键',
      'field.pair.value': '第 {n} 条的值',
      'field.pair.drop': '删除第 {n} 条',
      'field.pair.drop.title': '删除这一条',
      'field.pair.addEnv': '添加变量',
      'field.pair.addHeader': '添加请求头',
      'field.pair.noKey': '缺少键名：{value}',
      'field.pair.duplicate': '重复的键：{key}',
      'preview.mount': '挂载参数',
      'points.toolPrefix': '工具名会带上 mcp__{name}__ 前缀。',
      'points.scopeOnly': '只挂到{anchor}，别的范围看不到这些工具。',
      'points.stdioLive': '保存后立刻启动进程，停用或删除时进程一起退出。',
      'points.httpLive': '保存后立刻连上去，删掉就断开。',
      'picker.project': '选择项目目录',
      'picker.cwd': '选择工作目录',
      'picker.source': '添加技能目录',
      'picker.project.sub': '选中之后，这一页会扫描该项目里各个 Agent 的技能目录。',
      'picker.source.sub': '选中之后，这个目录会被当作一个技能来源添加进来。',
      'picker.use': '用这个目录',
      'picker.scan': '扫描这个项目',
      'picker.add': '添加这个目录',
      'picker.up': '上一层',
      'picker.empty': '这里没有子目录。',
      'picker.noSession': '还没有选中会话',
      'picker.editing': '正在编辑',
      'picker.noKnown': '还没有已知的会话，先在首页开一条会话。',
      'confirm.cancel': '取消',
      'confirm.deleteSkill': '删除技能「{name}」？',
      'confirm.deleteServer': '删除服务器「{name}」？',
      'confirm.removeSource': '移除「{label}」这个来源？',
      'confirm.dir.body': '整个目录 {path} 会被删除，目录里的资源文件也一起消失。',
      'confirm.file.body': '文件 {path} 会被删除。',
      'confirm.server.body': '这个范围的记录里会去掉它，正在运行的连接随之断开，记录文件里其它内容不变。',
      'confirm.source.body': '只是不再从这个目录读技能，{dir} 里的文件不会被删除。',
      'confirm.deleteServer.label': '删除服务器',
      'confirm.deleteSkill.label': '删除技能',
      'confirm.removeSource.label': '移除来源',
      'note.deletedSkill': '已删除技能 {name}',
      'note.deletedServer': '已删除服务器 {name}',
      'note.serverGone': '服务器 {name} 已不在记录里，刷新后再试',
      'note.removedSource': '已移除来源 {label}',
      'note.saved': '已保存 {name}',
      'note.refreshed': '已重新读取技能目录（{n} 个来源）',
      'note.sourceToggle': '{label}：{state} {n} 个技能',
      'note.sourceEnabled': '已启用',
      'note.sourceDisabled': '已停用',
      'note.sourceOn': '{label} 已启用',
      'note.sourceOff': '{label} 已停用',
      'note.sourceOn.busy': '启用 {label}…',
      'note.addedDir': '已添加目录 {path}',
      'note.skillOn': '启用 {name}',
      'note.skillOff': '停用 {name}',
      'note.placed': '已经把它加到这个位置',
      'note.unplaced': '已经把这个入口收起来',
      'note.reading': '正在读取 MCP 配置…',
      'note.readingSkills': '正在读取技能配置…',
      'note.noConfig': '宿主没有返回配置',
      'note.readingSession': '正在读取这条会话…',
      'note.noApi': '宿主的技能与 MCP 管理插件没有加载',
      'note.noSessionId': '这条会话还没有标识',
      'note.callFailed': '远程调用失败',
      'notice.foldFailed': '收起入口失败',
      'notice.prefsFailed': '读取显示位置失败，先不插入可选入口',
      'notice.pluginRender': '插件设置面板渲染失败',
      'notice.remoteMissing': '远程服务 skillMcpManager 没有挂上：宿主的 skill-mcp-manager 插件没有加载',
      'places.title': '入口',
      'places.sub': '这个插件的五个界面各自可以关掉。关掉之后省下的空间留给别的插件。',
      'places.close': '关闭',
      'places.sidebarSkills': '主页左边栏：SKILL',
      'places.sidebarSkills.hint': '主页左边多一个图标，点开就是整页的 SKILL 管理',
      'places.sidebarMcp': '主页左边栏：MCP',
      'places.sidebarMcp.hint': '主页左边多一个图标，点开就是整页的 MCP 管理',
      'places.tabSkills': '对话页顶部 tab：skill',
      'places.tabSkills.hint': '每条对话的上方多一个 skill 页，管的就是这条会话',
      'places.tabMcp': '对话页顶部 tab：mcp',
      'places.tabMcp.hint': '每条对话的上方多一个 mcp 页，管的就是这条会话',
      'settings.title': '显示位置',
      'settings.note': '改完立刻生效。技能与 MCP 本身在设置里的 SKILL管理、MCP管理两页。',
      'settings.loading': '正在读取设置…',
      'composer.chip.hint': '选择这一次发送带上哪些 skill 与 MCP',
      'composer.chip.changed': '这一次单独选了 {n} 项',
      'composer.chip.label': '能力',
      'composer.title': '这一次发送带上什么',
      'composer.sub': '只对这一次发送有效：选中的 skill 与 MCP 这次带上，没选的这次不带。改完不影响项目与全局的记录，这一回合结束就恢复原样。',
      'composer.none': '这一次没有单独选择',
      'composer.count': '这一次单独选了 {n} 项',
      'composer.reset': '全部恢复',
      'composer.close': '关闭',
      'composer.tabs.label': '带上什么',
      'composer.tab.skill': 'skill {n}',
      'composer.tab.server': 'MCP {n}',
      'composer.empty.server': '这条会话还没有 MCP 服务器。去 mcp 页加一个。',
      'composer.empty.skill': '这条会话还没有能带上的技能。',
      'composer.group.all': '{label} 这一次全部带上',
      'composer.group.drop': '这一次不带 {label} 的全部技能',
      'composer.group.keep': '这一次带上 {label} 的全部技能',
      'composer.tag.off': '这一次不带',
      'composer.tag.on': '这一次带上',
      'composer.row.label': '{name} 这一次是否带上',
      'composer.other': '其它来源',
      'composer.group.dropCount': '这一次不带 {n} 个',
      'composer.group.stopped': '这个来源在记录里是停用的',
      'composer.group.count': '{n} 个',
      'composer.count.short': '{n}',
      'name.empty': '技能名称不能为空',
      'name.long': '技能名称不能超过 64 个字符',
      'name.pattern': '只能用小写字母、数字和连字符，例如 pdf-tools',
      'serverName.empty': '服务器名称不能为空',
      'ago.now': '刚刚',
      'ago.minutes': '{n} 分钟前',
      'ago.hours': '{n} 小时前',
      'ago.days': '{n} 天前',
      'ago.months': '{n} 个月前',
      'list.separator': '，',
      'tabs.scope': '作用范围',
      'source.expand': '展开 {label}',
      'anchor.session.noMatch': '没有匹配「{query}」的会话。',
      'action.where': '写进这条会话',
      'action.where.title': '这条会话自己的目录，别的会话读不到',
      'action.create.noSource': '这个范围还没有可写的技能目录',
      'action.create.into': '写入 {label}',
      'places.count': '开着 {open} / {total}',
      'server.section': 'MCP 服务器',
      'server.section.count': '{enabled} 个启用 / 共 {total} 个',
      'server.empty.elsewhere': '{text}。切到那个范围可以改它，或者在这里为这个范围单独加一个。',
      'server.elsewhere': '别的范围已经有：{parts}',
      'server.elsewhere.part': '{scope} {n} 个',
      'server.enable': '启用服务器 {name}',
      'server.conflicts': '同名服务器在更靠近的范围里也有，最近的那个生效：{names}',
      'note.sourceOff.busy': '停用 {label}…',
      'editor.noDescription': '必须填写说明：模型只靠它决定要不要加载这个技能',
      'editor.loading': '正在读取正文…',
      'editor.broken': '这个技能目前宿主读不到：{problem}。改好之后保存即可',
      'serverEditor.problems': '请先改好这几行：{list}',
      'serverEditor.noCommand': '本地进程需要一条启动命令',
      'serverEditor.noUrl': 'HTTP 连接需要一个地址',
      'serverEditor.taken': '这个范围里已经有一台叫 {name} 的服务器，换一个名字，或者先删掉那一台',
      'note.renderFailed': '页面渲染失败：{message}',
      'anchor.session.count': '{n} 条',
      'field.body.placeholder': '## 步骤\n\n1. 用 pdfinfo 确认页数…',
      'note.noMethod': '宿主没有提供 {method}：插件的宿主半边没有加载',
      'note.timeout': '{method} 超过 {seconds} 秒没有返回，刷新页面或重启宿主后再试',
      'label.skill': 'skill',
      'label.mcp': 'mcp',
    }

    /** The English copy, key for key with the Chinese table above. */
    const en = {
      'scope.global': 'Global skills',
      'scope.global.hint': 'Skills every session on this machine reads',
      'scope.project': 'Project skills',
      'scope.project.hint': 'Skills read inside one project only',
      'scope.session': 'Session skills',
      'scope.session.hint': 'Skills read inside one conversation only',
      'scope.global.short': 'Global',
      'scope.project.short': 'Project',
      'scope.session.short': 'Session',
      'transport.stdio': 'Local process',
      'transport.stdio.hint': 'Start the server with a command and talk to it over stdin and stdout',
      'transport.http': 'HTTP',
      'transport.http.hint': 'Connect to a server address already running',
      'state.all': 'Any status',
      'state.enabled': 'Enabled',
      'state.disabled': 'Disabled',
      'state.broken': 'Unreadable',
      'form.dir': 'Directory',
      'form.dir.hint': 'One directory per skill, with resource files beside SKILL.md',
      'form.file': 'Single file',
      'form.file.hint': 'One .md file per skill: quick to write, no room for attachments',
      'title.skills': 'SKILL manager',
      'title.mcp': 'MCP manager',
      'title.both': 'SKILL and MCP',
      'sub.skills': 'Skills are grouped by the Agent that holds them, and a source or a single skill can be turned off at any time. Switching off touches no file on disk; it only decides whether the model can see the skill.',
      'sub.mcp': 'MCP servers connect per scope, and the nearest scope wins for a given name. A change here takes effect once saved, and the tools reach the model under the mcp__mount__ prefix.',
      'head.entry': 'Places',
      'head.entry.title': 'Choose where this plugin appears',
      'head.refresh': 'Refresh',
      'head.refreshing': 'Refreshing…',
      'head.record': 'Record file',
      'head.record.reset': 'The record was reset',
      'anchor.project': 'Project',
      'anchor.project.pick': 'Choose a project',
      'anchor.project.none': 'Choose a project directory',
      'anchor.project.other': 'Switch project',
      'anchor.project.recent': 'Projects seen in conversations',
      'anchor.session': 'Session',
      'anchor.live': '{n} online',
      'anchor.unnamed': 'Unnamed session',
      'anchor.session.filter': 'Filter by name or directory',
      'anchor.session.filter.label': 'Filter sessions',
      'anchor.this': 'this layer',
      'action.create': 'New skill',
      'action.addSource': 'Add directory',
      'action.catalog': 'Check the model view',
      'stats.skills': 'skills',
      'stats.enabled': 'enabled',
      'stats.disabled': 'disabled',
      'stats.sources': 'sources in use',
      'filter.source': 'Filter by source',
      'filter.source.all': 'Any source',
      'filter.source.option': '{label} ({n})',
      'filter.state': 'Filter by status',
      'filter.query': 'Search skill names and descriptions',
      'filter.query.label': 'Search skills',
      'empty.noProject': 'No project chosen yet',
      'empty.noSession': 'No known sessions yet',
      'empty.noProject.body': 'Pick a project directory to see the skill directories of every Agent inside it.',
      'empty.noSession.body': 'Once a conversation exists, its skill directories are listed here.',
      'empty.noSource': 'No skill source in this scope yet',
      'empty.noMatch': 'No skill matches these filters',
      'empty.noSource.body': 'Add a directory, or create a skill.',
      'empty.noMatch.body': 'Try another source or status.',
      'source.tag.session': 'Session directory',
      'source.tag.custom': 'Custom directory',
      'source.tag.host': 'Read by the host',
      'source.tag.off': 'Disabled',
      'source.tag.forced': '{n} switched on',
      'source.group.off': 'Disable all',
      'source.group.on': 'Enable all',
      'source.group.off.title': 'Turn off every skill in this group',
      'source.group.on.title': 'Turn on every skill in this group',
      'source.enable': 'Enable source {label}',
      'source.enable.title': 'Turn every skill in this source on or off',
      'source.remove': 'Remove {label}',
      'source.fold': 'Collapse {label}',
      'source.path.missing': 'This directory does not exist yet. Pick another path, or create it first.',
      'source.path.empty': 'No skill in this directory yet.',
      'source.path.session': 'This directory is created when the first skill is written.',
      'skill.tag.file': 'Single file',
      'skill.tag.broken': 'Unreadable',
      'skill.tag.forced': 'Switched on',
      'skill.tag.noModel': 'No auto load',
      'skill.tag.noUser': 'No / command',
      'skill.noDescription': 'No description',
      'skill.enable': 'Enable skill {name}',
      'skill.edit': 'Edit {name}',
      'skill.delete': 'Delete {name}',
      'server.tag.stdio': 'Local process',
      'server.tag.http': 'HTTP',
      'server.tag.dormant': 'Session not started',
      'server.tools': '{n} tools',
      'server.live.hint': 'This conversation has not started yet, so the tools connect once it does',
      'server.edit': 'Edit server {name}',
      'server.delete': 'Delete server {name}',
      'server.refresh': 'Refresh status',
      'server.add': 'Add server',
      'server.empty': 'No MCP server in this scope',
      'server.empty.body': 'Once added, its tools reach the model of this scope under the mcp__mount__ prefix.',
      'zone.session': 'This conversation',
      'zone.session.hint': 'Applies to this conversation only, nearer than project and global',
      'zone.project.hint': 'Every conversation inside the same project reads it',
      'zone.global': 'Global',
      'zone.global.hint': 'Every project and every conversation reads it',
      'zone.servers': '{n} servers',
      'zone.skills': '{n} skills',
      'zone.skills.one': '{n} skill',
      'zone.empty.session': 'This conversation has no skills of its own',
      'zone.empty.session.body': 'A new skill is written into the conversation’s own directory, where only it reads.',
      'catalog.title': 'Skills the model can see now',
      'catalog.noAnchor': 'This scope has no target yet',
      'catalog.sub': 'This list comes from the skill registry itself: the catalogue the model reads when it decides to load a skill.',
      'catalog.loading': 'Reading…',
      'catalog.empty': 'No skill in this scope is visible to the model.',
      'catalog.hidden': '{n} more names are switched off or shadowed by a nearer scope.',
      'catalog.hidden.more': '{n} more names are switched off or shadowed by a nearer scope, so the model cannot read them.',
      'editor.create': 'New skill',
      'editor.edit': 'Edit {name}',
      'editor.create.sub': 'Written into the chosen source. Once saved, this conversation sees it in the directory right away.',
      'editor.edit.sub': 'Renaming renames the directory; the description and the body go straight into SKILL.md.',
      'editor.new': 'New skill',
      'editor.editing': 'Editing',
      'editor.cancel': 'Cancel',
      'editor.save': 'Save',
      'editor.saving': 'Saving…',
      'field.name': 'Name',
      'field.name.hint': 'Lower-case letters, digits, and hyphens; also the directory name',
      'field.name.label': 'Skill name',
      'field.when': 'When to use',
      'field.when.hint': 'Optional trigger condition written for the model',
      'field.when.label': 'Trigger condition',
      'field.when.placeholder': 'When the user asks to work with a PDF',
      'field.description': 'Description',
      'field.description.count': '{n} chars',
      'field.description.hint': 'This sentence is all the model has to decide whether to load the skill, so say what it does.',
      'field.description.label': 'Skill description',
      'field.description.placeholder': 'Render every PDF page to an image and pull the tables out.',
      'field.body': 'Body',
      'field.body.hint': 'The Markdown read when the skill loads; resource files can sit in the directory and be referenced.',
      'field.body.label': 'Skill body',
      'field.form': 'Layout',
      'field.willWrite': 'Will write',
      'field.alsoInDir': 'Also in the directory',
      'toggle.model': 'Let the model load it on its own',
      'toggle.model.hint': 'Once off, it only appears under the / command',
      'toggle.user': 'Let people call it with a / command',
      'toggle.user.title': 'Allow the / command',
      'toggle.user.hint': 'Once off, it does not appear in the composer',
      'points.saved': 'Once saved, the skill directory of {anchor} reads it right away.',
      'points.modelReads': 'The model reads the name, the description, and the trigger; the body is read only when the skill loads.',
      'points.hideOnly': 'Switching a skill off only hides it; no file on disk changes.',
      'serverEditor.create': 'Add an MCP server',
      'serverEditor.sub': 'Once connected, its tools appear under the mcp__mount__ prefix and the model calls them as needed. The mount name is the server name, or the serverName in the preview when the name holds characters the host does not accept.',
      'serverEditor.scope': 'Writes to · {anchor}',
      'field.serverName': 'Name',
      'field.serverName.hint': 'Any name works, Chinese included; a duplicate is shadowed by the nearer scope',
      'field.serverName.label': 'Server name',
      'field.transport': 'Transport',
      'field.command': 'Command',
      'field.command.hint': 'A relative path resolves against the working directory.',
      'field.command.label': 'Start command',
      'field.url': 'Address',
      'field.url.hint': 'A server already running, such as http://127.0.0.1:8931/mcp',
      'field.url.label': 'Server address',
      'field.args': 'Arguments',
      'field.args.count': '{n}',
      'field.args.hint': 'One per line, handed to the process directly without a shell.',
      'field.args.label': 'Command arguments',
      'field.cwd': 'Working directory',
      'field.cwd.hint': 'The process starts here; leave it empty to use the host working directory',
      'field.cwd.label': 'Working directory',
      'field.cwd.pick': 'Choose',
      'field.env': 'Environment',
      'field.env.hint': 'Listed one by one, added to the child process environment.',
      'field.header': 'Request headers',
      'field.header.hint': 'Listed one by one, sent with every request. A value may contain an equals sign.',
      'field.pair.key': 'Key of row {n}',
      'field.pair.value': 'Value of row {n}',
      'field.pair.drop': 'Delete row {n}',
      'field.pair.drop.title': 'Delete this row',
      'field.pair.addEnv': 'Add variable',
      'field.pair.addHeader': 'Add header',
      'field.pair.noKey': 'Missing a key: {value}',
      'field.pair.duplicate': 'Duplicate key: {key}',
      'preview.mount': 'Mount arguments',
      'points.toolPrefix': 'Tool names carry the mcp__{name}__ prefix.',
      'points.scopeOnly': 'Mounted on {anchor} only; no other scope sees these tools.',
      'points.stdioLive': 'Saving starts the process; disabling or deleting stops it.',
      'points.httpLive': 'Saving connects right away; deleting disconnects.',
      'picker.project': 'Choose a project directory',
      'picker.cwd': 'Choose a working directory',
      'picker.source': 'Add a skill directory',
      'picker.project.sub': 'Once chosen, this page scans the skill directories of every Agent in that project.',
      'picker.source.sub': 'Once chosen, this directory is added as a skill source.',
      'picker.use': 'Use this directory',
      'picker.scan': 'Scan this project',
      'picker.add': 'Add this directory',
      'picker.up': 'Parent',
      'picker.empty': 'No subdirectory here.',
      'picker.noSession': 'No session chosen yet',
      'picker.editing': 'Editing',
      'picker.noKnown': 'No known session yet; open one from the home page first.',
      'confirm.cancel': 'Cancel',
      'confirm.deleteSkill': 'Delete the skill “{name}”?',
      'confirm.deleteServer': 'Delete the server “{name}”?',
      'confirm.removeSource': 'Remove the source “{label}”?',
      'confirm.dir.body': 'The whole directory {path} is deleted, together with the resource files inside it.',
      'confirm.file.body': 'The file {path} is deleted.',
      'confirm.server.body': 'It is dropped from the record of this scope and the running connection closes with it; the rest of the record file stays as it is.',
      'confirm.source.body': 'Skills simply stop being read from this directory; the files in {dir} are not deleted.',
      'confirm.deleteServer.label': 'Delete server',
      'confirm.deleteSkill.label': 'Delete skill',
      'confirm.removeSource.label': 'Remove source',
      'note.deletedSkill': 'Deleted the skill {name}',
      'note.deletedServer': 'Deleted the server {name}',
      'note.serverGone': 'The server {name} is no longer in the record; refresh and try again',
      'note.removedSource': 'Removed the source {label}',
      'note.saved': 'Saved {name}',
      'note.refreshed': 'Re-read the skill directories ({n} sources)',
      'note.sourceToggle': '{label}: {state} {n} skills',
      'note.sourceToggle.one': '{label}: {state} {n} skill',
      'note.sourceEnabled': 'enabled',
      'note.sourceDisabled': 'disabled',
      'note.sourceOn': '{label} is now enabled',
      'note.sourceOff': '{label} is now disabled',
      'note.sourceOn.busy': 'Enabling {label}…',
      'note.addedDir': 'Added the directory {path}',
      'note.skillOn': 'Enabled {name}',
      'note.skillOff': 'Disabled {name}',
      'note.placed': 'Added to this place',
      'note.unplaced': 'Removed from this place',
      'note.reading': 'Reading the MCP configuration…',
      'note.readingSkills': 'Reading the skill configuration…',
      'note.noConfig': 'The host returned no configuration',
      'note.readingSession': 'Reading this conversation…',
      'note.noApi': 'The host skill and MCP manager plugin is not loaded',
      'note.noSessionId': 'This conversation has no id yet',
      'note.callFailed': 'The remote call failed',
      'notice.foldFailed': 'Could not remove an entry',
      'notice.prefsFailed': 'Could not read where the entries go, so the optional ones stay out',
      'notice.pluginRender': 'The plugin settings panel failed to render',
      'notice.remoteMissing': 'The skillMcpManager remote is missing: the host skill-mcp-manager plugin is not loaded',
      'places.title': 'Places',
      'places.sub': 'Each of this plugin’s five surfaces can be turned off, leaving the room to another plugin.',
      'places.close': 'Close',
      'places.sidebarSkills': 'Home sidebar: SKILL',
      'places.sidebarSkills.hint': 'One more icon in the home sidebar, opening the whole SKILL manager',
      'places.sidebarMcp': 'Home sidebar: MCP',
      'places.sidebarMcp.hint': 'One more icon in the home sidebar, opening the whole MCP manager',
      'places.tabSkills': 'Conversation tab: skill',
      'places.tabSkills.hint': 'One more tab above every conversation, managing that conversation',
      'places.tabMcp': 'Conversation tab: mcp',
      'places.tabMcp.hint': 'One more tab above every conversation, managing that conversation',
      'settings.title': 'Where it appears',
      'settings.note': 'Changes apply at once. Skills and MCP servers themselves live on the SKILL manager and MCP manager pages in settings.',
      'settings.loading': 'Reading the settings…',
      'composer.chip.hint': 'Pick the skills and MCP servers to carry in this message',
      'composer.chip.changed': 'Picked {n} items for this message',
      'composer.chip.label': 'Abilities',
      'composer.title': 'What this message carries',
      'composer.sub': 'Applies to this message only: what you pick is carried this time, the rest is left out. The record of this project and of everything global stays untouched, and the turn ends with the settings back to how they were.',
      'composer.none': 'Nothing picked for this message',
      'composer.count': 'Picked {n} items for this message',
      'composer.count.one': 'Picked {n} item for this message',
      'composer.reset': 'Restore all',
      'composer.close': 'Close',
      'composer.tabs.label': 'What this message carries',
      'composer.tab.skill': 'Skills {n}',
      'composer.tab.server': 'MCP {n}',
      'composer.empty.server': 'This conversation has no MCP server yet. Add one on the mcp page.',
      'composer.empty.skill': 'This conversation has no skill to carry yet.',
      'composer.group.all': 'Carry all of {label} this time',
      'composer.group.drop': 'Drop every skill of {label} this time',
      'composer.group.keep': 'Carry every skill of {label} this time',
      'composer.tag.off': 'Dropped this time',
      'composer.tag.on': 'Added this time',
      'composer.row.label': 'Whether {name} is carried this time',
      'composer.other': 'Other sources',
      'composer.group.dropCount': '{n} dropped this time',
      'composer.group.dropCount.one': '{n} dropped this time',
      'composer.group.stopped': 'This source is disabled in the record',
      'composer.group.count': '{n}',
      'composer.count.short': '{n}',
      'name.empty': 'A skill name is required',
      'name.long': 'A skill name cannot be longer than 64 characters',
      'name.pattern': 'Use lower-case letters, digits, and hyphens, such as pdf-tools',
      'serverName.empty': 'A server name is required',
      'ago.now': 'just now',
      'ago.minutes': '{n} minutes ago',
      'ago.hours': '{n} hours ago',
      'ago.days': '{n} days ago',
      'ago.months': '{n} months ago',
      'list.separator': ', ',
      'tabs.scope': 'Scope',
      'source.expand': 'Expand {label}',
      'anchor.session.noMatch': 'No conversation matches “{query}”.',
      'action.where': 'Writes into this conversation',
      'action.where.title': 'This conversation’s own directory, which no other conversation reads',
      'action.create.noSource': 'This scope has no writable skill directory',
      'action.create.into': 'Writes to {label}',
      'places.count': '{open} of {total} on',
      'server.section': 'MCP servers',
      'server.section.count': '{enabled} enabled / {total} total',
      'server.empty.elsewhere': '{text}. Switch to that scope to change it, or add one for this scope here.',
      'server.elsewhere': 'Other scopes already have: {parts}',
      'server.elsewhere.part': '{scope} {n}',
      'server.enable': 'Enable server {name}',
      'server.conflicts': 'A server of the same name also sits in a nearer scope, and the nearest one wins: {names}',
      'note.sourceOff.busy': 'Disabling {label}…',
      'editor.noDescription': 'A description is required: it is all the model has to decide whether to load the skill',
      'editor.loading': 'Reading the body…',
      'editor.broken': 'The host cannot read this skill yet: {problem}. Fix it and save',
      'serverEditor.problems': 'Fix these rows first: {list}',
      'serverEditor.noCommand': 'A local process needs a start command',
      'serverEditor.noUrl': 'An HTTP connection needs an address',
      'serverEditor.taken': 'This scope already has a server named {name}; pick another name, or delete that one first',
      'note.renderFailed': 'The page failed to render: {message}',
      'anchor.session.count': '{n}',
      'field.body.placeholder': '## Steps\n\n1. Check the page count with pdfinfo…',
      'note.noMethod': 'The host does not expose {method}: the host half of this plugin is not loaded',
      'note.timeout': '{method} did not answer within {seconds} seconds; refresh the page or restart the host',
      'label.skill': 'skill',
      'label.mcp': 'mcp',
    }

    /**
     * The translator the pages read. A language that spells the singular differently
     * adds `<key>.one`, and the lookup prefers it when `n` is exactly one. Only the
     * English table has such entries; the Chinese table gets the same keys copied from
     * the plain sentence, so the locale service never falls through to English for them.
     * `apply` replaces `translate` with the locale service binding; before that it
     * answers from the Chinese table, so a render that somehow precedes activation
     * still reads.
     */
    const ONE = '.one'
    const zhTable = {
      ...zh,
      ...Object.fromEntries(Object.keys(en).filter((key) => key.endsWith(ONE)).map((key) => [key, zh[key.slice(0, -ONE.length)]])),
    }
    let translate = (key, params = undefined) => {
      const template = zhTable[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
    }
    const t = (key, params = undefined) =>
      translate(params !== undefined && params.n === 1 && `${key}${ONE}` in en ? `${key}${ONE}` : key, params)

    /**
     * The shell keeps one hook the pages use to redraw the sidebar entries and the
     * conversation tabs after the switches in the page change.
     */
    let syncShell = (prefs) => {}

    const SCOPES = [
      { value: 'global', key: 'scope.global', hintKey: 'scope.global.hint' },
      { value: 'project', key: 'scope.project', hintKey: 'scope.project.hint' },
      { value: 'session', key: 'scope.session', hintKey: 'scope.session.hint' },
    ]
    const SCOPE_LABEL_KEY = { global: 'scope.global.short', project: 'scope.project.short', session: 'scope.session.short' }
    const TRANSPORTS = [
      { value: 'stdio', key: 'transport.stdio', hintKey: 'transport.stdio.hint' },
      { value: 'streamable-http', key: 'transport.http', hintKey: 'transport.http.hint' },
    ]
    const STATE_FILTERS = [
      { value: 'all', key: 'state.all' },
      { value: 'enabled', key: 'state.enabled' },
      { value: 'disabled', key: 'state.disabled' },
      { value: 'broken', key: 'state.broken' },
    ]
    const FORMS = [
      { value: 'dir', key: 'form.dir', hintKey: 'form.dir.hint' },
      { value: 'file', key: 'form.file', hintKey: 'form.file.hint' },
    ]

    /**
     * Marks for the sources that ship no mark of their own: a drawn glyph in the
     * same single-colour style, and a folder for the directories a person added.
     */
    const AGENT_GLYPH = 'M12 2.6a.5.5 0 0 1 .47.33l1.9 5.35a.6.6 0 0 0 .35.35l5.35 1.9a.5.5 0 0 1 0 .94l-5.35 1.9a.6.6 0 0 0-.35.35l-1.9 5.35a.5.5 0 0 1-.94 0l-1.9-5.35a.6.6 0 0 0-.35-.35l-5.35-1.9a.5.5 0 0 1 0-.94l5.35-1.9a.6.6 0 0 0 .35-.35l1.9-5.35A.5.5 0 0 1 12 2.6Z'
    const FOLDER_GLYPH = 'M3.4 6c0-1 .8-1.8 1.8-1.8h3.1c.6 0 1.1.27 1.5.73l.9 1.13h8.1c1 0 1.8.8 1.8 1.8v9.5c0 1-.8 1.8-1.8 1.8H5.2c-1 0-1.8-.8-1.8-1.8Z'
    /**
     * One colour per agent, so a list of skills from nine folders reads as nine
     * families at a glance. Unknown sources take the next free colour by hash.
     */
    const HUES = ['blue', 'teal', 'amber', 'violet', 'pink', 'green', 'indigo', 'cyan']
    const HUE_OF = {
      dsh: 'blue',
      agents: 'teal',
      claude: 'amber',
      codex: 'green',
      opencode: 'violet',
      codebuddy: 'indigo',
      workbuddy: 'pink',
      gemini: 'cyan',
      cursor: 'amber',
      copilot: 'indigo',
      windsurf: 'teal',
      trae: 'violet',
      qoder: 'blue',
      roo: 'green',
      openclaw: 'pink',
      session: 'pink',
      project: 'cyan',
      custom: 'slate',
    }
    const SCOPE_HUE = { global: 'blue', project: 'cyan', session: 'pink' }
    const hueOf = (key) => {
      const known = HUE_OF[String(key ?? '')]
      if (known !== undefined) return known
      let sum = 0
      for (const char of String(key ?? '')) sum += char.codePointAt(0) ?? 0
      return HUES[sum % HUES.length]
    }
    /** Sources that share one brand mark with another source. */
    const LOGO_ALIAS = { workbuddy: 'codebuddy' }
    /** The one path a source draws in its mark: its own brand, or a drawn stand-in. */
    const glyphOf = (source) => {
      const key = String(source?.id ?? source?.key ?? source?.label ?? '')
      const brand = AGENT_LOGO[LOGO_ALIAS[key] ?? key]
      if (brand !== undefined) return brand
      return source?.custom === true || key === 'session' || key === 'project' ? FOLDER_GLYPH : AGENT_GLYPH
    }

    const joinPath = (root, rest) => {
      if (typeof root !== 'string' || root === '') return rest
      return root.endsWith('/') ? `${root}${rest}` : `${root}/${rest}`
    }
    /** The folder name a person would use for a path. */
    const lastSegment = (path) => {
      const parts = String(path ?? '').split('/').filter((part) => part !== '')
      return parts.length === 0 ? String(path ?? '') : parts[parts.length - 1]
    }
    /** Keep both ends of a long path readable in one line. */
    const shortenPath = (path, limit = 88) => {
      const text = String(path ?? '')
      if (text.length <= limit) return text
      const head = Math.floor((limit - 3) / 2)
      return `${text.slice(0, head)}...${text.slice(text.length - (limit - 3 - head))}`
    }
    /** A short "how long ago" for sessions that were cached without a directory. */
    const agoOf = (at) => {
      if (typeof at !== 'number' || at <= 0) return ''
      const minutes = Math.floor((Date.now() - at) / 60000)
      if (minutes < 1) return t('ago.now')
      if (minutes < 60) return t('ago.minutes', { n: minutes })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('ago.hours', { n: hours })
      const days = Math.floor(hours / 24)
      if (days < 30) return t('ago.days', { n: days })
      return t('ago.months', { n: Math.floor(days / 30) })
    }
    // ── styles ──────────────────────────────────────────────────────────────

    const CSS = `
.acap-root, .acap-sheet, .acap-scope, [data-plugin="dsh-skill-mcp-manager"] {
  --acap-line: var(--dsw-alias-border-l3, rgba(128, 128, 128, 0.25));
  --acap-line-soft: var(--dsw-alias-border-l2, rgba(128, 128, 128, 0.13));
  --acap-line-strong: var(--dsw-alias-border-l4, rgba(128, 128, 128, 0.4));
  --acap-text: var(--dsw-alias-label-primary, #0f1115);
  /* The host's tertiary and caption colours sit below 4.5:1 on a white sheet, so the
     quieter steps are mixed from the label colour and stay readable in both themes. */
  --acap-muted: color-mix(in srgb, var(--acap-text) 70%, transparent);
  --acap-muted-2: color-mix(in srgb, var(--acap-text) 55%, transparent);
  --acap-accent: var(--dsw-alias-state-business-primary, #4176e6);
  --acap-success: var(--dsw-alias-state-success-primary, #1f9a4f);
  --acap-danger: var(--dsw-alias-state-error-primary, #d13b34);
  --acap-warn: var(--dsw-alias-state-warn-primary, #b0730a);
  /* One hue per agent. Each surface mixes its hue toward the label colour, so a tag
     stays legible on a white sheet and on a dark one without a second palette. */
  --acap-hue-blue: #2f6fe4;
  --acap-hue-teal: #0d9488;
  --acap-hue-amber: #c2740a;
  --acap-hue-violet: #7c3aed;
  --acap-hue-pink: #db2777;
  --acap-hue-green: #17924a;
  --acap-hue-indigo: #4f46e5;
  --acap-hue-cyan: #0e7490;
  --acap-hue-rose: #e11d48;
  --acap-hue-slate: #64748b;
  /* Every layer token is the same colour as the sheet, so fills are mixed from the text
     colour instead: they stay visible in both themes and never fight the host palette. */
  --acap-surface: color-mix(in srgb, var(--acap-text) 3.5%, transparent);
  --acap-surface-2: color-mix(in srgb, var(--acap-text) 6%, transparent);
  --acap-surface-3: color-mix(in srgb, var(--acap-text) 10%, transparent);
  --acap-hover: color-mix(in srgb, var(--acap-text) 6%, transparent);
  --acap-active: color-mix(in srgb, var(--acap-text) 12%, transparent);
  --acap-mono: var(--dsw-font-markdown-code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
  --acap-field-line: color-mix(in srgb, var(--acap-text) 20%, transparent);
  --acap-field-line-hover: color-mix(in srgb, var(--acap-text) 34%, transparent);
}

.acap-root { display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 940px; min-width: 0; color: var(--acap-text); -webkit-font-smoothing: antialiased; }

/* ── hue plumbing ─────────────────────────────────────────────────────── */
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="blue"] { --acap-hue: var(--acap-hue-blue); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="teal"] { --acap-hue: var(--acap-hue-teal); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="amber"] { --acap-hue: var(--acap-hue-amber); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="violet"] { --acap-hue: var(--acap-hue-violet); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="pink"] { --acap-hue: var(--acap-hue-pink); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="green"] { --acap-hue: var(--acap-hue-green); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="indigo"] { --acap-hue: var(--acap-hue-indigo); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="cyan"] { --acap-hue: var(--acap-hue-cyan); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="rose"] { --acap-hue: var(--acap-hue-rose); }
:is(.acap-tag, .acap-mark, .acap-src, .acap-srv, .acap-skill, .acap-zone)[data-hue="slate"] { --acap-hue: var(--acap-hue-slate); }

/* Pinned to one conversation the page sits under the tab bar, above the composer:
   it owns its padding and leaves room for the composer card at the bottom. */
.acap-root[data-embedded="true"] { max-width: 1080px; box-sizing: border-box; padding: 14px 16px 148px; gap: 13px; }

/* ── header ───────────────────────────────────────────────────────────── */
.acap-head { display: flex; flex-direction: column; gap: 6px; }
.acap-head[data-compact="true"] { gap: 0; }
.acap-head-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.acap-title { display: inline-flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 600; letter-spacing: -0.012em; line-height: 1.35; margin: 0; }
.acap-head[data-compact="true"] .acap-title { font-size: 15px; }
.acap-ver { display: inline-flex; align-items: center; height: 19px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--acap-line); background: var(--acap-surface-2); font-size: 10.5px; line-height: 1; color: var(--acap-muted); font-variant-numeric: tabular-nums; }
.acap-sub { font-size: 12.5px; line-height: 1.65; color: var(--acap-muted); margin: 0; max-width: 76ch; text-wrap: pretty; }
.acap-grow { flex: 1; min-width: 8px; }
.acap-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 11px; color: var(--acap-muted-2); }
.acap-meta code { font-family: var(--acap-mono); font-size: 10.5px; }
.acap-meta-btn { appearance: none; border: 0; background: transparent; font: inherit; font-size: 11px; color: var(--acap-muted-2); cursor: pointer; padding: 2px 0; border-radius: 4px; }
.acap-meta-btn:hover { color: var(--acap-text); }
.acap-meta-btn:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: 2px; }

/* ── tabs ─────────────────────────────────────────────────────────────── */
.acap-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; padding: 3px; border: 1px solid var(--acap-line-soft); border-radius: 10px; background: var(--acap-surface); }
.acap-tab { appearance: none; border: 0; background: transparent; font: inherit; font-size: 12.5px; font-weight: 500; color: var(--acap-muted); padding: 7px 10px; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; transition: background 160ms ease, color 160ms ease; min-width: 0; }
.acap-tab:hover { background: var(--acap-hover); color: var(--acap-text); }
.acap-tab:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: 1px; }
.acap-tab[aria-selected="true"] { background: color-mix(in srgb, var(--acap-hue-blue) 18%, transparent); color: color-mix(in srgb, var(--acap-hue-blue) 86%, var(--acap-text)); font-weight: 600; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--acap-hue-blue) 32%, transparent); }
.acap-tab-count { font-size: 10.5px; font-variant-numeric: tabular-nums; color: var(--acap-muted-2); }
.acap-tab[aria-selected="true"] .acap-tab-count { color: var(--acap-muted); }

/* ── anchor row (project / session pickers) ───────────────────────────── */
.acap-anchor { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acap-anchor-label { font-size: 11.5px; color: var(--acap-muted-2); white-space: nowrap; }
.acap-select { appearance: none; font: inherit; font-size: 12px; color: var(--acap-text); background: var(--acap-surface-2); border: 1px solid var(--acap-line); border-radius: 8px; padding: 6px 26px 6px 10px; cursor: pointer; max-width: 420px; min-width: 0; text-overflow: ellipsis; background-image: linear-gradient(45deg, transparent 50%, var(--acap-muted) 50%), linear-gradient(135deg, var(--acap-muted) 50%, transparent 50%); background-position: calc(100% - 14px) 52%, calc(100% - 9px) 52%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; }
.acap-select:hover { border-color: var(--acap-line-strong); }
.acap-select:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: 1px; }

/* ── action row ───────────────────────────────────────────────────────── */
.acap-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acap-actions-where { font-size: 11.5px; color: var(--acap-muted-2); padding: 2px 7px; border: 1px solid var(--acap-line-soft); border-radius: 6px; }
.acap-actions .acap-grow { flex: 1; }

/* ── stats ────────────────────────────────────────────────────────────── */
.acap-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--acap-line-soft); border-radius: 10px; background: var(--acap-surface); overflow: hidden; }
.acap-stat { display: flex; flex-direction: column; gap: 2px; padding: 9px 12px; min-width: 0; }
.acap-stat + .acap-stat { border-left: 1px solid var(--acap-line-soft); }
.acap-stat-n { font-size: 16px; font-weight: 600; line-height: 1.2; font-variant-numeric: tabular-nums; }
.acap-stat-l { font-size: 10.5px; color: var(--acap-muted-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.acap-stat-off .acap-stat-n { color: var(--acap-muted); }
.acap-stat[data-k="skills"] .acap-stat-n { color: color-mix(in srgb, var(--acap-hue-blue) 88%, var(--acap-text)); }
.acap-stat[data-k="enabled"] .acap-stat-n { color: color-mix(in srgb, var(--acap-success) 88%, var(--acap-text)); }
.acap-stat[data-k="disabled"] .acap-stat-n { color: color-mix(in srgb, var(--acap-hue-amber) 88%, var(--acap-text)); }
.acap-stat[data-k="sources"] .acap-stat-n { color: color-mix(in srgb, var(--acap-hue-teal) 88%, var(--acap-text)); }

/* ── filters ──────────────────────────────────────────────────────────── */
.acap-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acap-filters .acap-search { margin-left: auto; width: 220px; min-width: 140px; }

/* ── source cards ─────────────────────────────────────────────────────── */
.acap-zones { display: flex; flex-direction: column; gap: 16px; }
.acap-zone { display: flex; flex-direction: column; gap: 9px; }
.acap-zone[data-open="false"] { gap: 0; }
.acap-zone-head { display: flex; align-items: center; gap: 7px; min-width: 0; width: 100%; padding: 7px 10px; border: 1px solid var(--acap-line-soft); border-radius: 9px; background: var(--acap-surface); color: inherit; font: inherit; cursor: pointer; text-align: left; }
.acap-zone-head:hover { background: var(--acap-hover); }
.acap-zone[data-hue] .acap-zone-head { border-color: color-mix(in srgb, var(--acap-hue) 20%, var(--acap-line-soft)); }
.acap-zone[data-hue][data-open="true"] .acap-zone-head { background: color-mix(in srgb, var(--acap-hue) 7%, var(--acap-surface)); }
.acap-zone-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: color-mix(in srgb, var(--acap-hue) 82%, transparent); }
.acap-zone-title { font-size: 12.5px; font-weight: 600; color: var(--acap-text); flex: none; }
.acap-zone-hint { font-size: 11.5px; color: var(--acap-muted-2); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-zone-body { display: flex; flex-direction: column; gap: 10px; }
.acap-zone-add { display: flex; justify-content: flex-end; }
.acap-sources { display: flex; flex-direction: column; gap: 10px; }
.acap-src { position: relative; border: 1px solid var(--acap-line-soft); border-radius: 11px; background: var(--acap-surface); overflow: hidden; transition: border-color 160ms ease; }
.acap-src[data-hue]::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: color-mix(in srgb, var(--acap-hue) 92%, transparent); }
.acap-src[data-off="true"][data-hue]::before { background: color-mix(in srgb, var(--acap-hue) 30%, transparent); }
.acap-src:hover { border-color: var(--acap-line); }
.acap-src[data-off="true"] { background: transparent; }
.acap-src-head { display: flex; align-items: center; gap: 9px; padding: 9px 11px; min-width: 0; }
.acap-mark { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 7px; border: 1px solid transparent; }
.acap-mark[data-hue] { color: color-mix(in srgb, var(--acap-hue) 82%, var(--acap-text)); background: color-mix(in srgb, var(--acap-hue) 22%, transparent); border-color: color-mix(in srgb, var(--acap-hue) 42%, transparent); }
.acap-mark > svg { display: block; }
.acap-mark-lg { width: 28px; height: 28px; border-radius: 8px; }
.acap-src-id { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.acap-src-name { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 600; min-width: 0; }
.acap-src-path { font-family: var(--acap-mono); font-size: 10.5px; color: var(--acap-muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-src-actions { display: inline-flex; align-items: center; gap: 4px; flex: none; }
.acap-src[data-off="true"] .acap-src-name { color: var(--acap-muted); }

/* ── skill rows ───────────────────────────────────────────────────────── */
.acap-skills { display: flex; flex-direction: column; border-top: 1px solid var(--acap-line-soft); }
.acap-skill { display: flex; align-items: center; gap: 10px; padding: 8px 11px; min-width: 0; position: relative; transition: background 160ms ease; }
.acap-skill + .acap-skill { border-top: 1px solid var(--acap-line-soft); }
.acap-skill:hover { background: var(--acap-hover); }
.acap-skill::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; background: transparent; }
.acap-skill[data-hue]:not([data-off="true"])::before { background: color-mix(in srgb, var(--acap-hue) 58%, transparent); }
.acap-skill[data-off="true"]::before { background: var(--acap-line-strong); }
.acap-skill[data-off="true"][data-hue]::before { background: color-mix(in srgb, var(--acap-hue) 34%, transparent); }
.acap-skill-main { display: flex; flex-direction: column; gap: 1px; min-width: 0; flex: 1; }
.acap-skill-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
.acap-skill-name { font-family: var(--acap-mono); font-size: 12px; font-weight: 600; color: var(--acap-text); }
.acap-skill[data-off="true"] .acap-skill-name { color: var(--acap-muted); }
.acap-skill-desc { font-size: 11.5px; color: var(--acap-muted); line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-skill[data-off="true"] .acap-skill-desc { color: var(--acap-muted-2); }
.acap-skill-actions { display: inline-flex; align-items: center; gap: 2px; flex: none; }
.acap-skill-actions .acap-icon-btn { opacity: 0.55; }
.acap-skill:hover .acap-skill-actions .acap-icon-btn, .acap-skill:focus-within .acap-skill-actions .acap-icon-btn { opacity: 1; }
.acap-icon-btn { appearance: none; display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--acap-muted); cursor: pointer; transition: background 160ms ease, color 160ms ease, border-color 160ms ease; }
.acap-icon-btn:hover { background: var(--acap-surface-3); color: var(--acap-text); border-color: var(--acap-line-soft); }
.acap-icon-btn:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: 1px; opacity: 1; }
.acap-icon-btn-danger:hover { color: var(--acap-danger); border-color: color-mix(in srgb, var(--acap-danger) 34%, transparent); }

/* ── tags ─────────────────────────────────────────────────────────────── */
.acap-tag { display: inline-flex; align-items: center; gap: 3px; height: 16px; padding: 0 6px; border-radius: 4px; font-size: 10px; line-height: 1; white-space: nowrap; border: 1px solid var(--acap-line-soft); color: var(--acap-muted-2); background: var(--acap-surface-2); }
.acap-tag[data-hue] { color: color-mix(in srgb, var(--acap-hue) 82%, var(--acap-text)); border-color: color-mix(in srgb, var(--acap-hue) 40%, transparent); background: color-mix(in srgb, var(--acap-hue) 17%, transparent); }
.acap-tag-on { color: var(--acap-success); border-color: color-mix(in srgb, var(--acap-success) 30%, transparent); background: color-mix(in srgb, var(--acap-success) 10%, transparent); }
.acap-tag-off { color: var(--acap-muted); border-style: dashed; }
.acap-tag-warn { color: var(--acap-warn); border-color: color-mix(in srgb, var(--acap-warn) 30%, transparent); background: color-mix(in srgb, var(--acap-warn) 10%, transparent); }
.acap-tag-err { color: var(--acap-danger); border-color: color-mix(in srgb, var(--acap-danger) 32%, transparent); background: color-mix(in srgb, var(--acap-danger) 10%, transparent); }
.acap-tag-info { color: var(--acap-accent); border-color: color-mix(in srgb, var(--acap-accent) 30%, transparent); background: color-mix(in srgb, var(--acap-accent) 10%, transparent); }

/* ── switch ───────────────────────────────────────────────────────────── */
.acap-switch-cell { display: inline-flex; align-items: center; flex: none; }

/* ── empty / notices ──────────────────────────────────────────────────── */
.acap-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 26px 14px; border: 1px dashed var(--acap-line); border-radius: 11px; text-align: center; }
.acap-empty-title { font-size: 12.5px; font-weight: 600; }
.acap-empty-body { font-size: 11.5px; color: var(--acap-muted-2); line-height: 1.6; max-width: 46ch; text-wrap: pretty; }
.acap-note { font-size: 11.5px; color: var(--acap-muted-2); line-height: 1.6; }
.acap-notice { display: flex; align-items: flex-start; gap: 7px; padding: 8px 10px; border-radius: 8px; font-size: 11.5px; line-height: 1.6; border: 1px solid var(--acap-line-soft); background: var(--acap-surface-2); color: var(--acap-muted); }
.acap-notice[data-tone="error"] { border-color: color-mix(in srgb, var(--acap-danger) 38%, transparent); background: color-mix(in srgb, var(--acap-danger) 9%, transparent); color: var(--acap-text); }
.acap-notice[data-tone="warn"] { border-color: color-mix(in srgb, var(--acap-warn) 38%, transparent); background: color-mix(in srgb, var(--acap-warn) 9%, transparent); color: var(--acap-text); }
.acap-notice[data-tone="ok"] { border-color: color-mix(in srgb, var(--acap-success) 38%, transparent); background: color-mix(in srgb, var(--acap-success) 9%, transparent); color: var(--acap-text); }

/* ── mcp ──────────────────────────────────────────────────────────────── */
.acap-section { display: flex; flex-direction: column; gap: 9px; }
.acap-section-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.acap-section-title { font-size: 13px; font-weight: 600; margin: 0; display: inline-flex; align-items: center; gap: 7px; }
.acap-section-count { font-size: 11px; color: var(--acap-muted-2); font-variant-numeric: tabular-nums; }
.acap-srv { display: flex; align-items: center; gap: 10px; padding: 9px 11px; border: 1px solid var(--acap-line-soft); border-radius: 10px; background: var(--acap-surface); min-width: 0; transition: border-color 160ms ease; }
.acap-srv:hover { border-color: var(--acap-line); }
.acap-srv[data-off="true"] { background: transparent; }
.acap-srv-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.acap-srv-top { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.acap-srv-name { font-family: var(--acap-mono); font-size: 12px; font-weight: 600; }
.acap-srv[data-off="true"] .acap-srv-name { color: var(--acap-muted); }
.acap-srv-cmd { font-family: var(--acap-mono); font-size: 10.5px; color: var(--acap-muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.acap-tool { font-family: var(--acap-mono); font-size: 10px; padding: 1px 5px; border-radius: 4px; background: var(--acap-surface-2); border: 1px solid var(--acap-line-soft); color: var(--acap-muted); }
.acap-srv-actions { display: inline-flex; align-items: center; gap: 4px; flex: none; }

.acap-caret { transition: transform 160ms ease; display: inline-flex; }
.acap-caret-open { transform: rotate(180deg); }
.acap-fold { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: none; padding: 0; border: 0; border-radius: 5px; background: transparent; color: var(--acap-muted); cursor: pointer; }
.acap-fold:hover { background: var(--acap-hover); color: var(--acap-text); }
.acap-fold:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: 1px; }
.acap-anchor-cur { font-family: var(--acap-mono); font-size: 11.5px; color: var(--acap-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── where the manager shows up ───────────────────────────────────────── */
.acap-place-list { display: flex; flex-direction: column; gap: 8px; }
.acap-place { display: flex; align-items: center; gap: 12px; padding: 11px 13px; border: 1px solid var(--acap-line-soft); border-radius: 10px; background: var(--acap-surface); }
.acap-place[data-on="true"] { border-color: color-mix(in srgb, var(--acap-accent) 34%, transparent); background: color-mix(in srgb, var(--acap-accent) 6%, transparent); }
.acap-place-text { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.acap-place-label { font-size: 12.5px; font-weight: 600; color: var(--acap-text); }
.acap-place-hint { font-size: 11px; line-height: 1.5; color: var(--acap-muted); }
.acap-sheet-count { font-size: 11px; color: var(--acap-muted-2); font-variant-numeric: tabular-nums; }
/* The plugin's own page in the plugin list: the same switches as the 入口 sheet. */
.acap-plugin-settings { display: flex; flex-direction: column; gap: 10px; }
.acap-plugin-title { font-size: 13px; font-weight: 600; color: var(--acap-text); }

/* ── composer control ─────────────────────────────────────────────────── */
.acap-chip-wrap { display: inline-flex; }
/* The composer row already has a permission trigger; this chip takes the same height,
   radius, colour and hover wash so the two sit on one line without a second style. */
.acap-chip { display: inline-flex; align-items: center; gap: 4px; min-width: 0; max-width: 220px; height: 28px; padding: 0 4px 0 8px; border: none; border-radius: var(--dsw-radius-sm, 6px); background: none; color: var(--dsw-alias-label-secondary, var(--acap-muted)); font-size: 13px; font-weight: 500; line-height: 20px; letter-spacing: 0.04em; cursor: pointer; }
.acap-chip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--acap-hover)); }
.acap-chip[data-changed="true"] { color: var(--dsw-alias-state-business-primary, var(--acap-accent)); }
.acap-chip-icon { display: inline-flex; flex: none; }
.acap-chip-icon svg { width: 14px; height: 14px; }
.acap-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-chip-count { flex: none; min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px; background: color-mix(in srgb, currentColor 16%, transparent); font-size: 10.5px; font-weight: 600; line-height: 16px; text-align: center; font-variant-numeric: tabular-nums; }
.acap-chip-chevron { display: inline-flex; flex: none; color: var(--dsw-alias-label-caption, var(--acap-muted-2)); transition: transform 0.12s; }
.acap-chip[data-open="true"] .acap-chip-chevron { transform: rotate(180deg); }

/* The host paints its primary buttons with the brand colour, which is near black in
   the light theme. These pages use the accent so the one action per page stands out. */
.acap-root button[class*="_primary_"]:not([disabled]), .acap-sheet button[class*="_primary_"]:not([disabled]) { background: color-mix(in srgb, var(--acap-hue-blue) 92%, var(--acap-text)); border-color: transparent; color: #fff; box-shadow: 0 1px 2px color-mix(in srgb, var(--acap-hue-blue) 30%, transparent); }
.acap-root button[class*="_primary_"]:not([disabled]):hover, .acap-sheet button[class*="_primary_"]:not([disabled]):hover { background: color-mix(in srgb, var(--acap-hue-blue) 82%, var(--acap-text)); }
.acap-chip:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, var(--acap-accent))); }
.acap-temp-tabs { margin: 2px 0 8px; }
.acap-temp-head { display: flex; align-items: baseline; gap: 7px; margin: 16px 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--acap-line-soft); font-size: 11px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--acap-muted); }
.acap-temp-head:first-of-type { margin-top: 2px; }
.acap-temp-count { font-size: 10.5px; font-weight: 400; letter-spacing: 0; text-transform: none; color: var(--acap-muted-2); font-variant-numeric: tabular-nums; }
.acap-temp-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 4px; }
.acap-temp-group { display: flex; flex-direction: column; gap: 4px; }
.acap-temp-group-bar { display: flex; align-items: center; gap: 8px; padding: 2px 2px; border-radius: 7px; }
.acap-temp-group-bar:hover { background: var(--acap-hover); }
.acap-temp-group-toggle { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; appearance: none; border: 0; background: transparent; font: inherit; font-size: 11.5px; font-weight: 600; color: var(--acap-text); padding: 3px 0; cursor: pointer; text-align: left; }
.acap-temp-group-toggle:focus-visible { outline: 2px solid var(--acap-hue-blue); outline-offset: 2px; border-radius: 5px; }
.acap-temp-group[data-shut="true"] .acap-temp-count { margin-left: auto; }
.acap-temp-group-name { flex: none; }
.acap-temp-group-hint { font-size: 10.5px; font-weight: 400; color: var(--acap-muted-2); }
.acap-temp-group-rows { display: flex; flex-direction: column; border: 1px solid var(--acap-line-soft); border-radius: 9px; overflow: hidden; background: var(--acap-surface); }
.acap-temp-group-rows .acap-temp-row { border: 0; border-radius: 0; padding: 7px 11px; }
.acap-temp-group-rows .acap-temp-row + .acap-temp-row { border-top: 1px solid var(--acap-line-soft); }
.acap-temp-row { display: flex; align-items: center; gap: 10px; padding: 7px 11px; border: 1px solid var(--acap-line-soft); border-radius: 9px; background: var(--acap-surface); }
.acap-temp-row[data-dropped="true"] { background: transparent; }
.acap-temp-row[data-dropped="true"] .acap-temp-name { color: var(--acap-muted-2); text-decoration: line-through; text-decoration-thickness: 1px; }
.acap-temp-main { display: flex; align-items: center; gap: 7px; flex: 1; min-width: 0; }
.acap-temp-name { font-family: var(--acap-mono); font-size: 11.5px; color: var(--acap-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-temp-scope { flex: none; font-size: 10.5px; color: var(--acap-muted-2); }
.acap-temp-actions { display: inline-flex; align-items: center; gap: 8px; flex: none; }

/* ── sheet (dialog shell) ─────────────────────────────────────────────── */
.acap-sheet.acap-sheet { width: min(940px, 100%); max-height: 100%; padding: 0; gap: 0; overflow: hidden; display: flex; flex-direction: column; color: var(--acap-text); background: var(--dsw-alias-bg-layer-2, #1c1c1c); }
.acap-sheet-sm.acap-sheet-sm { width: min(460px, 100%); }
.acap-sheet-md.acap-sheet-md { width: min(580px, 100%); max-height: min(80vh, 760px); }
.acap-sheet-head { display: flex; align-items: flex-start; gap: 10px; padding: 18px 22px 15px; }
.acap-sheet-titles { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.acap-sheet-title { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.4; }
.acap-sheet-sub { margin: 0; font-size: 11.5px; color: var(--acap-muted-2); line-height: 1.55; text-wrap: pretty; }
.acap-sheet-body { padding: 4px 22px 20px; overflow: auto; min-height: 0; flex: 1; }
.acap-sheet-foot { display: flex; align-items: center; gap: 8px; padding: 12px 22px; border-top: 1px solid var(--acap-line-soft); background: var(--dsw-alias-bg-layer-1, var(--acap-surface)); }
.acap-sheet-foot .acap-grow { flex: 1; min-width: 0; }
.acap-sheet-hint { font-size: 11px; color: var(--acap-muted-2); font-family: var(--acap-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── editor ───────────────────────────────────────────────────────────── */
.acap-edit { display: grid; grid-template-columns: minmax(0, 1fr) 292px; gap: 22px; align-items: start; }
@media (max-width: 880px) { .acap-edit { grid-template-columns: minmax(0, 1fr); } }
.acap-edit-col { display: flex; flex-direction: column; gap: 17px; min-width: 0; }
.acap-edit-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; }
@media (max-width: 660px) { .acap-edit-pair { grid-template-columns: minmax(0, 1fr); } }
.acap-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.acap-field > div { min-width: 0; }
.acap-field input, .acap-field textarea { width: 100%; box-sizing: border-box; font-size: 12.5px; }
/* The shipped Input is a shrink-to-fit inline box; in a form column it has to fill the field. */
.acap-field > div > span, .acap-search > span, .acap-anchor > div > span:has(> input) { width: 100%; box-sizing: border-box; }
.acap-label { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; color: var(--acap-text); }
.acap-label-req { color: var(--acap-danger); }
.acap-hint { font-size: 11px; color: var(--acap-muted-2); line-height: 1.5; text-wrap: pretty; }
.acap-counter { margin-left: auto; font-size: 10.5px; font-weight: 400; color: var(--acap-muted-2); font-variant-numeric: tabular-nums; }
.acap-textarea { display: block; width: 100%; box-sizing: border-box; resize: vertical; font: inherit; font-size: 12px; line-height: 1.65; color: var(--acap-text); background: transparent; border: 1px solid var(--acap-field-line); border-radius: 8px; padding: 8px 10px; transition: border-color 140ms ease; }
.acap-textarea::placeholder { color: var(--acap-muted-2); }
.acap-textarea:hover { border-color: var(--acap-field-line-hover); }
.acap-textarea:focus-visible { outline: none; border-color: var(--dsw-alias-state-business-primary, var(--acap-accent)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acap-accent) 16%, transparent); }
.acap-textarea-mono { font-family: var(--acap-mono); font-size: 11.5px; line-height: 1.75; }
.acap-textarea-body { min-height: 244px; }
.acap-select-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.acap-select-row > span { flex: 1 1 120px; min-width: 120px; }
.acap-select-row .acap-grow { flex: 1; min-width: 120px; }
.acap-pairs { display: flex; flex-direction: column; gap: 6px; }
.acap-pair-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) auto; align-items: center; gap: 6px; }
.acap-pair-row > span { width: 100%; min-width: 0; box-sizing: border-box; }
.acap-pair-row input { width: 100%; min-width: 0; box-sizing: border-box; font-size: 12px; }
.acap-pair-drop { opacity: 0.55; }
.acap-pair-drop:hover:not(:disabled) { opacity: 1; }
.acap-pair-drop:disabled { opacity: 0.25; }
.acap-pair-add { display: flex; justify-content: flex-start; }
.acap-toggle-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 11px 12px; border: 1px solid var(--acap-line-soft); border-radius: 9px; background: var(--acap-surface); }
@media (max-width: 660px) { .acap-toggle-row { grid-template-columns: minmax(0, 1fr); } }
.acap-toggle { display: flex; align-items: center; gap: 9px; min-width: 0; }
.acap-toggle-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.acap-toggle-title { font-size: 11.5px; font-weight: 550; color: var(--acap-text); line-height: 1.4; }
.acap-toggle .acap-note { font-size: 10.5px; line-height: 1.4; }
.acap-preview { display: flex; flex-direction: column; gap: 8px; position: sticky; top: 0; min-width: 0; padding: 12px; border: 1px solid var(--acap-line-soft); border-radius: 10px; background: var(--acap-surface); }
.acap-side { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 0; min-width: 0; align-self: stretch; }
.acap-side .acap-preview { position: static; flex: none; }
.acap-points { display: flex; flex-direction: column; gap: 7px; padding: 11px 12px; border: 1px solid var(--acap-line-soft); border-radius: 10px; background: var(--acap-surface); }
.acap-point { display: flex; align-items: flex-start; gap: 7px; font-size: 11px; line-height: 1.55; color: var(--acap-muted); }
.acap-point-dot { flex: none; width: 3px; height: 3px; margin-top: 7px; border-radius: 50%; background: var(--acap-muted-2); }
.acap-preview-head { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 550; color: var(--acap-muted); }
.acap-preview-path { display: block; font-family: var(--acap-mono); font-size: 10px; line-height: 1.5; color: var(--acap-muted); background: var(--acap-surface-2); border: 1px solid var(--acap-line-soft); border-radius: 5px; padding: 3px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-preview-chip { font-family: var(--acap-mono); font-size: 10px; font-weight: 400; color: var(--acap-muted-2); background: var(--acap-surface-2); border-radius: 5px; padding: 2px 6px; }
.acap-pre { margin: 0; padding: 9px 10px; max-height: 420px; overflow: auto; border-radius: 7px; background: var(--acap-surface-2); font-family: var(--acap-mono); font-size: 10.5px; line-height: 1.7; color: var(--acap-muted); white-space: pre-wrap; overflow-wrap: anywhere; }
.acap-side .acap-pre { flex: none; }
.acap-pre-key { color: var(--acap-accent); }

/* ── picker ───────────────────────────────────────────────────────────── */
.acap-picker { display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.acap-picker-bar { display: flex; align-items: center; gap: 8px; }
.acap-picker-field { flex: 1; min-width: 160px; }
.acap-picker-count { flex: none; font-size: 11px; color: var(--acap-muted-2); font-variant-numeric: tabular-nums; }
.acap-picker-path { flex: 1; min-width: 0; font-family: var(--acap-mono); font-size: 11px; color: var(--acap-muted); background: var(--acap-surface-2); border: 1px solid var(--acap-line-soft); border-radius: 7px; padding: 5px 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-picker-list { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow: auto; border: 1px solid var(--acap-line-soft); border-radius: 10px; padding: 5px; background: var(--acap-surface); }
.acap-picker-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; font: inherit; font-size: 12px; color: var(--acap-text); text-align: left; cursor: pointer; transition: background 140ms ease; }
.acap-picker-item:hover { background: var(--acap-hover); }
.acap-picker-item:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: -1px; }
.acap-picker-item-name { font-family: var(--acap-mono); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-picker-item-meta { flex: 1; min-width: 0; font-size: 11px; color: var(--acap-muted-2); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-picker-item[aria-pressed="true"] { background: var(--acap-surface-2); }
.acap-anchor-block { align-items: stretch; flex-direction: column; flex-wrap: nowrap; min-width: 0; gap: 7px; }
.acap-anchor-path { font-family: var(--acap-mono); font-size: 10.5px; color: var(--acap-muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-picker-current { display: flex; align-items: baseline; gap: 7px; min-width: 0; overflow: hidden; flex-wrap: nowrap; padding: 6px 9px; border: 1px solid color-mix(in srgb, var(--acap-hue-blue) 26%, transparent); border-radius: 8px; background: color-mix(in srgb, var(--acap-hue-blue) 7%, transparent); }
.acap-picker-current-label { flex: none; font-size: 11px; color: var(--acap-muted-2); }
.acap-picker-current-name { flex: 1 1 auto; min-width: 0; font-size: 12px; font-weight: 600; color: var(--acap-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-picker-current-path { flex: 0 1 auto; max-width: 42%; min-width: 0; font-family: var(--acap-mono); font-size: 10.5px; color: var(--acap-muted-2); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-session-list { max-height: 246px; }
.acap-session-item { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 41px; padding: 5px 8px; border: 0; border-radius: 7px; background: transparent; font: inherit; color: var(--acap-text); text-align: left; cursor: pointer; transition: background 140ms ease; }
.acap-session-item:hover { background: var(--acap-hover); }
.acap-session-item:focus-visible { outline: 2px solid var(--acap-accent); outline-offset: -1px; }
.acap-session-item[aria-pressed="true"] { background: color-mix(in srgb, var(--acap-hue-blue) 10%, transparent); box-shadow: inset 2px 0 0 var(--acap-hue-blue); }
.acap-session-main { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
.acap-session-title { font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-session-path { font-family: var(--acap-mono); font-size: 10.5px; color: var(--acap-muted-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acap-session-ok { flex: none; display: inline-flex; color: var(--acap-hue-blue); }
.acap-live { flex: none; width: 7px; height: 7px; border-radius: 50%; background: color-mix(in srgb, var(--acap-text) 18%, transparent); }
.acap-live[data-live="true"] { background: var(--acap-success); box-shadow: 0 0 0 3px color-mix(in srgb, var(--acap-success) 18%, transparent); }
.acap-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--acap-line-strong); }
.acap-dot[data-live="true"] { background: var(--acap-success); }
.acap-src-hint { display: flex; align-items: center; gap: 6px; padding: 7px 10px 9px; font-size: 11.5px; color: var(--acap-muted); }

.acap-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (prefers-reduced-motion: reduce) { .acap-root *, .acap-sheet *, .acap-root *::before, .acap-root *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; } }
`

    let styleElement
    const injectStyles = () => {
      if (styleElement !== undefined && styleElement.isConnected) return styleElement
      styleElement = document.createElement('style')
      styleElement.setAttribute('data-dsh-skill-mcp-manager', '')
      styleElement.textContent = CSS
      document.head.appendChild(styleElement)
      return styleElement
    }

    // ── building blocks ─────────────────────────────────────────────────────

    const Tag = ({ children, tone, hue }) => h('span', {
      className: tone === undefined ? 'acap-tag' : `acap-tag acap-tag-${tone}`,
      'data-hue': hue,
    }, children)

    /** The directories a person manages, as opposed to the agents that ship a mark. */
    const isFolder = (source) => {
      const key = String(source?.id ?? source?.key ?? source?.label ?? '')
      return source?.custom === true || key === 'session' || key === 'project'
    }

    const Mark = ({ source, large }) => {
      const FolderIcon = primitives.IconFolderCloseRegular
      const size = large === true ? 16 : 14
      const glyph = isFolder(source) && FolderIcon !== undefined
        ? h(FolderIcon, { size })
        : h('svg', {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'currentColor',
          focusable: 'false',
        }, h('path', { d: glyphOf(source) }))
      return h('span', {
        className: large === true ? 'acap-mark acap-mark-lg' : 'acap-mark',
        'data-hue': hueOf(source?.id ?? source?.key ?? source?.label),
        'aria-hidden': 'true',
      }, glyph)
    }

    const Field = ({ label, required, hint, counter, children }) => h('div', { className: 'acap-field' }, [
      h('span', { key: 'l', className: 'acap-label' }, [
        h('span', { key: 't' }, label),
        required === true ? h('span', { key: 'r', className: 'acap-label-req', 'aria-hidden': 'true' }, '*') : null,
        counter === undefined ? null : h('span', { key: 'c', className: 'acap-counter' }, counter),
      ]),
      h('div', { key: 'c' }, children),
      hint === undefined ? null : h('span', { key: 'h', className: 'acap-hint' }, hint),
    ])

    const Segmented = ({ id, value, options, onChange, label }) => h(SegmentedControl, {
      id: id ?? 'acap-segmented',
      value,
      // 常量表里的选项带词条键，调用方也可以直接把翻好的文案传进来。
      options: options.map((option) => ({
        value: option.value,
        label: option.label ?? t(option.key),
        title: option.title ?? (option.hintKey === undefined ? undefined : t(option.hintKey)),
      })),
      onChange,
      label,
    })

    const Notice = ({ tone = 'info', children }) => h('div', { className: 'acap-notice', 'data-tone': tone }, children)

    /** A short list of consequences, used beside a form so the right column is not empty. */
    const Points = ({ rows }) => h('div', { className: 'acap-points' }, rows.map((row, index) => h('div', { key: String(index), className: 'acap-point' }, [
      h('span', { key: 'd', className: 'acap-point-dot', 'aria-hidden': 'true' }),
      h('span', { key: 't' }, row),
    ])))

    const IconButton = ({ label, danger, onClick, children }) => h('button', {
      type: 'button',
      className: danger === true ? 'acap-icon-btn acap-icon-btn-danger' : 'acap-icon-btn',
      'aria-label': label,
      title: label,
      onClick,
    }, children)

    /**
     * The dialog shell both editors share: fixed head, scrolling body, action foot.
     * While `busy`, the dialog cannot be dismissed: the request in flight still has to
     * report back into it.
     */
    const Sheet = ({ title, subtitle, onClose, footer, children, small, medium, busy }) => h(Modal, {
      open: true,
      onClose: busy === true ? () => undefined : onClose,
      title,
      headless: true,
      backdropBlur: true,
      className: small === true ? 'acap-sheet acap-sheet-sm' : medium === true ? 'acap-sheet acap-sheet-md' : 'acap-sheet',
    }, [
      h('header', { key: 'h', className: 'acap-sheet-head' }, [
        h('div', { key: 't', className: 'acap-sheet-titles' }, [
          h('h2', { key: 'x', className: 'acap-sheet-title' }, title),
          subtitle === undefined ? null : h('p', { key: 's', className: 'acap-sheet-sub' }, subtitle),
        ]),
        h('button', {
          key: 'c',
          type: 'button',
          className: 'acap-icon-btn',
          'aria-label': t('composer.close'),
          title: t('composer.close'),
          disabled: busy === true,
          onClick: onClose,
        }, icon(IconClose, { size: 14 })),
      ]),
      h('div', { key: 'b', className: 'acap-sheet-body' }, children),
      h('footer', { key: 'f', className: 'acap-sheet-foot' }, footer),
    ])

    let pairSeq = 0
    const pairRow = (key = '', value = '') => {
      pairSeq += 1
      return { id: `pair-${pairSeq}`, key, value }
    }
    /** Values keep every character typed into them: signatures and base64 padding are part of the value. */
    const rowsToPairs = (rows) => {
      const pairs = {}
      const problems = []
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = String(row?.key ?? '').trim()
        const value = String(row?.value ?? '')
        if (key === '') {
          if (value.trim() !== '') problems.push(t('field.pair.noKey', { value: value.trim().slice(0, 24) }))
          continue
        }
        if (Object.prototype.hasOwnProperty.call(pairs, key)) problems.push(t('field.pair.duplicate', { key }))
        pairs[key] = value
      }
      return { pairs, problems }
    }
    const rowsOfPairs = (pairs) => {
      const rows = Object.entries(pairs ?? {}).map(([key, value]) => pairRow(key, String(value ?? '')))
      return rows.length === 0 ? [pairRow()] : rows
    }
    const argsToText = (args) => (Array.isArray(args) ? args.join('\n') : '')
    const textToArgs = (text) => String(text ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '')

    /** The name grammar the registry enforces, mirrored for instant feedback. */
    const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u
    const nameProblem = (name) => {
      const text = String(name ?? '').trim()
      if (text === '') return t('name.empty')
      if (text.length > 64) return t('name.long')
      if (!NAME_PATTERN.test(text)) return t('name.pattern')
      return ''
    }
    const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u
    const serverNameProblem = (name) => (String(name ?? '').trim() === '' ? t('serverName.empty') : '')
    /** Same derivation as the host: a person names a server freely, the mount grammar is ASCII. */
    const hashHex = (text) => {
      let hash = 0x811c9dc5
      for (let index = 0; index < text.length; index += 1) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
      }
      return hash.toString(16).padStart(8, '0')
    }
    const mountNameOf = (name) => {
      const text = String(name ?? '')
      if (SERVER_NAME.test(text)) return text
      const tail = `-${hashHex(text).slice(0, 6)}`
      const head = text.replace(/[^A-Za-z0-9_-]/gu, '-').replace(/-+/gu, '-').replace(/^-|-$/gu, '')
      const trimmed = head.slice(0, 32 - tail.length).replace(/-$/u, '')
      return `${trimmed === '' ? 'server' : trimmed}${tail}`
    }

    /** One YAML scalar, quoted only when a reader would otherwise misread it. */
    const yamlValue = (value) => {
      const text = String(value ?? '')
      if (text !== '' && !/[:#\n"'\\]|^\s|\s$/u.test(text) && !/^[-?*&!|>%@`]/u.test(text)) return text
      return JSON.stringify(text)
    }

    const skillDocument = (editor) => {
      const lines = ['---', `name: ${yamlValue(String(editor.name ?? '').trim())}`, `description: ${yamlValue(String(editor.description ?? '').trim())}`]
      const when = String(editor.whenToUse ?? '').trim()
      if (when !== '') lines.push(`whenToUse: ${yamlValue(when)}`)
      if (editor.modelInvocable === false) lines.push('disable-model-invocation: true')
      if (editor.userInvocable === false) lines.push('user-invocable: false')
      lines.push('---', '')
      const body = String(editor.content ?? '').replace(/\s+$/u, '')
      if (body !== '') lines.push(body)
      return lines.join('\n')
    }

    const mcpConfigPreview = (server) => {
      const base = { serverName: mountNameOf(server.name), toolCallTimeoutMs: Number(server.toolCallTimeoutMs) || 60000, failOnStartupError: false }
      const body = server.transport === 'stdio'
        ? { transport: 'stdio', command: server.command, args: server.args ?? [], env: server.env ?? {}, ...(server.cwd === '' ? {} : { cwd: server.cwd }) }
        : { transport: 'streamable-http', url: server.url, headers: server.headers ?? {} }
      return JSON.stringify({ ...base, ...body }, null, 2)
    }

    const emptyServer = () => ({
      id: '',
      name: '',
      enabled: true,
      transport: 'stdio',
      command: '',
      args: [],
      env: {},
      cwd: '',
      url: '',
      headers: {},
      toolCallTimeoutMs: 60000,
    })

    /** `{ok:true,value}` / `{ok:false,error}`; the host's own failures arrive as `{error}`. */
    const unwrap = (raw) => {
      if (raw !== null && typeof raw === 'object' && 'ok' in raw) {
        if (raw.ok === false) {
          const failure = raw.error
          throw new Error(typeof failure === 'string' ? failure : String((failure && (failure.message || failure.code)) || t('note.callFailed')))
        }
        return raw.value
      }
      return raw
    }

    const errorOf = (result) => (result !== null && typeof result === 'object' && typeof result.error === 'string' ? result.error : '')

    /** A request that never comes back would leave the page spinning with no way out. */
    const CALL_TIMEOUT_MS = 20000
    const EMPTY_COUNTS = { skills: 0, enabled: 0, disabled: 0, sources: 0, activeSources: 0 }

    // ── notifications ───────────────────────────────────────────────────────

    /**
     * Short confirmations go to the frame-wide overlay rather than into the page, so
     * a saved edit does not push the list around. The queue lives outside the pages:
     * an answer that arrives after the page is gone still has somewhere to land.
     */
    let noticeSeq = 0
    const noticeListeners = new Set<(notice: { text: string; tone: string; seq: number }) => void>()
    const notify = (text: string, tone = 'ok') => {
      const message = String(text ?? '').trim()
      if (message === '') return
      const notice = { text: message, tone, seq: (noticeSeq += 1) }
      for (const listener of [...noticeListeners]) listener(notice)
    }
    const holdMsOf = (text) => Math.min(8000, Math.max(2600, String(text).length * 90))

    class NoticeHost extends React.Component {
      constructor(props) {
        super(props === undefined || props === null ? {} : props)
        this.state = { notice: undefined }
        this.listen = (notice) => this.setState({ notice })
      }

      componentDidMount() {
        noticeListeners.add(this.listen)
      }

      componentWillUnmount() {
        noticeListeners.delete(this.listen)
      }

      render() {
        try {
          const notice = this.state.notice
          const Toast = primitives.Toast
          if (notice === undefined || Toast === undefined) return null
          return h(Toast, {
            key: notice.seq,
            text: notice.text,
            tone: notice.tone === 'error' ? 'error' : 'success',
            icon: notice.tone === 'error' ? icon(IconWarning, {}) : undefined,
            holdMs: holdMsOf(notice.text),
            onDone: () => {
              if (this.state.notice?.seq === notice.seq) this.setState({ notice: undefined })
            },
          })
        } catch (error) {
          return null
        }
      }
    }

    // ── the settings page ───────────────────────────────────────────────────

    class ManagerPage extends React.Component {
      constructor(props) {
        super(props === undefined || props === null ? {} : props)
        const pinned = props?.sessionId ?? ''
        this.state = {
          loading: true,
          error: '',
          view: undefined,
          mcp: undefined,
          mcpError: '',
          scope: pinned === '' ? 'global' : 'session',
          projectRoot: '',
          sessionId: pinned,
          placesOpen: false,
          sessionQuery: '',
          sourceFilter: 'all',
          stateFilter: 'all',
          query: '',
          busy: '',
          skillEditor: undefined,
          serverEditor: undefined,
          picker: undefined,
          confirm: undefined,
          catalog: undefined,
          collapsed: {},
          zoneOpen: {},
          composer: undefined,
          localeRev: localeRevision,
        }
        this.pollTimer = undefined
        this.mcpSeq = 0
        // 每次打开编辑器、目录选择器、模型视角都换一张票；回包时票不对就丢掉
        this.ticket = 0
        // 服务器列表与显示位置都是整份写回，排队执行才能让后一次基于前一次的结果
        this.writes = Promise.resolve()
      }

      componentDidMount() {
        this.mounted = true
        this.watch = () => this.onChange({ localeRev: localeRevision })
        localeListeners.add(this.watch)
        void this.load()
      }

      componentWillUnmount() {
        this.mounted = false
        localeListeners.delete(this.watch)
        if (this.pollTimer !== undefined) clearTimeout(this.pollTimer)
        this.pollTimer = undefined
      }

      get api() {
        return this.props?.api
      }

      onChange(patch) {
        if (this.mounted !== true) return
        if (patch.view !== undefined) this.latestView = patch.view
        this.setState(patch)
      }

      /**
       * Run one whole-list write after every write before it has come back. Each job
       * reads the record it rewrites when it starts, so two quick switches both land.
       */
      queued(job) {
        const next = this.writes.then(job, job)
        this.writes = next.catch(() => undefined)
        return next
      }

      say(status, statusTone = 'ok') {
        notify(status, statusTone)
      }

      /** One remote call: unwraps the envelope and turns a hang into an error line. */
      async call(method, input = undefined) {
        const api = this.api
        if (api === undefined || typeof api[method] !== 'function') {
          return { error: t('note.noMethod', { method }) }
        }
        let timer
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(t('note.timeout', { method, seconds: CALL_TIMEOUT_MS / 1000 }))), CALL_TIMEOUT_MS)
        })
        try {
          const pending = input === undefined ? api[method]() : api[method](input)
          return unwrap(await Promise.race([pending, deadline]))
        } catch (error) {
          return { error: String(error?.message ?? error) }
        } finally {
          clearTimeout(timer)
        }
      }

      async load() {
        const result = await this.call('snapshot')
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ loading: false, error: failure })
          return
        }
        this.onChange({ loading: false, error: '', view: result, ...this.selectionOf(result) })
        void this.refreshMcp()
      }

      /** Keep the pickers pointing at something that exists in the new snapshot. */
      selectionOf(view) {
        const patch: { projectRoot?: string; sessionId?: string } = {}
        const projects = view?.projects ?? []
        if (!projects.some((row) => row.root === this.state.projectRoot)) patch.projectRoot = projects[0]?.root ?? ''
        const sessions = view?.sessions ?? []
        const pinned = this.props?.sessionId
        if (pinned !== undefined && pinned !== '' && sessions.some((row) => row.id === pinned)) {
          if (this.state.sessionId !== pinned) patch.sessionId = pinned
        } else if (!sessions.some((row) => row.id === this.state.sessionId)) {
          patch.sessionId = (sessions.find((row) => row.live === true) ?? sessions[0])?.id ?? ''
        }
        return patch
      }

      async refreshMcp() {
        const seq = (this.mcpSeq += 1)
        const result = await this.call('mcpStatus')
        if (this.mounted !== true || seq !== this.mcpSeq) return
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ mcpError: failure })
          return
        }
        this.onChange({ mcp: result, mcpError: '' })
        if (result?.pending === true) this.schedulePoll()
      }

      /** A server that just connected publishes its tools a moment later. */
      schedulePoll() {
        if (this.pollTimer !== undefined) return
        this.pollTimer = setTimeout(() => {
          this.pollTimer = undefined
          if (this.mounted === true) void this.refreshMcp()
        }, 900)
      }

      /** Run one command that answers with the whole snapshot. */
      async run(method, input = undefined) {
        const result = await this.call(method, input)
        const failure = errorOf(result)
        if (failure !== '') return { error: failure }
        this.onChange({ view: result, error: '', ...this.selectionOf(result) })
        void this.refreshMcp()
        return { error: '' }
      }

      // ── derivation

      /** The scope arguments every skill and server call carries. */
      scopeArgs() {
        return this.scopeArgsOf(this.scopeAt())
      }

      /** The scope the page is drawing right now, as a target the handlers can carry. */
      scopeAt() {
        if (this.state.scope === 'project') return { scope: 'project', root: this.state.projectRoot }
        if (this.state.scope === 'session') return { scope: 'session', sessionId: this.state.sessionId }
        return { scope: 'global' }
      }

      /** Remote arguments for one scope, whichever one the page happens to be drawing. */
      scopeArgsOf(at) {
        if (at === undefined || at === null) return { scope: 'global' }
        if (at.scope === 'project') return { scope: 'project', root: at.root ?? '' }
        if (at.scope === 'session') return { scope: 'session', sessionId: at.sessionId ?? '' }
        return { scope: 'global' }
      }

      projectOf(view = this.state.view) {
        const rows = view?.projects ?? []
        return rows.find((row) => row.root === this.state.projectRoot) ?? rows[0]
      }

      sessionOf(view = this.state.view) {
        const rows = view?.sessions ?? []
        return rows.find((row) => row.id === this.state.sessionId) ?? rows.find((row) => row.live === true) ?? rows[0]
      }

      scopeView(view = this.state.view) {
        if (view === undefined) return undefined
        if (this.state.scope === 'project') return this.projectOf(view)
        if (this.state.scope === 'session') return this.sessionOf(view)
        return view.global
      }

      /**
       * How the current anchor is named in a sentence.
       * @returns a short phrase such as `全局` or `项目 demo-app`.
       */
      anchorText() {
        const anchor = this.anchor()
        if (anchor === undefined) return t('anchor.this')
        if (anchor.scope === 'global') return t('scope.global.short')
        if (anchor.scope === 'project') return `${t('scope.project.short')} ${lastSegment(anchor.root)}`
        return t('zone.session')
      }

      /** The anchor this page is editing, or undefined when the scope has no target yet. */
      anchor() {
        const view = this.state.view
        if (view === undefined) return undefined
        if (this.state.scope === 'global') return { scope: 'global' }
        if (this.state.scope === 'project') {
          const row = this.projectOf(view)
          return row === undefined ? undefined : { scope: 'project', root: row.root, entry: row }
        }
        const row = this.sessionOf(view)
        return row === undefined ? undefined : { scope: 'session', sessionId: row.id, entry: row }
      }

      counts() {
        const view = this.state.view
        const entry = this.scopeView()
        const counts = entry?.counts ?? EMPTY_COUNTS
        const servers = entry?.servers ?? []
        return { ...counts, servers: servers.length, enabledServers: servers.filter((server) => server.enabled).length, scopes: (view?.sessions ?? []).length }
      }

      filteredSources(entry = this.scopeView()) {
        const sources = entry?.sources ?? []
        const needle = this.state.query.trim().toLowerCase()
        const stateFilter = this.state.stateFilter
        const sourceFilter = this.state.sourceFilter
        const keepSkill = (skill) => {
          if (stateFilter === 'enabled' && skill.enabled !== true) return false
          if (stateFilter === 'disabled' && skill.enabled === true) return false
          if (stateFilter === 'broken' && skill.valid === true) return false
          if (needle === '') return true
          return `${skill.name} ${skill.description}`.toLowerCase().includes(needle)
        }
        const rows = []
        for (const source of sources) {
          if (sourceFilter !== 'all' && source.key !== sourceFilter) continue
          const skills = (source.skills ?? []).filter(keepSkill)
          if (skills.length === 0 && (needle !== '' || stateFilter !== 'all')) continue
          rows.push({ ...source, skills })
        }
        return rows
      }

      toolsFor(serverName) {
        const rows = this.state.mcp?.servers ?? []
        const server = this.state.view?.global?.servers?.find((entry) => entry.name === serverName)
        const match = rows.find((row) => row.serverName === serverName && row.scope === 'global')
        return { tools: match?.tools ?? [], error: match?.error ?? server?.error ?? '' }
      }

      // ── mutations

      async toggleSource(source, enabled, at) {
        const key = source.key
        this.say(enabled ? t('note.sourceOn.busy', { label: source.label }) : t('note.sourceOff.busy', { label: source.label }), 'ok')
        const { error } = await this.run('saveSource', { ...this.scopeArgsOf(at), source: key, enabled })
        if (error !== '') this.say(error, 'error')
        else this.say(enabled ? t('note.sourceOn', { label: source.label }) : t('note.sourceOff', { label: source.label }))
      }

      async toggleSkill(source, skill, enabled, at) {
        const { error } = await this.run('toggleSkills', { ...this.scopeArgsOf(at), source: source.key, names: [skill.name], enabled })
        if (error !== '') this.say(error, 'error')
        else this.say(enabled ? t('note.skillOn', { name: skill.name }) : t('note.skillOff', { name: skill.name }))
      }

      async removeSource(source, at) {
        this.setState({
          confirm: {
            title: t('confirm.removeSource', { label: source.label }),
            body: t('confirm.source.body', { dir: source.dir }),
            confirmLabel: t('confirm.removeSource.label'),
            run: async () => {
              const { error } = await this.run('removeSource', { ...this.scopeArgsOf(at), source: source.key })
              if (error !== '') throw new Error(error)
              this.setState({ confirm: undefined, sourceFilter: 'all' })
              this.say(t('note.removedSource', { label: source.label }))
            },
          },
        })
      }

      /** The record of one scope, whichever one a handler was handed. */
      entryOf(at) {
        const view = this.latestView ?? this.state.view
        if (view === undefined) return undefined
        const args = this.scopeArgsOf(at)
        if (args.scope === 'project') return (view.projects ?? []).find((row) => row.root === args.root)
        if (args.scope === 'session') return (view.sessions ?? []).find((row) => row.id === args.sessionId)
        return view.global
      }

      async saveServer(index, server) {
        const editor = this.state.serverEditor
        const at = editor?.at
        this.onChange({ serverEditor: { ...editor, busy: t('editor.saving'), error: '' } })
        const result = await this.queued(() => {
          const servers = (this.entryOf(at)?.servers ?? []).map((row) => ({ ...row }))
          if (index === -1) servers.push(server)
          else servers[index] = server
          return this.call('saveServers', { ...this.scopeArgsOf(at), mcpServers: servers })
        })
        const failure = errorOf(result)
        if (failure !== '') {
          // 编辑器在保存途中被关掉时，错误只能走提示条
          if (this.state.serverEditor === undefined) this.say(failure, 'error')
          else this.onChange({ serverEditor: { ...this.state.serverEditor, busy: '', error: failure } })
          return
        }
        this.onChange({ view: result, serverEditor: undefined, ...this.selectionOf(result) })
        this.say(t('note.saved', { name: server.name }))
        void this.refreshMcp()
      }

      async toggleServer(index, server, at) {
        const enabled = server.enabled !== true
        const { error } = await this.queued(() => {
          const servers = (this.entryOf(at)?.servers ?? []).map((row) => ({ ...row }))
          const position = servers.findIndex((row) => row.name === server.name)
          if (position === -1) return { error: t('note.serverGone', { name: server.name }) }
          servers[position] = { ...servers[position], enabled }
          return this.run('saveServers', { ...this.scopeArgsOf(at), mcpServers: servers })
        })
        if (error !== '') this.say(error, 'error')
        else this.say(enabled ? t('note.skillOn', { name: server.name }) : t('note.skillOff', { name: server.name }))
      }

      async removeServer(index, server, at) {
        this.setState({
          confirm: {
            title: t('confirm.deleteServer', { name: server.name }),
            body: t('confirm.server.body'),
            confirmLabel: t('confirm.deleteServer.label'),
            run: async () => {
              const { error } = await this.queued(() => {
                const servers = (this.entryOf(at)?.servers ?? []).filter((row) => row.name !== server.name)
                return this.run('saveServers', { ...this.scopeArgsOf(at), mcpServers: servers })
              })
              if (error !== '') throw new Error(error)
              this.setState({ confirm: undefined })
              this.say(t('note.deletedServer', { name: server.name }))
            },
          },
        })
      }

      async saveSkill(editor) {
        const problem = nameProblem(editor.name)
        if (problem !== '') {
          this.onChange({ skillEditor: { ...editor, error: problem } })
          return
        }
        if (String(editor.description ?? '').trim() === '') {
          this.onChange({ skillEditor: { ...editor, error: t('editor.noDescription') } })
          return
        }
        this.onChange({ skillEditor: { ...editor, busy: t('editor.saving'), error: '' } })
        const result = await this.call('saveSkill', {
          ...(editor.at ?? this.scopeArgs()),
          source: editor.source,
          name: String(editor.name).trim(),
          description: String(editor.description).trim(),
          whenToUse: String(editor.whenToUse ?? '').trim(),
          modelInvocable: editor.modelInvocable !== false,
          userInvocable: editor.userInvocable !== false,
          content: editor.content,
          renameFrom: editor.renameFrom ?? '',
          form: editor.form === 'file' ? 'file' : 'dir',
        })
        const failure = errorOf(result)
        if (failure !== '') {
          if (this.state.skillEditor?.ticket !== editor.ticket) this.say(failure, 'error')
          else this.onChange({ skillEditor: { ...this.state.skillEditor, busy: '', error: failure } })
          return
        }
        this.onChange({ view: result, skillEditor: undefined, ...this.selectionOf(result) })
        this.say(t('note.saved', { name: editor.name }))
      }

      async removeSkill(source, skill, at) {
        this.setState({
          confirm: {
            title: t('confirm.deleteSkill', { name: skill.name }),
            body: skill.form === 'dir'
              ? t('confirm.dir.body', { path: skill.path.replace(/\/SKILL\.md$/u, '') })
              : t('confirm.file.body', { path: skill.path }),
            confirmLabel: t('confirm.deleteSkill.label'),
            run: async () => {
              const { error } = await this.run('deleteSkill', { ...this.scopeArgsOf(at), source: source.key, name: skill.name })
              if (error !== '') throw new Error(error)
              this.setState({ confirm: undefined })
              this.say(t('note.deletedSkill', { name: skill.name }))
            },
          },
        })
      }

      async refresh() {
        this.onChange({ busy: t('head.refreshing') })
        const result = await this.call('refreshSkills')
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ busy: '' })
          this.say(failure, 'error')
          return
        }
        await this.load()
        this.onChange({ busy: '' })
        this.say(t('note.refreshed', { n: result.invalidated ?? 0 }))
      }

      async inspectCatalog() {
        const seq = ++this.ticket
        this.catalogSeq = seq
        this.onChange({ catalog: { loading: true, names: [], layer: '' } })
        const result = await this.call('skillCatalog', this.scopeArgs())
        if (this.catalogSeq !== seq || this.state.catalog === undefined) return
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ catalog: { loading: false, error: failure, names: [] } })
          return
        }
        this.onChange({ catalog: { loading: false, layer: result.layer, live: result.live !== false, names: result.names ?? [] } })
      }

      async openPicker(path, purpose) {
        this.onChange({ picker: { purpose, path: path ?? '', entries: [], parent: '', error: '', loading: true } })
        await this.loadDir(path)
      }

      async loadDir(path) {
        const seq = ++this.ticket
        this.pickerSeq = seq
        const result = await this.call('listDir', { path })
        if (this.pickerSeq !== seq || this.state.picker === undefined) return
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ picker: { ...this.state.picker, loading: false, error: failure } })
          return
        }
        this.onChange({ picker: { ...this.state.picker, loading: false, path: result.path, parent: result.parent, entries: result.entries ?? [], error: result.error ?? '' } })
      }

      async pickDirectory(path) {
        const picker = this.state.picker
        if (picker === undefined) return
        if (picker.purpose === 'project') {
          this.onChange({ picker: undefined, scope: 'project', projectRoot: path })
          return
        }
        this.onChange({ picker: { ...picker, loading: true, error: '' } })
        const result = await this.call('addSource', { ...this.scopeArgs(), dir: path })
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ picker: { ...picker, loading: false, error: failure } })
          return
        }
        this.onChange({ view: result, picker: undefined, ...this.selectionOf(result) })
        this.say(t('note.addedDir', { path }))
      }

      // ── editors

      openSkillEditor(source, skill, at) {
        const base = skill === undefined
          ? { name: '', description: '', whenToUse: '', content: '', modelInvocable: true, userInvocable: true, form: 'dir', renameFrom: '', path: '' }
          : { name: skill.name, description: skill.description, whenToUse: skill.whenToUse, content: '', modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable, form: skill.form, renameFrom: skill.name, path: skill.path }
        const ticket = ++this.ticket
        this.onChange({ skillEditor: { ...base, ticket, at: this.scopeArgsOf(at), source: source.key, sourceLabel: source.label, dir: source.dir, mode: skill === undefined ? 'create' : 'edit', error: '', busy: skill === undefined ? '' : t('editor.loading') } })
        if (skill !== undefined) void this.loadSkillBody(source, skill.name, at, ticket)
      }

      /** 正文读回来之前编辑器处于忙碌状态，保存按钮不可用，免得用空正文覆盖文件。 */
      async loadSkillBody(source, skillName, at, ticket) {
        const result = await this.call('readSkill', { ...this.scopeArgsOf(at), source: source.key, name: skillName })
        if (this.state.skillEditor?.ticket !== ticket) return
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ skillEditor: { ...this.state.skillEditor, busy: '', error: failure } })
          return
        }
        this.onChange({
          skillEditor: {
            ...this.state.skillEditor,
            busy: '',
            error: result.valid === false ? t('editor.broken', { problem: result.problem }) : '',
            name: result.name,
            description: result.description,
            whenToUse: result.whenToUse,
            content: result.content,
            modelInvocable: result.modelInvocable,
            userInvocable: result.userInvocable,
            form: result.form,
            renameFrom: result.name,
            path: result.path,
            resources: result.resources ?? [],
          },
        })
      }

      openServerEditor(index, server, at) {
        const base = server === undefined ? emptyServer() : { ...emptyServer(), ...server, args: [...(server.args ?? [])], env: { ...(server.env ?? {}) }, headers: { ...(server.headers ?? {}) } }
        this.onChange({
          serverEditor: {
            index,
            at: this.scopeArgsOf(at),
            mode: index === -1 ? 'create' : 'edit',
            server: base,
            argsText: argsToText(base.args),
            envRows: rowsOfPairs(base.env),
            headerRows: rowsOfPairs(base.headers),
            error: '',
            busy: '',
          },
        })
      }

      submitServerEditor() {
        const editor = this.state.serverEditor
        if (editor === undefined) return
        const server = editor.server
        const problem = serverNameProblem(server.name)
        if (problem !== '') {
          this.onChange({ serverEditor: { ...editor, error: problem } })
          return
        }
        const args = textToArgs(editor.argsText)
        const env = rowsToPairs(editor.envRows)
        const headers = rowsToPairs(editor.headerRows)
        const problems = [...env.problems, ...headers.problems]
        if (problems.length > 0) {
          this.onChange({ serverEditor: { ...editor, error: t('serverEditor.problems', { list: problems.join(t('list.separator')) }) } })
          return
        }
        if (server.transport === 'stdio' && String(server.command ?? '').trim() === '') {
          this.onChange({ serverEditor: { ...editor, error: t('serverEditor.noCommand') } })
          return
        }
        if (server.transport === 'streamable-http' && String(server.url ?? '').trim() === '') {
          this.onChange({ serverEditor: { ...editor, error: t('serverEditor.noUrl') } })
          return
        }
        // 一个范围里同名只留一台，新加一台时撞名要当场说出来，否则保存后它会被静默丢掉
        if (editor.index === -1) {
          const taken = (this.entryOf(editor.at)?.servers ?? []).some((row) => String(row?.name ?? '') === String(server.name ?? '').trim())
          if (taken) {
            this.onChange({ serverEditor: { ...editor, error: t('serverEditor.taken', { name: String(server.name ?? '').trim() }) } })
            return
          }
        }
        void this.saveServer(editor.index, {
          ...server,
          name: String(server.name).trim(),
          command: String(server.command ?? '').trim(),
          url: String(server.url ?? '').trim(),
          cwd: String(server.cwd ?? '').trim(),
          args,
          env: env.pairs,
          headers: headers.pairs,
        })
      }

      // ── render

      render() {
        try {
          return this.renderPage()
        } catch (error) {
          return h('div', { className: 'acap-root' }, h(Notice, { tone: 'error' }, t('note.renderFailed', { message: String(error?.message ?? error) })))
        }
      }

      renderPage() {
        const { loading, error, view } = this.state
        const page = this.page()
        const embedded = this.embedded()
        const shell = (body) => h('div', {
          className: 'acap-root',
          'data-page': page,
          'data-embedded': embedded,
        }, [
          this.renderHeader(view),
          body,
          this.state.placesOpen === true ? this.renderPlacesSheet() : null,
          this.state.skillEditor === undefined ? null : this.renderSkillEditor(),
          this.state.serverEditor === undefined ? null : this.renderServerEditor(),
          this.state.picker === undefined ? null : this.renderPicker(),
          this.state.confirm === undefined ? null : this.renderConfirm(),
        ])

        if (loading) return shell(h('div', { className: 'acap-note' }, page === 'mcp' ? t('note.reading') : t('note.readingSkills')))
        if (error !== '') return shell(h(Notice, { tone: 'error' }, error))
        if (view === undefined) return shell(h(Notice, { tone: 'error' }, t('note.noConfig')))

        return shell(h(React.Fragment, null, [
          embedded ? null : h('div', { key: 'tabs', className: 'acap-tabs', role: 'tablist', 'aria-label': t('tabs.scope') }, SCOPES.map((scope) => {
            const active = this.state.scope === scope.value
            const count = scope.value === 'global'
              ? (page === 'mcp' ? (view.global?.servers ?? []).length : (view.global?.counts?.skills ?? 0))
              : scope.value === 'project'
                ? (view.projects ?? []).reduce((total, row) => total + (page === 'mcp' ? (row.servers ?? []).length : (row.counts?.skills ?? 0)), 0)
                : (view.sessions ?? []).reduce((total, row) => total + (page === 'mcp' ? (row.servers ?? []).length : (row.counts?.skills ?? 0)), 0)
            return h('button', {
              key: scope.value,
              type: 'button',
              role: 'tab',
              className: 'acap-tab',
              'aria-selected': active,
              title: t(scope.hintKey),
              onClick: () => this.onChange({ scope: scope.value, sourceFilter: 'all', stateFilter: 'all', query: '', catalog: undefined }),
            }, [h('span', { key: 'l' }, page === 'mcp' ? t(SCOPE_LABEL_KEY[scope.value]) : t(scope.key)), h('span', { key: 'c', className: 'acap-tab-count' }, String(count))])
          })),
          embedded ? null : this.renderAnchor(view),
          page === 'mcp' ? null : this.renderActions(),
          page === 'mcp' || embedded ? null : this.renderStats(),
          page === 'mcp' ? null : this.renderFilters(),
          embedded
            ? this.renderEmbedded(view)
            : h(React.Fragment, null, [
              page === 'mcp' ? null : this.renderSources(),
              page === 'skills' ? null : this.renderServers(this.scopeView(), this.scopeAt()),
            ]),
          this.state.catalog === undefined ? null : this.renderCatalog(),
        ]))
      }

      /** Which half of the manager this page shows. */
      page() {
        const value = this.props?.page
        return value === 'skills' || value === 'mcp' ? value : 'both'
      }

      /** A page pinned to one conversation draws compact, without the pickers. */
      embedded() {
        const pinned = this.props?.sessionId
        return pinned !== undefined && pinned !== ''
      }

      renderHeader(view) {
        const plugin = view?.plugin
        const health = view?.health
        const page = this.page()
        const embedded = this.embedded()
        const title = page === 'mcp' ? t('title.mcp') : page === 'skills' ? t('title.skills') : t('title.both')
        const subtitle = page === 'mcp' ? t('sub.mcp') : t('sub.skills')
        return h('header', { className: 'acap-head', 'data-compact': embedded }, [
          h('div', { key: 'r', className: 'acap-head-row' }, [
            h('h1', { key: 't', className: 'acap-title' }, [
              title,
              plugin === undefined ? null : h('span', { key: 'v', className: 'acap-ver' }, `v${plugin.version}`),
            ]),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, {
              key: 'entry',
              variant: 'outline',
              size: 'sm',
              'aria-haspopup': 'dialog',
              title: t('head.entry.title'),
              onClick: () => this.onChange({ placesOpen: true, status: '' }),
            }, t('head.entry')),
            icon(IconRefresh, {}) === null ? null : h(Button, {
              key: 'refresh',
              variant: 'ghost',
              size: 'sm',
              icon: icon(IconRefresh, {}),
              disabled: this.state.busy !== '',
              onClick: () => void this.refresh(),
            }, this.state.busy === '' ? t('head.refresh') : this.state.busy),
          ]),
          embedded ? null : h('p', { key: 's', className: 'acap-sub' }, subtitle),
          embedded ? null : h('div', { key: 'm', className: 'acap-meta' }, [
            h('span', { key: 'l' }, t('head.record')),
            h('code', { key: 'p' }, view?.storePath ?? '…'),
            health?.status === 'reset' ? h('span', { key: 'h', className: 'acap-tag acap-tag-warn' }, t('head.record.reset')) : null,
          ]),
        ])
      }

      renderAnchor(view) {
        if (this.state.scope === 'global') return null
        if (this.state.scope === 'project') {
          const projects = view.projects ?? []
          const candidates = view.projectCandidates ?? []
          return h('div', { key: 'anchor', className: 'acap-anchor' }, [
            h('span', { key: 'l', className: 'acap-anchor-label' }, t('anchor.project')),
            projects.length === 0 ? null : h('select', {
              key: 'sel',
              className: 'acap-select',
              value: this.state.projectRoot,
              'aria-label': t('anchor.project.pick'),
              onChange: (event) => this.onChange({ projectRoot: event.target.value, sourceFilter: 'all', stateFilter: 'all', query: '', catalog: undefined }),
            }, projects.map((row) => h('option', { key: row.root, value: row.root }, row.live > 0 ? `${row.name} · ${t('anchor.live', { n: row.live })}` : row.name))),
            h(Button, {
              key: 'add',
              variant: 'ghost',
              size: 'sm',
              icon: icon(IconFolder, {}),
              onClick: () => void this.openPicker(this.state.projectRoot === '' ? view.defaults?.home : this.state.projectRoot, 'project'),
            }, projects.length === 0 ? t('anchor.project.none') : t('anchor.project.other')),
            candidates.length === 0 ? null : h('span', { key: 'c', className: 'acap-chip-row' }, [
              h('span', { key: 't', className: 'acap-anchor-label' }, t('anchor.project.recent')),
              ...candidates.slice(0, 6).map((candidate) => h('button', {
                key: candidate.root,
                type: 'button',
                className: 'acap-tab',
                style: { padding: '3px 9px', border: '1px solid var(--acap-line-soft)' },
                title: candidate.root,
                onClick: () => this.onChange({ projectRoot: candidate.root, sourceFilter: 'all', query: '', catalog: undefined }),
              }, candidate.name)),
            ]),
          ])
        }
        const sessions = view.sessions ?? []
        const pinned = this.props?.sessionId
        if (pinned !== undefined && pinned !== '') {
          const row = sessions.find((entry) => entry.id === pinned)
          return h('div', { key: 'anchor', className: 'acap-anchor acap-anchor-block' }, [
            h('div', { key: 'bar', className: 'acap-anchor' }, [
              h('span', { key: 'l', className: 'acap-anchor-label' }, t('anchor.session')),
              h('span', { key: 'd', className: 'acap-live', 'data-live': row?.live === true }),
              h('span', { key: 'n', className: 'acap-anchor-cur', title: row?.cwd ?? '' }, row?.label ?? t('anchor.unnamed')),
            ]),
            row?.cwd === undefined || row.cwd === '' ? null : h('span', { key: 'p', className: 'acap-anchor-path', title: row.cwd }, shortenPath(row.cwd, 96)),
          ])
        }
        const needle = this.state.sessionQuery.trim().toLowerCase()
        const matching = needle === ''
          ? sessions
          : sessions.filter((row) => `${row.label ?? ''} ${row.title ?? ''} ${row.workspace ?? ''} ${row.id} ${row.cwd ?? ''}`.toLowerCase().includes(needle))
        const selected = sessions.find((row) => row.id === this.state.sessionId)
        return h('div', { key: 'anchor', className: 'acap-anchor acap-anchor-block' }, [
          h('div', { key: 'bar', className: 'acap-anchor acap-picker-bar' }, [
            h('span', { key: 'l', className: 'acap-anchor-label' }, t('anchor.session')),
            h('div', { key: 'f', className: 'acap-picker-field' }, h(Input, {
              value: this.state.sessionQuery,
              placeholder: t('anchor.session.filter'),
              'aria-label': t('anchor.session.filter.label'),
              onChange: (event) => this.onChange({ sessionQuery: event.target.value }),
            })),
            sessions.length === 0 ? null : h('span', { key: 'c', className: 'acap-picker-count' }, t('anchor.session.count', { n: matching.length })),
          ]),
          selected === undefined
            ? h('span', { key: 'cur', className: 'acap-picker-current' }, t('picker.noSession'))
            : h('div', { key: 'cur', className: 'acap-picker-current' }, [
              h('span', { key: 't', className: 'acap-picker-current-label' }, t('picker.editing')),
              h('span', { key: 'n', className: 'acap-picker-current-name' }, selected.label ?? t('anchor.unnamed')),
              selected.cwd === undefined || selected.cwd === ''
                ? null
                : h('span', { key: 'p', className: 'acap-picker-current-path', title: selected.cwd }, shortenPath(selected.cwd, 52)),
            ]),
          sessions.length === 0
            ? h('div', { key: 'e', className: 'acap-note' }, t('picker.noKnown'))
            : h('div', { key: 'list', className: 'acap-picker-list acap-session-list' }, matching.length === 0
              ? h('div', { key: 'none', className: 'acap-note', style: { padding: '8px 8px' } }, t('anchor.session.noMatch', { query: this.state.sessionQuery }))
              : matching.slice(0, 60).map((row) => {
                const meta = row.cwd === undefined || row.cwd === '' ? agoOf(row.updatedAt) : shortenPath(row.cwd, 60)
                return h('button', {
                  key: row.id,
                  type: 'button',
                  className: 'acap-session-item',
                  'aria-pressed': row.id === this.state.sessionId,
                  title: row.cwd === '' ? undefined : row.cwd,
                  onClick: () => this.onChange({ sessionId: row.id, sourceFilter: 'all', stateFilter: 'all', query: '', catalog: undefined }),
                }, [
                  h('span', { key: 'd', className: 'acap-live', 'data-live': row.live === true }),
                  h('span', { key: 'm', className: 'acap-session-main' }, [
                    h('span', { key: 't', className: 'acap-session-title' }, row.label ?? row.title ?? t('anchor.unnamed')),
                    meta === '' ? null : h('span', { key: 'p', className: 'acap-session-path' }, meta),
                  ]),
                  row.id === this.state.sessionId ? h('span', { key: 'ok', className: 'acap-session-ok' }, icon(IconCheck, {})) : null,
                ])
              })),
        ])
      }

      renderActions() {
        const anchor = this.anchor()
        const sources = this.scopeView()?.sources ?? []
        const target = sources.find((source) => source.exists === true) ?? sources[0]
        return h('div', { key: 'actions', className: 'acap-actions' }, [
          this.embedded() ? h('span', { key: 'where', className: 'acap-actions-where', title: t('action.where.title') }, t('action.where')) : null,
          h(Button, {
            key: 'new',
            variant: 'primary',
            size: 'sm',
            icon: icon(IconPlus, {}),
            disabled: anchor === undefined || target === undefined,
            title: target === undefined ? t('action.create.noSource') : t('action.create.into', { label: target.label }),
            onClick: () => this.openSkillEditor(target, undefined, this.scopeAt()),
          }, t('action.create')),
          h(Button, {
            key: 'src',
            variant: 'outline',
            size: 'sm',
            icon: icon(IconFolder, {}),
            disabled: anchor === undefined,
            onClick: () => void this.openPicker(anchor?.scope === 'project' ? anchor.root : this.state.view?.defaults?.home, 'source'),
          }, t('action.addSource')),
          h('span', { key: 'g', className: 'acap-grow' }),
          h(Button, {
            key: 'cat',
            variant: 'ghost',
            size: 'sm',
            disabled: anchor === undefined,
            onClick: () => void this.inspectCatalog(),
          }, t('action.catalog')),
        ])
      }

      renderStats() {
        const counts = this.counts()
        const cells = [
          { key: 's', kind: 'skills', n: counts.skills, l: t('stats.skills') },
          { key: 'e', kind: 'enabled', n: counts.enabled, l: t('stats.enabled') },
          { key: 'd', kind: 'disabled', n: counts.disabled, l: t('stats.disabled'), off: counts.disabled === 0 },
          { key: 'src', kind: 'sources', n: `${counts.activeSources}/${counts.sources}`, l: t('stats.sources') },
        ]
        return h('div', { key: 'stats', className: 'acap-stats' }, cells.map((cell) => h('div', {
          key: cell.key,
          className: cell.off === true ? 'acap-stat acap-stat-off' : 'acap-stat',
          'data-k': cell.kind,
        }, [
          h('span', { key: 'n', className: 'acap-stat-n' }, String(cell.n)),
          h('span', { key: 'l', className: 'acap-stat-l' }, cell.l),
        ])))
      }

      renderFilters() {
        const sources = this.scopeView()?.sources ?? []
        return h('div', { key: 'filters', className: 'acap-filters' }, [
          h('select', {
            key: 'src',
            className: 'acap-select',
            value: this.state.sourceFilter,
            'aria-label': t('filter.source'),
            onChange: (event) => this.onChange({ sourceFilter: event.target.value }),
          }, [h('option', { key: 'all', value: 'all' }, t('filter.source.all')), ...sources.map((source) => h('option', { key: source.key, value: source.key }, t('filter.source.option', { label: source.label, n: (source.skills ?? []).length })))]),
          h('select', {
            key: 'state',
            className: 'acap-select',
            value: this.state.stateFilter,
            'aria-label': t('filter.state'),
            onChange: (event) => this.onChange({ stateFilter: event.target.value }),
          }, STATE_FILTERS.map((option) => h('option', { key: option.value, value: option.value }, t(option.key)))),
          h('div', { key: 'q', className: 'acap-search' }, h(Input, {
            value: this.state.query,
            placeholder: t('filter.query'),
            'aria-label': t('filter.query.label'),
            icon: icon(IconSearch, {}),
            onChange: (event) => this.onChange({ query: event.target.value }),
          })),
        ])
      }

      renderSources() {
        const anchor = this.anchor()
        if (anchor === undefined) {
          return h('div', { key: 'sources', className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, this.state.scope === 'project' ? t('empty.noProject') : t('empty.noSession')),
            h('span', { key: 'b', className: 'acap-empty-body' }, this.state.scope === 'project' ? t('empty.noProject.body') : t('empty.noSession.body')),
          ])
        }
        const rows = this.filteredSources()
        if (rows.length === 0) {
          const all = this.scopeView()?.sources ?? []
          return h('div', { key: 'sources', className: 'acap-sources' }, h('div', { className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, all.length === 0 ? t('empty.noSource') : t('empty.noMatch')),
            h('span', { key: 'b', className: 'acap-empty-body' }, all.length === 0 ? t('empty.noSource.body') : t('empty.noMatch.body')),
          ]))
        }
        return h('div', { key: 'sources', className: 'acap-sources' }, rows.map((source) => this.renderSource(source, this.scopeAt())))
      }

      renderSource(source, at) {
        const skills = source.skills ?? []
        const closed = this.state.collapsed?.[source.key] === true
        const shut = skills.filter((skill) => skill.enabled !== true && skill.valid !== false)
        // 整组按钮只看宿主读得到的技能，解析异常的那几个开不开都一样
        const allOpen = shut.length === 0
        return h('article', { key: source.key, className: 'acap-src', 'data-off': source.enabled !== true, 'data-hue': hueOf(source.custom === true ? 'custom' : source.id) }, [
          h('header', { key: 'h', className: 'acap-src-head' }, [
            h('button', {
              key: 'toggle',
              type: 'button',
              className: 'acap-fold',
              'aria-expanded': closed !== true,
              'aria-label': closed === true ? t('source.expand', { label: source.label }) : t('source.fold', { label: source.label }),
              onClick: () => this.onChange({ collapsed: { ...(this.state.collapsed ?? {}), [source.key]: closed !== true } }),
            }, h('span', { className: closed === true ? 'acap-caret' : 'acap-caret acap-caret-open' }, icon(IconChevron, {}))),
            h(Mark, { key: 'm', source }),
            h('div', { key: 'id', className: 'acap-src-id' }, [
              h('div', { key: 'n', className: 'acap-src-name' }, [
                source.label,
                h('span', { key: 'c', className: 'acap-tab-count' }, t('zone.skills', { n: skills.length })),
                source.kind === 'session' ? h(Tag, { key: 'k', tone: 'info' }, t('source.tag.session')) : null,
                source.custom === true ? h(Tag, { key: 'cu' }, t('source.tag.custom')) : null,
                source.hostScanned === true ? h(Tag, { key: 'hs' }, t('source.tag.host')) : null,
                source.enabled !== true ? h(Tag, { key: 'off', tone: 'off' }, t('source.tag.off')) : null,
                (source.forced ?? []).length === 0 ? null : h(Tag, { key: 'fo', tone: 'warn' }, t('source.tag.forced', { n: source.forced.length })),
              ]),
              h('div', { key: 'p', className: 'acap-src-path', title: source.dir }, shortenPath(source.dir)),
            ]),
            h('div', { key: 'a', className: 'acap-src-actions' }, [
              source.error !== '' && source.kind !== 'session' ? h(Tag, { key: 'e', tone: 'warn' }, source.error) : null,
              skills.length === 0 ? null : h(Button, {
                key: 'bulk',
                variant: 'ghost',
                size: 'sm',
                disabled: source.enabled !== true,
                title: allOpen ? t('source.group.off.title') : t('source.group.on.title'),
                onClick: () => void this.toggleGroup(source, skills, !allOpen, at),
              }, allOpen ? t('source.group.off') : t('source.group.on')),
              h(Switch, { key: 'sw', checked: source.groupOn !== false && source.enabled === true, label: t('source.enable', { label: source.label }), title: t('source.enable.title'), onChange: (next) => void this.toggleSource(source, next, at) }),
              source.custom === true
                ? h(IconButton, { key: 'rm', label: t('source.remove', { label: source.label }), danger: true, onClick: () => void this.removeSource(source, at) }, icon(IconTrash, { size: 13 }))
                : null,
            ]),
          ]),
          closed === true
            ? null
            : skills.length === 0
              ? h('div', { key: 'b', className: 'acap-skills' }, h('div', { className: 'acap-src-hint' }, source.error === ''
                ? t('source.path.empty')
                : source.kind === 'session'
                  ? t('source.path.session')
                  : t('source.path.missing')))
              : h('div', { key: 'b', className: 'acap-skills' }, skills.map((skill) => this.renderSkill(source, skill, at))),
        ])
      }

      /** One switch for a whole source: every skill in it, or none. */
      async toggleGroup(source, skills, enabled, at) {
        // 整组关着、只单独开了几个时，「整组启用」就是打开总开关
        if (enabled && source.groupOn === false) return this.toggleSource(source, true, at)
        const names = skills.filter((skill) => skill.valid !== false).map((skill) => skill.name)
        if (names.length === 0) return
        const result = await this.run('toggleSkills', { ...this.scopeArgsOf(at), source: source.key, names, enabled })
        if (result.error === '') this.say(t('note.sourceToggle', { label: source.label, state: enabled ? t('note.sourceEnabled') : t('note.sourceDisabled'), n: names.length }))
        else this.say(result.error, 'error')
      }

      /** Save one place switch and let the shell redraw its slots. */
      async savePlace(key, value) {
        let prefs
        const result = await this.queued(() => {
          prefs = { ...((this.latestView ?? this.state.view)?.prefs ?? {}), [key]: value }
          return this.run('savePrefs', prefs)
        })
        if (result.error !== '') {
          this.say(result.error, 'error')
          return
        }
        syncShell(prefs)
        this.say(value ? t('note.placed') : t('note.unplaced'))
      }

      /** The one place that decides where this plugin shows up. */
      renderPlacesSheet() {
        const prefs = this.state.view?.prefs ?? {}
        const places = [
          { key: 'sidebarSkills', label: t('places.sidebarSkills'), hint: t('places.sidebarSkills.hint') },
          { key: 'sidebarMcp', label: t('places.sidebarMcp'), hint: t('places.sidebarMcp.hint') },
          { key: 'tabSkills', label: t('places.tabSkills'), hint: t('places.tabSkills.hint') },
          { key: 'tabMcp', label: t('places.tabMcp'), hint: t('places.tabMcp.hint') },
        ]
        const openCount = places.filter((place) => prefs[place.key] === true).length
        return h(Sheet, {
          key: 'places-sheet',
          title: t('places.title'),
          subtitle: t('places.sub'),
          small: true,
          onClose: () => this.onChange({ placesOpen: false }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'c', className: 'acap-sheet-count' }, t('places.count', { open: openCount, total: places.length })),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'd', variant: 'outline', size: 'sm', onClick: () => this.onChange({ placesOpen: false }) }, t('places.close')),
          ]),
        }, h('div', { className: 'acap-place-list' }, places.map((place) => h('div', {
          key: place.key,
          className: 'acap-place',
          'data-on': prefs[place.key] === true,
        }, [
          h('div', { key: 't', className: 'acap-place-text' }, [
            h('span', { key: 'n', className: 'acap-place-label' }, place.label),
            h('span', { key: 'h', className: 'acap-place-hint' }, place.hint),
          ]),
          h(Switch, {
            key: 'sw',
            checked: prefs[place.key] === true,
            label: place.label,
            onChange: (next) => void this.savePlace(place.key, next),
          }),
        ]))))
      }

      renderSkill(source, skill, at) {
        return h('div', {
          key: `${source.key}:${skill.name}:${skill.path}`,
          className: 'acap-skill',
          'data-off': skill.enabled !== true,
          'data-hue': hueOf(source.custom === true ? 'custom' : source.id),
        }, [
          h('div', { key: 'm', className: 'acap-skill-main' }, [
            h('div', { key: 't', className: 'acap-skill-top' }, [
              h('code', { key: 'n', className: 'acap-skill-name' }, skill.name),
              skill.form === 'file' ? h(Tag, { key: 'f' }, t('skill.tag.file')) : null,
              skill.valid === false ? h(Tag, { key: 'b', tone: 'err' }, skill.error === '' ? t('skill.tag.broken') : skill.error) : null,
              skill.forced === true ? h(Tag, { key: 'fo', tone: 'warn' }, t('skill.tag.forced')) : null,
              skill.modelInvocable === false ? h(Tag, { key: 'mi', tone: 'off' }, t('skill.tag.noModel')) : null,
              skill.userInvocable === false ? h(Tag, { key: 'ui', tone: 'off' }, t('skill.tag.noUser')) : null,
            ]),
            h('div', { key: 'd', className: 'acap-skill-desc', title: skill.description }, skill.description === '' ? t('skill.noDescription') : skill.description),
          ]),
          h('div', { key: 'a', className: 'acap-skill-actions' }, [
            h(Switch, { key: 'sw', checked: skill.enabled === true, label: t('skill.enable', { name: skill.name }), onChange: (next) => void this.toggleSkill(source, skill, next, at) }),
            h(IconButton, { key: 'ed', label: t('skill.edit', { name: skill.name }), onClick: () => this.openSkillEditor(source, skill, at) }, icon(IconEdit, { size: 13 })),
            h(IconButton, { key: 'rm', label: t('skill.delete', { name: skill.name }), danger: true, onClick: () => void this.removeSkill(source, skill, at) }, icon(IconTrash, { size: 13 })),
          ]),
        ])
      }

      /** How many servers wait in the scopes this page is not showing. */
      otherScopeServers(at) {
        const view = this.state.view
        if (view === undefined) return ''
        const current = this.scopeArgsOf(at ?? this.scopeAt()).scope
        const root = (view.sessions ?? []).find((row) => row.id === this.state.sessionId)?.projectRoot ?? this.state.projectRoot
        const counts = {
          global: (view.global?.servers ?? []).length,
          project: (view.projects ?? []).find((row) => row.root === root)?.servers?.length ?? 0,
          session: (view.sessions ?? []).find((row) => row.id === this.state.sessionId)?.servers?.length ?? 0,
        }
        const parts = []
        if (current !== 'global' && counts.global > 0) parts.push(t('server.elsewhere.part', { scope: t('scope.global.short'), n: counts.global }))
        if (current !== 'project' && counts.project > 0) parts.push(t('server.elsewhere.part', { scope: t('scope.project.short'), n: counts.project }))
        if (current !== 'session' && counts.session > 0) parts.push(t('server.elsewhere.part', { scope: t('scope.session.short'), n: counts.session }))
        return parts.length === 0 ? '' : t('server.elsewhere', { parts: parts.join(t('list.separator')) })
      }

      renderServers(entry, at, showHeader = true) {
        const anchor = at ?? this.anchor()
        const servers = entry?.servers ?? []
        const enabled = servers.filter((server) => server.enabled !== false).length
        const header = h('div', { key: 'h', className: 'acap-section-head' }, [
          h('h2', { key: 't', className: 'acap-section-title' }, [t('server.section'), h('span', { key: 'c', className: 'acap-section-count' }, t('server.section.count', { enabled, total: servers.length }))]),
          h('span', { key: 'g', className: 'acap-grow' }),
          h(Button, {
            key: 'r',
            variant: 'ghost',
            size: 'sm',
            icon: icon(IconRefresh, {}),
            onClick: () => void this.refreshMcp(),
          }, t('server.refresh')),
          h(Button, {
            key: 'a',
            variant: 'outline',
            size: 'sm',
            icon: icon(IconPlus, {}),
            disabled: anchor === undefined,
            onClick: () => this.openServerEditor(-1, undefined, at),
          }, t('server.add')),
        ])
        const conflicts = entry?.conflicts ?? []
        const elsewhere = this.otherScopeServers(at)
        const body = servers.length === 0
          ? h('div', { key: 'e', className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, t('server.empty')),
            h('span', { key: 'b', className: 'acap-empty-body' }, elsewhere === ''
              ? t('server.empty.body')
              : t('server.empty.elsewhere', { text: elsewhere })),
          ])
          : h('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, servers.map((server, index) => {
            const scope = this.scopeArgsOf(at).scope
            const status = (this.state.mcp?.servers ?? []).find((row) => row.serverName === server.name && row.scope === scope)
            return h('div', { key: `${server.id ?? server.name}:${index}`, className: 'acap-srv', 'data-off': server.enabled === false }, [
              h(Mark, { key: 'm', source: { id: server.name, label: server.name } }),
              h('div', { key: 'main', className: 'acap-srv-main' }, [
                h('div', { key: 't', className: 'acap-srv-top' }, [
                  h('code', { key: 'n', className: 'acap-srv-name' }, server.name),
                  h(Tag, { key: 'tr' }, server.transport === 'stdio' ? t('server.tag.stdio') : t('server.tag.http')),
                  status === undefined ? null : h(Tag, { key: 'tl', tone: status.toolCount > 0 ? 'on' : 'off', title: status.live === false ? t('server.live.hint') : undefined }, status.live === false ? t('server.tag.dormant') : t('server.tools', { n: status.toolCount ?? 0 })),
                  typeof status?.error === 'string' && status.error !== '' ? h(Tag, { key: 'er', tone: 'err' }, status.error) : null,
                ]),
                h('div', { key: 'c', className: 'acap-srv-cmd', title: server.transport === 'stdio' ? [server.command, ...(server.args ?? [])].join(' ') : server.url },
                  server.transport === 'stdio' ? `${server.command} ${(server.args ?? []).join(' ')}`.trim() : server.url),
                (status?.tools ?? []).length === 0 ? null : h('div', { key: 'tools', className: 'acap-tools' }, (status.tools ?? []).slice(0, 8).map((name) => h('span', { key: name, className: 'acap-tool' }, name))),
              ]),
              h('div', { key: 'a', className: 'acap-srv-actions' }, [
                h(Switch, { key: 'sw', checked: server.enabled !== false, label: t('server.enable', { name: server.name }), onChange: () => void this.toggleServer(index, server, at) }),
                h(IconButton, { key: 'ed', label: t('server.edit', { name: server.name }), onClick: () => this.openServerEditor(index, server, at) }, icon(IconEdit, { size: 13 })),
                h(IconButton, { key: 'rm', label: t('server.delete', { name: server.name }), danger: true, onClick: () => void this.removeServer(index, server, at) }, icon(IconTrash, { size: 13 })),
              ]),
            ])
          }))

        return h('section', { key: 'servers', className: 'acap-section' }, [
          showHeader ? header : null,
          this.state.mcpError === '' ? null : h(Notice, { key: 'err', tone: 'error' }, this.state.mcpError),
          conflicts.length === 0 ? null : h(Notice, { key: 'cf', tone: 'warn' }, t('server.conflicts', { names: conflicts.map((row) => row.name).join(t('list.separator')) })),
          body,
        ])
      }

      /** A page pinned to one conversation: every scope that reaches it, stacked. */
      renderEmbedded(view) {
        const sessionId = String(this.props?.sessionId ?? '')
        const session = (view.sessions ?? []).find((row) => row.id === sessionId)
        const root = session?.projectRoot ?? ''
        const project = root === '' ? undefined : (view.projects ?? []).find((row) => row.root === root)
        const sections: Array<{ key: string; title: string; hint: string; entry: any; at: { scope: string; root?: string; sessionId?: string } }> = [{
          key: 'session',
          title: t('zone.session'),
          hint: t('zone.session.hint'),
          entry: session,
          at: { scope: 'session', sessionId },
        }]
        if (project !== undefined) {
          sections.push({
            key: 'project',
            title: `${t('scope.project.short')} · ${lastSegment(root)}`,
            hint: t('zone.project.hint'),
            entry: project,
            at: { scope: 'project', root },
          })
        }
        sections.push({ key: 'global', title: t('zone.global'), hint: t('zone.global.hint'), entry: view.global, at: { scope: 'global' } })
        return h('div', { key: 'zones', className: 'acap-zones' }, sections.map((section) => this.renderZone(section)))
      }

      /** One scope inside the conversation page: a heading, then what it holds. */
      renderZone(section) {
        const page = this.page()
        const filled = page === 'mcp'
          ? (section.entry?.servers ?? []).length > 0
          : (section.entry?.counts?.skills ?? 0) > 0
        const open = this.state.zoneOpen?.[section.key] ?? filled
        const count = page === 'mcp'
          ? t('zone.servers', { n: (section.entry?.servers ?? []).length })
          : t('zone.skills', { n: section.entry?.counts?.skills ?? 0 })
        return h('section', { key: section.key, className: 'acap-zone', 'data-zone': section.key, 'data-open': open }, [
          h('button', {
            key: 'h',
            type: 'button',
            className: 'acap-zone-head',
            'aria-expanded': open,
            onClick: () => this.onChange({ zoneOpen: { ...(this.state.zoneOpen ?? {}), [section.key]: open !== true } }),
          }, [
            h('span', { key: 'c', className: open ? 'acap-caret acap-caret-open' : 'acap-caret' }, icon(IconChevron, {})),
            h('span', { key: 't', className: 'acap-zone-title' }, section.title),
            h('span', { key: 'n', className: 'acap-section-count' }, count),
            h('span', { key: 'g', className: 'acap-grow' }),
            h('span', { key: 'hint', className: 'acap-zone-hint' }, section.hint),
          ]),
          open
            ? page === 'mcp'
              ? h('div', { key: 'b', className: 'acap-zone-body' }, [
                h('div', { key: 'add', className: 'acap-zone-add' }, h(Button, {
                  variant: 'outline',
                  size: 'sm',
                  icon: icon(IconPlus, {}),
                  onClick: () => this.openServerEditor(-1, undefined, section.at),
                }, t('server.add'))),
                this.renderServers(section.entry, section.at, false),
              ])
              : this.renderZoneSources(section)
            : null,
        ])
      }

      renderZoneSources(section) {
        const rows = this.filteredSources(section.entry)
        if (rows.length === 0) {
          return h('div', { key: 'e', className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, section.key === 'session' ? t('zone.empty.session') : t('empty.noSource')),
            h('span', { key: 'b', className: 'acap-empty-body' }, section.key === 'session'
              ? t('zone.empty.session.body')
              : t('empty.noSource.body')),
          ])
        }
        return h('div', { key: 's', className: 'acap-sources' }, rows.map((source) => this.renderSource(source, section.at)))
      }

      renderCatalog() {
        const catalog = this.state.catalog
        const anchor = this.anchor()
        return h(Sheet, {
          key: 'catalog',
          title: t('catalog.title'),
          subtitle: anchor === undefined ? t('catalog.noAnchor') : t('catalog.sub'),
          small: false,
          onClose: () => this.onChange({ catalog: undefined }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', onClick: () => this.onChange({ catalog: undefined }) }, t('composer.close')),
          ]),
        }, catalog.loading === true
          ? h('div', { className: 'acap-note' }, t('catalog.loading'))
          : catalog.error !== undefined
            ? h(Notice, { tone: 'error' }, catalog.error)
            : this.renderCatalogRows(catalog))
      }

      renderCatalogRows(catalog) {
        const all = catalog.names ?? []
        const visible = all.filter((row) => row.modelInvocable !== false)
        const hidden = all.length - visible.length
        if (visible.length === 0) {
          return h(React.Fragment, null, [
            h('div', { key: 'e', className: 'acap-note' }, t('catalog.empty')),
            hidden === 0 ? null : h('div', { key: 'h', className: 'acap-note' }, t('catalog.hidden', { n: hidden })),
          ])
        }
        return h(React.Fragment, null, [
          h('div', { key: 'l', className: 'acap-picker-list' }, visible.map((row) => h('div', { key: row.name, className: 'acap-skill' }, [
            h('div', { key: 'm', className: 'acap-skill-main' }, [
              h('div', { key: 't', className: 'acap-skill-top' }, [
                h(Mark, { key: 'mk', source: { id: row.source, label: row.sourceLabel } }),
                h('code', { key: 'n', className: 'acap-skill-name' }, row.name),
                h(Tag, { key: 's', hue: hueOf(row.source) }, row.sourceLabel ?? row.source),
                row.scope === undefined ? null : h(Tag, { key: 'sc', hue: SCOPE_HUE[row.scope] ?? 'slate' }, t(SCOPE_LABEL_KEY[row.scope] ?? row.scope)),
                row.provider === 'skill-mcp-manager' ? null : h(Tag, { key: 'p' }, row.provider),
              ]),
            ]),
          ]))),
          hidden === 0 ? null : h('div', { key: 'h', className: 'acap-note' }, t('catalog.hidden.more', { n: hidden })),
        ])
      }

      // ── dialogs

      renderSkillEditor() {
        const editor = this.state.skillEditor
        const update = (patch) => this.onChange({ skillEditor: { ...this.state.skillEditor, ...patch } })
        const sources = this.scopeView()?.sources ?? []
        const target = sources.find((source) => source.key === editor.source)
        const dir = target?.dir ?? editor.dir ?? ''
        const form = editor.form === 'file' ? 'file' : 'dir'
        const path = editor.renameFrom === '' || form === 'dir'
          ? joinPath(dir, form === 'file' ? `${String(editor.name ?? '').trim() || 'name'}.md` : `${String(editor.name ?? '').trim() || 'name'}/SKILL.md`)
          : joinPath(dir, `${String(editor.name ?? '').trim() || 'name'}.md`)
        const longFields = String(editor.description ?? '').length
        return h(Sheet, {
          key: 'skill-editor',
          title: editor.mode === 'create' ? t('editor.create') : t('editor.edit', { name: editor.renameFrom }),
          subtitle: editor.mode === 'create' ? t('editor.create.sub') : t('editor.edit.sub'),
          onClose: () => this.onChange({ skillEditor: undefined }),
          busy: editor.busy !== '',
          footer: h(React.Fragment, null, [
            h('span', { key: 'h', className: 'acap-sheet-hint', title: dir }, `${editor.sourceLabel ?? ''} · ${editor.mode === 'create' ? t('editor.new') : t('editor.editing')}`),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', disabled: editor.busy !== '', onClick: () => this.onChange({ skillEditor: undefined }) }, t('editor.cancel')),
            h(Button, { key: 's', variant: 'primary', size: 'sm', disabled: editor.busy !== '', onClick: () => void this.saveSkill(editor) }, editor.busy === '' ? t('editor.save') : editor.busy),
          ]),
        }, h('div', { className: 'acap-edit' }, [
          h('div', { key: 'l', className: 'acap-edit-col' }, [
            h('div', { key: 'pair', className: 'acap-edit-pair' }, [
              h(Field, { key: 'n', label: t('field.name'), required: true, hint: t('field.name.hint') }, h(Input, {
                value: editor.name,
                placeholder: 'pdf-tools',
                'aria-label': t('field.name.label'),
                'aria-invalid': nameProblem(editor.name) !== '',
                onChange: (event) => update({ name: event.target.value }),
              })),
              h(Field, { key: 'w', label: t('field.when'), hint: t('field.when.hint') }, h(Input, {
                value: editor.whenToUse,
                placeholder: t('field.when.placeholder'),
                'aria-label': t('field.when.label'),
                onChange: (event) => update({ whenToUse: event.target.value }),
              })),
            ]),
            h(Field, {
              key: 'd',
              label: t('field.description'),
              required: true,
              counter: t('field.description.count', { n: longFields }),
              hint: t('field.description.hint'),
            }, h('textarea', {
              className: 'acap-textarea',
              value: editor.description,
              rows: 3,
              'aria-label': t('field.description.label'),
              placeholder: t('field.description.placeholder'),
              onChange: (event) => update({ description: event.target.value }),
            })),
            h(Field, { key: 'b', label: t('field.body'), hint: t('field.body.hint') }, h('textarea', {
              className: 'acap-textarea acap-textarea-mono acap-textarea-body',
              value: editor.content,
              'aria-label': t('field.body.label'),
              placeholder: t('field.body.placeholder'),
              onChange: (event) => update({ content: event.target.value }),
            })),
            h('div', { key: 'togs', className: 'acap-toggle-row' }, [
              h('div', { key: 'm', className: 'acap-toggle' }, [
                h(Switch, { key: 's', checked: editor.modelInvocable !== false, label: t('toggle.model'), onChange: (next) => update({ modelInvocable: next }) }),
                h('span', { key: 't', className: 'acap-toggle-text' }, [
                  h('span', { key: 'a', className: 'acap-toggle-title' }, t('toggle.model')),
                  h('span', { key: 'b', className: 'acap-note' }, t('toggle.model.hint')),
                ]),
              ]),
              h('div', { key: 'u', className: 'acap-toggle' }, [
                h(Switch, { key: 's', checked: editor.userInvocable !== false, label: t('toggle.user'), onChange: (next) => update({ userInvocable: next }) }),
                h('span', { key: 't', className: 'acap-toggle-text' }, [
                  h('span', { key: 'a', className: 'acap-toggle-title' }, t('toggle.user.title')),
                  h('span', { key: 'b', className: 'acap-note' }, t('toggle.user.hint')),
                ]),
              ]),
            ]),
            editor.mode === 'create' ? h(Field, { key: 'f', label: t('field.form'), hint: t(FORMS.find((row) => row.value === form)?.hintKey) }, h(Segmented, {
              id: 'acap-skill-form',
              value: form,
              options: FORMS,
              label: t('field.form'),
              onChange: (next) => update({ form: next }),
            })) : null,
            editor.error === '' ? null : h(Notice, { key: 'e', tone: 'error' }, editor.error),
          ]),
          h('div', { key: 'r', className: 'acap-side' }, [
            h('div', { key: 'p', className: 'acap-preview' }, [
              h('div', { key: 'h', className: 'acap-preview-head' }, t('field.willWrite')),
              h('span', { key: 'p', className: 'acap-preview-path', title: path }, shortenPath(path, 40)),
              h('pre', { key: 'pre', className: 'acap-pre' }, skillDocument(editor)),
              (editor.resources ?? []).length === 0 ? null : h('div', { key: 'res', className: 'acap-preview-head' }, [t('field.alsoInDir'), ...(editor.resources ?? []).slice(0, 4).map((row) => h('span', { key: row.name, className: 'acap-preview-chip' }, row.name))]),
            ]),
            h(Points, {
              key: 'pts',
              rows: [
                t('points.saved', { anchor: this.anchorText() }),
                t('points.modelReads'),
                t('points.hideOnly'),
              ],
            }),
          ]),
        ]))
      }

      /** One key/value row per header or environment entry; the value field keeps every character. */
      renderPairs(kind, rows) {
        const field = kind === 'env' ? 'envRows' : 'headerRows'
        const patch = (next) => this.onChange({ serverEditor: { ...this.state.serverEditor, [field]: next } })
        const list = Array.isArray(rows) ? rows : []
        const setRow = (index, change) => patch(list.map((row, position) => (position === index ? { ...row, ...change } : row)))
        return h('div', { key: 'pairs', className: 'acap-pairs' }, [
          ...list.map((row, index) => h('div', { key: row.id, className: 'acap-pair-row' }, [
            h(Input, {
              key: 'k',
              value: row.key,
              placeholder: kind === 'env' ? 'API_KEY' : 'Authorization',
              'aria-label': t('field.pair.key', { n: index + 1 }),
              onChange: (event) => setRow(index, { key: event.target.value }),
            }),
            h(Input, {
              key: 'v',
              value: row.value,
              placeholder: kind === 'env' ? 'sk-…' : 'Bearer …',
              'aria-label': t('field.pair.value', { n: index + 1 }),
              onChange: (event) => setRow(index, { value: event.target.value }),
            }),
            h('button', {
              key: 'x',
              type: 'button',
              className: 'acap-icon-btn acap-pair-drop',
              'aria-label': t('field.pair.drop', { n: index + 1 }),
              title: t('field.pair.drop.title'),
              disabled: list.length === 1,
              onClick: () => patch(list.filter((_row, position) => position !== index)),
            }, icon(IconClose, { size: 13 })),
          ])),
          h('div', { key: 'add', className: 'acap-pair-add' },
            h(Button, {
              variant: 'ghost',
              size: 'sm',
              icon: icon(IconPlus, {}),
              onClick: () => patch([...list, pairRow()]),
            }, kind === 'env' ? t('field.pair.addEnv') : t('field.pair.addHeader'))),
        ])
      }

      renderServerEditor() {
        const editor = this.state.serverEditor
        const server = editor.server
        const update = (patch) => this.onChange({ serverEditor: { ...this.state.serverEditor, server: { ...this.state.serverEditor.server, ...patch } } })
        const transport = TRANSPORTS.find((row) => row.value === server.transport)
        return h(Sheet, {
          key: 'server-editor',
          title: editor.mode === 'create' ? t('serverEditor.create') : t('editor.edit', { name: server.name }),
          subtitle: t('serverEditor.sub'),
          onClose: () => this.onChange({ serverEditor: undefined }),
          busy: editor.busy !== '',
          footer: h(React.Fragment, null, [
            h('span', { key: 'h', className: 'acap-sheet-hint' }, t('serverEditor.scope', { anchor: this.anchorText() })),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', disabled: editor.busy !== '', onClick: () => this.onChange({ serverEditor: undefined }) }, t('editor.cancel')),
            h(Button, { key: 's', variant: 'primary', size: 'sm', disabled: editor.busy !== '', onClick: () => this.submitServerEditor() }, editor.busy === '' ? t('editor.save') : editor.busy),
          ]),
        }, h('div', { className: 'acap-edit' }, [
          h('div', { key: 'l', className: 'acap-edit-col' }, [
            h('div', { key: 'pair', className: 'acap-edit-pair' }, [
              h(Field, { key: 'n', label: t('field.serverName'), required: true, hint: t('field.serverName.hint') }, h(Input, {
                value: server.name,
                placeholder: 'playwright',
                'aria-label': t('field.serverName.label'),
                onChange: (event) => update({ name: event.target.value }),
              })),
              h(Field, { key: 't', label: t('field.transport'), hint: t(transport?.hintKey) }, h(Segmented, {
                id: 'acap-server-transport',
                value: server.transport,
                options: TRANSPORTS,
                label: t('field.transport'),
                onChange: (next) => update({ transport: next }),
              })),
            ]),
            server.transport === 'stdio' ? h(Field, {
              key: 'cmd',
              label: t('field.command'),
              required: true,
              hint: t('field.command.hint'),
            }, h(Input, {
              value: server.command,
              placeholder: 'node',
              'aria-label': t('field.command.label'),
              onChange: (event) => update({ command: event.target.value }),
            })) : h(Field, {
              key: 'url',
              label: t('field.url'),
              required: true,
              hint: t('field.url.hint'),
            }, h(Input, {
              value: server.url,
              placeholder: 'http://127.0.0.1:8931/mcp',
              'aria-label': t('field.url.label'),
              onChange: (event) => update({ url: event.target.value }),
            })),
            server.transport === 'stdio' ? h(Field, {
              key: 'args',
              label: t('field.args'),
              counter: t('field.args.count', { n: (textToArgs(editor.argsText) ?? []).length }),
              hint: t('field.args.hint'),
            }, h('textarea', {
              className: 'acap-textarea acap-textarea-mono',
              rows: 3,
              value: editor.argsText,
              'aria-label': t('field.args.label'),
              placeholder: 'server.mjs',
              onChange: (event) => this.onChange({ serverEditor: { ...this.state.serverEditor, argsText: event.target.value } }),
            })) : null,
            server.transport === 'stdio' ? h(Field, { key: 'cwd', label: t('field.cwd'), hint: t('field.cwd.hint') }, h('div', { className: 'acap-select-row' }, [
              h(Input, {
                key: 'i',
                value: server.cwd,
                placeholder: '/Users/me/project',
                'aria-label': t('field.cwd.label'),
                onChange: (event) => update({ cwd: event.target.value }),
              }),
              h(Button, { key: 'p', variant: 'ghost', size: 'sm', icon: icon(IconFolder, {}), onClick: () => void this.openPicker(server.cwd === '' ? this.state.view?.defaults?.home : server.cwd, 'server-cwd') }, t('field.cwd.pick')),
            ])) : null,
            h(Field, {
              key: 'env',
              label: server.transport === 'stdio' ? t('field.env') : t('field.header'),
              hint: server.transport === 'stdio' ? t('field.env.hint') : t('field.header.hint'),
            }, this.renderPairs(server.transport === 'stdio' ? 'env' : 'header', server.transport === 'stdio' ? editor.envRows : editor.headerRows)),
            editor.error === '' ? null : h(Notice, { key: 'e', tone: 'error' }, editor.error),
          ]),
          h('div', { key: 'r', className: 'acap-side' }, [
            h('div', { key: 'p', className: 'acap-preview' }, [
              h('div', { key: 'h', className: 'acap-preview-head' }, [t('preview.mount')]),
              h('pre', { key: 'pre', className: 'acap-pre' }, mcpConfigPreview({ ...server, args: textToArgs(editor.argsText), env: rowsToPairs(editor.envRows).pairs, headers: rowsToPairs(editor.headerRows).pairs })),
            ]),
            h(Points, {
              key: 'pts',
              rows: [
                t('points.toolPrefix', { name: mountNameOf(server.name) }),
                t('points.scopeOnly', { anchor: this.anchorText() }),
                server.transport === 'stdio' ? t('points.stdioLive') : t('points.httpLive'),
              ],
            }),
          ]),
        ]))
      }

      renderPicker() {
        const picker = this.state.picker
        const purpose = picker.purpose
        const title = purpose === 'project' ? t('picker.project') : purpose === 'server-cwd' ? t('picker.cwd') : t('picker.source')
        return h(Sheet, {
          key: 'picker',
          title,
          subtitle: purpose === 'project' ? t('picker.project.sub') : t('picker.source.sub'),
          small: false,
          onClose: () => this.onChange({ picker: undefined }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'h', className: 'acap-sheet-hint', title: picker.path }, shortenPath(picker.path, 52)),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', onClick: () => this.onChange({ picker: undefined }) }, t('confirm.cancel')),
            h(Button, {
              key: 'ok',
              variant: 'primary',
              size: 'sm',
              disabled: picker.loading === true,
              onClick: () => {
                if (purpose === 'server-cwd') {
                  this.onChange({ picker: undefined, serverEditor: { ...this.state.serverEditor, server: { ...this.state.serverEditor.server, cwd: picker.path } } })
                  return
                }
                void this.pickDirectory(picker.path)
              },
            }, purpose === 'server-cwd' ? t('picker.use') : purpose === 'project' ? t('picker.scan') : t('picker.add')),
          ]),
        }, h('div', { className: 'acap-picker' }, [
          h('div', { key: 'bar', className: 'acap-picker-bar' }, [
            h(Button, {
              key: 'up',
              variant: 'ghost',
              size: 'sm',
              disabled: picker.parent === '' || picker.loading === true,
              onClick: () => void this.loadDir(picker.parent),
            }, t('picker.up')),
            h('span', { key: 'p', className: 'acap-picker-path', title: picker.path }, picker.path),
          ]),
          picker.error === '' ? null : h(Notice, { key: 'e', tone: 'warn' }, picker.error),
          h('div', { key: 'l', className: 'acap-picker-list' }, picker.loading === true
            ? h('div', { className: 'acap-note', style: { padding: 6 } }, t('catalog.loading'))
            : (picker.entries ?? []).length === 0
              ? h('div', { className: 'acap-note', style: { padding: 6 } }, t('picker.empty'))
              : (picker.entries ?? []).map((entry) => h('button', {
                key: entry.path,
                type: 'button',
                className: 'acap-picker-item',
                onClick: () => void this.loadDir(entry.path),
              }, [icon(IconFolder, { key: 'i' }), h('span', { key: 'n', className: 'acap-picker-item-name' }, entry.name)]))),
        ]))
      }

      renderConfirm() {
        const confirm = this.state.confirm
        return h(Sheet, {
          key: 'confirm',
          title: confirm.title,
          subtitle: confirm.body,
          small: true,
          onClose: () => this.onChange({ confirm: undefined }),
          busy: confirm.busy === true,
          footer: h(React.Fragment, null, [
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', disabled: confirm.busy === true, onClick: () => this.onChange({ confirm: undefined }) }, t('confirm.cancel')),
            h(Button, {
              key: 'k',
              variant: 'primary',
              size: 'sm',
              disabled: confirm.busy === true,
              onClick: async () => {
                this.onChange({ confirm: { ...this.state.confirm, busy: true, error: '' } })
                try {
                  await confirm.run()
                } catch (error) {
                  this.onChange({ confirm: { ...this.state.confirm, busy: false, error: String(error?.message ?? error) } })
                }
              },
            }, confirm.confirmLabel),
          ]),
        }, confirm.error === undefined || confirm.error === '' ? null : h(Notice, { tone: 'error' }, confirm.error))
      }
    }

    /**
     * The plugin's own switches on its page in the plugin list: where the manager
     * shows up. It reads and writes the same record the 入口 sheet does, so the two
     * places never disagree.
     */
    class PluginSettings extends React.Component {
      constructor(props) {
        super(props === undefined || props === null ? {} : props)
        this.state = { loading: true, error: '', prefs: undefined, busy: '', localeRev: localeRevision }
        this.mounted = false
      }

      componentDidMount() {
        this.mounted = true
        this.watch = () => this.patch({ localeRev: localeRevision })
        localeListeners.add(this.watch)
        void this.load()
      }

      componentWillUnmount() {
        this.mounted = false
        localeListeners.delete(this.watch)
      }

      get api() {
        return this.props?.api
      }

      patch(next) {
        if (this.mounted === true) this.setState(next)
      }

      async call(method, input = undefined) {
        const api = this.api
        if (api === undefined || typeof api[method] !== 'function') return { error: t('note.noApi') }
        try {
          return unwrap(input === undefined ? await api[method]() : await api[method](input))
        } catch (error) {
          return { error: String(error?.message ?? error) }
        }
      }

      async load() {
        const result = await this.call('snapshot')
        const failure = errorOf(result)
        if (failure !== '') {
          this.patch({ loading: false, error: failure })
          return
        }
        this.patch({ loading: false, error: '', prefs: result?.prefs ?? {} })
      }

      async save(key, value) {
        const prefs = { ...(this.state.prefs ?? {}), [key]: value }
        this.patch({ busy: key, prefs })
        const result = await this.call('savePrefs', prefs)
        const failure = errorOf(result)
        this.patch({ busy: '' })
        if (failure !== '') {
          notify(failure, 'error')
          void this.load()
          return
        }
        syncShell(prefs)
        notify(value ? t('note.placed') : t('note.unplaced'))
      }

      render() {
        try {
          if (this.state.loading === true) return h('div', { className: 'acap-note' }, t('settings.loading'))
          if (this.state.error !== '') return h(Notice, { tone: 'error' }, this.state.error)
          const prefs = this.state.prefs ?? {}
          const places = [
            { key: 'sidebarSkills', label: t('places.sidebarSkills'), hint: t('places.sidebarSkills.hint') },
            { key: 'sidebarMcp', label: t('places.sidebarMcp'), hint: t('places.sidebarMcp.hint') },
            { key: 'tabSkills', label: t('places.tabSkills'), hint: t('places.tabSkills.hint') },
            { key: 'tabMcp', label: t('places.tabMcp'), hint: t('places.tabMcp.hint') },
          ]
          return h('div', { className: 'acap-scope acap-plugin-settings' }, [
            h('div', { key: 't', className: 'acap-plugin-title' }, t('settings.title')),
            h('div', { key: 'l', className: 'acap-place-list' }, places.map((place) => h('div', {
              key: place.key,
              className: 'acap-place',
              'data-on': prefs[place.key] === true,
            }, [
              h(Switch, {
                key: 'sw',
                checked: prefs[place.key] === true,
                label: place.label,
                disabled: this.state.busy === place.key,
                onChange: (next) => void this.save(place.key, next),
              }),
              h('span', { key: 'c', className: 'acap-place-text' }, [
                h('span', { key: 'a', className: 'acap-place-label' }, place.label),
                h('span', { key: 'b', className: 'acap-place-hint' }, place.hint),
              ]),
            ]))),
            h('div', { key: 'n', className: 'acap-note' }, t('settings.note')),
          ])
        } catch (error) {
          console.warn('[skill-mcp-manager]', t('notice.pluginRender'), error)
          return null
        }
      }
    }

    /**
     * The composer control: what the message being written carries, changed for this
     * turn only. The switches are stored per session and dropped as soon as the turn
     * closes, so nothing here changes the saved configuration.
     */
    class ComposerToggles extends React.Component {
      constructor(props) {
        super(props === undefined || props === null ? {} : props)
        this.state = { open: false, loading: true, error: '', data: undefined, busy: '', tab: 'skill', closed: {}, localeRev: localeRevision }
        this.mounted = false
      }

      componentDidMount() {
        this.mounted = true
        this.watch = () => this.patch({ localeRev: localeRevision })
        localeListeners.add(this.watch)
        void this.load()
      }

      componentWillUnmount() {
        this.mounted = false
        localeListeners.delete(this.watch)
      }

      get api() {
        return this.props?.api
      }

      get sessionId() {
        return this.props?.sessionId ?? ''
      }

      patch(next) {
        if (this.mounted === true) this.setState(next)
      }

      async call(method, input) {
        const api = this.api
        if (api === undefined || typeof api[method] !== 'function') return { error: t('note.noApi') }
        try {
          return unwrap(await api[method](input))
        } catch (error) {
          return { error: String(error?.message ?? error) }
        }
      }

      async load() {
        if (this.sessionId === '') {
          this.patch({ loading: false, error: t('note.noSessionId') })
          return
        }
        const result = await this.call('composerState', { sessionId: this.sessionId })
        const failure = errorOf(result)
        if (failure !== '') {
          this.patch({ loading: false, error: failure })
          return
        }
        this.patch({ loading: false, error: '', data: result })
      }

      /** Flip one name for the coming turn. */
      async flip(kind, name, next) {
        const data = this.state.data ?? {}
        const temp = data.temp ?? { offSkills: [], onSkills: [], offServers: [], onServers: [] }
        const want = kind === 'skill' ? { off: 'offSkills', on: 'onSkills' } : { off: 'offServers', on: 'onServers' }
        const nextTemp = {
          offSkills: [...(temp.offSkills ?? [])],
          onSkills: [...(temp.onSkills ?? [])],
          offServers: [...(temp.offServers ?? [])],
          onServers: [...(temp.onServers ?? [])],
        }
        const offKey = want.off
        const onKey = want.on
        nextTemp[offKey] = nextTemp[offKey].filter((entry) => entry !== name)
        nextTemp[onKey] = nextTemp[onKey].filter((entry) => entry !== name)
        if (next === false) nextTemp[offKey].push(name)
        else nextTemp[onKey].push(name)
        this.patch({ busy: name })
        const result = await this.call('setTemp', { sessionId: this.sessionId, ...nextTemp })
        const failure = errorOf(result)
        if (failure !== '') {
          this.patch({ busy: '' })
          notify(failure, 'error')
          return
        }
        await this.load()
        this.patch({ busy: '' })
      }

      /** Flip every name in one agent at once. */
      async flipGroup(kind, rows, next) {
        const data = this.state.data ?? {}
        const temp = data.temp ?? { offSkills: [], onSkills: [], offServers: [], onServers: [] }
        const keys = kind === 'skill' ? { off: 'offSkills', on: 'onSkills' } : { off: 'offServers', on: 'onServers' }
        const nextTemp = {
          offSkills: [...(temp.offSkills ?? [])],
          onSkills: [...(temp.onSkills ?? [])],
          offServers: [...(temp.offServers ?? [])],
          onServers: [...(temp.onServers ?? [])],
        }
        const names = new Set(rows.map((entry) => entry.name))
        nextTemp[keys.off] = nextTemp[keys.off].filter((entry) => !names.has(entry))
        nextTemp[keys.on] = nextTemp[keys.on].filter((entry) => !names.has(entry))
        for (const name of names) {
          if (next === false) nextTemp[keys.off].push(name)
          else nextTemp[keys.on].push(name)
        }
        this.patch({ busy: 'group' })
        const result = await this.call('setTemp', { sessionId: this.sessionId, ...nextTemp })
        const failure = errorOf(result)
        if (failure !== '') {
          this.patch({ busy: '' })
          notify(failure, 'error')
          return
        }
        await this.load()
        this.patch({ busy: '' })
      }

      async reset() {
        this.patch({ busy: 'reset' })
        const result = await this.call('setTemp', { sessionId: this.sessionId, offSkills: [], onSkills: [], offServers: [], onServers: [] })
        const failure = errorOf(result)
        if (failure !== '') {
          this.patch({ busy: '' })
          notify(failure, 'error')
          return
        }
        await this.load()
        this.patch({ busy: '' })
      }

      changed() {
        const temp = this.state.data?.temp ?? {}
        return (temp.offSkills ?? []).length + (temp.onSkills ?? []).length + (temp.offServers ?? []).length + (temp.onServers ?? []).length
      }

      render() {
        try {
          return this.renderChip()
        } catch (error) {
          return null
        }
      }

      renderChip() {
        const changed = this.changed()
        return h('div', { className: 'acap-chip-wrap' }, [
          h('button', {
            key: 'chip',
            type: 'button',
            className: 'acap-chip',
            'data-changed': changed > 0,
            'data-open': this.state.open === true,
            'aria-expanded': this.state.open === true,
            'aria-label': t('composer.chip.label'),
            title: changed === 0 ? t('composer.chip.hint') : t('composer.chip.changed', { n: changed }),
            onClick: () => {
              this.patch({ open: true, error: '' })
              void this.load()
            },
          }, [
            h('span', { key: 'i', className: 'acap-chip-icon' }, icon(IconSkill, { size: 14 })),
            h('span', { key: 't', className: 'acap-chip-label' }, t('composer.chip.label')),
            changed === 0 ? null : h('span', { key: 'n', className: 'acap-chip-count' }, String(changed)),
            h('span', { key: 'c', className: 'acap-chip-chevron' }, icon(IconChevron, { size: 12 })),
          ]),
          this.state.open !== true ? null : this.renderSheet(),
        ])
      }

      renderSheet() {
        const data = this.state.data
        const skills = data?.skills ?? []
        const servers = data?.servers ?? []
        const changed = this.changed()

        const bySource = new Map()
        for (const entry of skills) {
          const key = String(entry.sourceLabel ?? entry.source ?? t('composer.other'))
          const bucket = bySource.get(key)
          if (bucket === undefined) bySource.set(key, [entry])
          else bucket.push(entry)
        }
        const groups = [...bySource.entries()].map(([key, rows]) => ({ key, rows, id: rows[0]?.source }))

        const row = (entry, kind) => h('div', { key: `${kind}:${entry.scope}:${entry.name}`, className: 'acap-temp-row', 'data-dropped': entry.effective !== true }, [
          h('div', { key: 'm', className: 'acap-temp-main' }, [
            h('code', { key: 'n', className: 'acap-temp-name' }, entry.name),
            h('span', { key: 's', className: 'acap-temp-scope' }, t(SCOPE_LABEL_KEY[entry.scope] ?? entry.scope)),
            entry.off === true ? h(Tag, { key: 'x', tone: 'warn' }, t('composer.tag.off')) : entry.forced === true ? h(Tag, { key: 'f', tone: 'on' }, t('composer.tag.on')) : null,
          ]),
          h('div', { key: 'a', className: 'acap-temp-actions' }, [
            h(Switch, {
              key: 'sw',
              checked: entry.effective === true,
              label: t('composer.row.label', { name: entry.name }),
              disabled: this.state.busy !== '',
              onChange: (next) => void this.flip(kind, entry.name, next),
            }),
          ]),
        ])

        return h(Sheet, {
          key: 'sheet',
          title: t('composer.title'),
          subtitle: t('composer.sub'),
          medium: true,
          onClose: () => this.patch({ open: false }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'c', className: 'acap-sheet-count' }, changed === 0 ? t('composer.none') : t('composer.count', { n: changed })),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'r', variant: 'ghost', size: 'sm', disabled: this.state.busy !== '' || changed === 0, onClick: () => void this.reset() }, t('composer.reset')),
            h(Button, { key: 'c2', variant: 'outline', size: 'sm', onClick: () => this.patch({ open: false }) }, t('composer.close')),
          ]),
        }, this.state.loading === true
          ? h('div', { className: 'acap-note' }, t('note.readingSession'))
          : this.state.error !== ''
            ? h(Notice, { tone: 'error' }, this.state.error)
            : h(React.Fragment, null, [
              h('div', { key: 'tabs', className: 'acap-temp-tabs' }, h(Segmented, {
                // The tab's accessible name is its id, so the id carries the meaning.
                id: 'carry',
                label: t('composer.tabs.label'),
                value: this.state.tab === 'server' ? 'server' : 'skill',
                options: [
                  { value: 'skill', label: t('composer.tab.skill', { n: skills.length }) },
                  { value: 'server', label: t('composer.tab.server', { n: servers.length }) },
                ],
                onChange: (next) => this.patch({ tab: next }),
              })),
              this.state.tab === 'server'
                ? servers.length === 0
                  ? h('div', { key: 'me', className: 'acap-note' }, t('composer.empty.server'))
                  : h('div', { key: 'ml', className: 'acap-temp-list' }, servers.map((entry) => row(entry, 'server')))
                : skills.length === 0
                  ? h('div', { key: 'se', className: 'acap-note' }, t('composer.empty.skill'))
                  : h('div', { key: 'sl', className: 'acap-temp-list' }, groups.map((group) => {
                    const stopped = group.rows.every((entry) => entry.effective !== true && entry.off !== true)
                    const dropped = group.rows.filter((entry) => entry.effective !== true).length
                    const allOn = dropped === 0
                    // Every agent starts folded: this sheet opens to change one or two
                    // skills, so the agents stay a one-line summary until asked.
                    const shut = this.state.closed?.[group.key] ?? true
                    return h('div', { key: `g:${group.key}`, className: 'acap-temp-group', 'data-shut': shut }, [
                      h('div', { key: 'h', className: 'acap-temp-group-bar' }, [
                        h(Switch, {
                          key: 'all',
                          checked: allOn,
                          label: t('composer.group.all', { label: group.key }),
                          title: allOn ? t('composer.group.drop', { label: group.key }) : t('composer.group.keep', { label: group.key }),
                          disabled: this.state.busy !== '',
                          onChange: (next) => void this.flipGroup('skill', group.rows, next),
                        }),
                        h('button', {
                          key: 'b',
                          type: 'button',
                          className: 'acap-temp-group-toggle',
                          'aria-expanded': shut !== true,
                          onClick: () => this.patch({ closed: { ...(this.state.closed ?? {}), [group.key]: shut !== true } }),
                        }, [
                          h('span', { key: 'i', className: shut === true ? 'acap-caret' : 'acap-caret acap-caret-open' }, icon(IconChevron, {})),
                          h(Mark, { key: 'mk', source: { id: group.id, label: group.key } }),
                          h('span', { key: 'n', className: 'acap-temp-group-name' }, group.key),
                          h('span', { key: 'c', className: 'acap-temp-count' }, t('composer.group.count', { n: group.rows.length })),
                          dropped === 0 ? null : h('span', { key: 'd', className: 'acap-temp-group-hint' }, t('composer.group.dropCount', { n: dropped })),
                          stopped ? h('span', { key: 'o', className: 'acap-temp-group-hint' }, t('composer.group.stopped')) : null,
                          h('span', { key: 'g', className: 'acap-grow' }),
                        ]),
                      ]),
                      shut === true ? null : h('div', { key: 'r', className: 'acap-temp-group-rows' }, group.rows.map((entry) => row(entry, 'skill'))),
                    ])
                  })),
            ]))
      }
    }

    const inject = ['slots', 'remote', 'locale']
    let capturedApi

    const apply = async (ctx) => {
      injectStyles()
      ctx.effect(() => () => {
        styleElement?.remove()
        styleElement = undefined
      }, 'skill and mcp manager styles')

      // The two tables live in this bundle; the locale service owns which one is read
      // and tells every subscriber when the language changes, so the pages redraw.
      translate = ctx.locale.bind(LOCALE_NS)
      ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: zhTable, en }))
      ctx.effect(() => ctx.locale.subscribe(() => {
        watchLocale()
        syncShell(localePrefs)
      }))

      // The remote namespace only exists once the mount settles; registering the page
      // before that would hand every visitor an empty api and no way to recover.
      await ctx.remote.$mount(RPC_REMOTE)
      capturedApi = ctx.get('remote.skillMcpManager')
      if (capturedApi === undefined) {
        throw new Error(t('notice.remoteMissing'))
      }

      // 斜杠菜单的技能目录由 dsh-client-ui-skill 按会话缓存，它只在 plugin-manager/changed
      // 这个事件上清空自己。宿主每次改记录都会发一次，这里订阅一次就把缓存带出去。
      ctx.remote.$on('plugin-manager/changed', () => {
        ctx.emit('connection/reset')
      })

      // Confirmations ride the frame-wide overlay, the same layer the shipped plugins use.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: `${NS}-notice`,
        order: 60,
      }, NoticeHost))

      // The bundle's page in the plugin list carries the same switches, so a person
      // who found the plugin there does not have to open one of its pages first.
      // The slot keys by package name, which is how the host lists this bundle.
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: PACKAGE_NAME,
        inject: () => ({ api: capturedApi }),
      }, PluginSettings))

      // The settings sidebar carries the two halves as separate pages.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: `${NS}-skills`,
        order: 23,
        label: () => t('title.skills'),
        inject: () => ({ api: capturedApi, page: 'skills' }),
      }, ManagerPage))

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: `${NS}-mcp`,
        order: 24,
        label: () => t('title.mcp'),
        inject: () => ({ api: capturedApi, page: 'mcp' }),
      }, ManagerPage))

      // The composer control rides every conversation: the coming-turn switches are
      // the one part of this plugin that has to be reachable while writing a message.
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: NS,
        order: 40,
        label: () => t('composer.title'),
        inject: (sessionId) => ({ api: capturedApi, sessionId }),
      }, ComposerToggles))

      // Everything else is optional and follows the place switches in the page.
      let localePrefs = {}
      const handles = []
      const clear = () => {
        for (const dispose of handles.splice(0)) {
          try {
            dispose()
          } catch (error) {
            console.warn('[skill-mcp-manager]', t('notice.foldFailed'), error)
          }
        }
      }
      const add = (key, options, component) => {
        handles.push(ctx.slots.inject(key, () => ctx.slots.register(options, component)))
      }
      syncShell = (prefs) => {
        localePrefs = prefs ?? {}
        clear()
        const on = (key) => prefs?.[key] === true
        if (on('sidebarSkills')) {
          add('sidebar.panellist', { name: 'sidebar.panellist', id: PANEL_SKILLS, order: 40, label: () => t('title.skills') }, SkillsPanelIcon)
          add('main', { name: 'main', key: PANEL_SKILLS, inject: () => ({ api: capturedApi, page: 'skills' }) }, ManagerPage)
        }
        if (on('sidebarMcp')) {
          add('sidebar.panellist', { name: 'sidebar.panellist', id: PANEL_MCP, order: 41, label: () => t('title.mcp') }, ServersPanelIcon)
          add('main', { name: 'main', key: PANEL_MCP, inject: () => ({ api: capturedApi, page: 'mcp' }) }, ManagerPage)
        }
        if (on('tabSkills')) {
          add('conversation.view', { name: 'conversation.view', id: `${NS}-skills`, order: 40, label: () => t('label.skill'), inject: (sessionId) => ({ api: capturedApi, page: 'skills', sessionId }) }, ManagerPage)
        }
        if (on('tabMcp')) {
          add('conversation.view', { name: 'conversation.view', id: `${NS}-mcp`, order: 41, label: () => t('label.mcp'), inject: (sessionId) => ({ api: capturedApi, page: 'mcp', sessionId }) }, ManagerPage)
        }
      }

      // The first drawing needs the saved switches, which only the host knows.
      try {
        const prefs = await capturedApi.snapshot().then((reply) => (reply !== null && typeof reply === 'object' && 'ok' in reply ? reply.value : reply))
        syncShell(prefs?.prefs ?? {})
      } catch (error) {
        syncShell({})
        console.warn('[skill-mcp-manager]', t('notice.prefsFailed'), error)
      }

      ctx.effect(() => () => {
        syncShell = () => {}
        clear()
      }, 'skill and mcp manager slots')
    }

    module.exports = { name: 'skill-mcp-manager', inject, apply }
    return module.exports
  },
})
