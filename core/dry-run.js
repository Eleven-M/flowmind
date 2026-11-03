const crypto = require('crypto');
const { EXECUTABLE_FOLLOW_UP_SKILLS } = require('./automation-chain');

function normalizeDependencyList(step) {
  const raw = step?.dependsOn !== undefined ? step.dependsOn : step?.depends_on;
  if (Array.isArray(raw)) {
    return raw.map((dep) => String(dep)).filter(Boolean);
  }
  return null;
}

/**
 * Normalize workflow steps into a canonical DAG representation.
 *
 * - Every step gets a stable `id` (explicit id/stepId or `step-<order>`).
 * - `dependsOn` accepts `dependsOn` or `depends_on`.
 * - Steps without explicit dependencies fall back to the previous step
 *   (serial chain), which preserves legacy linear behavior exactly.
 */
function normalizeWorkflowSteps(steps = []) {
  const normalized = [];
  let previousId = null;
  steps.forEach((step, index) => {
    const id = String(step?.id || step?.stepId || `step-${index + 1}`);
    const explicitDeps = normalizeDependencyList(step);
    normalized.push({
      ...step,
      id,
      order: index + 1,
      dependsOn: explicitDeps === null ? (previousId ? [previousId] : []) : explicitDeps
    });
    previousId = id;
  });
  return normalized;
}

/**
 * Validate the DAG (duplicate ids, unknown deps, cycles) and return its
 * topological levels. Levels with more than one id are parallel groups.
 */
function validateWorkflowDag(steps = []) {
  const seen = new Set();
  for (const step of steps) {
    if (seen.has(step.id)) {
      const error = new Error(`Workflow contains duplicate step id "${step.id}".`);
      error.code = 'DUPLICATE_STEP_ID';
      throw error;
    }
    seen.add(step.id);
  }

  const ids = new Set(steps.map((step) => step.id));
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) {
        const error = new Error(`Workflow step "${step.id}" depends on unknown step "${dep}".`);
        error.code = 'UNKNOWN_DEPENDENCY';
        throw error;
      }
    }
  }

  const indegree = new Map(steps.map((step) => [step.id, 0]));
  const dependents = new Map(steps.map((step) => [step.id, []]));
  for (const step of steps) {
    for (const dep of step.dependsOn) {
      indegree.set(step.id, indegree.get(step.id) + 1);
      dependents.get(dep).push(step.id);
    }
  }

  const levels = [];
  let frontier = steps.filter((step) => indegree.get(step.id) === 0).map((step) => step.id);
  let visited = 0;
  while (frontier.length > 0) {
    levels.push([...frontier]);
    visited += frontier.length;
    const next = [];
    for (const id of frontier) {
      for (const childId of dependents.get(id)) {
        indegree.set(childId, indegree.get(childId) - 1);
        if (indegree.get(childId) === 0) {
          next.push(childId);
        }
      }
    }
    frontier = next;
  }

  if (visited !== steps.length) {
    const error = new Error('Workflow contains a dependency cycle. Remove the cycle before execution.');
    error.code = 'CYCLE_DETECTED';
    throw error;
  }
  return levels;
}

function canonicalSteps(chain = {}) {
  if (!Array.isArray(chain.steps)) {
    return [];
  }
  return normalizeWorkflowSteps(chain.steps).map((step) => ({
    id: step.id,
    order: step.order,
    skill: String(step.skill || ''),
    suggestedInput: String(step.suggestedInput || ''),
    recommended: step.recommended !== false,
    dependsOn: [...step.dependsOn]
  }));
}

function createApprovalToken(steps) {
  return crypto.createHash('sha256').update(JSON.stringify(steps)).digest('hex').slice(0, 24);
}

function previewWorkflow(chain = {}) {
  const steps = canonicalSteps(chain);
  const findings = steps.map((step) => {
    const reasons = [];
    if (!EXECUTABLE_FOLLOW_UP_SKILLS.has(step.skill)) reasons.push('skill-not-allowlisted');
    if (!step.suggestedInput.trim()) reasons.push('missing-suggested-input');
    if (!step.recommended) reasons.push('not-recommended');
    return {
      ...step,
      executable: reasons.length === 0,
      reasons
    };
  });
  const executable = findings.length > 0 && findings.every((step) => step.executable);

  let dag = { valid: true, levels: [], parallelGroups: 0, maxConcurrency: 0 };
  try {
    const levels = validateWorkflowDag(steps);
    dag = {
      valid: true,
      levels,
      parallelGroups: levels.filter((level) => level.length > 1).length,
      maxConcurrency: levels.reduce((max, level) => Math.max(max, level.length), 0)
    };
  } catch (error) {
    dag = { valid: false, error: error.message, code: error.code };
  }

  return {
    mode: 'dry-run',
    executable,
    requiresApproval: true,
    approvalToken: executable ? createApprovalToken(steps) : null,
    dag,
    summary: {
      total: findings.length,
      executable: findings.filter((step) => step.executable).length,
      blocked: findings.filter((step) => !step.executable).length
    },
    steps: findings
  };
}

module.exports = {
  canonicalSteps,
  createApprovalToken,
  previewWorkflow,
  normalizeWorkflowSteps,
  validateWorkflowDag
};
