---
name: learning-feedback
description: Global learning skill for FlowMind. Captures user corrections, feedback, and refined processing logic. Automatically binds learning to relevant skills for future application.
metadata:
  version: "1.0.0"
  author: flowmind
  category: core
  priority: global
---

# Learning Feedback Skill

Global learning skill that captures user corrections, feedback, and refined processing logic. Learning records are automatically bound to relevant skills for future application.

## Features

### Correction Learning
- Captures user corrections ("不对", "错了", "应该是")
- Records original vs corrected approach
- Binds learning to affected skills

### Refinement Learning
- Captures optimization suggestions ("优化一下", "改进")
- Records processing logic refinements
- Applies to future similar tasks

### Scene-Skill Mapping
- Records user-specified handling preferences
- Auto-applies on matching scenes
- Supports complex multi-skill workflows

### Knowledge Application
- Pre-execution learning check
- Automatic correction application
- Learning effectiveness tracking

## Trigger Patterns

```
"不对", "错了", "应该是", "正确的是"
"不是这样", "重新处理", "修改为"
"你应该...", "需要...", "改成..."
"更准确的做法是", "更好的方式是"
"优化一下", "改进", "调整"
"流程不对", "顺序错了", "逻辑有问题"
"先...再...", "应该先..."
"记住这个方式", "下次直接这样"
"按照上次的方式处理"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ ✅ Learning Record Saved                            │
├─────────────────────────────────────────────────────┤
│ Record ID: {uuid}                                   │
│ Skill: {affected-skill}                             │
│ Type: {correction-type}                             │
├─────────────────────────────────────────────────────┤
│ Original: {brief-summary}                           │
│ Corrected: {brief-summary}                          │
├─────────────────────────────────────────────────────┤
│ This learning will be auto-applied in future tasks  │
└─────────────────────────────────────────────────────┘
```

## Learning Types

| Type | Description | Example |
|------|-------------|---------|
| output_format | Output format correction | "用表格格式" |
| logic_flow | Processing logic correction | "先查错误再查链路" |
| data_accuracy | Data accuracy correction | "source_id 不是 host" |
| skill_execution | Skill execution correction | "应该用 SLS 技能" |
| query_syntax | Query syntax correction | "用 PromQL 不是 SQL" |

## Scene Mapping

### Scene Detection

```
User Input → Keyword Extraction → Pattern Matching → Scene Match
                                                    ↓
                                            [Match] → Apply Recorded Workflow
                                            [No Match] → Normal Flow → Record if Confirmed
```

### Scene Mapping Examples

```
场景: 查询TraceId链路
关键词: traceId, 链路, 调用链
技能: sls-log-audit
偏好: 顺序列表格式

→ 自动应用: 使用 sls-log-audit，输出顺序列表
```

## Learning Storage

```
~/.flowmind/learning/
├── records/               # Learning records
│   ├── _global/          # Global learning
│   ├── code-review/      # Per-skill learning
│   └── log-audit/
├── skill-bindings.json   # Skill binding mapping
├── scene-mappings.json   # Scene-skill mappings
└── stats.json            # Learning statistics
```

## Learning Integration

This skill is a **global skill** that enhances all other skills:

- Before executing any skill, check for applicable learning
- Apply learned corrections automatically
- Track learning effectiveness over time

## Examples

### Example 1: Output Format Correction

```
User: 查询 traceId abc123 的日志
FlowMind: [Returns tree format]
User: 不对，应该用顺序列表格式

FlowMind:
┌─────────────────────────────────────────────────────┐
│ ✅ Learning Record Saved                            │
├─────────────────────────────────────────────────────┤
│ Skill: log-audit                                    │
│ Type: output_format                                 │
│ Original: Tree format                               │
│ Corrected: Sequential list format                   │
├─────────────────────────────────────────────────────┤
│ Future log queries will use sequential list format  │
└─────────────────────────────────────────────────────┘
```

### Example 2: Scene Mapping

```
User: 排查线上问题先查错误日志，再查链路，最后查代码

FlowMind:
┌─────────────────────────────────────────────────────┐
│ ✅ Scene Mapping Saved                              │
├─────────────────────────────────────────────────────┤
│ Scene: 线上问题排查                                  │
│ Keywords: 排查, 线上问题, 故障排查                    │
│ Skill Sequence:                                     │
│  1. log-audit (错误日志)                            │
│  2. log-audit (链路分析)                            │
│  3. code-review (代码审查)                          │
├─────────────────────────────────────────────────────┤
│ Next time will auto-apply this workflow             │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "learning-feedback": {
    "autoApply": true,
    "confidenceThreshold": 0.7,
    "maxRecordsPerSkill": 100,
    "archiveAfterDays": 90
  }
}
```