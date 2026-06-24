/**
 * FlowMind Log Service Adapter Interface
 * Abstract interface for cloud log service providers (SLS, ELK, etc.)
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class LogServiceAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.LOG_SERVICE;
  }

  /**
   * Get available log store endpoints.
   * @returns {object} Map of environment to endpoint
   */
  getEndpoints() {
    return this.config.endpoints || {};
  }

  /**
   * Query logs with parameters.
   * Subclasses must implement the actual MCP tool call.
   * @param {object} params - { project, logstore, query, from, to, line }
   * @returns {Promise<object>}
   */
  async queryLogs(params) {
    throw new Error('Subclasses must implement queryLogs()');
  }

  /**
   * List available projects.
   * @returns {Promise<object>}
   */
  async listProjects() {
    throw new Error('Subclasses must implement listProjects()');
  }
}

module.exports = LogServiceAdapter;
