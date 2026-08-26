---
name: sls-log-audit
description: SLS log audit skill for FlowMind. Query cloud log service (SLS, ELK, etc.), trace ID chain analysis, Feign call chain extraction, response time analysis, and error log investigation.
metadata:
  version: "1.1.0"
  author: flowmind
  category: monitoring
componentDependencies:
  - logService
---

# SLS Log Audit Skill

Query and analyze Alibaba Cloud SLS (Simple Log Service) logs for troubleshooting, performance analysis, and chain tracing.

## Features

### Log Query
- Time-range based log search
- Service-level filtering
- Log level filtering (ERROR, WARN, INFO, DEBUG)
- Keyword and pattern search

### TraceID Chain Analysis
- Full call chain extraction by TraceID
- Request/Response data capture
- Timing analysis per span
- Error location pinpointing

### Feign Call Chain
- Remote call chain extraction
- Upstream/downstream service mapping
- Call latency analysis
- Failure point identification

### Performance Analysis
- Response time analysis
- Slow endpoint detection
- Timeout investigation
- Bottleneck identification

## Trigger Patterns

```
"SLS日志", "sls", "日志审查", "日志排查"
"线上日志", "错误日志", "异常日志", "告警日志"
"traceId", "链路追踪", "调用链", "链路分析"
"Feign链路", "feign调用", "远程调用", "RPC链路"
"响应耗时", "接口耗时", "耗时分析", "慢接口"
"性能分析", "超时排查", "RT分析", "响应时间"
"线上问题", "排查问题", "定位问题", "问题分析"
```

## Output Format

### TraceID Chain Output

```
┌─────────────────────────────────────────────────────┐
│ TraceID Chain Analysis                              │
├─────────────────────────────────────────────────────┤
│ TraceID: {traceId}                                  │
│ Total Duration: {ms}ms                              │
│ Spans: {count}                                      │
├─────────────────────────────────────────────────────┤
│ 1. {service} - {method}                             │
│    URL: {url}                                       │
│    Duration: {ms}ms                                 │
│    Status: {status}                                 │
│    Request: {params}                                │
│    Response: {result}                               │
│                                                    │
│    2. {sub-service} - {method}                      │
│       Duration: {ms}ms                              │
│       Status: {status}                              │
├─────────────────────────────────────────────────────┤
│ Errors: {error_count}                               │
│ • {error_message} at {service}:{line}               │
└─────────────────────────────────────────────────────┘
```

### Log Query Output

```
┌─────────────────────────────────────────────────────┐
│ SLS Log Query Results                               │
├─────────────────────────────────────────────────────┤
│ Query: {query}                                      │
│ Time Range: {start} ~ {end}                         │
│ Results: {count} logs                               │
├─────────────────────────────────────────────────────┤
│ [{timestamp}] [{level}] {service} - {message}       │
│ [{timestamp}] [{level}] {service} - {message}       │
└─────────────────────────────────────────────────────┘
```

## Component Integration

This skill uses the **logService** component. The actual log service provider is determined by configuration.

| Provider | MCP Server | Description |
|----------|------------|-------------|
| aliyun-sls | sls-logs | Alibaba Cloud SLS |
| baidu-sls | baidu-sls-logs | Baidu Cloud Log Service |
| elk | (direct) | Elasticsearch |

Configuration is managed in `flowmind.config.json` under `components.logService`.

**Endpoints** (aliyun-sls provider): environment-to-region mapping is a
company deployment fact — configure it locally in
`components.logService.providers.aliyun-sls.config.endpoints`
(e.g. `"<region-id>.log.aliyuncs.com"` per environment); the skill never
guesses a region.

**Environment-aware logstore selection**:

- `test环境` / `在test环境` / `测试环境` will resolve to the test logstore automatically
- `uat` / `预发` will resolve to the UAT logstore automatically
- Explicit `logstore` still wins if the user provides one

## Query Caveats (业务逻辑注意事项)

采集/巡检类日志查询必须遵守，避免把工具问题或业务语义误判为结论：

1. **参数书写**：`logstore=xxx`、`project=xxx` 等参数后必须跟空格或行尾，禁止紧跟中文逗号/
   括号再接其他描述（`(\S+)` 会把「your-logstore，时间范围…」整段吞进参数值，SLS 报
   `invalid request method`）。关键词写在输入末尾，避免被前置冒号污染（如 `"：关键词"`）。
