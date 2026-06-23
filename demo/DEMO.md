<div align="center">

# FlowMind Demo

**How to Use FlowMind in Your Daily Work**

[中文](DEMO_CN.md)

</div>

---

## Quick Start

### Install

```bash
npm install -g flowmind
```

### Initialize

```bash
flowmind init
```

> One-time setup. Configure your resources, preferences, and output formats.

---

## Scenario 1: Online Issue Investigation

**Before FlowMind (10+ steps):**
```
Login SLS → Query logs → Find traceId → Trace chain → Connect RDS → Query data → Locate code → Fix → Deploy → Write doc
```

**With FlowMind (1 command):**
```bash
flowmind "排查线上问题 traceId abc123"
```

FlowMind automatically: SLS query → Trace tracking → RDS data validation → Code location → Fix suggestion

### Step by Step

```bash
# 1. Query logs with your preferred format
flowmind "查询 traceId abc123 的日志，用顺序列表格式"

# 2. FlowMind learns your preference
# Next time, just:
flowmind "查询 traceId def456 的日志"
# → Automatically uses sequential list format
```

---

## Scenario 2: Code Review

### Set Your Standards (Once)

```bash
flowmind "代码审查先检查安全漏洞，再检查代码质量，最后检查性能"
```

### Review Any PR

```bash
flowmind "审查这个 PR"
# → Security first → Quality check → Performance analysis
```

### Review Specific File

```bash
flowmind "审查 src/api/users.js 的安全漏洞"
```

---

## Scenario 3: Data Validation

### Validate Order Data

```bash
flowmind "验证订单表数据完整性"
# → Referential integrity → Data types → Business logic → State machine
```

### Verify Calculations

```bash
flowmind "验证订单金额计算是否正确"
```

### Check Redis Cache

```bash
flowmind "验证缓存逻辑，检查 store:{storeId}:config 的结构"
```

---

## Scenario 4: API Documentation

### Generate from Code

```bash
flowmind "从代码注释生成 API 文档"
```

### Sync to YApi

```bash
flowmind "同步 OrderController 的接口到 YApi"
```

### Sync to Yuque

```bash
flowmind "同步 API 文档到语雀"
```

---

## Scenario 5: Log Analysis

### Trace Analysis

```bash
flowmind "查询 traceId abc123 的完整链路"
```

### Error Investigation

```bash
flowmind "查看最近1小时的错误日志"
```

### Performance Analysis

```bash
flowmind "分析 payment-service 接口耗时"
```

---

## Scenario 6: Project Health Check

```bash
flowmind "审查项目整体状况"
# → Dependencies → Security audit → Code complexity → Test coverage → Technical debt
```

### Security Audit

```bash
flowmind "进行安全审计"
```

---

## Learning System

### How It Works

```bash
# First time - teach FlowMind
flowmind "查询日志用顺序列表格式"
FlowMind: ✓ Learned

# Next time - FlowMind remembers
flowmind "查询 traceId abc123 的日志"
FlowMind: [Uses sequential list automatically]
```

### Scene Mapping

```bash
# Define a workflow
flowmind "排查问题先查错误日志，再查链路，最后查代码"
FlowMind: ✓ Workflow saved

# Use it anytime
flowmind "排查线上问题 order-123"
FlowMind: [Follows your workflow automatically]
```

### View Learnings

```bash
# List all learnings
flowmind learn list

# List scene mappings
flowmind scenes list

# Export for team sharing
flowmind learn export team.json

# Import from teammate
flowmind learn import team.json
```

---

## Common Commands

| Command | Description |
|---------|-------------|
| `flowmind "your request"` | Execute a task |
| `flowmind init` | Initialize configuration |
| `flowmind skills` | List available skills |
| `flowmind learn list` | View learning records |
| `flowmind scenes list` | View scene mappings |
| `flowmind learn export` | Export learnings |
| `flowmind learn import` | Import learnings |

---

## Tips

1. **Be Specific**: More detailed instructions = better learning
2. **Correct Early**: Tell FlowMind when it's wrong
3. **Use Scenes**: Define workflows for repeated tasks
4. **Share Knowledge**: Export and share with your team

---

<div align="center">

**Learn once, flow forever.**

</div>
