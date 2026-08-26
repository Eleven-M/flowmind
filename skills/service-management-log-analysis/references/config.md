# Service Management Log Configuration

Use this reference when configuring the project-specific service management log query skill.

## Configuration Location

Place configuration under `~/.flowmind/skill-config.json`:

```json
{
  "skills": {
    "service-management-log-analysis": {
      "project": "service-management",
      "defaultTarget": "merchantLog",
      "queryMode": "api-first",
      "browserBridge": {
        "enabled": true,
        "url": "http://127.0.0.1:47631",
        "token": "paste-token-from-flowmind-browser-bridge"
      },
      "maxPages": 20,
      "targets": {
        "merchantLog": {
          "label": "商户后台日志",
          "url": "https://your-service-management-host/#/merchant-log-route",
          "api": {
            "url": "https://your-service-management-host/path/from-browser-network",
            "method": "GET",
            "credentials": "include",
            "bodyTemplate": {
              "pageNo": 1,
              "pageSize": 50,
              "query": {}
            },
            "parameterMap": {
              "fromMs": "date-begin-field-from-your-page",
              "toMs": "date-end-field-from-your-page",
              "resourceName": "resource-field-from-your-page",
              "storeId": "store-id-field-from-your-page",
              "keyword": "request-param-field-from-your-page",
              "page": "page-number-field-from-your-page",
              "pageSize": "page-size-field-from-your-page"
            },
            "responsePath": {
              "records": "records-array-path-from-your-response",
              "total": "total-path-from-your-response"
            },
            "fieldMap": {
              "systemName": "system-name-field-path-from-your-response",
              "resourceName": "resource-name-field-path-from-your-response",
              "operationContent": "operation-content-field-path-from-your-response",
              "accountId": "account-id-field-path-from-your-response",
              "operator": "operator-field-path-from-your-response",
              "operationDate": "operation-date-field-path-from-your-response",
              "requestPath": "request-path-field-path-from-your-response",
              "requestParams": "request-params-field-path-from-your-response",
              "responseParams": "response-params-field-path-from-your-response",
              "ip": "ip-field-path-from-your-response",
              "linkIp": "link-ip-field-path-from-your-response"
            }
          },
          "selectors": {
            "resourceNameInput": "input[name='resourceName']",
            "operationContentInput": "input[name='operationContent']",
            "fromInput": "input[name='startTime']",
            "toInput": "input[name='endTime']",
            "operatorInput": "input[name='operator']",
            "accountIdInput": "input[name='accountId']",
            "queryButton": "button:has-text('查询')",
            "tableRows": "table tbody tr",
            "nextPageButton": ".pagination-next",
            "detailButton": "button:has-text('详情')",
            "requestParams": "[data-field='requestParams']",
            "responseParams": "[data-field='responseParams']"
          },
          "columns": {
            "systemName": "系统名称",
            "resourceName": "资源名称",
            "operationContent": "操作内容",
            "accountId": "操作账号ID",
            "operator": "操作人",
            "operationDate": "操作日期",
            "requestPath": "请求路径",
            "requestParams": "请求参数",
            "responseParams": "返回参数",
            "ip": "IP",
            "linkIp": "linkIP"
          }
        },
        "adminLog": {
          "label": "管理后台服务",
          "url": "https://your-service-management-host/#/admin-service-log-route",
          "selectors": {},
          "columns": {}
        }
      }
    }
  }
}
```

If using an active `flowmind.config.json`, wrap the same block under `skillConfig.skills`.

## Log Enrichment (Entity ID → Name, Customer-Service Report)

Operation log records often carry opaque entity IDs inside `requestParams` / `responseParams` (for example product IDs). Configure an `enrichment` block to resolve those IDs to readable names through an MCP data source, then FlowMind renders a customer-service readable report (`csReport`).

```json
{
  "enrichment": {
    "mcpServers": {
      "aliyun-dms-mcp-server": {
        "url": "https://your-dms-mcp-endpoint/sse",
        "type": "sse",
        "headers": {
          "Authorization": "Bearer paste-dms-token"
        }
      },
      "sls-logs": {
        "url": "https://your-sls-mcp-gateway/mcp",
        "type": "http",
        "headers": {
          "mcp_token": "paste-token"
        }
      }
    },
    "productLookup": {
      "provider": "dms",
      "mcpServer": "aliyun-dms-mcp-server",
      "idPattern": "\\d{17,25}",
      "batchSize": 20,
      "maxIds": 100,
      "sources": [
        {
          "name": "primary-menu-source",
          "databaseId": "paste-dms-database-id",
          "table": "your-schema.menu_item",
          "idField": "ID",
          "nameField": "NAME",
          "extraFields": ["STORE_ID", "PRICE", "STATUS", "IS_DELETED"],
          "statusMap": { "0": "on sale", "1": "sold out" }
        }
      ]
    },
    "activityLookup": {
      "provider": "dms",
      "mcpServer": "aliyun-dms-mcp-server",
      "sources": [
        {
          "name": "activity-source",
          "databaseId": "paste-dms-database-id",
          "table": "your-schema.menu_item_activity",
          "idField": "menu_id",
          "nameField": null,
          "extraFields": ["activity_price", "discount_rate", "begin_date", "end_date", "state"],
          "statusMap": { "0": "inactive", "1": "active", "2": "pending", "3": "expired" }
        }
      ]
    }
  }
}
```

