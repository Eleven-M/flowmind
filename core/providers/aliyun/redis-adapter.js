/**
 * Aliyun Redis Monitor Adapter
 * Wraps the friday-aliyun-sz-rds-redis MCP server for Redis monitoring via Prometheus
 */

const McpAdapter = require('../../adapters/mcp-adapter');
const { ComponentType } = require('../../component-types');

class AliyunRedisAdapter extends McpAdapter {
  constructor(config = {}) {
    super('aliyun-redis', config);

    // Register MCP tool mappings
    this.registerTool('query', 'query');
    this.registerTool('queryRange', 'queryRange');
    this.registerTool('getLabelNames', 'getLabelNames');
    this.registerTool('getLabelValues', 'getLabelValues');
    this.registerTool('getSeries', 'getSeries');
    this.registerTool('getMetadata', 'getMetadata');
  }

  get componentType() {
    return ComponentType.REDIS_MONITOR;
  }

  get mcpServer() {
    return 'friday-aliyun-sz-rds-redis';
  }

  /**
   * Query Prometheus metrics at a point in time.
   * @param {string} query - PromQL expression
   * @param {string} time - Optional evaluation timestamp
   * @returns {Promise<object>}
   */
  async query(query, time) {
    return this.callMcpTool('query', { query, time });
  }

  /**
   * Query Prometheus metrics over a time range.
   * @param {string} query - PromQL expression
   * @param {string} start
   * @param {string} end
   * @param {string} step
   * @returns {Promise<object>}
   */
  async queryRange(query, start, end, step) {
    return this.callMcpTool('queryRange', { query, start, end, step });
  }

  /**
   * Get available label names.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async getLabelNames(params) {
    return this.callMcpTool('getLabelNames', params || {});
  }

  /**
   * Get values for a specific label.
   * @param {string} name - Label name
   * @param {object} params
   * @returns {Promise<object>}
   */
  async getLabelValues(name, params) {
    return this.callMcpTool('getLabelValues', { name, ...(params || {}) });
  }
}

module.exports = AliyunRedisAdapter;
