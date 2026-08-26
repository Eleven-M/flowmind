const { createSkillError, createSkillResult } = require('../../core/result-contract');
const { reportProgress } = require('../../core/skill-progress');
const { BrowserBridgeClient } = require('../../core/browser-automation-bridge');
const { enrichRecords } = require('./enrichment');

const SKILL_NAME = 'service-management-log-analysis';

module.exports = {
  category: 'project-ops',
  capabilities: ['browser-session-log-query', 'operation-log-analysis'],
  canHandle(input) {
    if (!input) return false;
    return /服务管理日志|商户后台日志|商户操作日志|管理后台服务|后台操作日志|服务管理操作日志|已登录浏览器.*日志|日志.*资源名称.*操作内容|门店(?:ID)?\s*[:：=]?\s*\d+.*POI显示|POI显示.*门店(?:ID)?\s*[:：=]?\s*\d+/i.test(
      input
    );
  },

  async execute(input, context = {}) {
    reportProgress(context, 'parse', 10, 'Parsing service management log query');
    const params = resolveQueryParams(input, context);
    const settings = resolveSkillSettings(context);
    const target = resolveTarget(params, settings);

    if (!target) {
      return createSkillError(SKILL_NAME, '未找到服务管理日志目标配置。', {
        input,
        kind: 'missing-config',
        retryable: true,
        data: {
          params,
          requiredConfig: buildRequiredConfigHint(settings)
        },
        retryHints: [
          '在本地 skillConfig.skills.service-management-log-analysis.targets 中配置目标（key 由项目决定，如 merchantLog/adminLog）。',
          '至少配置目标页面 url；如需自动抓取，再补充 api 或 selectors。'
        ],
        bindingHint: buildBindingHint(params, settings)
      });
    }

    const executionPlan = buildExecutionPlan(target, params, settings);
    const executor = resolveExecutor(context);

    if (!executor) {
      return createSkillResult(SKILL_NAME, '已生成服务管理日志查询计划，等待已登录浏览器执行器接入。', {
        input,
        data: {
          mode: 'plan-only',
          params,
          target: publicTarget(target),
          executionPlan: publicExecutionPlan(executionPlan),
          analysis: analyzeRecords([], params),
          configHint: buildRequiredConfigHint(settings)
        }
      });
    }

    try {
      reportProgress(context, 'query', 50, 'Querying service management logs');
      const execution = await executor({
        target,
        params,
        mode: executionPlan.mode,
        plan: executionPlan
      });
      if (execution?.error) {
        throw new Error(execution.error);
      }
      const records = normalizeRecords(
        execution?.records || execution?.data?.records || [],
        executionPlan.api?.fieldMap || target.fieldMap || {}
      );

      const authFailure = detectAuthFailure(execution, records);
      if (authFailure) {
        return createSkillError(SKILL_NAME, `页面 API 鉴权失败（${authFailure}）：请打开目标后台页面确认登录状态后重试。`, {
          input,
          kind: 'auth-failed',
          retryable: true,
          data: {
            params,
            target: publicTarget(target),
            execution: sanitizeExecution(execution)
          },
          retryHints: [
            '在浏览器中打开目标日志页面，确认未跳转到登录页；如已跳转请先手动登录。',
            '若页面已登录仍失败，请重载浏览器插件后重试，让插件重新学习页面鉴权请求头。'
          ]
        });
      }

      reportProgress(context, 'analyze', 80, 'Analyzing service management log records');
      const analysis = analyzeRecords(records, params);

      reportProgress(context, 'enrich', 90, 'Resolving entity names and building customer-service report');
      const enrichmentOutcome = records.length > 0
        ? await enrichRecords({ records, params, settings, context })
        : { csReport: null, diagnostics: { enabled: false, requestedIds: 0 } };

      const summaryParts = [`已分析服务管理日志：${records.length} 条`];
      if (enrichmentOutcome.diagnostics?.resolvedProducts > 0) {
        summaryParts.push(`已解析 ${enrichmentOutcome.diagnostics.resolvedProducts} 个商品名称`);
      }
      if (enrichmentOutcome.csReport?.lines?.length > 0) {
        summaryParts.push(`生成客服可读日志 ${enrichmentOutcome.csReport.lines.length} 条`);
      }

      return createSkillResult(SKILL_NAME, `${summaryParts.join('，')}。`, {
        input,
        data: {
          mode: executionPlan.mode,
          params,
          target: publicTarget(target),
          execution: sanitizeExecution(execution),
          records,
          analysis,
          csReport: enrichmentOutcome.csReport,
          enrichment: enrichmentOutcome.diagnostics
        }
      });
    } catch (error) {
      return createSkillError(SKILL_NAME, `服务管理日志查询失败：${error.message}`, {
        input,
        kind: 'execution-failed',
        retryable: true,
        data: {
          params,
          target: publicTarget(target),
          executionPlan: publicExecutionPlan(executionPlan),
          error: error.message
        },
        retryHints: [
          '确认浏览器已经人工登录目标后台。',
          '确认目标页面 URL、查询按钮、表格行、详情按钮或 API 配置仍然有效。',
          '缩小时间范围后重试，避免一次分页过大。'
        ]
      });
    }
  },

  resolveQueryParams,
  resolveSkillSettings,
  resolveTarget,
  buildExecutionPlan,
  analyzeRecords
};

function resolveSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {}),
    ...(context.params?.skillConfig || {})
  };
}

function resolveQueryParams(input, context = {}) {
  const merged = {
    ...(context.params || {}),
    ...context
  };
  const settings = resolveSkillSettings(context);
  const source = normalizeSource(
    pickFirst(
      merged.source,
      merged.target,
      extractAfter(input, /(?:日志来源|目标|target|source)\s*[:=：]\s*([^\s，,]+)/i),
      matchTargetByInput(input, settings)
    ),
    settings
  );
  const todayRange = /今日|今天|today/i.test(input) ? resolveTodayRange() : {};
  const storeId = pickFirst(merged.storeId, extractAfter(input, /门店\s*[:：]?\s*(\d+)/i));
  const productKeyword = /商品/.test(input) ? '商品' : null;
  const entityType = pickFirst(merged.entityType, productKeyword ? 'product' : null);
  const explicitResourceName = pickFirst(merged.resourceName, extractField(input, ['资源名称', 'resourceName']));
  const productId = pickFirst(
    merged.productId,
    extractAfter(input, /(?:商品ID|商品id|productId|product_id)\s*[:=：]?\s*([A-Za-z0-9_-]+)/i)
  );
  const productName = pickFirst(
    merged.productName,
    extractField(input, ['商品名称', '商品名', 'productName', 'product_name'])
  );

  return {
    source,
    from: pickFirst(merged.from, merged.startTime, extractField(input, ['from', '开始时间', '起始时间']), todayRange.from),
    to: pickFirst(merged.to, merged.endTime, extractField(input, ['to', '结束时间']), todayRange.to),
    timeRange: pickFirst(merged.timeRange, extractField(input, ['时间范围', 'timeRange']), todayRange.timeRange),
    resourceName: pickFirst(
      merged.resourceName,
      extractField(input, ['资源名称', 'resourceName']),
      productKeyword
    ),
    resourceNameExplicit: Boolean(explicitResourceName),
    entityType,
    operationContent: pickFirst(
      merged.operationContent,
      extractField(input, ['操作内容', 'operationContent']),
      /POI显示/i.test(input) ? 'POI显示' : null
    ),
    storeId,
    productId,
    productName,
    keyword: pickFirst(merged.keyword, extractField(input, ['keyword', '关键词']), productId, storeId, productName),
    operator: pickFirst(merged.operator, extractField(input, ['操作人', 'operator'])),
    accountId: pickFirst(
      merged.accountId,
      merged.operationAccountId,
      extractField(input, ['操作账号ID', '账号ID', 'accountId'])
    ),
    ip: pickFirst(merged.ip, extractField(input, ['IP', 'ip'])),
    requestPath: pickFirst(
      merged.requestPath,
      extractField(input, ['请求路径', 'requestPath'])
    ),
    limit: normalizeNumber(pickFirst(merged.limit, extractField(input, ['limit', '数量', '条数'])), 100),
    pageSize: normalizeNumber(pickFirst(merged.pageSize, extractField(input, ['pageSize', '每页'])), 50)
  };
}

