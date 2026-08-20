# Specifications

## Skill readiness

Given loaded skills, when readiness is requested, then every skill returns one of `ready`, `needs-binding`, `needs-git`, or `disabled`, together with missing component names and an actionable hint.

## MCP readiness

Given a skill with component dependencies, when its active adapter is missing, disabled, uninitialized, or lacks MCP transport configuration, then the skill is marked `needs-binding`. No remote request is required for this local readiness check.

## Git readiness

Given a Git-dependent skill, when Git is unavailable or the current working directory is not inside a repository, then the skill is marked `needs-git`.

## TUI visibility

Given the compact chat TUI, when it renders, then the main header shows ready/total skill counts, MCP ready/required counts, Git and config state, and the exact skills requiring binding or Git context.

## Acceptance criteria

- `FlowMind.getSkillAvailability()` returns the structured status model.
- `auto-flow` declares its workflow MCP dependency.
- Git review and change-impact review declare their Git runtime dependency.
- TUI helper output names missing skill bindings.
- Focused and full quality tests pass.
