<![CDATA[---
name: data-logic-validation
description: Data logic validation skill for FlowMind. Verify actual SQL queries, Redis operations, and data processing logic against real data via MCP database and Redis connections.
metadata:
  version: "1.0.0"
  author: flowmind
  category: quality
---

# Data Logic Validation Skill

Verify actual data processing logic by connecting to databases and Redis via MCP, extracting real SQL queries and Redis operations from code, and validating against actual data.

## Features

### SQL Validation
- Extract actual SQL queries from code
- Verify query logic against real database
- Check data integrity and consistency
- Validate complex join and subquery logic

### Redis Validation
- Extract Redis operations from code
- Verify cache key structure and values
- Check TTL and expiration logic
- Validate cache-database consistency

### Data Flow Validation
- Trace data flow from API to database
- Verify data transformations
- Check state machine transitions
- Validate business rule enforcement

## Trigger Patterns

```
"数据验证", "data validation"
"检查实际逻辑", "查看实际 SQL"
"检查 Redis 处理", "验证缓存逻辑"
"验证数据库操作", "查看真实查询"
"排查真实数据", "搜索词"
"预测结果", "门店结果"
"数据完整性", "data integrity"
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Data Logic Validation Report                        │
├─────────────────────────────────────────────────────┤
│ Target: {module/service}                            │
│ Database: {db_name}                                 │
│ Redis: {key_pattern}                                │
├─────────────────────────────────────────────────────┤
│ SQL Queries Found: {count}                          │
│ • {query_description}: {result}                     │
├─────────────────────────────────────────────────────┤
│ Redis Operations: {count}                           │
│ • {operation}: {result}                             │
├─────────────────────────────────────────────────────┤
│ Validation Results:                                 │
│ • Data Integrity: {status}                          │
│ • Business Logic: {status}                          │
│ • Cache Consistency: {status}                       │
└─────────────────────────────────────────────────────┘
```

## Validation Workflow

```
1. Code Analysis → Extract SQL/Redis operations
2. MCP Connection → Connect to database/Redis
3. Query Execution → Run extracted queries
4. Result Comparison → Compare expected vs actual
5. Report Generation → Output validation results
```

## Learning Integration

This skill supports FlowMind learning:

- **Query Patterns**: Learns common query patterns for faster extraction
- **Connection Info**: Remembers database/Redis connection details
- **Validation Rules**: Learns project-specific validation rules

## Examples

### Example 1: SQL Validation

```
User: 验证订单查询逻辑

FlowMind:
┌─────────────────────────────────────────────────────┐
│ SQL Validation Report                               │
├─────────────────────────────────────────────────────┤
│ Source: OrderService.getOrdersByUser()              │
│ SQL: SELECT * FROM orders WHERE user_id = ?         │
├─────────────────────────────────────────────────────┤
│ ✅ Query returns correct results                    │
│ ⚠️ Missing index on user_id column                 │
│ ✅ Pagination working correctly                     │
└─────────────────────────────────────────────────────┘
```

### Example 2: Redis Validation

```
User: 验证缓存逻辑

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Redis Validation Report                             │
├─────────────────────────────────────────────────────┤
│ Key: store:{storeId}:config                         │
│ Type: Hash                                          │
│ TTL: 3600s                                          │
├─────────────────────────────────────────────────────┤
│ ✅ Key structure matches code definition            │
│ ✅ TTL configured correctly                         │
│ ⚠️ Value size: 2.5MB (consider compression)        │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "data-logic-validation": {
    "database": {
      "enabled": true,
      "maxRows": 100
    },
    "redis": {
      "enabled": true,
      "scanCount": 100
    },
    "validation": {
      "checkIntegrity": true,
      "checkConsistency": true,
      "checkPerformance": true
    }
  }
}
```
]]>