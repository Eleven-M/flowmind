# FlowMind Detailed Guide

This guide is the long-form companion to the npm homepage.
Use it when you want the fuller product explanation, usage modes, and system model.

## Core Idea

FlowMind is designed for repeatable developer operations.
Instead of rewriting the same instructions, you route work through a skill, run it through configured adapters or MCP-compatible providers, and keep explicit feedback as reusable local state.

The shortest model is:

1. Receive a request
2. Select a skill
3. Execute through adapters or integrations
4. Capture explicit feedback
5. Reuse that feedback on similar requests later

## Usage Modes

### CLI

The default mode is direct CLI usage:

```bash
flowmind "查询 traceId abc123 的日志"
flowmind "审查代码质量"
flowmind process --skill log-audit "查询最近1小时的错误日志"
```

Use this mode when you want the fastest path with minimal setup.

If you want to import local `SDD-Agent` resources and scene mappings into FlowMind, do it explicitly:

```bash
flowmind resource --sync-sdd-agent
```

Inspect learned feedback, skill rules, scenes, resource bindings, and local material package metadata with:

```bash
flowmind learn --assets
flowmind learn --assets --skill log-audit --json
```

Guarded follow-up workflows can be resumed from local history:

```bash
flowmind workflow --chain follow-up-chain.json
flowmind workflow --chain follow-up-chain.json --execute --approval-token <token>
flowmind workflow-history
flowmind workflow-history --status failed --resumable
flowmind workflow-resume --execution-id <id> --approval-token <token>
```

For safety, cross-workspace auto-sync is disabled by default. Initialization only auto-syncs when you explicitly set `FLOWMIND_ENABLE_SDD_AGENT_AUTO_SYNC=1`.

### Codex-Friendly JSON

If another tool needs machine-readable output:

```bash
flowmind-codex "查询最近1小时的错误日志"
flowmind-codex --skill log-audit "查询 traceId abc123 的完整链路"
flowmind process --json "查询日志"
```

Use this mode for automation, scripts, or CI.

### MCP Client Integration

FlowMind can be exposed as an MCP server for tools such as Claude Code, Cursor, Windsurf, or Cline.
Setup details live in [integration-guide.md](integration-guide.md).

### AI-Enhanced Routing

FlowMind can sit in front of model providers and use them for intent understanding, parameter extraction, skill selection, and result summarization.
That improves handling for more natural or multi-step requests, while still keeping a skill-based execution path.

## How It Works

### 1. Skill Routing

Each request is matched to a reusable skill.
That gives FlowMind a stable execution path instead of relying on a fresh prompt every time.

### 2. Adapter Execution

Skills call adapters or providers for the actual work, such as logs, databases, API docs, knowledge bases, or workflow systems.

### 3. Learning From Explicit Feedback

FlowMind focuses on explicit learning.
For example:

```text
User: "Use a table next time"
FlowMind: records the preference
```

On later similar requests, that preference can be reapplied from local learning data.

### 4. Local Reuse

The learning layer is meant to reduce repetition, not hide work.
You can inspect the available skills, control execution explicitly, and keep the system scriptable.

Explicit skill choices are also route-learning signals. A successful `process --skill <name>` stores a request-to-skill mapping, while an interactive correction such as `this should use <name>` binds the previous request. Exact or highly similar later requests with the same action family reuse that route before model and keyword selection. Learned routes are visible through `flowmind learn --assets --json` and travel with learning bundles.

Routing distinguishes analysis from execution: analyzing, explaining, or summarizing a business flow is document/code analysis; executing, deploying, running, or checking a pipeline is workflow automation.

The TUI header now exposes skill readiness before execution. `✓` means usable, `⚠` means an MCP binding or Git repository context is missing, and `○` means explicitly disabled. The `Bind:` line names each `skill -> missing component`, such as `auto-flow->workflow`. MCP readiness is a local configuration check and does not send remote health probes while rendering.

### 5. Offline Analysis Without a Model

`offline-design-analysis` reads local learning records, Markdown, HTML/Lake, Lakebook, and common source-code files. It retrieves evidence from a natural-language request and returns a cited design flow:

```bash
flowmind analyze "summarize historical material and the code design flow" --offline --json
```

This mode performs no network access, never executes analyzed code, and reports confidence and limitations explicitly.

It is not the default analysis skill when a model is available. Ordinary analysis requests remain in AI routing; offline analysis is selected only with no available model, explicit offline/no-AI wording, or explicit skill selection.

## Architecture Summary

FlowMind is organized around four layers:

1. CLI and MCP entrypoints
2. Skill routing and execution
3. Provider and adapter integrations
4. Learning and preference reuse

Common component families include:

- `logService`
- `databaseManager`
- `databaseQuery`
- `redisMonitor`
- `apiDoc`
- `knowledgeBase`
- `workflow`
- `report`

The practical goal is configuration-based switching instead of rewriting skill logic for each backend.

## Best-Fit Use Cases

### Log and Trace Investigation

```bash
flowmind "排查线上问题 traceId abc123"
```

Best when the same investigation pattern happens repeatedly.

### Code Review

```bash
flowmind "代码审查先检查安全漏洞，再检查代码质量"
flowmind "审查这个 PR"
```

Best when the team has a stable review sequence or standards.

### Data Validation

```bash
flowmind "验证订单数据"
flowmind "检查金额计算逻辑"
```

Best when validation repeatedly crosses logs, database state, and business logic.

## When FlowMind Is a Good Fit

FlowMind is a strong fit when:

- You already have internal tools and want a consistent execution surface
- You repeat the same categories of investigation or review
- You want feedback to persist outside chat history

FlowMind is a weaker fit when:

- You only need a generic chat assistant
- Every task is one-off and never repeated
- You expect full autonomous engineering without configured tools or skills

## Where To Go Next

- Demo walkthrough: [../demo/DEMO.md](../demo/DEMO.md)
- Integration setup: [integration-guide.md](integration-guide.md)
- Upgrade contracts: [upgrade-contracts.md](upgrade-contracts.md)
- Release history: [../CHANGELOG.md](../CHANGELOG.md)
