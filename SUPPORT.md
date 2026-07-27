# Support

Use GitHub Issues for reproducible bugs and feature requests.

Before filing an issue, include:

- FlowMind version: `flowmind --version`
- Node.js version: `node --version`
- Operating system
- Command or MCP client used
- Sanitized config snippets if configuration is involved

## Scope

Supported:

- FlowMind CLI behavior
- MCP server behavior
- Skill routing and learning behavior
- Packaging, installation, and published npm package behavior
- Public provider and adapter contracts

Best-effort:

- Third-party MCP client setup
- Local shell, terminal, or package manager differences
- Internal or private provider integrations

Not supported in public issues:

- Private tokens, credentials, or internal service URLs
- Customer data or production logs
- Requests requiring access to private infrastructure

Use placeholders such as `token=xxx`, `https://example.internal`, or `traceId=abc123` when sharing examples.
