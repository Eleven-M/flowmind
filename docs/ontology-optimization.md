# FlowMind Ontology 优化路线

FlowMind 的 Ontology 演进采用“先盘点、再建模、后治理”的方式。当前版本只启用 **P0 只读资产盘点能力**；P1 及之后的能力作为后续 backlog 沉淀，不改变现有运行行为。

## 当前状态

| 阶段 | 状态 | 说明 |
 | --- | --- | --- |
| P0 | 已启用 | Skill、组件、资源、结果契约、实体存储的机器可读盘点与诊断 |
| P1 | 待启用 | Ontology Core schema、canonical ID、关系图谱、本地 graph store |
| P2 | 待启用 | 核心 skill 的实体和关系抽取 |
| P3 | 待启用 | Skill 执行前注入本体上下文、变更影响、数据风险和 Workflow guard |
| P4 | 待启用 | Ontology MCP 查询 / impact 工具 |
| P5 | 待启用 | 每个 skill 声明 reads / writes / produces / approval policy |
| P6 | 待启用 | 公司级 Registry、ACL、审批、版本化和审计 |

## P0 能力

P0 不写入新的业务语义，也不修改现有 skill 结果。它把已有运行时资产转换成稳定 JSON：

```bash
flowmind ontology inventory --json
flowmind ontology validate
flowmind doctor --ontology
```

也可以导出文件：

```bash
flowmind ontology inventory --json --output flowmind-ontology-inventory.json
```

Inventory 包含：

- Skill 清单：名称、分类、组件依赖、运行时依赖、ready / needs-binding / disabled 状态。
- Component 清单：组件类型、required capabilities、active provider、MCP server、transport readiness。
- Resource 清单：资源名、组件类型、MCP server、默认环境、环境名、配置键名；不导出 endpoint、token、header 等值。
- MCP server 清单：名称、transport 类型、是否配置；不导出 URL、command args 或凭证。
- Skill result contract：当前版本 `1.1`，以及是否声明 input/output schema。
- Entity storage 快照统计：当前实体数量和类型。

`doctor --ontology` 会额外检查：

1. Inventory schema 是否有效。
2. Skill contract version 和 schema 覆盖率。
3. Component capabilities 是否完整。
4. Resource binding 缺口。
5. Entity memory 是否初始化以及当前实体统计。

## P0 安全边界

Inventory 是只读结构化视图，不做远程探测，不导出敏感值。

以下内容只输出结构性信息，不输出值：

- resource config 中的环境配置
- provider config
- MCP transport URL、headers、args
- learned binding 凭证

后续如果增加 `ontology export` 或中心 Registry sync，也必须延续这条边界。

## P1 待启用：Ontology Core

目标是最小可用图谱模型，而不是一次性覆盖公司所有业务对象。

建议新增：

```text
core/ontology/schema.js
core/ontology/identity.js
core/ontology/graph-store.js
core/ontology/extraction.js
core/ontology/validator.js
core/ontology/query.js
```

第一版实体：

```text
Service
Environment
Pipeline
Deployment
Api
Document
DatabaseTable
RedisNamespace
LogStore
Trace
Change
RiskFinding
Team
Owner
SkillRun
WorkflowRun
```

第一版关系：

```text
Service deployedTo Environment
Service hasPipeline Pipeline
Pipeline produces Deployment
Service exposesApi Api
Api documentedBy YApiDoc
Service writesTo DatabaseTable
Service readsFrom DatabaseTable
Service usesCache RedisNamespace
Service producesLog LogStore
Trace belongsTo Service
Change impacts Entity
Service ownedBy Team
RiskFinding targets Entity
```

每个实体和关系必须有：

```text
canonical id
type
source
confidence
observedAt
evidence
```

低置信度数据进入 `uncertain` 或 `candidate` 状态，不直接进入 canonical graph。

## P2 待启用：核心数据接入

按 skill 建立独立 extractor：

| Skill | 抽取目标 |
| --- | --- |
| `auto-flow` | Service / Pipeline / Environment / Deployment |
| `log-audit`、`sls-log-audit` | Trace / Service / LogStore |
| `yapi-sync-interface` | Api / YApiDoc / Service |
| `yuque-sync-design` | Document / Service / Team |
| `change-impact-review` | Change / Api / DatabaseTable / RedisNamespace / Document |
| `data-risk-audit` | DatabaseTable / RedisNamespace / RiskFinding |
| `service-governance-*` | Service / GovernancePolicy / Environment |

Skill result 建议增加：

```json
{
  "contractVersion": "1.1",
  "data": {
    "ontology": {
      "entities": [],
      "relations": [],
      "uncertain": []
    }
  }
}
```

## P3 待启用：Skill 消费本体

重点顺序：

1. `log-audit` 执行前读取 service / env / logstore / project。
2. `change-impact-review` 基于 relation 输出 API、表、缓存、文档、下游服务、测试和 owner。
3. `data-risk-audit` 结合 environment、table criticality、owner 和 impacted services。
4. guarded workflow 基于 entity risk 和 environment 决定审批策略。

安全规则保持不变：

- dry-run 先行。
- execute 必须携带与 reviewed steps 匹配的 approval token。
- critical / prod 写操作必须受保护。
- ontology 只增强 guard，不绕过 allowlist。

## P4 待启用：MCP 查询能力

先暴露只读工具：

```text
flowmind_ontology_schema
flowmind_ontology_search
flowmind_ontology_get_entity
flowmind_ontology_get_relations
flowmind_ontology_related
flowmind_ontology_impact
```

写工具必须单独设计：

```text
flowmind_ontology_upsert_local
flowmind_ontology_review_candidate
flowmind_ontology_submit_candidate
```

公司 canonical 数据发布不做成普通 MCP 写接口，应走显式审批和 Registry API。

## P5 待启用：Skill Ontology Metadata

每个 skill 可逐步补充：

```json
{
  "reads": ["Service", "Pipeline"],
  "writes": [],
  "produces": ["Deployment"],
  "risk": "high",
  "approval": "required_for_execute",
  "allowedEnvironments": ["test", "uat", "prod"],
  "requiredComponents": ["workflow"]
}
```

建议放置在 `skills/<name>/ontology.json`，避免继续扩大 `SKILL.md` 解析器的职责。

## P6 待启用：公司级 Registry

当本地本体质量稳定后，再引入公司级中心 Registry：

```text
FlowMind Local Graph
  -> candidate
  -> review
  -> Company Registry approval
  -> canonical graph
  -> FlowMind instances sync
```

Registry 需要：

- schema versioning
- canonical entity registry
- ownership registry
- policy registry
- conflict resolution
- ACL
- audit log
- sync API

第一阶段可以用 Git + JSON/YAML registry，不必先引入图数据库。

## 启用规则

后续每个阶段启用前建议满足：

1. P0 inventory 通过 `flowmind ontology validate`。
2. 上一阶段测试全绿。
3. 新增数据都有 source、confidence、observedAt。
4. 本地能力先完成 dry-run 和兼容迁移。
5. 公司级共享数据必须经过显式审批。
6. 不导出、不发送凭证和生产敏感值。