function resolveTarget(params = {}, settings = {}) {
  const targets = settings.targets || {};
  const key = normalizeSource(params.source || settings.defaultTarget, settings);
  if (key && targets[key]) {
    return {
      key,
      ...targets[key]
    };
  }

  const fallbackKey = normalizeSource(settings.defaultTarget, settings) || Object.keys(targets)[0];
  return fallbackKey && targets[fallbackKey] ? { key: fallbackKey, ...targets[fallbackKey] } : null;
}

function buildExecutionPlan(target, params, settings = {}) {
  const hasApi = !!target.api?.url;
  const hasSelectors = !!target.selectors && Object.keys(target.selectors).length > 0;
  const preferred = settings.queryMode || 'api-first';
  const mode = preferred === 'dom' || (!hasApi && hasSelectors) ? 'dom' : hasApi ? 'api' : 'dom';
  return {
    readonly: true,
    auth: 'reuse-logged-in-browser-session',
    mode,
    pageUrl: target.url || null,
    api: hasApi
      ? {
          url: target.api.url,
          method: target.api.method || 'POST',
          credentials: target.api.credentials || 'include',
          bodyTemplate: target.api.bodyTemplate || null,
          parameterMap: target.api.parameterMap || {},
          responsePath: target.api.responsePath || {},
          fieldMap: target.api.fieldMap || target.fieldMap || {}
        }
      : null,
    selectors: hasSelectors ? target.selectors : {},
    columns: target.columns || {},
    pagination: {
      pageSize: params.pageSize,
      maxPages: settings.maxPages || Math.ceil((params.limit || 100) / (params.pageSize || 50))
    },
    filters: {
      from: params.from || null,
      to: params.to || null,
      fromMs: toEpochMs(params.from),
      toMs: toEpochMs(params.to, { endOfDay: true }),
      timeRange: params.timeRange || null,
      // Only forward explicitly provided resource names as a hard filter.
      // Heuristic keywords like 商品 become entityType for soft, report-side filtering.
      resourceName: params.resourceNameExplicit ? params.resourceName : null,
      entityType: params.entityType || null,
      operationContent: params.operationContent || null,
      storeId: params.storeId || null,
      productId: params.productId || null,
      productName: params.productName || null,
      keyword: params.keyword || null,
      operator: params.operator || null,
      accountId: params.accountId || null,
      ip: params.ip || null,
      requestPath: params.requestPath || null,
      limit: params.limit
    }
  };
}

function resolveExecutor(context = {}) {
  if (typeof context.serviceManagementLogClient === 'function') {
    return context.serviceManagementLogClient;
  }
  if (typeof context.serviceManagementLogClient?.queryLogs === 'function') {
    return context.serviceManagementLogClient.queryLogs.bind(context.serviceManagementLogClient);
  }
  if (typeof context.browserAutomation?.queryServiceManagementLogs === 'function') {
    return context.browserAutomation.queryServiceManagementLogs.bind(context.browserAutomation);
  }
  const settings = resolveSkillSettings(context);
  if (settings.browserBridge?.enabled || settings.browserBridge?.url) {
    const client = new BrowserBridgeClient(settings.browserBridge);
    return client.queryServiceManagementLogs.bind(client);
  }
  return null;
}

function analyzeRecords(records = [], params = {}) {
  const normalized = normalizeRecords(records);
  const resourceCounts = countBy(normalized, 'resourceName');
  const operationCounts = countBy(normalized, 'operationContent');
  const operatorCounts = countBy(normalized, 'operator');
  const ipCounts = countBy(normalized, 'ip');
  const suspicious = normalized.filter((record) => {
    const requestText = stringifyMaybe(record.requestParams);
    const responseText = stringifyMaybe(record.responseParams);
    return /error|exception|fail|失败|异常|unauthorized|forbidden/i.test(`${record.operationContent || ''} ${requestText} ${responseText}`);
  });
  const missingDetails = normalized.filter((record) => !record.requestParams && !record.responseParams).length;

  return {
    total: normalized.length,
    matchedFilters: {
      resourceName: params.resourceName || null,
      operationContent: params.operationContent || null,
      storeId: params.storeId || null,
      productId: params.productId || null,
      productName: params.productName || null,
      keyword: params.keyword || null
    },
    resourceCounts,
    operationCounts,
    operatorCounts,
    ipCounts,
    suspiciousCount: suspicious.length,
    suspiciousRecords: suspicious.slice(0, 20),
    missingDetails,
    topResources: topEntries(resourceCounts),
    topOperations: topEntries(operationCounts),
    topOperators: topEntries(operatorCounts),
    topIps: topEntries(ipCounts)
  };
}

