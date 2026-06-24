/**
 * FlowMind Report Adapter Interface
 * Abstract interface for automated reporting services
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class ReportAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.REPORT;
  }

  /**
   * List Jenkins builds.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listBuilds(params) {
    throw new Error('Subclasses must implement listBuilds()');
  }

  /**
   * Get build details.
   * @param {string} buildId
   * @returns {Promise<object>}
   */
  async getBuildInfo(buildId) {
    throw new Error('Subclasses must implement getBuildInfo()');
  }

  /**
   * List Jacoco coverage reports.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listJacocoReports(params) {
    throw new Error('Subclasses must implement listJacocoReports()');
  }

  /**
   * List unit test reports.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listUnitReports(params) {
    throw new Error('Subclasses must implement listUnitReports()');
  }

  /**
   * Get Jenkins job details.
   * @param {string} jobName
   * @returns {Promise<object>}
   */
  async getJobDetails(jobName) {
    throw new Error('Subclasses must implement getJobDetails()');
  }
}

module.exports = ReportAdapter;
