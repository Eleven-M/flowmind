/**
 * SLS Log Audit Skill
 * Query Alibaba Cloud SLS logs, trace ID chain analysis, performance analysis
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /sls.*日志|sls.*log|阿里云.*日志|trace.*分析|feign.*链|调用链.*分析/i.test(input);
  },

  async execute(input, context) {
    const params = parseSLSParams(input);

    // Determine default endpoint based on environment
    const env = params.env || 'test';
    const endpointMap = {
      test: 'cn-shenzhen.log.aliyuncs.com',
      uat: 'cn-shenzhen.log.aliyuncs.com',
      gray: 'cn-hongkong.log.aliyuncs.com',
      prod: 'cn-hongkong.log.aliyuncs.com'
    };
    const endpoint = endpointMap[env] || endpointMap.test;

    if (params.traceId) {
      return {
        type: 'result',
        skill: 'sls-log-audit',
        message: `SLS TraceID chain analysis: ${params.traceId}`,
        data: {
          action: 'trace_chain',
          traceId: params.traceId,
          query: `* and "${params.traceId}"`,
          endpoint,
          project: params.project,
          logstore: params.logstore,
          timeRange: params.timeRange || 'last 1 hour'
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.keyword?.includes('feign') || /feign/i.test(input)) {
      return {
        type: 'result',
        skill: 'sls-log-audit',
        message: 'Feign call chain extraction',
        data: {
          action: 'feign_chain',
          query: buildFeignQuery(params),
          endpoint,
          project: params.project,
          logstore: params.logstore,
          timeRange: params.timeRange || 'last 1 hour'
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'sls-log-audit',
      message: `SLS query: ${params.service || 'all'}, ${params.level || 'all'}, ${params.timeRange || 'last 1 hour'}`,
      data: {
        action: 'query',
        query: buildSLSQuery(params),
        endpoint,
        project: params.project,
        logstore: params.logstore,
        timeRange: params.timeRange || 'last 1 hour',
        limit: params.limit || 100
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseSLSParams(input) {
  const params = {};
  const traceMatch = input.match(/trace[_-]?id\s*[:=]?\s*(\S+)/i);
  if (traceMatch) params.traceId = traceMatch[1];

  const serviceMatch = input.match(/(?:服务|service)\s*[:=]?\s*(\S+)/i);
  if (serviceMatch) params.service = serviceMatch[1];

  const levelMatch = input.match(/(?:级别|level)\s*[:=]?\s*(ERROR|WARN|INFO|DEBUG)/i);
  if (levelMatch) params.level = levelMatch[1].toUpperCase();

  const projectMatch = input.match(/(?:项目|project)\s*[:=]?\s*(\S+)/i);
  if (projectMatch) params.project = projectMatch[1];

  const logstoreMatch = input.match(/(?:logstore|日志库)\s*[:=]?\s*(\S+)/i);
  if (logstoreMatch) params.logstore = logstoreMatch[1];

  const envMatch = input.match(/(?:环境|env)\s*[:=]?\s*(test|uat|gray|prod)/i);
  if (envMatch) params.env = envMatch[1].toLowerCase();

  const timeMatch = input.match(/(?:最近|last)\s*(\d+)\s*(分钟|小时|min|hour)/i);
  if (timeMatch) params.timeRange = `last ${timeMatch[1]} ${timeMatch[2]}`;

  const keywordMatch = input.match(/(?:关键词|keyword|搜索)\s*[:=]?\s*(.+?)(?:\s*$)/i);
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

function buildFeignQuery(params) {
  return `* and "feign" ${params.service ? `and service: ${params.service}` : ''}`;
}
