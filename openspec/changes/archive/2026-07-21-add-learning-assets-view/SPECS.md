# Specifications

Status: accepted by explicit user request.

## Learning feedback

Given initialized FlowMind learning state, when learning assets are queried, then feedback is returned newest first with optional skill and limit filters.

## Skill state

Given learned skill bindings and scenes, when learning assets are queried, then rule counts, feedback counts, preferences, and scene summaries are returned.

## Material packages

Given current learning state and synchronized source files, when learning assets are queried, then the current portable-bundle summary and source-file metadata are returned without reading source contents.

## Safety

Given resource bindings containing credentials, when learning assets are returned, then sensitive connection fields are removed using the existing bundle sanitizer.

## Acceptance criteria

- CLI supports `flowmind learn --assets --json`.
- MCP exposes `flowmind_learning_assets`.
- Skill and limit filters work consistently.
- Tests cover aggregation, sanitization, CLI, and MCP exposure.
