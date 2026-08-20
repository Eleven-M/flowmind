function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

const MAX_RENDER_LINES = 120;
const MAX_LINE_LENGTH = 220;
const MAX_RENDER_CHARS = 8000;
const MAX_ARRAY_ITEMS = 20;
const MAX_SCALAR_LENGTH = 160;
const MAX_LOG_RESPONSE_LENGTH = 2000;
const ANSI_RED = '\u001b[31m';
const ANSI_RESET = '\u001b[0m';

function unwrapResultPayload(result) {
  let current = result;

  while (
    isPlainObject(current) &&
    current.type === 'result' &&
    isPlainObject(current.data) &&
    current.message === undefined &&
    current.skill === undefined
  ) {
    current = current.data;
  }

  return current;
}

function pruneDisplayValue(value, options = {}) {
  const excludedKeys = new Set(options.excludeKeys || []);

  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => pruneDisplayValue(item, options)).filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      excludedKeys.has(key) ||
      ['type', 'skill', 'message', 'timestamp', 'input', 'success', 'metadata'].includes(key)
    ) {
      continue;
    }

    const pruned = pruneDisplayValue(child, options);
    if (pruned !== undefined) {
      output[key] = pruned;
    }
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function formatScalar(value) {
  if (typeof value === 'string') {
    if (value.length <= MAX_SCALAR_LENGTH) return value;
    return `${value.slice(0, MAX_SCALAR_LENGTH - 1)}…`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function sanitizeForTerminal(text) {
  return String(text)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\r\n/g, '\n');
}

function truncateRenderedText(text) {
  const sanitized = sanitizeForTerminal(text);
  const lines = sanitized.split('\n');
  const clippedLines = lines.slice(0, MAX_RENDER_LINES).map((line) => {
    if (line.length <= MAX_LINE_LENGTH) return line;
    return `${line.slice(0, MAX_LINE_LENGTH - 1)}…`;
  });

  if (lines.length > MAX_RENDER_LINES) {
    clippedLines.push(`… truncated ${lines.length - MAX_RENDER_LINES} line(s)`);
  }

  let output = clippedLines.join('\n');
  if (output.length > MAX_RENDER_CHARS) {
    output = `${output.slice(0, MAX_RENDER_CHARS - 1)}…`;
  }

  return output;
}

function renderValueLines(value, indent = '') {
  if (value === undefined) return [];

  if (Array.isArray(value)) {
    if (value.length === 0) return [];

    const allScalars = value.every((item) => !isPlainObject(item) && !Array.isArray(item));
    if (allScalars) {
      const shown = value.slice(0, MAX_ARRAY_ITEMS).map(formatScalar);
      if (value.length > MAX_ARRAY_ITEMS) {
        shown.push(`… +${value.length - MAX_ARRAY_ITEMS} more`);
      }
      return [indent + shown.join(', ')];
    }

    const lines = [];
    for (const item of value) {
      if (isPlainObject(item) || Array.isArray(item)) {
        const nested = renderValueLines(item, indent + '  ');
        if (nested.length > 0) {
          lines.push(indent + '-');
          lines.push(...nested);
        }
      } else {
        lines.push(indent + '- ' + formatScalar(item));
      }
    }
    return lines;
  }

  if (!isPlainObject(value)) {
    return [indent + formatScalar(value)];
  }

  const lines = [];
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined || child === null) {
      continue;
    }

    if (Array.isArray(child)) {
      const rendered = renderValueLines(child, indent + '  ');
      if (rendered.length === 1 && !rendered[0].startsWith(indent + '  -')) {
        lines.push(`${indent}${key}: ${rendered[0].trimStart()}`);
      } else if (rendered.length > 0) {
        lines.push(`${indent}${key}:`);
        lines.push(...rendered);
      }
      continue;
    }

    if (isPlainObject(child)) {
      lines.push(`${indent}${key}:`);
      lines.push(...renderValueLines(child, indent + '  '));
      continue;
    }

    lines.push(`${indent}${key}: ${formatScalar(child)}`);
  }

  return lines;
}

function formatResultText(result, options = {}) {
  if (result?.type === 'learning') {
    return result.message || 'Learning recorded';
  }

  if (result?.type === 'error') {
    return formatErrorResult(result);
  }

  const payload = unwrapResultPayload(result);

  if (typeof payload === 'string') {
    return payload;
  }

  if (!isPlainObject(payload)) {
    return payload === undefined ? '' : formatScalar(payload);
  }

  if (['log-audit', 'sls-log-audit'].includes(getSkillName(payload))) {
    return formatLogAuditResult(payload, options);
  }

  if (getSkillName(payload) === 'auto-flow') {
    return formatAutoFlowResult(payload);
  }

  if (['ai-status', 'ai-fallback'].includes(getSkillName(payload))) {
    if (getSkillName(payload) === 'ai-status') {
      return formatAiStatusResult(payload);
    }

    const fallbackText = formatAiFallbackResult(payload);
    if (fallbackText) {
      return truncateRenderedText(fallbackText);
    }
  }

  return formatStandardResult(payload);
}

function getSkillName(payload) {
  return payload?.skill || payload?.data?.skill || null;
}

