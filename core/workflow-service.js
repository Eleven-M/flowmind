const { buildFollowUpChain } = require('./automation-chain');
const { previewWorkflow } = require('./dry-run');
const { executeWorkflow, resumeWorkflow } = require('./workflow-executor');
const { WorkflowHistoryStore } = require('./workflow-history');

function resolveChain(chainOrResult = {}) {
  if (Array.isArray(chainOrResult?.steps)) {
    return chainOrResult;
  }
  if (Array.isArray(chainOrResult?.followUpChain?.steps)) {
    return chainOrResult.followUpChain;
  }
  if (chainOrResult?.result) {
    return resolveChain(chainOrResult.result);
  }
  return buildFollowUpChain(chainOrResult || {});
}

class WorkflowService {
  constructor(options = {}) {
    this.flowmind = options.flowmind || null;
    this.historyStore = options.historyStore || new WorkflowHistoryStore(options.workflowHistoryOptions || {});
    this.previewWorkflow = options.previewWorkflow || previewWorkflow;
    this.executeWorkflow = options.executeWorkflow || executeWorkflow;
    this.resumeWorkflow = options.resumeWorkflow || resumeWorkflow;
  }

  setFlowMind(flowmind) {
    this.flowmind = flowmind;
    return this;
  }

  preview(chainOrResult = {}) {
    return this.previewWorkflow(resolveChain(chainOrResult));
  }

  async execute(chain, options = {}) {
    return this.executeWorkflow(chain, {
      ...options,
      flowmind: options.flowmind || this.flowmind,
      historyStore: options.historyStore || this.historyStore,
      dryRun: false
    });
  }

  async resume(executionId, options = {}) {
    const historyStore = options.historyStore || this.historyStore;
    const record = options.record || await historyStore.get(executionId);
    if (!record) {
      return {
        executionId,
        mode: 'execute',
        status: 'not_found',
        resumable: false,
        error: `Workflow execution not found: ${executionId}`
      };
    }

    return this.resumeWorkflow(record, {
      ...options,
      flowmind: options.flowmind || this.flowmind,
      historyStore
    });
  }

  async history(filters = {}) {
    return this.historyStore.list(filters);
  }
}

module.exports = {
  WorkflowService,
  resolveChain
};
