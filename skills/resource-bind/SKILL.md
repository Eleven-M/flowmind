---
name: resource-bind
description: Resource binding and connection management skill for FlowMind. Bind and manage database, Redis, and API resource connections and MCP credentials (资源绑定/连接管理). Not for deployment or pipeline execution.
metadata:
  version: "1.0.0"
  author: flowmind
  category: infrastructure
---

# Resource Bind Skill

Bind and manage database, Redis, API, and other external resource connections.

## Features

### 🗄️ Database Management
- MySQL/PostgreSQL connections
- Connection pooling
- Query execution
- Schema inspection

### 📦 Redis Management
- Redis connections
- Key operations
- Cache management

### 🔌 API Integration
- REST API connections
- Authentication management
- Request/response handling

### 🧠 Business Binding Memory
- Save MCP server, address, token, namespace, project, and similar connection fields by business
- Reuse learned bindings automatically when the same business appears again
- Keep binding records in local learning files so users do not need to re-enter the same setup repeatedly

## Trigger Patterns

```
"数据库", "database", "SQL"
"redis", "缓存", "cache"
"API连接", "API绑定", "DB连接", "接口连接"
"资源绑定", "资源", "resource"
"连接配置", "connection"
```

## Resource Types

### Database

```json
{
  "type": "mysql",
  "host": "localhost",
  "port": 3306,
  "database": "mydb",
  "username": "user",
  "password": "pass"
}
```

### Redis

```json
{
  "type": "redis",
  "host": "localhost",
  "port": 6379,
  "password": "",
  "db": 0
}
```

### API

```json
{
  "type": "rest",
  "baseUrl": "https://api.example.com",
  "auth": {
    "type": "bearer",
    "token": "xxx"
  }
}
```

## Output Format

```
┌─────────────────────────────────────────────────────┐
│ Resource Connection                                 │
├─────────────────────────────────────────────────────┤
│ Type: {resource_type}                               │
│ Status: Connected ✓                                 │
│ Host: {host}:{port}                                 │
├─────────────────────────────────────────────────────┤
│ Available:                                          │
│ • {database1}                                       │
│ • {database2}                                       │
└─────────────────────────────────────────────────────┘
```

## Learning Integration

This skill supports FlowMind learning:

- **Connection Method**: Learns preferred connection method
- **Default Database**: Learns frequently used databases
- **Query Style**: Learns query formatting preferences
- **Business Resource Binding**: Learns MCP/address/token configuration by business context

```
User: "用 source_id 连接"
FlowMind: ✓ Learned: Use source_id for connections

User: [Next connection]
FlowMind: [Uses source_id automatically]
```

### Example 3: Business Binding

```
User: 绑定零售业务 mcp=yapi-mcp 地址=https://yapi.example.com token=xxx project=retail

FlowMind:
✓ Saved learned binding for business: 零售

User: 同步零售业务接口到 YApi

FlowMind:
[Reuses learned YApi MCP/address/project binding automatically]
```

## Examples

### Example 1: Database Connection

```
User: 连接数据库查询用户表

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Database Connection                                 │
├─────────────────────────────────────────────────────┤
│ Type: MySQL                                         │
│ Host: localhost:3306                                │
│ Database: mydb                                      │
│ Status: Connected ✓                                 │
├─────────────────────────────────────────────────────┤
│ Tables:                                             │
│ • users (1000 rows)                                 │
│ • orders (5000 rows)                                │
│ • products (200 rows)                               │
└─────────────────────────────────────────────────────┘
```

### Example 2: Redis Operations

```
User: 查看 Redis 缓存状态

FlowMind:
┌─────────────────────────────────────────────────────┐
│ Redis Status                                        │
├─────────────────────────────────────────────────────┤
│ Host: localhost:6379                                │
│ Status: Connected ✓                                 │
│ Keys: 1,234                                         │
│ Memory: 45.2 MB                                     │
├─────────────────────────────────────────────────────┤
│ Recent Keys:                                        │
│ • user:123 (TTL: 3600s)                             │
│ • session:abc (TTL: 1800s)                          │
│ • cache:products (TTL: 300s)                        │
└─────────────────────────────────────────────────────┘
```

## Configuration

```json
{
  "resources": {
    "database": {
      "enabled": true,
      "type": "mysql",
      "connection": {
        "host": "localhost",
        "port": 3306,
        "database": "mydb"
      }
    },
    "redis": {
      "enabled": true,
      "connection": {
        "host": "localhost",
        "port": 6379
      }
    },
    "api": {
      "enabled": true,
      "baseUrl": "https://api.example.com"
    }
  }
}
```

## Connection Methods

### Direct Connection

```json
{
  "method": "direct",
  "host": "localhost",
  "port": 3306
}
```

### Source ID Connection

```json
{
  "method": "source_id",
  "sourceId": "your-source-id"
}
```

### Connection String

```json
{
  "method": "connection_string",
  "url": "mysql://user:pass@host:3306/db"
}
```

## Security

- Passwords are encrypted at rest
- Connections use TLS when available
- Credentials are never logged
- Connection pooling prevents exhaustion
