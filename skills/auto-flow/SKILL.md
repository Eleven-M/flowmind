<![CDATA[---
name: auto-flow
description: Automated workflow orchestration skill for FlowMind. Define, execute, and manage complex multi-step workflows.
metadata:
  version: "1.0.0"
  author: flowmind
  category: automation
---

# Auto Flow Skill

Define, execute, and manage complex multi-step workflows.

## Features

### 🔄 Workflow Execution
- Sequential steps
- Parallel execution
- Conditional branching
- Error handling

### 📋 Workflow Templates
- Reusable workflows
- Parameterized steps
- Version control
- Team sharing

### 📊 Monitoring
- Step tracking
- Progress reporting
- Error logging
- Performance metrics

## Trigger Patterns

```
"自动化", "automation", "workflow"
"流程", "process", "pipeline"
"批量", "batch"
"定时", "scheduled"
"工作流", "work flow"
```

## Workflow Definition

### YAML Format

```yaml
name: deploy-pipeline
description: Deploy to production

steps:
  - name: test
    action: run-tests
    params:
      coverage: true

  - name: build
    action: build-artifact
    depends_on: [test]

  - name: deploy-staging
    action: deploy
    params:
      environment: staging
    depends_on: [build]

  - name: integration-test
    action: run-integration-tests
    depends_on: [deploy-staging]

  - name: deploy-prod
    action: deploy
    params:
      environment: production
    depends_on: [integration-test]
    when: "{{branch}} == 'main'"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Workflow Execution                                  │
├─────────────────────────────────────────────────────┤
│ Workflow: {name}                                    │
│ Status: {status}                                    │
│ Progress: {progress}%                               │
├─────────────────────────────────────────────────────┤
│ Steps:                                              │
│ ✓ test (2m 30s)                                     │
│ ✓ build (1m 15s)                                    │
│ ✓ deploy-staging (45s)                              │
│ ⏳ integration-test (running...)                     │
│ ○ deploy-prod (pending)                             │
├─────────────────────────────────────────────────────┤
│ Duration: 4m 30s                                    │
│ ETA: 2m 15s                                         │
└─────────────────────────────────────────────────────┘
```

## Built-in Workflows

### Development Workflow

```yaml
name: dev-workflow
steps:
  - name: code-review
    skill: code-review

  - name: test
    skill: data-validation

  - name: docs
    skill: api-sync

  - name: archive
    skill: archive-change
```

### Deployment Workflow

```yaml
name: deploy-workflow
steps:
  - name: validate
    action: validate-config

  - name: backup
    action: backup-database

  - name: deploy
    action: deploy-application

  - name: verify
    action: health-check

  - name: notify
    action: send-notification
```

## Learning Integration

This skill supports FlowMind learning:

- **Workflow Preferences**: Learns common workflows
- **Step Order**: Learns preferred step sequence
- **Error Handling**: Learns recovery preferences

```
User: "部署前先备份数据库"
FlowMind: ✓ Learned: Backup before deploy

User: [Next deploy]
FlowMind: [Includes backup step automatically]
```

## Examples

### Example 1: Execute Workflow

```
User: 执行部署流程

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Workflow: deploy-production                         │
├─────────────────────────────────────────────────────┤
│ ✓ validate (5s)                                     │
│ ✓ backup (2m 15s)                                   │
│ ✓ deploy (3m 30s)                                   │
│ ✓ verify (30s)                                      │
│ ✓ notify (5s)                                       │
├─────────────────────────────────────────────────────┤
│ Status: ✓ Completed                                 │
│ Duration: 6m 25s                                    │
│ Environment: production                             │
└─────────────────────────────────────────────────────┘
```

### Example 2: Custom Workflow

```
User: 创建一个代码提交流程

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Workflow Created: code-commit                       │
├─────────────────────────────────────────────────────┤
│ Steps:                                              │
│ 1. lint - Run linter                                │
│ 2. test - Run tests                                 │
│ 3. review - Code review                             │
│ 4. commit - Create commit                           │
│ 5. push - Push to remote                            │
├─────────────────────────────────────────────────────┤
│ Usage: flowmind run code-commit                     │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "auto-flow": {
    "workflows": {
      "path": "./workflows",
      "autoDiscover": true
    },
    "execution": {
      "parallel": true,
      "maxConcurrent": 5,
      "timeout": 3600
    },
    "notifications": {
      "onComplete": true,
      "onError": true
    }
  }
}
```

## Workflow Actions

### Built-in Actions

| Action | Description |
|--------|-------------|
| `run-command` | Execute shell command |
| `run-tests` | Run test suite |
| `deploy` | Deploy application |
| `notify` | Send notification |
| `wait` | Wait for condition |
| `approve` | Request approval |

### Custom Actions

```json
{
  "auto-flow": {
    "actions": {
      "my-action": {
        "command": "npm run my-script",
        "timeout": 300
      }
    }
  }
}
```

## Error Handling

### Retry Configuration

```yaml
steps:
  - name: deploy
    action: deploy
    retry:
      max: 3
      delay: 5000
      backoff: exponential
```

### Failure Actions

```yaml
steps:
  - name: deploy
    action: deploy
    on_failure:
      - action: rollback
      - action: notify
        params:
          message: "Deploy failed!"
```
]]>