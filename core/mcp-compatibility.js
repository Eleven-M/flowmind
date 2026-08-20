/**
 * FlowMind MCP Compatibility Layer
 * Maps existing MCP server names to component types and providers.
 * Ensures backward compatibility with existing configurations.
 */

const { ComponentType } = require('./component-types');

/**
 * Mapping from MCP server names to their component type and provider.
 * This allows skills that reference MCP servers directly to work
 * with the new component architecture.
 */
const McpServerMapping = Object.freeze({
  // Log Service
  'sls-logs': {
    type: ComponentType.LOG_SERVICE,
    provider: 'aliyun-sls',
    description: 'Alibaba Cloud SLS log queries'
  },

  // Database Manager
  'aliyun-dms-mcp-server': {
    type: ComponentType.DATABASE_MANAGER,
    provider: 'aliyun-dms',
    description: 'Alibaba Cloud DMS database management'
  },

  // Database Query
  'db-redis-query': {
    type: ComponentType.DATABASE_QUERY,
    provider: 'aliyun-rds-query',
    description: 'Direct database and Redis querying'
  },

  // Redis Monitor
  'redis-monitor': {
    type: ComponentType.REDIS_MONITOR,
    provider: 'aliyun-redis',
    description: 'Alibaba Cloud Redis monitoring via Prometheus'
  },

  // API Documentation
  'yapi-mcp': {
    type: ComponentType.API_DOC,
    provider: 'yapi',
    description: 'YApi API documentation management'
  },

  // Knowledge Base
  'yuque-mcp': {
    type: ComponentType.KNOWLEDGE_BASE,
    provider: 'yuque',
    description: 'Yuque knowledge base management'
  },

  // Workflow
  'auto-flow': {
    type: ComponentType.WORKFLOW,
    provider: 'auto-flow',
    description: 'Automated workflow and pipeline management'
  },

  // Report
  'auto-report': {
    type: ComponentType.REPORT,
    provider: 'auto-report',
    description: 'Automated test and coverage reporting'
  },
  'aliyun-mse-mcp': {
    type: ComponentType.SERVICE_GOVERNANCE,
    provider: 'aliyun-mse',
    description: 'Alibaba Cloud MSE service governance'
  },
  'huawei-cse-mcp': {
    type: ComponentType.SERVICE_GOVERNANCE,
    provider: 'huawei-cse',
    description: 'Huawei Cloud CSE service governance'
  },
  'baidu-mse-mcp': {
    type: ComponentType.SERVICE_GOVERNANCE,
    provider: 'baidu-mse',
    description: 'Baidu Cloud MSE and CSM service governance'
  }
});

/**
 * Reverse mapping: from (componentType, provider) to MCP server name.
 */
const ProviderToMcp = Object.freeze({
  'logService:aliyun-sls': 'sls-logs',
  'databaseManager:aliyun-dms': 'aliyun-dms-mcp-server',
  'databaseQuery:aliyun-rds-query': 'db-redis-query',
  'redisMonitor:aliyun-redis': 'redis-monitor',
  'apiDoc:yapi': 'yapi-mcp',
  'knowledgeBase:yuque': 'yuque-mcp',
  'workflow:auto-flow': 'auto-flow',
  'report:auto-report': 'auto-report',
  'serviceGovernance:aliyun-mse': 'aliyun-mse-mcp',
  'serviceGovernance:huawei-cse': 'huawei-cse-mcp',
  'serviceGovernance:baidu-mse': 'baidu-mse-mcp'
});

class McpCompatibility {
  /**
   * Resolve an MCP server name to its component type and provider.
   * @param {string} mcpServerName
   * @returns {object|null} - { type, provider, description }
   */
  static resolve(mcpServerName) {
    return McpServerMapping[mcpServerName] || null;
  }

  /**
   * Get the MCP server name for a component type and provider.
   * @param {string} componentType
   * @param {string} provider
   * @returns {string|null}
   */
  static getMcpServer(componentType, provider) {
    const key = `${componentType}:${provider}`;
    return ProviderToMcp[key] || null;
  }

  /**
   * Get all known MCP server names.
   * @returns {string[]}
   */
  static getAllMcpServers() {
    return Object.keys(McpServerMapping);
  }

  /**
   * Check if an MCP server name is known.
   * @param {string} mcpServerName
   * @returns {boolean}
   */
  static isKnown(mcpServerName) {
    return mcpServerName in McpServerMapping;
  }

  /**
   * Get the component type for an MCP server.
   * @param {string} mcpServerName
   * @returns {string|null}
   */
  static getType(mcpServerName) {
    const mapping = McpServerMapping[mcpServerName];
    return mapping ? mapping.type : null;
  }

  /**
   * Get all mappings for a given component type.
   * @param {string} componentType
   * @returns {object[]}
   */
  static getByType(componentType) {
    const results = [];
    for (const [server, mapping] of Object.entries(McpServerMapping)) {
      if (mapping.type === componentType) {
        results.push({ mcpServer: server, ...mapping });
      }
    }
    return results;
  }
}

module.exports = McpCompatibility;
