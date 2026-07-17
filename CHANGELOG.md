# Changelog

## Unreleased

## [1.5.15] - 2026-07-17

### Added
- Added dry-run previews with content-bound approval tokens for guarded follow-up workflows
- Added allowlisted workflow execution for YApi, Yuque, archive, and knowledge-deposition actions through CLI and MCP
- Added real archive materialization with a generated archive manifest
- Added YApi Swagger/OpenAPI import execution

### Changed
- Upgrade status now separates local and live acceptance evidence and only reports completion when executable workflow checks pass

## [1.5.14] - 2026-07-13

### Changed
- `log-audit` and `sls-log-audit` default trace summaries now surface the last downstream service response instead of only showing status placeholders
- Trace anomaly summaries now include up to the first three exception lines when available and avoid false positives from structured success payloads
- `more` and `full` trace views now parse and display all service return bodies before the raw service detail list

### Fixed
- HTTP response parsing now prefers real response status codes over unrelated duration values
- Bracketed Feign response lines are now recognized as service return payloads in both summary and detailed log views

## [1.5.13] - 2026-07-07

### Added
- Added open-source quality tooling with ESLint, Prettier, Madge, execa, strip-ansi, npm pack dry-run, and publint checks
- Added release package validation through `npm run package:check`, including actual packlist and publint results
- Added runtime reliability primitives with `p-limit` and `lru-cache` for bounded upgrade-status repository scans
- Added `flowmind upgrade-status` to report upgrade checklist completion and next directions for the selected upgrade areas
- Added `flowmind release-check` for changelog, release notes, package file, and release-document secret checks
- Added guarded `followUpChain` generation from automation candidates, sync recommendations, and next actions
- Added MCP task persistence, retry metadata, timeout handling, and best-effort running cancellation
- Added knowledge deposition candidates to actionable skill and task results

### Changed
- Default log audit output now prefers the anomalous service and the latest record, with full details available via `more`
- Structured log audit errors now render concise readable summaries instead of raw JSON blobs
- Normal query flows now suppress AI provider warning noise unless the user explicitly asks for AI status or debugging

## [1.5.12] - 2026-07-03

### Changed
- Removed release instructions from the published README so npm package pages stay focused on usage

## [1.5.11] - 2026-07-03

### Changed
- Removed the public npm publish token and simplified the publish notes to avoid exposing secrets in the README files

## [1.5.10] - 2026-07-03

### Changed
- Documented the local npm publish flow that uses a temporary userconfig for `flowmind` releases
- Added a local publish note to the README files so future releases can reuse the same verified command
- Clarified that these release instructions are local-only and are not meant to be committed or published from this change

## [1.5.8] - 2026-07-02

### Fixed
- Log audit no longer asks for a time range when the user already specified a relative date like "today"
- Aliyun SLS log query timestamps are normalized to integer seconds before the MCP call, matching the backend parameter contract

## [1.5.7] - 2026-07-02

### Added
- Added a `check-update` script and CLI command so already installed users can quickly see whether a newer npm release is available
- TUI now checks npm for a newer release after startup and shows a non-blocking update reminder banner when one is available

### Fixed
- TUI and dashboard now degrade gracefully on narrow or very small terminals instead of crashing on resize
- CLI TUI/dashboard startup now uses a shared Ink launcher with consistent stdin proxy cleanup
- Auto-flow remote checklist resolution now requires an exact service/pipeline descriptor match, so a neighboring service can no longer be started by index position alone
- Log audit now extracts quoted Chinese exception text as a query keyword, shows explicit no-records guidance, and surfaces raw MCP response summaries for TUI debugging
- Log audit now also tries to infer a keyword from natural-language log queries when the user forgets to add quotes
- Log audit and SLS log audit now share a natural-language parser for keyword, level, and time-window extraction
- Natural-language log queries now also infer service and project names when the user writes "项目" or "服务" in a loose sentence

### Changed
- Sidebar, chat, status, and dashboard panels now switch to compact layouts when terminal width drops below the normal threshold
- Terminal resize handling now keeps the current session alive and shows a recovery hint instead of exiting on render errors

## [1.5.4] - 2026-07-01

### Added
- FlowMind now resolves deferred MCP invocations from skill outputs and executes them through the registered adapter when available
- Auto-flow, YApi, Yuque, and log audit skills now return concise execution summaries instead of raw MCP payload shapes

### Fixed
- Repeated TUI submissions are now serialized to avoid multi-input crashes during fast follow-up commands
- CLI startup now falls back to ASCII-friendly banners in managed terminal environments that can crash on full graphics rendering

### Changed
- `resource-bind` and related learned bindings now surface clearer resource summaries for follow-up skill reuse
- Result formatting now unwraps nested execution payloads so the TUI shows the actual output instead of intermediate envelopes

## [1.5.2] - 2026-07-01

### Added
- `sdd-agent-sync` now imports workflow resources from local `auto-flow` learning data into FlowMind
- Workflow sync now writes a local `workflow` resource, a `workflow` component config, and a reusable `workflow` binding for `friday-auto-flow`

