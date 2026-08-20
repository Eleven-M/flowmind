# Learning Assets View

## Problem

FlowMind stores feedback, skill bindings, scenes, resource bindings, and synchronized source files separately. Users cannot inspect the effective learning state and available material packages through one command or MCP tool.

## Value

Provide one read-only, sanitized view of learned skill feedback and local learning materials for troubleshooting, review, and reuse.

## Scope

- Add a learning-assets aggregation API.
- Add CLI JSON and human-readable output.
- Add an MCP query tool.
- Add focused tests and documentation.

## Risks and dependencies

- Learning records may contain user input; output is local and read-only.
- Resource bindings must reuse existing sanitization.
- Source packages expose metadata only, never file contents.
