/**
 * FlowMind Workflow Adapter Interface
 * Abstract interface for workflow/pipeline services
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class WorkflowAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.WORKFLOW;
  }

  /**
   * List pipeline groups.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listPipelineGroups(params) {
    throw new Error('Subclasses must implement listPipelineGroups()');
  }

  /**
   * List pipelines.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listPipelines(params) {
    throw new Error('Subclasses must implement listPipelines()');
  }

  /**
   * Start a pipeline run.
   * @param {string} pipelineId
   * @returns {Promise<object>}
   */
  async startPipelineRun(pipelineId) {
    throw new Error('Subclasses must implement startPipelineRun()');
  }

  /**
   * Get pipeline run status.
   * @param {string} pipelineId
   * @param {string} runId
   * @returns {Promise<object>}
   */
  async getPipelineRun(pipelineId, runId) {
    throw new Error('Subclasses must implement getPipelineRun()');
  }

  /**
   * List pipeline runs.
   * @param {string} pipelineId
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listPipelineRuns(pipelineId, params) {
    throw new Error('Subclasses must implement listPipelineRuns()');
  }
}

module.exports = WorkflowAdapter;
