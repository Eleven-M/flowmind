# Specifications

Status: accepted through the user's optimization request.

## Offline operation

Given no initialized AI provider, when the user asks to analyze local history, documents, or code, then FlowMind selects the offline analysis skill and returns a successful structured result without network access.

## Natural-language routing priority

Given no available AI provider, when a request such as `分析下当前合同校验额度的流程` contains an analysis action and a flow/design subject, then FlowMind selects `offline-design-analysis`; a broad `流程` trigger alone must not select `auto-flow`. Given an available AI provider, the same ordinary request must not automatically select the offline skill. Explicit `离线分析` wording or explicit skill selection still selects it. Execution, deployment, pipeline status, and workflow-management actions continue to select `auto-flow`.

## User-directed route learning

Given a valid skill explicitly selected through `--skill`, runtime context, or a conversational correction such as `这个应该改用 offline-design-analysis`, after the selection succeeds FlowMind persists the request-to-skill route locally. On a later exact or high-confidence similar request with the same action family, the learned route is applied before model and ordinary keyword routing. Unknown skills and failed executions are not learned.

## Local material analysis

Given indexed Markdown, Lake, Lakebook, JSON, HTML, or text material, when it matches the natural-language request, then relevant sections, rules, ordered steps, and citations are returned.

## Code analysis

Given a local repository, when code matches the request, then files, symbols, API/data/cache/message signals, and a bounded summary are returned without executing the code.

## Evidence and uncertainty

Given extracted conclusions, then every reported source includes a local relative path and matched evidence. Confidence and limitations are returned when evidence is weak or conflicting.

## Safety

Given symlinks, generated directories, secret files, oversized files, binary content, or unsafe Lakebook entries, then those inputs are skipped and recorded as limitations without exposing sensitive values.

## Acceptance criteria

- `flowmind analyze "..." --offline --json` returns a stable analysis contract.
- MCP exposes `flowmind_offline_analyze`.
- `flowmind process` routes matching requests to `offline-design-analysis` with AI disabled.
- Explicit user skill choices are exported/imported with the learning bundle and are visible in learning assets.
- Output includes summary, design flow, code/document signals, citations, confidence, and limitations.
- Focused and full project tests pass.
