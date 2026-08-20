---
name: change-impact-review
description: Change impact review skill for FlowMind. Analyze changed files, identify affected domains, and recommend regression scope and release risk.
metadata:
  version: "1.0.0"
  author: flowmind
  category: review
---

# Change Impact Review Skill

Review a change by analyzing changed files and mapping them to API, database, cache, config, workflow, docs, and tests.

## Trigger Patterns

```
"变更影响", "影响审查", "impact review"
"影响分析", "回归范围", "发布风险"
"改动影响", "change impact"
```

## Features

- Changed file detection from dirty worktree or latest commit range
- Domain impact classification
- Regression checklist generation
- Sync recommendations for API and design docs
- Release risk grading
