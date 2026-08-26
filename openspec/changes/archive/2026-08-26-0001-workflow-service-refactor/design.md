# Design: Workflow Service Refactor

## Current State

- CLI imports `previewWorkflow`, `executeWorkflow`, `resumeWorkflow`, and `WorkflowHistoryStore` directly.
- MCP imports the same primitives and repeats the same orchestration.

## Target Design

Add `core/workflow-service.js` with a small `WorkflowService` class:

- `preview(chainOrResult)` builds or previews a follow-up chain.
- `execute(chain, options)` delegates guarded execution with the configured history store.
- `resume(executionId, options)` loads history and resumes if found.
- `history(filters)` lists persisted workflow executions.

The service accepts injected dependencies so tests can cover orchestration without running real workflow steps.

## Compatibility

- CLI JSON output remains the raw workflow result.
- MCP tool responses keep their existing content envelope.
- Missing resume records are represented as `{ status: 'not_found', error: ... }`.