### Changed
- `flowmind resource --sync-sdd-agent` can now seed the workflow MCP path automatically, so `auto-flow` no longer depends on a manual local binding

## [1.5.1] - 2026-07-01

### Added
- Clarified that FlowMind can keep normal MCP and learned-binding usage working even when no AI model is configured, as long as local knowledge has been accumulated

### Changed
- Release notes now highlight the AI-less MCP usage path more explicitly for npm readers

## [1.5.0] - 2026-07-01

### Added
- `resource --sync-sdd-agent` now imports local `sdd-agent` bindings, scenes, and component state into FlowMind without touching remote services
- Passive learning can now auto-promote repeated resource-binding choices into reusable skill preferences after enough successful local runs
- Passive scene learning can now turn repeated successful scene executions into reusable default scene preferences
- Accumulated local knowledge can now drive repeated MCP workflows even without configuring an AI model, so learned bindings and scene preferences still keep the tool useful in MCP-only setups
- `resource-bind` can now save business-specific MCP, address, token, namespace, and project bindings into local learning files
- Runtime context now injects matched learned bindings so follow-up skills can reuse the saved business connection automatically

### Changed
- The CLI now treats direct text input as `process`, so `flowmind "..."` works without manually adding the subcommand
- Resource overview output now exposes synced bindings, scene counts, and component activation state more clearly
- Default config bootstrapping now seeds built-in values before reading local files, including passive learning thresholds

### Fixed
- Binding-style requests such as `绑定发布平台 mcp=friday-auto-flow token=xxx env=uat` now route through `resource-bind` reliably instead of being swallowed by execution skills
- Startup now avoids a false `Missing required field: version` warning when local config files do not exist yet
- `flowmind tui` and `flowmind dashboard` now refuse to start inside managed Codex/Claude-style CLI hosts where nested fullscreen input can terminate the outer session
- CLI and TUI entrypoints now fail more predictably in managed terminal hosts instead of letting nested fullscreen behavior break the outer session

## [1.4.8] - 2026-06-30

### Changed
- Simplified the npm homepage README into a short entry page focused on positioning, quick start, and next-step links
- Moved the longer product explanation into dedicated guide documents for English and Chinese readers
- Added packaged detailed guide documents so linked deep-dive docs resolve from the published npm package

## [1.4.7] - 2026-06-30

### Added
- npm package now ships the demo assets and integration guide referenced by the README

### Changed
- Release packaging now excludes local promotion copy so community post drafts do not get published to npm
- Demo setup now reads the package version dynamically instead of keeping a stale hardcoded value

## [1.4.6] - 2026-06-30

### Added
- Portable demo scripts for skill listing, log audit, learning feedback, and JSON output replay from the repository root
- Animated terminal walkthrough assets, including a VHS tape and generated demo GIF

### Changed
- Demo helpers now fall back to the local `node ./bin/flowmind.js` entrypoint when a global `flowmind` binary is unavailable
- README and demo docs now expose the terminal walkthrough directly for GitHub and npm readers

## [1.4.5] - 2026-06-29

### Fixed
- Skill routing now prefers explicit skill execution before treating input as generic learning feedback
- `learning-feedback` now receives the active FlowMind runtime and current skill context for proper feedback injection
- `resource-bind list` now reads registry data through a stable `getAll()` API instead of a broken internal path
- `log-audit` now executes real adapter log queries when an adapter is configured, instead of returning a query plan only
- TUI focus handling now keeps sidebar/chat input behavior and status display aligned

### Added
- Core regression tests for routing order, learning bindings, registry listing, and executable skill behavior

## [1.3.0] - 2026-06-26

### Fixed
- Missing `os` import in config-manager.js
- MCP Server version hardcoded instead of reading from package.json
- `config --set` and `skill --set` CLI commands broken (Commander arg parsing)
- `learn --reset` and `learn --delete` were unimplemented stubs
- Learning engine race condition on concurrent file writes (added WriteQueue)
- TUI/Dashboard crash on non-TTY stdin (Ink raw mode error)

### Added
- All 17 skills now have working `execute()` implementations
- Global uncaughtException/unhandledRejection handlers
- Graceful exit handling in TUI via onExit callback

## [1.2.2] - 2026-06-26

### Fixed
- ChatPanel React import issue with ink-text-input and ink-spinner ESM/CJS interop

## [1.2.0] - 2026-06-26

### Added
- TUI with split panels, skill browser, dragon display
- Dashboard with real-time activity feed and stats
- Event system for cross-component communication
- Update command for auto-updating flowmind

## [1.1.0] - 2026-06-25

### Added
- Mainstream AI model providers (GLM, MiMo, Qwen, ERNIE, DeepSeek)
- AI model integration with rule-based fallback
- MCP Server for Claude/Codex integration

## [1.0.1] - 2026-06-24

### Added
- Initial release
- Skill loading and execution engine
- Learning engine for user corrections and preferences
- Honor engine with dragon totem gamification
- Scene matcher for workflow automation
- Configuration manager
