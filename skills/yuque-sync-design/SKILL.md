---
name: yuque-sync-design
description: Yuque design document sync skill for FlowMind. Sync design documents to knowledge base, manage OpenSpec archives, and maintain design documentation lifecycle.
metadata:
  version: "1.1.0"
  author: flowmind
  category: documentation
componentDependencies:
  - knowledgeBase
---

# Yuque Design Document Sync Skill

Synchronize design documents between local OpenSpec artifacts and Yuque knowledge base for centralized design documentation management.

## Features

### Design Doc Sync
- Sync OpenSpec DESIGN.md to Yuque
- Update existing design documents
- Create new document categories
- Version tracking and history

### Knowledge Base Management
- Browse Yuque repositories
- Search documents across repos
- Manage document structure
- Group statistics and analytics

### OpenSpec Archive
- Archive completed changes to Yuque
- Maintain change history
- Link related documents
- Searchable archive

## Trigger Patterns

```
"同步设计文档", "sync design doc"
"语雀同步", "yuque sync"
"设计文档管理", "design doc management"
"归档到语雀", "archive to yuque"
"文档同步", "document sync"
"知识库管理", "knowledge base"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Yuque Design Sync Report                            │
├─────────────────────────────────────────────────────┤
│ Repository: {repo_name}                             │
│ Document: {doc_title}                               │
├─────────────────────────────────────────────────────┤
│ Action: Create / Update / Archive                   │
│ Status: ✅ Success / ❌ Failed                       │
│ URL: {yuque_url}                                    │
├─────────────────────────────────────────────────────┤
│ Sections Synced: {count}                            │
│ • {section_1}: ✅                                   │
│ • {section_2}: ✅                                   │
└─────────────────────────────────────────────────────┘
```

## Component Integration

This skill uses the **knowledgeBase** component. The actual knowledge base provider is determined by configuration.

| Provider | MCP Server | Description |
|----------|------------|-------------|
| yuque | aomi-yuque-mcp | Yuque knowledge base |
| notion | notion-mcp | Notion workspace |

Configuration is managed in `flowmind.config.json` under `components.knowledgeBase`.

**Available MCP tools** (yuque provider):

| Tool | Description |
|------|-------------|
| `get_user_repos` | List user's repositories |
| `get_repo_docs` | List documents in repository |
| `get_doc` | Get document content |
| `create_doc` | Create new document |
| `update_doc` | Update existing document |
| `search` | Search documents/repos |
| `get_group_statistics` | Get group statistics |

## Learning Integration

This skill supports FlowMind learning:

- **Repository Mapping**: Learns which projects map to which Yuque repos
- **Document Structure**: Learns preferred document organization
- **Sync Preferences**: Learns sync frequency and scope preferences

## Examples

### Example 1: Sync Design to Yuque

```
User: 同步当前设计文档到语雀

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Yuque Design Sync Report                            │
├─────────────────────────────────────────────────────┤
│ Repository: aomi-design-docs                        │
│ Document: 订单模块详细设计                           │
├─────────────────────────────────────────────────────┤
│ Action: Update                                      │
│ Status: ✅ Success                                   │
│ URL: https://yuque.com/aomi/design/order-module      │
├─────────────────────────────────────────────────────┤
│ Sections Synced: 6                                  │
│ • API Design: ✅                                    │
│ • Database Design: ✅                               │
│ • Redis Design: ✅                                  │
│ • Kafka Design: ✅                                  │
│ • Flow Diagram: ✅                                  │
│ • Test Plan: ✅                                     │
└─────────────────────────────────────────────────────┘
```

### Example 2: Search Knowledge Base

```
User: 搜索语雀上的订单相关文档

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Yuque Search Results                                │
├─────────────────────────────────────────────────────┤
│ Keyword: 订单                                       │
│ Results: 5 documents                                │
├─────────────────────────────────────────────────────┤
│ 1. 订单模块详细设计 (aomi-design-docs)               │
│    Updated: 2026-06-20                              │
│ 2. 订单流程图 (aomi-design-docs)                     │
│    Updated: 2026-06-18                              │
│ 3. 订单API文档 (api-docs)                           │
│    Updated: 2026-06-15                              │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "yuque-sync-design": {
    "defaultRepo": "aomi-design-docs",
    "syncFormat": "markdown",
    "autoCreateToc": true,
    "archiveAfterSync": true
  }
}
```