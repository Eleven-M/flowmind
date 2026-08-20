/**
 * Log Audit Skill
 * Analyzes application logs, traces requests, debugs performance issues
 */

const { parseLogQueryParams, extractExplicitSlsQuery } = require('../../core/log-query-parser');
const { reportProgress } = require('../../core/skill-progress');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /日志分析|log.*audit|日志查询|查日志|日志内容|查询.*日志|输出.*日志|log.*analy|trace.*id|调用链|app_name\s*:/i.test(
      input
    );
  },

  async execute(input, context) {
    const logService = context.componentRegistry?.getAdapter('logService');
    const learning = context.flowmind?.learning;
    const skillSettings = getSkillSettings(context);
    reportProgress(context, 'parse', 10, 'Parsing log query');
    const params = resolveLogQueryParams(input, context);

    if (!logService && !params.mock) {
      return createSkillError('log-audit', 'Log service not configured. Connect an SLS/ELK log service first.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: {
          params,
          hint: 'Use `flowmind resource` to configure log service connections'
        },
        retryHints: [
          'Bind a log service before retrying the query.',
          'Provide env/project/logstore explicitly if you already know the target.'
        ],
        bindingHint: buildLogBindingHint(params)
      });
    }

    reportProgress(context, 'resolve-query', 30, 'Resolving log query parameters');
    const queryInput = buildLogQueryInput(params, context, skillSettings);
    const queryParams =
      typeof logService.buildQueryParams === 'function' ? logService.buildQueryParams(queryInput) : queryInput;
    try {
      reportProgress(context, 'query-logs', 60, 'Querying log service');
      const execution = await logService.queryLogs(queryParams);
      reportProgress(context, 'summarize', 80, 'Summarizing log results');
      const summary = summarizeLogExecution(execution);
      const noRecordsMessage = summary.empty ? buildNoRecordsMessage(params, queryParams) : null;

      if (learning?.saveResourceBinding) {
        reportProgress(context, 'persist-binding', 90, 'Persisting resolved log binding');
        await persistLogQueryBinding(learning, params, queryParams, input, context, logService);
      }
      reportProgress(context, 'finalize', 95, 'Preparing log query response');

      return createSkillResult('log-audit', noRecordsMessage || buildSuccessMessage(params), {
        input,
        data: {
          action: params.traceId ? 'trace' : 'query',
          provider: logService.providerName,
          queryParams,
          resolution: summarizeLogResolution(params, queryInput, queryParams, context),
          execution: summary,
          noRecords: summary.empty,
          bindingHint: buildLogBindingHint(params, queryParams),
          skillConfig: skillSettings
        }
      });
    } catch (error) {
      return createSkillError('log-audit', `日志查询失败：${error.message}`, {
        input,
        kind: 'execution-failed',
        retryable: true,
        data: {
          action: params.traceId ? 'trace' : 'query',
          provider: logService.providerName,
          queryParams,
          resolution: summarizeLogResolution(params, queryInput, queryParams, context),
          mcpError: error.message,
          skillConfig: skillSettings
        },
        retryHints: [
          'Verify the bound log service endpoint, project, and logstore.',
          'Retry with a narrower time range or explicit service keyword.'
        ],
        bindingHint: buildLogBindingHint(params, queryParams, error)
      });
    }
  }
};

function buildSLSQuery(params) {
  if (params.rawQuery) {
    return params.rawQuery;
  }

  const parts = [];
  if (params.service) parts.push(`service: ${params.service}`);
  if (params.level) parts.push(`level: ${params.level}`);
  if (params.keyword) parts.push(`"${params.keyword}"`);
  return parts.length > 0 ? parts.join(' and ') : '*';
}

function resolveLogQueryParams(input, context = {}) {
  const parsedParams = parseLogQueryParams(input, {
    allowNaturalKeyword: true,
    allowNaturalLevel: true,
    allowQuotedKeyword: true
  });
  const aiParams = normalizeAiLogParams(context);

  return {
    ...parsedParams,
    ...aiParams,
    _parameterSource: resolveParameterSource(parsedParams, aiParams)
  };
}

