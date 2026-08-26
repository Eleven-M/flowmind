# Proposal: Workflow Service Refactor

## Problem

FlowMind exposes guarded workflow preview, execution, resume, and history through both CLI and MCP entry points. The current entry points each wire the workflow primitives directly, which makes future approval-token, resume, and history changes easier to drift.

## Goals

- Provide a shared workflow service for CLI and MCP callers.
- Keep guarded workflow behavior unchanged.
- Reduce duplicated orchestration code in `bin/flowmind.js` and `mcp/server.js`.

## Non-Goals

- No change to approval-token semantics.
- No change to workflow file format.
- No broad CLI command split in this iteration.

## Risks

- CLI and MCP output shapes must remain backward compatible.
- Resume behavior must keep using persisted workflow history.
