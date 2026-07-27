<div align="center">

# 🧠 FlowMind

### **The AI Agent That Learns How You Work**

*Memory and workflow automation for MCP, Codex, and Claude Code.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![npm version](https://img.shields.io/npm/v/flowmind.svg)](https://www.npmjs.com/package/flowmind)
[![npm downloads](https://img.shields.io/npm/dw/flowmind.svg)](https://www.npmjs.com/package/flowmind)

[中文](README_CN.md) | [Quick Start](#quick-start) | [Demo](#configuration-free-demo) | [Skills](docs/skills-catalog.md) | [Integration](docs/integration-guide.md) | [Security](SECURITY.md) | [Changelog](CHANGELOG.md)

</div>

---

## What It Is

FlowMind is a memory layer for repeatable developer workflows.

Use it when you already have tools and want a better execution surface:

- Route recurring tasks through reusable skills
- Capture explicit feedback and reuse it later
- Run the same workflow from CLI, Codex, or MCP clients
- Audit and change microservice governance across Alibaba Cloud, Huawei Cloud, and Baidu Cloud through guarded workflows

Best-fit use cases today:

- Log and trace investigation
- Code review with fixed standards
- Data validation and internal tool orchestration

## Strong Features

- Reusable skill routing turns repeated work into one-command workflows instead of prompt rewrites
- Guarded workflow execution adds dry-run review, approval tokens, and resumable follow-up chains
- Multi-cloud service governance supports audit, diagnosis, and policy changes with provider-aware rollback previews
- Local workflow history preserves execution state so interrupted chains can be resumed instead of restarted
- MCP exposure keeps FlowMind usable from CLI, Codex, and other integrated clients

## Quick Start

```bash
npm install -g flowmind
flowmind doctor
flowmind demo log-audit
flowmind demo code-review
flowmind skills
flowmind process --skill log-audit "query the latest error logs"
```

Guarded follow-up workflows can be reviewed, executed, listed, and resumed from the CLI:

```bash
flowmind workflow --chain follow-up-chain.json
flowmind workflow --chain follow-up-chain.json --execute --approval-token <token>
flowmind workflow-history
flowmind workflow-history --status failed --resumable
flowmind workflow-resume --execution-id <id> --approval-token <token>
```

If you want Codex-friendly JSON output:

```bash
flowmind-codex skills
flowmind-codex --skill log-audit "查询 traceId abc123 的日志"
```

If you prefer `npx`:

```bash
npx flowmind@latest doctor
npx flowmind@latest demo log-audit
npx flowmind@latest skills
```

Runtime supports Node.js 18 and newer. Contributor tooling runs best on Node.js 20.19 or newer.

## Configuration-Free Demo

![FlowMind terminal demo](demo/flowmind-demo.gif)

Run the built-in mock demo before connecting any provider or MCP server:

```bash
flowmind demo log-audit
flowmind demo code-review
flowmind demo workflow
flowmind demo log-audit --json
```

This shows the shape of a log-audit result without requiring SLS, databases, internal platforms, or AI provider credentials.

## Capability Scope

| Area | Works out of the box | Requires configuration |
| --- | --- | --- |
| Skill discovery | `flowmind skills` | None |
| Mock demo | `flowmind demo log-audit`, `flowmind demo code-review`, `flowmind demo workflow` | None |
| Learning inspection | `flowmind learn --assets` | Local FlowMind state |
| Log, data, docs, workflow skills | Skill routing and result contracts | MCP servers, provider credentials, or adapters |
| Multi-cloud governance | Guarded workflow contracts | Provider-specific MCP governance adapters |

## Local State

FlowMind stores local config and learning data under `FLOWMIND_HOME/.flowmind`.
If `FLOWMIND_HOME` is not set, it falls back to your home directory.

To import local `SDD-Agent` resources and scene mappings, run:

```bash
flowmind resource --sync-sdd-agent
```

To inspect the currently learned skill feedback and local material packages:

```bash
flowmind learn --assets
flowmind learn --assets --skill log-audit --limit 20 --json
```

MCP clients can use `flowmind_learning_assets` for the same sanitized, read-only view.

For safety, cross-workspace auto-sync is disabled by default. Initialization only auto-syncs when you explicitly set `FLOWMIND_ENABLE_SDD_AGENT_AUTO_SYNC=1`.

Files that may contain credentials or workflow state are written with private permissions on POSIX filesystems. See [SECURITY.md](SECURITY.md) and [docs/security-model.md](docs/security-model.md).

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
- Need the skill capability matrix: [docs/skills-catalog.md](docs/skills-catalog.md)
- Need to add a provider or adapter: [docs/provider-adapter-guide.md](docs/provider-adapter-guide.md)
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

Before opening a PR, run:

```bash
npm run quality
npm run audit:prod
```

## License

MIT. See [LICENSE](LICENSE).