function detectAuthFailure(execution = {}, records = []) {
  if (records.length > 0) return null;
  const diagnostics = execution?.diagnostics || execution?.data?.diagnostics || {};
  const code = String(diagnostics.responseCode ?? '').trim();
  const message = stringifyMaybe(diagnostics.responseMessage);
  if (code === '401' || code === '403') return `resultCode ${code}`;
  if (/鉴权失败|未登录|登录已过期|unauthorized/i.test(message)) return message.slice(0, 60);
  return null;
}

function normalizeRecords(records = [], fieldMap = {}) {
  if (!Array.isArray(records)) return [];
  return records.map((record) => ({
    ...record,
    systemName: pickFirst(mapped(record, fieldMap.systemName), record.systemName, record['系统名称']),
    resourceName: pickFirst(mapped(record, fieldMap.resourceName), record.resourceName, record['资源名称']),
    operationContent: pickFirst(mapped(record, fieldMap.operationContent), record.operationContent, record['操作内容']),
    accountId: pickFirst(mapped(record, fieldMap.accountId), record.accountId, record['操作账号ID']),
    operator: pickFirst(mapped(record, fieldMap.operator), record.operator, record['操作人']),
    operationDate: pickFirst(mapped(record, fieldMap.operationDate), record.operationDate, record['操作日期'], guessOperationDate(record)),
    requestPath: pickFirst(mapped(record, fieldMap.requestPath), record.requestPath, record['请求路径']),
    requestParams: pickFirst(mapped(record, fieldMap.requestParams), record.requestParams, record['请求参数']),
    responseParams: pickFirst(mapped(record, fieldMap.responseParams), record.responseParams, record['返回参数']),
    ip: pickFirst(record.ip, record.IP, record['IP']),
    linkIp: pickFirst(record.linkIp, record.linkIP, record['linkIP'])
  }));
}

const DATE_LIKE_KEY = /(?:opttime|createtime|operationtime|operatetime|optdate|createdate|updatedate|updatetime|time|date|日期|时间)/i;
const DATE_LIKE_VALUE = /^(?:\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{1,2}(?::\d{1,2})?)?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?|\d{13})$/;
const NON_DATE_KEYS = new Set([
  'requestParams', 'responseParams', 'systemName', 'resourceName',
  'operationContent', 'accountId', 'operator', 'requestPath', 'ip', 'linkIp', 'products'
]);

function guessOperationDate(record = {}) {
  for (const [key, value] of Object.entries(record)) {
    if (NON_DATE_KEYS.has(key)) continue;
    const text = value === undefined || value === null ? '' : String(value).trim();
    if (!text || text.length > 32) continue;
    if (DATE_LIKE_KEY.test(key) && DATE_LIKE_VALUE.test(text)) return text;
  }
  return null;
}

