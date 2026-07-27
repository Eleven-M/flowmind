# Change guardrails

- Keep production and non-production bindings separate.
- Grant query and mutation permissions to different cloud identities where possible.
- Require project/engine/namespace and service scope for mutations.
- Do not expose delete operations in the first release.
- Override MCP tool mappings in provider configuration instead of patching skill code.
