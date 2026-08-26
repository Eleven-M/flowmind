/**
 * DingTalk Notify Skill
 * Push markdown reports to a DingTalk group robot via webhook.
 *
 * Input contract:
 * - webhook: raw robot URL in the input, or a named group from
 *   `skillConfig.skills.dingtalk-notify.groups.<name>`
 * - demand id (需求编号): optional, enriches the message header via the
 *   workflow MCP adapter (best-effort, degrades silently)
 * - content: the remaining text
 */

const crypto = require('crypto');
const { createSkillError, createSkillResult } = require('../../core/result-contract');
const { wrapSkillCall } = require('../../core/skill-error-wrapper');

const WEBHOOK_URL_PATTERN = /https:\/\/oapi\.dingtalk\.com\/robot\/send\?access_token=[A-Za-z0-9_-]+/i;
const SECRET_PATTERN = /\b(SEC[A-Za-z0-9]{8,})\b/;
const DEMAND_ID_PATTERNS = [
  /(?:需求编号|需求单号|需求ID|需求id|需求号|demand\s*id)\s*[:：#=]?\s*([A-Za-z0-9][A-Za-z0-9_-]{0,63})/i,
  /需求\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9_-]{0,63})/
];
const GROUP_TOKEN_PATTERN = /[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}群/g;
const GROUP_TOKEN_SEPARATORS = /推送|发送|发|通知|同步|到|把|给|至|及|和|，|,|:|：|\s+/;
const LEADING_PUSH_PHRASE = /^\s*(?:请|帮忙|帮我|把)?[\u4e00-\u9fa5A-Za-z0-9_-]{0,10}?(?:推送|发送|发|同步|通知)\s*到?\s*(?:钉钉|群)?\s*[,:，：]?\s*/;

const MAX_CONTENT_LENGTH = 18000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_AB_EXAMPLES = 5;

const EVALUATION_SECTION_TITLES = [
  '### 1. 需求完整度',
  '### 2. 采集质量',
  '### 3. 性能结论',
  '### 4. 异常点',
  '### 5. 建议/下一步'
];

let fetchImpl = null;

function resolveFetch() {
  return fetchImpl || global.fetch;
}

/** Test hook: inject a fetch implementation. Pass null to restore. */
function __setFetchImpl(impl) {
  fetchImpl = impl;
}

function extractWebhookUrl(text) {
  const match = String(text || '').match(WEBHOOK_URL_PATTERN);
  return match ? match[0] : null;
}

function extractSecret(text) {
  const match = String(text || '').match(SECRET_PATTERN);
  return match ? match[1] : null;
}

function extractDemandId(text) {
  const value = String(text || '');
  const candidates = [];
  for (const pattern of DEMAND_ID_PATTERNS) {
    const match = value.match(pattern);
    if (match && match[1]) {
      // Trim trailing separators so "需求1234-示例-..." yields "1234", not "1234-".
      const id = match[1].replace(/[-_]+$/, '');
      if (id && !candidates.includes(id)) {
        candidates.push(id);
      }
    }
  }
  // Prefer pure-digit business demand numbers (1234) over internal record ids
  // (YZLjZrLeRz) when both appear, so the message title stays user-facing.
  const numeric = candidates.find((id) => /^\d+$/.test(id));
  return numeric || candidates[0] || null;
}

/**
 * Extract candidate group names from "<...>群" tokens, trimming leading
 * instruction words (把/发到/推送...) so "发到测试群" yields "测试".
 */
function extractGroupCandidates(text) {
  const tokens = String(text || '').match(GROUP_TOKEN_PATTERN) || [];
  return tokens
    .map((token) => token.slice(0, -1))
    .map((token) => {
      const segments = token.split(GROUP_TOKEN_SEPARATORS).filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : token;
    });
}

function extractGroupName(text) {
  return extractGroupCandidates(text)[0] || null;
}

function resolveGroupConfig(groups, groupName) {
  if (!groups || typeof groups !== 'object' || !groupName) {
    return null;
  }
  const keys = Object.keys(groups);
  for (const candidate of [groupName, `${groupName}群`]) {
    const key = keys.find((k) => String(k).toLowerCase() === candidate.toLowerCase());
    if (key && groups[key] && typeof groups[key] === 'object' && groups[key].webhook) {
      return groups[key];
    }
  }
  return null;
}

/** Mask the access token so results never echo a full credential. */
function maskWebhook(url) {
  return String(url || '').replace(/(access_token=)[A-Za-z0-9_-]+/i, '$1******');
}

