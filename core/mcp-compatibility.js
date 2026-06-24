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
  'friday-sls-logs': {
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
  'friday-rds-redis-query': {
    type: ComponentType.DATABASE_QUERY,
    provider: 'aliyun-rds-query',
    description: 'Direct database and Redis querying'
  },

  // Redis Monitor
  'friday-aliyun-sz-rds-redis': {
    type: ComponentType.REDIS_MONITOR,
    provider: 'aliyun-redis',
    description: 'Alibaba Cloud Redis monitoring via Prometheus'
  },

  // API Documentation
  'aomi-yapi-mcp': {
    type: ComponentType.API_DOC,
    provider: 'yapi',
    description: 'YApi API documentation management'
  },

  // Knowledge Base
  'aomi-yuque-mcp': {
    type: ComponentType.KNOWLEDGE_BASE,
    provider: 'yuque',
    description: 'Yuque knowledge base management'
  },

  // Workflow
  'friday-auto-flow': {
    type: ComponentType.WORKFLOW,
    provider: 'friday-flow',
    description: 'Friday automated workflow and pipeline management'
  },

  // Report
  'friday-auto-report': {
    type: ComponentType.REPORT,
    provider: 'friday-report',
    description: 'Friday automated test and coverage reporting'
  }
});

/**
 * Reverse mapping: from (componentType, provider) to MCP server name.
 */
const ProviderToMcp = Object.freeze({
  'logService:aliyun-sls': 'friday-sls-logs',
  'databaseManager:aliyun-dms': 'aliyun-dms-mcp-server',
  'databaseQuery:aliyun-rds-query': 'friday-rds-redis-query',
  'redisMonitor:aliyun-redis': 'friday-aliyun-sz-rds-redis',
  'apiDoc:yapi': 'aomi-yapi-mcp',
  'knowledgeBase:yuque': 'aomi-yuque-mcp',
  'workflow:friday-flow': 'friday-auto-flow',
  'report:friday-report': 'friday-auto-report'
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
