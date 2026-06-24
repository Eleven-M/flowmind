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
| aliyun-sls | friday-sls-logs | Alibaba Cloud SLS |
| baidu-sls | baidu-sls-logs | Baidu Cloud Log Service |
| elk | (direct) | Elasticsearch |

Configuration is managed in `flowmind.config.json` under `components.logService`.

**Default endpoints** (aliyun-sls provider):

| Environment | Endpoint | Region |
|-------------|----------|--------|
| test/uat | cn-shenzhen.log.aliyuncs.com | 深圳 |
| gray/prod | cn-hongkong.log.aliyuncs.com | 香港 |

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
          "mcpServer": "friday-sls-logs",
          "config": {
            "endpoints": {
              "test": "cn-shenzhen.log.aliyuncs.com",
              "prod": "cn-hongkong.log.aliyuncs.com"
            }
          }
        }
      }
    }
  }
}
```