# Offline Design Analysis

## Problem

FlowMind can route known skills without an AI provider, but its model fallback returns unknown intent, empty parameters, and no result summary. The learning-assets view exposes only source metadata, so users cannot ask FlowMind to analyze historical learning records, local documents, and repository code when no model is configured.

## Value

Provide a deterministic, local-only analysis path that turns natural-language questions into evidence-backed document/code summaries and a design flow. The output remains useful without a model and makes uncertainty explicit instead of inventing missing relationships.

## Scope

- Parse local Markdown, text, JSON, HTML/Lake, Lakebook, and common source-code files.
- Rank historical learning material and repository files from natural-language terms and `RESOURCE_INDEX.md` metadata.
- Extract headings, rules, code symbols, endpoints, data/cache/message signals, and ordered flow steps.
- Return citations, confidence, limitations, and test focus in a stable result contract.
- Add a FlowMind skill, direct core API, CLI command, MCP tool, documentation, and tests.
- Distinguish natural-language analysis intent from workflow execution even when both contain words such as `流程`.
- Learn explicit user skill choices as portable local request-to-skill routes.

## Risks and dependencies

- No network, database, or AI provider is required.
- Archive parsing must prevent path traversal and cap entry/file sizes.
- Local secrets and generated/vendor directories must be excluded.
- Heuristic analysis cannot infer unstated semantics; low-evidence conclusions must be labelled.
