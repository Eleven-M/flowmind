# Security Policy

## Supported Versions

Security fixes are applied to the latest published major version of FlowMind.
If you are using an older release, upgrade to the latest version before reporting unless the issue is still reproducible there.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately by opening a GitHub security advisory for this repository.
Do not disclose working exploits, credentials, tokens, private MCP endpoints, or customer data in public issues.

Include:

- FlowMind version and installation method
- Node.js version and operating system
- Entry point used: `flowmind`, `flowmind-codex`, or `flowmind-mcp`
- Minimal reproduction steps
- Whether the issue can expose local files, credentials, workflow approval tokens, or MCP data

## Local Secrets and Config

FlowMind stores local configuration and learning state under `FLOWMIND_HOME/.flowmind`.
When `FLOWMIND_HOME` is not set, it falls back to the user's home directory.

Files written by FlowMind that may contain credentials or workflow state are written with private permissions on POSIX filesystems.
Treat these files as sensitive:

- `config.json`
- `ai-config.json`
- `resource-config.json`
- `component-config.json`
- `skill-config.json`
- `tasks.json`
- `workflows.json`
- `learning/**`

Do not commit real API keys, MCP tokens, database passwords, approval tokens, or internal service endpoints.

## Untrusted Workspaces

FlowMind can load `flowmind.config.js` from the current working directory.
Only run FlowMind in workspaces you trust, or prefer JSON configuration files when operating on untrusted repositories.

## Dependency Audits

Production dependencies are checked with:

```bash
npm run audit:prod
```

Development dependency advisories can appear in test and lint tooling even when the published package is clean.
When possible, update the dev toolchain and verify with `npm test`, `npm run lint`, and `npm run package:check`.
