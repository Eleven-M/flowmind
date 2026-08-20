# FlowMind Security Model

FlowMind is a local developer workflow tool.
It can route requests to skills, call configured adapters or MCP servers, and persist local learning state.

## Trust Boundaries

| Boundary | What crosses it | Main risk | Control |
| --- | --- | --- | --- |
| CLI input | User requests, file paths, workflow files | Accidental execution or sensitive data in prompts | Skill allowlists, dry-run review, explicit commands |
| Local state | Config, learning records, task history, workflow history | Credential or context disclosure | Private file permissions on POSIX filesystems |
| MCP servers | Tool calls and tool responses | External tool mutation or data exposure | Explicit MCP config, skill contracts, approval tokens for guarded workflows |
| AI providers | Prompts, extracted params, summaries | Sending sensitive context to a model provider | Provider opt-in config and local rule fallback |
| JavaScript config | `flowmind.config.js` | Code execution in untrusted workspaces | Use only trusted workspaces or JSON config |

## Local Files

FlowMind writes potentially sensitive local files with private permissions when the filesystem supports POSIX modes:

- Directories: `0700`
- JSON state files: `0600`

Sensitive paths include:

- `FLOWMIND_HOME/.flowmind/config.json`
- `FLOWMIND_HOME/.flowmind/ai-config.json`
- `FLOWMIND_HOME/.flowmind/resource-config.json`
- `FLOWMIND_HOME/.flowmind/component-config.json`
- `FLOWMIND_HOME/.flowmind/skill-config.json`
- `FLOWMIND_HOME/.flowmind/tasks.json`
- `FLOWMIND_HOME/.flowmind/workflows.json`
- `FLOWMIND_HOME/.flowmind/learning/**`
- Workspace-local `.flowmind-codex/**`

## Guarded Workflows

Actions that can mutate external state should use guarded workflow execution:

1. Preview the workflow in dry-run mode.
2. Review the exact planned steps.
3. Execute only with the matching approval token.
4. Use workflow history to inspect or resume interrupted runs.

Approval tokens should be treated as sensitive runtime data.
Public workflow-history output removes approval tokens.

## Secret Handling

Do not commit:

- API keys
- MCP tokens
- Database passwords
- Authorization headers
- Internal service URLs
- Approval tokens
- Production logs containing customer data

Use environment variables or local FlowMind config for credentials.
Use placeholders in issues and docs.

## Untrusted Repositories

FlowMind can load `flowmind.config.js` from the current directory.
That is useful for trusted projects but should be avoided in untrusted repositories.
Prefer `flowmind.config.json` or an explicit `FLOWMIND_HOME` when inspecting unknown code.
