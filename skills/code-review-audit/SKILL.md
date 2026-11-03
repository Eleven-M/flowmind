---
name: code-review-audit
description: Code review and security audit skill for FlowMind. Three-dimensional review: security audit, design compliance check, and mandatory constraint validation before merge or test.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Code Review & Security Audit Skill

Three-dimensional code review: security audit, design compliance, and constraint validation.

## Features

### Security Audit
- SQL injection detection
- Hardcoded secrets scanning
- Sensitive data exposure in logs
- Unauthorized access detection
- XSS vulnerability scanning

### Design Compliance
- Functional completeness check
- API consistency verification
- Database schema alignment
- Redis/Kafka design alignment
- Over-implementation detection

### Mandatory Constraints
- Code quality constraints (inner classes, field remarks, method docs, complexity)
- Naming conventions (error codes, Kafka topics, Redis keys)
- Layered architecture (Controller/Service/Repository separation)
- Performance constraints (batch operations, timeout, parallel calls)
- Test coverage requirements

## Trigger Patterns

```
"合并审核", "测试前审核"
"代码审查", "code review", "review"
"MR 审核", "PR review"
"安全审查", "security audit"
"设计合规", "design compliance"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Code Review Report                                  │
├─────────────────────────────────────────────────────┤
│ Review Type: {merge/test}                           │
│ Files Changed: {count}                              │
│ Design Doc: {yes/no}                                │
├─────────────────────────────────────────────────────┤
│ Security: {issues}                                  │
│ Design Compliance: {status}                         │
│ Constraints: {violations}                           │
├─────────────────────────────────────────────────────┤
│ Verdict: PASS / CONDITIONAL / FAIL                  │
│ Must Fix: {list}                                    │
│ Suggestions: {list}                                 │
└─────────────────────────────────────────────────────┘
```

## Review Levels

| Level | Condition | Scope |
|-------|-----------|-------|
| micro | ≤3 files, bug fix/config | Security + basic quality |
| small | ≤5 files, single module | + naming, layering, tests |
| medium | ≤15 files, API/DB/Redis | + performance, caching, exceptions |
| full | >15 files, cross-module | All constraints |

## Parallel Execution（全局唯一 → 各自并行 → 结果合并唯一）

**多仓库并行**（一次审核 ≥2 个仓库/MR）：全局唯一（一份汇总报告、一个总结论）→ 每仓库一个只读审查单元并行执行（各自做范围判定 micro/small/medium/full，返回严重度统计 + 高/中危明细）→ 合并唯一（主 agent 聚合、识别跨仓库一致性问题如同错误码号段/公共依赖/契约不对齐并统一定级；跨仓库交叉问题只在合并步产生）。

**单仓库三维并行**（≥30 文件或 full 范围的大 MR）：安全审查 / 设计合规 / 强制约束 三路只读单元并行，各自只加载本维度约束段；主 agent 合并去重定级，同一问题多维度命中按最高严重度合并。不满足规模时保持串行逐维。

所有并行单元均 readonly，只输出报告不修改代码。并发 ≤ 4。宿主不支持并行子 agent 时退化为串行，输出结构不变。

## Learning Integration

This skill supports FlowMind learning:

- **Review Focus**: Learns which issues you care about most
- **Severity Levels**: Learns your severity preferences
- **Constraint Priority**: Learns which constraints to prioritize

## Examples

### Example 1: Merge Review

```
User: 合并审核

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Code Review Report                                  │
├─────────────────────────────────────────────────────┤
│ Review Type: Merge Review                           │
│ Files Changed: 5                                    │
│ Design Doc: openspec/changes/xxx/DESIGN.md          │
├─────────────────────────────────────────────────────┤
│ Security: 1 HIGH (SQL injection at line 45)         │
│ Design Compliance: 2 features missing               │
│ Constraints: 3 violations                           │
├─────────────────────────────────────────────────────┤
│ Verdict: ❌ FAIL                                    │
│ Must Fix:                                           │
│ • SQL injection at UserService.java:45              │
│ • Missing Redis caching for store data              │
└─────────────────────────────────────────────────────┘
```

### Example 2: Security Review

```
User: 安全审查这个接口

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Security Audit                                      │
├─────────────────────────────────────────────────────┤
│ 🔴 HIGH: Hardcoded API key at Config.java:12        │
│    Fix: Use environment variables                   │
│ 🟡 MEDIUM: Exception stack exposed to client        │
│    Fix: Return generic error message                │
│ 🟢 LOW: DEBUG level logging in production           │
│    Fix: Set appropriate log level                   │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "code-review-audit": {
    "security": {
      "enabled": true,
      "severity": ["high", "medium", "low"]
    },
    "designCompliance": {
      "enabled": true,
      "checkOverImplementation": true
    },
    "constraints": {
      "codeQuality": true,
      "naming": true,
      "layering": true,
      "performance": true,
      "testing": true
    }
  }
}
```