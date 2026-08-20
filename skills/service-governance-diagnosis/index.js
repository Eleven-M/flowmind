const { createSkillError, createSkillResult } = require('../../core/result-contract');
const {
  buildGovernanceContext,
  parseGovernanceInput,
  resolveGovernanceAdapter,
  summarizeCollection,
  unwrapMcpPayload
} = require('../../core/service-governance');

module.exports = {
  category: 'operations',
  componentDependencies: ['serviceGovernance'],
  capabilities: ['governance', 'observability'],
  canHandle(input) {
    return /服务治理.*(诊断|排查|故障|异常)|微服务.*(雪崩|熔断|限流).*排查|service governance.*(diagnos|incident)/i.test(
      input || ''
    );
  },
  async execute(input, context = {}) {
    const parsed = parseGovernanceInput(input);
    const adapter = resolveGovernanceAdapter(context, parsed.provider);
    if (!adapter) {
      return createSkillError('service-governance-diagnosis', 'Service governance provider is not configured.', {
        input,
        kind: 'missing-component',
        retryable: true
      });
    }
    const params = buildGovernanceContext(parsed, context);
    const [health, topology, policies, instances] = await Promise.all([
      adapter.getHealth(params),
      adapter.getTopology(params),
      adapter.listPolicies(params),
      adapter.listInstances(params)
    ]);
    const evidence = {
      health: unwrapMcpPayload(health),
      topology: unwrapMcpPayload(topology),
      policies: summarizeCollection(policies),
      instances: summarizeCollection(instances)
    };
    const diagnosis = diagnose(evidence);
    return createSkillResult('service-governance-diagnosis', `Governance diagnosis completed: ${diagnosis.risk}`, {
      input,
      data: { mode: 'readonly', provider: adapter.providerName, scope: params, evidence, diagnosis }
    });
  }
};

function diagnose(evidence) {
  const unhealthy = Number(evidence.health?.unhealthy || evidence.health?.unhealthyCount || 0);
  const causes = [];
  if (unhealthy > 0) causes.push('Unhealthy service instances are present');
  if (evidence.policies.total === 0) causes.push('No active governance policy evidence was returned');
  if (evidence.instances.total === 0) causes.push('Service discovery returned no instances');
  return {
    risk: unhealthy > 0 ? 'high' : causes.length > 0 ? 'medium' : 'low',
    possibleCauses: causes,
    recommendations:
      unhealthy > 0
        ? ['Inspect unhealthy instances and upstream dependencies before changing traffic policy']
        : ['Keep monitoring current governance and health signals']
  };
}
