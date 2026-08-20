---
name: project-review
description: Project-level review and analysis skill for FlowMind. Analyze project health, dependencies, and overall quality.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Project Review Skill

Analyze project health, dependencies, and overall quality.

## Features

### 📊 Project Health
- Dependency analysis
- Security audit
- License compliance
- Update status

### 📈 Code Metrics
- Code complexity
- Test coverage
- Documentation coverage
- Technical debt

### 🔒 Security Analysis
- Vulnerability scanning
- Dependency risks
- Secret detection
- Best practices

## Trigger Patterns

```
"项目审查", "project review"
"依赖检查", "dependency check"
"安全审计", "security audit"
"代码质量", "code quality"
"项目健康", "project health"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Project Review Report                               │
├─────────────────────────────────────────────────────┤
│ Project: {project_name}                             │
│ Language: {language}                                │
│ Last Updated: {date}                                │
├─────────────────────────────────────────────────────┤
│ Health Score: {score}/100                           │
├─────────────────────────────────────────────────────┤
│ Dependencies:                                       │
│ • Total: {count}                                    │
│ • Outdated: {outdated}                              │
│ • Vulnerable: {vulnerable}                          │
├─────────────────────────────────────────────────────┤
│ Code Quality:                                       │
│ • Complexity: {level}                               │
│ • Test Coverage: {percent}%                         │
│ • Documentation: {percent}%                         │
├─────────────────────────────────────────────────────┤
│ Recommendations:                                    │
│ • {recommendation}                                  │
└─────────────────────────────────────────────────────┘
```

## Health Checks

### Dependencies

| Check | Description |
|-------|-------------|
| Outdated | Packages needing update |
| Vulnerable | Known security issues |
| Unused | Unused dependencies |
| License | License compliance |

### Code Quality

| Check | Description |
|-------|-------------|
| Complexity | Cyclomatic complexity |
| Duplication | Code duplication |
| Coverage | Test coverage |
| Documentation | Doc coverage |

## Learning Integration

This skill supports FlowMind learning:

- **Review Focus**: Learns what to check first
- **Severity Levels**: Learns your standards
- **Auto-fix**: Learns what to fix automatically

```
User: "先检查安全漏洞"
FlowMind: ✓ Learned: Check security first

User: [Next review]
FlowMind: [Prioritizes security checks]
```

## Examples

### Example 1: Full Project Review

```
User: 审查项目整体状况

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Project Review Report                               │
├─────────────────────────────────────────────────────┤
│ Project: my-app                                     │
│ Language: JavaScript/Node.js                        │
│ Last Updated: 2026-06-22                            │
├─────────────────────────────────────────────────────┤
│ Health Score: 82/100                                │
├─────────────────────────────────────────────────────┤
│ Dependencies:                                       │
│ • Total: 45                                         │
│ • Outdated: 8                                       │
│ • Vulnerable: 2                                     │
├─────────────────────────────────────────────────────┤
│ Code Quality:                                       │
│ • Complexity: Medium                                │
│ • Test Coverage: 76%                                │
│ • Documentation: 65%                                │
├─────────────────────────────────────────────────────┤
│ ⚠️ Issues Found:                                    │
│ • 2 vulnerable dependencies                         │
│ • 8 outdated packages                               │
│ • Low documentation coverage                        │
├─────────────────────────────────────────────────────┤
│ Recommendations:                                    │
│ • Run 'npm audit fix'                               │
│ • Update outdated packages                          │
│ • Add JSDoc comments                                │
└─────────────────────────────────────────────────────┘
```

### Example 2: Security Audit

```
User: 进行安全审计

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Security Audit Report                               │
├─────────────────────────────────────────────────────┤
│ Vulnerabilities: 2 found                            │
├─────────────────────────────────────────────────────┤
│ 🔴 HIGH: lodash < 4.17.21                           │
│    Prototype Pollution                              │
│    Fix: npm install lodash@latest                   │
├─────────────────────────────────────────────────────┤
│ 🟡 MEDIUM: axios < 0.21.1                           │
│    SSRF Vulnerability                               │
│    Fix: npm install axios@latest                    │
├─────────────────────────────────────────────────────┤
│ Secrets: None detected ✓                            │
│ HTTPS: All connections secure ✓                     │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "project-review": {
    "checks": {
      "dependencies": true,
      "security": true,
      "quality": true,
      "documentation": true
    },
    "thresholds": {
      "coverage": 80,
      "complexity": 10
    }
  }
}
```

## Review Checklist

- [ ] Dependencies up to date
- [ ] No known vulnerabilities
- [ ] Test coverage > 80%
- [ ] Documentation complete
- [ ] License compliant
- [ ] No secrets in code