Behavior:

- `sources` is an ordered chain: each unresolved ID falls through to the next source (first hit wins). Store product tables and retail goods tables can be chained this way.
- `idPattern` extracts candidate entity IDs from record `requestParams`/`responseParams` text. The default `\d{17,25}` matches snowflake-style IDs and ignores short IDs like store IDs.
- IDs and field names are sanitized before SQL is built; only `SELECT ... WHERE <idField> IN (...)` statements are generated.
- SSE-type MCP servers (Aliyun DMS) use the MCP SSE handshake (`GET /sse` → session POST); HTTP-type gateways use plain JSON-RPC POST.
- Enrichment is fail-soft: data-source errors are reported in `data.enrichment.diagnostics.error` and the raw records are still returned.
- The skill output gains `data.csReport` (title, markdown table, one-line-per-operation `lines`, top products, unresolved IDs) plus `record.products[]` on each record.

Soft product filtering: a query mentioning 商品 sets `entityType: "product"` instead of forwarding a hard `resourceName` filter, so records are fetched first and product-related rows are selected at report time (IDs resolved to names). Explicit filters like `资源名称=商品` still behave as hard filters.

## Browser Login State

- Start from a browser profile where the user has manually logged in.
- If login is expired, pause and ask the user to log in manually, then continue.
- Do not store account passwords in FlowMind config.
- If using the page API, call it with the browser session credentials instead of copying production cookies into code.

## Local API Binding

Real page URLs, API URLs, query parameter names, response JSON paths, response field paths, and screenshots from browser DevTools are user-local binding data. Do not add them to this skill, README, tests, or npm-published files.

To bind a page API:

1. Log in manually in Chrome.
2. Open DevTools Network.
3. Run a normal query on the target log page.
4. Copy the request URL, method, query/body parameter names, response record path, and response field paths.
5. Save those values only in `~/.flowmind/skill-config.json`.

If the page API does not support a filter, omit that filter from `parameterMap`. FlowMind will fetch the available data first and apply semantic matching to the returned records.

For time range filters, map `fromMs`/`toMs` (epoch milliseconds, local timezone, `toMs` defaults to end-of-day for date-only values) to the page API's date fields. Keep the configured API URL free of baked-in query parameters for mapped filters: for GET requests the executor rebuilds mapped query parameters from the current query and removes stale captured values.

If the page API authenticates through request headers (for example a token header added by the page's own HTTP client, visible as `resultCode: "401"` / 鉴权失败 when replayed without them), the extension learns those headers at query time: it hooks the page's own requests to the API origin, and if none are observed it reloads the target page once to trigger the page's default query, then replays the learned headers (10-minute freshness). Learned headers stay only in page memory and are never written to FlowMind config; diagnostics report header names only.

You can also let the browser extension capture one manual query and save the binding locally:

```bash
flowmind browser-bind --target merchantLog
```

Keep `flowmind browser-bridge` running, then open the log page in the logged-in Chrome profile. FlowMind will show a page prompt; set representative filters and click `查询` once. The extension captures the request/response, infers `parameterMap`, `responsePath`, and `fieldMap`, and writes only to `~/.flowmind/skill-config.json`.

Use `--target adminLog` when binding the management backend service log page.

## Browser Extension Bridge

For a guided local setup, run:

```bash
flowmind browser-setup
```

This writes the real target URLs and bridge token only to user-local config. It cannot silently install the Chrome extension because Chrome requires the user to approve unpacked extensions.

Then start the local bridge:

```bash
flowmind browser-bridge
```

On macOS, install the bridge as a user background service so it starts automatically after login:

```bash
flowmind browser-service install
flowmind browser-service status
```

Service commands:

- `flowmind browser-service install`: write and load the user LaunchAgent.
- `flowmind browser-service start`: load an existing service.
- `flowmind browser-service stop`: stop the service.
- `flowmind browser-service status`: show installed/running state.
- `flowmind browser-service uninstall`: stop and remove the service.

The service still listens only on loopback and reads the bridge token from local FlowMind config. It does not store browser cookies or bypass login.

Load the unpacked Chrome extension from:

```text
browser-extension/service-management-log
```

Paste the printed bridge token into the extension options page and enable polling. The bridge only listens on loopback and the extension only receives read-only service-management-log tasks.

In the extension options, grant only the service management backend origin, for example:

```text
https://your-service-management-host/*
```

Open either target page from your local FlowMind config in the same Chrome profile and complete normal login first.

If Chrome shows the login page, sign in manually. If Chrome shows "无法访问此网站", fix VPN/proxy/network access before running FlowMind; the browser bridge does not bypass network or authentication.

Do not commit real internal host names, paths, API URLs, bridge tokens, cookies, or account data to this skill or any publishable FlowMind file. Keep real targets only in user-local config such as `~/.flowmind/skill-config.json`.

## Required Target Fields

Each target should define:

- `label`: Human-readable source name.
- `url`: Log page URL.
- `api`: Optional authenticated page API. Prefer this for stable paging.
- `selectors`: DOM selectors used when API is unavailable.
- `columns`: Mapping from normalized field names to visible table headers.

## Normalized Record Fields

Executors should normalize rows to these field names:

- `systemName`
- `resourceName`
- `operationContent`
- `accountId`
- `operator`
- `operationDate`
- `requestPath`
- `requestParams`
- `responseParams`
- `ip`
- `linkIp`
