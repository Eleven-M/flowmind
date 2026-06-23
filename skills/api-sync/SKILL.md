---
name: api-sync
description: API documentation synchronization skill for FlowMind. Sync API definitions, generate documentation, and maintain API consistency.
metadata:
  version: "1.0.0"
  author: flowmind
  category: documentation
---

# API Sync Skill

Sync API definitions, generate documentation, and maintain API consistency.

## Features

### 📚 Documentation Generation
- Generate from code annotations
- Create OpenAPI/Swagger specs
- Generate Markdown docs
- Create client SDKs

### 🔄 Synchronization
- Sync to API platforms
- Update documentation
- Version management
- Change tracking

### ✅ Validation
- Schema validation
- Breaking change detection
- Backward compatibility
- Style guide compliance

## Trigger Patterns

```
"API文档", "API documentation", "API docs"
"接口同步", "sync API", "接口文档"
"Swagger", "OpenAPI"
"API管理", "API management"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ API Sync Report                                     │
├─────────────────────────────────────────────────────┤
│ Platform: {platform}                                │
│ Project: {project}                                  │
├─────────────────────────────────────────────────────┤
│ Endpoints: {count}                                  │
│ • Added: {added}                                    │
│ • Updated: {updated}                                │
│ • Deleted: {deleted}                                │
├─────────────────────────────────────────────────────┤
│ Status: ✓ Synced Successfully                       │
│ URL: {docs_url}                                     │
└─────────────────────────────────────────────────────┘
```

## Supported Platforms

| Platform | Status | Features |
|----------|--------|----------|
| YApi | ✅ | Full support |
| Swagger Hub | ✅ | Full support |
| Postman | ✅ | Collections |
| Stoplight | 🚧 | Coming soon |
| ReadMe | 🚧 | Coming soon |

## Learning Integration

This skill supports FlowMind learning:

- **Platform**: Learns preferred API platform
- **Format**: Learns preferred doc format
- **Sync Rules**: Learns what to sync

```
User: "同步到 YApi"
FlowMind: ✓ Learned: Sync APIs to YApi

User: [Next sync]
FlowMind: [Syncs to YApi automatically]
```

## Examples

### Example 1: Generate API Docs

```
User: 生成这个 Controller 的 API 文档

FlowMind:
┌─────────────────────────────────────────────────────┐
│ API Documentation Generated                         │
├─────────────────────────────────────────────────────┤
│ Source: src/controllers/UserController.java         │
│ Endpoints: 5                                        │
├─────────────────────────────────────────────────────┤
│ GET    /api/users          - List users             │
│ GET    /api/users/{id}     - Get user               │
│ POST   /api/users          - Create user            │
│ PUT    /api/users/{id}     - Update user            │
│ DELETE /api/users/{id}     - Delete user            │
├─────────────────────────────────────────────────────┤
│ Output: docs/api/users.md                           │
└─────────────────────────────────────────────────────┘
```

### Example 2: Sync to Platform

```
User: 同步接口到 YApi

FlowMind:
┌─────────────────────────────────────────────────────┐
│ API Sync Complete                                   │
├─────────────────────────────────────────────────────┤
│ Platform: YApi                                      │
│ Project: My Project                                 │
├─────────────────────────────────────────────────────┤
│ Synced:                                             │
│ • Added: 2 endpoints                                │
│ • Updated: 3 endpoints                              │
│ • Unchanged: 10 endpoints                           │
├─────────────────────────────────────────────────────┤
│ View at: http://yapi.example.com/project/123        │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "api-sync": {
    "platform": "yapi",
    "connection": {
      "host": "http://yapi.example.com",
      "projectId": "123",
      "token": "your-token"
    },
    "options": {
      "autoSync": true,
      "generateDocs": true,
      "validateSchema": true
    }
  }
}
```

## Sync Modes

### Full Sync

```bash
flowmind api-sync --full
```

Syncs all endpoints, overwriting remote changes.

### Incremental Sync

```bash
flowmind api-sync --incremental
```

Only syncs changed endpoints.

### Dry Run

```bash
flowmind api-sync --dry-run
```

Shows what would be synced without making changes.

## Custom Templates

### Markdown Template

```json
{
  "api-sync": {
    "templates": {
      "markdown": "templates/api-doc.md"
    }
  }
}
```

### OpenAPI Template

```json
{
  "api-sync": {
    "templates": {
      "openapi": "templates/openapi.yaml"
    }
  }
}
```