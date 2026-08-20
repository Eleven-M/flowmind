const ServiceGovernanceAdapter = require('../../adapters/service-governance-adapter');

const DEFAULT_TOOL_MAPS = Object.freeze({
  'aliyun-mse': {
    listServices: 'mse_list_services',
    listInstances: 'mse_list_service_instances',
    getTopology: 'mse_get_service_topology',
    getHealth: 'mse_get_service_health',
    listPolicies: 'mse_list_governance_policies',
    previewPolicy: 'mse_preview_governance_policy',
    createPolicy: 'mse_create_governance_policy',
    updatePolicy: 'mse_update_governance_policy'
  },
  'huawei-cse': {
    listServices: 'cse_list_services',
    listInstances: 'cse_list_service_instances',
    getTopology: 'cse_list_service_dependencies',
    getHealth: 'cse_get_service_health',
    listPolicies: 'cse_list_governance_policies',
    previewPolicy: 'cse_preview_governance_policy',
    createPolicy: 'cse_create_governance_policy',
    updatePolicy: 'cse_change_governance_policy'
  },
  'baidu-mse': {
    listServices: 'baidu_mse_list_services',
    listInstances: 'baidu_mse_list_service_instances',
    getTopology: 'baidu_csm_get_service_topology',
    getHealth: 'baidu_mse_get_service_health',
    listPolicies: 'baidu_csm_list_governance_policies',
    previewPolicy: 'baidu_csm_preview_governance_policy',
    createPolicy: 'baidu_csm_create_governance_policy',
    updatePolicy: 'baidu_csm_update_governance_policy'
  }
});

class McpServiceGovernanceAdapter extends ServiceGovernanceAdapter {
  constructor(providerName, config = {}) {
    super(providerName, config);
    this.serverName = config.mcpServer || providerName;
    const mappings = { ...(DEFAULT_TOOL_MAPS[providerName] || {}), ...(config.tools || {}) };
    for (const [localName, toolName] of Object.entries(mappings)) this.registerTool(localName, toolName);
  }

  get mcpServer() {
    return this.serverName;
  }
  async listServices(params = {}) {
    return this.callMcpTool('listServices', params);
  }
  async listInstances(params = {}) {
    return this.callMcpTool('listInstances', params);
  }
  async getTopology(params = {}) {
    return this.callMcpTool('getTopology', params);
  }
  async getHealth(params = {}) {
    return this.callMcpTool('getHealth', params);
  }
  async listPolicies(params = {}) {
    return this.callMcpTool('listPolicies', params);
  }
  async previewPolicy(params = {}) {
    return this.callMcpTool('previewPolicy', params);
  }
  async createPolicy(params = {}) {
    return this.callMcpTool('createPolicy', params);
  }
  async updatePolicy(params = {}) {
    return this.callMcpTool('updatePolicy', params);
  }
}

module.exports = { DEFAULT_TOOL_MAPS, McpServiceGovernanceAdapter };
