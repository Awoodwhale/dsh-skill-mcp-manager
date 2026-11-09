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
  id: 'dsh-skill-mcp-manager',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const Button = primitives.Button
    const Input = primitives.Input
    const Modal = primitives.Modal
    const SegmentedControl = primitives.SegmentedControl
    const Switch = primitives.Switch
    const Tooltip = primitives.Tooltip

    const NS = 'skill-mcp-manager'

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
     * The shell keeps one hook the pages use to redraw the sidebar entries and the
     * conversation tabs after the switches in the page change.
     */
    let syncShell = (prefs) => {}

    const SCOPES = [
      { value: 'global', label: '全局技能', hint: '这台机器上每个会话都读到的技能' },
      { value: 'project', label: '项目技能', hint: '只在某一个项目里读到的技能' },
      { value: 'session', label: '会话技能', hint: '只在一条会话里读到的技能' },
    ]
    const SCOPE_LABEL = { global: '全局', project: '项目', session: '会话' }
    const TRANSPORTS = [
      { value: 'stdio', label: '本地进程', hint: '用一条命令启动服务器，两者通过标准输入输出通信' },
      { value: 'streamable-http', label: 'HTTP', hint: '连到已经在运行的服务器地址' },
    ]
    const STATE_FILTERS = [
      { value: 'all', label: '全部状态' },
      { value: 'enabled', label: '已启用' },
      { value: 'disabled', label: '已停用' },
      { value: 'kept', label: '同名仍在' },
      { value: 'broken', label: '解析异常' },
    ]
    const FORMS = [
      { value: 'dir', label: '目录', hint: '一个技能一个目录，可以在 SKILL.md 旁边放资源文件' },
      { value: 'file', label: '单文件', hint: '一个技能一个 .md 文件，写起来快，放不了附件' },
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
      if (minutes < 1) return '刚刚'
      if (minutes < 60) return `${minutes} 分钟前`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${hours} 小时前`
      const days = Math.floor(hours / 24)
      if (days < 30) return `${days} 天前`
      return `${Math.floor(days / 30)} 个月前`
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
      options: options.map((option) => ({ value: option.value, label: option.label, title: option.hint })),
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

    /** The dialog shell both editors share: fixed head, scrolling body, action foot. */
    const Sheet = ({ title, subtitle, onClose, footer, children, small, medium }) => h(Modal, {
      open: true,
      onClose,
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
          'aria-label': '关闭',
          title: '关闭',
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
          if (value.trim() !== '') problems.push(`缺少键名：${value.trim().slice(0, 24)}`)
          continue
        }
        if (Object.prototype.hasOwnProperty.call(pairs, key)) problems.push(`重复的键：${key}`)
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
      if (text === '') return '技能名称不能为空'
      if (text.length > 64) return '技能名称不能超过 64 个字符'
      if (!NAME_PATTERN.test(text)) return '只能用小写字母、数字和连字符，例如 pdf-tools'
      return ''
    }
    const SERVER_NAME = /^[A-Za-z0-9_-]{1,32}$/u
    const serverNameProblem = (name) => (String(name ?? '').trim() === '' ? '服务器名称不能为空' : '')
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
          throw new Error(typeof failure === 'string' ? failure : String((failure && (failure.message || failure.code)) || '远程调用失败'))
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
        }
        this.pollTimer = undefined
        this.mcpSeq = 0
      }

      componentDidMount() {
        this.mounted = true
        void this.load()
      }

      componentWillUnmount() {
        this.mounted = false
        if (this.pollTimer !== undefined) clearTimeout(this.pollTimer)
        this.pollTimer = undefined
      }

      get api() {
        return this.props?.api
      }

      onChange(patch) {
        if (this.mounted !== true) return
        this.setState(patch)
      }

      say(status, statusTone = 'ok') {
        notify(status, statusTone)
      }

      /** One remote call: unwraps the envelope and turns a hang into an error line. */
      async call(method, input = undefined) {
        const api = this.api
        if (api === undefined || typeof api[method] !== 'function') {
          return { error: `宿主没有提供 ${method}：插件的宿主半边没有加载` }
        }
        let timer
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${method} 超过 ${CALL_TIMEOUT_MS / 1000} 秒没有返回，刷新页面或重启宿主后再试`)), CALL_TIMEOUT_MS)
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
        if (anchor === undefined) return '这一层'
        if (anchor.scope === 'global') return '全局'
        if (anchor.scope === 'project') return `项目 ${lastSegment(anchor.root)}`
        return '这条会话'
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
          if (stateFilter === 'kept' && typeof skill.kept !== 'string') return false
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
        this.say(`${enabled ? '启用' : '停用'} ${source.label}…`, 'ok')
        const { error } = await this.run('saveSource', { ...this.scopeArgsOf(at), source: key, enabled })
        if (error !== '') this.say(error, 'error')
        else this.say(`${source.label} 已${enabled ? '启用' : '停用'}`)
      }

      async toggleSkill(source, skill, enabled, at) {
        const { error } = await this.run('toggleSkills', { ...this.scopeArgsOf(at), source: source.key, names: [skill.name], enabled })
        if (error !== '') this.say(error, 'error')
        else this.say(`${enabled ? '启用' : '停用'} ${skill.name}`)
      }

      async removeSource(source, at) {
        this.setState({
          confirm: {
            title: `移除「${source.label}」这个来源？`,
            body: `只是不再从这个目录读技能，${source.dir} 里的文件不会被删除。`,
            confirmLabel: '移除来源',
            run: async () => {
              const { error } = await this.run('removeSource', { ...this.scopeArgsOf(at), source: source.key })
              if (error !== '') throw new Error(error)
              this.setState({ confirm: undefined, sourceFilter: 'all' })
              this.say(`已移除来源 ${source.label}`)
            },
          },
        })
      }

      /** The record of one scope, whichever one a handler was handed. */
      entryOf(at) {
        const view = this.state.view
        if (view === undefined) return undefined
        const args = this.scopeArgsOf(at)
        if (args.scope === 'project') return (view.projects ?? []).find((row) => row.root === args.root)
        if (args.scope === 'session') return (view.sessions ?? []).find((row) => row.id === args.sessionId)
        return view.global
      }

      async saveServer(index, server) {
        const at = this.state.serverEditor?.at
        const entry = this.entryOf(at)
        const servers = (entry?.servers ?? []).map((row) => ({ ...row }))
        if (index === -1) servers.push(server)
        else servers[index] = server
        this.onChange({ serverEditor: { ...this.state.serverEditor, busy: '保存中…', error: '' } })
        const result = await this.call('saveServers', { ...this.scopeArgsOf(at), mcpServers: servers })
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ serverEditor: { ...this.state.serverEditor, busy: '', error: failure } })
          return
        }
        this.onChange({ view: result, serverEditor: undefined, ...this.selectionOf(result) })
        this.say(`已保存 ${server.name}`)
        void this.refreshMcp()
      }

      async toggleServer(index, server, at) {
        const entry = this.entryOf(at)
        const servers = (entry?.servers ?? []).map((row) => ({ ...row }))
        servers[index] = { ...servers[index], enabled: server.enabled !== true }
        const { error } = await this.run('saveServers', { ...this.scopeArgsOf(at), mcpServers: servers })
        if (error !== '') this.say(error, 'error')
        else this.say(`${servers[index].enabled ? '启用' : '停用'} ${server.name}`)
      }

      async removeServer(index, server, at) {
        this.setState({
          confirm: {
            title: `删除服务器「${server.name}」？`,
            body: '这个范围的记录里会去掉它，正在运行的连接随之断开，记录文件里其它内容不变。',
            confirmLabel: '删除服务器',
            run: async () => {
              const entry = this.entryOf(at)
              const servers = (entry?.servers ?? []).filter((_row, position) => position !== index)
              const { error } = await this.run('saveServers', { ...this.scopeArgsOf(at), mcpServers: servers })
              if (error !== '') throw new Error(error)
              this.setState({ confirm: undefined })
              this.say(`已删除服务器 ${server.name}`)
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
          this.onChange({ skillEditor: { ...editor, error: '必须填写说明：模型只靠它决定要不要加载这个技能' } })
          return
        }
        this.onChange({ skillEditor: { ...editor, busy: '保存中…', error: '' } })
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
          this.onChange({ skillEditor: { ...editor, busy: '', error: failure } })
          return
        }
        this.onChange({ view: result, skillEditor: undefined, ...this.selectionOf(result) })
        this.say(`已保存 ${editor.name}`)
      }

      async removeSkill(source, skill, at) {
        this.setState({
          confirm: {
            title: `删除技能「${skill.name}」？`,
            body: skill.form === 'dir'
              ? `整个目录 ${skill.path.replace(/\/SKILL\.md$/u, '')} 会被删除，目录里的资源文件也一起消失。`
              : `文件 ${skill.path} 会被删除。`,
            confirmLabel: '删除技能',
            run: async () => {
              const { error } = await this.run('deleteSkill', { ...this.scopeArgsOf(at), source: source.key, name: skill.name })
              if (error !== '') throw new Error(error)
              this.setState({ confirm: undefined })
              this.say(`已删除技能 ${skill.name}`)
            },
          },
        })
      }

      async refresh() {
        this.onChange({ busy: '刷新中…' })
        const result = await this.call('refreshSkills')
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ busy: '' })
          this.say(failure, 'error')
          return
        }
        await this.load()
        this.onChange({ busy: '' })
        this.say(`已重新读取技能目录（${result.invalidated ?? 0} 个来源）`)
      }

      async inspectCatalog() {
        this.onChange({ catalog: { loading: true, names: [], layer: '' } })
        const result = await this.call('skillCatalog', this.scopeArgs())
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
        const result = await this.call('listDir', { path })
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
        this.say(`已添加目录 ${path}`)
      }

      // ── editors

      openSkillEditor(source, skill, at) {
        const base = skill === undefined
          ? { name: '', description: '', whenToUse: '', content: '', modelInvocable: true, userInvocable: true, form: 'dir', renameFrom: '', path: '' }
          : { name: skill.name, description: skill.description, whenToUse: skill.whenToUse, content: '', modelInvocable: skill.modelInvocable, userInvocable: skill.userInvocable, form: skill.form, renameFrom: skill.name, path: skill.path }
        this.onChange({ skillEditor: { ...base, at: this.scopeArgsOf(at), source: source.key, sourceLabel: source.label, dir: source.dir, mode: skill === undefined ? 'create' : 'edit', error: '', busy: '' } })
        if (skill !== undefined) void this.loadSkillBody(source, skill.name, at)
      }

      async loadSkillBody(source, skillName, at) {
        const result = await this.call('readSkill', { ...this.scopeArgsOf(at), source: source.key, name: skillName })
        const failure = errorOf(result)
        if (failure !== '') {
          this.onChange({ skillEditor: { ...this.state.skillEditor, error: failure } })
          return
        }
        this.onChange({
          skillEditor: {
            ...this.state.skillEditor,
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
          this.onChange({ serverEditor: { ...editor, error: `请先改好这几行：${problems.join('，')}` } })
          return
        }
        if (server.transport === 'stdio' && String(server.command ?? '').trim() === '') {
          this.onChange({ serverEditor: { ...editor, error: '本地进程需要一条启动命令' } })
          return
        }
        if (server.transport === 'streamable-http' && String(server.url ?? '').trim() === '') {
          this.onChange({ serverEditor: { ...editor, error: 'HTTP 连接需要一个地址' } })
          return
        }
        // 一个范围里同名只留一台，新加一台时撞名要当场说出来，否则保存后它会被静默丢掉
        if (editor.index === -1) {
          const taken = (this.entryOf(editor.at)?.servers ?? []).some((row) => String(row?.name ?? '') === String(server.name ?? '').trim())
          if (taken) {
            this.onChange({ serverEditor: { ...editor, error: `这个范围里已经有一台叫 ${String(server.name ?? '').trim()} 的服务器，换一个名字，或者先删掉那一台` } })
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
          return h('div', { className: 'acap-root' }, h(Notice, { tone: 'error' }, `页面渲染失败：${String(error?.message ?? error)}`))
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

        if (loading) return shell(h('div', { className: 'acap-note' }, page === 'mcp' ? '正在读取 MCP 配置…' : '正在读取技能配置…'))
        if (error !== '') return shell(h(Notice, { tone: 'error' }, error))
        if (view === undefined) return shell(h(Notice, { tone: 'error' }, '宿主没有返回配置'))

        return shell(h(React.Fragment, null, [
          embedded ? null : h('div', { key: 'tabs', className: 'acap-tabs', role: 'tablist', 'aria-label': '作用范围' }, SCOPES.map((scope) => {
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
              title: scope.hint,
              onClick: () => this.onChange({ scope: scope.value, sourceFilter: 'all', stateFilter: 'all', query: '', catalog: undefined }),
            }, [h('span', { key: 'l' }, page === 'mcp' ? SCOPE_LABEL[scope.value] : scope.label), h('span', { key: 'c', className: 'acap-tab-count' }, String(count))])
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
        const title = page === 'mcp' ? 'MCP管理' : page === 'skills' ? 'SKILL管理' : 'SKILL 与 MCP'
        const subtitle = page === 'mcp'
          ? 'MCP 服务器按范围连接，最近的那个范围里同名服务器生效。这里改的连接只在保存后生效，工具以 mcp__名称__ 前缀出现在模型里。'
          : '技能按存放它的 Agent 分组，来源与单个技能都可以随时停用。停用不会改动磁盘上的任何文件，只影响模型能不能看到。'
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
              title: '选择这个插件出现在哪些位置',
              onClick: () => this.onChange({ placesOpen: true, status: '' }),
            }, '入口'),
            icon(IconRefresh, {}) === null ? null : h(Button, {
              key: 'refresh',
              variant: 'ghost',
              size: 'sm',
              icon: icon(IconRefresh, {}),
              disabled: this.state.busy !== '',
              onClick: () => void this.refresh(),
            }, this.state.busy === '' ? '刷新' : this.state.busy),
          ]),
          embedded ? null : h('p', { key: 's', className: 'acap-sub' }, subtitle),
          embedded ? null : h('div', { key: 'm', className: 'acap-meta' }, [
            h('span', { key: 'l' }, '记录文件'),
            h('code', { key: 'p' }, view?.storePath ?? '…'),
            health?.status === 'reset' ? h('span', { key: 'h', className: 'acap-tag acap-tag-warn' }, '记录已重置') : null,
          ]),
        ])
      }

      renderAnchor(view) {
        if (this.state.scope === 'global') return null
        if (this.state.scope === 'project') {
          const projects = view.projects ?? []
          const candidates = view.projectCandidates ?? []
          return h('div', { key: 'anchor', className: 'acap-anchor' }, [
            h('span', { key: 'l', className: 'acap-anchor-label' }, '项目'),
            projects.length === 0 ? null : h('select', {
              key: 'sel',
              className: 'acap-select',
              value: this.state.projectRoot,
              'aria-label': '选择项目',
              onChange: (event) => this.onChange({ projectRoot: event.target.value, sourceFilter: 'all', stateFilter: 'all', query: '', catalog: undefined }),
            }, projects.map((row) => h('option', { key: row.root, value: row.root }, `${row.name}${row.live > 0 ? ` · ${row.live} 条在线` : ''}`))),
            h(Button, {
              key: 'add',
              variant: 'ghost',
              size: 'sm',
              icon: icon(IconFolder, {}),
              onClick: () => void this.openPicker(this.state.projectRoot === '' ? view.defaults?.home : this.state.projectRoot, 'project'),
            }, projects.length === 0 ? '选择项目目录' : '换一个项目'),
            candidates.length === 0 ? null : h('span', { key: 'c', className: 'acap-chip-row' }, [
              h('span', { key: 't', className: 'acap-anchor-label' }, '会话里出现过的项目'),
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
              h('span', { key: 'l', className: 'acap-anchor-label' }, '会话'),
              h('span', { key: 'd', className: 'acap-live', 'data-live': row?.live === true }),
              h('span', { key: 'n', className: 'acap-anchor-cur', title: row?.cwd ?? '' }, row?.label ?? '未命名会话'),
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
            h('span', { key: 'l', className: 'acap-anchor-label' }, '会话'),
            h('div', { key: 'f', className: 'acap-picker-field' }, h(Input, {
              value: this.state.sessionQuery,
              placeholder: '按名称或目录筛选',
              'aria-label': '筛选会话',
              onChange: (event) => this.onChange({ sessionQuery: event.target.value }),
            })),
            sessions.length === 0 ? null : h('span', { key: 'c', className: 'acap-picker-count' }, `${matching.length} 条`),
          ]),
          selected === undefined
            ? h('span', { key: 'cur', className: 'acap-picker-current' }, '还没有选中会话')
            : h('div', { key: 'cur', className: 'acap-picker-current' }, [
              h('span', { key: 't', className: 'acap-picker-current-label' }, '正在编辑'),
              h('span', { key: 'n', className: 'acap-picker-current-name' }, selected.label ?? '未命名会话'),
              selected.cwd === undefined || selected.cwd === ''
                ? null
                : h('span', { key: 'p', className: 'acap-picker-current-path', title: selected.cwd }, shortenPath(selected.cwd, 52)),
            ]),
          sessions.length === 0
            ? h('div', { key: 'e', className: 'acap-note' }, '还没有已知的会话，先在首页开一条会话。')
            : h('div', { key: 'list', className: 'acap-picker-list acap-session-list' }, matching.length === 0
              ? h('div', { key: 'none', className: 'acap-note', style: { padding: '8px 8px' } }, `没有匹配「${this.state.sessionQuery}」的会话。`)
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
                    h('span', { key: 't', className: 'acap-session-title' }, row.label ?? row.title ?? '未命名会话'),
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
          this.embedded() ? h('span', { key: 'where', className: 'acap-actions-where', title: '这条会话自己的目录，别的会话读不到' }, '写进这条会话') : null,
          h(Button, {
            key: 'new',
            variant: 'primary',
            size: 'sm',
            icon: icon(IconPlus, {}),
            disabled: anchor === undefined || target === undefined,
            title: target === undefined ? '这个范围还没有可写的技能目录' : `写入 ${target.label}`,
            onClick: () => this.openSkillEditor(target, undefined, this.scopeAt()),
          }, '新建技能'),
          h(Button, {
            key: 'src',
            variant: 'outline',
            size: 'sm',
            icon: icon(IconFolder, {}),
            disabled: anchor === undefined,
            onClick: () => void this.openPicker(anchor?.scope === 'project' ? anchor.root : this.state.view?.defaults?.home, 'source'),
          }, '添加目录'),
          h('span', { key: 'g', className: 'acap-grow' }),
          h(Button, {
            key: 'cat',
            variant: 'ghost',
            size: 'sm',
            disabled: anchor === undefined,
            onClick: () => void this.inspectCatalog(),
          }, '核对模型视角'),
        ])
      }

      renderStats() {
        const counts = this.counts()
        const cells = [
          { key: 's', kind: 'skills', n: counts.skills, l: '个技能' },
          { key: 'e', kind: 'enabled', n: counts.enabled, l: '个已启用' },
          { key: 'd', kind: 'disabled', n: counts.disabled, l: '个已停用', off: counts.disabled === 0 },
          { key: 'src', kind: 'sources', n: `${counts.activeSources}/${counts.sources}`, l: '个来源在用' },
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
            'aria-label': '按来源筛选',
            onChange: (event) => this.onChange({ sourceFilter: event.target.value }),
          }, [h('option', { key: 'all', value: 'all' }, '全部来源'), ...sources.map((source) => h('option', { key: source.key, value: source.key }, `${source.label}（${(source.skills ?? []).length}）`))]),
          h('select', {
            key: 'state',
            className: 'acap-select',
            value: this.state.stateFilter,
            'aria-label': '按状态筛选',
            onChange: (event) => this.onChange({ stateFilter: event.target.value }),
          }, STATE_FILTERS.map((option) => h('option', { key: option.value, value: option.value }, option.label))),
          h('div', { key: 'q', className: 'acap-search' }, h(Input, {
            value: this.state.query,
            placeholder: '搜索技能名称或说明',
            'aria-label': '搜索技能',
            icon: icon(IconSearch, {}),
            onChange: (event) => this.onChange({ query: event.target.value }),
          })),
        ])
      }

      renderSources() {
        const anchor = this.anchor()
        if (anchor === undefined) {
          return h('div', { key: 'sources', className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, this.state.scope === 'project' ? '还没有选中的项目' : '还没有已知的会话'),
            h('span', { key: 'b', className: 'acap-empty-body' }, this.state.scope === 'project' ? '选一个项目目录，就能看到它里面各个 Agent 的技能目录。' : '开一条会话之后，这里会列出它的技能目录。'),
          ])
        }
        const rows = this.filteredSources()
        if (rows.length === 0) {
          const all = this.scopeView()?.sources ?? []
          return h('div', { key: 'sources', className: 'acap-sources' }, h('div', { className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, all.length === 0 ? '这个范围还没有技能来源' : '没有符合筛选条件的技能'),
            h('span', { key: 'b', className: 'acap-empty-body' }, all.length === 0 ? '添加一个目录，或者新建一个技能。' : '换一个来源或状态再试。'),
          ]))
        }
        return h('div', { key: 'sources', className: 'acap-sources' }, rows.map((source) => this.renderSource(source, this.scopeAt())))
      }

      renderSource(source, at) {
        const skills = source.skills ?? []
        const closed = this.state.collapsed?.[source.key] === true
        const open = skills.filter((skill) => skill.enabled === true && skill.valid !== false)
        const shut = skills.filter((skill) => skill.enabled !== true && skill.valid !== false)
        return h('article', { key: source.key, className: 'acap-src', 'data-off': source.enabled !== true, 'data-hue': hueOf(source.custom === true ? 'custom' : source.id) }, [
          h('header', { key: 'h', className: 'acap-src-head' }, [
            h('button', {
              key: 'toggle',
              type: 'button',
              className: 'acap-fold',
              'aria-expanded': closed !== true,
              'aria-label': `${closed === true ? '展开' : '收起'} ${source.label}`,
              onClick: () => this.onChange({ collapsed: { ...(this.state.collapsed ?? {}), [source.key]: closed !== true } }),
            }, h('span', { className: closed === true ? 'acap-caret' : 'acap-caret acap-caret-open' }, icon(IconChevron, {}))),
            h(Mark, { key: 'm', source }),
            h('div', { key: 'id', className: 'acap-src-id' }, [
              h('div', { key: 'n', className: 'acap-src-name' }, [
                source.label,
                h('span', { key: 'c', className: 'acap-tab-count' }, `${skills.length} 个技能`),
                source.kind === 'session' ? h(Tag, { key: 'k', tone: 'info' }, '会话目录') : null,
                source.custom === true ? h(Tag, { key: 'cu' }, '自定义目录') : null,
                source.hostScanned === true ? h(Tag, { key: 'hs' }, '内置读取') : null,
                source.enabled !== true ? h(Tag, { key: 'off', tone: 'off' }, '已停用') : null,
                (source.forced ?? []).length === 0 ? null : h(Tag, { key: 'fo', tone: 'warn' }, `${source.forced.length} 个单独开着`),
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
                title: open.length === skills.length ? '把这一组技能全部停用' : '把这一组技能全部启用',
                onClick: () => void this.toggleGroup(source, skills, open.length !== skills.length, at),
              }, open.length === skills.length ? '整组停用' : '整组启用'),
              h(Switch, { key: 'sw', checked: source.enabled === true, label: `启用来源 ${source.label}`, title: '启停这个来源里的全部技能', onChange: (next) => void this.toggleSource(source, next, at) }),
              source.custom === true
                ? h(IconButton, { key: 'rm', label: `移除来源 ${source.label}`, danger: true, onClick: () => void this.removeSource(source, at) }, icon(IconTrash, { size: 13 }))
                : null,
            ]),
          ]),
          closed === true
            ? null
            : skills.length === 0
              ? h('div', { key: 'b', className: 'acap-skills' }, h('div', { className: 'acap-src-hint' }, source.error === ''
                ? '这个目录里还没有技能。'
                : source.kind === 'session'
                  ? '这个目录会在第一次新建技能时创建。'
                  : '这个目录还不存在，换一个路径，或者先建好目录。'))
              : h('div', { key: 'b', className: 'acap-skills' }, skills.map((skill) => this.renderSkill(source, skill, at))),
        ])
      }

      /** One switch for a whole source: every skill in it, or none. */
      async toggleGroup(source, skills, enabled, at) {
        const names = skills.filter((skill) => skill.valid !== false).map((skill) => skill.name)
        if (names.length === 0) return
        const result = await this.run('toggleSkills', { ...this.scopeArgsOf(at), source: source.key, names, enabled, wholeGroup: true })
        if (result.error === '') this.say(`${source.label}：${enabled ? '已启用' : '已停用'} ${names.length} 个技能`)
        else this.say(result.error, 'error')
      }

      /** Save one place switch and let the shell redraw its slots. */
      async savePlace(key, value) {
        const prefs = { ...(this.state.view?.prefs ?? {}), [key]: value }
        const result = await this.run('savePrefs', prefs)
        if (result.error !== '') {
          this.say(result.error, 'error')
          return
        }
        syncShell(prefs)
        this.say(value ? '已经把它加到这个位置' : '已经把这个入口收起来')
      }

      /** The one place that decides where this plugin shows up. */
      renderPlacesSheet() {
        const prefs = this.state.view?.prefs ?? {}
        const places = [
          { key: 'sidebarSkills', label: '主页左边栏：skill', hint: '主页左边多一个图标，点开就是整页的 skill 管理' },
          { key: 'sidebarMcp', label: '主页左边栏：mcp', hint: '主页左边多一个图标，点开就是整页的 mcp 管理' },
          { key: 'tabSkills', label: '对话页顶部 tab：skill', hint: '每条对话的上方多一个 skill 页，管的就是这条会话' },
          { key: 'tabMcp', label: '对话页顶部 tab：mcp', hint: '每条对话的上方多一个 mcp 页，管的就是这条会话' },
        ]
        const openCount = places.filter((place) => prefs[place.key] === true).length
        return h(Sheet, {
          key: 'places-sheet',
          title: '入口',
          subtitle: '挑这个插件出现在哪里。开着的入口立刻出现，关掉的立刻收起。',
          small: true,
          onClose: () => this.onChange({ placesOpen: false }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'c', className: 'acap-sheet-count' }, `开着 ${openCount} / ${places.length}`),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'd', variant: 'outline', size: 'sm', onClick: () => this.onChange({ placesOpen: false }) }, '关闭'),
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
              skill.form === 'file' ? h(Tag, { key: 'f' }, '单文件') : null,
              skill.valid === false ? h(Tag, { key: 'b', tone: 'err' }, skill.error === '' ? '解析异常' : skill.error) : null,
              skill.forced === true ? h(Tag, { key: 'fo', tone: 'warn' }, '整组关着，单独开着') : null,
              typeof skill.kept === 'string' ? h(Tag, { key: 'k', tone: 'warn' }, `同名仍由 ${skill.kept} 提供`) : null,
              skill.modelInvocable === false ? h(Tag, { key: 'mi', tone: 'off' }, '不自动加载') : null,
              skill.userInvocable === false ? h(Tag, { key: 'ui', tone: 'off' }, '不接受 / 命令') : null,
            ]),
            h('div', { key: 'd', className: 'acap-skill-desc', title: skill.description }, skill.description === '' ? '没有写说明' : skill.description),
          ]),
          h('div', { key: 'a', className: 'acap-skill-actions' }, [
            h(Switch, { key: 'sw', checked: skill.enabled === true, label: `启用技能 ${skill.name}`, onChange: (next) => void this.toggleSkill(source, skill, next, at) }),
            h(IconButton, { key: 'ed', label: `编辑 ${skill.name}`, onClick: () => this.openSkillEditor(source, skill, at) }, icon(IconEdit, { size: 13 })),
            h(IconButton, { key: 'rm', label: `删除 ${skill.name}`, danger: true, onClick: () => void this.removeSkill(source, skill, at) }, icon(IconTrash, { size: 13 })),
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
        if (current !== 'global' && counts.global > 0) parts.push(`全局 ${counts.global} 个`)
        if (current !== 'project' && counts.project > 0) parts.push(`项目 ${counts.project} 个`)
        if (current !== 'session' && counts.session > 0) parts.push(`会话 ${counts.session} 个`)
        return parts.length === 0 ? '' : `别的范围已经有：${parts.join('、')}`
      }

      renderServers(entry, at, showHeader = true) {
        const anchor = at ?? this.anchor()
        const servers = entry?.servers ?? []
        const enabled = servers.filter((server) => server.enabled !== false).length
        const header = h('div', { key: 'h', className: 'acap-section-head' }, [
          h('h2', { key: 't', className: 'acap-section-title' }, ['MCP 服务器', h('span', { key: 'c', className: 'acap-section-count' }, `${enabled} 个启用 / 共 ${servers.length} 个`)]),
          h('span', { key: 'g', className: 'acap-grow' }),
          h(Button, {
            key: 'r',
            variant: 'ghost',
            size: 'sm',
            icon: icon(IconRefresh, {}),
            onClick: () => void this.refreshMcp(),
          }, '刷新状态'),
          h(Button, {
            key: 'a',
            variant: 'outline',
            size: 'sm',
            icon: icon(IconPlus, {}),
            disabled: anchor === undefined,
            onClick: () => this.openServerEditor(-1, undefined, at),
          }, '添加服务器'),
        ])
        const conflicts = entry?.conflicts ?? []
        const elsewhere = this.otherScopeServers(at)
        const body = servers.length === 0
          ? h('div', { key: 'e', className: 'acap-empty' }, [
            h('span', { key: 't', className: 'acap-empty-title' }, '这个范围还没有 MCP 服务器'),
            h('span', { key: 'b', className: 'acap-empty-body' }, elsewhere === ''
              ? '添加之后，它的工具会以 mcp__名称__ 前缀出现在这个范围的模型里。'
              : `${elsewhere}。切到那个范围可以改它，或者在这里为这个范围单独加一个。`),
          ])
          : h('div', { key: 'l', style: { display: 'flex', flexDirection: 'column', gap: 8 } }, servers.map((server, index) => {
            const scope = this.scopeArgsOf(at).scope
            const status = (this.state.mcp?.servers ?? []).find((row) => row.serverName === server.name && row.scope === scope)
            return h('div', { key: `${server.id ?? server.name}:${index}`, className: 'acap-srv', 'data-off': server.enabled === false }, [
              h(Mark, { key: 'm', source: { id: server.name, label: server.name } }),
              h('div', { key: 'main', className: 'acap-srv-main' }, [
                h('div', { key: 't', className: 'acap-srv-top' }, [
                  h('code', { key: 'n', className: 'acap-srv-name' }, server.name),
                  h(Tag, { key: 'tr' }, server.transport === 'stdio' ? '本地进程' : 'HTTP'),
                  status === undefined ? null : h(Tag, { key: 'tl', tone: status.toolCount > 0 ? 'on' : 'off', title: status.live === false ? '这条会话还没有活动，工具要等会话开始后才连上' : undefined }, status.live === false ? '会话未激活' : `${status.toolCount ?? 0} 个工具`),
                  typeof status?.error === 'string' && status.error !== '' ? h(Tag, { key: 'er', tone: 'err' }, status.error) : null,
                ]),
                h('div', { key: 'c', className: 'acap-srv-cmd', title: server.transport === 'stdio' ? [server.command, ...(server.args ?? [])].join(' ') : server.url },
                  server.transport === 'stdio' ? `${server.command} ${(server.args ?? []).join(' ')}`.trim() : server.url),
                (status?.tools ?? []).length === 0 ? null : h('div', { key: 'tools', className: 'acap-tools' }, (status.tools ?? []).slice(0, 8).map((name) => h('span', { key: name, className: 'acap-tool' }, name))),
              ]),
              h('div', { key: 'a', className: 'acap-srv-actions' }, [
                h(Switch, { key: 'sw', checked: server.enabled !== false, label: `启用服务器 ${server.name}`, onChange: () => void this.toggleServer(index, server, at) }),
                h(IconButton, { key: 'ed', label: `编辑服务器 ${server.name}`, onClick: () => this.openServerEditor(index, server, at) }, icon(IconEdit, { size: 13 })),
                h(IconButton, { key: 'rm', label: `删除服务器 ${server.name}`, danger: true, onClick: () => void this.removeServer(index, server, at) }, icon(IconTrash, { size: 13 })),
              ]),
            ])
          }))

        return h('section', { key: 'servers', className: 'acap-section' }, [
          showHeader ? header : null,
          this.state.mcpError === '' ? null : h(Notice, { key: 'err', tone: 'error' }, this.state.mcpError),
          conflicts.length === 0 ? null : h(Notice, { key: 'cf', tone: 'warn' }, `同名服务器在更靠近的范围里也有，最近的那个生效：${conflicts.map((row) => row.name).join('，')}`),
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
          title: '这条会话',
          hint: '只在这条会话里生效，比项目和全局都近',
          entry: session,
          at: { scope: 'session', sessionId },
        }]
        if (project !== undefined) {
          sections.push({
            key: 'project',
            title: `项目 · ${lastSegment(root)}`,
            hint: '同一个项目里的每条会话都会读到',
            entry: project,
            at: { scope: 'project', root },
          })
        }
        sections.push({ key: 'global', title: '全局', hint: '所有项目和会话都会读到', entry: view.global, at: { scope: 'global' } })
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
          ? `${(section.entry?.servers ?? []).length} 个服务器`
          : `${section.entry?.counts?.skills ?? 0} 个技能`
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
                }, '添加服务器')),
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
            h('span', { key: 't', className: 'acap-empty-title' }, section.key === 'session' ? '这条会话还没有自己的技能' : '这个范围还没有技能'),
            h('span', { key: 'b', className: 'acap-empty-body' }, section.key === 'session'
              ? '新建技能会写进这条会话自己的目录，只有它读得到。'
              : '添加一个目录，或者新建一个技能。'),
          ])
        }
        return h('div', { key: 's', className: 'acap-sources' }, rows.map((source) => this.renderSource(source, section.at)))
      }

      renderCatalog() {
        const catalog = this.state.catalog
        const anchor = this.anchor()
        return h(Sheet, {
          key: 'catalog',
          title: '模型现在能看到的技能',
          subtitle: anchor === undefined ? '这个范围还没有目标' : '这一份名单来自技能注册表本身，是模型决定加载技能时读到的目录。',
          small: false,
          onClose: () => this.onChange({ catalog: undefined }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', onClick: () => this.onChange({ catalog: undefined }) }, '关闭'),
          ]),
        }, catalog.loading === true
          ? h('div', { className: 'acap-note' }, '正在读取…')
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
            h('div', { key: 'e', className: 'acap-note' }, '这个范围里没有模型能看到的技能。'),
            hidden === 0 ? null : h('div', { key: 'h', className: 'acap-note' }, `另有 ${hidden} 个名字被停用或被更近的范围挡在后面。`),
          ])
        }
        return h(React.Fragment, null, [
          h('div', { key: 'l', className: 'acap-picker-list' }, visible.map((row) => h('div', { key: row.name, className: 'acap-skill' }, [
            h('div', { key: 'm', className: 'acap-skill-main' }, [
              h('div', { key: 't', className: 'acap-skill-top' }, [
                h(Mark, { key: 'mk', source: { id: row.source, label: row.sourceLabel } }),
                h('code', { key: 'n', className: 'acap-skill-name' }, row.name),
                h(Tag, { key: 's', hue: hueOf(row.source) }, row.sourceLabel ?? row.source),
                row.scope === undefined ? null : h(Tag, { key: 'sc', hue: SCOPE_HUE[row.scope] ?? 'slate' }, SCOPE_LABEL[row.scope] ?? row.scope),
                row.provider === 'skill-mcp-manager' ? null : h(Tag, { key: 'p' }, row.provider),
              ]),
            ]),
          ]))),
          hidden === 0 ? null : h('div', { key: 'h', className: 'acap-note' }, `另有 ${hidden} 个名字被停用或被更近的范围挡在后面，模型读不到。`),
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
          title: editor.mode === 'create' ? '新建技能' : `编辑 ${editor.renameFrom}`,
          subtitle: editor.mode === 'create'
            ? '写进所选来源的目录。保存之后，这条会话立刻能从目录里看到它。'
            : '改名字等于改目录名；正文与说明直接写进 SKILL.md。',
          onClose: () => this.onChange({ skillEditor: undefined }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'h', className: 'acap-sheet-hint', title: dir }, `${editor.sourceLabel ?? ''} · ${editor.mode === 'create' ? '新技能' : '修改中'}`),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', disabled: editor.busy !== '', onClick: () => this.onChange({ skillEditor: undefined }) }, '取消'),
            h(Button, { key: 's', variant: 'primary', size: 'sm', disabled: editor.busy !== '', onClick: () => void this.saveSkill(editor) }, editor.busy === '' ? '保存' : editor.busy),
          ]),
        }, h('div', { className: 'acap-edit' }, [
          h('div', { key: 'l', className: 'acap-edit-col' }, [
            h('div', { key: 'pair', className: 'acap-edit-pair' }, [
              h(Field, { key: 'n', label: '名称', required: true, hint: '小写字母、数字和连字符，也是目录名' }, h(Input, {
                value: editor.name,
                placeholder: 'pdf-tools',
                'aria-label': '技能名称',
                'aria-invalid': nameProblem(editor.name) !== '',
                onChange: (event) => update({ name: event.target.value }),
              })),
              h(Field, { key: 'w', label: '什么时候用', hint: '可选，写给模型的触发条件' }, h(Input, {
                value: editor.whenToUse,
                placeholder: '用户要求处理 PDF 时',
                'aria-label': '触发条件',
                onChange: (event) => update({ whenToUse: event.target.value }),
              })),
            ]),
            h(Field, {
              key: 'd',
              label: '说明',
              required: true,
              counter: `${longFields} 字`,
              hint: '模型只靠这句话判断要不要加载这个技能，写清楚它能做什么。',
            }, h('textarea', {
              className: 'acap-textarea',
              value: editor.description,
              rows: 3,
              'aria-label': '技能说明',
              placeholder: '把 PDF 逐页导成图片，并抽出其中的表格。',
              onChange: (event) => update({ description: event.target.value }),
            })),
            h(Field, { key: 'b', label: '正文', hint: '加载技能时读到的 Markdown，可以在目录里放资源文件再引用。' }, h('textarea', {
              className: 'acap-textarea acap-textarea-mono acap-textarea-body',
              value: editor.content,
              'aria-label': '技能正文',
              placeholder: '## 步骤\n\n1. 用 pdfinfo 确认页数…',
              onChange: (event) => update({ content: event.target.value }),
            })),
            h('div', { key: 'togs', className: 'acap-toggle-row' }, [
              h('div', { key: 'm', className: 'acap-toggle' }, [
                h(Switch, { key: 's', checked: editor.modelInvocable !== false, label: '允许模型自动加载', onChange: (next) => update({ modelInvocable: next }) }),
                h('span', { key: 't', className: 'acap-toggle-text' }, [
                  h('span', { key: 'a', className: 'acap-toggle-title' }, '允许模型自动加载'),
                  h('span', { key: 'b', className: 'acap-note' }, '关掉后只在 / 命令里出现'),
                ]),
              ]),
              h('div', { key: 'u', className: 'acap-toggle' }, [
                h(Switch, { key: 's', checked: editor.userInvocable !== false, label: '允许用户用 / 命令调用', onChange: (next) => update({ userInvocable: next }) }),
                h('span', { key: 't', className: 'acap-toggle-text' }, [
                  h('span', { key: 'a', className: 'acap-toggle-title' }, '允许 / 命令调用'),
                  h('span', { key: 'b', className: 'acap-note' }, '关掉后输入框里不出现它'),
                ]),
              ]),
            ]),
            editor.mode === 'create' ? h(Field, { key: 'f', label: '存放形式', hint: FORMS.find((row) => row.value === form)?.hint }, h(Segmented, {
              id: 'acap-skill-form',
              value: form,
              options: FORMS,
              label: '存放形式',
              onChange: (next) => update({ form: next }),
            })) : null,
            editor.error === '' ? null : h(Notice, { key: 'e', tone: 'error' }, editor.error),
          ]),
          h('div', { key: 'r', className: 'acap-side' }, [
            h('div', { key: 'p', className: 'acap-preview' }, [
              h('div', { key: 'h', className: 'acap-preview-head' }, '将写入'),
              h('span', { key: 'p', className: 'acap-preview-path', title: path }, shortenPath(path, 40)),
              h('pre', { key: 'pre', className: 'acap-pre' }, skillDocument(editor)),
              (editor.resources ?? []).length === 0 ? null : h('div', { key: 'res', className: 'acap-preview-head' }, ['目录里还有', ...(editor.resources ?? []).slice(0, 4).map((row) => h('span', { key: row.name, className: 'acap-preview-chip' }, row.name))]),
            ]),
            h(Points, {
              key: 'pts',
              rows: [
                `保存之后，${this.anchorText()}的技能目录里立刻能读到它。`,
                '模型只读名称、说明和触发条件，正文在真正加载时才读。',
                '把技能停用只是把它藏起来，磁盘上的文件不会被改动。',
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
              'aria-label': `第 ${index + 1} 条的键`,
              onChange: (event) => setRow(index, { key: event.target.value }),
            }),
            h(Input, {
              key: 'v',
              value: row.value,
              placeholder: kind === 'env' ? 'sk-…' : 'Bearer …',
              'aria-label': `第 ${index + 1} 条的值`,
              onChange: (event) => setRow(index, { value: event.target.value }),
            }),
            h('button', {
              key: 'x',
              type: 'button',
              className: 'acap-icon-btn acap-pair-drop',
              'aria-label': `删除第 ${index + 1} 条`,
              title: '删除这一条',
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
            }, kind === 'env' ? '添加变量' : '添加请求头')),
        ])
      }

      renderServerEditor() {
        const editor = this.state.serverEditor
        const server = editor.server
        const update = (patch) => this.onChange({ serverEditor: { ...this.state.serverEditor, server: { ...this.state.serverEditor.server, ...patch } } })
        const transport = TRANSPORTS.find((row) => row.value === server.transport)
        return h(Sheet, {
          key: 'server-editor',
          title: editor.mode === 'create' ? '添加 MCP 服务器' : `编辑 ${server.name}`,
          subtitle: '连接成功后，工具会以 mcp__名称__ 前缀出现，模型按需调用。',
          onClose: () => this.onChange({ serverEditor: undefined }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'h', className: 'acap-sheet-hint' }, `写入范围 · ${this.anchorText()}`),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', disabled: editor.busy !== '', onClick: () => this.onChange({ serverEditor: undefined }) }, '取消'),
            h(Button, { key: 's', variant: 'primary', size: 'sm', disabled: editor.busy !== '', onClick: () => this.submitServerEditor() }, editor.busy === '' ? '保存' : editor.busy),
          ]),
        }, h('div', { className: 'acap-edit' }, [
          h('div', { key: 'l', className: 'acap-edit-col' }, [
            h('div', { key: 'pair', className: 'acap-edit-pair' }, [
              h(Field, { key: 'n', label: '名称', required: true, hint: '随便起名，中文也行；重名会被更靠近的范围遮住' }, h(Input, {
                value: server.name,
                placeholder: 'playwright',
                'aria-label': '服务器名称',
                onChange: (event) => update({ name: event.target.value }),
              })),
              h(Field, { key: 't', label: '连接方式', hint: transport?.hint }, h(Segmented, {
                id: 'acap-server-transport',
                value: server.transport,
                options: TRANSPORTS,
                label: '连接方式',
                onChange: (next) => update({ transport: next }),
              })),
            ]),
            server.transport === 'stdio' ? h(Field, {
              key: 'cmd',
              label: '命令',
              required: true,
              hint: '相对路径按工作目录解析。',
            }, h(Input, {
              value: server.command,
              placeholder: 'node',
              'aria-label': '启动命令',
              onChange: (event) => update({ command: event.target.value }),
            })) : h(Field, {
              key: 'url',
              label: '地址',
              required: true,
              hint: '已经跑起来的服务器，例如 http://127.0.0.1:8931/mcp',
            }, h(Input, {
              value: server.url,
              placeholder: 'http://127.0.0.1:8931/mcp',
              'aria-label': '服务器地址',
              onChange: (event) => update({ url: event.target.value }),
            })),
            server.transport === 'stdio' ? h(Field, {
              key: 'args',
              label: '参数',
              counter: `${(textToArgs(editor.argsText) ?? []).length} 个`,
              hint: '一行一个，直接交给进程，不经过 shell。',
            }, h('textarea', {
              className: 'acap-textarea acap-textarea-mono',
              rows: 3,
              value: editor.argsText,
              'aria-label': '命令参数',
              placeholder: 'server.mjs',
              onChange: (event) => this.onChange({ serverEditor: { ...this.state.serverEditor, argsText: event.target.value } }),
            })) : null,
            server.transport === 'stdio' ? h(Field, { key: 'cwd', label: '工作目录', hint: '进程从这里启动，留空用宿主的工作目录' }, h('div', { className: 'acap-select-row' }, [
              h(Input, {
                key: 'i',
                value: server.cwd,
                placeholder: '/Users/me/project',
                'aria-label': '工作目录',
                onChange: (event) => update({ cwd: event.target.value }),
              }),
              h(Button, { key: 'p', variant: 'ghost', size: 'sm', icon: icon(IconFolder, {}), onClick: () => void this.openPicker(server.cwd === '' ? this.state.view?.defaults?.home : server.cwd, 'server-cwd') }, '选择'),
            ])) : null,
            h(Field, {
              key: 'env',
              label: server.transport === 'stdio' ? '环境变量' : '请求头',
              hint: server.transport === 'stdio' ? '逐条列出，会加到子进程的环境里。' : '逐条列出，随每次请求发出。值里可以有等号。',
            }, this.renderPairs(server.transport === 'stdio' ? 'env' : 'header', server.transport === 'stdio' ? editor.envRows : editor.headerRows)),
            editor.error === '' ? null : h(Notice, { key: 'e', tone: 'error' }, editor.error),
          ]),
          h('div', { key: 'r', className: 'acap-side' }, [
            h('div', { key: 'p', className: 'acap-preview' }, [
              h('div', { key: 'h', className: 'acap-preview-head' }, ['挂载参数']),
              h('pre', { key: 'pre', className: 'acap-pre' }, mcpConfigPreview({ ...server, args: textToArgs(editor.argsText), env: rowsToPairs(editor.envRows).pairs, headers: rowsToPairs(editor.headerRows).pairs })),
            ]),
            h(Points, {
              key: 'pts',
              rows: [
                `工具名会带上 mcp__${mountNameOf(server.name)}__ 前缀。`,
                `只挂到${this.anchorText()}，别的范围看不到这些工具。`,
                server.transport === 'stdio' ? '保存后立刻启动进程，停用或删除时进程一起退出。' : '保存后立刻连上去，删掉就断开。',
              ],
            }),
          ]),
        ]))
      }

      renderPicker() {
        const picker = this.state.picker
        const purpose = picker.purpose
        const title = purpose === 'project' ? '选择项目目录' : purpose === 'server-cwd' ? '选择工作目录' : '添加技能目录'
        return h(Sheet, {
          key: 'picker',
          title,
          subtitle: purpose === 'project' ? '选中之后，这一页会扫描该项目里各个 Agent 的技能目录。' : '选中之后，这个目录会被当作一个技能来源添加进来。',
          small: false,
          onClose: () => this.onChange({ picker: undefined }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'h', className: 'acap-sheet-hint', title: picker.path }, shortenPath(picker.path, 52)),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', onClick: () => this.onChange({ picker: undefined }) }, '取消'),
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
            }, purpose === 'server-cwd' ? '用这个目录' : purpose === 'project' ? '扫描这个项目' : '添加这个目录'),
          ]),
        }, h('div', { className: 'acap-picker' }, [
          h('div', { key: 'bar', className: 'acap-picker-bar' }, [
            h(Button, {
              key: 'up',
              variant: 'ghost',
              size: 'sm',
              disabled: picker.parent === '' || picker.loading === true,
              onClick: () => void this.loadDir(picker.parent),
            }, '上一层'),
            h('span', { key: 'p', className: 'acap-picker-path', title: picker.path }, picker.path),
          ]),
          picker.error === '' ? null : h(Notice, { key: 'e', tone: 'warn' }, picker.error),
          h('div', { key: 'l', className: 'acap-picker-list' }, picker.loading === true
            ? h('div', { className: 'acap-note', style: { padding: 6 } }, '正在读取…')
            : (picker.entries ?? []).length === 0
              ? h('div', { className: 'acap-note', style: { padding: 6 } }, '这里没有子目录。')
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
          footer: h(React.Fragment, null, [
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'c', variant: 'outline', size: 'sm', disabled: confirm.busy === true, onClick: () => this.onChange({ confirm: undefined }) }, '取消'),
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
        }, confirm.error === undefined ? null : h(Notice, { tone: 'error' }, confirm.error))
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
        this.state = { loading: true, error: '', prefs: undefined, busy: '' }
        this.mounted = false
      }

      componentDidMount() {
        this.mounted = true
        void this.load()
      }

      componentWillUnmount() {
        this.mounted = false
      }

      get api() {
        return this.props?.api
      }

      patch(next) {
        if (this.mounted === true) this.setState(next)
      }

      async call(method, input = undefined) {
        const api = this.api
        if (api === undefined || typeof api[method] !== 'function') return { error: '宿主的技能与 MCP 管理插件没有加载' }
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
        notify(value ? '已经把它加到这个位置' : '已经把这个入口收起来')
      }

      render() {
        try {
          if (this.state.loading === true) return h('div', { className: 'acap-note' }, '正在读取设置…')
          if (this.state.error !== '') return h(Notice, { tone: 'error' }, this.state.error)
          const prefs = this.state.prefs ?? {}
          const places = [
            { key: 'sidebarSkills', label: '主页左边栏：SKILL', hint: '主页左边多一个图标，点开就是整页的 SKILL 管理' },
            { key: 'sidebarMcp', label: '主页左边栏：MCP', hint: '主页左边多一个图标，点开就是整页的 MCP 管理' },
            { key: 'tabSkills', label: '对话页顶部 tab：skill', hint: '每条对话的上方多一个 skill 页，管的就是这条会话' },
            { key: 'tabMcp', label: '对话页顶部 tab：mcp', hint: '每条对话的上方多一个 mcp 页，管的就是这条会话' },
          ]
          return h('div', { className: 'acap-scope acap-plugin-settings' }, [
            h('div', { key: 't', className: 'acap-plugin-title' }, '显示位置'),
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
            h('div', { key: 'n', className: 'acap-note' }, '改完立刻生效。技能与 MCP 本身在设置里的 SKILL管理、MCP管理两页。'),
          ])
        } catch (error) {
          console.warn('[skill-mcp-manager] 插件设置面板渲染失败', error)
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
        this.state = { open: false, loading: true, error: '', data: undefined, busy: '', tab: 'skill', closed: {} }
        this.mounted = false
      }

      componentDidMount() {
        this.mounted = true
        void this.load()
      }

      componentWillUnmount() {
        this.mounted = false
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
        if (api === undefined || typeof api[method] !== 'function') return { error: '宿主的技能与 MCP 管理插件没有加载' }
        try {
          return unwrap(await api[method](input))
        } catch (error) {
          return { error: String(error?.message ?? error) }
        }
      }

      async load() {
        if (this.sessionId === '') {
          this.patch({ loading: false, error: '这条会话还没有标识' })
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
            title: changed === 0 ? '这一次发送带上的 SKILL 与 MCP' : `这一次发送改动了 ${changed} 项`,
            onClick: () => {
              this.patch({ open: true, error: '' })
              void this.load()
            },
          }, [
            h('span', { key: 'i', className: 'acap-chip-icon' }, icon(IconSkill, { size: 14 })),
            h('span', { key: 't', className: 'acap-chip-label' }, changed === 0 ? 'SKILL·MCP' : `SKILL·MCP ${changed}`),
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
          const key = String(entry.sourceLabel ?? entry.source ?? '其它来源')
          const bucket = bySource.get(key)
          if (bucket === undefined) bySource.set(key, [entry])
          else bucket.push(entry)
        }
        const groups = [...bySource.entries()].map(([key, rows]) => ({ key, rows, id: rows[0]?.source }))

        const row = (entry, kind) => h('div', { key: `${kind}:${entry.scope}:${entry.name}`, className: 'acap-temp-row', 'data-dropped': entry.effective !== true }, [
          h('div', { key: 'm', className: 'acap-temp-main' }, [
            h('code', { key: 'n', className: 'acap-temp-name' }, entry.name),
            h('span', { key: 's', className: 'acap-temp-scope' }, SCOPE_LABEL[entry.scope] ?? entry.scope),
            entry.off === true ? h(Tag, { key: 'x', tone: 'warn' }, '这一次不带') : entry.forced === true ? h(Tag, { key: 'f', tone: 'on' }, '这一次带上') : null,
          ]),
          h('div', { key: 'a', className: 'acap-temp-actions' }, [
            h(Switch, {
              key: 'sw',
              checked: entry.effective === true,
              label: `${entry.name} 这一次是否带上`,
              disabled: this.state.busy !== '',
              onChange: (next) => void this.flip(kind, entry.name, next),
            }),
          ]),
        ])

        return h(Sheet, {
          key: 'sheet',
          title: '这一次发送带上什么',
          subtitle: '这里的开关只管这一条会话，优先级高于项目与全局。回合结束就恢复原样。',
          medium: true,
          onClose: () => this.patch({ open: false }),
          footer: h(React.Fragment, null, [
            h('span', { key: 'c', className: 'acap-sheet-count' }, changed === 0 ? '这一次没有改动' : `这一次改动了 ${changed} 项`),
            h('span', { key: 'g', className: 'acap-grow' }),
            h(Button, { key: 'r', variant: 'ghost', size: 'sm', disabled: this.state.busy !== '' || changed === 0, onClick: () => void this.reset() }, '全部恢复'),
            h(Button, { key: 'c2', variant: 'outline', size: 'sm', onClick: () => this.patch({ open: false }) }, '关闭'),
          ]),
        }, this.state.loading === true
          ? h('div', { className: 'acap-note' }, '正在读取这条会话…')
          : this.state.error !== ''
            ? h(Notice, { tone: 'error' }, this.state.error)
            : h(React.Fragment, null, [
              h('div', { key: 'tabs', className: 'acap-temp-tabs' }, h(Segmented, {
                id: 'acap-temp-tabs',
                value: this.state.tab === 'server' ? 'server' : 'skill',
                options: [
                  { value: 'skill', label: `技能 ${skills.length}` },
                  { value: 'server', label: `MCP ${servers.length}` },
                ],
                onChange: (next) => this.patch({ tab: next }),
              })),
              this.state.tab === 'server'
                ? servers.length === 0
                  ? h('div', { key: 'me', className: 'acap-note' }, '这条会话还没有 MCP 服务器。去 mcp 页加一个。')
                  : h('div', { key: 'ml', className: 'acap-temp-list' }, servers.map((entry) => row(entry, 'server')))
                : skills.length === 0
                  ? h('div', { key: 'se', className: 'acap-note' }, '这条会话还没有能带上的技能。')
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
                          label: `${group.key} 这一次全部带上`,
                          title: allOn ? `这一次不带 ${group.key} 的全部技能` : `这一次带上 ${group.key} 的全部技能`,
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
                          h('span', { key: 'c', className: 'acap-temp-count' }, `${group.rows.length} 个`),
                          dropped === 0 ? null : h('span', { key: 'd', className: 'acap-temp-group-hint' }, `这一次不带 ${dropped} 个`),
                          stopped ? h('span', { key: 'o', className: 'acap-temp-group-hint' }, '这个来源在记录里是停用的') : null,
                          h('span', { key: 'g', className: 'acap-grow' }),
                        ]),
                      ]),
                      shut === true ? null : h('div', { key: 'r', className: 'acap-temp-group-rows' }, group.rows.map((entry) => row(entry, 'skill'))),
                    ])
                  })),
            ]))
      }
    }

    const inject = ['slots', 'remote']
    let capturedApi

    const apply = async (ctx) => {
      injectStyles()
      ctx.effect(() => () => {
        styleElement?.remove()
        styleElement = undefined
      }, 'skill and mcp manager styles')

      // The remote namespace only exists once the mount settles; registering the page
      // before that would hand every visitor an empty api and no way to recover.
      await ctx.remote.$mount(RPC_REMOTE)
      capturedApi = ctx.get('remote.skillMcpManager')
      if (capturedApi === undefined) {
        throw new Error('远程服务 skillMcpManager 没有挂上：宿主的 skill-mcp-manager 插件没有加载')
      }

      // Confirmations ride the frame-wide overlay, the same layer the shipped plugins use.
      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: `${NS}-notice`,
        order: 60,
      }, NoticeHost))

      // The bundle's page in the plugin list carries the same switches, so a person
      // who found the plugin there does not have to open one of its pages first.
      ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
        name: 'plugins.bundle.config',
        key: 'dsh-skill-mcp-manager',
        inject: () => ({ api: capturedApi }),
      }, PluginSettings))

      // The settings sidebar carries the two halves as separate pages.
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: `${NS}-skills`,
        order: 23,
        label: () => 'SKILL管理',
        inject: () => ({ api: capturedApi, page: 'skills' }),
      }, ManagerPage))

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: `${NS}-mcp`,
        order: 24,
        label: () => 'MCP管理',
        inject: () => ({ api: capturedApi, page: 'mcp' }),
      }, ManagerPage))

      // The composer control rides every conversation: the coming-turn switches are
      // the one part of this plugin that has to be reachable while writing a message.
      ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
        name: 'conversation.input.left',
        id: NS,
        order: 40,
        label: () => '这一次发送带上什么',
        inject: (sessionId) => ({ api: capturedApi, sessionId }),
      }, ComposerToggles))

      // Everything else is optional and follows the place switches in the page.
      const handles = []
      const clear = () => {
        for (const dispose of handles.splice(0)) {
          try {
            dispose()
          } catch (error) {
            console.warn('[skill-mcp-manager] 收起入口失败', error)
          }
        }
      }
      const add = (key, options, component) => {
        handles.push(ctx.slots.inject(key, () => ctx.slots.register(options, component)))
      }
      syncShell = (prefs) => {
        clear()
        const on = (key) => prefs?.[key] === true
        if (on('sidebarSkills')) {
          add('sidebar.panellist', { name: 'sidebar.panellist', id: PANEL_SKILLS, order: 40, label: () => 'SKILL管理' }, SkillsPanelIcon)
          add('main', { name: 'main', key: PANEL_SKILLS, inject: () => ({ api: capturedApi, page: 'skills' }) }, ManagerPage)
        }
        if (on('sidebarMcp')) {
          add('sidebar.panellist', { name: 'sidebar.panellist', id: PANEL_MCP, order: 41, label: () => 'MCP管理' }, ServersPanelIcon)
          add('main', { name: 'main', key: PANEL_MCP, inject: () => ({ api: capturedApi, page: 'mcp' }) }, ManagerPage)
        }
        if (on('tabSkills')) {
          add('conversation.view', { name: 'conversation.view', id: `${NS}-skills`, order: 40, label: () => 'skill', inject: (sessionId) => ({ api: capturedApi, page: 'skills', sessionId }) }, ManagerPage)
        }
        if (on('tabMcp')) {
          add('conversation.view', { name: 'conversation.view', id: `${NS}-mcp`, order: 41, label: () => 'mcp', inject: (sessionId) => ({ api: capturedApi, page: 'mcp', sessionId }) }, ManagerPage)
        }
      }

      // The first drawing needs the saved switches, which only the host knows.
      try {
        const prefs = await capturedApi.snapshot().then((reply) => (reply !== null && typeof reply === 'object' && 'ok' in reply ? reply.value : reply))
        syncShell(prefs?.prefs ?? {})
      } catch (error) {
        syncShell({})
        console.warn('[skill-mcp-manager] 读取显示位置失败，先不插入可选入口', error)
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
