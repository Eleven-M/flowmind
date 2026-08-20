# TUI Skill Availability

## Problem

FlowMind currently lists loaded skills but does not tell users whether their MCP dependencies, Git context, or explicit configuration are ready. A skill can appear usable and only reveal a missing binding after execution.

## Value

Expose readiness before execution so users can distinguish local skills from skills that need MCP binding, Git repository context, or configuration changes.

## Scope

- Aggregate per-skill readiness from declared component and runtime dependencies.
- Verify MCP adapter initialization and transport configuration without making network calls.
- Detect Git installation and repository context.
- Display overall readiness and exact missing skill bindings in the compact FlowMind TUI header.
- Preserve structured readiness for future Sidebar and CLI reuse.
