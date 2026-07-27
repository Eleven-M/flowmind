---
name: service-governance-diagnosis
description: Diagnose microservice incidents using service health, instances, topology, and governance policy evidence across Alibaba Cloud, Huawei Cloud, and Baidu Cloud. Use for unhealthy instances, unexpected throttling, circuit breaking, routing errors, cascading failures, and service discovery incidents.
---

# Service Governance Diagnosis

Correlate governance evidence without changing cloud state.

## Workflow

1. Resolve the configured `serviceGovernance` provider.
2. Query service health, topology, instances, and active policies in parallel.
3. Identify unhealthy instances, empty discovery results, missing governance protection, and dependency risks.
4. Recommend evidence collection or a guarded policy preview.
5. Keep all diagnosis operations read-only.

Use requests such as:

```text
服务治理故障诊断 provider=aliyun-mse env=prod service=payment-service
```

Read [references/providers.md](references/providers.md) for provider-specific scope fields.
