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
- Release history: [../CHANGELOG.md](../CHANGELOG.md)
