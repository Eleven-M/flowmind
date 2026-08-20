# Multi-cloud Service Governance

## Why

FlowMind already covers logs, data, deployments, and report automation, but it does not yet provide a consistent abstraction for service discovery, health, topology, and policy operations across Alibaba Cloud MSE, Huawei Cloud CSE, and Baidu Cloud MSE/CSM.

## What Changes

- Add a `serviceGovernance` component type and adapter contract.
- Add configurable MCP provider mappings for Alibaba Cloud, Huawei Cloud, and Baidu Cloud.
- Add audit, diagnosis, and guarded change skills.
- Integrate resource binding, MCP catalog exposure, initializer support, and tests.

## Problem

FlowMind can inspect logs, data, deployments, and reports, but cannot model or operate microservice governance consistently across Alibaba Cloud MSE, Huawei Cloud CSE, and Baidu Cloud MSE/CSM.

## Value

- Add provider-neutral service, instance, topology, policy, and health inspection.
- Correlate governance state with observability evidence.
- Preview and apply governance policy changes through the existing approval-token workflow.

## Scope

- New `serviceGovernance` component type and adapter contract.
- Configurable MCP providers for Alibaba Cloud, Huawei Cloud, and Baidu Cloud.
- Audit, diagnosis, and change skills.
- Resource binding, MCP catalog, initializer, and tests.

## Risks

- Provider tool names and payloads vary; mappings must remain configuration-overridable.
- Production policy mutations can affect traffic; execution must require dry-run approval.
- No live cloud credentials are available in this workspace, so provider integration is contract-tested with mocks.

## Dependencies

- Existing MCP transport and component registry.
- Existing guarded workflow dry-run and approval token.
- Cloud-specific MCP server or an OpenAPI-to-MCP bridge configured by the operator.
