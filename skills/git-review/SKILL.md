<![CDATA[---
name: git-review
description: Git repository and commit review skill for FlowMind. Review commit history, analyze changes, and ensure code quality.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Git Review Skill

Review commit history, analyze changes, and ensure code quality.

## Features

### 📊 Commit Analysis
- Commit message quality
- Change size analysis
- Author statistics
- Time patterns

### 🔍 Change Review
- Diff analysis
- Impact assessment
- Risk evaluation
- Dependency changes

### 📈 Quality Metrics
- Code churn rate
- Review coverage
- Test coverage
- Documentation updates

## Trigger Patterns

```
"git审查", "git review"
"提交历史", "commit history"
"代码变更", "code changes"
"分支审查", "branch review"
"PR审查", "PR review"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Git Review Report                                   │
├─────────────────────────────────────────────────────┤
│ Branch: {branch}                                    │
│ Commits: {count}                                    │
│ Files Changed: {files}                              │
│ Lines: +{added} -{removed}                          │
├─────────────────────────────────────────────────────┤
│ Commit Quality:                                     │
│ ✓ Good: {good_count}                                │
│ ⚠ Warning: {warn_count}                             │
│ ✗ Bad: {bad_count}                                  │
├─────────────────────────────────────────────────────┤
│ Issues:                                             │
│ • {issue_description}                               │
└─────────────────────────────────────────────────────┘
```

## Commit Quality Checks

### Message Quality

| Check | Description |
|-------|-------------|
| Format | Follows conventional commits |
| Length | Subject < 50 chars, body < 72 chars |
| Clarity | Descriptive and clear |
| Reference | Links to issues/PRs |

### Change Quality

| Check | Description |
|-------|-------------|
| Size | Commits not too large |
| Scope | Single responsibility |
| Tests | Includes test changes |
| Docs | Documentation updated |

## Learning Integration

This skill supports FlowMind learning:

- **Review Focus**: Learns what to check first
- **Severity Levels**: Learns your standards
- **Output Format**: Learns preferred report format

```
User: "先检查提交规范"
FlowMind: ✓ Learned: Check commit conventions first

User: [Next review]
FlowMind: [Prioritizes commit conventions]
```

## Examples

### Example 1: Branch Review

```
User: 审查 feature/login 分支

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Git Review Report                                   │
├─────────────────────────────────────────────────────┤
│ Branch: feature/login                               │
│ Commits: 12                                         │
│ Files Changed: 23                                   │
│ Lines: +1,847 -234                                  │
├─────────────────────────────────────────────────────┤
│ Commit Quality:                                     │
│ ✓ Good: 10                                          │
│ ⚠ Warning: 2                                        │
├─────────────────────────────────────────────────────┤
│ Warnings:                                           │
│ • abc123: "fix stuff" - Too vague                   │
│ • def456: Large commit (500+ lines)                 │
├─────────────────────────────────────────────────────┤
│ Impact:                                             │
│ • Authentication: Major changes                     │
│ • Database: New migration                           │
│ • API: 5 new endpoints                              │
└─────────────────────────────────────────────────────┘
```

### Example 2: Commit History

```
User: 查看最近的提交历史

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Recent Commits                                      │
├─────────────────────────────────────────────────────┤
│ 2026-06-22 15:30 - feat: add OAuth2 login          │
│ 2026-06-22 14:20 - fix: resolve session timeout     │
│ 2026-06-22 11:45 - docs: update API documentation   │
│ 2026-06-21 18:00 - refactor: optimize queries       │
│ 2026-06-21 16:30 - test: add login tests            │
├─────────────────────────────────────────────────────┤
│ Statistics:                                         │
│ • 5 commits by 2 authors                            │
│ • 3 features, 1 fix, 1 docs                         │
│ • +456 -89 lines                                    │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "git-review": {
    "checks": {
      "commitMessage": true,
      "changeSize": true,
      "testCoverage": true,
      "documentation": true
    },
    "limits": {
      "maxCommitLines": 500,
      "maxCommitFiles": 20
    }
  }
}
```

## Commit Message Convention

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance
]]>