const { WorkflowService, resolveChain } = require('../core/workflow-service');

describe('workflow service', () => {
  test('resolves a direct chain, nested followUpChain, or FlowMind result', () => {
    const chain = {
      mode: 'manual-review',
      steps: [{ skill: 'knowledge-ops', suggestedInput: '保存知识 path=README.md repo=team/docs' }]
    };

    expect(resolveChain(chain)).toBe(chain);
    expect(resolveChain({ followUpChain: chain })).toBe(chain);
    expect(resolveChain({ result: { followUpChain: chain } })).toBe(chain);
    expect(resolveChain({
      data: {
        nextActions: [{ skill: 'knowledge-ops', suggestedInput: '保存知识 path=README.md repo=team/docs' }]
      }
    })).toEqual(expect.objectContaining({ steps: [expect.objectContaining({ skill: 'knowledge-ops' })] }));
  });

  test('preview delegates to dry-run using resolved chains', () => {
    const previewWorkflow = jest.fn(() => ({ mode: 'dry-run', executable: true }));
    const service = new WorkflowService({ previewWorkflow });
    const chain = { steps: [{ skill: 'knowledge-ops', suggestedInput: 'save docs' }] };

    expect(service.preview({ followUpChain: chain })).toEqual({ mode: 'dry-run', executable: true });
    expect(previewWorkflow).toHaveBeenCalledWith(chain);
  });

  test('execute injects FlowMind runtime and history store', async () => {
    const flowmind = { runtime: true };
    const historyStore = { marker: 'history' };
    const executeWorkflow = jest.fn().mockResolvedValue({ status: 'succeeded' });
    const service = new WorkflowService({ flowmind, historyStore, executeWorkflow });
    const chain = { steps: [{ skill: 'knowledge-ops', suggestedInput: 'save docs' }] };

    const result = await service.execute(chain, { approvalToken: 'token' });

    expect(result.status).toBe('succeeded');
    expect(executeWorkflow).toHaveBeenCalledWith(
      chain,
      expect.objectContaining({
        flowmind,
        historyStore,
        approvalToken: 'token',
        dryRun: false
      })
    );
  });

  test('resume returns not_found instead of throwing when history is missing', async () => {
    const historyStore = { get: jest.fn().mockResolvedValue(null) };
    const service = new WorkflowService({ historyStore });

    await expect(service.resume('workflow-missing')).resolves.toEqual({
      executionId: 'workflow-missing',
      mode: 'execute',
      status: 'not_found',
      resumable: false,
      error: 'Workflow execution not found: workflow-missing'
    });
  });

  test('history delegates to configured history store', async () => {
    const workflows = [{ executionId: 'workflow-1' }];
    const historyStore = { list: jest.fn().mockResolvedValue(workflows) };
    const service = new WorkflowService({ historyStore });

    await expect(service.history({ status: 'failed' })).resolves.toBe(workflows);
    expect(historyStore.list).toHaveBeenCalledWith({ status: 'failed' });
  });
});
