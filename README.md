<div align="center">

# 🧠 FlowMind

### **The AI Agent That Learns How You Work**

*Memory and workflow automation for MCP, Codex, and Claude Code.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm version](https://img.shields.io/npm/v/flowmind.svg)](https://www.npmjs.com/package/flowmind)
[![npm downloads](https://img.shields.io/npm/dw/flowmind.svg)](https://www.npmjs.com/package/flowmind)

[中文](README_CN.md) | [Quick Start](#quick-start) | [Demo](demo/DEMO.md) | [Detailed Guide](docs/guide.md) | [Upgrade Contracts](docs/upgrade-contracts.md) | [Integration](docs/integration-guide.md) | [Changelog](CHANGELOG.md)

</div>

Weekly downloads: 3,280

---

## What It Is

FlowMind is a memory layer for repeatable developer workflows.

Use it when you already have tools and want a better execution surface:

- Route recurring tasks through reusable skills
- Capture explicit feedback and reuse it later
- Run the same workflow from CLI, Codex, or MCP clients

Best-fit use cases today:

- Log and trace investigation
- Code review with fixed standards
- Data validation and internal tool orchestration

## Quick Start

```bash
npm install -g flowmind
flowmind doctor
flowmind skills
flowmind process --skill log-audit "query the latest error logs"
```

If you want Codex-friendly JSON output:

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "查询 traceId abc123 的日志"
```

If you prefer `npx`:

```bash
npx flowmind@latest doctor
npx flowmind@latest skills
```

## Local State

FlowMind stores local config and learning data under `FLOWMIND_HOME/.flowmind`.
If `FLOWMIND_HOME` is not set, it falls back to your home directory.

To import local `SDD-Agent` resources and scene mappings, run:

```bash
flowmind resource --sync-sdd-agent
```

For safety, cross-workspace auto-sync is disabled by default. Initialization only auto-syncs when you explicitly set `FLOWMIND_ENABLE_SDD_AGENT_AUTO_SYNC=1`.

## Why It Works

- Skills provide a stable execution path instead of ad hoc prompts
- Feedback becomes reusable state instead of chat history
- CLI and MCP entrypoints make the workflow scriptable

## A Real Example

```bash
flowmind process --skill log-audit "查询 traceId abc123 的日志"
flowmind "下次用表格格式"
```

On the next similar request, FlowMind can reuse that explicit formatting preference from local learning data.

## Read By Goal

- Need the full product walkthrough: [docs/guide.md](docs/guide.md)
- Need the upgraded skill contracts and chaining patterns: [docs/upgrade-contracts.md](docs/upgrade-contracts.md)
- Need Claude Code, Codex, Cursor, or MCP setup: [docs/integration-guide.md](docs/integration-guide.md)
- Want to see terminal output first: [demo/DEMO.md](demo/DEMO.md)
- Want release history: [CHANGELOG.md](CHANGELOG.md)

## Why This Homepage Is Short

The npm package page works best as an entry page, not as the entire manual.
Detailed usage modes, system explanation, and architecture notes now live in the linked docs.

## Release Notes

Package release details are maintained outside the published README.

## Contributing

PRs are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