function formatAiStatusResult(payload) {
  const data = isPlainObject(payload.data) ? payload.data : payload;
  const provider = data.activeProvider || data.defaultProvider || null;
  const model = data.activeModel || data.defaultModel || null;
  const target = [provider, model].filter(Boolean).join(' / ');
  const status = resolveAiStatusState(data);
  const lines = [];

  if (status === 'ready') {
    lines.push('AI 当前可用');
    if (target) {
      lines.push(`当前模型：${target}`);
    }
    return truncateRenderedText(lines.join('\n'));
  }

  if (status === 'error') {
    const errorSummary = summarizeAiStatusError(data.replyError, { serviceLabel: '模型服务' });
    lines.push('AI 当前不可用');
    if (target) {
      lines.push(`当前模型：${target}`);
    }
    lines.push(`原因：${errorSummary.reason}`);
    lines.push(`建议：${buildAiStatusSuggestion(errorSummary.kind, provider)}`);
    return truncateRenderedText(lines.join('\n'));
  }

  lines.push('AI 还没有配置好');
  lines.push('建议：先配置 provider 和 API Key，再重新检查。');
  return truncateRenderedText(lines.join('\n'));
}

function formatAiFallbackResult(payload) {
  const replyError = payload.replyError || payload.data?.replyError;
  if (replyError || /^AI 回答失败[:：]/.test(String(payload.message || ''))) {
    const errorSummary = summarizeAiStatusError(replyError || payload.message, { serviceLabel: '模型服务' });
    return [
      'AI 暂时不可用',
      `原因：${errorSummary.reason}`,
      `建议：${buildAiStatusSuggestion(errorSummary.kind)}`
    ].join('\n');
  }

  const lines = [];
  if (payload.message) {
    lines.push(payload.message);
  }
  if (replyError && lines.length === 0) {
    const errorSummary = summarizeAiStatusError(replyError, { serviceLabel: '模型服务' });
    lines.push(`AI 暂时不可用：${errorSummary.reason}`);
  }

  return lines.join('\n');
}

function formatErrorResult(result) {
  const bindingHint = result?.data?.bindingHint || null;

  if (bindingHint?.message || bindingHint?.suggestedCommand) {
    const lines = ['当前操作还不能执行', '原因：缺少必要配置'];
    if (bindingHint.message) {
      lines.push(`需要绑定：${bindingHint.message}`);
    }
    if (bindingHint.suggestedCommand) {
      lines.push(`建议：${bindingHint.suggestedCommand}`);
    }
    return truncateRenderedText(lines.join('\n'));
  }

  const errorSummary = summarizeAiStatusError(result?.message, { serviceLabel: '服务' });
  return truncateRenderedText(['当前操作未完成', `原因：${errorSummary.reason}`].join('\n'));
}

function resolveAiStatusState(data) {
  if (data.replyError || data.health === 'error') {
    return 'error';
  }
  if (data.ready || data.health === 'ready') {
    return 'ready';
  }
  return 'not_ready';
}

function summarizeAiStatusError(error, options = {}) {
  const serviceLabel = options.serviceLabel || '模型服务';
  const raw = String(error || '').trim();
  const normalized = raw.toLowerCase();

  if (!raw) {
    return { kind: 'unknown', reason: `${serviceLabel}连接失败` };
  }

  if (/incorrect api key|invalid key|invalid api key|unauthorized|authentication|401/.test(normalized)) {
    return { kind: 'auth', reason: 'API Key 无效或已过期' };
  }

  if (/429|rate limit|quota|too many requests|insufficient/.test(normalized)) {
    return { kind: 'quota', reason: '请求过多或账户额度不足' };
  }

  if (/timed out|timeout|etimedout|aborted/.test(normalized)) {
    return { kind: 'timeout', reason: `连接${serviceLabel}超时` };
  }

  if (/econnrefused|connection refused/.test(normalized)) {
    return { kind: 'endpoint', reason: `${serviceLabel}地址拒绝连接` };
  }

  if (/enotfound|getaddrinfo|dns|fetch failed|network/.test(normalized)) {
    return { kind: 'network', reason: `${serviceLabel}地址无法访问` };
  }

  return { kind: 'unknown', reason: `${serviceLabel}连接失败` };
}

function buildAiStatusSuggestion(kind, provider) {
  const providerText = provider ? `${provider} 的 ` : '';

  if (kind === 'auth') {
    return `检查 ${providerText}API Key 配置是否正确`;
  }

  if (kind === 'quota') {
    return '稍后重试，或检查账户额度和限流设置';
  }

  if (kind === 'timeout' || kind === 'network' || kind === 'endpoint') {
    return `检查 ${providerText}Base URL 和网络连通性`;
  }

  return '运行 `flowmind ai --status` 查看详细诊断';
}

function formatStandardResult(payload) {
  const data = isPlainObject(payload.data) ? payload.data : {};
  const sections = [];

  if (payload.message) {
    sections.push(payload.message);
  }

  const bindingSection = formatBindingHintSection(data.bindingHint);
  if (bindingSection) {
    sections.push(bindingSection);
  }

  const retrySection = formatHintListSection('可这样重试', data.retryHints);
  if (retrySection) {
    sections.push(retrySection);
  }

  const automationSection = formatActionListSection('可继续执行', data.automationCandidates);
  if (automationSection) {
    sections.push(automationSection);
  }

  const nextActionSection = formatActionListSection('建议下一步', data.nextActions);
  if (nextActionSection) {
    sections.push(nextActionSection);
  }

  const details = pruneDisplayValue(data, {
    excludeKeys: ['bindingHint', 'retryHints', 'automationCandidates', 'nextActions']
  });
  const detailLines = renderValueLines(details);
  if (detailLines.length > 0) {
    sections.push(detailLines.join('\n'));
  }

  if (sections.length > 0) {
    return truncateRenderedText(sections.join('\n\n'));
  }

  return truncateRenderedText(JSON.stringify(payload, null, 2));
}

