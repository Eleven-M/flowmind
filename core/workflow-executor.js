const { isErrorResultPayload } = require('./result-contract');
const { canonicalSteps, createApprovalToken, previewWorkflow } = require('./dry-run');

async function executeWorkflow(chain, options = {}) {
  const preview = previewWorkflow(chain);
  if (options.dryRun !== false) return preview;
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

  const results = [];
  for (const step of preview.steps) {
    const skill = flowmind.skills.get(step.skill);
    if (!skill) {
      results.push({ order: step.order, skill: step.skill, status: 'failed', error: 'skill-not-found' });
      if (!options.continueOnError) break;
      continue;
    }

    try {
      const result = await flowmind.executeWithLearning(skill, step.suggestedInput, {
        ...(options.context || {}),
        executionMode: 'execute',
        workflowExecution: true
      });
      const failed = isErrorResultPayload(result);
      results.push({ order: step.order, skill: step.skill, status: failed ? 'failed' : 'succeeded', result });
      if (failed && !options.continueOnError) break;
    } catch (error) {
      results.push({ order: step.order, skill: step.skill, status: 'failed', error: error.message });
      if (!options.continueOnError) break;
    }
  }

  const succeeded = results.filter((step) => step.status === 'succeeded').length;
  const failed = results.filter((step) => step.status === 'failed').length;
  return {
    mode: 'execute',
    status: failed > 0 ? 'failed' : results.length === preview.steps.length ? 'succeeded' : 'partial',
    summary: { total: preview.steps.length, attempted: results.length, succeeded, failed },
    results
  };
}

module.exports = { executeWorkflow };
