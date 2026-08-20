---
name: data-risk-audit
description: Data risk audit skill for FlowMind. Analyze SQL and Redis operations for safety, performance, and blast radius risks before execution.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Data Risk Audit Skill

Analyze SQL and Redis commands before execution and highlight unsafe patterns.

## Trigger Patterns

```
"数据风险", "risk audit", "SQL风险"
"Redis风险", "危险SQL", "data risk"
```

## Features

- SQL destructive-operation detection
- Broad query and scan detection
- Redis wildcard and `KEYS` risk detection
- Safer alternative recommendations
