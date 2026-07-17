/**
 * Auto Flow Skill
 * Route deployment and workflow requests to the configured workflow MCP adapter.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { callMcpTool } = require('../../core/mcp-http-client');
const { createSkillError, createSkillResult } = require('../../core/result-contract');
const { reportProgress } = require('../../core/skill-progress');

const BUILTIN_WORKFLOWS = {
  'dev-workflow': {
    name: 'Development Workflow',
    steps: [
      { id: 'review', skill: 'code-review', name: 'Code Review' },
      { id: 'test', action: 'run-command', command: 'npm test', depends_on: ['review'] },
      { id: 'docs', action: 'run-command', command: 'npm run docs', depends_on: ['test'] },
      { id: 'archive', skill: 'archive-change', name: 'Archive', depends_on: ['docs'] }
    ]
  },
  'deploy-workflow': {
    name: 'Deploy Workflow',
    steps: [
      { id: 'validate', action: 'run-command', command: 'npm run validate' },
      { id: 'build', action: 'run-command', command: 'npm run build', depends_on: ['validate'] },
      { id: 'deploy', action: 'deploy', depends_on: ['build'] },
      { id: 'verify', action: 'run-command', command: 'npm run verify', depends_on: ['deploy'] },
      { id: 'notify', action: 'notify', depends_on: ['verify'] }
    ]
  }
};

const GENERIC_SERVICE_TOKENS = new Set([
  'flowmind', 'auto', 'flow', 'workflow', 'workflows', 'pipeline', 'pipelines',
  'deploy', 'deployment', 'run', 'start', 'status', 'list', 'show',
  'service', 'services', 'skill', 'skills', 'prod', 'gray', 'uat', 'test'
]);

const TOOL_NAMES = {
  listPipelines: 'flowListPipelines',
  startPipelineRun: 'flowStartPipelineRun',
  startBatchPipelineRun: 'flowStartBatchPipelineRun',
  getPipelineRun: 'flowGetPipelineRun',
  listPipelineRuns: 'flowListPipelineRuns'
};

const LOCAL_PIPELINE_MAP_CANDIDATES = [
  process.env.FLOWMIND_AUTO_FLOW_MAP,
  path.join(process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE || os.homedir(), '.flowmind', 'source', 'auto-flow-pipeline-map.json'),
  path.join(process.cwd(), 'source', 'auto-flow-pipeline-map.json'),
  path.join(__dirname, '..', '..', '..', 'source', 'auto-flow-pipeline-map.json')
].filter(Boolean);

const ENV_PREFIX_TO_ENV = {
  test: 'test',
  dev: 'test',
  uat: 'uat',
  gray: 'gray',
  prod: 'prod'
};

module.exports = {
  canHandle(input) {
    if (!input) return false;
    if (/绑定|bind|保存|记住/i.test(input) && /(mcp|token|地址|host|endpoint|url)/i.test(input)) {
      return false;
    }
    return /自动化|自动部署|auto.*flow|工作流|workflow|pipeline|部署|发布|上线|执行流程|运行流程/i.test(input);
  },

  async execute(input, context) {
    const skillSettings = getSkillSettings(context);
    reportProgress(context, 'parse', 10, 'Parsing workflow request');
    const params = parseFlowParams(input);
    reportProgress(context, 'resolve-client', 20, 'Resolving workflow client');
    const workflow = createWorkflowClient(context);

    if (params.action === 'define') {
      reportProgress(context, 'define', 80, 'Preparing workflow definition');
      const definition = buildWorkflowDefinitionSummary(skillSettings);
      return createSkillResult('auto-flow', 'Define a workflow in YAML format', {
        input,
        data: {
          format: 'YAML workflow definition',
          execution: definition,
          skillConfig: skillSettings
        }
      });
    }

    if (!workflow.client) {
      return buildNoAdapterResult(input, params, skillSettings);
    }

    if (params.action === 'status') {
      const execution = await executeStatus(workflow, params, input, context);
      reportProgress(context, 'finalize', 95, 'Preparing workflow status response');
      return createSkillResult('auto-flow', 'Workflow status: query completed', {
        input,
        data: {
          action: 'status',
          provider: workflow.provider,
          binding: workflow.binding,
          status: 'completed',
          mcpServer: getWorkflowMcpServer(workflow),
          execution: summarizeWorkflowExecution('status', params, execution),
          skillConfig: skillSettings
        }
      });
    }

    if (params.action === 'deploy' || params.action === 'run') {
      return executeDeploy(workflow, params, input, context, skillSettings);
    }

    if (params.action === 'list' || params.serviceNames.length > 0) {
      reportProgress(context, 'list-pipelines', 60, 'Listing workflow pipelines');
      const execution = await workflow.client.listPipelines(buildListPipelineParams(params));
      reportProgress(context, 'finalize', 95, 'Preparing workflow list response');
      return createSkillResult('auto-flow', 'Workflow status: pipeline lookup completed', {
        input,
        data: {
          action: 'list',
          provider: workflow.provider,
          binding: workflow.binding,
          status: 'completed',
          mcpServer: getWorkflowMcpServer(workflow),
          execution: summarizeWorkflowExecution('list', params, execution),
          skillConfig: skillSettings
        }
      });
    }

    if (params.workflow && BUILTIN_WORKFLOWS[params.workflow]) {
      reportProgress(context, 'builtin-workflow', 85, `Preparing builtin workflow: ${params.workflow}`);
      const workflowDef = BUILTIN_WORKFLOWS[params.workflow];
      return createSkillResult('auto-flow', `Workflow ready: ${workflowDef.name}`, {
        input,
        data: {
          workflow: params.workflow,
          execution: buildBuiltinWorkflowSummary(params.workflow, workflowDef),
          provider: workflow.provider,
          skillConfig: skillSettings
        }
      });
    }

    return createSkillResult('auto-flow', 'Auto Flow. Available actions: deploy, status, list, define', {
      input,
      data: {
        actions: [
          'deploy - Start pipeline run by service/pipeline',
          'status - Query pipeline run status',
          'list - Search available pipelines',
          'define - Define a custom workflow'
        ],
        builtinWorkflows: Object.keys(BUILTIN_WORKFLOWS),
        provider: workflow.provider,
        binding: workflow.binding,
        execution: buildAutoFlowHintSummary(workflow, skillSettings),
        skillConfig: skillSettings
      }
    });
  }
};

function createWorkflowClient(context) {
  const skillSettings = getSkillSettings(context);
  const adapter = context.componentRegistry?.getAdapter('workflow');
  if (adapter) {
    return {
      client: adapter,
      provider: adapter.providerName,
      binding: context.resourceBinding?.componentType === 'workflow' ? context.resourceBinding : null,
      transportBacked: true
    };
  }

  const binding = context.resourceBinding?.componentType === 'workflow'
    ? context.resourceBinding
    : null;

  if (!binding?.mcpServer) {
    return { client: null, provider: null, binding: null, transportBacked: false };
  }

  const transport = buildWorkflowTransport(binding);
  if (!transport.url) {
    return { client: null, provider: binding.provider || null, binding, transportBacked: false };
  }

  return {
    client: {
      providerName: binding.provider || 'workflow-binding',
      async listPipelines(params) {
        return callWorkflowMcp(binding, transport, TOOL_NAMES.listPipelines, params);
      },
      async getCurrentIterate() {
        return callWorkflowMcp(binding, transport, 'getCurrentIterate', {});
      },
      async listDeployChecklists(params) {
        return callWorkflowMcp(binding, transport, 'listDeployChecklists', params);
      },
      async orderList(params) {
        return callWorkflowMcp(binding, transport, 'orderList', params);
      },
      async startPipelineRun(pipelineId) {
        return callWorkflowMcp(binding, transport, TOOL_NAMES.startPipelineRun, { pipelineId });
      },
      async startBatchPipelineRun(params) {
        return callWorkflowMcp(binding, transport, TOOL_NAMES.startBatchPipelineRun, params);
      },
      async getPipelineRun(pipelineId, runId) {
        return callWorkflowMcp(binding, transport, TOOL_NAMES.getPipelineRun, { pipelineId, pipelineRunId: runId });
      },
      async listPipelineRuns(pipelineId, params) {
        return callWorkflowMcp(binding, transport, TOOL_NAMES.listPipelineRuns, { pipelineId, ...(params || {}) });
      }
    },
    provider: binding.provider || 'workflow-binding',
    binding,
    transportBacked: true,
    workflowSettings: skillSettings
  };
}

function buildWorkflowTransport(binding) {
  const connection = binding?.connection || {};
  const headers = {};

  if (connection.token) {
    headers.Authorization = `Bearer ${connection.token}`;
  }
  if (connection.apiKey) {
    headers['X-API-Key'] = connection.apiKey;
  }

  return {
    url: connection.url || connection.address || connection.endpoint || null,
    headers,
    timeoutMs: connection.timeoutMs || 60000
  };
}

function callWorkflowMcp(binding, transport, tool, params) {
  return callMcpTool({
    url: transport.url,
    headers: transport.headers,
    tool,
    args: params || {},
    timeoutMs: transport.timeoutMs || 60000,
    serverName: binding.mcpServer || binding.provider || 'workflow'
  });
}

function summarizeWorkflowExecution(action, params, execution) {
  const payload = unwrapMcpResult(execution);
  const records = extractRecords(payload);
  const total = extractTotalCount(payload, records);

  return compactObject({
    action,
    summary: buildWorkflowSummaryText(action, params, total, records),
    total,
    status: extractWorkflowStatus(payload, action),
    target: buildWorkflowTargetLabel(params),
    environment: params.environment || null,
    items: records.slice(0, 5).map((record) => summarizeWorkflowRecord(record))
  });
}

function summarizeDeployExecution(params, execution, context = {}) {
  const payload = unwrapMcpResult(execution);
  const payloadList = Array.isArray(payload) ? payload : [payload];
  const primary = payloadList.find((item) => item !== null && item !== undefined) || null;
  const summaryTarget = buildWorkflowTargetLabel(params) || buildDeployTargetLabel(context) || 'deployment';

  return compactObject({
    action: 'deploy',
    summary: buildDeploySummaryText(summaryTarget, primary, context, payloadList.length),
    status: extractDeployStatus(primary),
    target: summaryTarget,
    pipelineId: context.pipelineId || params.pipelineId || (Array.isArray(context.pipelineIds) && context.pipelineIds.length === 1 ? context.pipelineIds[0] : null),
    pipelineIds: Array.isArray(context.pipelineIds) && context.pipelineIds.length > 0 ? context.pipelineIds : null,
    source: context.source || null,
    runId: extractDeployRunId(primary),
    count: payloadList.length > 1 ? payloadList.length : null,
    details: summarizeDeployDetails(primary)
  });
}

function buildWorkflowDefinitionSummary(skillSettings = {}) {
  return {
    action: 'define',
    summary: 'Prepared a YAML workflow template',
    format: 'YAML workflow definition',
    parallel: skillSettings.execution?.parallel !== false,
    maxConcurrent: skillSettings.execution?.maxConcurrent || 5,
    timeout: skillSettings.execution?.timeout || 3600,
    example: {
      name: 'My Workflow',
      steps: [
        { id: 'step1', action: 'run-command', command: 'echo hello' },
        { id: 'step2', skill: 'code-review', depends_on: ['step1'] }
      ]
    }
  };
}

function buildBuiltinWorkflowSummary(workflowName, workflowDef) {
  return {
    action: 'workflow',
    summary: `Workflow ready: ${workflowDef.name}`,
    workflow: workflowName,
    name: workflowDef.name,
    stepCount: Array.isArray(workflowDef.steps) ? workflowDef.steps.length : 0,
    steps: (workflowDef.steps || []).map((step) => compactObject({
      id: step.id,
      skill: step.skill || null,
      action: step.action || null,
      name: step.name || null,
      depends_on: Array.isArray(step.depends_on) ? step.depends_on : null
    }))
  };
}

function buildAutoFlowHintSummary(workflow, skillSettings = {}) {
  return {
    action: 'hint',
    summary: workflow?.binding
      ? `Workflow service bound to ${workflow.binding.mcpServer}`
      : 'Workflow service not configured',
    provider: workflow?.provider || null,
    binding: workflow?.binding || null,
    configured: !!workflow?.client,
    workflowPath: skillSettings.workflows?.path || './workflows',
    notifications: skillSettings.notifications || {}
  };
}

function buildWorkflowSummaryText(action, params, total, records) {
  const target = buildWorkflowTargetLabel(params) || 'all workflows';
  const count = typeof total === 'number' ? total : records.length;

  if (action === 'status') {
    return `Checked ${target}${count !== null ? `, ${count} record(s) found` : ''}`;
  }

  if (action === 'list') {
    return `Listed workflows for ${target}${count !== null ? `, ${count} pipeline(s) found` : ''}`;
  }

  return `Workflow ${action} completed`;
}

function buildWorkflowTargetLabel(params) {
  if (params.pipelineId && params.runId) {
    return `pipeline ${params.pipelineId} / run ${params.runId}`;
  }
  if (params.pipelineId) {
    return `pipeline ${params.pipelineId}`;
  }
  if (params.serviceNames?.length > 0) {
    return params.serviceNames.join(', ');
  }
  if (params.workflow) {
    return params.workflow;
  }
  return params.environment || null;
}

function buildDeployTargetLabel(context) {
  if (Array.isArray(context.pipelineIds) && context.pipelineIds.length > 0) {
    return `pipeline ${context.pipelineIds.join(', ')}`;
  }
  if (context.pipelineId) {
    return `pipeline ${context.pipelineId}`;
  }
  if (Array.isArray(context.services) && context.services.length > 0) {
    return context.services.map((item) => item.serviceName || item.service || item.pipelineName || item.pipelineId).filter(Boolean).join(', ');
  }
  return null;
}

function buildDeploySummaryText(target, payload, context, count = 1) {
  const status = extractDeployStatus(payload) || 'submitted';
  const runId = extractDeployRunId(payload);
  const source = context.source ? ` via ${context.source}` : '';
  const countSuffix = count > 1 ? ` (${count} items)` : '';

  if (runId) {
    return `Deployment ${status} for ${target}${source}, run ${runId}${countSuffix}`;
  }

  return `Deployment ${status} for ${target}${source}${countSuffix}`;
}

function extractDeployStatus(payload) {
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.status,
      payload.state,
      payload.result?.status,
      payload.result?.state
    ].filter(Boolean);
    if (candidates.length > 0) {
      return String(candidates[0]);
    }

    if (payload.submitted === true) {
      return 'submitted';
    }
  }

  return null;
}

function extractDeployRunId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const candidates = [
    payload.pipelineRunId,
    payload.pipeline_run_id,
    payload.runId,
    payload.run_id,
    payload.result?.pipelineRunId,
    payload.result?.pipeline_run_id,
    payload.result?.runId,
    payload.result?.run_id
  ];

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    return String(candidate);
  }

  return null;
}

function summarizeDeployDetails(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const details = compactObject({
    submitted: typeof payload.submitted === 'boolean' ? payload.submitted : null,
    pipelineRunId: payload.pipelineRunId || payload.pipeline_run_id || null,
    pipelineId: payload.pipelineId || payload.pipeline_id || null,
    message: payload.message || payload.result?.message || null
  });

  return Object.keys(details).length > 0 ? details : null;
}

function unwrapMcpResult(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const textContent = Array.isArray(payload.content) ? payload.content : payload.result?.content;
  if (Array.isArray(textContent)) {
    const textItem = textContent.find((item) => item?.type === 'text' && typeof item.text === 'string');
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text);
      } catch (error) {
        return payload;
      }
    }
  }

  return payload;
}

function extractRecords(payload) {
  const normalized = unwrapMcpResult(payload);
  if (!normalized) return [];
  if (Array.isArray(normalized)) return normalized;

  const candidates = [
    normalized.data,
    normalized.rows,
    normalized.list,
    normalized.records,
    normalized.result?.data,
    normalized.result?.rows,
    normalized.result?.list,
    normalized.result?.records
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractTotalCount(payload, records) {
  if (payload && typeof payload === 'object') {
    const candidates = [payload.total, payload.count, payload.result?.total, payload.result?.count];
    for (const candidate of candidates) {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        return candidate;
      }
      if (typeof candidate === 'string' && candidate.trim() !== '' && !Number.isNaN(Number(candidate))) {
        return Number(candidate);
      }
    }
  }

  return records.length;
}

function extractWorkflowStatus(payload, action) {
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.status,
      payload.state,
      payload.result?.status,
      payload.result?.state
    ].filter(Boolean);
    if (candidates.length > 0) {
      return String(candidates[0]);
    }
  }

  return action === 'status' ? 'completed' : 'completed';
}

function summarizeWorkflowRecord(record) {
  const fields = parseWorkflowFields(record?.fields);
  return compactObject({
    pipelineName: record?.pipelineName || record?.name || fields?.pipelineName || fields?.name || null,
    pipelineId: record?.pipelineId || fields?.pipelineId || extractIdFromFields(fields) || null,
    service: extractWorkflowService(fields),
    status: record?.status || fields?.status || fields?.state || null,
    env: record?.env || fields?.env || fields?.environment || null
  });
}

function parseWorkflowFields(fields) {
  if (!fields) return null;
  if (typeof fields === 'object') return fields;
  if (typeof fields !== 'string') return null;

  try {
    return JSON.parse(fields);
  } catch (error) {
    return null;
  }
}

function extractWorkflowService(fields) {
  if (!fields) return null;
  if (Array.isArray(fields.service) && fields.service.length > 0) {
    return fields.service[0];
  }
  if (typeof fields.service === 'string') {
    return fields.service;
  }
  return fields.serviceName || fields.service_name || null;
}

function extractIdFromFields(fields) {
  if (!fields || typeof fields !== 'object') return null;
  const candidates = [fields.pipelineId, fields.pipeline_id, fields.id];
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined || candidate === '') continue;
    return String(candidate);
  }
  return null;
}

function buildNoAdapterResult(input, params, skillSettings = {}) {
  if (params.workflow && BUILTIN_WORKFLOWS[params.workflow]) {
    const workflow = BUILTIN_WORKFLOWS[params.workflow];
    return createSkillResult('auto-flow', `Workflow ready: ${workflow.name}`, {
      input,
      data: {
        workflow: params.workflow,
        execution: buildBuiltinWorkflowSummary(params.workflow, workflow),
        skillConfig: skillSettings
      }
    });
  }

  return createSkillError('auto-flow', 'Workflow service not configured. Connect friday-auto-flow first.', {
    input,
    kind: 'missing-component',
    retryable: true,
    data: {
        status: 'not_configured',
        hint: 'Run `flowmind resource` to review current bindings, then save one like: `flowmind "绑定发布业务 mcp=friday-auto-flow token=xxx env=uat"`',
        execution: buildAutoFlowHintSummary({
          client: null,
          provider: null,
          binding: null
        }, skillSettings),
        skillConfig: skillSettings
      },
    retryHints: [
      'Configure the workflow component with friday-auto-flow.',
      'Or save a workflow resource binding and retry the deployment request.'
    ]
  });
}

async function executeDeploy(workflow, params, input, context, skillSettings = {}) {
  if (params.pipelineId) {
    reportProgress(context, 'start-deploy', 55, `Starting deployment for pipeline ${params.pipelineId}`);
    const execution = await workflow.client.startPipelineRun(params.pipelineId);
    reportProgress(context, 'finalize', 95, 'Preparing deployment response');
    return createSkillResult('auto-flow', 'Workflow status: deployment submitted', {
      input,
      data: {
        action: 'deploy',
        provider: workflow.provider,
        binding: workflow.binding,
        status: 'submitted',
        mcpServer: getWorkflowMcpServer(workflow),
        execution: summarizeDeployExecution(params, execution, {
          source: 'direct-input',
          pipelineId: params.pipelineId
        }),
        skillConfig: skillSettings,
        resolution: {
          source: 'direct-input',
          pipelineId: params.pipelineId
        }
      }
    });
  }

  reportProgress(context, 'resolve-targets', 45, 'Resolving deployment targets');
  const resolvedTargets = await resolvePipelineTargets(workflow, params, context);
  if (resolvedTargets.pipelineIds.length > 0) {
    const executions = [];
    reportProgress(context, 'start-deploy', 70, `Starting ${resolvedTargets.pipelineIds.length} pipeline run(s)`);
    for (const pipelineId of resolvedTargets.pipelineIds) {
      executions.push(await workflow.client.startPipelineRun(pipelineId));
    }
    reportProgress(context, 'finalize', 95, 'Preparing deployment response');

    return createSkillResult('auto-flow', 'Workflow status: deployment submitted', {
      input,
      data: {
        action: 'deploy',
        provider: workflow.provider,
        binding: workflow.binding,
        status: 'submitted',
        mcpServer: getWorkflowMcpServer(workflow),
        execution: summarizeDeployExecution(params, executions.length === 1 ? executions[0] : executions, {
          source: resolvedTargets.source,
          pipelineIds: resolvedTargets.pipelineIds,
          services: resolvedTargets.resolutions
        }),
        skillConfig: skillSettings,
        resolution: {
          source: resolvedTargets.source,
          pipelineIds: resolvedTargets.pipelineIds,
          services: resolvedTargets.resolutions
        }
      }
    });
  }

  return buildUnresolvedDeployResult(workflow, params, input, context, skillSettings);
}

async function executeStatus(workflow, params, input, context = {}) {
  let execution;
  if (params.pipelineId && params.runId) {
    reportProgress(context, 'fetch-run', 60, `Fetching pipeline run ${params.runId}`);
    execution = await workflow.client.getPipelineRun(params.pipelineId, params.runId);
  } else if (params.pipelineId) {
    reportProgress(context, 'fetch-runs', 60, `Listing runs for pipeline ${params.pipelineId}`);
    execution = await workflow.client.listPipelineRuns(params.pipelineId, {
      env: params.environment
    });
  } else {
    reportProgress(context, 'fetch-pipelines', 60, 'Listing pipelines for status query');
    execution = await workflow.client.listPipelines(buildListPipelineParams(params));
  }

  return execution;
}

function parseFlowParams(input) {
  const params = {
    action: null,
    workflow: null,
    serviceNames: [],
    environment: null,
    pipelineId: null,
    runId: null
  };

  if (/列表|list|查看.*流程|查看.*pipeline|查询.*流程|搜索.*流程|show|find|search/i.test(input)) {
    params.action = 'list';
  }
  if (/状态|status|进度|运行记录|run record|record/i.test(input)) {
    params.action = 'status';
  }
  if (/定义|define|创建流程|create.*workflow/i.test(input)) {
    params.action = 'define';
  }
  if (/部署|发布|上线|deploy|release/i.test(input)) {
    params.action = 'deploy';
  } else if (/执行|run|start|运行/i.test(input)) {
    params.action = 'run';
  }

  const workflowMatch = input.match(/(?:workflow|流程|工作流)\s*[:=]?\s*([A-Za-z0-9._-]+)/i);
  if (workflowMatch) params.workflow = workflowMatch[1];

  const pipelineIdMatch = input.match(/(?:pipelineId|pipeline_id|pipeline)\s*[:=]?\s*([A-Za-z0-9._-]+)/i);
  if (pipelineIdMatch) params.pipelineId = pipelineIdMatch[1];

  const runIdMatch = input.match(/(?:runId|run_id|pipelineRunId|运行id)\s*[:=]?\s*([A-Za-z0-9._-]+)/i);
  if (runIdMatch) params.runId = runIdMatch[1];

  const envMatch = input.match(/(?:环境|env|environment)\s*[:=]?\s*(test|uat|gray|prod|dev|sit|staging|production|测试|预发|灰度|生产)/i);
  if (envMatch) {
    params.environment = normalizeEnvironment(envMatch[1]);
  } else {
    const inferredEnv = inferEnvironmentFromText(input);
    if (inferredEnv) params.environment = inferredEnv;
  }

  params.serviceNames = extractServiceNames(input);
  applyPrefixedServiceNormalization(params);

  if (!params.workflow && /deploy-workflow|dev-workflow/i.test(input)) {
    params.workflow = input.match(/deploy-workflow|dev-workflow/i)[0];
  }

  if (!params.action && params.serviceNames.length > 0) {
    params.action = 'list';
  }

  return params;
}

function buildListPipelineParams(params) {
  return compactObject({
    keyword: params.serviceNames.join(',') || params.workflow || undefined,
    env: params.environment,
    services: params.serviceNames.length > 0 ? params.serviceNames : undefined,
    pipelineId: params.pipelineId
  });
}

function _buildBatchRunParams(params) {
  return compactObject({
    env: params.environment,
    services: params.serviceNames.length > 0 ? params.serviceNames : undefined,
    pipelineNames: params.serviceNames.length > 0 ? params.serviceNames : undefined,
    workflow: params.workflow,
    pipelineId: params.pipelineId
  });
}

function extractServiceNames(input) {
  const rawTokens = input.match(/[A-Za-z][A-Za-z0-9._-]{2,}/g) || [];
  return [...new Set(rawTokens.filter((token) => {
    const normalized = token.toLowerCase();
    if (GENERIC_SERVICE_TOKENS.has(normalized)) return false;
    return normalized.includes('-') || normalized.includes('_') || normalized.endsWith('service');
  }))];
}

function inferEnvironmentFromText(input) {
  if (/生产|prod|production/i.test(input)) return 'prod';
  if (/灰度|gray/i.test(input)) return 'gray';
  if (/预发|uat/i.test(input)) return 'uat';
  if (/测试|test|dev|sit/i.test(input)) return 'test';
  return null;
}

function normalizeEnvironment(value) {
  const normalized = String(value).toLowerCase();
  if (['生产', 'prod', 'production'].includes(normalized)) return 'prod';
  if (['灰度', 'gray'].includes(normalized)) return 'gray';
  if (['预发', 'uat', 'staging'].includes(normalized)) return 'uat';
  if (['测试', 'test', 'dev', 'sit'].includes(normalized)) return 'test';
  return normalized;
}

function applyPrefixedServiceNormalization(params) {
  const normalizedServices = [];

  for (const originalName of params.serviceNames) {
    const prefixed = splitPrefixedServiceName(originalName);
    if (prefixed) {
      if (!params.environment) {
        params.environment = prefixed.environment;
      }
      normalizedServices.push(prefixed.serviceName);
      continue;
    }
    normalizedServices.push(originalName);
  }

  params.serviceNames = [...new Set(normalizedServices)];
}

function splitPrefixedServiceName(serviceName) {
  const match = String(serviceName || '').match(/^(test|dev|uat|gray|prod)-(.+)$/i);
  if (!match || !match[2] || !match[2].includes('-')) {
    return null;
  }

  return {
    environment: ENV_PREFIX_TO_ENV[match[1].toLowerCase()] || normalizeEnvironment(match[1]),
    serviceName: match[2]
  };
}

async function resolvePipelineTargets(workflow, params, context) {
  if (params.serviceNames.length === 0) {
    return { source: null, resolutions: [], pipelineIds: [] };
  }

  const resolutions = [];
  let source = null;

  for (const serviceName of params.serviceNames) {
    const resolution = await resolvePipelineForService(workflow, {
      serviceName,
      environment: params.environment,
      context
    });

    if (!resolution?.pipelineId) {
      return { source: null, resolutions: [], pipelineIds: [] };
    }

    source = source || resolution.source;
    resolutions.push(resolution);
  }

  return {
    source,
    resolutions,
    pipelineIds: [...new Set(resolutions.map((item) => String(item.pipelineId)))]
  };
}

async function resolvePipelineForService(workflow, { serviceName, environment, context }) {
  const localResolution = resolveLocalPipelineForService(serviceName, environment, context);
  if (localResolution) {
    return localResolution;
  }

  if (!workflow.transportBacked || typeof workflow.client?.getCurrentIterate !== 'function') {
    return null;
  }

  return resolveRemotePipelineForService(workflow.client, serviceName, environment);
}

function resolveLocalPipelineForService(serviceName, environment, context) {
  const pipelineMap = readLocalPipelineMap(context);
  if (!pipelineMap) return null;

  const entry = pipelineMap[serviceName];
  if (!entry) return null;

  const pipeline = selectPipelineFromEntry(entry, environment, serviceName);
  if (!pipeline?.pipelineId) return null;

  return {
    source: 'local-map',
    serviceName,
    environment: environment || inferEnvironmentFromPipelineName(pipeline.pipelineName),
    pipelineId: String(pipeline.pipelineId),
    pipelineName: pipeline.pipelineName || null
  };
}

function readLocalPipelineMap(context) {
  if (context?.pipelineMap && typeof context.pipelineMap === 'object') {
    return context.pipelineMap;
  }

  for (const candidate of buildLocalPipelineMapCandidates(context)) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    try {
      return JSON.parse(fs.readFileSync(candidate, 'utf8'));
    } catch (error) {
      continue;
    }
  }

  return null;
}

function buildLocalPipelineMapCandidates(context = {}) {
  const candidates = [...LOCAL_PIPELINE_MAP_CANDIDATES];
  const skillSettings = getSkillSettings(context);
  const workflowPath = skillSettings.workflows?.path;

  if (workflowPath) {
    const resolvedPath = resolveWorkflowMapPath(workflowPath);
    if (resolvedPath) {
      candidates.unshift(resolvedPath);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

function resolveWorkflowMapPath(workflowPath) {
  const resolved = path.isAbsolute(workflowPath) ? workflowPath : path.resolve(process.cwd(), workflowPath);

  try {
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return resolved;
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, 'auto-flow-pipeline-map.json');
    }
  } catch {
    return null;
  }

  return path.join(resolved, 'auto-flow-pipeline-map.json');
}

function selectPipelineFromEntry(entry, environment, serviceName) {
  const preferredKeys = getEnvLookupOrder(environment);
  for (const key of preferredKeys) {
    const candidate = normalizePipelineCollection(entry?.[key]);
    const matched = candidate.find((item) => matchesPipelineName(item.pipelineName, environment, serviceName));
    if (matched) {
      return matched;
    }
  }

  return null;
}

function normalizePipelineCollection(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => {
      if (!item) return null;
      if (typeof item === 'string') {
        return parsePipelineDescriptor(item);
      }
      if (typeof item === 'object' && item.pipelineId) {
        return {
          pipelineName: item.pipelineName || item.name || null,
          pipelineId: String(item.pipelineId)
        };
      }
      return null;
    })
    .filter(Boolean);
}

async function resolveRemotePipelineForService(client, serviceName, environment) {
  const iterateName = await lookupCurrentIterateName(client);
  const searchers = [
    async () => parseRemotePipelineLookup(
      await client.listDeployChecklists({ pageNum: '1', pageSize: '200', iterate: iterateName }),
      serviceName,
      environment,
      'deploy-checklists'
    ),
    async () => parseRemotePipelineLookup(
      await client.orderList({ pageNum: '1', pageSize: '200', iterateName }),
      serviceName,
      environment,
      'order-list'
    )
  ];

  for (const search of searchers) {
    const resolution = await search();
    if (resolution?.pipelineId) {
      return resolution;
    }
  }

  return null;
}

async function lookupCurrentIterateName(client) {
  const payload = unwrapMcpPayload(await client.getCurrentIterate());
  if (payload?.name && typeof payload.name === 'string') {
    return payload.name;
  }
  const values = collectNestedValues(payload);
  const iterateName = values.find((value) => typeof value === 'string' && /\d+\.\d+/.test(value));
  return iterateName || null;
}

function parseRemotePipelineLookup(payload, serviceName, environment, source) {
  const records = extractRecordArray(payload);
  for (const record of records) {
    const fields = parseFields(record.fields);
    if (!fields || !matchesRemoteService(fields, serviceName, environment)) {
      continue;
    }

    const pipeline = selectPipelineFromFields(fields, environment, serviceName);
    if (pipeline?.pipelineId) {
      return {
        source,
        serviceName,
        environment: environment || inferEnvironmentFromPipelineName(pipeline.pipelineName),
        pipelineId: String(pipeline.pipelineId),
        pipelineName: pipeline.pipelineName || null
      };
    }
  }

  return null;
}

function extractRecordArray(payload) {
  const normalized = unwrapMcpPayload(payload);
  if (!normalized) return [];
  if (Array.isArray(normalized)) return normalized;

  const candidates = [
    normalized.data,
    normalized.rows,
    normalized.list,
    normalized.records,
    normalized.result?.data,
    normalized.result?.rows,
    normalized.result?.list,
    normalized.result?.records
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function parseFields(fields) {
  if (!fields) return null;
  if (typeof fields === 'object') return fields;
  if (typeof fields !== 'string') return null;

  try {
    return JSON.parse(fields);
  } catch (error) {
    return null;
  }
}

function unwrapMcpPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  const textContent = Array.isArray(payload.content) ? payload.content : payload.result?.content;
  if (Array.isArray(textContent)) {
    const textItem = textContent.find((item) => item?.type === 'text' && typeof item.text === 'string');
    if (textItem?.text) {
      try {
        return JSON.parse(textItem.text);
      } catch (error) {
        return payload;
      }
    }
  }

  return payload;
}

function matchesRemoteService(fields, serviceName, environment) {
  const services = Array.isArray(fields.service) ? fields.service.map((item) => String(item).trim()) : [];
  if (services.includes(serviceName)) {
    return true;
  }

  const expectedPipelineName = buildPrefixedPipelineName(serviceName, environment);
  const pipelineCandidates = collectFieldPipelineDescriptors(fields, environment)
    .map((item) => item.pipelineName)
    .filter(Boolean);

  return expectedPipelineName ? pipelineCandidates.includes(expectedPipelineName) : false;
}

function selectPipelineFromFields(fields, environment, serviceName) {
  const candidates = collectFieldPipelineDescriptors(fields, environment);
  for (const candidate of candidates) {
    if (candidate?.pipelineId && matchesPipelineName(candidate.pipelineName, environment, serviceName)) {
      return candidate;
    }
  }
  return null;
}

function collectFieldPipelineDescriptors(fields, environment) {
  const keys = getFieldKeysForEnvironment(environment);
  const results = [];

  for (const key of keys) {
    const values = Array.isArray(fields[key]) ? fields[key] : (fields[key] ? [fields[key]] : []);
    for (const value of values) {
      const parsed = parsePipelineDescriptor(value);
      if (parsed?.pipelineId) {
        results.push(parsed);
      }
    }
  }

  return results;
}

function getFieldKeysForEnvironment(environment) {
  const normalized = normalizeEnvironment(environment || '');
  if (normalized === 'prod') return ['prodPipeline', 'pipeline'];
  if (normalized === 'gray') return ['grayPipeline', 'prodPipeline', 'pipeline'];
  return ['pipeline', 'grayPipeline', 'prodPipeline'];
}

function parsePipelineDescriptor(value) {
  if (!value) return null;
  const parts = String(value).split('#@').map((item) => item.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    pipelineName: parts[0] || null,
    pipelineId: parts[1] || null
  };
}

function getEnvLookupOrder(environment) {
  const normalized = normalizeEnvironment(environment || '');
  if (normalized === 'prod') return ['prod'];
  if (normalized === 'gray') return ['gray'];
  if (normalized === 'uat') return ['uat'];
  if (normalized === 'test') return ['test', 'dev'];
  if (normalized === 'dev') return ['dev'];
  return [];
}

function buildPrefixedPipelineName(serviceName, environment) {
  if (!serviceName) return null;
  const normalized = normalizeEnvironment(environment || '');
  if (!normalized) return null;
  const prefix = normalized === 'test' ? 'test' : normalized;
  return `${prefix}-${serviceName}`;
}

function matchesPipelineName(pipelineName, environment, serviceName) {
  if (!pipelineName || !serviceName) return false;

  const normalized = String(pipelineName).toLowerCase();
  const candidatePrefixes = getAllowedPipelinePrefixes(environment);
  return candidatePrefixes.some((prefix) => normalized === `${prefix}-${serviceName}`.toLowerCase());
}

function getAllowedPipelinePrefixes(environment) {
  const normalized = normalizeEnvironment(environment || '');
  if (normalized === 'test') return ['test', 'dev'];
  if (normalized === 'dev') return ['dev'];
  if (normalized === 'uat') return ['uat'];
  if (normalized === 'gray') return ['gray'];
  if (normalized === 'prod') return ['prod'];
  return [];
}

function inferEnvironmentFromPipelineName(pipelineName) {
  const match = String(pipelineName || '').match(/^(test|dev|uat|gray|prod)-/i);
  return match ? (ENV_PREFIX_TO_ENV[match[1].toLowerCase()] || normalizeEnvironment(match[1])) : null;
}

function collectNestedValues(payload, values = []) {
  if (payload == null) {
    return values;
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      collectNestedValues(item, values);
    }
    return values;
  }

  if (typeof payload === 'object') {
    for (const value of Object.values(payload)) {
      collectNestedValues(value, values);
    }
    return values;
  }

  values.push(payload);
  return values;
}

function buildUnresolvedDeployResult(workflow, params, input, context, skillSettings = {}) {
  const target = buildWorkflowTargetLabel(params) || buildDeployTargetLabel(context) || 'deployment';
  return createSkillError('auto-flow', `Unable to resolve deployment target for ${target}. Specify an exact environment or pipelineId.`, {
    input,
    kind: 'not-resolved',
    retryable: true,
    data: {
      action: 'deploy',
      provider: workflow.provider,
      binding: workflow.binding,
      status: 'not_resolved',
      mcpServer: getWorkflowMcpServer(workflow),
      target,
      environment: params.environment || null,
      skillConfig: skillSettings,
      resolution: {
        source: 'not-resolved',
        serviceNames: params.serviceNames || [],
        environment: params.environment || null
      }
    },
    retryHints: [
      'Specify an exact pipelineId if you already know the deployment target.',
      'Or provide a precise environment and service name so FlowMind can resolve the pipeline automatically.'
    ]
  });
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function getWorkflowMcpServer(workflow) {
  return workflow.client?.mcpServer || workflow.binding?.mcpServer || workflow.provider;
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}