function normalizeAiLogParams(context = {}) {
  const params = isPlainObject(context.params) ? context.params : {};
  const merged = {
    ...params,
    ...context
  };

  const normalized = {};
  assignIfPresent(normalized, 'traceId', merged.traceId || merged.traceID);
  assignIfPresent(normalized, 'env', merged.env || merged.environment);
  assignIfPresent(normalized, 'project', merged.project || merged.projectName);
  assignIfPresent(normalized, 'logstore', merged.logstore || merged.logStore);
  assignIfPresent(normalized, 'endpoint', merged.endpoint);
  // Explicit raw queries (AI/caller provided) must override natural-language parsing.
  assignIfPresent(normalized, 'rawQuery', merged.rawQuery || merged.slsQuery);
  assignIfPresent(normalized, 'service', merged.service || merged.serviceName || merged.appName || merged.app_name);
  assignIfPresent(normalized, 'level', normalizeLogLevel(merged.level || merged.logLevel));
  assignIfPresent(normalized, 'keyword', normalizeKeyword(merged.keyword || merged.messageFilter));
  assignIfPresent(normalized, 'timeRange', merged.timeRange);
  assignIfPresent(normalized, 'from', merged.from);
  assignIfPresent(normalized, 'to', merged.to);

  if (merged.limit !== undefined && merged.limit !== null && merged.limit !== '') {
    normalized.limit = Number(merged.limit) || merged.limit;
  }

  const rawQueryCandidate = normalizeRawQueryCandidate(merged.rawQuery || merged.query);
  if (rawQueryCandidate) {
    normalized.rawQuery = rawQueryCandidate;
  }

  return normalized;
}

function normalizeRawQueryCandidate(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const explicit = extractExplicitSlsQuery(value);
  return explicit?.query || null;
}

