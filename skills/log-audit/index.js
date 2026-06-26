/**
 * Log Audit Skill
 * Analyzes application logs, traces requests, debugs performance issues
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /日志分析|log.*audit|日志查询|查日志|log.*analy|trace.*id|调用链/i.test(input);
  },

  async execute(input, context) {
    const logService = context.componentRegistry?.getAdapter('logService');
    const params = parseLogParams(input);

    if (!logService && !params.mock) {
      return {
        type: 'result',
        skill: 'log-audit',
        message: 'Log service not configured. Connect an SLS/ELK log service first.',
        data: { params, hint: 'Use `flowmind resource` to configure log service connections' },
        input,
        timestamp: new Date().toISOString()
      };
    }

    // If we have a log service, format the query for MCP tools
    if (params.traceId) {
      return {
        type: 'result',
        skill: 'log-audit',
        message: `Trace query for: ${params.traceId}`,
        data: {
          action: 'trace',
          traceId: params.traceId,
          query: `* and "${params.traceId}"`,
          timeRange: params.timeRange || 'last 1 hour',
          endpoint: params.endpoint || 'cn-shenzhen.log.aliyuncs.com'
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'log-audit',
      message: `Log query: ${params.service || 'all services'}, ${params.level || 'all levels'}, ${params.timeRange || 'last 1 hour'}`,
      data: {
        action: 'query',
        query: buildSLSQuery(params),
        timeRange: params.timeRange || 'last 1 hour',
        endpoint: params.endpoint || 'cn-shenzhen.log.aliyuncs.com',
        limit: params.limit || 100
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseLogParams(input) {
  const params = {};
  const traceMatch = input.match(/(?:trace[_-]?id|调用链)\s*[:=]?\s*(\S+)/i);
  if (traceMatch) params.traceId = traceMatch[1];

  const serviceMatch = input.match(/(?:服务|service)\s*[:=]?\s*(\S+)/i);
  if (serviceMatch) params.service = serviceMatch[1];

  const levelMatch = input.match(/(?:级别|level)\s*[:=]?\s*(ERROR|WARN|INFO|DEBUG)/i);
  if (levelMatch) params.level = levelMatch[1].toUpperCase();

  const timeMatch = input.match(/(?:最近|last)\s*(\d+)\s*(分钟|小时|分钟|min|hour)/i);
  if (timeMatch) params.timeRange = `last ${timeMatch[1]} ${timeMatch[2]}`;

  const keywordMatch = input.match(/(?:关键词|keyword|搜索|search)\s*[:=]?\s*(.+?)(?:\s*$)/i);
  if (keywordMatch) params.keyword = keywordMatch[1].trim();

  return params;
}

function buildSLSQuery(params) {
  const parts = [];
  if (params.service) parts.push(`service: ${params.service}`);
  if (params.level) parts.push(`level: ${params.level}`);
  if (params.keyword) parts.push(`"${params.keyword}"`);
  return parts.length > 0 ? parts.join(' and ') : '*';
}
