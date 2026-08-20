---
name: code-review
description: Code review and quality analysis skill for FlowMind. Analyze code for security vulnerabilities, style violations, and best practices.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Code Review Skill

Analyze code for security vulnerabilities, style violations, and best practices.

## Features

### 🔒 Security Analysis
- SQL injection detection
- XSS vulnerability scanning
- Authentication issues
- Sensitive data exposure

### 📏 Code Quality
- Style guide compliance
- Complexity analysis
- Code duplication detection
- Documentation completeness

### ✅ Best Practices
- Design pattern adherence
- Error handling review
- Performance considerations
- Testing coverage

## Trigger Patterns

```
"代码审查", "code review", "review"
"安全检查", "security check"
"代码质量", "code quality"
"PR审查", "PR review"
"代码规范", "style guide"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Code Review Report                                  │
├─────────────────────────────────────────────────────┤
│ Files Analyzed: {count}                             │
│ Lines of Code: {loc}                                │
├─────────────────────────────────────────────────────┤
│ Security Issues: {count}                            │
│ • [HIGH] {issue} at {file}:{line}                   │
│ • [MEDIUM] {issue} at {file}:{line}                 │
├─────────────────────────────────────────────────────┤
│ Quality Issues: {count}                             │
│ • {issue} at {file}:{line}                          │
├─────────────────────────────────────────────────────┤
│ Suggestions:                                        │
│ • {suggestion}                                      │
└─────────────────────────────────────────────────────┘
```

## Review Categories

### Security Checks

| Check | Severity | Description |
|-------|----------|-------------|
| SQL Injection | HIGH | Unsanitized user input in queries |
| XSS | HIGH | Unescaped output in templates |
| Hardcoded Secrets | HIGH | Credentials in source code |
| Weak Crypto | MEDIUM | Insecure encryption algorithms |

### Quality Checks

| Check | Severity | Description |
|-------|----------|-------------|
| Complexity | MEDIUM | Functions too complex |
| Duplication | LOW | Duplicated code blocks |
| Documentation | LOW | Missing documentation |
| Naming | LOW | Poor naming conventions |

## Learning Integration

This skill supports FlowMind learning:

- **Review Focus**: Learns which issues you care about most
- **Severity Levels**: Learns your severity preferences
- **Output Format**: Learns preferred report format

```
User: "先检查安全漏洞"
FlowMind: ✓ Learned: Security first for code review

User: [Next review]
FlowMind: [Prioritizes security issues]
```

## Examples

### Example 1: Security Review

```
User: 检查这个文件的安全漏洞

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Security Review                                     │
├─────────────────────────────────────────────────────┤
│ File: src/api/users.js                              │
├─────────────────────────────────────────────────────┤
│ 🔴 HIGH: SQL Injection                              │
│    Line 45: query(`SELECT * FROM users WHERE id=${id}`)│
│    Fix: Use parameterized queries                   │
├─────────────────────────────────────────────────────┤
│ 🟡 MEDIUM: Hardcoded Secret                         │
│    Line 12: const API_KEY = 'abc123'                │
│    Fix: Use environment variables                   │
└─────────────────────────────────────────────────────┘
```

### Example 2: Code Quality Review

```
User: 审查这段代码的质量

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Code Quality Review                                 │
├─────────────────────────────────────────────────────┤
│ Function: processOrder                              │
│ Lines: 85                                           │
│ Complexity: 12 (HIGH)                               │
├─────────────────────────────────────────────────────┤
│ Issues:                                             │
│ • Function too long (85 lines)                      │
│ • High cyclomatic complexity                        │
│ • Missing error handling                            │
├─────────────────────────────────────────────────────┤
│ Suggestions:                                        │
│ • Split into smaller functions                      │
│ • Add try-catch blocks                              │
│ • Add unit tests                                    │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "code-review": {
    "security": {
      "enabled": true,
      "severity": ["high", "medium", "low"]
    },
    "quality": {
      "enabled": true,
      "maxComplexity": 10,
      "maxFunctionLength": 50
    },
    "style": {
      "enabled": true,
      "guide": "standard"
    }
  }
}
```

## Customization

### Custom Rules

Add custom review rules:

```json
{
  "code-review": {
    "customRules": [
      {
        "name": "no-console-log",
        "pattern": "console\\.log",
        "severity": "warning",
        "message": "Remove console.log statements"
      }
    ]
  }
}
```

### Ignore Patterns

Exclude files from review:

```json
{
  "code-review": {
    "ignore": [
      "**/test/**",
      "**/*.test.js",
      "**/node_modules/**"
    ]
  }
}
```