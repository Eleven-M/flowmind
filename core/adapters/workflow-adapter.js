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
  async listPipelineGroups(_params) {
    throw new Error('Subclasses must implement listPipelineGroups()');
  }

  /**
   * List pipelines.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listPipelines(_params) {
    throw new Error('Subclasses must implement listPipelines()');
  }

  /**
   * Query the current iterate metadata used by workflow lookup flows.
   * @returns {Promise<object>}
   */
  async getCurrentIterate() {
    throw new Error('Subclasses must implement getCurrentIterate()');
  }

  /**
   * List deploy checklist records that contain service-to-pipeline mappings.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listDeployChecklists(_params) {
    throw new Error('Subclasses must implement listDeployChecklists()');
  }

  /**
   * Query historical flow orders that can be used as a fallback pipeline source.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async orderList(_params) {
    throw new Error('Subclasses must implement orderList()');
  }

  /**
   * Start a pipeline run.
   * @param {string} pipelineId
   * @returns {Promise<object>}
   */
  async startPipelineRun(_pipelineId) {
    throw new Error('Subclasses must implement startPipelineRun()');
  }

  /**
   * Start a batch pipeline run.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async startBatchPipelineRun(_params) {
    throw new Error('Subclasses must implement startBatchPipelineRun()');
  }

  /**
   * Get pipeline run status.
   * @param {string} pipelineId
   * @param {string} runId
   * @returns {Promise<object>}
   */
  async getPipelineRun(_pipelineId, _runId) {
    throw new Error('Subclasses must implement getPipelineRun()');
  }

  /**
   * List pipeline runs.
   * @param {string} pipelineId
   * @param {object} params
   * @returns {Promise<object>}
   */
  async listPipelineRuns(_pipelineId, _params) {
    throw new Error('Subclasses must implement listPipelineRuns()');
  }
}

module.exports = WorkflowAdapter;