function formatAutoFlowResult(payload) {
  const data = isPlainObject(payload.data) ? payload.data : {};
  const execution = isPlainObject(data.execution) ? data.execution : {};
  const sections = [];

  if (payload.message) {
    sections.push(payload.message);
  }

  if (execution.summary) {
    sections.push(`结果：${execution.summary}`);
  }

  const facts = [];
  if (execution.target) facts.push(`目标：${execution.target}`);
  if (execution.environment) facts.push(`环境：${execution.environment}`);
  if (execution.pipelineId) facts.push(`流水线：${execution.pipelineId}`);
  if (execution.runId) facts.push(`运行ID：${execution.runId}`);
  if (execution.workflow) facts.push(`流程：${execution.workflow}`);
  if (execution.stepCount !== undefined) facts.push(`步骤数：${execution.stepCount}`);
  if (execution.status || data.status) facts.push(`状态：${execution.status || data.status}`);

  if (facts.length > 0) {
    sections.push(facts.join(' | '));
  }

  const itemSection = formatAutoFlowItems(execution.items);
  if (itemSection) {
    sections.push(itemSection);
  }

  const stepSection = formatAutoFlowSteps(execution.steps);
  if (stepSection) {
    sections.push(stepSection);
  }

  if (data.hint) {
    sections.push(`建议：${data.hint}`);
  }

  const details = pruneDisplayValue(data, {
    excludeKeys: ['execution', 'hint', 'action', 'status', 'mcpServer', 'resolution']
  });
  const detailLines = renderValueLines(details);
  if (detailLines.length > 0) {
    sections.push(detailLines.join('\n'));
  }

  return truncateRenderedText(sections.join('\n\n'));
}

function formatAutoFlowItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const lines = ['匹配结果'];
  items.slice(0, MAX_ARRAY_ITEMS).forEach((item, index) => {
    if (!isPlainObject(item)) {
      lines.push(`${index + 1}. ${formatScalar(item)}`);
      return;
    }

    const name = item.pipelineName || item.service || item.name || `item-${index + 1}`;
    const extras = [];
    if (item.pipelineId) extras.push(`流水线：${item.pipelineId}`);
    if (item.service && item.service !== name) extras.push(`服务：${item.service}`);
    if (item.env) extras.push(`环境：${item.env}`);
    lines.push(`${index + 1}. ${name}${extras.length > 0 ? ` (${extras.join(' | ')})` : ''}`);
  });

  if (items.length > MAX_ARRAY_ITEMS) {
    lines.push(`… +${items.length - MAX_ARRAY_ITEMS} more`);
  }

  return lines.join('\n');
}

function formatAutoFlowSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return null;
  }

  const lines = ['流程步骤'];
  steps.slice(0, MAX_ARRAY_ITEMS).forEach((step, index) => {
    if (!isPlainObject(step)) {
      lines.push(`${index + 1}. ${formatScalar(step)}`);
      return;
    }

    const name = step.name || step.skill || step.id || `step-${index + 1}`;
    const extras = [];
    if (step.skill && step.skill !== name) extras.push(`动作：${step.skill}`);
    if (step.id && step.id !== name) extras.push(`ID：${step.id}`);
    lines.push(`${index + 1}. ${name}${extras.length > 0 ? ` (${extras.join(' | ')})` : ''}`);
  });

  if (steps.length > MAX_ARRAY_ITEMS) {
    lines.push(`… +${steps.length - MAX_ARRAY_ITEMS} more`);
  }

  return lines.join('\n');
}

