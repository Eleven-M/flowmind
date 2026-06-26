/**
 * Data Logic Validation Skill
 * Verify SQL queries, Redis operations, and data processing logic against real data via MCP
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /数据逻辑|data.*logic.*valid|sql.*验证|redis.*验证|数据.*校验.*逻辑/i.test(input);
  },

  async execute(input, context) {
    const registry = context.componentRegistry;
    const params = parseValidationParams(input);

    // Check MCP component availability
    const dbManager = registry?.getAdapter('databaseManager');
    const dbQuery = registry?.getAdapter('databaseQuery');
    const redisMonitor = registry?.getAdapter('redisMonitor');

    const availableComponents = {
      databaseManager: !!dbManager,
      databaseQuery: !!dbQuery,
      redisMonitor: !!redisMonitor
    };

    if (params.action === 'sql') {
      if (!dbQuery) {
        return {
          type: 'result',
          skill: 'data-logic-validation',
          message: 'Database query service not configured (need friday-rds-redis-query MCP)',
          data: { availableComponents, hint: 'Configure database query MCP server first' },
          input,
          timestamp: new Date().toISOString()
        };
      }

      return {
        type: 'result',
        skill: 'data-logic-validation',
        message: `SQL validation ready for: ${params.query || 'provided query'}`,
        data: {
          action: 'validate_sql',
          query: params.query,
          mcpTool: 'mcpQueryExec',
          availableComponents
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'redis') {
      if (!redisMonitor) {
        return {
          type: 'result',
          skill: 'data-logic-validation',
          message: 'Redis monitor not configured (need friday-aliyun-sz-rds-redis MCP)',
          data: { availableComponents, hint: 'Configure Redis monitor MCP server first' },
          input,
          timestamp: new Date().toISOString()
        };
      }

      return {
        type: 'result',
        skill: 'data-logic-validation',
        message: `Redis validation ready for key: ${params.key || 'provided key'}`,
        data: {
          action: 'validate_redis',
          key: params.key,
          mcpTools: ['mcpRedisKeyGet', 'mcpRedisKeyInfo', 'mcpRedisKeys'],
          availableComponents
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'data-logic-validation',
      message: 'Data logic validation. Available: sql, redis',
      data: {
        actions: ['sql - Validate SQL queries', 'redis - Validate Redis operations'],
        availableComponents,
        requiredMCP: ['databaseManager', 'databaseQuery', 'redisMonitor']
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseValidationParams(input) {
  const params = {};
  if (/sql|查询|query|select|insert|update|delete/i.test(input)) params.action = 'sql';
  if (/redis|缓存|cache|key/i.test(input)) params.action = 'redis';

  const sqlMatch = input.match(/(?:sql|查询)\s*[:=]?\s*(select\s+.+?)(?:\s*$)/i);
  if (sqlMatch) params.query = sqlMatch[1].trim();

  const keyMatch = input.match(/(?:key|键)\s*[:=]?\s*(\S+)/i);
  if (keyMatch) params.key = keyMatch[1];

  return params;
}
