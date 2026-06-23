---
name: archive-change
description: Archive completed changes and maintain project history. Use when a feature, fix, or change is complete and needs to be documented and archived.
metadata:
  version: "1.0.0"
  author: flowmind
  category: workflow
---

# Archive Change Skill

Archive completed changes and maintain project history.

## Features

### 📦 Change Archiving
- Move completed changes to archive
- Generate completion reports
- Update project history
- Clean up working directories

### 📝 Documentation
- Auto-generate change summary
- Link related artifacts
- Update changelog
- Create knowledge base entries

### 🔗 Cross-Reference
- Link to related issues
- Reference PRs and commits
- Connect to requirements
- Trace to deployments

## Trigger Patterns

```
"归档", "archive", "完成"
"变更完成", "change complete"
"结束变更", "finish change"
"交付", "deliver"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Change Archived                                     │
├─────────────────────────────────────────────────────┤
│ Change: {change_name}                               │
│ Status: ✓ Completed                                 │
│ Duration: {days} days                               │
├─────────────────────────────────────────────────────┤
│ Artifacts:                                          │
│ • Proposal: ✓                                       │
│ • Specs: ✓                                          │
│ • Design: ✓                                         │
│ • Tasks: ✓ (15/15 completed)                        │
│ • Tests: ✓ (42 passed)                              │
├─────────────────────────────────────────────────────┤
│ Archive Location:                                   │
│ archive/changes/{change_name}/                      │
└─────────────────────────────────────────────────────┘
```

## Archive Structure

```
archive/
└── changes/
    └── {change_name}/
        ├── SUMMARY.md           # Change summary
        ├── PROPOSAL.md          # Original proposal
        ├── SPECS.md             # Specifications
        ├── DESIGN.md            # Design document
        ├── TASKS.md             # Task list
        ├── CHANGELOG.md         # Detailed changes
        ├── TESTS.md             # Test results
        └── artifacts/           # Related files
```

## Learning Integration

This skill supports FlowMind learning:

- **Archive Format**: Learns preferred archive structure
- **Summary Style**: Learns how to summarize changes
- **Cleanup Rules**: Learns what to keep/delete

```
User: "归档时保留测试报告"
FlowMind: ✓ Learned: Keep test reports in archive

User: [Next archive]
FlowMind: [Includes test reports automatically]
```

## Examples

### Example 1: Archive Feature

```
User: 归档用户登录功能

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Change Archived                                     │
├─────────────────────────────────────────────────────┤
│ Change: user-login-feature                          │
│ Status: ✓ Completed                                 │
│ Duration: 14 days                                   │
├─────────────────────────────────────────────────────┤
│ Summary:                                            │
│ • Implemented OAuth2 login                          │
│ • Added social login (Google, GitHub)               │
│ • Created user session management                   │
│ • Added login rate limiting                         │
├─────────────────────────────────────────────────────┤
│ Metrics:                                            │
│ • 23 files changed                                  │
│ • 1,847 lines added                                 │
│ • 42 test cases                                     │
│ • 100% test coverage                                │
├─────────────────────────────────────────────────────┤
│ Archive: archive/changes/user-login-feature/        │
└─────────────────────────────────────────────────────┘
```

### Example 2: Bulk Archive

```
User: 归档所有已完成的变更

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Bulk Archive Complete                               │
├─────────────────────────────────────────────────────┤
│ Archived: 3 changes                                 │
│ • user-login-feature (14 days)                      │
│ • order-optimization (7 days)                       │
│ • api-refactor (21 days)                            │
├─────────────────────────────────────────────────────┤
│ Total:                                              │
│ • 67 files archived                                 │
│ • 12,456 lines documented                           │
│ • 156 test cases                                    │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "archive-change": {
    "location": "archive/changes",
    "keepTests": true,
    "keepArtifacts": true,
    "generateSummary": true,
    "updateChangelog": true
  }
}
```

## Archive Checklist

Before archiving, FlowMind checks:

- [ ] All tasks completed
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Code reviewed
- [ ] No open issues
- [ ] Deployment verified