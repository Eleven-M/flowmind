# FlowMind Integration Guide

FlowMind can be used directly from the CLI, as a JSON command wrapper, or as an MCP server.
Start with the CLI if you are evaluating the project, then move to MCP when another agent or IDE should call FlowMind as a tool.

## Install

```bash
npm install -g flowmind
flowmind doctor
flowmind demo log-audit
```

For a local one-off run:

```bash
npx flowmind@latest doctor
npx flowmind@latest demo log-audit
```

## CLI

Use the CLI for direct human-driven workflows:

```bash
flowmind skills
flowmind process --skill log-audit "query traceId abc123"
flowmind learn --assets
```

Some skills require external MCP servers, provider credentials, or internal adapters.
The demo command is self-contained and does not require those integrations.

## Codex

Use `flowmind-codex` when another tool needs stable JSON:

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "query traceId abc123"
flowmind-codex doctor
```

By default, `flowmind-codex` shares learning and resource state with MCP and the regular CLI
under `~/.flowmind/`. Set `FLOWMIND_SHARED_HOME=/path/to/home` to select the shared parent
directory. Set `FLOWMIND_CODEX_HOME=/path/to/state` only to intentionally isolate Codex state.

## MCP Server

FlowMind exposes an MCP server through `flowmind-mcp`.

Generic MCP configuration:

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": [],
      "env": {
        "FLOWMIND_HOME": "/absolute/path/to/flowmind-home"
      }
    }
  }
}
```

If your skills use AI providers, pass credentials through environment variables instead of hardcoding them:

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": [],
      "env": {
        "OPENAI_API_KEY": "${OPENAI_API_KEY}"
      }
    }
  }
}
```

## Claude Code

Install the MCP server entry automatically:

```bash
flowmind install claude
```

Or use the MCP server mode manually:

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": []
    }
  }
}
```

Restart Claude Code after changing MCP configuration.

## WorkBuddy

Install the same FlowMind MCP entry for WorkBuddy:

```bash
flowmind install workbuddy
```

To install WorkBuddy and initialize FlowMind's own AI, resource, component, and skill config in one step:

```bash
flowmind install workbuddy \
  --flowmind-home /absolute/path/to/flowmind-home \
  --flowmind-config config/flowmind-config-package.example.md
```

This writes the WorkBuddy MCP entry and imports FlowMind config into `/absolute/path/to/flowmind-home/.flowmind/`.
Future WorkBuddy MCP calls use that config directly, so you do not need a separate `flowmind init` pass for MCP resources.

If your WorkBuddy installation uses a team-specific config path, pass it explicitly:

```bash
flowmind install workbuddy --config /absolute/path/to/workbuddy-mcp.json
```

Preview without writing:

```bash
flowmind install workbuddy --dry-run --json
```

For manual WorkBuddy setup, use:

```bash
config/workbuddy-mcp-config.example.json
```

To initialize FlowMind's own AI, resource, component, and skill config, import the example config package:

```bash
flowmind config --import config/flowmind-config-package.example.md --dry-run --json
flowmind config --import config/flowmind-config-package.example.md
```

The package creates or updates `~/.flowmind/config.json`, `ai-config.json`, `resource-config.json`, `component-config.json`, and `skill-config.json`.

## Cursor, Windsurf, Cline

Use the same MCP server command:

```json
{
  "mcpServers": {
    "flowmind": {
      "command": "flowmind-mcp",
      "args": []
    }
  }
}
```

Client-specific config locations vary, but the command and args are the same.

## Local State

FlowMind stores local config, workflow history, and learning data under `FLOWMIND_HOME/.flowmind`.
When `FLOWMIND_HOME` is not set, it uses the user's home directory.

Files that may contain credentials or workflow context are written with private permissions on POSIX filesystems.
Do not commit `.flowmind/`, `.flowmind-codex/`, or real provider credentials.

## Troubleshooting

Run:

```bash
flowmind doctor
flowmind skills
flowmind release-check
```

If a skill returns a missing provider or missing binding message, configure the required MCP server or resource binding first.
For a configuration-free smoke test, use:

```bash
flowmind demo log-audit --json
```