function normalizeLogLevel(value) {
  if (!value || typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return ['ERROR', 'WARN', 'INFO', 'DEBUG'].includes(normalized) ? normalized : null;
}

function normalizeKeyword(value) {
  if (Array.isArray(value)) {
    return value.find((item) => typeof item === 'string' && item.trim()) || null;
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveParameterSource(parsedParams, aiParams) {
  const parsedKeys = Object.keys(parsedParams || {}).filter((key) => parsedParams[key] !== undefined);
  const aiKeys = Object.keys(aiParams || {}).filter((key) => aiParams[key] !== undefined);

  if (aiKeys.length > 0 && parsedKeys.length > 0) {
    return 'ai+parser';
  }
  if (aiKeys.length > 0) {
    return 'ai';
  }
  return 'parser';
}

function assignIfPresent(target, key, value) {
  if (value === undefined || value === null || value === '') {
    return;
  }
  target[key] = value;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function buildLogQueryInput(params, context = {}, skillSettings = {}) {
  const resourceBinding = context.resourceBinding || null;
  const bindingConnection = resolveCompatibleBindingConnection(params, resourceBinding);
  const timeWindow = resolveTimeWindow(params);
  const excludeInfrastructure = skillSettings.excludeInfrastructure !== false;

  return {
    project: params.project || bindingConnection.project || undefined,
    logstore: params.logstore || bindingConnection.logstore || undefined,
    env: params.env || bindingConnection.env || undefined,
    endpoint: params.endpoint || bindingConnection.endpoint || undefined,
    traceId: params.traceId || undefined,
    service: params.service || undefined,
    level: params.level || undefined,
    keyword: params.keyword || undefined,
    timeRange: params.timeRange || undefined,
    resourceBinding,
    query: params.traceId ? `* and "${params.traceId}"` : buildSLSQuery(params),
    from: params.from || timeWindow.from,
    to: params.to || timeWindow.to,
    line: params.limit || 100,
    excludeInfrastructure
  };
}

function buildSuccessMessage(params = {}) {
  if (params.traceId) {
    return `已执行 trace 查询：${params.traceId}`;
  }

  if (params.rawQuery) {
    return `已执行日志查询：${params.rawQuery}`;
  }

  return `已执行日志查询：${params.service || '全部服务'}，${params.level || '全部级别'}，${params.timeRange || '最近 1 小时'}`;
}

function summarizeLogResolution(params, queryInput, queryParams, context = {}) {
  const resourceBinding = context.resourceBinding || null;
  const bindingConnection = resolveCompatibleBindingConnection(params, resourceBinding);
  return {
    parameterSource: params._parameterSource || 'parser',
    env: params.env || bindingConnection.env || null,
    endpoint: queryInput.endpoint || queryParams.endpoint || null,
    project: queryInput.project || queryParams.project || null,
    logstore: queryInput.logstore || queryParams.logstore || null,
    resourceBindingId: resourceBinding?.id || null,
    resourceBindingBusiness: resourceBinding?.business || null,
    source: resourceBinding
      ? Object.keys(bindingConnection).length > 0
        ? 'resource-binding'
        : 'user-or-config'
      : 'user-or-config'
  };
}

function buildLogBindingHint(params, queryParams = {}, error = null) {
  const fields = [];
  if (!queryParams.endpoint && !params.env) fields.push('环境');
  if (!queryParams.project && !params.project) fields.push('project');
  if (!queryParams.logstore && !params.logstore) fields.push('logstore');

  if (fields.length === 0) {
    return null;
  }

  const bindingCommand = `flowmind \"绑定日志 mcp=sls-logs ${params.env ? `env=${params.env} ` : ''}${params.project ? `project=${params.project} ` : ''}${params.logstore ? `logstore=${params.logstore}` : ''}\"`;
  const suggestions = [];
  suggestions.push(`缺少${joinChineseList(fields)}`);
  if (error) {
    suggestions.push(`当前查询失败：${error.message}`);
  }
  suggestions.push(`可先绑定一次日志配置：${bindingCommand}`);

  return {
    kind: 'resource-binding',
    missing: fields,
    message: suggestions.join('；'),
    suggestedCommand: bindingCommand
  };
}

function resolveTimeWindow(params = {}) {
  if (params.from && params.to) {
    return { from: params.from, to: params.to };
  }

  const now = new Date();
  const from = new Date(now.getTime() - 60 * 60 * 1000);

  return {
    from: params.from || from.toISOString(),
    to: params.to || now.toISOString()
  };
}

async function persistLogQueryBinding(learning, params, queryParams, input, context, logService) {
  const bindingConnection = resolveCompatibleBindingConnection(params, context.resourceBinding);
  const endpoint = queryParams.endpoint || params.endpoint || bindingConnection.endpoint || null;
  const project = queryParams.project || params.project || bindingConnection.project || null;
  const logstore = queryParams.logstore || params.logstore || bindingConnection.logstore || null;

  if (!endpoint && !project && !logstore) {
    return null;
  }

  const business = [params.env || queryParams.env || bindingConnection.env || null, project || logstore || 'log-query']
    .filter(Boolean)
    .join(':');

  return learning.saveResourceBinding(
    {
      business,
      componentType: 'logService',
      provider: logService.providerName,
      mcpServer: logService.mcpServer || null,
      source: 'auto-log-query',
      aliases: [params.env, project, logstore, params.service, params.keyword].filter(Boolean),
      keywords: [
        params.env,
        params.project,
        params.logstore,
        params.service,
        params.keyword,
        params.traceId,
        params.level
      ].filter(Boolean),
      connection: {
        endpoint,
        project,
        logstore,
        env: params.env || queryParams.env || bindingConnection.env || null
      },
      metadata: {
        input: input || null,
        query: queryParams.query || null,
        source: 'log-audit'
      }
    },
    {
      currentSkill: 'log-audit'
    }
  );
}

function resolveCompatibleBindingConnection(params = {}, resourceBinding = null) {
  const bindingConnection = resourceBinding?.connection || {};
  if (!bindingConnection || Object.keys(bindingConnection).length === 0) {
    return {};
  }

  const requestedEnv = normalizeEnvironmentToken(params.env);
  if (requestedEnv) {
    return {};
  }

  const bindingEnv = normalizeEnvironmentToken(bindingConnection.env);

  if (requestedEnv && bindingEnv && requestedEnv !== bindingEnv) {
    return {};
  }

  return bindingConnection;
}

function normalizeEnvironmentToken(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === '测试') return 'test';
  if (normalized === '预发') return 'uat';
  if (normalized === '灰度') return 'gray';
  if (/^(生产|线上|正式)$/.test(normalized)) return 'prod';
  return normalized;
}

function summarizeLogExecution(execution) {
  const payload = unwrapPayload(execution);
  const data = payload && typeof payload === 'object' ? payload : {};
  const records = extractRecords(data)
    .map((record, index) => ({ record, index, sortKey: parseRecordTime(record) }))
    .sort(compareRecordEntries)
    .map((entry) => entry.record);
  const empty = (extractStatus(data) || 'ok') === 'ok' && records.length === 0;

  return {
    status: extractStatus(data) || 'ok',
    total: extractTotal(data, records),
    records: records.slice(0, 50).map(summarizeRecord),
    requestId: data.requestId || data.traceId || data.id || null,
    empty,
    rawSummary: summarizeRawExecution(execution, data)
  };
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const textPayload = extractContentText(payload);
  if (textPayload) {
    return parseMaybeJson(textPayload);
  }

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
}

function extractRecords(data) {
  const candidates = [
    data.logs,
    data.records,
    data.items,
    data.result,
    data.data,
    data?.data?.data,
    data?.result?.data,
    data?.payload?.data
  ];

  for (const candidate of candidates) {
    const records = normalizeRecordArray(candidate);
    if (records.length > 0) {
      return records;
    }
  }

  if (data && typeof data === 'object') {
    for (const value of Object.values(data)) {
      const records = normalizeRecordArray(value);
      if (records.length > 0) {
        return records;
      }
    }
  }

  return [];
}

function compareRecordEntries(left, right) {
  const leftTime = left.sortKey;
  const rightTime = right.sortKey;

  if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  if (leftTime !== null && rightTime === null) {
    return -1;
  }

  if (leftTime === null && rightTime !== null) {
    return 1;
  }

  return left.index - right.index;
}

function extractStatus(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (typeof data.status === 'string') {
    return data.status;
  }

  if (data.success === false) {
    return 'error';
  }

  return null;
}

function extractTotal(data, records) {
  if (typeof data.total === 'number') return data.total;
  if (typeof data.count === 'number') return data.count;
  if (typeof data?.meta?.count === 'number') return data.meta.count;
  if (typeof data?.data?.meta?.count === 'number') return data.data.meta.count;
  return records.length;
}

function summarizeRecord(record) {
  if (!record || typeof record !== 'object') {
    return record;
  }

  const fields = extractRecognizedFields(record);
  const readable = buildReadableRecord(record, fields);
  return {
    time: extractRecordTime(record),
    service: extractRecordService(record),
    api: extractRecordApi(record, fields),
    result: extractRecordResult(record),
    fields: Object.keys(fields).length > 0 ? fields : undefined,
    readable: readable || undefined
  };
}

function extractRecordTime(record) {
  const directTime = record.time || record.timestamp || record.__time__ || record._time_ || record.logTime || null;
  if (directTime !== null && directTime !== undefined && directTime !== '') {
    return directTime;
  }

  const text = extractRecordText(record);
  if (!text) {
    return null;
  }

  const match = String(text).match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)/);
  return match ? match[1] : null;
}

function extractRecordService(record) {
  const directService =
    record.service ||
    record.serviceName ||
    record.service_name ||
    record.app ||
    record.appName ||
    record.app_name ||
    record.logger ||
    record.logger_name ||
    null;
  if (directService !== null && directService !== undefined && directService !== '') {
    return String(directService);
  }

  const text = extractRecordText(record);
  if (!text) {
    return null;
  }

  const matches = [...String(text).matchAll(/\[\s*([A-Za-z][A-Za-z0-9._-]*)\s*,[^\]]+\]/g)];
  if (matches.length === 0) {
    return null;
  }

  const candidate = matches[matches.length - 1][1];
  return candidate || null;
}

