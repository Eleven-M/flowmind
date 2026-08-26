<div align="center">

# FlowMind

### A reusable workflow layer for Codex, Claude, WorkBuddy, and MCP tools

FlowMind turns common developer operations into skills: load local knowledge, query logs, review code, check design rules, and reuse what it learns from your corrections.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/flowmind.svg)](https://www.npmjs.com/package/flowmind)
[![npm downloads](https://img.shields.io/npm/dw/flowmind.svg)](https://www.npmjs.com/package/flowmind)

[中文](README_CN.md) | [Integration](docs/integration-guide.md) | [Skills](docs/skills-catalog.md) | [Security](SECURITY.md) | [Changelog](CHANGELOG.md)

</div>

---

## Install

```bash
npm install -g flowmind
flowmind doctor
```

Try it without any provider or MCP configuration:

```bash
flowmind demo log-audit
flowmind demo code-review
flowmind skills
```

Runtime supports Node.js 18 and newer.

## One-Step Setup

Initialize FlowMind's AI, resource, component, and skill config from a portable Markdown package:

```bash
flowmind config --import config/flowmind-config-package.example.md --dry-run --json
flowmind config --import config/flowmind-config-package.example.md
```

This creates the local files FlowMind reads at runtime:

```text
~/.flowmind/config.json
~/.flowmind/ai-config.json
~/.flowmind/resource-config.json
~/.flowmind/component-config.json
~/.flowmind/skill-config.json
```

Use your own package by copying [config/flowmind-config-package.example.md](config/flowmind-config-package.example.md) and replacing MCP server names, project IDs, namespaces, and provider settings.

## Use From Model Tools

### Codex

Use the JSON-friendly wrapper:

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "query traceId abc123"
flowmind-codex doctor
```

By default, Codex mode shares learning and resource state with MCP and the regular CLI under `~/.flowmind/`.
Set `FLOWMIND_SHARED_HOME=/path/to/home` to choose the shared parent directory. Set
`FLOWMIND_CODEX_HOME=/path/to/state` only when an isolated Codex store is required.

### Claude

Install FlowMind as a Claude MCP server:

```bash
flowmind install claude
```

Install Claude and initialize FlowMind config in one command:

```bash
flowmind install claude \
  --flowmind-home /absolute/path/to/flowmind-home \
  --flowmind-config config/flowmind-config-package.example.md
```

Restart Claude after changing MCP configuration.

### WorkBuddy

Install FlowMind as a WorkBuddy MCP server:

```bash
flowmind install workbuddy
```

Install WorkBuddy and initialize FlowMind config in one command:

```bash
flowmind install workbuddy \
  --flowmind-home /absolute/path/to/flowmind-home \
  --flowmind-config config/flowmind-config-package.example.md
```

If WorkBuddy uses a custom MCP config path:

```bash
flowmind install workbuddy --config /absolute/path/to/workbuddy-mcp.json
```

Manual config example: [config/workbuddy-mcp-config.example.json](config/workbuddy-mcp-config.example.json).

## Common Workflows

| Goal | Command |
| --- | --- |
| Load local knowledge and inspect learned assets | `flowmind learn --assets --json` |
| Query logs or trace chains | `flowmind process --skill log-audit "query traceId abc123"` |
| Review code with fixed rules | `flowmind process --skill code-review "review the staged changes"` |
| Analyze design and implementation flow locally | `flowmind analyze "summarize local design and code flow" --offline` |
| Validate data logic | `flowmind process --skill data-logic-validation "check order data consistency"` |
| Run guarded workflows | `flowmind workflow --chain follow-up-chain.json` |

FlowMind can run without an AI provider for deterministic local analysis and demos. Real log, database, document, and deployment skills need the matching MCP resources or adapters configured.

## Automatic Learning

FlowMind stores explicit corrections as local reusable state:

```bash
flowmind process --skill log-audit "query traceId abc123"
flowmind "next time use a table"
```

The next similar request can reuse that formatting preference. Skill choices are learned too:

```bash
flowmind process --skill offline-design-analysis "analyze the contract limit validation flow"
```

Later similar analysis requests prefer the learned route.

## Local State

FlowMind reads and writes local state under:

```text
FLOWMIND_HOME/.flowmind
```

If `FLOWMIND_HOME` is not set, it uses your user home directory. Files that may contain credentials or workflow state are written with private permissions on POSIX systems.

## More

- Full integration guide: [docs/integration-guide.md](docs/integration-guide.md)
- Skill catalog: [docs/skills-catalog.md](docs/skills-catalog.md)
- Security model: [docs/security-model.md](docs/security-model.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
