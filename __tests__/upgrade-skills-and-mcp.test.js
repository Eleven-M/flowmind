const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const changeImpactReview = require('../skills/change-impact-review');
const dataRiskAudit = require('../skills/data-risk-audit');
const reportInsights = require('../skills/report-insights');
const buildReport = require('../skills/build-report');
const testReport = require('../skills/test-report');
const coverageReport = require('../skills/coverage-report');
const knowledgeOps = require('../skills/knowledge-ops');
const autoFlow = require('../skills/auto-flow');
const logAudit = require('../skills/log-audit');
const yapiSyncInterface = require('../skills/yapi-sync-interface');
const yuqueSyncDesign = require('../skills/yuque-sync-design');
const dataValidation = require('../skills/data-validation');
const dataLogicValidation = require('../skills/data-logic-validation');
const codeReview = require('../skills/code-review');
const { FlowMindMCPServer } = require('../mcp/server');

async function waitForTask(server, taskId, options = {}) {
  const attempts = options.attempts || 30;
  const intervalMs = options.intervalMs || 10;

  for (let index = 0; index < attempts; index += 1) {
    const result = await server.callTool('flowmind_task_status', { taskId });
    const payload = JSON.parse(result.content[0].text);
    if (['succeeded', 'failed', 'cancelled'].includes(payload.task.status)) {
      return payload.task;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Task did not complete in time: ${taskId}`);
}

describe('upgrade skills and MCP capability catalog', () => {
  test('change-impact-review classifies changed files and elevates risky areas', async () => {
    const tempRepo = path.join(os.tmpdir(), `flowmind-impact-${Date.now()}`);
    await fs.ensureDir(path.join(tempRepo, 'src', 'controller'));
    await fs.ensureDir(path.join(tempRepo, 'src', 'repository'));
    await fs.ensureDir(path.join(tempRepo, 'docs'));
    await fs.writeFile(path.join(tempRepo, 'src', 'controller', 'OrderController.java'), 'class OrderController {}');
    await fs.writeFile(path.join(tempRepo, 'src', 'repository', 'OrderRepository.java'), 'class OrderRepository {}');
    await fs.writeFile(path.join(tempRepo, 'docs', 'design.md'), '# design');

    const result = await changeImpactReview.execute('变更影响审查', {
      cwd: tempRepo
    });

    expect(result.type).toBe('result');
    expect(result.data).toEqual(
      expect.objectContaining({
        impactedDomains: expect.arrayContaining([
          expect.objectContaining({ domain: 'api' }),
          expect.objectContaining({ domain: 'database' })
        ]),
        risk: expect.objectContaining({
          level: expect.stringMatching(/low|medium|high/)
        }),
        regressionChecklist: expect.arrayContaining([expect.stringMatching(/API|Smoke|data/i)]),
        syncRecommendations: expect.arrayContaining([
          expect.objectContaining({ skill: 'yapi-sync-interface' }),
          expect.objectContaining({ skill: 'yuque-sync-design' })
        ]),
        relatedSkills: expect.arrayContaining(['data-risk-audit'])
      })
    );

    await fs.remove(tempRepo);
  });

  test('data-risk-audit flags destructive SQL without WHERE', async () => {
    const result = await dataRiskAudit.execute('数据风险 sql: DELETE FROM orders');

    expect(result.type).toBe('result');
    expect(result.data.risk.level).toBe('high');
    expect(result.data.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: expect.stringContaining('without WHERE')
        })
      ])
    );
  });

  test('data-risk-audit flags broad Redis key access', async () => {
    const result = await dataRiskAudit.execute('Redis风险 redis: KEYS *');

    expect(result.type).toBe('result');
    expect(result.data.risk.level).toBe('high');
    expect(result.data.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          issue: expect.stringContaining('KEYS')
        })
      ])
    );
  });

  test('data-risk-audit runs EXPLAIN preview when databaseQuery adapter is available', async () => {
    const queryExec = jest.fn().mockResolvedValue({
      rows: [{ table: 'orders', type: 'ALL', rows: 12000, Extra: 'Using filesort' }]
    });
    const fetchTables = jest.fn().mockResolvedValue({
      tables: [{ tableName: 'orders' }]
    });
    const fetchFields = jest.fn().mockResolvedValue({
      fields: [
        { fieldName: 'id', dataType: 'bigint' },
        { fieldName: 'status', dataType: 'varchar' }
      ]
    });

    const result = await dataRiskAudit.execute('数据风险 sql: SELECT * FROM orders', {
      componentRegistry: {
        getAdapter: () => ({
          queryExec,
          fetchTables,
          fetchFields
        })
      },
      sourceInference: {
        matched: true,
        project: 'retail-service',
        environment: 'uat',
        database: {
          sourceId: 'source-1',
          databaseId: 'db-1',
          database: 'retail'
        }
      }
    });

    expect(queryExec).toHaveBeenCalledWith(
      expect.objectContaining({
        sql: expect.stringMatching(/^EXPLAIN /),
        source_id: 'source-1',
        database_id: 'db-1',
        schema: 'retail'
      })
    );
    expect(fetchTables).toHaveBeenCalledWith(
      expect.objectContaining({
        source_id: 'source-1',
        database_id: 'db-1',
        schema: 'retail'
      })
    );
    expect(result.data.explain).toEqual(
      expect.objectContaining({
        attempted: true,
        summary: expect.objectContaining({
          warnings: expect.arrayContaining([
            expect.stringContaining('Full table scan'),
            expect.stringContaining('filesort')
          ])
        })
      })
    );
    expect(result.data.metadata).toEqual(
      expect.objectContaining({
        attempted: true,
        matchedTables: expect.arrayContaining([expect.objectContaining({ name: 'orders', exists: true })]),
        sampledFields: expect.arrayContaining([expect.objectContaining({ name: 'id' })])
      })
    );
  });

  test('report-insights summarizes report adapter output', async () => {
    const result = await reportInsights.execute('构建报告 job=retail-service limit=3', {
      componentRegistry: {
        getAdapter: () => ({
          listBuilds: async () => ({
            list: [
              { id: '1', jobName: 'retail-service', status: 'SUCCESS', branch: 'master' },
              { id: '2', jobName: 'retail-service', status: 'FAILED', branch: 'master' }
            ],
            total: 2
          })
        })
      }
    });

    expect(result.type).toBe('result');
    expect(result.data.summary).toEqual(
      expect.objectContaining({
        total: 2,
        failed: 1,
        items: expect.arrayContaining([expect.objectContaining({ name: 'retail-service', status: 'SUCCESS' })])
      })
    );
    expect(result.data.automationCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'change-impact-review' }),
        expect.objectContaining({ skill: 'archive-change' })
      ])
    );
  });

  test('report-insights returns binding and retry hints when report adapter is missing', async () => {
    const result = await reportInsights.execute('构建报告 job=retail-service');

    expect(result.type).toBe('error');
    expect(result.data).toEqual(
      expect.objectContaining({
        kind: 'missing-component',
        retryable: true,
        retryHints: expect.arrayContaining([expect.stringContaining('Configure the report component')]),
        bindingHint: expect.objectContaining({
          suggestedCommand: expect.stringContaining('绑定报告')
        })
      })
    );
  });

  test('change-impact-review and knowledge-ops emit staged progress updates when a reporter is provided', async () => {
    const tempRepo = path.join(os.tmpdir(), `flowmind-progress-${Date.now()}`);
    const sourcePath = path.join(tempRepo, 'notes.md');
    const impactProgress = jest.fn();
    const knowledgeProgress = jest.fn();
    await fs.ensureDir(path.join(tempRepo, 'src', 'controller'));
    await fs.writeFile(
      path.join(tempRepo, 'src', 'controller', 'DemoController.java'),
      '@GetMapping("/demo") class DemoController {}'
    );
    await fs.writeFile(sourcePath, '# 发布回滚\n\ncontent', 'utf-8');

    await changeImpactReview.execute('变更影响', {
      cwd: tempRepo,
      onProgress: impactProgress
    });

    expect(impactProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'resolve-repo',
        percent: 10
      })
    );
    expect(impactProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'classify-files',
        percent: 55
      })
    );

    await knowledgeOps.execute(`保存知识 path=${sourcePath} repo=team/release`, {
      onProgress: knowledgeProgress,
      componentRegistry: {
        getAdapter: () => ({
          createDoc: jest.fn().mockResolvedValue({ id: 'doc-1', slug: '发布回滚' })
        })
      }
    });

    expect(knowledgeProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'persist',
        percent: 75
      })
    );
    expect(knowledgeProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'finalize',
        percent: 95
      })
    );

    await fs.remove(tempRepo);
  });

  test('auto-flow and log-audit emit staged progress updates for long-running workflows', async () => {
    const autoProgress = jest.fn();
    const logProgress = jest.fn();

    await autoFlow.execute('列出 uat-retail-manager 的流程', {
      onProgress: autoProgress,
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'auto-flow',
          listPipelines: jest.fn().mockResolvedValue({
            list: [{ pipelineName: 'uat-retail-manager', pipelineId: '2436072' }]
          })
        })
      }
    });

    expect(autoProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'parse',
        percent: 10
      })
    );
    expect(autoProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'list-pipelines',
        percent: 60
      })
    );
    expect(autoProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'finalize',
        percent: 95
      })
    );

    await logAudit.execute('查询 traceId abc123 的日志', {
      onProgress: logProgress,
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams: (params) => params,
          queryLogs: jest.fn().mockResolvedValue({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'ok',
                  total: 1,
                  logs: [{ service: 'demo', message: 'hit' }]
                })
              }
            ]
          })
        })
      }
    });

    expect(logProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'query-logs',
        percent: 60
      })
    );
    expect(logProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'summarize',
        percent: 80
      })
    );
    expect(logProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'finalize',
        percent: 95
      })
    );
  });

  test('build-report, test-report, and coverage-report route to report-insights actions', async () => {
    const componentRegistry = {
      getAdapter: () => ({
        listBuilds: async () => ({ list: [{ id: '1', jobName: 'svc', status: 'SUCCESS' }] }),
        listUnitReports: async () => ({ list: [{ id: '2', name: 'svc-unit', status: 'FAILED' }] }),
        listJacocoReports: async () => ({ list: [{ id: '3', name: 'svc-cov', status: 'READY' }] })
      })
    };

    const buildResult = await buildReport.execute('job=svc', { componentRegistry });
    const testResult = await testReport.execute('job=svc', { componentRegistry });
    const coverageResult = await coverageReport.execute('job=svc', { componentRegistry });

    expect(buildResult.data.action).toBe('build');
    expect(testResult.data.action).toBe('test');
    expect(coverageResult.data.action).toBe('coverage');
  });

  test('knowledge-ops searches through the knowledge adapter', async () => {
    const result = await knowledgeOps.execute('搜索知识 keyword=发布回滚', {
      componentRegistry: {
        getAdapter: () => ({
          search: async () => ({
            docs: [{ id: 'doc-1', title: '发布回滚手册', type: 'markdown' }]
          })
        })
      }
    });

    expect(result.type).toBe('result');
    expect(result.data.summary.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: '发布回滚手册' })])
    );
  });

  test('knowledge-ops updates entries and generates runbook templates', async () => {
    const tempDir = path.join(os.tmpdir(), `flowmind-knowledge-${Date.now()}`);
    const sourcePath = path.join(tempDir, 'runbook.md');
    await fs.ensureDir(tempDir);
    await fs.writeFile(sourcePath, '# 发布回滚手册\n\ncontent', 'utf-8');

    const updateDoc = jest.fn().mockResolvedValue({ id: 'doc-1', slug: '发布回滚手册' });
    const updateResult = await knowledgeOps.execute(`更新知识 path=${sourcePath} repo=team/ops slug=rollback-guide`, {
      componentRegistry: {
        getAdapter: () => ({
          updateDoc
        })
      }
    });

    expect(updateDoc).toHaveBeenCalledWith(
      'team/ops',
      'rollback-guide',
      expect.objectContaining({
        title: '发布回滚手册'
      })
    );
    expect(updateResult.data.action).toBe('update');
    expect(updateResult.data.deposition).toEqual(
      expect.objectContaining({
        mode: 'update',
        namespace: 'team/ops'
      })
    );

    const templatePath = path.join(tempDir, 'template.md');
    const templateResult = await knowledgeOps.execute(`runbook 模板 path=${templatePath} title=发布回滚`, {
      componentRegistry: {
        getAdapter: () => ({
          updateDoc
        })
      }
    });

    expect(templateResult.data.action).toBe('template');
    expect(await fs.pathExists(templatePath)).toBe(true);
    const content = await fs.readFile(templatePath, 'utf-8');
    expect(content).toContain('# 发布回滚');
    expect(content).toContain('## Diagnosis');
    expect(templateResult.data.nextActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ skill: 'knowledge-ops' })])
    );

    await fs.remove(tempDir);
  });

  test('knowledge-ops saves markdown files and requires a namespace for persistence actions', async () => {
    const tempDir = path.join(os.tmpdir(), `flowmind-knowledge-save-${Date.now()}`);
    const sourcePath = path.join(tempDir, 'ops.md');
    await fs.ensureDir(tempDir);
    await fs.writeFile(sourcePath, '# 发布说明\n\ncontent', 'utf-8');

    const createDoc = jest.fn().mockResolvedValue({ id: 'doc-2', slug: '发布说明' });
    const saveResult = await knowledgeOps.execute(`保存知识 path=${sourcePath} repo=team/release`, {
      componentRegistry: {
        getAdapter: () => ({
          createDoc
        })
      }
    });

    expect(createDoc).toHaveBeenCalledWith(
      'team/release',
      expect.objectContaining({
        title: '发布说明'
      })
    );
    expect(saveResult.data.deposition).toEqual(
      expect.objectContaining({
        mode: 'save',
        namespace: 'team/release'
      })
    );

    const missingNamespaceResult = await knowledgeOps.execute(`保存知识 path=${sourcePath}`, {
      componentRegistry: {
        getAdapter: () => ({
          createDoc
        })
      }
    });

    expect(missingNamespaceResult.type).toBe('error');
    expect(missingNamespaceResult.data.bindingHint).toEqual(
      expect.objectContaining({
        suggestedCommand: expect.stringContaining('绑定知识库')
      })
    );
    expect(missingNamespaceResult.data).toEqual(
      expect.objectContaining({
        kind: 'missing-parameter',
        retryable: true
      })
    );

    await fs.remove(tempDir);
  });

  test('yapi-sync-interface and yuque-sync-design return contract errors when components are missing', async () => {
    const yapiResult = await yapiSyncInterface.execute('同步 YApi');
    expect(yapiResult).toEqual(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          kind: 'missing-component',
          retryable: true
        })
      })
    );

    const yuqueResult = await yuqueSyncDesign.execute('同步语雀 path=docs/design.md');
    expect(yuqueResult).toEqual(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          kind: 'missing-component',
          retryable: true
        })
      })
    );
  });

  test('data-validation and data-logic-validation surface invalid input as contract errors', async () => {
    const validationResult = await dataValidation.execute('验证一下');
    expect(validationResult).toEqual(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          kind: 'invalid-input',
          retryable: true
        })
      })
    );

    const logicResult = await dataLogicValidation.execute('帮我检查数据逻辑');
    expect(logicResult).toEqual(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          kind: 'invalid-input',
          retryable: true
        })
      })
    );
  });

  test('auto-flow returns a contract error when workflow service is missing', async () => {
    const result = await autoFlow.execute('部署 uat-retail-manager', {
      componentRegistry: {
        getAdapter: () => null
      }
    });

    expect(result).toEqual(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          kind: 'missing-component',
          retryable: true,
          status: 'not_configured'
        })
      })
    );
  });

  test('MCP server exposes a capability catalog tool and capability mapping', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [
          { name: 'change-impact-review', description: 'impact', category: 'review' },
          { name: 'data-risk-audit', description: 'risk', category: 'quality' },
          { name: 'knowledge-ops', description: 'knowledge', category: 'knowledge' },
          { name: 'build-report', description: 'build', category: 'reporting' },
          { name: 'code-review', description: 'code', category: 'review' }
        ],
        get: (name) =>
          ({
            'change-impact-review': changeImpactReview,
            'data-risk-audit': dataRiskAudit,
            'knowledge-ops': knowledgeOps,
            'build-report': buildReport,
            'code-review': codeReview
          })[name] || null
      }
    };

    const tools = server.getTools();
    expect(tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'flowmind_capability_catalog' }),
        expect.objectContaining({ name: 'flowmind_learning_assets' }),
        expect.objectContaining({ name: 'flowmind_preview_workflow' }),
        expect.objectContaining({ name: 'flowmind_execute_workflow' }),
        expect.objectContaining({ name: 'flowmind_skill_change-impact-review' })
      ])
    );
    expect(tools.filter((tool) => 'outputSchema' in tool)).toEqual(
      expect.arrayContaining([expect.objectContaining({ outputSchema: expect.any(Object) })])
    );
    expect(tools.every((tool) => !('outputSchema' in tool) || (typeof tool.outputSchema === 'object' && !Array.isArray(tool.outputSchema)))).toBe(true);
    expect(tools.find((tool) => tool.name === 'flowmind_skill_code-review')).not.toHaveProperty('outputSchema');

    const result = await server.callTool('flowmind_capability_catalog', {});
    const payload = JSON.parse(result.content[0].text);
    expect(payload.capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capability: 'review',
          skills: expect.arrayContaining([expect.objectContaining({ name: 'change-impact-review' })])
        }),
        expect.objectContaining({
          capability: 'data',
          skills: expect.arrayContaining([expect.objectContaining({ name: 'data-risk-audit' })])
        })
      ])
    );

    const skillResult = await server.callTool('flowmind_get_skill', { name: 'change-impact-review' });
    const skillPayload = JSON.parse(skillResult.content[0].text);
    expect(skillPayload).toEqual(
      expect.objectContaining({
        capabilities: expect.arrayContaining(['review']),
        inputSchema: expect.any(Object),
        outputSchema: expect.any(Object)
      })
    );
  });

  test('MCP server returns the current learning-assets view', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: { list: () => [], get: () => null },
      getLearningAssets: jest.fn().mockResolvedValue({
        summary: { returnedFeedback: 1, sourceFiles: 1 },
        feedback: [{ id: 'learn-1', skill: 'log-audit' }],
        packages: { sourceFiles: [{ path: 'RESOURCE_INDEX.md' }] }
      })
    };

    const result = await server.callTool('flowmind_learning_assets', { skill: 'log-audit', limit: 5 });
    const payload = JSON.parse(result.content[0].text);

    expect(server.flowmind.getLearningAssets).toHaveBeenCalledWith({ skill: 'log-audit', limit: 5 });
    expect(payload.summary).toEqual(expect.objectContaining({ returnedFeedback: 1, sourceFiles: 1 }));
  });

  test('MCP server supports async task start, status polling, and task listing', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [{ name: 'change-impact-review', description: 'impact', category: 'review' }],
        get: (name) =>
          ({
            'change-impact-review': changeImpactReview
          })[name] || null
      },
      executeWithLearning: jest.fn(async (_skill, input) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          type: 'result',
          data: {
            echoed: input
          }
        };
      })
    };

    const startResult = await server.callTool('flowmind_start_task', {
      tool: 'flowmind_skill_change-impact-review',
      arguments: {
        input: '异步执行影响审查'
      }
    });
    const startPayload = JSON.parse(startResult.content[0].text);

    expect(startPayload.task).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^task-\d+$/),
        status: 'queued'
      })
    );

    const finishedTask = await waitForTask(server, startPayload.task.id);
    expect(finishedTask).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        progress: expect.objectContaining({ percent: 100 }),
        result: expect.objectContaining({
          content: expect.arrayContaining([expect.objectContaining({ type: 'text' })])
        })
      })
    );

    const listResult = await server.callTool('flowmind_list_tasks', { limit: 5 });
    const listPayload = JSON.parse(listResult.content[0].text);
    expect(listPayload.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: startPayload.task.id,
          status: 'succeeded'
        })
      ])
    );
  });

  test('MCP server persists async task failures for later inspection', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [{ name: 'change-impact-review', description: 'impact', category: 'review' }],
        get: (name) =>
          ({
            'change-impact-review': changeImpactReview
          })[name] || null
      },
      executeWithLearning: jest.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error('simulated failure');
      })
    };

    const startResult = await server.callTool('flowmind_start_task', {
      tool: 'flowmind_skill_change-impact-review',
      arguments: {
        input: '失败任务'
      }
    });
    const startPayload = JSON.parse(startResult.content[0].text);

    const finishedTask = await waitForTask(server, startPayload.task.id);
    expect(finishedTask).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          error: 'simulated failure'
        })
      })
    );
  });

  test('MCP server marks skill-level contract errors as failed results', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [{ name: 'report-insights', description: 'report', category: 'reporting' }],
        get: (name) =>
          ({
            'report-insights': reportInsights
          })[name] || null
      },
      executeWithLearning: jest.fn(async () => reportInsights.execute('构建报告 job=demo-service'))
    };

    const directResult = await server.callTool('flowmind_skill_report-insights', {
      input: '构建报告 job=demo-service'
    });
    expect(directResult.isError).toBe(true);
    const directPayload = JSON.parse(directResult.content[0].text);
    expect(directPayload).toEqual(
      expect.objectContaining({
        type: 'error',
        data: expect.objectContaining({
          kind: 'missing-component'
        })
      })
    );

    const startResult = await server.callTool('flowmind_start_task', {
      tool: 'flowmind_skill_report-insights',
      arguments: {
        input: '构建报告 job=demo-service'
      }
    });
    const startPayload = JSON.parse(startResult.content[0].text);

    const finishedTask = await waitForTask(server, startPayload.task.id);
    expect(finishedTask).toEqual(
      expect.objectContaining({
        status: 'failed',
        error: expect.objectContaining({
          type: 'error',
          data: expect.objectContaining({
            kind: 'missing-component'
          })
        })
      })
    );
  });

  test('MCP server can cancel queued async tasks before execution starts', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [{ name: 'change-impact-review', description: 'impact', category: 'review' }],
        get: (name) =>
          ({
            'change-impact-review': changeImpactReview
          })[name] || null
      },
      executeWithLearning: jest.fn(async () => ({
        type: 'result',
        data: { ok: true }
      }))
    };

    const startResult = await server.callTool('flowmind_start_task', {
      tool: 'flowmind_skill_change-impact-review',
      arguments: {
        input: '取消任务'
      }
    });
    const startPayload = JSON.parse(startResult.content[0].text);

    const cancelResult = await server.callTool('flowmind_cancel_task', {
      taskId: startPayload.task.id
    });
    const cancelPayload = JSON.parse(cancelResult.content[0].text);

    expect(cancelPayload.task).toEqual(
      expect.objectContaining({
        id: startPayload.task.id,
        status: 'cancelled',
        cancellation: expect.objectContaining({
          supported: true
        })
      })
    );
    expect(server.flowmind.executeWithLearning).not.toHaveBeenCalled();
  });

  test('MCP server surfaces skill-level progress updates in async task status', async () => {
    const server = new FlowMindMCPServer();
    server.initialized = true;
    server.flowmind = {
      skills: {
        list: () => [{ name: 'change-impact-review', description: 'impact', category: 'review' }],
        get: (name) =>
          ({
            'change-impact-review': changeImpactReview
          })[name] || null
      },
      executeWithLearning: jest.fn(async (_skill, _input, context) => {
        context.onProgress({ stage: 'analyze', percent: 20, message: 'Analyzing change set' });
        await new Promise((resolve) => setTimeout(resolve, 15));
        context.onProgress({ stage: 'validate', percent: 70, message: 'Validating findings' });
        await new Promise((resolve) => setTimeout(resolve, 15));
        return {
          type: 'result',
          data: {
            ok: true
          }
        };
      })
    };

    const startResult = await server.callTool('flowmind_start_task', {
      tool: 'flowmind_skill_change-impact-review',
      arguments: {
        input: '异步进度任务'
      }
    });
    const startPayload = JSON.parse(startResult.content[0].text);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const midResult = await server.callTool('flowmind_task_status', { taskId: startPayload.task.id });
    const midPayload = JSON.parse(midResult.content[0].text);
    expect(midPayload.task.status).toBe('running');
    expect(midPayload.task.progress).toEqual(
      expect.objectContaining({
        stage: expect.stringMatching(/analyze|validate/),
        percent: expect.any(Number)
      })
    );
    expect(midPayload.task.progressHistory.length).toBeGreaterThanOrEqual(2);

    const finishedTask = await waitForTask(server, startPayload.task.id);
    expect(finishedTask.progressHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'analyze', percent: 20 }),
        expect.objectContaining({ stage: 'validate', percent: 70 }),
        expect.objectContaining({ stage: 'completed', percent: 100 })
      ])
    );
  });

  test('change-impact-review exposes follow-up automation candidates', async () => {
    const tempRepo = path.join(os.tmpdir(), `flowmind-impact-actions-${Date.now()}`);
    await fs.ensureDir(path.join(tempRepo, 'src', 'controller'));
    await fs.ensureDir(path.join(tempRepo, 'src', 'repository'));
    await fs.writeFile(
      path.join(tempRepo, 'src', 'controller', 'DemoController.java'),
      '@GetMapping("/demo") class DemoController {}'
    );
    await fs.writeFile(path.join(tempRepo, 'src', 'repository', 'DemoRepository.java'), 'select * from orders');

    const result = await changeImpactReview.execute('变更影响', {
      cwd: tempRepo,
      componentRegistry: {
        getAdapter: (name) => {
          if (name === 'apiDoc') return { ok: true };
          if (name === 'databaseQuery') return { ok: true };
          return null;
        }
      },
      sourceInference: {
        matched: true,
        project: 'demo-service',
        environment: 'uat'
      }
    });

    expect(result.data.automationCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skill: 'yapi-sync-interface', configured: true }),
        expect.objectContaining({ skill: 'data-risk-audit', configured: true })
      ])
    );

    await fs.remove(tempRepo);
  });
});
