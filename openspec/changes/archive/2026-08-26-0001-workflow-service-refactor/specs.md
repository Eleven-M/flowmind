# Specs: Workflow Service Refactor

## Scenario: Preview workflow through shared service

Given a valid follow-up chain
When the CLI or MCP asks to preview the workflow
Then FlowMind returns the same dry-run preview and approval token as before.

## Scenario: Execute workflow through shared service

Given a reviewed chain and valid approval token
When the CLI or MCP asks to execute the workflow
Then FlowMind executes the allowlisted steps and persists history through the configured history store.

## Scenario: Resume workflow through shared service

Given a persisted workflow execution record
When the CLI or MCP asks to resume with the original approval token
Then FlowMind resumes from the first unfinished step.

## Scenario: Missing workflow execution

Given no history record exists for an execution id
When the caller asks to resume
Then FlowMind returns a structured not-found result without throwing from the service boundary.
