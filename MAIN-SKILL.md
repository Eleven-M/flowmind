<![CDATA[---
name: flowmind
description: FlowMind - The AI Agent That Learns How You Work. Use for any development workflow task. FlowMind learns your preferences and applies them automatically.
metadata:
  version: "1.0.0"
  author: flowmind
  type: main
  license: MIT
---

# FlowMind - Main Skill Entry

**The AI Agent That Learns How You Work**

*Learn once, flow forever.*

## Overview

FlowMind is an intelligent development workflow automation framework that:
- 📚 **Learns from your corrections** - Remembers how you prefer tasks done
- 🔄 **Automates repetitive workflows** - No need to repeat instructions
- 🎯 **Adapts to your style** - Gets better with every interaction
- 🔌 **Extensible skill system** - Add custom skills for your needs

## Quick Start

```bash
# Initialize FlowMind
flowmind init

# Start using
flowmind "你的请求"

# Or interactive mode
flowmind
```

## Core Skills

### 🔍 Analysis Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| `log-audit` | Log analysis & trace visualization | "日志", "traceId", "排查" |
| `code-review` | Code quality & security review | "代码审查", "review", "PR" |
| `project-review` | Project health analysis | "项目审查", "依赖检查" |
| `git-review` | Git history & commit review | "git审查", "提交历史" |

### 🔌 Integration Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| `resource-bind` | Database, Redis, API connections | "数据库", "redis", "API" |
| `api-sync` | API documentation sync | "API文档", "接口同步" |
| `data-validation` | Data & logic verification | "数据验证", "逻辑检查" |

### 🔄 Automation Skills

| Skill | Description | Triggers |
|-------|-------------|----------|
| `auto-flow` | Workflow automation | "自动化", "工作流", "流程" |
| `archive-change` | Archive completed changes | "归档", "完成", "交付" |
| `learning-engine` | Learn from feedback | "记住", "下次", "应该" |

## Learning System

### How It Works

```
You: "查询日志用顺序列表格式"
FlowMind: [Records preference]

You: [Next time] "查询日志..."
FlowMind: [Uses sequential list automatically] ✓
```

### Learning Types

| Type | Example | Result |
|------|---------|--------|
| **Correction** | "不对，用表格格式" | Records format preference |
| **Scene Mapping** | "排查问题先查错误再查链路" | Records workflow |
| **Preference** | "用中文回复" | Records language |

### Automatic Application

Before each task, FlowMind:
1. Checks scene mappings for matching workflows
2. Checks skill learning for corrections
3. Applies all learned preferences

## Usage Patterns

### Single Command

```bash
flowmind "查询 traceId abc123 的日志"
```

### Interactive Mode

```bash
flowmind

You: 查询 traceId abc123 的日志
FlowMind: [Results...]

You: 用顺序列表格式
FlowMind: ✓ Learning recorded

You: 查询 traceId def456 的日志
FlowMind: [Uses sequential list automatically]
```

### Workflow Execution

```bash
flowmind run deploy-workflow
```

## Configuration

### Resource Configuration

```json
// ~/.flowmind/resource-config.json
{
  "resources": {
    "database": { "enabled": true, "host": "..." },
    "redis": { "enabled": true, "host": "..." },
    "logs": { "enabled": true, "endpoint": "..." }
  }
}
```

### Learning Configuration

```json
// ~/.flowmind/learning-config.json
{
  "learning": {
    "enabled": true,
    "autoApply": true,
    "confidenceThreshold": 0.7
  }
}
```

## Skill Details

### Log Audit

Analyze logs and trace requests.

```bash
# Query trace
flowmind "查询 traceId abc123 的完整链路"

# Error analysis
flowmind "查看最近1小时的错误日志"

# Performance
flowmind "分析接口耗时"
```

### Code Review

Review code quality and security.

```bash
# Security check
flowmind "检查安全漏洞"

# Quality review
flowmind "审查代码质量"

# PR review
flowmind "审查这个 PR"
```

### Resource Bind

Manage external connections.

```bash
# Database
flowmind "连接数据库查询用户表"

# Redis
flowmind "查看 Redis 缓存状态"

# API
flowmind "测试 API 接口"
```

### Data Validation

Verify data and logic.

```bash
# Data check
flowmind "验证订单数据"

# Logic verification
flowmind "检查业务逻辑"

# Calculation
flowmind "验证金额计算"
```

### API Sync

Sync API documentation.

```bash
# Generate docs
flowmind "生成 API 文档"

# Sync to platform
flowmind "同步接口到 YApi"
```

### Auto Flow

Automate workflows.

```bash
# Run workflow
flowmind "执行部署流程"

# Create workflow
flowmind "创建代码提交流程"
```

### Archive Change

Archive completed work.

```bash
# Archive single
flowmind "归档用户登录功能"

# Bulk archive
flowmind "归档所有已完成变更"
```

### Git Review

Review git history.

```bash
# Branch review
flowmind "审查 feature/login 分支"

# Commit history
flowmind "查看最近提交"
```

### Project Review

Analyze project health.

```bash
# Full review
flowmind "审查项目整体状况"

# Security audit
flowmind "进行安全审计"
```

## Learning Commands

```bash
# View learnings
flowmind learn list

# View scenes
flowmind scenes list

# Export learnings
flowmind learn export

# Import learnings
flowmind learn import <file>
```

## Management Commands

```bash
# List skills
flowmind skills

# View stats
flowmind stats

# Configuration
flowmind config --list
```

## Best Practices

1. **Be Specific**: More specific instructions = better learning
2. **Correct Early**: Correct FlowMind when wrong
3. **Use Scenes**: Define workflows for repeated tasks
4. **Review Learnings**: Periodically review saved learnings
5. **Share Knowledge**: Export and share with team

## Privacy & Security

- **Local Only**: All data stored locally
- **No Cloud**: Nothing sent to external servers
- **User Control**: Full control over all data
- **Encryption**: Optional encryption for sensitive data

## Support

- **Documentation**: [docs.flowmind.dev](https://docs.flowmind.dev)
- **Issues**: [github.com/flowmind/issues](https://github.com/flowmind/issues)
- **Discord**: [discord.gg/flowmind](https://discord.gg/flowmind)
- **Email**: support@flowmind.dev

## License

MIT License - see [LICENSE](LICENSE)
]]>