const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  autoSyncSddAgentToFlowMind,
  buildComponentConfig,
  convertResourceBindings,
  convertSceneMappings,
  convertSkillBindings,
  mergeBindings,
  syncFlowMindToSddAgent,
  syncSharedLearning,
  syncSddAgentToFlowMind
} = require('../core/sdd-agent-sync');

describe('sdd-agent sync helpers', () => {
  test('converts sdd-agent resource config into flowmind bindings with aliases', () => {
    const bindings = convertResourceBindings({
      resources: {
        database: {
          enabled: true,
          mcpServers: {
            directQuery: 'db-redis-query',
            dms: 'aliyun-dms-mcp-server'
          },
          bindings: {
            'business-promotion-uat': {
              database: 'business_promotion',
              envType: 'uat',
              name: '业务推广 UAT'
            }
          }
        },
        redis: {
          enabled: true,
          mcpServers: {
            directQuery: 'db-redis-query',
            monitor: 'redis-monitor'
          },
          bindings: {
            'retail-uat': {
              envType: 'uat',
              name: 'Retail UAT Redis'
            }
          }
        },
        sls: {
          enabled: true,
          mcpServer: 'sls-logs',
          envConfig: {
            uat: {
              project: 'uat-project',
              endpoint: 'cn-shenzhen.log.aliyuncs.com',
              logstore: 'uat-log',
              name: 'UAT 日志'
            }
          }
        }
      },
      aliases: {
        '业务推广': { database: 'business-promotion-uat' },
        '广告合同': { database: 'business-promotion-uat' }
      }
    });

    expect(bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        business: '业务推广',
        componentType: 'databaseQuery',
        provider: 'aliyun-rds-query',
        mcpServer: 'db-redis-query',
        aliases: expect.arrayContaining(['business-promotion-uat', '业务推广 UAT', '业务推广', '广告合同'])
      }),
      expect.objectContaining({
        business: '日志-uat',
        componentType: 'logService',
        provider: 'aliyun-sls',
        mcpServer: 'sls-logs'
      }),
      expect.objectContaining({
        business: 'Retail UAT Redis',
        componentType: 'redisMonitor',
        mcpServer: 'redis-monitor'
      })
    ]));
  });

  test('builds flowmind component config from sdd-agent resources', () => {
    const componentConfig = buildComponentConfig({
      resources: {
        database: {
          enabled: true,
          mcpServers: {
            directQuery: 'db-redis-query',
            dms: 'aliyun-dms-mcp-server'
          }
        },
        redis: {
          enabled: true,
          mcpServers: {
            monitor: 'redis-monitor'
          }
        },
        sls: {
          enabled: true,
          mcpServer: 'sls-logs',
          defaultEnv: 'uat',
          envConfig: {
            uat: {
              project: 'uat-project',
              endpoint: 'cn-shenzhen.log.aliyuncs.com',
              logstore: 'uat-log'
            },
            prod: {
              project: 'prod-project',
              endpoint: 'cn-hongkong.log.aliyuncs.com',
              logstore: 'prod-log'
            }
          }
        }
      }
    });

    expect(componentConfig.components.databaseQuery.providers['aliyun-rds-query'].mcpServer).toBe('db-redis-query');
    expect(componentConfig.components.databaseManager.providers['aliyun-dms'].mcpServer).toBe('aliyun-dms-mcp-server');
    expect(componentConfig.components.redisMonitor.providers['aliyun-redis'].mcpServer).toBe('redis-monitor');
    expect(componentConfig.components.logService.providers['aliyun-sls'].config.defaultLogstore).toBe('uat-log');
    expect(componentConfig.components.logService.providers['aliyun-sls'].config.envConfig).toEqual(expect.objectContaining({
      uat: expect.objectContaining({
        project: 'uat-project',
        logstore: 'uat-log'
      }),
      prod: expect.objectContaining({
        project: 'prod-project',
        logstore: 'prod-log'
      })
    }));
  });

  test('converts scene mappings into flowmind scenes', () => {
    const scenes = convertSceneMappings({
      sceneCategories: {
        '数据验证': ['scene-001']
      },
      mappings: [
        {
          id: 'scene-001',
          sceneName: '查询业务配置数据',
          keywords: ['配置数据', '查询配置'],
          patterns: ['查询.*配置.*数据'],
          skillSequence: [
            { skill: 'code-search', action: 'locate-business-logic', params: { preciseQuery: true } },
            { skill: 'data-logic-validation', action: 'query-by-code-logic' }
          ],
          userPreference: {
            outputFormat: 'structured'
          },
          useCount: 2,
          confidence: 0.95
        }
      ]
    });

    expect(scenes).toEqual([
      expect.objectContaining({
        id: 'sdd-scene-001',
        name: '查询业务配置数据',
        keywords: ['配置数据', '查询配置'],
        workflow: {
          skills: [
            { skill: 'code-search', params: { action: 'locate-business-logic', preciseQuery: true } },
            { skill: 'data-logic-validation', params: { action: 'query-by-code-logic' } }
          ]
        },
        preferences: {
          outputFormat: 'structured'
        },
        stats: expect.objectContaining({
          useCount: 2,
          successRate: 0.95
        })
      })
    ]);
  });

  test('merges imported bindings with existing flowmind records', () => {
    const merged = mergeBindings([
      {
        id: 'bind-1',
        business: '业务推广',
        componentType: 'databaseQuery',
        provider: 'aliyun-rds-query',
        aliases: ['旧别名'],
        keywords: ['旧关键词'],
        connection: { host: 'old-host' }
      }
    ], [
      {
        id: 'sdd-database-business-promotion-uat',
        business: '业务推广',
        componentType: 'databaseQuery',
        provider: 'aliyun-rds-query',
        aliases: ['新别名'],
        keywords: ['新关键词'],
        connection: { database: 'business_promotion' }
      }
    ]);

    expect(merged).toEqual([
      expect.objectContaining({
        aliases: expect.arrayContaining(['旧别名', '新别名']),
        keywords: expect.arrayContaining(['旧关键词', '新关键词']),
        connection: expect.objectContaining({
          host: 'old-host',
          database: 'business_promotion'
        })
      })
    ]);
  });

  test('sync imports workflow bindings and workflow component config from auto-flow learning data', async () => {
    const sourceDir = path.join(os.tmpdir(), `sdd-agent-source-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-target-${Date.now()}`);
    await fs.ensureDir(path.join(sourceDir, 'learning'));
    await fs.writeJson(path.join(sourceDir, 'resource-config.json'), {
      version: '1.0',
      resources: {},
      mcpServers: {},
      aliases: {}
    }, { spaces: 2 });
    await fs.writeJson(path.join(sourceDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {
        'auto-flow': {
          learningCount: 1,
          lastLearning: '2026-06-30T10:39:15Z',
          records: [
            {
              recordId: 'lr-auto-flow-archive-001',
              type: 'process_correction',
              summary: '飞流部署完成后必须自动补写归档和映射记录',
              priority: 'high'
            }
          ],
          rules: [
            {
              condition: '当执行飞流部署、启动流水线、或准备给用户回报部署结果时',
              action: '在回复前先补写本地归档文件和学习记录，记录服务名、分支、pipelineId、runId、执行结果，以及需要沉淀的自动归档规则',
              source: 'lr-auto-flow-archive-001'
            }
          ]
        }
      }
    }, { spaces: 2 });

    const summary = await syncSddAgentToFlowMind({ sourceDir, targetHome });
    const resourceConfig = await fs.readJson(path.join(targetHome, '.flowmind', 'resource-config.json'));
    const componentConfig = await fs.readJson(path.join(targetHome, '.flowmind', 'component-config.json'));
    const resourceBindings = await fs.readJson(path.join(targetHome, '.flowmind', 'learning', 'resource-bindings.json'));

    expect(summary.counts.importedBindings).toBe(1);
    expect(resourceConfig.resources.workflow).toEqual(expect.objectContaining({
      enabled: true,
      mcpServer: 'auto-flow',
      defaultBinding: 'auto-flow'
    }));
    expect(componentConfig.components.workflow.providers['auto-flow'].mcpServer).toBe('auto-flow');
    expect(resourceBindings.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentType: 'workflow',
        provider: 'auto-flow',
        mcpServer: 'auto-flow',
        business: '自动部署'
      })
    ]));
    expect(summary.counts.copiedSourceFiles).toBeGreaterThanOrEqual(0);

    await fs.remove(sourceDir);
    await fs.remove(targetHome);
  });

  test('sync copies selected source mapping files and auto-sync skips unchanged sources', async () => {
    const sourceDir = path.join(os.tmpdir(), `sdd-agent-source-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-target-${Date.now()}`);
    await fs.ensureDir(path.join(sourceDir, 'learning'));
    await fs.ensureDir(path.join(sourceDir, 'source'));
    await fs.writeJson(path.join(sourceDir, 'resource-config.json'), {
      version: '1.0',
      resources: {},
      mcpServers: {},
      aliases: {}
    }, { spaces: 2 });
    await fs.writeJson(path.join(sourceDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {}
    }, { spaces: 2 });
    await fs.writeFile(path.join(sourceDir, 'source', 'project-db-configs.json'), JSON.stringify({ demo: true }, null, 2));
    await fs.writeFile(path.join(sourceDir, 'source', 'auto-flow-apis.md'), '# demo\n');

    const summary = await syncSddAgentToFlowMind({ sourceDir, targetHome });
    expect(summary.counts.copiedSourceFiles).toBe(2);
    expect(await fs.pathExists(path.join(targetHome, '.flowmind', 'source', 'project-db-configs.json'))).toBe(true);
    expect(await fs.pathExists(path.join(targetHome, '.flowmind', 'source', 'auto-flow-apis.md'))).toBe(true);

    const firstAuto = await autoSyncSddAgentToFlowMind({ sourceDir, targetHome, force: true });
    expect(firstAuto.synced).toBe(true);
    const secondAuto = await autoSyncSddAgentToFlowMind({ sourceDir, targetHome, force: true });
    expect(secondAuto.synced).toBe(false);
    expect(secondAuto.reason).toBe('up-to-date');

    await fs.remove(sourceDir);
    await fs.remove(targetHome);
  });

  test('auto-sync stays disabled by default until explicitly enabled', async () => {
    const sourceDir = path.join(os.tmpdir(), `sdd-agent-source-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-target-${Date.now()}`);
    await fs.ensureDir(path.join(sourceDir, 'learning'));
    await fs.writeJson(path.join(sourceDir, 'resource-config.json'), {
      version: '1.0',
      resources: {},
      mcpServers: {},
      aliases: {}
    }, { spaces: 2 });

    const result = await autoSyncSddAgentToFlowMind({ sourceDir, targetHome });

    expect(result.synced).toBe(false);
    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('not-enabled');
    expect(await fs.pathExists(path.join(targetHome, '.flowmind', 'resource-config.json'))).toBe(false);

    await fs.remove(sourceDir);
    await fs.remove(targetHome);
  });

  test('convertSkillBindings maps records/rules per skill and globalRules to _global', () => {
    const converted = convertSkillBindings({
      version: '1.0',
      bindings: {
        'log-audit': {
          learningCount: 2,
          lastLearning: '2026-08-14T09:00:00.000Z',
          records: [
            { recordId: 'sdd-1', type: 'process_correction', summary: '规则一', priority: 'high' },
            { recordId: 'sdd-2', type: 'output_format', summary: '规则二', priority: 'medium' }
          ],
          rules: [
            { condition: 'trace 输出含多服务', action: '按服务分块渲染', source: 'sdd-1' }
          ]
        },
        'empty-skill': { learningCount: 0, records: [], rules: [] }
      },
      globalRules: [
        { pattern: '并列配置体系', action: '独立处理各配置段', source: 'rule-1' }
      ]
    });

    expect(converted.importedSkillRecords).toBe(2);
    expect(converted.importedSkillRules).toBe(1);
    expect(converted.importedGlobalRules).toBe(1);
    expect(converted.bindings['empty-skill']).toBeUndefined();
    expect(converted.bindings['log-audit']).toEqual(expect.objectContaining({
      learningCount: 2,
      lastLearning: '2026-08-14T09:00:00.000Z',
      metadata: expect.objectContaining({ importedFrom: 'sdd-agent' })
    }));
    expect(converted.bindings._global.rules).toEqual([
      { condition: '并列配置体系', action: '独立处理各配置段', source: 'rule-1' }
    ]);
  });

  test('sync imports skill learning rules idempotently without clobbering flowmind data', async () => {
    const sourceDir = path.join(os.tmpdir(), `sdd-agent-source-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-target-${Date.now()}`);
    await fs.ensureDir(path.join(sourceDir, 'learning'));
    await fs.ensureDir(path.join(targetHome, '.flowmind', 'learning'));
    await fs.writeJson(path.join(sourceDir, 'resource-config.json'), {
      version: '1.0',
      resources: {},
      mcpServers: {},
      aliases: {}
    }, { spaces: 2 });
    await fs.writeJson(path.join(sourceDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {
        'auto-flow': {
          learningCount: 1,
          records: [
            { recordId: 'lr-auto-flow-archive-001', type: 'process_correction', summary: '归档规则', priority: 'high' }
          ],
          rules: [
            { condition: '当执行飞流部署时', action: '先补写归档记录', source: 'lr-auto-flow-archive-001' }
          ]
        },
        'log-audit': {
          learningCount: 1,
          records: [
            { recordId: 'lr-log-audit-001', type: 'output_format', summary: '分块渲染', priority: 'high' }
          ],
          rules: [
            { condition: 'trace 输出含多服务', action: '按服务分块渲染并高亮异常', source: 'lr-log-audit-001' }
          ]
        }
      },
      globalRules: [
        { pattern: '全局规则一', action: '独立处理配置段', source: 'g-1' }
      ]
    }, { spaces: 2 });
    await fs.writeJson(path.join(targetHome, '.flowmind', 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {
        'log-audit': {
          learningCount: 1,
          lastLearning: '2026-08-20T00:00:00.000Z',
          records: [
            { recordId: 'fm-log-audit-1', type: 'correction', summary: 'flowmind 自己学的', priority: 'high' }
          ],
          rules: [
            { condition: 'When uat trace lookup', action: 'Use uat binding', priority: 'high' }
          ],
          preferredResourceBindings: { logService: 'bind-uat' }
        }
      },
      routes: [
        { id: 'route-1', skill: 'log-audit', normalizedInput: '查询日志', stats: { useCount: 1 } }
      ]
    }, { spaces: 2 });

    const summary = await syncSddAgentToFlowMind({ sourceDir, targetHome });
    expect(summary.counts.importedSkillRecords).toBe(2);
    expect(summary.counts.importedGlobalRules).toBe(1);
    expect(summary.files.skillBindings).toContain('skill-bindings.json');

    const skillBindingsPath = path.join(targetHome, '.flowmind', 'learning', 'skill-bindings.json');
    const imported = await fs.readJson(skillBindingsPath);

    // Union merge: flowmind's own record + sdd-agent's records coexist.
    const logAudit = imported.bindings['log-audit'];
    expect(logAudit.records.map((record) => record.recordId).sort()).toEqual(['fm-log-audit-1', 'lr-log-audit-001']);
    expect(logAudit.rules).toHaveLength(2);
    expect(logAudit.preferredResourceBindings).toEqual({ logService: 'bind-uat' });
    expect(logAudit.lastLearning).toBe('2026-08-20T00:00:00.000Z');
    expect(imported.bindings['auto-flow'].records).toHaveLength(1);
    expect(imported.bindings._global.rules).toEqual([
      expect.objectContaining({ condition: '全局规则一', action: '独立处理配置段' })
    ]);
    // flowmind's learned routes are preserved.
    expect(imported.routes).toHaveLength(1);

    // Idempotency: a second sync does not duplicate or inflate anything.
    await syncSddAgentToFlowMind({ sourceDir, targetHome });
    const rerun = await fs.readJson(skillBindingsPath);
    expect(rerun.bindings['log-audit'].records).toHaveLength(2);
    expect(rerun.bindings['log-audit'].rules).toHaveLength(2);
    expect(rerun.bindings['log-audit'].learningCount).toBe(logAudit.learningCount);
    expect(rerun.bindings._global.rules).toHaveLength(1);
    expect(rerun.routes).toHaveLength(1);

    await fs.remove(sourceDir);
    await fs.remove(targetHome);
  });

  test('sync copies learning deposit markdown documents and tracks them in the signature', async () => {
    const sourceDir = path.join(os.tmpdir(), `sdd-agent-source-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-target-${Date.now()}`);
    await fs.ensureDir(path.join(sourceDir, 'learning', 'records'));
    await fs.ensureDir(path.join(sourceDir, 'source'));
    await fs.writeJson(path.join(sourceDir, 'resource-config.json'), {
      version: '1.0',
      resources: {},
      mcpServers: {},
      aliases: {}
    }, { spaces: 2 });
    await fs.writeJson(path.join(sourceDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {}
    }, { spaces: 2 });
    await fs.writeFile(path.join(sourceDir, 'learning', 'records', '2026-07-02-analysis.md'), '# 沉淀一\n');
    await fs.writeFile(path.join(sourceDir, 'learning', 'records', '2026-07-30-analysis.md'), '# 沉淀二\n');
    await fs.writeFile(path.join(sourceDir, 'learning', 'learning-index.md'), '# 索引\n');

    const summary = await syncSddAgentToFlowMind({ sourceDir, targetHome });
    expect(summary.counts.copiedLearningRecords).toBe(2);
    expect(await fs.pathExists(path.join(targetHome, '.flowmind', 'source', 'sdd-records', '2026-07-02-analysis.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetHome, '.flowmind', 'source', 'sdd-records', 'learning-index.md'))).toBe(true);

    // Signature tracks the deposit docs: unchanged → up-to-date, changed → resync.
    await autoSyncSddAgentToFlowMind({ sourceDir, targetHome, force: true });
    const unchanged = await autoSyncSddAgentToFlowMind({ sourceDir, targetHome, force: true });
    expect(unchanged.synced).toBe(false);
    expect(unchanged.reason).toBe('up-to-date');

    await fs.writeFile(path.join(sourceDir, 'learning', 'records', '2026-07-02-analysis.md'), '# 沉淀一（更新）\n');
    const changed = await autoSyncSddAgentToFlowMind({ sourceDir, targetHome, force: true });
    expect(changed.synced).toBe(true);
    const refreshed = await fs.readFile(
      path.join(targetHome, '.flowmind', 'source', 'sdd-records', '2026-07-02-analysis.md'),
      'utf8'
    );
    expect(refreshed).toContain('沉淀一（更新）');

    await fs.remove(sourceDir);
    await fs.remove(targetHome);
  });

  test('syncFlowMindToSddAgent exports learned skills, routes, resources and scenes back to sdd-agent', async () => {
    const flowmindHome = path.join(os.tmpdir(), `flowmind-source-${Date.now()}`);
    const targetDir = path.join(os.tmpdir(), `sdd-agent-target-${Date.now()}`);
    const flowmindDir = path.join(flowmindHome, '.flowmind');
    await fs.ensureDir(path.join(flowmindDir, 'learning', 'records', 'offline-design-analysis'));
    await fs.ensureDir(path.join(targetDir, 'learning'));

    await fs.writeJson(path.join(flowmindDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {
        'offline-design-analysis': {
          learningCount: 1,
          records: [
            { recordId: 'existing-record', type: 'correction', summary: '已有记录', priority: 'medium' }
          ],
          rules: [
            { condition: '已有条件', action: '已有动作', source: 'existing-record' }
          ]
        }
      },
      routes: [
        {
          id: 'route-contract-quota',
          input: '分析合同校验额度流程',
          normalizedInput: '分析合同校验额度流程',
          semanticKey: 'analyze:合同校验额度流程',
          intentFamily: 'analyze',
          skill: 'offline-design-analysis',
          stats: { learnCount: 2, useCount: 3 }
        }
      ]
    }, { spaces: 2 });
    await fs.writeJson(path.join(flowmindDir, 'learning', 'resource-bindings.json'), {
      version: '1.0',
      bindings: [
        {
          id: 'bind-yapi-retail',
          business: '零售',
          aliases: ['retail'],
          componentType: 'apiDoc',
          provider: 'yapi'
        }
      ]
    }, { spaces: 2 });
    await fs.writeJson(path.join(flowmindDir, 'learning', 'scenes.json'), {
      version: '1.0',
      mappings: [
        {
          id: 'scene-contract-quota',
          name: '合同额度分析',
          keywords: ['合同', '额度'],
          workflow: {
            skills: [{ skill: 'offline-design-analysis', params: { action: 'analyze' } }]
          },
          stats: { useCount: 2, successRate: 1 }
        }
      ]
    }, { spaces: 2 });
    await fs.writeJson(
      path.join(flowmindDir, 'learning', 'records', 'offline-design-analysis', 'learn-contract.json'),
      {
        id: 'learn-contract',
        timestamp: '2026-08-25T00:00:00.000Z',
        skill: 'offline-design-analysis',
        type: 'correction',
        input: '合同额度要先查历史设计',
        application: {
          condition: 'When analyzing contract quota',
          action: 'Load historical design first',
          priority: 'high'
        }
      },
      { spaces: 2 }
    );
    await fs.writeJson(path.join(targetDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {
        'log-audit': {
          learningCount: 1,
          records: [{ recordId: 'sdd-log-1', type: 'format', summary: '日志格式', priority: 'medium' }],
          rules: [{ condition: '日志', action: '表格', source: 'sdd-log-1' }]
        }
      }
    }, { spaces: 2 });

    const summary = await syncFlowMindToSddAgent({ sourceHome: flowmindHome, targetDir });

    expect(summary.counts.exportedSkills).toBe(1);
    expect(summary.counts.exportedRoutes).toBe(1);
    expect(summary.counts.exportedResourceBindings).toBe(1);
    expect(summary.counts.exportedScenes).toBe(1);
    expect(summary.counts.writtenLearningRecords).toBe(1);

    const skillBindings = await fs.readJson(path.join(targetDir, 'learning', 'skill-bindings.json'));
    expect(skillBindings.bindings['log-audit']).toBeTruthy();
    expect(skillBindings.bindings['offline-design-analysis'].records).toEqual(expect.arrayContaining([
      expect.objectContaining({ recordId: 'existing-record' }),
      expect.objectContaining({ recordId: 'learn-contract', priority: 'high' })
    ]));
    expect(skillBindings.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'route-contract-quota', skill: 'offline-design-analysis' })
    ]));

    const resourceBindings = await fs.readJson(path.join(targetDir, 'learning', 'resource-bindings.json'));
    expect(resourceBindings.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'bind-yapi-retail', business: '零售' })
    ]));

    const scenes = await fs.readJson(path.join(targetDir, 'learning', 'scene-mappings.json'));
    expect(scenes.mappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ sceneName: '合同额度分析' })
    ]));
    expect(await fs.pathExists(path.join(targetDir, 'learning', 'records', 'offline-design-analysis-learn-contract.md'))).toBe(true);

    await fs.remove(flowmindHome);
    await fs.remove(targetDir);
  });

  test('syncSharedLearning imports sdd-agent data and exports flowmind routes in one pass', async () => {
    const sourceDir = path.join(os.tmpdir(), `sdd-agent-source-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-target-${Date.now()}`);
    await fs.ensureDir(path.join(sourceDir, 'learning'));
    await fs.ensureDir(path.join(targetHome, '.flowmind', 'learning'));
    await fs.writeJson(path.join(sourceDir, 'resource-config.json'), {
      version: '1.0',
      resources: {},
      mcpServers: {},
      aliases: {}
    }, { spaces: 2 });
    await fs.writeJson(path.join(sourceDir, 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {
        'auto-flow': {
          learningCount: 1,
          records: [{ recordId: 'sdd-auto-1', type: 'process', summary: '部署归档', priority: 'high' }],
          rules: [{ condition: '部署', action: '归档', source: 'sdd-auto-1' }]
        }
      }
    }, { spaces: 2 });
    await fs.writeJson(path.join(targetHome, '.flowmind', 'learning', 'skill-bindings.json'), {
      version: '1.0',
      bindings: {},
      routes: [
        {
          id: 'route-1',
          input: '分析合同校验额度流程',
          normalizedInput: '分析合同校验额度流程',
          semanticKey: 'analyze:合同校验额度流程',
          intentFamily: 'analyze',
          skill: 'offline-design-analysis',
          stats: { learnCount: 1, useCount: 0 }
        }
      ]
    }, { spaces: 2 });

    const summary = await syncSharedLearning({ sddDir: sourceDir, flowmindHome: targetHome });

    expect(summary.counts.importedSkillRecords).toBe(1);
    expect(summary.counts.exportedRoutes).toBe(1);

    const flowmindBindings = await fs.readJson(path.join(targetHome, '.flowmind', 'learning', 'skill-bindings.json'));
    expect(flowmindBindings.bindings['auto-flow'].records).toHaveLength(1);

    const sddBindings = await fs.readJson(path.join(sourceDir, 'learning', 'skill-bindings.json'));
    expect(sddBindings.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'route-1', skill: 'offline-design-analysis' })
    ]));

    await fs.remove(sourceDir);
    await fs.remove(targetHome);
  });
});
