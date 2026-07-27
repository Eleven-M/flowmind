# FlowMind Upgrade Roadmap

This roadmap focuses on the priority areas selected for the current upgrade wave:

- `3` MCP exposure and platformization
- `7` Report skill family
- `8` Knowledge-base operations
- `9` Data risk analysis
- `10` Change impact review

## Goals

### 1. Change Impact Review

Turn review from rule scanning into impact analysis:

- Identify changed API, DB, Redis, config, workflow, docs, and tests
- Produce regression scope and release risk
- Recommend follow-up actions such as YApi sync, Yuque sync, and targeted tests

### 2. Data Risk Analysis

Separate "can query data" from "can judge data risk":

- Detect dangerous SQL patterns
- Detect risky Redis key scans and broad cache access
- Output risk levels, reasons, and safer alternatives

### 3. MCP Platform Capability Catalog

Move from a generic wrapper to a stable capability surface:

- Publish capability groups
- Publish skill catalog metadata
- Provide structured inputs for capability discovery

### 4. Report Skill Family

Expose the existing report adapter through user-facing skills:

- Build summaries
- Test summaries
- Coverage summaries

### 5. Knowledge Operations

Extend knowledge-base support beyond document sync:

- Search knowledge
- List spaces/repos
- Save local markdown as a reusable knowledge entry
- Update existing knowledge entries

## Delivery Phases

### Phase 1: Foundation Upgrade

Status: completed in the `1.5.13` upgrade line.

- Add `change-impact-review` skill
- Add `data-risk-audit` skill
- Add `report-insights` skill
- Add `knowledge-ops` skill
- Add MCP capability catalog tool
- Add tests for new skills and MCP discovery

### Phase 2: Structured Contracts

Status: completed for the current upgraded skill surface.

- Per-skill MCP input/output contracts
- Async task and progress model for long-running skills
- Consistent error envelope and retry hints

### Phase 3: Deep Integrations

Status: completed in the `2.0.0` upgrade line.

- Impact review linked to YApi/Yuque/resource bindings
- Data risk audit linked to live explain/metadata providers
- Report skills linked to archive and change review
- Knowledge ops linked to post-task knowledge deposition

## Current Upgrade Status

As of the current `2.0.2` workspace, local contracts, orchestration, and guarded live execution are complete:

- MCP capability catalog and async task tools are implemented
- Automation candidates, sync recommendations, and next actions now produce a guarded `followUpChain` for explicit step-by-step execution
- `flowmind workflow`, filtered `flowmind workflow-history`, `flowmind workflow-resume`, and the MCP preview/execute/history/resume tools provide dry-run review, content-bound approval tokens, allowlisted execution, and resumable execution history
- YApi, Yuque, local archive, knowledge-deposition, and multi-cloud service-governance actions can execute through the guarded workflow runtime
- MCP task state is persisted locally and now carries attempts, retry count, timeout, cancellation, and progress history metadata
- Workflow execution history is persisted locally and can be resumed from the first failed step
- Report, knowledge, data-risk, change-impact, and service-governance skill families are present
- Structured `retryHints`, `bindingHint`, `automationCandidates`, `nextActions`, `knowledgeDepositionCandidates`, and progress contracts are documented and covered by tests
- CLI upgrade operations are exposed through `flowmind upgrade-status` and `flowmind release-check`
- Open-source maintenance tooling now covers linting, scoped formatting checks, dependency-cycle detection, CLI output assertions, packlist validation, and publint package checks
- Full local regression suite passes with `21` suites and `216` tests

`flowmind upgrade-status` reports local and live acceptance separately. File or contract presence is local evidence only; live completion requires the executable workflow runtime and dry-run implementation.

The next meaningful upgrade direction is live cloud validation and provider smoke tests.

## Test Scope

### Change Impact Review

- Dirty worktree detection
- Commit-range fallback
- Risk classification
- Regression checklist output

### Data Risk Audit

- Unsafe update/delete without `WHERE`
- Broad `SELECT *` without `LIMIT`
- Redis wildcard and `KEYS` detection

### Report Insights

- Report adapter missing
- Build and coverage summary shaping

### Knowledge Ops

- Search/list flows
- Save local markdown
- Missing resource configuration handling

### MCP

- Capability catalog tool availability
- Capability grouping response shape
- Skill catalog visibility for newly added skills
- Task persistence, retry, timeout, cancellation, and progress history behavior

### Upgrade Operations

- `upgrade-status` reports local and live acceptance separately and requires both layers for overall completion
- Workflow dry-run tokens are deterministic for the reviewed steps and mandatory for execution
- Only YApi, Yuque, archive, and knowledge-deposition skills are executable through follow-up chains
- `release-check` validates release documentation, package file entries, and obvious release-document secrets
- `followUpChain` turns recommended actions into a guarded manual-review chain
- Knowledge deposition candidates are attached to actionable task and skill outputs

## Related Docs

- [upgrade-contracts.md](upgrade-contracts.md)
