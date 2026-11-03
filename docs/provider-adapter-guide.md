# Provider and Adapter Guide

FlowMind skills should depend on adapter contracts instead of hardcoding vendor APIs.
This keeps skill behavior stable while allowing users to swap MCP servers, cloud providers, or internal platforms.

## Adapter Shape

Adapters are plain CommonJS modules or classes that expose focused methods for one capability.
Keep adapter methods small and return structured objects.

Example:

```javascript
class ExampleLogAdapter {
  constructor(config = {}) {
    this.endpoint = config.endpoint;
  }

  async queryLogs(params = {}) {
    return {
      ok: true,
      provider: 'example',
      records: [],
      query: params
    };
  }
}

module.exports = ExampleLogAdapter;
```

## Expected Rules

- Do not print secrets, tokens, headers, or passwords.
- Return evidence in `data` objects instead of writing directly to stdout.
- Support dry-run mode for actions that can change external state.
- Prefer explicit provider errors over silent fallbacks.
- Keep network credentials in FlowMind config or environment variables.
- Add tests with a fake adapter before adding live provider behavior.

## Common Capability Families

| Capability | Existing examples | Typical methods |
| --- | --- | --- |
| Log service | `core/providers/aliyun/sls-adapter.js` | `queryLogs`, `getTrace` |
| Database query | `core/providers/aliyun/rds-query-adapter.js` | `query`, `explain`, `getSchema` |
| API docs | `core/providers/yapi/yapi-adapter.js` | `listProjects`, `syncInterface` |
| Knowledge base | `core/providers/yuque/yuque-adapter.js` | `getDocument`, `upsertDocument` |
| Workflow | `core/providers/automation/flow-adapter.js` | `listPipelines`, `runPipeline`, `getRun` |
| Governance | `core/providers/governance/mcp-service-governance-adapter.js` | `audit`, `diagnose`, `previewChange`, `applyChange` |

## Adding a Provider

1. Add the adapter under `core/providers/<provider>/`.
2. Add or update a capability adapter under `core/adapters/` only if a new capability family is needed.
3. Add config scaffolding in `core/init-scaffold.js` if users should configure it through `flowmind init`.
4. Add tests with fake responses.
5. Document whether the provider works out of the box or requires external MCP credentials.

## Decision Providers (Explicit Enable Required)

Decision providers such as `jev` do not generate text. They answer typed questions
(Choice / Score / probability) through an `evaluate()` endpoint and are used only
for decision features such as `skillSelection`. They never take over until the user
explicitly enables and configures them:

```json
{
  "ai": {
    "providers": {
      "jev": {
        "enabled": true,
        "apiKey": "${JEV_API_KEY}",
        "model": "jev-latest"
      }
    },
    "featureProviders": {
      "skillSelection": "jev"
    }
  }
}
```

Rules for decision providers:

- Set `explicitEnableRequired = true`. The model manager keeps the provider
  registered but uninitialized until `enabled === true` and credentials are present.
- Set `supportsChat = false` so generic chat routing (`answerQuery`, failover)
  always skips the provider.
- `featureProviders` routing silently falls back to the default LLM provider when
  the decision provider is disabled, fails, or returns confidence below
  `decisionMinConfidence` (default `0.6`).
- `doctor` and AI status surfaces expose `disabled` and `disabledReason` so users
  can see why a decision provider is not taking over.

## Test Checklist

- Missing credentials produce actionable errors.
- Dry-run does not mutate external state.
- Result payloads are JSON-serializable.
- Secrets are redacted in user-facing output.
- Provider errors preserve enough context to debug without leaking credentials.