function formatBindingHintSection(bindingHint) {
  if (!isPlainObject(bindingHint)) {
    return null;
  }

  const lines = ['需要先绑定配置'];
  if (bindingHint.message) {
    lines.push(`原因：${bindingHint.message}`);
  }
  if (bindingHint.suggestedCommand) {
    lines.push(`执行：${bindingHint.suggestedCommand}`);
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function formatHintListSection(title, hints) {
  if (!Array.isArray(hints) || hints.length === 0) {
    return null;
  }

  const lines = [title];
  hints.slice(0, MAX_ARRAY_ITEMS).forEach((hint, index) => {
    lines.push(`${index + 1}. ${formatScalar(hint)}`);
  });

  if (hints.length > MAX_ARRAY_ITEMS) {
    lines.push(`… +${hints.length - MAX_ARRAY_ITEMS} more`);
  }

  return lines.join('\n');
}

function formatActionListSection(title, actions) {
  if (!Array.isArray(actions) || actions.length === 0) {
    return null;
  }

  const lines = [title];
  actions.slice(0, MAX_ARRAY_ITEMS).forEach((action, index) => {
    if (!isPlainObject(action)) {
      lines.push(`${index + 1}. ${formatScalar(action)}`);
      return;
    }

    const label = action.skill || action.name || action.action || `action-${index + 1}`;
    const headline = action.reason || label;
    const extras = [];
    if (action.reason && action.reason !== headline) extras.push(`原因：${action.reason}`);
    if (action.suggestedInput) extras.push(`执行：${action.suggestedInput}`);
    if (action.configured !== undefined) extras.push(`状态：${action.configured ? '已配置' : '未配置'}`);
    if (headline === label) {
      lines.push(`${index + 1}. ${label}`);
    } else {
      lines.push(`${index + 1}. ${headline}`);
      extras.unshift(`动作：${label}`);
    }
    extras.forEach((item) => {
      lines.push(`   ${item}`);
    });
  });

  if (actions.length > MAX_ARRAY_ITEMS) {
    lines.push(`… +${actions.length - MAX_ARRAY_ITEMS} more`);
  }

  return lines.join('\n');
}

function formatLogAuditResult(payload, options = {}) {
  const data = isPlainObject(payload.data) ? payload.data : {};
  const execution = isPlainObject(data.execution) ? data.execution : {};
  const records = Array.isArray(execution.records) ? execution.records : [];
  const rawSummary = isPlainObject(execution.rawSummary) ? execution.rawSummary : null;
  const noRecords = data.noRecords === true;
  const showAllRecords = options.logAuditDetailLevel === 'full' || options.showAll === true;
  const executionDisplay = rawSummary
    ? Object.fromEntries(Object.entries(execution).filter(([key]) => key !== 'rawSummary'))
    : execution;

  const sections = [];
  if (payload.message) {
    sections.push(payload.message);
  }

  if (isPlainObject(data.bindingHint)) {
    const bindingHint = data.bindingHint;
    const hasMissingFields = Array.isArray(bindingHint.missing) && bindingHint.missing.length > 0;
    const shouldRenderBindingHint = bindingHint.kind === 'mcp-binding' || hasMissingFields;
    if (!shouldRenderBindingHint) {
      // Skip non-actionable binding hints to avoid duplicating the normal result output.
    } else {
      const bindingSection = formatBindingHintSection(bindingHint);
      if (bindingSection) {
        sections.push(bindingSection);
      }
    }
  }

  if (noRecords) {
    sections.push('结果：未命中日志');
  }

  if (records.length > 0) {
    const summary = buildLogAuditSummary(data, records);
    if (summary) {
      sections.push(summary);
    }
  }

  if (isPlainObject(data.queryParams)) {
    const querySection =
      showAllRecords && !noRecords
        ? ['查询条件', ...renderValueLines(pickLogQueryParams(data.queryParams))].join('\n')
        : renderCompactQueryParams(data.queryParams, noRecords ? '检查范围' : '查询条件');
    if (querySection) {
      sections.push(querySection);
    }
  }

  if (records.length > 0) {
    if (showAllRecords) {
      const returnBlocks = renderLogAuditReturnBlocks(records, options);
      if (returnBlocks.length > 0) {
        sections.push(['服务返回', ...returnBlocks].join('\n\n'));
      }

      const blocks = renderLogAuditServiceBlocks(sortLogAuditRecords(records, 'asc'), options, {
        compact: false
      });
      if (blocks.length > 0) {
        sections.push(['服务明细', ...blocks].join('\n\n'));
      }
    } else {
      const anomalySection = renderLogAuditAnomalySection(records, options);
      if (anomalySection) {
        sections.push(anomalySection);
      }
      const finalResultSection = renderLogAuditFinalResult(records, options);
      if (finalResultSection) {
        sections.push(finalResultSection);
      }
      if (records.length > 1) {
        sections.push(`更多：默认只显示最终返回。输入 more 查看全部 ${records.length} 条服务明细。`);
      }
    }
  } else if (isPlainObject(executionDisplay) && Object.keys(executionDisplay).length > 0) {
    const executionSection = noRecords
      ? renderLogAuditNoRecordSummary(executionDisplay)
      : ['执行结果', ...renderValueLines(executionDisplay)].join('\n');
    if (executionSection) {
      sections.push(executionSection);
    }
  }

  if (rawSummary && records.length === 0 && !noRecords) {
    const rawLines = renderValueLines(rawSummary);
    if (rawLines.length > 0) {
      sections.push(['原始返回', ...rawLines].join('\n'));
    }
  }

  if (sections.length > 0) {
    return sections.join('\n\n');
  }

  const details = pruneDisplayValue(payload.data);
  const detailLines = renderValueLines(details);

  if (detailLines.length > 0) {
    return truncateRenderedText(detailLines.join('\n'));
  }

  return truncateRenderedText(JSON.stringify(payload, null, 2));
}

function renderCompactQueryParams(queryParams, label = '查询条件') {
  const picked = pickLogQueryParams(queryParams);
  const entries = Object.entries(picked).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) {
    return null;
  }

  const line = entries.map(([key, value]) => `${key}: ${simplifyLogAuditCell(value)}`).join(' | ');
  return `${label}: ${truncateCell(line, 220)}`;
}

function renderLogAuditFinalResult(records, options = {}) {
  const finalRecord = selectLogAuditFinalRecord(records);
  const row = normalizeLogAuditRecord(finalRecord);
  if (!row) {
    return null;
  }

  const lines = ['最终返回'];
  lines.push(`服务: ${row.service}`);
  if (row.time && row.time !== '-') lines.push(`时间: ${row.time}`);
  if (row.status && row.status !== '-') lines.push(`状态: ${row.status}`);
  if (row.duration && row.duration !== '-') lines.push(`耗时: ${row.duration}`);
  if (row.request && row.request !== '-') lines.push(`请求: ${row.request}`);
  if (row.params && row.params !== '-') lines.push(`参数: ${row.params}`);
  lines.push(`响应: ${row.response}`);
  if (row.anomaly) lines.push(`原因: ${row.anomaly}`);
  return options.colorize === true && row.anomaly ? colorizeLines(lines, 'red') : lines.join('\n');
}

function renderLogAuditAnomalySection(records, options = {}) {
  const anomalyLines = collectLogAuditAnomalyLines(records, 3);
  if (anomalyLines.length === 0) {
    return null;
  }

  const lines = ['异常摘要'];
  anomalyLines.forEach((line, index) => {
    lines.push(`${index + 1}. ${line}`);
  });
  return options.colorize === true ? colorizeLines(lines, 'red') : lines.join('\n');
}

function selectLogAuditFinalRecord(records) {
  const sorted = sortLogAuditRecords(records, 'asc');
  const responseRecords = sorted.filter((record) => {
    const row = normalizeLogAuditRecord(record);
    return row && row.response && row.response !== '-';
  });
  return responseRecords[responseRecords.length - 1] || sorted[sorted.length - 1] || null;
}

function sortLogAuditRecords(records, direction = 'asc') {
  const multiplier = direction === 'desc' ? -1 : 1;
  return [...(Array.isArray(records) ? records : [])].sort((left, right) => {
    const leftTime = parseLogAuditTime(left);
    const rightTime = parseLogAuditTime(right);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
      return (leftTime - rightTime) * multiplier;
    }
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime === null && rightTime !== null) return 1;
    return 0;
  });
}

