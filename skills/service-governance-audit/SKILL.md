---
name: service-governance-audit
description: Audit microservice discovery, instances, health, topology, and governance policies across Alibaba Cloud MSE, Huawei Cloud CSE, and Baidu Cloud MSE/CSM. Use for service governance reviews, health checks, policy inventories, topology inspection, and pre-change evidence collection.
---

# Service Governance Audit

Run read-only governance inspection before diagnosis or policy changes.

## Workflow

1. Resolve the `serviceGovernance` resource binding and active provider.
2. Require environment and provider scope; include service, region, project, engine, or namespace when known.
3. Query services, instances, health, topology, and governance policies.
4. Report missing instances, unhealthy instances, and missing policy evidence.
5. Never create, update, or delete governance policies.

Use requests such as:

```text
服务治理审计 provider=huawei-cse env=uat service=order-service engine=xxx project=xxx
```

Read [references/providers.md](references/providers.md) when configuring provider mappings.
