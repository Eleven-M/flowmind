<![CDATA[---
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
]]>