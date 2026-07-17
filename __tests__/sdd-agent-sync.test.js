const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  autoSyncSddAgentToFlowMind,
  buildComponentConfig,
  convertResourceBindings,
  convertSceneMappings,
  mergeBindings,
  syncSddAgentToFlowMind
} = require('../core/sdd-agent-sync');

describe('sdd-agent sync helpers', () => {
  test('converts sdd-agent resource config into flowmind bindings with aliases', () => {
    const bindings = convertResourceBindings({
      resources: {
        database: {
          enabled: true,
          mcpServers: {
            directQuery: 'friday-rds-redis-query',
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
            directQuery: 'friday-rds-redis-query',
            monitor: 'friday-aliyun-sz-rds-redis'
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
          mcpServer: 'friday-sls-logs',
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
        mcpServer: 'friday-rds-redis-query',
        aliases: expect.arrayContaining(['business-promotion-uat', '业务推广 UAT', '业务推广', '广告合同'])
      }),
      expect.objectContaining({
        business: '日志-uat',
        componentType: 'logService',
        provider: 'aliyun-sls',
        mcpServer: 'friday-sls-logs'
      }),
      expect.objectContaining({
        business: 'Retail UAT Redis',
        componentType: 'redisMonitor',
        mcpServer: 'friday-aliyun-sz-rds-redis'
      })
    ]));
  });

  test('builds flowmind component config from sdd-agent resources', () => {
    const componentConfig = buildComponentConfig({
      resources: {
        database: {
          enabled: true,
          mcpServers: {
            directQuery: 'friday-rds-redis-query',
            dms: 'aliyun-dms-mcp-server'
          }
        },
        redis: {
          enabled: true,
          mcpServers: {
            monitor: 'friday-aliyun-sz-rds-redis'
          }
        },
        sls: {
          enabled: true,
          mcpServer: 'friday-sls-logs',
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

    expect(componentConfig.components.databaseQuery.providers['aliyun-rds-query'].mcpServer).toBe('friday-rds-redis-query');
    expect(componentConfig.components.databaseManager.providers['aliyun-dms'].mcpServer).toBe('aliyun-dms-mcp-server');
    expect(componentConfig.components.redisMonitor.providers['aliyun-redis'].mcpServer).toBe('friday-aliyun-sz-rds-redis');
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
      mcpServer: 'friday-auto-flow',
      defaultBinding: 'auto-flow'
    }));
    expect(componentConfig.components.workflow.providers['friday-flow'].mcpServer).toBe('friday-auto-flow');
    expect(resourceBindings.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        componentType: 'workflow',
        provider: 'friday-flow',
        mcpServer: 'friday-auto-flow',
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
});
