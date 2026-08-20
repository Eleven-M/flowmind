---
name: service-management-log-analysis
description: Project-specific service management log query and analysis for FlowMind. Use only for the configured service management project when users ask to query 服务管理日志, 商户后台日志, 管理后台服务 logs, resource names, operation content, logged-browser-session queries, or analysis of operation log data from the service management console.
metadata:
  version: "1.0.0"
  author: flowmind
  category: project-ops
---

# Service Management Log Analysis

Query and analyze the configured service management project's operation logs from an already authenticated browser session or from the same authenticated API used by that page.

## Scope

- Keep this skill project-specific. Do not reuse it for generic SLS logs, database logs, or unrelated admin consoles.
- Reuse an existing browser login state. Never bypass authentication, automate CAPTCHA, store passwords, or hard-code long-lived tokens.
- Treat browser automation as read-only: open the log page, fill filters, run queries, read rows/details, and export structured evidence.
- Prefer the page's authenticated query API when it is configured and uses the same logged-in browser credentials. Use DOM selectors as the fallback.

## Workflow

1. Resolve the target source: `商户后台日志` or `管理后台服务`.
2. Parse user-provided filters such as time range, resource name, operation content, operator, account ID, IP, request path, and limit.
3. Load target configuration from `skillConfig.skills.service-management-log-analysis`.
4. If a browser/API executor is available in context, execute the query against the configured page or API.
5. Parse row fields, especially `资源名称` and `操作内容`, plus request/response detail fields when available.
6. Analyze record counts, resource distribution, operation distribution, actor/IP distribution, suspicious records, and missing-detail risk.
7. When `enrichment` is configured, resolve entity IDs found in request/response params to readable names via the configured MCP data sources (DMS/SLS) and build a customer-service readable report (`csReport`) with product names, status-change tokens, and activity details.
8. Return structured evidence and next actions. If configuration or executor is missing, return the exact read-only query plan and required configuration.

## Trigger Patterns

```
"服务管理日志", "服务管理日志查询", "服务管理日志分析"
"商户后台日志", "管理后台服务"
"资源名称", "操作内容"
"从浏览器登录后查询", "已登录浏览器", "浏览器登录态"
"后台操作日志", "服务管理操作日志"
```

## Configuration

Read [references/config.md](references/config.md) when adding or updating the project target page, selectors, or authenticated API settings.

Minimal skill config shape:

```json
{
  "skillConfig": {
    "skills": {
      "service-management-log-analysis": {
        "project": "service-management",
        "defaultTarget": "merchantBackendLog",
        "targets": {
          "merchantBackendLog": {
            "label": "商户后台日志",
            "url": "https://your-service-management-host/#/merchant-log-route",
            "selectors": {}
          },
          "adminService": {
            "label": "管理后台服务",
            "url": "https://your-service-management-host/#/admin-service-log-route",
            "selectors": {}
          }
        }
      }
    }
  }
}
```

## Executor Contract

This skill can run with an injected read-only executor:

```js
context.serviceManagementLogClient.queryLogs({
  target,
  params,
  mode: "api" | "dom"
})
```

It can also call the local FlowMind browser bridge when configured:

```json
{
  "browserBridge": {
    "enabled": true,
    "url": "http://127.0.0.1:47631",
    "token": "paste-token-from-flowmind-browser-bridge"
  }
}
```

The executor should return:

```json
{
  "records": [
    {
      "resourceName": "POI管理",
      "operationContent": "编辑门店",
      "operator": "张三",
      "accountId": "10001",
      "operationDate": "2026-08-14 10:20:00",
      "requestPath": "/api/poi/update",
      "requestParams": {},
      "responseParams": {},
      "ip": "10.0.0.1",
      "linkIp": "10.0.0.2"
    }
  ],
  "pageInfo": {
    "total": 1,
    "pages": 1
  }
}
```
