/**
 * Aliyun RDS Direct Query Adapter
 * Wraps the db-redis-query MCP server for SQL and Redis reads.
 */

const DatabaseQueryAdapter = require('../../adapters/database-query-adapter');

class AliyunRdsQueryAdapter extends DatabaseQueryAdapter {
  constructor(config = {}) {
    super('aliyun-rds-query', config);

    this.registerTool('fetchSources', 'mcpFetchSource');
    this.registerTool('fetchDatabases', 'mcpFetchBase');
    this.registerTool('fetchTables', 'mcpFetchTables');
    this.registerTool('fetchFields', 'mcpFetchFields');
    this.registerTool('queryExec', 'mcpQueryExec');
    this.registerTool('redisSources', 'mcpRedisSource');
    this.registerTool('redisKeys', 'mcpRedisKeys');
    this.registerTool('redisKeyGet', 'mcpRedisKeyGet');
    this.registerTool('redisScan', 'mcpRedisScan');
  }

  get mcpServer() {
    return 'db-redis-query';
  }

  async fetchSources(params) {
    return this.callMcpTool('fetchSources', params || {});
  }

  async fetchDatabases(sourceIdOrParams) {
    const params = typeof sourceIdOrParams === 'object'
      ? sourceIdOrParams
      : { source_id: sourceIdOrParams };
    return this.callMcpTool('fetchDatabases', params || {});
  }

  async fetchTables(sourceIdOrParams, schema) {
    const params = typeof sourceIdOrParams === 'object'
      ? sourceIdOrParams
      : { source_id: sourceIdOrParams, schema };
    return this.callMcpTool('fetchTables', params || {});
  }

  async fetchFields(params) {
    return this.callMcpTool('fetchFields', params || {});
  }

  async queryExec(params) {
    return this.callMcpTool('queryExec', params || {});
  }

  async redisSources(params) {
    return this.callMcpTool('redisSources', params || {});
  }

  async redisKeys(params) {
    return this.callMcpTool('redisKeys', params || {});
  }

  async redisKeyGet(params) {
    return this.callMcpTool('redisKeyGet', params || {});
  }

  async redisScan(params) {
    return this.callMcpTool('redisScan', params || {});
  }
}

module.exports = AliyunRdsQueryAdapter;
