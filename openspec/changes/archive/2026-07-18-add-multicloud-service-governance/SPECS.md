# Specifications

Status: accepted by user instruction to improve FlowMind skills.

## Audit

Given a configured service-governance provider, when a user requests a governance audit, then FlowMind lists services, instances, policies, topology, and health without mutating cloud state.

## Diagnosis

Given governance and optional observability adapters, when a user requests incident diagnosis, then FlowMind correlates unhealthy instances, active policies, topology dependencies, alarms, metrics, and logs into evidence-backed findings.

## Change preview

Given a requested policy mutation, when it has not been explicitly approved, then FlowMind returns a dry-run plan and does not call a mutation tool.

## Change execution

Given the exact reviewed plan and matching approval token, when the guarded workflow executes the change skill, then FlowMind applies only an allowlisted create/update policy operation and returns execution evidence.

## Provider portability

Given Alibaba Cloud, Huawei Cloud, or Baidu Cloud configuration, when the corresponding provider is activated, then the same skill contract works through provider-specific MCP tool mappings.

## Acceptance criteria

- All three skills are discoverable in FlowMind and the MCP capability catalog.
- Provider mappings are configurable and contain no credentials.
- Read operations work without workflow approval.
- Write operations cannot execute outside `executionMode=execute`.
- Full regression and skill validation pass.
