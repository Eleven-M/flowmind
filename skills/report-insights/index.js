const { reportProgress } = require('../../core/skill-progress');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural-language report request, optionally including job=<name> and limit=<n>'
    },
    context: {
      type: 'object',
      description: 'Optional execution context'
    }
  },
  required: ['input']
};

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    args: { type: 'object' },
    summary: { type: 'object' },
    automationCandidates: { type: 'array' },
    retryHints: { type: 'array' },
    bindingHint: { type: 'object' }
  }
};

module.exports = {
  capabilities: ['reporting'],
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  canHandle(input) {
    if (!input) return false;
    return /构建报告|测试报告|覆盖率报告|build report|coverage report|test report/i.test(input);
  },

  async execute(input, context = {}) {
    const report = context.componentRegistry?.getAdapter('report');
    const params = parseParams(input);
    reportProgress(context, 'parse', 10, 'Parsing report request');
    if (!report) {
      return createSkillError('report-insights', 'Report service not configured. Add the report component first.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: {
          hint: 'Configure friday-auto-report in the report component.',
          availableComponents: { report: false },
        },
        retryHints: [
          'Configure the report component with friday-auto-report.',
          'Bind the report resource before requesting build, test, or coverage summaries.'
        ],
        bindingHint: buildReportBindingHint(params)
      });
    }

    let execution;
    let action;

    if (params.action === 'coverage') {
      action = 'coverage';
      reportProgress(context, 'fetch-coverage', 45, 'Fetching coverage reports');
      execution = await report.listJacocoReports({ jobName: params.jobName, limit: params.limit });
    } else if (params.action === 'test') {
      action = 'test';
      reportProgress(context, 'fetch-test', 45, 'Fetching unit-test reports');
      execution = await report.listUnitReports({ jobName: params.jobName, limit: params.limit });
    } else {
      action = 'build';
      reportProgress(context, 'fetch-build', 45, 'Fetching build reports');
      execution = await report.listBuilds({ jobName: params.jobName, limit: params.limit });
    }
    reportProgress(context, 'summarize', 85, `Summarizing ${action} report data`);
    const summary = summarizeExecution(execution);
    reportProgress(context, 'finalize', 95, `Preparing ${action} report response`);

    return createSkillResult('report-insights', `${capitalize(action)} report summary generated`, {
      input,
      data: {
        action,
        args: params,
        summary,
        automationCandidates: buildAutomationCandidates(action, params, summary)
      }
    });
  }
};

function parseParams(input) {
  const text = String(input || '');
  const params = {
    limit: 5
  };

  if (/覆盖率|coverage/i.test(text)) params.action = 'coverage';
  else if (/测试|unit/i.test(text)) params.action = 'test';
  else params.action = 'build';

  const jobMatch = text.match(/(?:job|任务|项目)\s*[:=]?\s*([A-Za-z0-9._/-]+)/i);
  if (jobMatch) params.jobName = jobMatch[1];
  const limitMatch = text.match(/(?:limit|最近|latest)\s*[:=]?\s*(\d+)/i);
  if (limitMatch) params.limit = Number(limitMatch[1]) || 5;

  return params;
}

function summarizeExecution(execution) {
  const payload = unwrap(execution);
  const items = Array.isArray(payload.list)
    ? payload.list
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.result)
        ? payload.result
        : Array.isArray(payload)
          ? payload
          : [];
  const normalizedItems = items.slice(0, 5).map((item) => ({
    id: item.id || item.buildId || item.number || null,
    name: item.jobName || item.name || item.title || null,
    status: item.status || item.result || item.state || null,
    branch: item.branch || item.gitBranch || null
  }));
  const statusCounts = {};
  for (const item of items) {
    const status = String(item.status || item.result || item.state || 'UNKNOWN').toUpperCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  }
  const failed = Object.entries(statusCounts)
    .filter(([status]) => /FAIL|ERROR|ABORT|UNSTABLE/.test(status))
    .reduce((total, [, count]) => total + count, 0);
  const succeeded = Object.entries(statusCounts)
    .filter(([status]) => /SUCCESS|READY|PASSED|OK/.test(status))
    .reduce((total, [, count]) => total + count, 0);

  return {
    total: payload.total || items.length || null,
    items: normalizedItems,
    statusCounts,
    failed,
    succeeded
  };
}

function buildAutomationCandidates(action, params, summary) {
  const candidates = [];
  const jobName = params.jobName || summary.items[0]?.name || null;
  const normalizedJob = normalizeIdentifier(jobName);

  if (summary.failed > 0) {
    candidates.push({
      skill: 'change-impact-review',
      reason: 'Recent failed report items detected',
      suggestedInput: jobName
        ? `变更影响 repo=${jobName}`
        : '变更影响'
    });
  }

  if (summary.items.length > 0) {
    candidates.push({
      skill: 'archive-change',
      reason: 'Capture report evidence in a release/change archive',
      suggestedInput: normalizedJob
        ? `归档检查 name=${normalizedJob}`
        : '归档检查'
    });
  }

  if (action === 'coverage' && summary.failed > 0) {
    candidates.push({
      skill: 'test-report',
      reason: 'Failed coverage reports usually require corresponding unit-test inspection',
      suggestedInput: jobName
        ? `测试报告 job=${jobName}`
        : '测试报告'
    });
  }

  return candidates;
}

function buildReportBindingHint(params = {}) {
  const jobSegment = params.jobName ? ` job=${params.jobName}` : '';
  return {
    kind: 'mcp-binding',
    componentType: 'report',
    provider: 'friday-report',
    mcpServer: 'friday-auto-report',
    suggestedCommand: `flowmind "绑定报告 mcp=friday-auto-report${jobSegment}"`
  };
}

function normalizeIdentifier(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function unwrap(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value.content)) {
    const text = value.content.find((item) => typeof item?.text === 'string')?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }
  return value.data && typeof value.data === 'object' ? value.data : value;
}

function capitalize(value) {
  return String(value || '').slice(0, 1).toUpperCase() + String(value || '').slice(1);
}