function parseLogAuditTime(record) {
  const value =
    record?.time || record?.fields?.time || record?.readable?.items?.find((item) => item?.label === '时间')?.value;
  if (!value) {
    return null;
  }
  const normalized = String(value).replace(' ', 'T').replace(',', '.');
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function renderLogAuditNoRecordSummary(execution) {
  const total = toNumber(execution.total) || toNumber(execution.count) || 0;
  const parts = [`返回：${total} 条日志`];
  if (execution.status) {
    parts.push(`状态：${execution.status}`);
  }
  return parts.join(' | ');
}

function buildLogAuditSummary(data, records) {
  const services = [...new Set(records.map((record) => record?.service).filter(Boolean))];
  const total = toNumber(data?.execution?.total) || toNumber(data?.execution?.count) || records.length;
  const traceId = data.queryParams?.traceId || data.resolution?.traceId || null;
  const pieces = [];
  if (traceId) pieces.push(`Trace ID：${traceId}`);
  if (services.length > 0) pieces.push(`链路：${services.join(', ')}`);
  pieces.push(`日志：${total} 条`);
  return pieces.length > 0 ? pieces.join(' | ') : null;
}

function collectLogAuditAnomalyLines(records, maxLines = 3) {
  const collected = [];
  const sorted = sortLogAuditRecords(records, 'asc')
    .map((record) => ({ record, row: normalizeLogAuditRecord(record) }))
    .filter((entry) => entry.row?.anomaly)
    .sort((left, right) => scoreLogAuditAnomaly(right.record, right.row) - scoreLogAuditAnomaly(left.record, left.row));

  for (const { record, row } of sorted) {
    const detailLines = extractLogAuditAnomalyLines(record);
    if (detailLines.length === 0) {
      collected.push(`${row.service}: ${row.anomaly}`);
    } else {
      detailLines.forEach((detail, index) => {
        const prefix = index === 0 ? `${row.service}: ` : '';
        collected.push(`${prefix}${detail}`);
      });
    }

    if (collected.length >= maxLines) {
      break;
    }
  }

  return collected.slice(0, maxLines);
}

function scoreLogAuditAnomaly(record, row) {
  const fields = isPlainObject(record?.fields) ? record.fields : {};
  const statusCode = toNumber(fields.statusCode) || toNumber(row?.status) || 0;
  const entryType = fields.entryType || null;
  const response = String(record?.result || record?.response || '').trim();

  if (entryType === 'error' || statusCode >= 500) {
    return 300;
  }

  if (/\b(exception|error|fail|failed|timeout)\b/i.test(response)) {
    return 200;
  }

  if (/(异常|错误|失败|超出|限制|OUTSIDE_VALID_AREA_SCOPE)/i.test(response)) {
    return 100;
  }

  return 0;
}

function renderLogAuditServiceBlocks(records, options = {}, renderOptions = {}) {
  const blocks = [];
  const colorize = options.colorize === true;
  const compact = renderOptions.compact === true;

  records.forEach((record, index) => {
    const row = normalizeLogAuditRecord(record);
    if (!row) {
      return;
    }

    const title = `${index + 1}. ${row.service || '-'}${row.anomaly ? ' [异常]' : ''}`;
    const lines = compact ? buildCompactLogAuditLines(title, row) : buildVerboseLogAuditLines(title, row);

    blocks.push(colorize && row.anomaly ? colorizeLines(lines, 'red') : lines.join('\n'));
  });

  return blocks;
}

function renderLogAuditReturnBlocks(records, options = {}) {
  const blocks = [];
  const colorize = options.colorize === true;
  const rows = buildLogAuditReturnRows(records);

  rows.forEach((row, index) => {
    const title = `${index + 1}. ${row.service || '-'}${row.anomaly ? ' [异常]' : ''}`;
    const lines = buildVerboseLogAuditLines(title, row);
    blocks.push(colorize && row.anomaly ? colorizeLines(lines, 'red') : lines.join('\n'));
  });

  return blocks;
}

function buildLogAuditReturnRows(records) {
  const rows = [];
  const seen = new Set();
  const sorted = sortLogAuditRecords(records, 'asc');
  const requestContextByService = new Map();

  sorted.forEach((record) => {
    const row = normalizeLogAuditRecord(record);
    if (!row) {
      return;
    }

    if (row.request !== '-' || row.params !== '-') {
      requestContextByService.set(row.service, row);
    }

    if (!isMeaningfulLogAuditReturnRecord(record, row)) {
      return;
    }

    const requestContext = requestContextByService.get(row.service) || null;
    const mergedRow = {
      ...row,
      request: row.request !== '-' ? row.request : requestContext?.request || '-',
      params: row.params !== '-' ? row.params : requestContext?.params || '-'
    };

    const dedupeKey = [mergedRow.service, mergedRow.time, mergedRow.request, mergedRow.response].join('|');
    if (seen.has(dedupeKey)) {
      return;
    }
    seen.add(dedupeKey);
    rows.push(mergedRow);
  });

  return rows;
}

function isMeaningfulLogAuditReturnRecord(record, row) {
  const fields = isPlainObject(record?.fields) ? record.fields : {};
  const response = String(row?.response || '').trim();
  if (!response || response === '-') {
    return false;
  }

  if (fields.responseSummary) {
    return true;
  }

  if (fields.entryType === 'error') {
    return true;
  }

  if (fields.entryType === 'response' && !isTransportOnlyLogAuditResponse(response)) {
    return true;
  }

  if (row.anomaly && !isTransportOnlyLogAuditResponse(response)) {
    return true;
  }

  return false;
}

function isTransportOnlyLogAuditResponse(text) {
  const value = String(text || '').trim();
  if (!value) {
    return true;
  }

  return /^(?:HTTP\/\d\.\d\s+\d{3}\b|Duration:\s*\d+(?:\.\d+)?\s*ms\b|<---\s+HTTP\/\d\.\d\s+\d{3}\b)/i.test(value)
    || /^(?:Connection|Content-Type|Date|Transfer-Encoding|server:|x-[A-Za-z-]+:|cache-control:|set-cookie:)\b/i.test(value);
}

function buildCompactLogAuditLines(title, row) {
  const headlineParts = [title, row.request, row.duration];
  if (row.status) {
    headlineParts.push(`状态: ${row.status}`);
  }

  const detailParts = [];
  if (row.anomaly) {
    detailParts.push(`异常: ${row.anomaly}`);
  }
  detailParts.push(`响应: ${row.response}`);
  if (row.params && row.params !== '-') {
    detailParts.push(`参数: ${row.params}`);
  }
  if (row.time && row.time !== '-') {
    detailParts.push(`时间: ${row.time}`);
  }

  return [headlineParts.join(' | '), detailParts.join(' | ')];
}

function buildVerboseLogAuditLines(title, row) {
  const lines = [
    title,
    `时间: ${row.time}`,
    `请求: ${row.request}`,
    `参数: ${row.params}`,
    `响应: ${row.response}`,
    `耗时: ${row.duration}`
  ];

  if (row.status) {
    lines.push(`状态: ${row.status}`);
  }

  if (row.anomaly) {
    lines.push(`原因: ${row.anomaly}`);
  }

  return lines;
}

function normalizeLogAuditRecord(record) {
  if (!isPlainObject(record)) {
    return null;
  }

  const fields = isPlainObject(record.fields) ? record.fields : {};
  const readable = isPlainObject(record.readable) ? record.readable : {};
  const items = Array.isArray(readable.items) ? readable.items : [];
  const itemLookup = new Map(items.map((item) => [item?.label, item?.value]));
  const structuredError = parseStructuredLogError(fields.error || record.result || record.response || null);
  const requestUrlText = firstText([fields.requestUrl, itemLookup.get('入口URL')]) || null;
  const requestMethod = fields.requestMethod || extractLeadingHttpMethod(requestUrlText) || null;
  const requestUrl = fields.requestUrl || stripLeadingHttpMethod(requestUrlText) || null;
  const request =
    firstText([requestUrl, record.api, fields.api, itemLookup.get('接口'), itemLookup.get('URL'), fields.sql]) || '-';
  const params =
    firstText([
      fields.parameters,
      itemLookup.get('参数'),
      itemLookup.get('请求参数'),
      itemLookup.get('Request'),
      itemLookup.get('请求')
    ]) || '-';
  const errorSummary = summarizeLogError(fields.error || null);
  const response =
    firstText([
      fields.responseSummary,
      itemLookup.get('响应'),
      fields.entryType === 'error' ? errorSummary : fields.error,
      fields.entryType === 'response' ? record.result : null
    ]) || '-';
  const duration =
    firstText([
      fields.durationMs !== undefined && fields.durationMs !== null ? `${fields.durationMs}ms` : null,
      itemLookup.get('耗时')
    ]) || '-';
  const entryType = fields.entryType || null;
  const responseText = simplifyLogAuditCell(response);
  const statusCode =
    toNumber(fields.statusCode) ||
    extractStatusCode([fields.responseSummary, record.result, record.response, record.message, responseText]);
  const structuredStatusCode = toNumber(structuredError?.resultCode || structuredError?.code);
  const displayService = firstText([structuredError?.origin, record.service, itemLookup.get('服务')]) || '-';
  const anomaly = buildLogAuditAnomaly({
    statusCode: structuredStatusCode || statusCode,
    entryType,
    error: errorSummary,
    response: responseText
  });

  return {
    time: truncateCell(record.time || itemLookup.get('时间') || '-'),
    service: truncateCell(displayService),
    request: truncateCell(requestMethod ? `${requestMethod} ${requestUrl || request}`.trim() : request),
    params: truncateCell(simplifyLogAuditCell(params)),
    response: truncateCell(responseText, MAX_LOG_RESPONSE_LENGTH),
    duration: truncateCell(duration),
    status: structuredStatusCode || statusCode ? String(structuredStatusCode || statusCode) : entryType || '-',
    anomaly
  };
}

function truncateCell(value, maxLength = 120) {
  const text = simplifyLogAuditCell(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function simplifyLogAuditCell(value) {
  if (value === null || value === undefined) {
    return '-';
  }
  const text = String(value)
    .replace(/\s+/g, ' ')
    .replace(/^==>\s*/g, '')
    .replace(/^<==\s*/g, '')
    .trim();
  return text || '-';
}

function firstText(values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    return String(value);
  }
  return null;
}

function pickLogQueryParams(queryParams) {
  const keys = [
    'env',
    'endpoint',
    'project',
    'logstore',
    'service',
    'traceId',
    'keyword',
    'level',
    'query',
    'from',
    'to',
    'line'
  ];
  const output = {};
  for (const key of keys) {
    if (queryParams[key] !== undefined && queryParams[key] !== null && queryParams[key] !== '') {
      output[key] = queryParams[key];
    }
  }
  return output;
}

function buildLogAuditAnomaly({ statusCode, entryType, error, response }) {
  if (error) {
    return `error: ${error}`;
  }

  const structuredResponse = parseStructuredLogError(response);
  if (structuredResponse) {
    const structuredAnomaly = summarizeStructuredResponseAnomaly(structuredResponse);
    if (structuredAnomaly) {
      return structuredAnomaly;
    }
    return null;
  }

  if (looksLikeStructuredSnippet(response)) {
    return null;
  }

  if (statusCode && statusCode >= 400) {
    return `statusCode=${statusCode}`;
  }

  if (entryType === 'error') {
    return 'log entry type is error';
  }

  if (response && /\b(timeout|exception|fail|failed|error|denied|forbidden|invalid)\b/i.test(response)) {
    return response;
  }

  if (response && /(异常|错误|失败|超出|限制|OUTSIDE_VALID_AREA_SCOPE)/i.test(response)) {
    return response;
  }

  return null;
}

function summarizeStructuredResponseAnomaly(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const summary = summarizeStructuredResponseAnomaly(item);
      if (summary) {
        return summary;
      }
    }
    return null;
  }

  if (!isPlainObject(value)) {
    return null;
  }

  const note = firstText([value.note, value.message, value.msg, value.errorMessage, value.error_description]);
  const stackLine = extractFirstErrorStack(value.errorStacks || value.stacks || value.stackTrace);
  const resultCode = toNumber(firstText([value.resultCode, value.code, value.status]));
  const timedOut = value.timed_out === true || value.timedOut === true;
  const shardFailed = toNumber(value?._shards?.failed);
  const success = value.success;
  const deliveryStatus = firstText([value.deliveryStatus, value.delivery_state, value.deliveryState]);

  if (note && isAnomalyText(note)) {
    return truncateCell(note, 200);
  }
  if (stackLine) {
    return stackLine;
  }
  if (resultCode && resultCode >= 400) {
    return `code=${resultCode}`;
  }
  if (success === false) {
    return note ? truncateCell(note, 200) : 'success=false';
  }
  if (timedOut) {
    return 'timed_out=true';
  }
  if (shardFailed && shardFailed > 0) {
    return `_shards.failed=${shardFailed}`;
  }
  if (deliveryStatus && !/^(?:OK|SUCCESS|IN_RANGE|NORMAL)$/i.test(deliveryStatus)) {
    return `deliveryStatus=${deliveryStatus}`;
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    if (['note', 'message', 'msg', 'errorMessage', 'error_description', 'errorStacks', 'stacks', 'stackTrace', 'resultCode', 'code', 'status', 'success', 'timed_out', 'timedOut', '_shards', 'deliveryStatus', 'delivery_state', 'deliveryState'].includes(key)) {
      continue;
    }
    if (typeof fieldValue === 'string' && isAnomalyText(fieldValue)) {
      return truncateCell(`${key}=${fieldValue}`, 200);
    }
  }

  return null;
}

