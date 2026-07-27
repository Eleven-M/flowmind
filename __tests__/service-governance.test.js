const { McpServiceGovernanceAdapter } = require('../core/providers/governance/mcp-service-governance-adapter');
const { buildComponentConfig, buildResourceConfig, getMcpSkillCatalog } = require('../core/init-scaffold');
const { buildFollowUpChain } = require('../core/automation-chain');
const { previewWorkflow } = require('../core/dry-run');
const { executeWorkflow } = require('../core/workflow-executor');
const audit = require('../skills/service-governance-audit');
const diagnosis = require('../skills/service-governance-diagnosis');
const change = require('../skills/service-governance-change');

function registry(adapter) {
  return {
    getAdapter: (type) => (type === 'serviceGovernance' ? adapter : null),
    getAdapterByProvider: (type, provider) =>
      type === 'serviceGovernance' && provider === adapter.providerName ? adapter : null
  };
}

function governanceAdapter() {
  return {
    providerName: 'huawei-cse',
    listServices: jest.fn().mockResolvedValue({ services: [{ name: 'orders' }] }),
    listInstances: jest.fn().mockResolvedValue({ instances: [{ id: 'instance-1' }] }),
    listPolicies: jest.fn().mockResolvedValue({ policies: [{ id: 'policy-1', kind: 'rate-limit' }] }),
    getTopology: jest.fn().mockResolvedValue({ edges: [{ from: 'gateway', to: 'orders' }] }),
    getHealth: jest.fn().mockResolvedValue({ unhealthy: 1, status: 'degraded' }),
    previewPolicy: jest.fn().mockResolvedValue({ diff: { qps: [50, 100] } }),
    createPolicy: jest.fn().mockResolvedValue({ id: 'policy-2', status: 'created' }),
    updatePolicy: jest.fn().mockResolvedValue({ id: 'policy-1', status: 'updated' })
  };
}

describe('multi-cloud service governance', () => {
  test('provider adapter exposes default and configurable MCP tool mappings', () => {
    const adapter = new McpServiceGovernanceAdapter('huawei-cse', {
      mcpServer: 'custom-cse',
      tools: { listServices: 'custom_list_services' }
    });
    expect(adapter.mcpServer).toBe('custom-cse');
    expect(adapter.getToolMappings()).toEqual(
      expect.objectContaining({
        listServices: 'custom_list_services',
        updatePolicy: 'cse_change_governance_policy'
      })
    );
  });

  test('initializer builds service-governance resource and component config', () => {
    const details = {
      governance: {
        provider: 'huawei-cse',
        mcpServer: 'huawei-cse-mcp',
        config: { projectId: 'project-1', engineId: 'engine-1' }
      }
    };
    const resourceConfig = buildResourceConfig(['governance'], details);
    const componentConfig = buildComponentConfig(['governance'], details);
    expect(resourceConfig.resources.governance.provider).toBe('huawei-cse');
    expect(componentConfig.components.serviceGovernance).toEqual(
      expect.objectContaining({
        default: 'huawei-cse',
        providers: expect.objectContaining({
          'huawei-cse': expect.objectContaining({ mcpServer: 'huawei-cse-mcp' })
        })
      })
    );
    expect(getMcpSkillCatalog()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          skill: 'service-governance-audit',
          componentDependencies: ['serviceGovernance']
        })
      ])
    );
  });

  test('audit is read-only and reports unhealthy instances', async () => {
    const adapter = governanceAdapter();
    const result = await audit.execute('服务治理审计 provider=huawei-cse env=uat service=orders', {
      componentRegistry: registry(adapter)
    });
    expect(result.type).toBe('result');
    expect(result.data.mode).toBe('readonly');
    expect(result.data.services.total).toBe(1);
    expect(result.data.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'high', issue: expect.stringContaining('unhealthy') })
      ])
    );
    expect(adapter.createPolicy).not.toHaveBeenCalled();
    expect(adapter.updatePolicy).not.toHaveBeenCalled();
  });

  test('explicit provider and resource binding take priority over the active provider', async () => {
    const activeAdapter = { ...governanceAdapter(), providerName: 'aliyun-mse' };
    const huaweiAdapter = governanceAdapter();
    const baiduAdapter = { ...governanceAdapter(), providerName: 'baidu-mse' };
    const componentRegistry = {
      getAdapter: jest.fn(() => activeAdapter),
      getAdapterByProvider: jest.fn(
        (_type, provider) => ({ 'huawei-cse': huaweiAdapter, 'baidu-mse': baiduAdapter })[provider] || null
      )
    };

    const explicit = await audit.execute('服务治理审计 provider=huawei-cse env=uat service=orders', {
      componentRegistry,
      resourceBinding: { connection: { provider: 'baidu-mse' } }
    });
    expect(explicit.data.provider).toBe('huawei-cse');
    expect(componentRegistry.getAdapterByProvider).toHaveBeenCalledWith('serviceGovernance', 'huawei-cse');
    expect(componentRegistry.getAdapter).not.toHaveBeenCalled();

    const bound = await audit.execute('服务治理审计 env=uat service=orders', {
      componentRegistry,
      resourceBinding: { connection: { provider: 'baidu-mse' } }
    });
    expect(bound.data.provider).toBe('baidu-mse');
  });

  test('diagnosis correlates health, instances, topology, and policies', async () => {
    const result = await diagnosis.execute('服务治理故障诊断 service=orders', {
      componentRegistry: registry(governanceAdapter())
    });
    expect(result.data.diagnosis).toEqual(
      expect.objectContaining({
        risk: 'high',
        possibleCauses: expect.arrayContaining([expect.stringContaining('Unhealthy')])
      })
    );
    expect(result.data.evidence.topology.edges).toHaveLength(1);
  });

  test('change requires dry-run approval and executes through guarded workflow', async () => {
    const adapter = governanceAdapter();
    const input = '更新治理策略 provider=huawei-cse env=uat service=orders kind=rate-limit policy=`{"qps":100}`';
    const previewResult = await change.execute(input, { componentRegistry: registry(adapter) });
    expect(previewResult.data.mode).toBe('dry-run');
    expect(previewResult.data.rollbackStrategy).toEqual(
      expect.objectContaining({
        provider: 'huawei-cse',
        rollbackTool: 'cse_change_governance_policy'
      })
    );
    expect(adapter.updatePolicy).not.toHaveBeenCalled();

    const directAttempt = await change.execute(input, {
      componentRegistry: registry(adapter),
      executionMode: 'execute',
      workflowExecution: true
    });
    expect(directAttempt.data.mode).toBe('dry-run');
    expect(adapter.updatePolicy).not.toHaveBeenCalled();

    const chain = buildFollowUpChain(previewResult);
    const dryRun = previewWorkflow(chain);
    const skill = { name: 'service-governance-change', execute: change.execute };
    const flowmind = {
      skills: { get: () => skill },
      executeWithLearning: (_skill, workflowInput, context) =>
        change.execute(workflowInput, {
          ...context,
          componentRegistry: registry(adapter)
        })
    };
    const execution = await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: dryRun.approvalToken
    });
    expect(execution.status).toBe('succeeded');
    expect(adapter.updatePolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        service: 'orders',
        kind: 'rate-limit',
        policy: { qps: 100 }
      })
    );
    expect(execution.results[0].result.data.rollbackStrategy).toEqual(
      expect.objectContaining({
        provider: 'huawei-cse'
      })
    );
  });
});
