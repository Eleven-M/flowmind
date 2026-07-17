# FlowMind 升级契约说明

这份文档说明当前优先升级项的稳定能力面：

- `3` MCP 暴露与平台化
- `7` 报告类 skill
- `8` 知识库操作
- `9` 数据风险分析
- `10` 变更影响审查

如果你要做自动化消费，或者想把这些新 skill 串起来用，而不是把它们当成孤立工具，这页就是面向你的。

## 覆盖范围

本页主要说明：

- 新增和升级 skill 的结构化输出
- skill 输出里新增的后续动作字段
- 推荐的 skill 串联方式
- MCP 异步任务模型

## 通用结果模型

FlowMind 现在有三层和自动化直接相关的契约：

1. 单个 skill 自己返回的 skill 级 payload
2. `flowmind.process(...)` 返回的 runtime 包裹层
3. MCP 异步工具返回的 task 包裹层

### Skill 级 `result`

skill 成功执行时返回：

```json
{
  "type": "result",
  "success": true,
  "skill": "skill-name",
  "message": "给人看的摘要",
  "data": {},
  "input": "原始输入",
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

### Skill 级 `error`

现在，可恢复阻塞和真实执行失败都使用一等 `error` 契约，不再用“成功返回里塞 hint”的方式表达：

```json
{
  "type": "error",
  "success": false,
  "skill": "skill-name",
  "message": "当前为什么没法完成",
  "data": {
    "kind": "missing-component|missing-parameter|invalid-input|not-resolved|execution-failed",
    "retryable": true,
    "retryHints": [],
    "bindingHint": {}
  },
  "input": "原始输入",
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

解释规则：

- `type: "error"` 表示这次请求没有完成
- `retryable: true` 表示用户或上层调用方通常可以通过补配置、补参数、重试来解决
- `kind` 是面向机器的失败原因分类，优先级高于解析 `message`

当前标准 `kind` 值：

- `missing-component`: 依赖的 adapter 或后端没有配置
- `missing-parameter`: 缺少必要参数，比如 `repo=<namespace>`
- `invalid-input`: 输入形状不对，或者缺少必要的 SQL/路径/正文
- `not-resolved`: 模糊输入无法解析成唯一目标，比如部署目标没法映射到 pipeline
- `execution-failed`: skill 已经开始执行，但下游执行失败

### Learning 响应

显式学习捕获仍然使用单独的 envelope：

```json
{
  "type": "learning",
  "success": true,
  "learningType": "correction|preference|scene_mapping",
  "record": {},
  "message": "已保存学习",
  "data": {},
  "input": "原始输入",
  "timestamp": "2026-07-07T00:00:00.000Z"
}
```

### Runtime 包裹层

`flowmind.process(...)` 在成功时会附带 runtime 元信息：

```json
{
  "type": "result",
  "success": true,
  "data": {
    "type": "result",
    "success": true,
    "skill": "skill-name",
    "message": "给人看的摘要",
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

如果被选中的 skill 返回的是契约级 `error`，runtime 现在会保持顶层 `error`，同时继续附带 `metadata`：

- 不要假设 `flowmind.process(...)` 一定返回 `type: "result"`
- 成功和失败两条路径都应该读取 `metadata.skill` 和 `metadata.skillRoute`

这一轮升级的重点变化都集中在 `data` 字段里。

本轮新增的通用字段模式：

- `retryHints`: 当前执行无法安全继续时，下一步该怎么做
- `bindingHint`: 缺少后端或 MCP 绑定时，应该如何补配置
- `automationCandidates`: 当前结果之后最合理的后续 skill
- `nextActions`: 某个动作成功后，推荐继续做的下一步

### `bindingHint` 约定

`bindingHint` 存在时，表示系统已经把“失败原因”和“推荐补救动作”结构化出来了。

常见字段：

```json
{
  "kind": "mcp-binding|resource-binding",
  "message": "给人的补配置提示",
  "suggestedCommand": "flowmind \"绑定...\"",
  "missing": ["project", "logstore"]
}
```

规则：

- `message` 给用户看
- `suggestedCommand` 是优先推荐的可执行补救命令
- `missing` 表示系统已经识别出的缺失字段
- 上层调用方应保留整个对象，而不是只抽出命令字符串

### `metadata` 约定

runtime `metadata` 和 skill 自己 `data.metadata` 不是一回事。

- runtime `metadata` 描述 FlowMind 是怎么处理这次请求的
- skill 的 `data.metadata` 是业务输出的一部分，比如 SQL 元数据预览
- 调用方不要把这两个对象直接无脑合并

## Skill 输出契约

### `report-insights`

核心用途：

- 汇总构建历史
- 汇总单测历史
- 汇总覆盖率历史

典型输入：

```text
构建报告 job=retail-service limit=5
测试报告 job=retail-service
覆盖率报告 job=retail-service
```

关键输出字段：

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

缺配置或不可执行时会额外返回：

- `retryHints`
- `bindingHint`
- `availableComponents.report`

包装 skill：

- `build-report`
- `test-report`
- `coverage-report`

它们只是强制指定 `action`，输出结构和 `report-insights` 保持一致。

### `knowledge-ops`

核心用途：

- 搜索可复用知识
- 列出知识库仓库
- 把本地 markdown 沉淀进知识库
- 更新已有知识条目
- 生成本地 runbook 模板

典型输入：

```text
搜索知识 keyword=发布回滚
保存知识 path=docs/runbook.md repo=team/ops
更新知识 path=docs/runbook.md repo=team/ops slug=rollback-guide
runbook 模板 path=docs/runbook.md title=发布回滚
```

关键输出字段：

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

本轮新增的约束：

- `save` 和 `update` 在没有 `defaultNamespace` 时必须显式传 `repo=<namespace>`
- 缺少 namespace 时返回 `type: "error"`，并附带 `retryHints` 和 `bindingHint`
- 缺少知识库后端时直接返回 `bindingHint`

### `data-risk-audit`

核心用途：

- 判断 SQL 执行风险
- 判断 Redis 访问风险
- 在有 `databaseQuery` 后端时附带实时预览

典型输入：

```text
数据风险 sql: DELETE FROM orders
数据风险 sql: SELECT * FROM orders
Redis风险 redis: KEYS *
```

关键输出字段：

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

行为说明：

- 只有在风险不为 `low` 时才会尝试 `explain` 和 `metadata`
- `metadata` 依赖可解析的数据库目标信息
- Redis 路径即使没有实时后端，也会给出结构化 `retryHints`

### `change-impact-review`

核心用途：

- 从“规则扫描”升级为“改动影响分析”
- 分类 API、数据库、缓存、配置、工作流、知识文档、测试等影响域
- 给出回归范围和后续 skill 建议

典型输入：

```text
变更影响
影响审查 repo=/workspace/service-a
变更影响 range=HEAD~3..HEAD
```

关键输出字段：

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

行为说明：

- 变更文件的解析顺序是：
  1. 显式传入 `context.changedFiles`
  2. 显式提交范围
  3. 当前工作区脏文件
  4. 最近一次提交
  5. 仓库文件扫描兜底
- `automationCandidates` 是从“审查”走向“执行”的桥接字段

## 推荐串联方式

### 模式 1：报告失败到根因分析

适合最近构建、单测或覆盖率出现失败的场景：

1. `report-insights`
2. `change-impact-review`
3. 如果涉及数据库或缓存，再走 `data-risk-audit`
4. 结果稳定后，用 `archive-change` 归档

原因：

- 报告先告诉你失败是否真实存在
- 影响审查帮你缩小定位范围
- 数据风险审查帮你判断数据层爆炸半径
- 归档把证据链留住

### 模式 2：变更审查到文档同步

适合 API 或设计文档触点发生变化的场景：

1. `change-impact-review`
2. `syncRecommendations` 出现 API 同步时，走 `yapi-sync-interface`
3. `syncRecommendations` 出现设计同步时，走 `yuque-sync-design`
4. 如果文档还要沉淀成可复用知识，再走 `knowledge-ops`

### 模式 3：先出 runbook，再做知识沉淀

适合需要形成标准化操作文档的场景：

1. `knowledge-ops` 的 `template`
2. 编辑生成的 markdown
3. `knowledge-ops` 的 `save`
4. 后续版本再用 `update`

### 模式 4：发布前 SQL 安全校验

适合 repository、migration、mapper、cache 层有变更的场景：

1. `change-impact-review`
2. `data-risk-audit`
3. `report-insights` 看下游验证信号是否正常

## MCP 能力面

MCP Server 现在除了基础执行工具，还会暴露更稳定的发现与任务能力：

- `flowmind_capability_catalog`
- `flowmind_list_skills`
- `flowmind_get_skill`

这些用于发现能力。
对于异步执行，还会暴露：

- `flowmind_start_task`
- `flowmind_task_status`
- `flowmind_list_tasks`
- `flowmind_cancel_task`

任务状态结构：

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

当前限制：

- 只能取消 `queued` 状态任务
- `running` 状态任务暂时还不能真正中断
- 进度现在可以包含 skill 主动上报的阶段信息

## 集成时的落地规则

如果你要在程序里消费 FlowMind，建议遵守这些规则：

- 用 `skill` 和 `data.action` 做路由，不要解析 `message`
- 优先使用 `type`、`data.kind`、`metadata.skill` 做路由，不要先回退到自然语言解析
- 把 `retryHints`、`bindingHint`、`automationCandidates`、`nextActions` 当成一等字段
- 把 `risk`、`summary`、`deposition` 直接持久化，不要回退成自然语言再重解析
- 把 `retryable` 当成是否应该给用户展示“修复后重试”流程的第一判断条件
- runtime `metadata` 和 skill 业务 `data` 分开存
- 面向长耗时流程，优先使用 MCP 异步任务工具

## 相关文档

- [upgrade-roadmap.md](upgrade-roadmap.md)
- [guide.zh-CN.md](guide.zh-CN.md)
- [integration-guide.md](integration-guide.md)
