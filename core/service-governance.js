function parseGovernanceInput(input = '') {
  const text = String(input);
  const params = {};
  const aliases = {
    provider: ['provider', '云', '厂商'],
    service: ['service', '服务'],
    environment: ['env', 'environment', '环境'],
    region: ['region', '地域'],
    projectId: ['project', 'projectId', '项目'],
    engineId: ['engine', 'engineId', '引擎'],
    namespace: ['namespace', '命名空间'],
    kind: ['kind', '策略类型'],
    policyId: ['policyId', '策略ID'],
    policyName: ['policyName', '策略名称']
  };
  for (const [key, names] of Object.entries(aliases)) {
    const match = text.match(new RegExp(`(?:${names.join('|')})\\s*[:=]\\s*("[^"]+"|'[^']+'|\\S+)`, 'i'));
    if (match) params[key] = match[1].replace(/^['"]|['"]$/g, '');
  }
  const policyMatch = text.match(/(?:policy|策略)\s*[:=]\s*(`[^`]+`|'[^']+'|"[^"]+"|\{.*\})/i);
  if (policyMatch) params.policy = parsePolicy(policyMatch[1]);
  if (/更新|修改|update|change/i.test(text)) params.action = 'update';
  else if (/创建|新增|create/i.test(text)) params.action = 'create';
  else params.action = 'audit';
  return params;
}

function parsePolicy(value) {
  const normalized = String(value).replace(/^`|`$/g, '').replace(/^'|'$/g, '').replace(/^"|"$/g, '');
  try {
    return JSON.parse(normalized);
  } catch {
    return { value: normalized };
  }
}

function unwrapMcpPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  const text = Array.isArray(payload.content)
    ? payload.content.find((item) => typeof item?.text === 'string')?.text
    : null;
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      return { text };
    }
  }
  return payload.data && typeof payload.data === 'object' ? payload.data : payload;
}

function summarizeCollection(payload) {
  const data = unwrapMcpPayload(payload) || {};
  const candidates = [data.items, data.list, data.services, data.instances, data.policies, data.records, data.result];
  const items = candidates.find(Array.isArray) || [];
  return {
    total: Number.isFinite(data.total) ? data.total : items.length,
    items: items.slice(0, 20),
    status: data.status || (data.success === false ? 'error' : 'ok')
  };
}

function resolveGovernanceAdapter(context = {}, requestedProvider = null) {
  const provider =
    requestedProvider ||
    context.resourceBinding?.connection?.provider ||
    context.resourceBinding?.provider ||
    context.provider;
  if (provider) {
    return context.componentRegistry?.getAdapterByProvider?.('serviceGovernance', provider) || null;
  }
  return context.componentRegistry?.getAdapter('serviceGovernance') || null;
}

const ROLLBACK_STRATEGIES = Object.freeze({
  'aliyun-mse': {
    provider: 'aliyun-mse',
    strategy: 'reapply-previous-policy',
    description: 'Reapply the last known good policy through the MSE update tool after review.',
    previewTool: 'mse_preview_governance_policy',
    rollbackTool: 'mse_update_governance_policy'
  },
  'huawei-cse': {
    provider: 'huawei-cse',
    strategy: 'policy-replacement',
    description: 'Replace the active CSE policy with the reviewed previous policy snapshot.',
    previewTool: 'cse_preview_governance_policy',
    rollbackTool: 'cse_change_governance_policy'
  },
  'baidu-mse': {
    provider: 'baidu-mse',
    strategy: 'policy-replacement',
    description: 'Replace the active Baidu governance policy with the reviewed previous policy snapshot.',
    previewTool: 'baidu_csm_preview_governance_policy',
    rollbackTool: 'baidu_csm_update_governance_policy'
  }
});

function buildGovernanceContext(params = {}, context = {}) {
  const binding = context.resourceBinding?.connection || {};
  return Object.fromEntries(
    Object.entries({
      provider: params.provider || binding.provider,
      service: params.service || binding.service,
      environment: params.environment || binding.env || binding.environment,
      region: params.region || binding.region,
      projectId: params.projectId || binding.projectId || binding.project,
      engineId: params.engineId || binding.engineId,
      namespace: params.namespace || binding.namespace,
      kind: params.kind,
      policyId: params.policyId,
      policyName: params.policyName,
      policy: params.policy
    }).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function buildRollbackStrategy(providerName, params = {}) {
  const base = ROLLBACK_STRATEGIES[providerName];
  if (!base) return null;
  return {
    ...base,
    scope: Object.fromEntries(
      Object.entries({
        service: params.service,
        environment: params.environment,
        region: params.region,
        projectId: params.projectId,
        engineId: params.engineId,
        namespace: params.namespace,
        kind: params.kind,
        policyId: params.policyId,
        policyName: params.policyName
      }).filter(([, value]) => value !== undefined && value !== null && value !== '')
    )
  };
}

module.exports = {
  buildGovernanceContext,
  buildRollbackStrategy,
  parseGovernanceInput,
  resolveGovernanceAdapter,
  summarizeCollection,
  unwrapMcpPayload
};