function countBy(records, key) {
  return records.reduce((acc, record) => {
    const value = record[key] || '(empty)';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(counts) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([value, count]) => ({ value, count }));
}

function publicTarget(target = {}) {
  return {
    key: target.key,
    label: target.label || target.key,
    hasUrl: !!target.url,
    hasApi: !!target.api?.url,
    hasSelectors: !!target.selectors && Object.keys(target.selectors).length > 0
  };
}

function publicExecutionPlan(plan = {}) {
  return {
    ...plan,
    pageUrl: plan.pageUrl ? '[configured-local-url]' : null,
    api: plan.api
      ? {
          ...plan.api,
          url: plan.api.url ? '[configured-local-api-url]' : null
        }
      : null
  };
}

function sanitizeExecution(execution = {}) {
  return {
    pageInfo: execution.pageInfo || execution.data?.pageInfo || null,
    total: execution.pageInfo?.total || execution.data?.total || execution.total || null,
    rawRecordCount: Array.isArray(execution.records) ? execution.records.length : null,
    diagnostics: sanitizeDiagnostics(execution.diagnostics || execution.data?.diagnostics || null)
  };
}

function sanitizeDiagnostics(diagnostics) {
  if (!diagnostics || typeof diagnostics !== 'object') return diagnostics || null;
  return {
    ...diagnostics,
    pageUrl: diagnostics.pageUrl ? '[configured-local-url]' : diagnostics.pageUrl
  };
}

function buildRequiredConfigHint(settings = {}) {
  const configuredTargets = Object.keys(settings.targets || {});
  return {
    configPath: 'skillConfig.skills.service-management-log-analysis',
    project: settings.project || 'service-management',
    requiredTargets: configuredTargets.length > 0 ? configuredTargets : ['<your-target-key>'],
    requiredPerTarget: ['label', 'url', 'api.url or selectors', 'columns.resourceName', 'columns.operationContent']
  };
}

function buildBindingHint(params = {}, settings = {}) {
  return {
    skill: SKILL_NAME,
    target: params.source || settings.defaultTarget || null,
    auth: 'reuse browser session after manual login',
    reference: 'skills/service-management-log-analysis/references/config.md'
  };
}

/**
 * Resolve a user-supplied source keyword against locally configured targets.
 * Matching is config-driven: each target may declare `matchKeywords`, so the
 * skill itself carries no project-specific key names.
 */
function normalizeSource(value, settings = {}) {
  if (!value) return null;
  const normalized = String(value).trim();
  const targets = settings.targets || {};
  if (targets[normalized]) return normalized;

  const lowered = normalized.toLowerCase();
  for (const [key, target] of Object.entries(targets)) {
    const keywords = Array.isArray(target?.matchKeywords) ? target.matchKeywords : [];
    if (keywords.some((keyword) => keyword && lowered.includes(String(keyword).toLowerCase()))) {
      return key;
    }
  }

  return normalized;
}

function matchTargetByInput(input, settings = {}) {
  const text = String(input || '');
  if (!text) return null;
  for (const [key, target] of Object.entries(settings.targets || {})) {
    const keywords = Array.isArray(target?.matchKeywords) ? target.matchKeywords : [];
    if (keywords.some((keyword) => keyword && text.includes(String(keyword)))) {
      return key;
    }
  }
  return null;
}

function extractAfter(input, regex) {
  const match = String(input || '').match(regex);
  return match ? match[1].trim() : null;
}

function extractField(input, aliases) {
  const text = String(input || '');
  const labels = [
    '日志来源', '目标', 'target', 'source',
    'from', '开始时间', '起始时间',
    'to', '结束时间',
    '时间范围', 'timeRange',
    '资源名称', 'resourceName',
    '操作内容', 'operationContent',
    '操作人', 'operator',
    '操作账号ID', '账号ID', 'accountId',
    'IP', 'ip',
    '请求路径', 'requestPath',
    'limit', '数量', '条数',
    'pageSize', '每页'
  ];
  const marker = new RegExp(`(?:${aliases.map(escapeRegex).join('|')})\\s*[:=：]\\s*`, 'i');
  const match = marker.exec(text);
  if (!match) return null;

  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const nextMarker = new RegExp(`(?:^|\\s|，|,)(?:${labels.map(escapeRegex).join('|')})\\s*[:=：]`, 'i');
  const next = nextMarker.exec(rest);
  const raw = next ? rest.slice(0, next.index) : rest;
  const value = raw.replace(/[，,]\s*$/, '').trim();
  return value || null;
}

function resolveTodayRange(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  return {
    timeRange: 'today',
    from: `${date} 00:00:00`,
    to: `${date} 23:59:59`
  };
}

function toEpochMs(value, options = {}) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (/^\d{10,}$/.test(text)) return Number(text);
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (!match) return null;
  const endOfDay = Boolean(options.endOfDay) && match[4] === undefined;
  const time = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    endOfDay ? 23 : Number(match[4] || 0),
    endOfDay ? 59 : Number(match[5] || 0),
    endOfDay ? 59 : Number(match[6] || 0)
  ).getTime();
  return Number.isFinite(time) ? time : null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function mapped(record, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((current, key) => current?.[key], record);
}

function normalizeNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function stringifyMaybe(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
