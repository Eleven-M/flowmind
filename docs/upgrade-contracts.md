# FlowMind Upgrade Contracts

This document describes the upgraded capability surface for the current priority set:

- `3` MCP exposure and platformization
- `7` Report skill family
- `8` Knowledge operations
- `9` Data risk analysis
- `10` Change impact review

Use it when you need the stable output contract for automation, or when you want to chain the new skills together instead of treating them as isolated tools.

## Scope

This page covers:

- The structured outputs for the new and upgraded skills
- The follow-up action fields exposed by those skills
- The recommended chaining patterns between them
- The MCP task model that now wraps long-running executions

## Common Result Model

FlowMind now has three contract layers that matter for automation:

1. Skill-level payloads returned by individual skills
2. Runtime envelopes returned by `flowmind.process(...)`
3. MCP task wrappers returned by async MCP tools

### Skill-level `result`

Successful skill execution returns:

```json
{
  "type": "result",
  "success": true,
  "skill": "skill-name",
  "message": "Human-readable summary",
  "data": {},
  "input": "original input",
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

### Skill-level `error`

Recoverable blockers and execution failures now use a first-class error envelope instead of a success payload with hints mixed in:

```json
{
  "type": "error",
  "success": false,
  "skill": "skill-name",
  "message": "What blocked the action",
  "data": {
    "kind": "missing-component|missing-parameter|invalid-input|not-resolved|execution-failed",
    "retryable": true,
    "retryHints": [],
    "bindingHint": {}
  },
  "input": "original input",
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

Interpretation rules:

- `type: "error"` means the requested action did not complete
- `retryable: true` means the user or caller can usually resolve the issue with a follow-up action
- `kind` is the machine-facing reason category and should be preferred over parsing `message`

Current standard `kind` values:

- `missing-component`: required adapter or backend not configured
- `missing-parameter`: required user input missing, such as `repo=<namespace>`
- `invalid-input`: input shape is wrong or missing the required statement/path/body
- `not-resolved`: a target could not be resolved from fuzzy input, such as deployment pipeline lookup
- `execution-failed`: the skill tried to run and the downstream execution failed

### Learning response

Explicit learning capture still uses a dedicated envelope:

```json
{
  "type": "learning",
  "success": true,
  "learningType": "correction|preference|scene_mapping",
  "record": {},
  "message": "Learning saved",
  "data": {},
  "input": "original input",
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

### Runtime envelope

`flowmind.process(...)` wraps successful results with runtime metadata:

```json
{
  "type": "result",
  "success": true,
  "data": {
    "type": "result",
    "success": true,
    "skill": "skill-name",
    "message": "Human-readable summary",
    "data": {}
  },
  "metadata": {
    "skill": "skill-name",
    "duration": 123,
    "skillRoute": "rules|ai|ai+rules|explicit|ai-status|ai-only",
    "aiEnhanced": false
  },
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

If the selected skill returns a contract error, the runtime now preserves that as a top-level error envelope and still attaches `metadata`:

- do not assume `flowmind.process(...)` always returns `type: "result"`
- do inspect `metadata.skill` and `metadata.skillRoute` on both success and error paths

The contract changes in this upgrade wave are concentrated in `data`.

Common patterns added in this wave:

- `retryHints`: what to do when the current run cannot proceed safely
- `bindingHint`: how to configure the missing backend or MCP binding
- `automationCandidates`: which follow-up skills make sense next
- `nextActions`: structured next-step suggestions after a successful action

### `bindingHint` convention

When present, `bindingHint` is the machine-readable bridge between a failure and the likely remediation step.

Common fields:

```json
{
  "kind": "mcp-binding|resource-binding",
  "message": "Human-readable setup hint",
  "suggestedCommand": "flowmind \"绑定...\"",
  "missing": ["project", "logstore"]
}
```

Rules:

- `message` is for the user
- `suggestedCommand` is the preferred runnable remediation
- `missing` lists the unresolved fields when the system can identify them
- callers should preserve the full object, not just flatten the command string

### `metadata` convention

Runtime `metadata` is separate from skill `data.metadata`.

- runtime `metadata` describes how FlowMind processed the request
- skill `data.metadata` is owned by the skill and describes business output, such as SQL metadata previews
- callers should not merge these two objects blindly

## Skill Contracts

### `report-insights`

Primary purpose:

- Summarize build history
- Summarize unit-test history
- Summarize coverage history

Primary input pattern:

```text
构建报告 job=retail-service limit=5
测试报告 job=retail-service
覆盖率报告 job=retail-service
```

Structured fields:

```json
{
  "action": "build|test|coverage",
  "args": {
    "action": "build|test|coverage",
    "jobName": "retail-service",
    "limit": 5
  },
  "summary": {
    "total": 2,
    "items": [
      {
        "id": "1",
        "name": "retail-service",
        "status": "SUCCESS",
        "branch": "master"
      }
    ],
    "statusCounts": {
      "SUCCESS": 1,
      "FAILED": 1
    },
    "failed": 1,
    "succeeded": 1
  },
  "automationCandidates": [
    {
      "skill": "change-impact-review",
      "reason": "Recent failed report items detected",
      "suggestedInput": "变更影响 repo=retail-service"
    },
    {
      "skill": "archive-change",
      "reason": "Capture report evidence in a release/change archive",
      "suggestedInput": "归档检查 name=retail-service"
    }
  ]
}
```

Failure or missing-binding additions:

- `retryHints`
- `bindingHint`
- `availableComponents.report`

Wrapper skills:

- `build-report`
- `test-report`
- `coverage-report`

These wrappers keep the same output shape and only force the report action.

### `knowledge-ops`

Primary purpose:

- Search reusable knowledge
- List knowledge repositories
- Save local markdown into a knowledge base
- Update an existing knowledge entry
- Create a local runbook template

Primary input pattern:

```text
搜索知识 keyword=发布回滚
保存知识 path=docs/runbook.md repo=team/ops
更新知识 path=docs/runbook.md repo=team/ops slug=rollback-guide
runbook 模板 path=docs/runbook.md title=发布回滚
```

Structured fields:

```json
{
  "action": "search|list|save|update|template",
  "summary": {
    "total": 1,
    "items": [
      {
        "id": "doc-1",
        "title": "发布回滚手册",
        "type": "markdown"
      }
    ]
  },
  "namespace": "team/ops",
  "slug": "rollback-guide",
  "deposition": {
    "mode": "save|update",
    "sourcePath": "docs/runbook.md",
    "namespace": "team/ops",
    "slug": "rollback-guide",
    "title": "发布回滚手册"
  },
  "nextActions": [
    {
      "skill": "knowledge-ops",
      "reason": "Review or update the saved entry later",
      "suggestedInput": "更新知识 path=docs/runbook.md repo=team/ops slug=rollback-guide"
    }
  ]
}
```

Validation rules added in this wave:

- `save` and `update` require `repo=<namespace>` unless `defaultNamespace` is configured
- missing namespace returns `type: "error"` with `retryHints` and `bindingHint`
- missing knowledge backend returns `bindingHint` directly

### `data-risk-audit`

Primary purpose:

- Judge SQL execution risk
- Judge Redis access risk
- Optionally attach live previews from the `databaseQuery` backend

Primary input pattern:

```text
数据风险 sql: DELETE FROM orders
数据风险 sql: SELECT * FROM orders
Redis风险 redis: KEYS *
```

Structured fields:

```json
{
  "action": "sql|redis",
  "statement": "SELECT * FROM orders",
  "command": "KEYS *",
  "target": {
    "project": "retail-service",
    "environment": "uat",
    "sourceId": "source-1",
    "databaseId": "db-1",
    "database": "retail"
  },
  "availableComponents": {
    "databaseQuery": true
  },
  "risk": {
    "score": 4,
    "level": "medium"
  },
  "findings": [
    {
      "severity": "medium",
      "issue": "SELECT statement has no LIMIT"
    }
  ],
  "recommendations": [
    "Prefer bounded queries with WHERE and LIMIT."
  ],
  "explain": {
    "attempted": true,
    "sql": "EXPLAIN SELECT * FROM orders",
    "summary": {
      "totalRows": 1,
      "warnings": [
        "Full table scan detected in EXPLAIN output."
      ]
    }
  },
  "metadata": {
    "attempted": true,
    "referencedTables": [
      "orders"
    ],
    "matchedTables": [
      {
        "name": "orders",
        "exists": true
      }
    ],
    "sampledFields": [
      {
        "name": "id",
        "type": "bigint"
      }
    ]
  },
  "retryHints": [
    "Execute high-risk SQL in non-production first."
  ]
}
```

Behavior notes:

- `explain` and `metadata` are only attempted when risk is not low
- metadata preview depends on resolvable database target information
- Redis runs still return structured `retryHints`, even if no live backend is available

### `change-impact-review`

Primary purpose:

- Analyze changed files instead of only scanning rules
- Classify affected domains
- Recommend regression scope and follow-up skills

Primary input pattern:

```text
变更影响
影响审查 repo=/workspace/service-a
变更影响 range=HEAD~3..HEAD
```

Structured fields:

```json
{
  "repoDir": "/workspace/service-a",
  "changedFiles": [
    {
      "path": "src/controller/OrderController.java",
      "exists": true,
      "domains": [
        "api"
      ],
      "markers": [
        "http-endpoint"
      ],
      "summary": "endpoint change"
    }
  ],
  "impactedDomains": [
    {
      "domain": "api",
      "files": 1
    }
  ],
  "risk": {
    "level": "medium",
    "score": 4,
    "reasons": [
      "API surface changed"
    ]
  },
  "recommendations": [
    "Review request/response compatibility and sync API docs if controller or contract files changed."
  ],
  "regressionChecklist": [
    "Smoke test the main affected user flow.",
    "Run API contract and controller-level regression checks."
  ],
  "syncRecommendations": [
    {
      "type": "api-doc",
      "skill": "yapi-sync-interface",
      "recommended": true,
      "configured": true,
      "reason": "API-related files or endpoint markers changed"
    }
  ],
  "relatedSkills": [
    "yapi-sync-interface",
    "data-risk-audit"
  ],
  "automationCandidates": [
    {
      "skill": "yapi-sync-interface",
      "configured": true,
      "reason": "API-related files or endpoint markers changed",
      "suggestedInput": "同步 YApi path=/workspace/service-a"
    }
  ],
  "inferredSource": {
    "matched": true,
    "project": "service-a",
    "environment": "uat"
  }
}
```

Behavior notes:

- changed files are resolved in this order:
  1. explicit `context.changedFiles`
  2. explicit commit range
  3. dirty worktree
  4. last commit
  5. repo file discovery fallback
- `automationCandidates` is the bridge from review to execution

## Recommended Chaining

### Pattern 1: Report Failure to Root Cause

Use this chain when a build, test, or coverage summary shows recent failures:

1. `report-insights`
2. `change-impact-review`
3. `data-risk-audit` if DB or cache files are involved
4. `archive-change` after the release evidence is stable

Reasoning:

- report tells you that a failure exists
- impact review narrows where to look
- risk audit checks data-facing blast radius
- archive captures the evidence trail

### Pattern 2: Change Review to Documentation Sync

Use this chain when API or design touchpoints changed:

1. `change-impact-review`
2. `yapi-sync-interface` when `syncRecommendations` contains API sync
3. `yuque-sync-design` when `syncRecommendations` contains design sync
4. `knowledge-ops` if the docs should become reusable runbook content

### Pattern 3: Runbook First, Then Deposition

Use this chain when the team needs a repeatable operational document:

1. `knowledge-ops` with `template`
2. Edit the generated markdown
3. `knowledge-ops` with `save`
4. `knowledge-ops` with `update` for later revisions

### Pattern 4: SQL Safety Before Release

Use this chain when repositories, migrations, mappers, or cache layers changed:

1. `change-impact-review`
2. `data-risk-audit`
3. `report-insights` to confirm downstream verification signal

## MCP Capability Surface

The MCP server now publishes a more stable capability surface:

- `flowmind_capability_catalog`
- `flowmind_list_skills`
- `flowmind_get_skill`

These are discovery tools.
For asynchronous execution it also publishes:

- `flowmind_start_task`
- `flowmind_task_status`
- `flowmind_list_tasks`
- `flowmind_cancel_task`

Task status contract:

```json
{
  "task": {
    "id": "task-1",
    "tool": "flowmind_skill_change-impact-review",
    "status": "queued|running|succeeded|failed|cancelled",
    "progress": {
      "stage": "running",
      "percent": 50,
      "message": "Running flowmind_skill_change-impact-review"
    },
    "createdAt": "2026-07-07T00:00:00.000Z",
    "startedAt": "2026-07-07T00:00:01.000Z",
    "completedAt": "2026-07-07T00:00:02.000Z",
    "cancellation": null,
    "error": null,
    "result": {}
  }
}
```

Current limit:

- queued tasks can be cancelled
- running tasks are not yet interruptible
- progress can now include skill-level stage updates when the skill reports them

## Practical Integration Rules

If you are building on top of FlowMind programmatically:

- route on `skill` and `data.action`, not on `message`
- route on `type`, `data.kind`, and `metadata.skill` before falling back to natural-language parsing
- treat `retryHints`, `bindingHint`, `automationCandidates`, and `nextActions` as first-class fields
- persist `risk`, `summary`, and `deposition` instead of reparsing natural language
- treat `retryable` as the caller's first checkpoint for whether to offer a fix-and-retry flow
- keep runtime `metadata` separate from skill business `data`
- use MCP async tasks for long-running or user-visible workflows

## Related Docs

- [upgrade-roadmap.md](upgrade-roadmap.md)
- [guide.md](guide.md)
- [integration-guide.md](integration-guide.md)