function summarizeLogError(value) {
  const text = simplifyLogAuditCell(value);
  if (!text || text === '-') {
    return null;
  }

  const parsed = parseStructuredLogError(text);
  if (parsed) {
    const parts = [];
    const note = firstText([parsed.note, parsed.message, parsed.msg, parsed.errorMessage]);
    const origin = firstText([parsed.origin, parsed.service, parsed.app]);
    const resultCode = firstText([parsed.resultCode, parsed.code]);
    const stack = extractFirstErrorStack(parsed.errorStacks || parsed.stacks || parsed.stackTrace);

    if (note) parts.push(note);
    if (stack) parts.push(stack);
    if (origin) parts.push(`origin=${origin}`);
    if (resultCode) parts.push(`code=${resultCode}`);
    if (parts.length > 0) {
      return parts.join(' | ');
    }
  }

  if (/SQLSyntaxErrorException/i.test(text)) {
    const stackLine = extractSqlExceptionSummary(text);
    return stackLine || 'SQL syntax error';
  }

  return truncateCell(text, 240);
}

function parseStructuredLogError(text) {
  const candidate = String(text || '').trim();
  if (!candidate || !(candidate.startsWith('{') || candidate.startsWith('['))) {
    return null;
  }

  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function extractFirstErrorStack(stacks) {
  if (!Array.isArray(stacks) || stacks.length === 0) {
    return null;
  }

  const first = String(stacks[0] || '').trim();
  if (!first) return null;

  const lines = first
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const headline = lines[0].replace(/^\[.*?\]:\s*/, '');
  return truncateCell(headline, 120);
}

function extractSqlExceptionSummary(text) {
  const match = String(text || '').match(/(java\.sql\.SQLSyntaxErrorException:[^\n]+)/i);
  if (match?.[1]) {
    return truncateCell(match[1], 120);
  }
  return null;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractStatusCode(values) {
  for (const value of values) {
    const text = String(value || '');
    const match =
      text.match(/\bstatus\s*=?\s*(\d{3})\b/i) ||
      text.match(/\bHTTP\/\d\.\d\s+(\d{3})\b/i) ||
      text.match(/\b(\d{3})\b/);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
}

function colorizeLines(lines, color) {
  const prefix = color === 'red' ? ANSI_RED : '';
  if (!prefix) {
    return lines.join('\n');
  }
  return `${prefix}${lines.join('\n')}${ANSI_RESET}`;
}

function extractLeadingHttpMethod(text) {
  const match = String(text || '').match(/^\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function stripLeadingHttpMethod(text) {
  const value = String(text || '').trim();
  return value.replace(/^\s*(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\s+/i, '').trim() || null;
}

function extractLogAuditAnomalyLines(record) {
  const fields = isPlainObject(record?.fields) ? record.fields : {};
  const candidates = [fields.error, fields.responseSummary, record?.result, record?.response, record?.message];

  for (const candidate of candidates) {
    const lines = extractMeaningfulLogLines(candidate, 3);
    if (lines.length > 0) {
      return lines;
    }
  }

  return [];
}

function looksLikeStructuredSnippet(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  return /[{\[]/.test(text) && /"[^"]+"\s*:/.test(text);
}

function extractMeaningfulLogLines(value, maxLines = 3) {
  const text = String(value || '').trim();
  if (!text) {
    return [];
  }

  const structured = parseStructuredLogError(text);
  if (structured) {
    return extractStructuredPreviewLines(structured, maxLines);
  }

  return String(text)
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((line) => line.trim().replace(/^\[.*?\]:\s*/, ''))
    .filter(Boolean)
    .filter((line) => !/^(?:Outgoing|Incoming)\s+Response:/i.test(line))
    .filter((line) => !/^HTTP\/\d\.\d\s+\d{3}\b/i.test(line))
    .filter((line) => !/^(?:Connection|Content-Type|Date|Transfer-Encoding|Remote|Accept|Host|Content-Length|Duration|X-[A-Za-z-]+)\b/i.test(line))
    .slice(0, maxLines)
    .map((line) => truncateCell(line, 200));
}

function extractStructuredErrorLines(stacks, maxLines = 3) {
  const values = Array.isArray(stacks) ? stacks : [stacks];
  const lines = [];

  for (const value of values) {
    const text = String(value || '').replace(/\\n/g, '\n');
    text
      .split('\n')
      .map((line) => line.trim().replace(/^\[.*?\]:\s*/, ''))
      .filter(Boolean)
      .forEach((line) => {
        if (lines.length < maxLines) {
          lines.push(truncateCell(line, 200));
        }
      });
    if (lines.length >= maxLines) {
      break;
    }
  }

  return lines.slice(0, maxLines);
}

function extractStructuredPreviewLines(value, maxLines = 3) {
  const lines = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      const nestedLines = extractStructuredPreviewLines(item, maxLines - lines.length);
      lines.push(...nestedLines);
      if (lines.length >= maxLines) {
        break;
      }
    }
    return [...new Set(lines)].slice(0, maxLines);
  }

  if (!isPlainObject(value)) {
    return [];
  }

  const note = firstText([value.note, value.message, value.msg, value.errorMessage, value.error_description]);
  if (note && isAnomalyText(note)) {
    lines.push(truncateCell(note, 200));
  }

  const stackLines = extractStructuredErrorLines(value.errorStacks || value.stacks || value.stackTrace, maxLines);
  lines.push(...stackLines);

  const deliveryStatus = firstText([value.deliveryStatus, value.delivery_state, value.deliveryState]);
  if (deliveryStatus && !/^(?:OK|SUCCESS|IN_RANGE|NORMAL)$/i.test(deliveryStatus)) {
    lines.push(truncateCell(`deliveryStatus=${deliveryStatus}`, 200));
  }

  const shardFailed = toNumber(value?._shards?.failed);
  if (shardFailed && shardFailed > 0) {
    lines.push(`_shards.failed=${shardFailed}`);
  }

  if (value.timed_out === true || value.timedOut === true) {
    lines.push('timed_out=true');
  }

  return [...new Set(lines)].slice(0, maxLines);
}

function isAnomalyText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  return /\b(exception|error|fail|failed|timeout|denied|forbidden|invalid)\b/i.test(text)
    || /(异常|错误|失败|超出|限制|超时|拒绝|无效|OUTSIDE_VALID_AREA_SCOPE)/i.test(text);
}

module.exports = {
  formatResultText,
  pruneDisplayValue,
  renderValueLines,
  unwrapResultPayload
};
