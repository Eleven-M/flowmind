---
name: log-audit
description: Log analysis and trace visualization skill for FlowMind. Analyze application logs, trace requests, debug performance issues.
metadata:
  version: "1.1.0"
  author: flowmind
  category: monitoring
componentDependencies:
  - logService
---

# Log Audit Skill

Analyze application logs, trace requests, and debug performance issues with FlowMind intelligence.

## Features

### 🔍 Log Query
- Time-based filtering
- Service filtering
- Level filtering (ERROR, WARN, INFO, DEBUG)
- Keyword search
- Trace ID lookup

### 🔗 Trace Analysis
- Full call chain visualization
- Duration breakdown
- Error identification
- Bottleneck detection

### ⚡ Performance Analysis
- Slow query detection
- Timeout identification
- Resource bottleneck analysis

## Trigger Patterns

```
"日志", "log", "查看日志", "分析日志"
"traceId", "链路", "trace", "调用链"
"错误日志", "异常日志", "error log"
"性能分析", "耗时分析", "performance"
"排查", "调试", "debug"
```

## Output Formats

### Sequential List (Default for Traces)

```
TraceId: {traceId}
Time: {startTime} ~ {endTime}
Duration: {totalDuration}ms | Requests: {count}

=== Requests ===

[1] {time} | {service} | {duration}ms
    {method} {url}
    Request: {params}
    Response: {body}

[2] {time} | {service} | {duration}ms
    {method} {url}
    Request: {params}
    Response: {body}

=== Summary ===
Bottleneck: {service} - {url} ({duration}ms)
```

### Log Summary

```
┌─────────────────────────────────────────┐
│ Log Analysis                            │
├─────────────────────────────────────────┤
│ Time: {range}                           │
│ Total: {count} | Errors: {errorCount}   │
├─────────────────────────────────────────┤
│ Key Errors:                             │
│ • [{time}] {error}                      │
│ • [{time}] {error}                      │
└─────────────────────────────────────────┘
```

## Component Integration

This skill uses the **logService** component. The actual log service provider is determined by configuration.

| Provider | MCP Server | Description |
|----------|------------|-------------|
| aliyun-sls | friday-sls-logs | Alibaba Cloud SLS |
| baidu-sls | baidu-sls-logs | Baidu Cloud Log Service |
| elk | (direct) | Elasticsearch |

Configuration is managed in `flowmind.config.json` under `components.logService`.

## Learning Integration

This skill supports FlowMind learning:

- **Output Format**: Learns preferred format
- **Query Patterns**: Learns common queries
- **Filter Preferences**: Learns which filters to apply

```
User: "用顺序列表格式"
FlowMind: ✓ Learned for log-audit

User: [Next query]
FlowMind: [Applies sequential list automatically]
```

## Configuration

Skill-specific configuration:

```json
{
  "log-audit": {
    "defaultFormat": "sequential-list",
    "excludeInfrastructure": true
  }
}
```

Log service provider is configured via `components.logService` in `flowmind.config.json`.

## Examples

### Example 1: Trace Query

```
User: 查询 traceId abc123 的完整链路

FlowMind:
TraceId: abc123
Time: 2026-06-22 10:00:00 ~ 10:00:05
Duration: 5000ms | Requests: 8

=== Requests ===

[1] 10:00:00.100 | order-service | 150ms
    POST /api/orders
    Request: {"userId": "123"}
    Response: {"orderId": "ORD-001"}

[2] 10:00:00.300 | payment-service | 2000ms ⚠️
    POST /api/payments
    Request: {"orderId": "ORD-001"}
    Response: {"status": "success"}

=== Summary ===
Bottleneck: payment-service (2000ms)
```

### Example 2: Error Analysis

```
User: 查看最近1小时的错误日志

FlowMind:
┌─────────────────────────────────────────┐
│ Error Analysis                          │
├─────────────────────────────────────────┤
│ Time: 09:00 ~ 10:00                     │
│ Errors: 3                               │
├─────────────────────────────────────────┤
│ • 09:15 NullPointerException            │
│ • 09:32 ConnectionTimeout               │
│ • 09:45 ValidationException             │
└─────────────────────────────────────────┘
```

## Query Templates

### Default (Exclude Infrastructure)

```
service != 'gateway'
AND service NOT LIKE '%-gateway'
AND service != 'nacos'
AND service != 'sentinel'
AND tag != 'health-check'
```

### Errors Only

```
level = 'ERROR'
```

### Slow Requests

```
duration > 1000
```

## Customization

### Custom Templates

```json
{
  "log-audit": {
    "templates": {
      "my-service": "service = 'my-service'",
      "slow-db": "duration > 500 AND type = 'db'"
    }
  }
}
```

### Custom Formats

```json
{
  "log-audit": {
    "formats": {
      "compact": { "maxLines": 10 },
      "detailed": { "includeHeaders": true },
      "json": { "format": "json" }
    }
  }
}
```