function extractRecordApi(record, fields = null) {
  const directApi =
    record.api || record.apiPath || record.path || record.url || record.uri || record.endpoint || record.route || null;
  if (directApi !== null && directApi !== undefined && directApi !== '') {
    return String(directApi);
  }

  if (fields?.api) {
    return fields.api;
  }

  const text = extractRecordText(record);
  if (!text) {
    return null;
  }

  const httpMatch = String(text).match(/\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+([^\s"'<>]+)/i);
  if (httpMatch && httpMatch[2]) {
    return `${httpMatch[1].toUpperCase()} ${httpMatch[2]}`;
  }

  const pathMatch = String(text).match(/\b(?:path|uri|url|endpoint)\s*[:=]\s*([^\s"'<>]+)/i);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  return null;
}

function extractRecordResult(record) {
  const directResult =
    record.response ||
    record.result ||
    record.res ||
    record.message ||
    record.msg ||
    record.content ||
    record.body ||
    null;
  return normalizeRecordValue(directResult) || null;
}

function extractRecognizedFields(record) {
  const text = extractRecordText(record) || '';
  const fields = {};

  setIfPresent(
    fields,
    'traceId',
    firstNonEmpty(
      record.traceId,
      record.trace_id,
      matchText(text, /(?:trace[_-]?id|traceId)\s*[:=]\s*([A-Za-z0-9._-]+)/i),
      matchBracketValue(text, 2)
    )
  );

  setIfPresent(
    fields,
    'requestId',
    firstNonEmpty(
      record.requestId,
      record.request_id,
      matchText(text, /(?:request[_-]?id|requestId)\s*[:=]\s*([A-Za-z0-9._-]+)/i)
    )
  );

  setIfPresent(
    fields,
    'spanId',
    firstNonEmpty(record.spanId, record.span_id, matchText(text, /(?:span[_-]?id|spanId)\s*[:=]\s*([A-Za-z0-9._-]+)/i))
  );

  setIfPresent(
    fields,
    'method',
    firstNonEmpty(record.method, matchText(text, /\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/i, 1))
  );

  setIfPresent(
    fields,
    'requestMethod',
    firstNonEmpty(
      record.requestMethod,
      record.reqMethod,
      matchText(
        text,
        /(?:request[_-]?(?:method|verb)|req[_-]?method)\s*[:=]\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)/i,
        1
      ),
      matchText(text, /\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/i, 1)
    )
  );

  setIfPresent(
    fields,
    'requestUrl',
    firstNonEmpty(
      record.requestUrl,
      record.request_url,
      record.requestURI,
      record.requestUri,
      record.reqUrl,
      record.req_url,
      record.requestPath,
      matchText(
        text,
        /(?:request[_-]?(?:url|uri|path)|req[_-]?(?:url|uri|path)|requestPath)\s*[:=]\s*([^\s"'<>]+)/i,
        1
      ),
      matchText(text, /\b(?:Request|REQUEST|request)\s+([A-Z]+)\s+([^\s"'<>]+)/i, 2),
      matchText(text, /\b(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+([^\s"'<>]+)/i, 1)
    )
  );

  setIfPresent(
    fields,
    'parameters',
    firstNonEmpty(
      record.parameters,
      record.params,
      record.arguments,
      matchText(text, /(?:参数|params?|arguments?)\s*[:=]\s*(.+)$/i, 1)
    )
  );

  setIfPresent(fields, 'entryType', classifyLogEntry(text));

  setIfPresent(
    fields,
    'api',
    firstNonEmpty(
      record.api,
      record.apiPath,
      record.path,
      record.url,
      record.uri,
      record.endpoint,
      record.route,
      matchText(text, /\b(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+([^\s"'<>]+)/i, 2),
      matchText(text, /\b(?:path|uri|url|endpoint)\s*[:=]\s*([^\s"'<>]+)/i, 1)
    )
  );

  setIfPresent(
    fields,
    'statusCode',
    firstNonEmpty(
      record.statusCode,
      record.status,
      matchText(text, /\bHTTP\/\d\.\d\s+(\d{3})\b/i),
      matchText(text, /\bstatus(?:Code)?\s*[:=]\s*(\d{3})\b/i),
      matchText(text, /\b(2\d\d|3\d\d|4\d\d|5\d\d)\b/)
    )
  );

  setIfPresent(
    fields,
    'durationMs',
    firstNonEmpty(
      normalizeDuration(record.duration),
      normalizeDuration(record.durationMs),
      normalizeDuration(record.cost),
      normalizeDuration(record.elapsed),
      normalizeDuration(record.elapsedMs),
      normalizeDuration(matchText(text, /\b(\d+(?:\.\d+)?)\s*ms\b/i)),
      normalizeDuration(matchText(text, /\bduration\s*[:=]\s*(\d+(?:\.\d+)?)\b/i))
    )
  );

  setIfPresent(
    fields,
    'error',
    firstNonEmpty(
      record.error,
      record.exception,
      extractErrorText(text)
    )
  );

  setIfPresent(
    fields,
    'responseSummary',
    firstNonEmpty(record.responseSummary, record.responseText, record.response_message, extractResponseText(text))
  );

  setIfPresent(fields, 'sql', firstNonEmpty(record.sql, extractSqlText(text)));

  return fields;
}

function extractSqlText(text) {
  if (!text) {
    return null;
  }

  const trimmed = String(text).trim();
  if (/^(?:==>\s*)?(?:Preparing:|Executing:)\s+/i.test(trimmed)) {
    return trimmed.replace(/^(?:==>\s*)?(?:Preparing:|Executing:)\s+/i, '').trim();
  }

  if (/^(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(trimmed)) {
    return trimmed;
  }

  return null;
}

function extractResponseText(text) {
  if (!text) {
    return null;
  }

  const trimmed = String(text).trim();

  const httpBody = extractHttpResponseBody(trimmed);
  if (httpBody !== null) {
    return httpBody;
  }

  const bracketedBody = extractBracketedResponseBody(trimmed);
  if (bracketedBody !== null) {
    return bracketedBody;
  }

  if (/^<==/i.test(trimmed)) {
    return trimmed.replace(/^<==\s*/i, '').trim();
  }

  const responseMatch = trimmed.match(/^(?:response|resp|返回结果|返回|结果|result)\s*[:=]\s*(.+)$/i);
  if (responseMatch && responseMatch[1]) {
    return responseMatch[1].trim();
  }

  return null;
}

function extractBracketedResponseBody(text) {
  const match = String(text || '').match(/^\[[^\]]+\]\s+(.+)$/);
  if (!match?.[1]) {
    return null;
  }

  const body = match[1].trim();
  if (!body) {
    return null;
  }

  if (/^(?:<---|--->|HTTP\/\d\.\d\b)/i.test(body)) {
    return null;
  }

  if (/^(?:Connection|Content-Type|Date|Transfer-Encoding|server:|x-[A-Za-z-]+:|cache-control:|set-cookie:)\b/i.test(body)) {
    return null;
  }

  if (/^(?:\{[\s\S]*\}|\[[\s\S]*\]|".*"|-?\d+(?:\.\d+)?|true|false|null)\s*$/i.test(body)) {
    return body;
  }

  return null;
}

function extractErrorText(text) {
  if (!text) {
    return null;
  }

  const normalized = String(text).replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return null;
  }

  if (looksLikeStructuredSnippet(normalized)) {
    return null;
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/^(?:error|exception|fail(?:ed)?|timeout|错误|异常|失败)\b[:\s-]*/i.test(line)) {
      return line;
    }
    if (/\b[A-Za-z0-9$.]*(Exception|Error)\b/.test(line)) {
      return line;
    }
  }

  const inlineMatch = normalized.match(/\b(?:error|exception|fail(?:ed)?|timeout)\b[:\s-]*([^\n]+)/i);
  return inlineMatch?.[0] || null;
}

function extractHttpResponseBody(text) {
  if (!/^(?:Outgoing|Incoming)\s+Response:/i.test(String(text || '').trim())) {
    return null;
  }

  const normalized = String(text).replace(/\r\n/g, '\n');
  const sections = normalized.split(/\n\s*\n/);
  if (sections.length < 2) {
    const inlineMatch = normalized.match(/^(?:Outgoing|Incoming)\s+Response:[^\n]*\n(?:[^\n]*\n)*?\n([\s\S]+)$/i);
    return inlineMatch?.[1]?.trim() || null;
  }

  const body = sections[sections.length - 1].trim();
  return body || null;
}

function classifyLogEntry(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    return null;
  }

  if (/^<==/i.test(trimmed) || /(?:response|resp|返回结果|返回|结果|result)\s*[:=]/i.test(trimmed)) {
    return 'response';
  }

  if (/(?:parameters?|参数|arguments?)\s*[:=]/i.test(trimmed)) {
    return 'parameters';
  }

  if (/^(?:==>\s*)?(?:Preparing:|Executing:)\s+/i.test(trimmed)) {
    return 'request';
  }

  return null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    return value;
  }
  return null;
}

function setIfPresent(target, key, value) {
  if (value === null || value === undefined || value === '') {
    return;
  }
  target[key] = value;
}

function matchText(text, regex, groupIndex = 1) {
  if (!text) {
    return null;
  }

  const match = String(text).match(regex);
  return match && match[groupIndex] ? match[groupIndex] : null;
}

function matchBracketValue(text, groupIndex = 1) {
  if (!text) {
    return null;
  }

  const match = String(text).match(/\[\s*([A-Za-z][A-Za-z0-9._-]*)\s*,\s*([A-Za-z0-9._-]+)(?:\s*,|\])/);
  return match && match[groupIndex] ? match[groupIndex] : null;
}

function normalizeDuration(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric)) {
    return null;
  }

  return Math.round(numeric);
}

function looksLikeStructuredSnippet(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  return /[{\[]/.test(text) && /"[^"]+"\s*:/.test(text);
}

function buildReadableRecord(record, fields) {
  const items = [];
  const time = extractRecordTime(record);
  const service = extractRecordService(record);
  const api = extractRecordApi(record, fields);
  const result = extractRecordResult(record);
  const text = extractRecordText(record);

  if (time) items.push({ label: '时间', value: time });
  if (service) items.push({ label: '服务', value: service });

  if (api || fields?.method) {
    const method = fields?.method ? `${fields.method} ` : '';
    items.push({ label: '接口', value: `${method}${api || '未识别'}`.trim() });
  }

  if (fields?.requestUrl) {
    const method = fields?.requestMethod ? `${fields.requestMethod} ` : '';
    items.push({ label: '入口URL', value: `${method}${fields.requestUrl}`.trim() });
  }

  if (fields?.statusCode) {
    items.push({
      label: '状态',
      value: formatStatusText(fields.statusCode)
    });
  }

  if (fields?.durationMs !== undefined && fields?.durationMs !== null) {
    items.push({ label: '耗时', value: `${fields.durationMs}ms` });
  }

  if (fields?.traceId) {
    items.push({ label: 'TraceId', value: fields.traceId });
  }

  if (fields?.requestId) {
    items.push({ label: '请求ID', value: fields.requestId });
  }

  if (fields?.error) {
    items.push({ label: '错误原因', value: simplifyReadableText(fields.error) });
  }

  if (fields?.sql) {
    items.push({ label: 'SQL', value: simplifyReadableText(fields.sql, 180) });
  }

  if (result && (!fields?.sql || simplifyReadableText(result) !== simplifyReadableText(fields.sql))) {
    items.push({ label: '结果', value: simplifyReadableText(result, 180) });
  }

  const summaryParts = [];
  if (service) summaryParts.push(service);
  if (api) summaryParts.push(api);
  if (fields?.statusCode) summaryParts.push(formatStatusText(fields.statusCode));
  if (fields?.durationMs !== undefined && fields?.durationMs !== null) summaryParts.push(`${fields.durationMs}ms`);

  const summary = summaryParts.length > 0 ? summaryParts.join(' | ') : simplifyReadableText(text || result || '', 120);

  return {
    summary,
    items
  };
}

function formatStatusText(statusCode) {
  const code = String(statusCode || '').trim();
  if (!code) {
    return '状态未知';
  }

  if (code.startsWith('2')) return `成功(${code})`;
  if (code.startsWith('3')) return `重定向(${code})`;
  if (code.startsWith('4')) return `客户端错误(${code})`;
  if (code.startsWith('5')) return `服务端错误(${code})`;
  return `状态(${code})`;
}

function simplifyReadableText(value, maxLength = 120) {
  const text = normalizeRecordValue(value);
  if (!text) {
    return '';
  }

  const compact = text
    .replace(/\s+/g, ' ')
    .replace(/^==>\s*/g, '')
    .replace(/^<==\s*/g, '')
    .trim();

  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 1)}…`;
}

function extractRecordText(record) {
  return (
    normalizeRecordValue(record.response) ||
    normalizeRecordValue(record.result) ||
    normalizeRecordValue(record.message) ||
    normalizeRecordValue(record.content) ||
    normalizeRecordValue(record.msg) ||
    normalizeRecordValue(record.body) ||
    normalizeRecordValue(record.text) ||
    null
  );
}

function normalizeRecordValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeRecordValue(item))
      .filter(Boolean)
      .join(' ');
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  return String(value);
}

function parseRecordTime(record) {
  const directTime = record.time || record.timestamp || record.__time__ || record._time_ || record.logTime || null;
  if (directTime !== null && directTime !== undefined && directTime !== '') {
    const parsedDirect = normalizeComparableTime(directTime);
    if (parsedDirect !== null) {
      return parsedDirect;
    }
  }

  const text = extractRecordText(record);
  if (!text) {
    return null;
  }

  const match = String(text).match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?)/);
  return match ? normalizeComparableTime(match[1]) : null;
}

function normalizeComparableTime(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e11 ? Math.trunc(value / 1000) : Math.trunc(value);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== '') {
    return numeric > 1e11 ? Math.trunc(numeric / 1000) : Math.trunc(numeric);
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return Math.trunc(parsed / 1000);
  }

  return null;
}

function extractContentText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const textItem = content.find((item) => item && typeof item.text === 'string');
  return textItem ? textItem.text : null;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return { text: value };
  }
}

function normalizeRecordArray(candidate) {
  if (!Array.isArray(candidate)) {
    return [];
  }

  return candidate.filter((item) => item && typeof item === 'object');
}

function buildNoRecordsMessage(params, queryParams = {}) {
  if (params.traceId) {
    return `未找到符合 traceId：${params.traceId} 的日誌。請補充服務、關鍵字或時間範圍。`;
  }

  if (params.keyword) {
    const suggestions = [];
    if (!params.service) {
      suggestions.push('服務');
    }
    if (!params.timeRange) {
      suggestions.push('時間範圍');
    }
    if (!params.project && !queryParams.project) {
      suggestions.push('project');
    }
    if (!params.logstore && !queryParams.logstore) {
      suggestions.push('logstore');
    }
    suggestions.push('放寬關鍵字');

    const suggestionText = suggestions.length > 0 ? `請嘗試${joinChineseList(suggestions)}。` : '請嘗試放寬關鍵字。';

    return `未找到符合關鍵字：${params.keyword} 的日誌。${suggestionText}`;
  }

  const suggestions = [];
  if (!params.service) suggestions.push('服務');
  if (!params.keyword) suggestions.push('關鍵字');
  if (!params.timeRange) suggestions.push('時間範圍');
  if (!params.project && !queryParams.project) suggestions.push('project');
  if (!params.logstore && !queryParams.logstore) suggestions.push('logstore');

  return suggestions.length > 0
    ? `未找到符合條件的日誌。請補充${joinChineseList(suggestions)}。`
    : '未找到符合條件的日誌。';
}

function joinChineseList(items) {
  const list = (items || []).filter(Boolean);
  if (list.length <= 1) {
    return list[0] || '';
  }
  if (list.length === 2) {
    return `${list[0]}或${list[1]}`;
  }
  return `${list.slice(0, -1).join('、')}或${list[list.length - 1]}`;
}

function summarizeRawExecution(execution, data) {
  const topLevelKeys = data && typeof data === 'object' ? Object.keys(data).slice(0, 12) : [];
  const contentText = extractContentText(execution);

  return {
    topLevelKeys,
    hasContent: Array.isArray(execution?.content) && execution.content.length > 0,
    contentPreview: contentText ? truncateText(contentText, 300) : null
  };
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || context.preferences || {}),
    ...(context.preferences || {}),
    ...(context.skillConfig || {})
  };
}

function truncateText(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}