2. **字段优先于文案**：业务字段名（如 `deliveryFee`）与展示文案（如「费用 $x 起」）
   可能不一致；先从设计规格/接口文档确定字段名与预期格式，
   再按字段名+文案双路搜索。搜不到预期字段 ≠ 改造未做（见 release-inspection 比对原则 2）。
3. **端点确认用 corrId**：同一服务有网关转发（`:8080/服务名/路由`）与直连两种请求，
   同一响应体可能被多个端点复用（如 `search/get_search_list` 与
   `store/get_home_list` 结构相似）。下结论前必须用 corrId 关联
   Incoming Request 的 URL 确认端点，禁止按响应内容猜测归属。
4. **null/缺失的业务语义**：字段为 null 可能因超配送范围、门店打烊、活动态、透传上游为空，
   也可能是范围外链路本就未接入；需结合请求上下文（定位/门店状态）与需求范围判断，
   不得直接记为异常或「未完成」。
5. **样本与窗口**：`reverse:true` 只取最新 N 条，结论需标注样本量与时间窗；同一 corrId 的
   请求/响应需成对核验，避免把请求日志当响应证据。

## Learning Integration

This skill supports FlowMind learning:

- **Query Patterns**: Learns common query patterns
- **Output Format**: Learns preferred display format (sequential list, tree, etc.)
- **Service Mapping**: Learns service-to-project mappings

## Examples

### Example 1: TraceID Analysis

```
User: 查询 traceId abc123 的日志

FlowMind:
┌─────────────────────────────────────────────────────┐
│ TraceID Chain Analysis                              │
├─────────────────────────────────────────────────────┤
│ TraceID: abc123                                     │
│ Total Duration: 256ms                               │
│ Spans: 5                                            │
├─────────────────────────────────────────────────────┤
│ 1. order-service - createOrder                      │
│    URL: /api/orders                                 │
│    Duration: 256ms                                  │
│    Status: 200                                      │
│                                                    │
│    2. user-service - getUserInfo                    │
│       Duration: 45ms                                │
│       Status: 200                                   │
│                                                    │
│    3. inventory-service - checkStock                │
│       Duration: 120ms                               │
│       Status: 200                                   │
│                                                    │
│    4. payment-service - createPayment               │
│       Duration: 89ms                                │
│       Status: 200                                   │
└─────────────────────────────────────────────────────┘
```

### Example 2: Error Investigation

```
User: 排查线上错误日志

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Error Log Investigation                             │
├─────────────────────────────────────────────────────┤
│ Service: order-service                              │
│ Time: Last 1 hour                                   │
│ Errors Found: 3                                     │
├─────────────────────────────────────────────────────┤
│ 🔴 NullPointerException at OrderService.java:128    │
│    TraceID: xyz789                                  │
│    Context: user_id=12345, order_id=67890           │
│                                                    │
│ 🟡 TimeoutException at FeignClient.java:45          │
│    TraceID: def456                                  │
│    Service: inventory-service                       │
│    Duration: 5001ms (timeout: 5000ms)               │
└─────────────────────────────────────────────────────┘
```

## Configuration

Skill-specific configuration:

```json
{
  "sls-log-audit": {
    "defaultProject": "your-project",
    "defaultLogstore": "your-logstore",
    "queryLimit": 100,
    "timeRange": {
      "default": "1h",
      "max": "24h"
    }
  }
}
```

Component provider configuration (in `flowmind.config.json`):

```json
{
  "components": {
    "logService": {
      "default": "aliyun-sls",
      "providers": {
        "aliyun-sls": {
          "adapter": "aliyun-sls-adapter",
          "enabled": true,
          "mcpServer": "sls-logs",
          "config": {
            "endpoints": {
              "test": "<region-id>.log.aliyuncs.com",
              "uat": "<region-id>.log.aliyuncs.com",
              "gray": "<region-id>.log.aliyuncs.com",
              "prod": "<region-id>.log.aliyuncs.com"
            },
            "envConfig": {
              "test": {
                "project": "test-project",
                "logstore": "test-app-log"
              },
              "uat": {
                "project": "uat-project",
                "logstore": "uat-log"
              }
            }
          }
        }
      }
    }
  }
}
```
