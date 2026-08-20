const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execa = require('execa');
const stripAnsi = require('strip-ansi');
const { getUpgradeStatus } = require('../core/upgrade-status');
const { runReleaseCheck } = require('../core/release-check');
const { buildKnowledgeDepositionCandidates } = require('../core/knowledge-deposition');
const { buildFollowUpChain } = require('../core/automation-chain');
const { previewWorkflow } = require('../core/dry-run');
const { executeWorkflow, resumeWorkflow } = require('../core/workflow-executor');
const { TaskStore } = require('../core/task-store');
const { WorkflowHistoryStore } = require('../core/workflow-history');
const { FlowMindMCPServer } = require('../mcp/server');

const execFileAsync = promisify(execFile);
const cliPath = path.join(__dirname, '..', 'bin', 'flowmind.js');

async function waitForTask(server, taskId, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await server.getTaskStatus({ taskId });
    const payload = JSON.parse(result.content[0].text);
    if (['succeeded', 'failed', 'cancelled'].includes(payload.task.status)) {
      return payload.task;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Task did not finish: ${taskId}`);
}

describe('upgrade direction tooling', () => {
  test('upgrade status reports requested upgrade directions', async () => {
    const status = await getUpgradeStatus({
      rootDir: path.join(__dirname, '..')
    });

    expect(status.summary.status).toBe('complete');
    expect(status.summary.percent).toBe(100);
    expect(status.directions.map((item) => item.id)).toEqual(['1', '2', '6', '7', '8']);
    expect(status.phases.local.status).toBe('complete');
    expect(status.phases.live.status).toBe('complete');
    expect(status.directions.find((item) => item.id === '1')).toEqual(
      expect.objectContaining({
        status: 'complete',
        checks: expect.arrayContaining([
          expect.objectContaining({ key: 'executableFollowUpChain', phase: 'live', passed: true })
        ])
      })
    );
    expect(status.directions.find((item) => item.id === '7').checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'dryRunPreview', phase: 'live', passed: true })])
    );
    expect(status.directions.find((item) => item.id === '2').checks).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'taskPersistence', passed: true })])
    );
  });

  test('release check validates current release maintenance files', async () => {
    const result = await runReleaseCheck({
      rootDir: path.join(__dirname, '..'),
      skipExternalPackageChecks: true
    });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'changelog-version', status: 'ok' }),
        expect.objectContaining({ key: 'release-notes', status: 'ok' })
      ])
    );
  });

  test('knowledge deposition candidates are generated from actionable results', () => {
    const candidates = buildKnowledgeDepositionCandidates({
      type: 'result',
      skill: 'change-impact-review',
      data: {
        risk: { level: 'medium' },
        regressionChecklist: ['Smoke test main flow']
      }
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        skill: 'knowledge-ops',
        sourceSkill: 'change-impact-review',
        suggestedInput: expect.stringContaining('runbook 模板')
      })
    ]);
  });

  test('follow-up chain is built from automation candidates and sync recommendations', () => {
    const chain = buildFollowUpChain({
      type: 'result',
      skill: 'change-impact-review',
      data: {
        automationCandidates: [
          {
            skill: 'data-risk-audit',
            reason: 'Database files changed',
            suggestedInput: '数据风险 sql: SELECT * FROM orders'
          }
        ],
        syncRecommendations: [
          {
            skill: 'yapi-sync-interface',
            reason: 'API files changed',
            suggestedInput: '同步 YApi path=.',
            recommended: true
          }
        ]
      }
    });

    expect(chain).toEqual(
      expect.objectContaining({
        mode: 'manual-review',
        executable: false,
        steps: [
          expect.objectContaining({ skill: 'data-risk-audit', source: 'automationCandidates' }),
          expect.objectContaining({ skill: 'yapi-sync-interface', source: 'syncRecommendations' })
        ]
      })
    );
  });

  test('allowlisted workflow requires dry-run token before execution', async () => {
    const chain = buildFollowUpChain({
      data: {
        nextActions: [{ skill: 'knowledge-ops', suggestedInput: '保存知识 path=README.md repo=team/docs' }]
      }
    });
    const preview = previewWorkflow(chain);
    const skill = { name: 'knowledge-ops' };
    const flowmind = {
      skills: { get: jest.fn(() => skill) },
      executeWithLearning: jest.fn().mockResolvedValue({ type: 'result', success: true, data: { action: 'save' } })
    };

    expect(preview).toEqual(expect.objectContaining({ executable: true, approvalToken: expect.any(String) }));
    await expect(executeWorkflow(chain, { flowmind, dryRun: false })).rejects.toMatchObject({
      code: 'APPROVAL_REQUIRED'
    });

    const execution = await executeWorkflow(chain, {
      flowmind,
      dryRun: false,
      approvalToken: preview.approvalToken
    });
    expect(execution.status).toBe('succeeded');
    expect(flowmind.executeWithLearning).toHaveBeenCalledWith(
      skill,
      '保存知识 path=README.md repo=team/docs',
      expect.objectContaining({ executionMode: 'execute', workflowExecution: true })
    );
  });

  test('workflow execution is recorded and can be resumed from the first failed step', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-workflow-history-${Date.now()}`);
    const historyStore = new WorkflowHistoryStore({ filePath: path.join(tempHome, 'workflows.json') });
    const chain = buildFollowUpChain({
      data: {
        nextActions: [
          { skill: 'knowledge-ops', suggestedInput: '保存知识 path=README.md repo=team/docs' },
          { skill: 'archive-change', suggestedInput: '归档变更 add-multicloud-service-governance' }
        ]
      }
    });
    const preview = previewWorkflow(chain);
    const failingFlowmind = {
      skills: {
        get: (name) =>
          ({
            'knowledge-ops': { name: 'knowledge-ops' },
            'archive-change': { name: 'archive-change' }
          })[name] || null
      },
      executeWithLearning: jest
        .fn()
        .mockResolvedValueOnce({ type: 'result', success: true, data: { ok: true } })
        .mockRejectedValueOnce(new Error('simulated resume point'))
    };

    const firstRun = await executeWorkflow(chain, {
      flowmind: failingFlowmind,
      dryRun: false,
      approvalToken: preview.approvalToken,
      historyStore
    });

    expect(firstRun).toEqual(
      expect.objectContaining({
        status: 'failed',
        resumable: true,
        nextStepIndex: 1
      })
    );

    const recorded = await historyStore.get(firstRun.executionId);
    expect(recorded).toEqual(
      expect.objectContaining({
        executionId: firstRun.executionId,
        status: 'failed',
        resumable: true,
        nextStepIndex: 1
      })
    );
    expect(recorded).not.toHaveProperty('approvalToken');
    expect(recorded.preview).not.toHaveProperty('approvalToken');
    const resumableHistory = await historyStore.list({ resumable: true, status: 'failed' });
    expect(resumableHistory).toEqual([expect.objectContaining({ executionId: firstRun.executionId })]);

    await expect(
      resumeWorkflow(recorded, {
        flowmind: failingFlowmind,
        historyStore
      })
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });

    await expect(
      resumeWorkflow(recorded, {
        flowmind: failingFlowmind,
        approvalToken: 'invalid-token',
        historyStore
      })
    ).rejects.toMatchObject({ code: 'APPROVAL_REQUIRED' });

    const resumedFlowmind = {
      skills: failingFlowmind.skills,
      executeWithLearning: jest.fn().mockResolvedValue({ type: 'result', success: true, data: { ok: true } })
    };

    const resumed = await resumeWorkflow(recorded, {
      flowmind: resumedFlowmind,
      approvalToken: preview.approvalToken,
      historyStore
    });

    expect(resumed).toEqual(
      expect.objectContaining({
        executionId: recorded.executionId,
        status: 'succeeded',
        resumable: false,
        nextStepIndex: 2
      })
    );
    expect(resumed.results).toHaveLength(2);

    const publicHistory = await historyStore.list();
    expect(JSON.stringify(publicHistory)).not.toContain('approvalToken');

    await fs.remove(tempHome);
  });

  test('task store persists serializable task state', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-task-store-${Date.now()}`);
    const filePath = path.join(tempHome, 'tasks.json');
    const store = new TaskStore({ filePath });
    const timer = setTimeout(() => {}, 1000);

    await store.save([
      {
        id: 'task-1',
        tool: 'flowmind_process',
        status: 'succeeded',
        createdAt: '2026-07-07T00:00:00.000Z',
        timer
      }
    ]);
    clearTimeout(timer);
    const loaded = await store.load();

    expect(loaded).toEqual([
      expect.objectContaining({
        id: 'task-1',
        status: 'succeeded'
      })
    ]);
    expect(loaded[0].timer).toBeUndefined();

    await fs.remove(tempHome);
  });

  test('MCP running task cancellation is terminal and ignores late results', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-mcp-cancel-${Date.now()}`);
    const server = new FlowMindMCPServer({
      taskStoreOptions: {
        filePath: path.join(tempHome, 'tasks.json')
      }
    });
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [],
        get: () => null
      }
    };
    server.callToolInternal = jest.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
        isError: false
      };
    });

    const startResult = await server.startAsyncTask({
      tool: 'flowmind_process',
      arguments: { input: 'demo' }
    });
    const taskId = JSON.parse(startResult.content[0].text).task.id;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const cancelResult = await server.cancelTask({ taskId });
    const cancelled = JSON.parse(cancelResult.content[0].text).task;

    expect(cancelled.status).toBe('cancelled');
    await new Promise((resolve) => setTimeout(resolve, 70));
    const finalStatus = JSON.parse((await server.getTaskStatus({ taskId })).content[0].text).task;
    expect(finalStatus.status).toBe('cancelled');

    await fs.remove(tempHome);
  });

  test('MCP task retries after a failed attempt', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-mcp-retry-${Date.now()}`);
    const server = new FlowMindMCPServer({
      taskStoreOptions: {
        filePath: path.join(tempHome, 'tasks.json')
      }
    });
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [],
        get: () => null
      }
    };
    let calls = 0;
    server.callToolInternal = jest.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'first failure' }) }],
          isError: true
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ type: 'result', data: { summary: { total: 1 } } }) }],
        isError: false
      };
    });

    const startResult = await server.startAsyncTask({
      tool: 'flowmind_process',
      arguments: { input: 'demo' },
      retries: 1
    });
    const taskId = JSON.parse(startResult.content[0].text).task.id;
    const finished = await waitForTask(server, taskId);

    expect(finished.status).toBe('succeeded');
    expect(finished.attempts).toBe(2);
    expect(JSON.parse(finished.result.content[0].text).data.knowledgeDepositionCandidates).toEqual(expect.any(Array));

    await fs.remove(tempHome);
  });

  test('CLI exposes upgrade-status and release-check JSON commands', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-upgrade-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const env = {
      ...process.env,
      FLOWMIND_HOME: tempHome
    };
    const upgrade = await execFileAsync('node', [cliPath, 'upgrade-status', '--json'], {
      cwd: path.join(__dirname, '..'),
      env
    });
    const release = await execFileAsync('node', [cliPath, 'release-check', '--json'], {
      cwd: path.join(__dirname, '..'),
      env
    });
    const workflowHistory = await execFileAsync('node', [cliPath, 'workflow-history'], {
      cwd: path.join(__dirname, '..'),
      env
    });
    const filteredWorkflowHistory = await execFileAsync(
      'node',
      [cliPath, 'workflow-history', '--status', 'failed', '--resumable'],
      {
        cwd: path.join(__dirname, '..'),
        env
      }
    );
    const help = await execFileAsync('node', [cliPath, '--help'], {
      cwd: path.join(__dirname, '..'),
      env
    });

    expect(JSON.parse(upgrade.stdout).directions.map((item) => item.id)).toEqual(['1', '2', '6', '7', '8']);
    expect(JSON.parse(release.stdout).ok).toBe(true);
    expect(JSON.parse(workflowHistory.stdout).workflows).toEqual([]);
    expect(JSON.parse(filteredWorkflowHistory.stdout).workflows).toEqual([]);
    expect(help.stdout).toContain('workflow-resume');
    expect(help.stdout).toContain('workflow-history');

    await fs.remove(tempHome);
  });

  test('CLI text output can be asserted with execa and strip-ansi', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-text-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const result = await execa('node', [cliPath, 'upgrade-status'], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        FLOWMIND_HOME: tempHome
      }
    });
    const output = stripAnsi(result.stdout);

    expect(output).toContain('FlowMind Upgrade Status');
    expect(output).toContain('1. Deep integration chaining');
    expect(output).toContain('8. Release maintenance');

    await fs.remove(tempHome);
  });
});
