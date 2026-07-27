const { createSkillError, createSkillResult } = require('../../core/result-contract');
const {
  buildGovernanceContext,
  buildRollbackStrategy,
  parseGovernanceInput,
  resolveGovernanceAdapter,
  unwrapMcpPayload
} = require('../../core/service-governance');
const { isWorkflowExecutionAuthorized } = require('../../core/workflow-executor');

module.exports = {
  category: 'operations',
  componentDependencies: ['serviceGovernance'],
  capabilities: ['governance', 'workflow'],
  canHandle(input) {
    return /(创建|修改|更新|执行).*(治理策略|限流|熔断|路由|降级)|service governance.*(create|update|change)/i.test(
      input || ''
    );
  },
  async execute(input, context = {}) {
    const parsed = parseGovernanceInput(input);
    const adapter = resolveGovernanceAdapter(context, parsed.provider);
    if (!adapter)
      return createSkillError('service-governance-change', 'Service governance provider is not configured.', {
        input,
        kind: 'missing-component',
        retryable: true
      });
    if (!['create', 'update'].includes(parsed.action)) {
      return createSkillError('service-governance-change', 'Only create and update governance actions are supported.', {
        input,
        kind: 'invalid-input',
        retryable: true
      });
    }
    const params = buildGovernanceContext(parsed, context);
    const rollbackStrategy = buildRollbackStrategy(adapter.providerName, params);
    if (context.executionMode !== 'execute' || !isWorkflowExecutionAuthorized(context)) {
      const preview = await adapter.previewPolicy(params);
      return createSkillResult('service-governance-change', 'Governance policy change preview is ready for approval.', {
        input,
        data: {
          mode: 'dry-run',
          provider: adapter.providerName,
          action: parsed.action,
          scope: params,
          preview: unwrapMcpPayload(preview),
          rollbackStrategy,
          nextActions: [
            {
              skill: 'service-governance-change',
              reason: 'Execute the reviewed governance policy change',
              suggestedInput: input
            }
          ]
        }
      });
    }
    const execution =
      parsed.action === 'create' ? await adapter.createPolicy(params) : await adapter.updatePolicy(params);
    return createSkillResult('service-governance-change', `Governance policy ${parsed.action} completed.`, {
      input,
      data: {
        mode: 'execute',
        provider: adapter.providerName,
        action: parsed.action,
        scope: params,
        rollbackStrategy,
        execution: unwrapMcpPayload(execution)
      }
    });
  }
};