/** Append DingTalk 加签 params when a secret is provided. */
function signWebhookUrl(webhook, secret, timestamp = Date.now()) {
  if (!secret) {
    return webhook;
  }
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = encodeURIComponent(
    crypto.createHmac('sha256', secret).update(stringToSign).digest('base64')
  );
  return `${webhook}&timestamp=${timestamp}&sign=${sign}`;
}

function truncateContent(content) {
  const value = String(content || '').trim();
  if (value.length <= MAX_CONTENT_LENGTH) {
    return value;
  }
  return `${value.slice(0, MAX_CONTENT_LENGTH)}\n\n(内容过长，已截断)`;
}

function normalizeReportSection(value, fallback = '暂无补充信息') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeInlineText(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

function normalizeDuration(value) {
  const text = normalizeInlineText(value);
  return text.replace(/(-?\d+(?:\.\d+)?)\s*ms\b/gi, '$1 ms');
}

function normalizeDelta(value) {
  const text = normalizeDuration(value);
  const match = text.match(/([+-]?\d+(?:\.\d+)?)\s*(ms|%|s)?/i);
  if (!match) {
    return text;
  }
  const numeric = Number(match[1]);
  if (!Number.isFinite(numeric) || numeric === 0) {
    return text.replace(/^\+/, '+');
  }
  const sign = numeric > 0 ? '+' : '-';
  const arrow = numeric > 0 ? '↑' : '↓';
  const magnitude = Math.abs(numeric);
  const unit = match[2] ? ` ${match[2].toLowerCase()}` : '';
  const suffix = text.slice(match.index + match[0].length).trim();
  return `${arrow} ${sign}${magnitude}${unit}${suffix ? ` ${suffix}` : ''}`;
}

function compactParagraphLines(value, fallback = '暂无补充信息') {
  const text = normalizeReportSection(value, fallback);
  return text
    .split(/\r?\n+/)
    .map(normalizeInlineText)
    .filter(Boolean)
    .map((line) => {
      if (/^[-*]\s+/.test(line)) {
        return line.replace(/^[-*]\s+/, '- ');
      }
      if (line.length <= 72) {
        return `- ${line}`;
      }
      const chunks = line.match(/.{1,64}(?:\s|$)|.{1,64}/g) || [line];
      return chunks.map((chunk) => `- ${chunk.trim()}`).join('\n');
    })
    .join('\n');
}

function escapeMarkdownCell(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/** Build a Markdown table from structured log records. */
function buildMarkdownTable(headers, rows) {
  const normalizedHeaders = (Array.isArray(headers) ? headers : []).map(escapeMarkdownCell);
  if (normalizedHeaders.length === 0) {
    return '';
  }
  // DingTalk's robot Markdown parser does not reliably render GFM tables or
  // fenced code blocks. Bold field rows preserve the table's information and
  // line breaks across DingTalk clients.
  const fieldRows = (Array.isArray(rows) ? rows : []).map((row) => {
    const values = Array.isArray(row) ? row : normalizedHeaders.map((header) => row?.[header]);
    return `- ${normalizedHeaders.map((header, index) => `**${header}**: ${escapeMarkdownCell(values[index])}`).join(' ｜ ')}`;
  });
  return [`**${normalizedHeaders.join(' ｜ ')}**`, ...fieldRows].join('\n\n');
}

function rowValue(row, headers, candidates, fallbackIndex) {
  if (Array.isArray(row)) {
    return row[fallbackIndex];
  }
  if (!row || typeof row !== 'object') {
    return '';
  }
  const matchedHeader = headers.find((header) => candidates.includes(header));
  for (const key of [...candidates, matchedHeader].filter(Boolean)) {
    if (row[key] !== undefined && row[key] !== null) {
      return row[key];
    }
  }
  return '';
}

function normalizeAbComparisonRows(logTable = {}) {
  const headers = Array.isArray(logTable.headers) ? logTable.headers.map(String) : [];
  const rows = Array.isArray(logTable.rows) ? logTable.rows : [];
  return rows.map((row) => ({
    keyword: rowValue(row, headers, ['关键词', 'keyword', 'query'], 0),
    bValue: normalizeDuration(rowValue(row, headers, ['B耗时(ms)', 'B耗时', 'B版本组', 'B版本', 'B', 'b'], 1)),
    aValue: normalizeDuration(rowValue(row, headers, ['A耗时(ms)', 'A耗时', 'A用户组', 'A版本', 'A', 'a'], 2)),
    delta: normalizeDelta(rowValue(row, headers, ['差值(ms)', '差值', 'A-B', 'B-A', 'delta'], 3)),
    note: normalizeInlineText(rowValue(row, headers, ['说明', '备注', 'note'], 4))
  }));
}

function summarizeAbRows(rows) {
  const summary = rows.reduce(
    (acc, row) => {
      const match = String(row.delta || '').match(/[+-]?\d+(?:\.\d+)?/);
      if (!match) {
        acc.unknown += 1;
        return acc;
      }
      const value = Number(match[0]);
      if (value > 0) acc.up += 1;
      else if (value < 0) acc.down += 1;
      else acc.flat += 1;
      return acc;
    },
    { up: 0, down: 0, flat: 0, unknown: 0 }
  );
  return `- **A/B汇总**: 共 ${rows.length} 条，↑ ${summary.up}，↓ ${summary.down}，持平 ${summary.flat}，未知 ${summary.unknown}`;
}

function buildAbExamples(logTable, maxExamples = MAX_AB_EXAMPLES) {
  const rows = normalizeAbComparisonRows(logTable);
  if (rows.length === 0) {
    return [];
  }
  const visibleRows = rows.slice(0, Math.max(3, Math.min(maxExamples, MAX_AB_EXAMPLES)));
  const lines = [
    ...visibleRows.map((row) => {
      const note = row.note ? `（${row.note}）` : '';
      return `- ${escapeMarkdownCell(row.keyword)}: B ${escapeMarkdownCell(row.bValue)} → A ${escapeMarkdownCell(row.aValue)}，**${escapeMarkdownCell(row.delta)}**${note}`;
    }),
    summarizeAbRows(rows)
  ];
  const hidden = rows.length - visibleRows.length;
  if (hidden > 0) {
    lines.push(`- 其余 ${hidden} 条已折叠为汇总，不在群消息展开。`);
  }
  return lines;
}

/**
 * Build a DingTalk-friendly evaluation report. The report starts with the
 * conclusion/status, then keeps sections short and limits A/B detail rows.
 */
function buildLayeredEvaluationReport({
  requirement,
  dataLog,
  functionalRisk,
  performance,
  performanceApplicable,
  functionalVerification,
  anomalies,
  conclusion,
  status,
  nextSteps,
  metadata,
  sampleSize,
  timeRange,
  logTable
} = {}) {
  // Concise header: demand id/time live in the message envelope (buildMarkdownMessage),
  // so the body keeps a single meta line for iterate/sample/window only.
  const meta = [];
  const normalizedMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  const metaParts = [];
  if (normalizedMetadata.iterate) metaParts.push(`**迭代**: ${normalizedMetadata.iterate}`);
  if (sampleSize || normalizedMetadata.sampleSize) metaParts.push(`**样本**: ${sampleSize || normalizedMetadata.sampleSize}`);
  if (timeRange || normalizedMetadata.timeRange) metaParts.push(`**采集窗口**: ${timeRange || normalizedMetadata.timeRange}`);
  if (metaParts.length) meta.push(`- ${metaParts.join(' ｜ ')}`);

  const abExamples = buildAbExamples(logTable);
  const collectionLines = compactParagraphLines(dataLog);
  const hasPerfInput = Boolean(performance) || abExamples.length > 0;
  const perfApplicable = performanceApplicable === false ? false : performanceApplicable === true || hasPerfInput;
  const performanceLines = perfApplicable
    ? [
        compactParagraphLines(performance || conclusion, '暂无性能结论'),
        ...abExamples
      ].filter(Boolean)
    : compactParagraphLines(functionalVerification)
        .split('\n')
        .filter((l) => l && l !== '暂无补充信息');
  if (performanceLines.length === 0) {
    performanceLines.push('- 不适用');
  }
  const statusText = normalizeInlineText(status || conclusion || '待确认');
  const conclusionText = normalizeInlineText(conclusion || statusText);

  return [
    `**结论**: ${conclusionText}。**状态**: ${statusText}`,
    meta.length ? meta.join('\n') : '',
    '',
    EVALUATION_SECTION_TITLES[0],
    compactParagraphLines(requirement),
    '',
    EVALUATION_SECTION_TITLES[1],
    collectionLines,
    '',
    EVALUATION_SECTION_TITLES[2],
    performanceLines.join('\n'),
    '',
    EVALUATION_SECTION_TITLES[3],
    compactParagraphLines(anomalies || functionalRisk, '暂无阻断异常；保留灰度观察。'),
    '',
    EVALUATION_SECTION_TITLES[4],
    compactParagraphLines(nextSteps || functionalRisk || '继续灰度观察核心指标，异常扩大时回滚。')
  ].filter((part) => part !== '').join('\n');
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function buildTitle(demandId) {
  return demandId ? `需求 ${demandId} 评估报告` : '评估报告';
}

function buildMarkdownMessage({ title, demandId, demandSummary, content, timestamp = new Date() }) {
  const meta = [];
  if (demandId) {
    meta.push(`- **需求编号**: ${demandId}`);
  }
  if (demandSummary) {
    meta.push(`- **需求**: ${demandSummary}`);
  }
  meta.push(`- **时间**: ${formatTimestamp(timestamp)}`);

  return [`### ${title}`, '', meta.join('\n'), '', '---', '', truncateContent(content)].join('\n');
}

function buildPayload(title, markdownText) {
  return {
    msgtype: 'markdown',
    markdown: {
      title,
      text: markdownText
    },
    at: {
      isAtAll: false
    }
  };
}

/** Remove webhook / secret / demand label / leading push phrase so the report body is clean. */
function cleanupContent(text, demandId) {
  let content = String(text || '');
  content = content.replace(WEBHOOK_URL_PATTERN, '');
  content = content.replace(SECRET_PATTERN, '');
  if (demandId) {
    content = content.replace(
      new RegExp(`(?:需求编号|需求单号|需求ID|需求id|需求号|demand\\s*id)\\s*[:：#=]?\\s*${demandId}`, 'i'),
      ''
    );
    content = content.replace(new RegExp(`需求\\s*[:：#]?\\s*${demandId}`, 'g'), '');
  }
  content = content.replace(LEADING_PUSH_PHRASE, '');
  // Contract: transport instructions ("需求1234 模板验证报告，推送到钉钉 关键词:报告")
  // live on the first line only; the report body starts at the second line. If the
  // first line carries any transport keyword, drop the whole line so no instruction
  // wording ever leaks into the pushed body.
  const firstBreak = content.indexOf('\n');
  if (firstBreak > 0) {
    const head = content.slice(0, firstBreak);
    const isReportHead = /^\s*(\*\*结论\*\*|#{1,4}\s|- )/.test(head);
    if (!isReportHead && /推送|发送|通知|同步|关键词|机器人|钉钉|dingtalk/i.test(head)) {
      content = content.slice(firstBreak + 1);
    }
  }
  return content
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseInput(input, context = {}) {
  const text = String(input || '');
  let webhook = extractWebhookUrl(text);
  let secret = extractSecret(text);
  let groupName = extractGroupName(text);

  if (!webhook) {
    const groups = (context.skillConfig && context.skillConfig.groups) || {};
    for (const candidate of extractGroupCandidates(text)) {
      const entry = resolveGroupConfig(groups, candidate);
      if (entry) {
        webhook = entry.webhook;
        secret = secret || entry.secret || null;
        groupName = candidate;
        break;
      }
    }
  }

  const demandId = extractDemandId(text);
  return {
    webhook,
    secret,
    demandId,
    groupName: groupName || null,
    content: cleanupContent(text, demandId)
  };
}

function findFirstKey(value, keys, depth = 0) {
  if (depth > 4 || !value || typeof value !== 'object') {
    return null;
  }
  for (const key of keys) {
    if (typeof value[key] === 'string' && value[key].trim()) {
      return value[key].trim();
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstKey(item, keys, depth + 1);
      if (found) {
        return found;
      }
    }
  } else {
    for (const child of Object.values(value)) {
      const found = findFirstKey(child, keys, depth + 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Best-effort demand summary lookup through the workflow MCP adapter.
 * Any failure (missing adapter, MCP error, unknown payload shape) degrades to null.
 */
async function lookupDemandSummary(demandId, context = {}) {
  try {
    const adapter = context.componentRegistry && context.componentRegistry.getAdapter
      ? context.componentRegistry.getAdapter('workflow')
      : null;
    if (!adapter || typeof adapter.callTool !== 'function') {
      return null;
    }
    const result = await adapter.callTool('getDemandInfoByDemandId', { demandId });
    return findFirstKey(result, ['demandName', 'demand_name', 'name']);
  } catch (error) {
    return null;
  }
}

async function sendToWebhook(webhook, payload, secret) {
  const doFetch = resolveFetch();
  if (typeof doFetch !== 'function') {
    const error = new Error('global fetch is not available (requires Node >= 18)');
    error.code = 'MCP_NETWORK_ERROR';
    throw error;
  }

  const url = signWebhookUrl(webhook, secret);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok && body.errcode === undefined) {
      const error = new Error(`DingTalk webhook responded HTTP ${response.status}`);
      error.code = response.status >= 500 ? 'MCP_HTTP_5XX' : 'MCP_HTTP_4XX';
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function describeDingTalkError(errcode, errmsg) {
  if (errcode === 310000) {
    return '机器人安全校验失败: 请检查加签 secret 是否匹配、是否触发了关键词/IP 白名单限制';
  }
  if (errcode === 130101 || errcode === 130102) {
    return '机器人发送频率超限: 每分钟最多约 20 条，请稍后重试或合并内容';
  }
  return `钉钉接口返回错误: ${errmsg || 'unknown error'} (errcode=${errcode})`;
}

module.exports = {
  canHandle(input) {
    if (!input) {
      return false;
    }
    if (WEBHOOK_URL_PATTERN.test(input)) {
      return true;
    }
    return /(钉钉|dingtalk)/i.test(input) && /(推送|发送|通知|报告|机器人|群)/.test(input);
  },

  async execute(input, context = {}) {
    return wrapSkillCall('dingtalk-notify', input, async () => {
      const parsed = parseInput(input, context);

      if (!parsed.webhook) {
        return createSkillError('dingtalk-notify', '未找到钉钉 webhook 地址: 请在输入中提供机器人 webhook URL，或在 skillConfig.skills.dingtalk-notify.groups 中配置目标群', {
          input,
          kind: 'missing-webhook',
          retryable: true,
          retryHints: [
            '在输入中附带完整的钉钉机器人 webhook 地址 (https://oapi.dingtalk.com/robot/send?access_token=...)',
            '或配置 skillConfig.skills.dingtalk-notify.groups.<群名>.webhook 后用"推送到<群名>群"触发'
          ]
        });
      }

      if (!parsed.content) {
        return createSkillError('dingtalk-notify', '推送内容为空: 请在输入中包含要推送的报告内容', {
          input,
          kind: 'invalid-input',
          retryable: false,
          data: { webhook: maskWebhook(parsed.webhook), demandId: parsed.demandId }
        });
      }

      const demandSummary = parsed.demandId
        ? await lookupDemandSummary(parsed.demandId, context)
        : null;
      const title = buildTitle(parsed.demandId);
      const markdownText = buildMarkdownMessage({
        title,
        demandId: parsed.demandId,
        demandSummary,
        content: parsed.content
      });
      const response = await sendToWebhook(parsed.webhook, buildPayload(title, markdownText), parsed.secret);

      if (response && response.errcode !== 0) {
        const errcode = response.errcode === undefined ? -1 : response.errcode;
        return createSkillError('dingtalk-notify', describeDingTalkError(errcode, response.errmsg), {
          input,
          kind: 'dingtalk-api-error',
          retryable: errcode === 130101 || errcode === 130102,
          data: {
            webhook: maskWebhook(parsed.webhook),
            errcode,
            errmsg: response.errmsg || null,
            demandId: parsed.demandId || null
          }
        });
      }

      return createSkillResult('dingtalk-notify', `报告已推送到钉钉群${parsed.groupName ? ` (${parsed.groupName}群)` : ''}`, {
        input,
        data: {
          webhook: maskWebhook(parsed.webhook),
          groupName: parsed.groupName,
          demandId: parsed.demandId || null,
          demandSummary,
          messageTitle: title,
          contentLength: markdownText.length,
          response: {
            errcode: response ? response.errcode : 0,
            errmsg: response ? response.errmsg : 'ok'
          }
        }
      });
    }, { action: 'DingTalk Notify' });
  },

  // exported for tests and downstream tooling
  extractWebhookUrl,
  extractSecret,
  extractDemandId,
  extractGroupName,
  extractGroupCandidates,
  resolveGroupConfig,
  maskWebhook,
  signWebhookUrl,
  buildMarkdownMessage,
  buildTitle,
  buildMarkdownTable,
  buildLayeredEvaluationReport,
  parseInput,
  __setFetchImpl
};
