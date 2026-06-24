/**
 * Aliyun SLS Log Service Adapter
 * Wraps the friday-sls-logs MCP server for Alibaba Cloud SLS queries
 */

const LogServiceAdapter = require('../../adapters/log-service-adapter');

class AliyunSlsAdapter extends LogServiceAdapter {
  constructor(config = {}) {
    super('aliyun-sls', config);

    // Register MCP tool mappings
    this.registerTool('queryLogs', 'queryLogs');
    this.registerTool('listProject', 'listProject');
  }

  get mcpServer() {
    return 'friday-sls-logs';
  }

  /**
   * Get SLS endpoints from config.
   * Falls back to default endpoints if not configured.
   */
  getEndpoints() {
    if (this.config.config && this.config.config.endpoints) {
      return this.config.config.endpoints;
    }
    return {
      test: 'cn-shenzhen.log.aliyuncs.com',
      prod: 'cn-hongkong.log.aliyuncs.com'
    };
  }

  /**
   * Get the endpoint for a given environment.
   * @param {string} env - 'test', 'uat', 'gray', 'prod'
   * @returns {string}
   */
  getEndpoint(env) {
    const endpoints = this.getEndpoints();
    // uat maps to test, gray maps to prod
    const envMap = { uat: 'test', gray: 'prod' };
    const mappedEnv = envMap[env] || env;
    return endpoints[mappedEnv] || endpoints.test;
  }

  async queryLogs(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('queryLogs'),
      params
    };
  }

  async listProjects() {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listProject'),
      params: {}
    };
  }

  /**
   * Build query parameters for SLS log query.
   * @param {object} params
   * @returns {object} MCP-compatible parameters
   */
  buildQueryParams(params) {
    const { project, logstore, query, from, to, line = 100, env } = params;
    const endpoint = this.getEndpoint(env || 'test');

    return {
      endpoint,
      project: project || this.config.config?.defaultProject,
      logstore: logstore || this.config.config?.defaultLogstore,
      query: query || '',
      from,
      to,
      line,
      reverse: true
    };
  }
}

module.exports = AliyunSlsAdapter;
