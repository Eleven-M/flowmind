# FlowMind Config Package Example

This file can be imported directly:

```bash
flowmind config --import config/flowmind-config-package.example.md
```

Preview first:

```bash
flowmind config --import config/flowmind-config-package.example.md --dry-run --json
```

```json
{
  "ai": {
    "provider": "ollama",
    "model": "llama3.1",
    "baseUrl": "http://127.0.0.1:11434"
  },
  "resources": {
    "sls": {
      "mcpServer": "sls-logs",
      "defaultEnv": "uat",
      "envConfig": {
        "test": {
          "endpoint": "cn-shenzhen.log.aliyuncs.com",
          "project": "test-project",
          "logstore": "test-logstore"
        },
        "uat": {
          "endpoint": "cn-shenzhen.log.aliyuncs.com",
          "project": "uat-project",
          "logstore": "uat-logstore"
        },
        "prod": {
          "endpoint": "cn-hongkong.log.aliyuncs.com",
          "project": "prod-project",
          "logstore": "prod-logstore"
        }
      }
    },
    "database": {
      "dms": "aliyun-dms-mcp-server",
      "directQuery": "db-redis-query",
      "defaultSourceId": "database-source-id",
      "defaultDatabaseId": "database-id",
      "defaultSchema": "public"
    },
    "redis": {
      "monitor": "redis-monitor",
      "directQuery": "db-redis-query",
      "defaultSourceId": "redis-source-id",
      "defaultKeyPrefix": "cache:",
      "defaultLabelName": "cluster"
    },
    "yapi": {
      "mcpServer": "yapi-mcp",
      "defaultProjectId": "42",
      "defaultCategoryId": "7"
    },
    "yuque": {
      "mcpServer": "yuque-mcp",
      "defaultNamespace": "team/handbook",
      "defaultSlugPrefix": "flowmind-"
    },
    "workflow": {
      "mcpServer": "auto-flow"
    },
    "report": {
      "mcpServer": "auto-report"
    }
  },
  "skills": {
    "log-audit": {
      "defaultFormat": "sequential-list",
      "excludeInfrastructure": true
    },
    "data-logic-validation": {
      "database": {
        "maxRows": 100
      },
      "redis": {
        "scanCount": 100
      },
      "validation": {
        "checkIntegrity": true,
        "checkConsistency": true,
        "checkPerformance": true
      }
    },
    "yapi-sync-interface": {
      "defaultProjectId": "42",
      "syncMode": "merge",
      "autoCreateCategory": true
    },
    "yuque-sync-design": {
      "defaultRepo": "team/handbook",
      "syncFormat": "markdown",
      "autoCreateToc": true,
      "archiveAfterSync": true
    },
    "auto-flow": {
      "workflows": {
        "path": "./workflows",
        "autoDiscover": true
      },
      "execution": {
        "parallel": true,
        "maxConcurrent": 5,
        "timeout": 3600
      }
    },
    "report-insights": {},
    "resource-bind": {}
  }
}
```
