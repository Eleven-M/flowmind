# Changelog

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
