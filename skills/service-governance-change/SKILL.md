---
name: service-governance-change
description: Preview and apply guarded microservice governance policy creation or updates across Alibaba Cloud MSE, Huawei Cloud CSE, and Baidu Cloud MSE/CSM. Use for throttling, circuit breaking, routing, degradation, retry, fault-tolerance, and allowlist policy changes that require dry-run review and approval-token execution.
---

# Service Governance Change

Apply governance mutations only through FlowMind's guarded workflow.

## Workflow

1. Resolve provider, environment, service, engine/project scope, policy kind, and policy body.
2. Reject delete operations.
3. Call provider preview when `executionMode` is not `execute`.
4. Return a `service-governance-change` next action for dry-run review.
5. Execute create or update only after the workflow approval token matches the reviewed input.
6. Stop on provider errors and preserve execution evidence for audit.

Use requests such as:

```text
更新治理策略 provider=huawei-cse env=uat service=order-service kind=rate-limit policy='{"qps":100}'
```

Read [references/providers.md](references/providers.md) before binding a provider or overriding MCP tool names.
