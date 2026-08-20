const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class ServiceGovernanceAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.SERVICE_GOVERNANCE;
  }

  async listServices(_params) {
    throw new Error('Subclasses must implement listServices()');
  }
  async listInstances(_params) {
    throw new Error('Subclasses must implement listInstances()');
  }
  async getTopology(_params) {
    throw new Error('Subclasses must implement getTopology()');
  }
  async getHealth(_params) {
    throw new Error('Subclasses must implement getHealth()');
  }
  async listPolicies(_params) {
    throw new Error('Subclasses must implement listPolicies()');
  }
  async previewPolicy(_params) {
    throw new Error('Subclasses must implement previewPolicy()');
  }
  async createPolicy(_params) {
    throw new Error('Subclasses must implement createPolicy()');
  }
  async updatePolicy(_params) {
    throw new Error('Subclasses must implement updatePolicy()');
  }
}

module.exports = ServiceGovernanceAdapter;
