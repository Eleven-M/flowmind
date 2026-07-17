/**
 * Friday Workflow Adapter
 * Wraps the friday-auto-flow MCP server for workflow and pipeline management
 */

const WorkflowAdapter = require('../../adapters/workflow-adapter');

class FridayFlowAdapter extends WorkflowAdapter {
  constructor(config = {}) {
    super('friday-flow', config);

    // Register MCP tool mappings
    this.registerTool('listPipelineGroups', 'flowListPipelineGroups');
    this.registerTool('getPipelineGroup', 'flowGetPipelineGroup');
    this.registerTool('listPipelineGroupPipelines', 'flowListPipelineGroupPipelines');
    this.registerTool('listPipelines', 'flowListPipelines');
    this.registerTool('getPipeline', 'flowGetPipeline');
    this.registerTool('startPipelineRun', 'flowStartPipelineRun');
    this.registerTool('startBatchPipelineRun', 'flowStartBatchPipelineRun');
    this.registerTool('getPipelineRun', 'flowGetPipelineRun');
    this.registerTool('listPipelineRuns', 'flowListPipelineRuns');
    this.registerTool('stopPipelineRun', 'flowStopPipelineRun');
    this.registerTool('retryPipelineJobRun', 'flowRetryPipelineJobRun');
    this.registerTool('stopPipelineJobRun', 'flowStopPipelineJobRun');
    this.registerTool('skipPipelineJobRun', 'flowSkipPipelineJobRun');
    this.registerTool('logPipelineJobRun', 'flowLogPipelineJobRun');
    this.registerTool('passPipelineValidate', 'flowPassPipelineValidate');
    this.registerTool('refusePipelineValidate', 'flowRefusePipelineValidate');
    this.registerTool('listDeployChecklists', 'listDeployChecklists');

    // Order/task tools
    this.registerTool('orderList', 'orderList');
    this.registerTool('getOrderInfo', 'getOrderInfoByOrderId');
    this.registerTool('getProcessJson', 'getProcessJson');
    this.registerTool('demandPoolList', 'demandPoolList');
    this.registerTool('getAllTaskList', 'getAllTaskList');
    this.registerTool('getCurrentIterate', 'getCurrentIterate');
    this.registerTool('iterateList', 'iterateList');
  }

  get mcpServer() {
    return 'friday-auto-flow';
  }

  async listPipelineGroups(params) {
    return this.callMcpTool('listPipelineGroups', params || { perPage: '20', page: '1' });
  }

  async listPipelines(params) {
    return this.callMcpTool('listPipelines', params || {});
  }

  async getCurrentIterate() {
    return this.callMcpTool('getCurrentIterate', {});
  }

  async listDeployChecklists(params) {
    return this.callMcpTool('listDeployChecklists', params || {});
  }

  async orderList(params) {
    return this.callMcpTool('orderList', params || {});
  }

  async startPipelineRun(pipelineId) {
    return this.callMcpTool('startPipelineRun', { pipelineId });
  }

  async startBatchPipelineRun(params) {
    return this.callMcpTool('startBatchPipelineRun', params || {});
  }

  async getPipelineRun(pipelineId, runId) {
    return this.callMcpTool('getPipelineRun', { pipelineId, pipelineRunId: runId });
  }

  async listPipelineRuns(pipelineId, params) {
    return this.callMcpTool('listPipelineRuns', { pipelineId, ...(params || {}) });
  }
}

module.exports = FridayFlowAdapter;
