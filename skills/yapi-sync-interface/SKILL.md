---
name: yapi-sync-interface
description: YApi interface sync skill for FlowMind. Sync Controller interfaces to YApi, import/export Swagger, manage API documentation lifecycle.
metadata:
  version: "1.0.0"
  author: flowmind
  category: documentation
---

# YApi Interface Sync Skill

Synchronize API interfaces between code and YApi platform for consistent API documentation management.

## Features

### Interface Sync
- Extract Controller interfaces from code
- Sync to YApi project
- Update existing interfaces
- Create new interface categories

### Swagger Import/Export
- Generate Swagger/OpenAPI from code
- Import Swagger to YApi
- Export YApi interfaces to Swagger

### Interface Management
- Search interfaces by keyword
- Manage interface categories
- Interface version tracking
- Test collection management

## Trigger Patterns

```
"同步接口", "sync interfaces"
"YApi同步", "yapi sync"
"接口文档", "API documentation"
"Swagger导入", "swagger import"
"接口管理", "interface management"
"更新YApi", "update yapi"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ YApi Interface Sync Report                          │
├─────────────────────────────────────────────────────┤
│ Project: {project_name} (ID: {id})                  │
│ Category: {category}                                │
├─────────────────────────────────────────────────────┤
│ Interfaces Found: {count}                           │
│ • New: {new_count}                                  │
│ • Updated: {update_count}                           │
│ • Unchanged: {unchanged_count}                      │
├─────────────────────────────────────────────────────┤
│ Sync Status: ✅ Success / ❌ Failed                  │
│ YApi URL: {url}                                     │
└─────────────────────────────────────────────────────┘
```

## MCP Integration

This skill uses the `aomi-yapi-mcp` MCP server:

| Tool | Description |
|------|-------------|
| `yapi_search_apis` | Search interfaces by keyword |
| `yapi_get_categories` | Get project categories |
| `yapi_save_api` | Create/update interface |
| `yapi_import_swagger` | Import Swagger data |
| `yapi_export_project` | Export project data |

## Learning Integration

This skill supports FlowMind learning:

- **Project Mapping**: Learns which code maps to which YApi project
- **Category Mapping**: Learns package-to-category mappings
- **Sync Preferences**: Learns sync preferences (overwrite, merge, etc.)

## Examples

### Example 1: Sync Controller to YApi

```
User: 同步 OrderController 的接口到 YApi

FlowMind:
┌─────────────────────────────────────────────────────┐
│ YApi Interface Sync Report                          │
├─────────────────────────────────────────────────────┤
│ Project: order-service (ID: 28)                     │
│ Category: 订单管理                                  │
├─────────────────────────────────────────────────────┤
│ Interfaces Found: 5                                 │
│ • New: 2 (createOrder, cancelOrder)                 │
│ • Updated: 3 (getOrder, listOrders, updateOrder)    │
├─────────────────────────────────────────────────────┤
│ Sync Status: ✅ Success                             │
│ YApi URL: https://yapi.example.com/project/28       │
└─────────────────────────────────────────────────────┘
```

### Example 2: Search Interfaces

```
User: 搜索 YApi 上的订单相关接口

FlowMind:
┌─────────────────────────────────────────────────────┐
│ YApi Interface Search                               │
├─────────────────────────────────────────────────────┤
│ Keyword: 订单                                       │
│ Results: 8 interfaces                               │
├─────────────────────────────────────────────────────┤
│ 1. 创建订单 - POST /api/orders (project: order-svc) │
│ 2. 查询订单 - GET /api/orders/{id} (project: order) │
│ 3. 取消订单 - PUT /api/orders/{id}/cancel           │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "yapi-sync-interface": {
    "defaultProjectId": "28",
    "syncMode": "merge",
    "autoCreateCategory": true,
    "excludePatterns": ["**/internal/**"]
  }
}
```