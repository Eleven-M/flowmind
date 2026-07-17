const crypto = require('crypto');
const { EXECUTABLE_FOLLOW_UP_SKILLS } = require('./automation-chain');

function canonicalSteps(chain = {}) {
  return Array.isArray(chain.steps)
    ? chain.steps.map((step, index) => ({
        order: index + 1,
        skill: String(step?.skill || ''),
        suggestedInput: String(step?.suggestedInput || ''),
        recommended: step?.recommended !== false
      }))
    : [];
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

  return {
    mode: 'dry-run',
    executable,
    requiresApproval: true,
    approvalToken: executable ? createApprovalToken(steps) : null,
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
  previewWorkflow
};
