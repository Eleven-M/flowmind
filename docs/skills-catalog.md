# FlowMind Skills Catalog

This catalog separates skills that work with local inputs from skills that require provider, MCP, or internal platform configuration.

## Maturity Levels

- Stable: covered by tests and suitable for normal use
- Beta: usable, but provider behavior may vary
- Integration: depends on external MCP servers, credentials, or internal systems

## Core Skills

| Skill | Purpose | Works out of the box | Configuration | Maturity |
| --- | --- | --- | --- | --- |
| `log-audit` | Parse and structure log or trace investigation requests | Demo only | Log provider or MCP log adapter for real queries | Stable |
| `code-review` | Run repeatable code review checks | Yes, for local text/repo context | Optional team standards | Stable |
| `code-review-audit` | Security and pre-merge review workflow | Yes, for local code context | Optional project rules | Stable |
| `data-validation` | Validate business data from structured context | Partial | Database or Redis adapters for live checks | Beta |
| `data-logic-validation` | Validate SQL, Redis, and code-level data paths | Partial | Database, Redis, and repo context | Beta |
| `learning-feedback` | Capture explicit user feedback for later reuse | Yes | Local FlowMind state | Stable |
| `learning-engine` | Inspect or manage learning behavior | Yes | Local FlowMind state | Stable |
| `resource-bind` | Save provider/MCP/resource bindings by business context | Yes | User-provided endpoints or tokens | Stable |
| `change-impact-review` | Review impact of code and API changes | Yes | Repo context | Stable |

## Documentation and Reporting

| Skill | Purpose | Works out of the box | Configuration | Maturity |
| --- | --- | --- | --- | --- |
| `api-sync` | Prepare API documentation sync actions | Partial | API doc provider | Integration |
| `yapi-sync-interface` | Sync controller/interface docs to YApi | No | YApi MCP or token binding | Integration |
| `yuque-sync-design` | Sync design docs to Yuque | No | Yuque MCP or token binding | Integration |
| `knowledge-ops` | Save or update knowledge artifacts | Partial | Knowledge provider for remote storage | Beta |
| `report-insights` | Extract report highlights | Yes, for local content | Optional report provider | Beta |
| `build-report` | Summarize build output | Yes | Build logs | Beta |
| `test-report` | Summarize test output | Yes | Test logs | Beta |
| `coverage-report` | Summarize coverage output | Yes | Coverage files | Beta |
| `archive-change` | Materialize completed change archives | Yes | Local repo write access | Stable |

## Operations and Workflow

| Skill | Purpose | Works out of the box | Configuration | Maturity |
| --- | --- | --- | --- | --- |
| `auto-flow` | Run deployment or release automation | No | Friday/Auto Flow MCP binding | Integration |
| `git-review` | Review repository or commit risk | Partial | Local repo or project Git provider | Beta |
| `project-review` | Project-level review workflow | Partial | Repo/project metadata | Beta |
| `sls-log-audit` | SLS-specific log investigation | No | Alibaba Cloud SLS adapter or binding | Integration |
| `data-risk-audit` | Audit high-risk data operations | Partial | Database/Redis context | Beta |

## Service Governance

| Skill | Purpose | Works out of the box | Configuration | Maturity |
| --- | --- | --- | --- | --- |
| `service-governance-audit` | Read-only governance policy audit | No | Governance MCP adapter | Integration |
| `service-governance-diagnosis` | Diagnose throttling, circuit breaking, routing, retry, or degradation policy state | No | Governance MCP adapter | Integration |
| `service-governance-change` | Preview and apply guarded governance changes | No | Governance MCP adapter and approval-token workflow | Integration |

## Demo Scenarios

These commands do not require provider credentials:

```bash
flowmind demo log-audit
flowmind demo code-review
flowmind demo workflow
```

Use them as smoke tests before configuring real integrations.
