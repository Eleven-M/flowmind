const crypto = require('crypto');
const { isErrorResultPayload } = require('./result-contract');
const {
  canonicalSteps,
  createApprovalToken,
  previewWorkflow,
  normalizeWorkflowSteps,
  validateWorkflowDag
} = require('./dry-run');

const WORKFLOW_EXECUTION_AUTHORITY = Symbol('workflow-execution-authority');
const DEFAULT_MAX_CONCURRENT = 4;

function isWorkflowExecutionAuthorized(context = {}) {
  return context[WORKFLOW_EXECUTION_AUTHORITY] === true;
}

function buildExecutionId() {
  return `workflow-${crypto.randomUUID()}`;
}

function resolveMaxConcurrent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_MAX_CONCURRENT;
  }
  return Math.min(32, Math.floor(parsed));
}

function appendEvent(events, event) {
  events.push({ at: new Date().toISOString(), ...event });
  return events;
}

async function persistWorkflowHistory(historyStore, executionId, record, patch = null) {
  if (!historyStore) return null;
  if (patch) {
    return historyStore.update(executionId, patch).catch(() => null);
  }
  return historyStore.append(record).catch(() => null);
}

function isDependencySatisfied(nodeStatus, continueOnError) {
  if (nodeStatus === 'succeeded') return true;
  // With continueOnError a failed step is treated as satisfied so its
  // dependents still run, matching the legacy "keep going" semantics.
  return continueOnError === true && nodeStatus === 'failed';
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

  const steps = normalizeWorkflowSteps(preview.steps);
  validateWorkflowDag(steps);
  const maxConcurrent = resolveMaxConcurrent(options.maxConcurrent);
  const continueOnError = options.continueOnError === true;
  const startIndex = Number.isFinite(options.startIndex) ? Math.max(0, Math.floor(options.startIndex)) : 0;

  // Seed state for resume: node-level seeding via previousResults entries
  // carrying { id, status: 'succeeded' }, plus legacy index-based seeding.
  const seedResults = Array.isArray(options.previousResults) ? options.previousResults : [];
  const seedById = new Map();
  for (const entry of seedResults) {
    if (entry && entry.id && entry.status === 'succeeded') {
      seedById.set(String(entry.id), entry);
    }
  }

  const state = new Map();
  for (const step of steps) {
    const seededById = seedById.get(step.id);
    const seededByIndex = startIndex > 0 && step.order <= startIndex ? seedResults[step.order - 1] : null;
    const seeded = seededById || seededByIndex;
    state.set(step.id, {
      id: step.id,
      order: step.order,
      skill: step.skill,
      status: seeded ? 'succeeded' : 'pending',
      result: seeded ? seeded.result : undefined,
      error: null
    });
  }

  const historyStore = options.historyStore || null;
  const events = [];

  const snapshotResults = () =>
    steps
      .map((step) => ({ ...state.get(step.id) }))
      .filter((entry) => entry.status !== 'pending');
  const snapshotStepStatus = () =>
    Object.fromEntries(steps.map((step) => [step.id, state.get(step.id).status]));

  // Serialize history writes through a local chain so parallel step
  // completions cannot interleave read-modify-write cycles and lose events.
  let persistChain = Promise.resolve();
  const queuePersist = () => {
    if (!historyStore) return;
    const snapshot = {
      status: 'running',
      stepStatus: snapshotStepStatus(),
      results: snapshotResults(),
      events: [...events]
    };
    persistChain = persistChain.then(() =>
      persistWorkflowHistory(historyStore, executionId, null, snapshot)
    );
  };

  await persistWorkflowHistory(historyStore, executionId, {
    executionId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    mode: 'execute',
    status: 'running',
    chain,
    preview: { ...preview, approvalToken: undefined },
    maxConcurrent,
    continueOnError,
    startIndex,
    stepStatus: snapshotStepStatus(),
    events: [...events],
    results: snapshotResults()
  });

  const dependencyResults = (step) =>
    step.dependsOn.map((id) => state.get(id)?.result).filter((result) => result !== undefined);

  const settleStep = async (step) => {
    const node = state.get(step.id);
    node.status = 'running';
    appendEvent(events, { type: 'step-started', stepId: step.id, skill: step.skill });
    queuePersist();

    const skill = flowmind.skills.get(step.skill);
    if (!skill) {
      node.status = 'failed';
      node.error = 'skill-not-found';
      appendEvent(events, { type: 'step-failed', stepId: step.id, skill: step.skill, error: node.error });
      queuePersist();
      return;
    }

    try {
      const result = await flowmind.executeWithLearning(skill, step.suggestedInput, {
        ...(options.context || {}),
        executionMode: 'execute',
        workflowExecution: true,
        previousResults: dependencyResults(step),
        [WORKFLOW_EXECUTION_AUTHORITY]: true
      });
      const failed = isErrorResultPayload(result);
      node.status = failed ? 'failed' : 'succeeded';
      node.result = result;
      node.error = failed ? 'skill-reported-error' : null;
    } catch (error) {
      node.status = 'failed';
      node.error = error.message;
    }

    appendEvent(events, {
      type: node.status === 'succeeded' ? 'step-succeeded' : 'step-failed',
      stepId: step.id,
      skill: step.skill,
      error: node.error
    });
    queuePersist();
  };

  // Cascade blocked state to pending steps whose dependencies failed or
  // were blocked. Independent branches keep running (failure isolation).
  const cascadeBlocked = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const step of steps) {
        const node = state.get(step.id);
        if (node.status !== 'pending') continue;
        const broken = step.dependsOn.some((dep) => {
          const depStatus = state.get(dep)?.status;
          return depStatus === 'failed' || depStatus === 'blocked';
        });
        if (broken) {
          node.status = 'blocked';
          node.error = 'upstream-failed';
          appendEvent(events, { type: 'step-blocked', stepId: step.id, skill: step.skill });
          changed = true;
        }
      }
    }
  };

  const readySteps = () =>
    steps.filter((step) => {
      const node = state.get(step.id);
      if (node.status !== 'pending') return false;
      return step.dependsOn.every((dep) =>
        isDependencySatisfied(state.get(dep)?.status, continueOnError)
      );
    });

  const running = new Set();
  let notifyStepSettled = null;
  const stepSettled = () => {
    if (notifyStepSettled) {
      const notify = notifyStepSettled;
      notifyStepSettled = null;
      notify();
    }
  };

  // DAG scheduler with a bounded concurrency pool.
  while (true) {
    if (!continueOnError) {
      cascadeBlocked();
    }
    for (const step of readySteps()) {
      if (running.size >= maxConcurrent) break;
      running.add(step.id);
      settleStep(step)
        .catch(() => {})
        .finally(() => {
          running.delete(step.id);
          stepSettled();
        });
    }
    if (running.size === 0) break;
    await new Promise((resolve) => {
      notifyStepSettled = resolve;
    });
  }

  // Safety sweep: anything still pending is unschedulable.
  for (const step of steps) {
    const node = state.get(step.id);
    if (node.status === 'pending' || node.status === 'running') {
      node.status = 'blocked';
      node.error = node.error || 'unschedulable';
      appendEvent(events, { type: 'step-blocked', stepId: step.id, skill: step.skill });
    }
  }

  const succeeded = steps.filter((step) => state.get(step.id).status === 'succeeded').length;
  const failed = steps.filter((step) => state.get(step.id).status === 'failed').length;
  const blocked = steps.filter((step) => state.get(step.id).status === 'blocked').length;
  const attempted = succeeded + failed;
  const firstUnfinished = steps.findIndex((step) => {
    const nodeStatus = state.get(step.id).status;
    return nodeStatus === 'failed' || nodeStatus === 'blocked';
  });
  const nextStepIndex = firstUnfinished >= 0 ? firstUnfinished : steps.length;
  const status = failed === 0 ? 'succeeded' : attempted === steps.length ? 'failed' : 'partial';
  const resumable = failed > 0 || blocked > 0;
  const finalResults = snapshotResults();

  await persistChain;
  await persistWorkflowHistory(historyStore, executionId, null, {
    status,
    resumable,
    nextStepIndex,
    stepStatus: snapshotStepStatus(),
    events: [...events],
    completedAt: new Date().toISOString(),
    summary: { total: steps.length, attempted, succeeded, failed, blocked },
    results: finalResults
  });

  return {
    executionId,
    mode: 'execute',
    status,
    resumable,
    nextStepIndex,
    maxConcurrent,
    summary: { total: steps.length, attempted, succeeded, failed, blocked },
    stepStatus: snapshotStepStatus(),
    results: finalResults
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

  // Node-level resume for records produced by the DAG executor (results
  // entries carry step ids); legacy index-based resume otherwise.
  const nodeResumable = Array.isArray(record.results) && record.results.some((entry) => entry?.id);

  return executeWorkflow(record.chain, {
    ...options,
    dryRun: false,
    executionId: record.executionId,
    approvalToken: options.approvalToken,
    previousResults: Array.isArray(record.results)
      ? nodeResumable
        ? record.results
        : record.results.slice(0, nextStepIndex)
      : [],
    startIndex: nodeResumable ? 0 : nextStepIndex
  });
}

module.exports = {
  executeWorkflow,
  isWorkflowExecutionAuthorized,
  resumeWorkflow,
  DEFAULT_MAX_CONCURRENT
};
