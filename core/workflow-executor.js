const crypto = require('crypto');
const { isErrorResultPayload } = require('./result-contract');
const { canonicalSteps, createApprovalToken, previewWorkflow } = require('./dry-run');
const WORKFLOW_EXECUTION_AUTHORITY = Symbol('workflow-execution-authority');

function isWorkflowExecutionAuthorized(context = {}) {
  return context[WORKFLOW_EXECUTION_AUTHORITY] === true;
}

function buildExecutionId() {
  return `workflow-${crypto.randomUUID()}`;
}

function getFailedStepIndex(results = []) {
  const failed = results.find((step) => step.status === 'failed');
  return failed ? Math.max(0, Number(failed.order || 1) - 1) : null;
}

async function persistWorkflowHistory(historyStore, executionId, record, patch = null) {
  if (!historyStore) return null;
  if (patch) {
    return historyStore.update(executionId, patch).catch(() => null);
  }
  return historyStore.append(record).catch(() => null);
}

async function executeWorkflow(chain, options = {}) {
  const preview = previewWorkflow(chain);
  const executionId = options.executionId || buildExecutionId();
  if (options.dryRun !== false) {
    return {
      ...preview,
      executionId
    };
  }
  if (!preview.executable)
    throw new Error('Workflow contains blocked or incomplete steps. Run dry-run and fix them first.');
  if (!options.approvalToken || options.approvalToken !== createApprovalToken(canonicalSteps(chain))) {
    const error = new Error('Approval token is missing or does not match the reviewed workflow.');
    error.code = 'APPROVAL_REQUIRED';
    throw error;
  }

  const flowmind = options.flowmind;
  if (!flowmind?.skills?.get || typeof flowmind.executeWithLearning !== 'function') {
    throw new Error('An initialized FlowMind runtime is required to execute a workflow.');
  }

  const startIndex = Number.isFinite(options.startIndex) ? Math.max(0, options.startIndex) : 0;
  const initialResults = Array.isArray(options.previousResults) ? [...options.previousResults] : [];
  const historyStore = options.historyStore || null;
  const results = [...initialResults];

  await persistWorkflowHistory(historyStore, executionId, {
    executionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: 'execute',
    status: 'running',
    chain,
    preview: { ...preview, approvalToken: undefined },
    startIndex,
    nextStepIndex: startIndex,
    results
  });

  for (const step of preview.steps.slice(startIndex)) {
    const actualIndex = step.order - 1;
    const skill = flowmind.skills.get(step.skill);
    if (!skill) {
      results.push({ order: step.order, skill: step.skill, status: 'failed', error: 'skill-not-found' });
      await persistWorkflowHistory(historyStore, executionId, null, {
        status: 'failed',
        nextStepIndex: actualIndex,
        results,
        completedAt: new Date().toISOString(),
        error: 'skill-not-found'
      });
      if (!options.continueOnError) break;
      continue;
    }

    try {
      const result = await flowmind.executeWithLearning(skill, step.suggestedInput, {
        ...(options.context || {}),
        executionMode: 'execute',
        workflowExecution: true,
        [WORKFLOW_EXECUTION_AUTHORITY]: true
      });
      const failed = isErrorResultPayload(result);
      results.push({ order: step.order, skill: step.skill, status: failed ? 'failed' : 'succeeded', result });
      await persistWorkflowHistory(historyStore, executionId, null, {
        status: failed && !options.continueOnError ? 'failed' : 'running',
        nextStepIndex: failed ? actualIndex : actualIndex + 1,
        results
      });
      if (failed && !options.continueOnError) break;
    } catch (error) {
      results.push({ order: step.order, skill: step.skill, status: 'failed', error: error.message });
      await persistWorkflowHistory(historyStore, executionId, null, {
        status: 'failed',
        nextStepIndex: actualIndex,
        results,
        error: error.message
      });
      if (!options.continueOnError) break;
    }
  }

  const succeeded = results.filter((step) => step.status === 'succeeded').length;
  const failed = results.filter((step) => step.status === 'failed').length;
  const nextStepIndex = failed > 0 ? (getFailedStepIndex(results) ?? results.length) : preview.steps.length;
  const status = failed > 0 ? (results.length === preview.steps.length ? 'failed' : 'partial') : 'succeeded';
  const resumable = failed > 0 && nextStepIndex < preview.steps.length;

  await persistWorkflowHistory(historyStore, executionId, null, {
    status,
    resumable,
    nextStepIndex,
    completedAt: new Date().toISOString(),
    summary: { total: preview.steps.length, attempted: results.length, succeeded, failed },
    results
  });

  return {
    executionId,
    mode: 'execute',
    status,
    resumable,
    nextStepIndex,
    summary: { total: preview.steps.length, attempted: results.length, succeeded, failed },
    results
  };
}

async function resumeWorkflow(record, options = {}) {
  if (!record || typeof record !== 'object') {
    throw new Error('A recorded workflow execution is required to resume.');
  }
  if (!Array.isArray(record.chain?.steps) || record.chain.steps.length === 0) {
    throw new Error('The recorded workflow does not contain resumable steps.');
  }
  if (!options.approvalToken) {
    const error = new Error('An approval token is required to resume a recorded workflow.');
    error.code = 'APPROVAL_REQUIRED';
    throw error;
  }
  const nextStepIndex = Number.isFinite(record.nextStepIndex) ? Math.max(0, record.nextStepIndex) : 0;
  if (nextStepIndex >= record.chain.steps.length) {
    return {
      executionId: record.executionId,
      mode: 'execute',
      status: 'succeeded',
      resumable: false,
      nextStepIndex,
      summary: record.summary || {
        total: record.chain.steps.length,
        attempted: record.results?.length || 0,
        succeeded: record.summary?.succeeded || 0,
        failed: record.summary?.failed || 0
      },
      results: record.results || []
    };
  }

  return executeWorkflow(record.chain, {
    ...options,
    dryRun: false,
    executionId: record.executionId,
    approvalToken: options.approvalToken,
    previousResults: Array.isArray(record.results) ? record.results.slice(0, nextStepIndex) : [],
    startIndex: nextStepIndex
  });
}

module.exports = { executeWorkflow, isWorkflowExecutionAuthorized, resumeWorkflow };
