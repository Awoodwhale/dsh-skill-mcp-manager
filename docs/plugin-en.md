# SKILL and MCP Manager

This plugin puts "what the model can see and connect to for this turn" on the screen, managed separately at global, project, and session scope. The settings page carries a skills page and an MCP page; each half also has a sidebar entry, a conversation tab, and a temporary switch in the composer. Every optional surface is toggled one by one under `Places` in the page header.

## Three scopes

| Scope | Reaches | Where it lives in the record |
| --- | --- | --- |
| Global | every session on this machine | `global` |
| Project | every session under one project directory | `projects[project root]` |
| Session | this one conversation | `sessions[session id]` |

When the same name appears at more than one scope, the nearest one decides: session over project, project over global. Turning the nearest copy off removes the name from the current scope entirely; a farther scope does not take it back.

## Skills

Skills are grouped by the agent whose directory holds them, and the groups come from directories on disk. `$DSH_HOME/skills`, `~/.agents/skills`, `.dsh/skills`, and `.agents/skills` are read by the host itself. Directories belonging to Claude Code, Codex, Gemini, Cursor, Copilot, OpenCode, Windsurf, Trae, Qoder, Roo, CodeBuddy, WorkBuddy, and OpenClaw are discovered by convention and hidden while absent. Beyond those, any directory can be added as a source.

- A source can be switched off as a whole, or single skills inside it can be switched off. Turning a few on inside a disabled group lights the source up.
- Creating a skill writes into the chosen source, either as one directory per skill or one file per skill; the full SKILL.md and its path are shown before writing.
- Renaming in the editor renames the directory; the description and the body go straight into SKILL.md.
- Deleting removes the directory or the file, and the confirmation names exactly what goes away.

Switching off never touches a file on disk: it only decides whether the model can see the skill. Every disabled name leaves a placeholder of the same name in its own layer, with both invocation flags off and one rank ahead of its own source; the registry de-duplicates by name and keeps the one ranked ahead, so the name disappears from the model's list and from the slash menu together.

## MCP servers

Servers follow the same scopes, and the nearest scope wins for a given name. Two transports are supported: a local process (command plus arguments, started and stopped by the plugin) and HTTP (an endpoint already running). Saving connects immediately; the card shows the tool count and tool names, and tools reach the model under the `mcp__name__` prefix. Disabling or deleting closes the process and the connection together.

## What one message carries

The `Abilities` button at the lower left of the composer opens the list of every skill and server this conversation can see, grouped by source. What is switched off there applies to that turn only and reverts afterwards. It sits nearer than project and global, and it is how you free up context or swap a server for one message.

## The record file

Every switch and every custom directory lives in `~/.dsh/dsh-skill-mcp-manager/store.json`. The settings page owns that file; after editing it by hand, refresh the page to read it again.
