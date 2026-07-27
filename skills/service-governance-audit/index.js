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
  capabilities: ['governance', 'review'],
  canHandle(input) {
    return /服务治理.*(审计|检查|状态|健康)|治理策略.*(查询|审计)|service governance.*(audit|health|review)/i.test(
      input || ''
    );
  },
  async execute(input, context = {}) {
    const parsed = parseGovernanceInput(input);
    const adapter = resolveGovernanceAdapter(context, parsed.provider);
    if (!adapter) return missingAdapter(input);
    const params = buildGovernanceContext(parsed, context);
    const [services, instances, policies, topology, health] = await Promise.all([
      adapter.listServices(params),
      adapter.listInstances(params),
      adapter.listPolicies(params),
      adapter.getTopology(params),
      adapter.getHealth(params)
    ]);
    const normalizedHealth = unwrapMcpPayload(health) || {};
    const findings = buildFindings(normalizedHealth, summarizeCollection(instances), summarizeCollection(policies));
    return createSkillResult(
      'service-governance-audit',
      `Service governance audit completed with ${findings.length} finding(s)`,
      {
        input,
        data: {
          mode: 'readonly',
          provider: adapter.providerName,
          scope: params,
          services: summarizeCollection(services),
          instances: summarizeCollection(instances),
          policies: summarizeCollection(policies),
          topology: unwrapMcpPayload(topology),
          health: normalizedHealth,
          findings
        }
      }
    );
  }
};

function buildFindings(health, instances, policies) {
  const findings = [];
  const unhealthy = Number(health.unhealthy || health.unhealthyCount || 0);
  if (unhealthy > 0) findings.push({ severity: 'high', issue: `${unhealthy} unhealthy service instance(s)` });
  if (instances.total === 0) findings.push({ severity: 'medium', issue: 'No service instances were returned' });
  if (policies.total === 0) findings.push({ severity: 'low', issue: 'No governance policies were returned' });
  return findings;
}

function missingAdapter(input) {
  return createSkillError('service-governance-audit', 'Service governance provider is not configured.', {
    input,
    kind: 'missing-component',
    retryable: true,
    bindingHint: {
      componentType: 'serviceGovernance',
      providers: ['aliyun-mse', 'huawei-cse', 'baidu-mse']
    }
  });
}
