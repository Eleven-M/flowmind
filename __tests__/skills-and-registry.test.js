const path = require('path');
const os = require('os');
const ComponentRegistry = require('../core/component-registry');
const FlowMind = require('../core');
const SkillLoader = require('../core/skill-loader');
const AutoFlowAdapter = require('../core/providers/automation/flow-adapter');
const AliyunRdsQueryAdapter = require('../core/providers/aliyun/rds-query-adapter');
const AliyunSlsAdapter = require('../core/providers/aliyun/sls-adapter');
const apiSync = require('../skills/api-sync');
const archiveChange = require('../skills/archive-change');
const autoFlow = require('../skills/auto-flow');
const codeReview = require('../skills/code-review');
const learningFeedback = require('../skills/learning-feedback');
const dataLogicValidation = require('../skills/data-logic-validation');
const logAudit = require('../skills/log-audit');
const projectReview = require('../skills/project-review');
const resourceBind = require('../skills/resource-bind');
const yapiSyncInterface = require('../skills/yapi-sync-interface');
const yuqueSyncDesign = require('../skills/yuque-sync-design');

describe('skills and registry integration', () => {
  test('ComponentRegistry.getAll returns a flat provider list', () => {
    const registry = new ComponentRegistry({ get: jest.fn().mockReturnValue({}) });
    const adapter = {
      getStatus: jest.fn().mockReturnValue({
        provider: 'aliyun-sls',
        type: 'logService',
        enabled: true,
        initialized: true,
        mcpServer: 'sls-logs'
      })
    };

    registry.register('logService', 'aliyun-sls', adapter);

    expect(registry.getAll()).toEqual([expect.objectContaining({
      name: 'aliyun-sls',
      type: 'logService',
      active: true,
      mcpServer: 'sls-logs'
    })]);
  });

  test('resource-bind list uses registry.getAll output', async () => {
    const result = await resourceBind.execute('列表资源', {
      componentRegistry: {
        getAll: () => [{
          name: 'aliyun-sls',
          type: 'logService',
          provider: 'aliyun-sls',
          active: true,
          initialized: true,
          mcpServer: 'sls-logs'
        }]
      },
      flowmind: {
        learning: {
          listResourceBindings: jest.fn().mockResolvedValue([])
        }
      }
    });

    expect(result.data.components).toEqual([expect.objectContaining({
      name: 'aliyun-sls',
      type: 'logService',
      active: true
    })]);
  });

  test('resource-bind saves learned business bindings', async () => {
    const saveResourceBinding = jest.fn().mockImplementation(async (binding) => ({
      id: 'bind-1',
      ...binding
    }));
    const result = await resourceBind.execute(
      '绑定零售业务 mcp=yapi-mcp 地址=https://yapi.example.com token=secret project=retail',
      {
        flowmind: {
          learning: {
            learningPath: '/tmp/learning',
            expandPath: (value) => value,
            inferComponentType: jest.fn().mockReturnValue('apiDoc'),
            saveResourceBinding
          }
        }
      }
    );

    expect(result.type).toBe('result');
    expect(saveResourceBinding).toHaveBeenCalledWith(expect.objectContaining({
      business: '零售',
      componentType: 'apiDoc',
      provider: 'yapi',
      mcpServer: 'yapi-mcp'
    }), expect.any(Object));
    expect(result.data.binding.connection.address).toBe('https://yapi.example.com');
  });

  test('resource-bind infers workflow business labels from publish platform bindings', async () => {
    const saveResourceBinding = jest.fn().mockImplementation(async (binding) => ({
      id: 'bind-workflow-1',
      ...binding
    }));
    const result = await resourceBind.execute(
      '绑定发布平台 mcp=auto-flow token=secret env=uat',
      {
        flowmind: {
          learning: {
            learningPath: '/tmp/learning',
            expandPath: (value) => value,
            inferComponentType: jest.fn().mockReturnValue('workflow'),
            saveResourceBinding
          }
        }
      }
    );

    expect(result.type).toBe('result');
    expect(saveResourceBinding).toHaveBeenCalledWith(expect.objectContaining({
      business: '发布平台',
      aliases: expect.arrayContaining(['发布平台', 'uat']),
      componentType: 'workflow',
      provider: 'auto-flow',
      mcpServer: 'auto-flow'
    }), expect.any(Object));
    expect(result.data.binding.connection.env).toBe('uat');
  });

  test('resource-bind saves database query bindings with source id and schema', async () => {
    const saveResourceBinding = jest.fn().mockImplementation(async (binding) => ({
      id: 'bind-db-1',
      ...binding
    }));
    const result = await resourceBind.execute(
      '绑定商品搜索业务 mcp=db-redis-query source_id=00000000-0000-0000-0000-000000000001 project=demo-takeout-manager database=demo_search env=uat',
      {
        flowmind: {
          learning: {
            learningPath: '/tmp/learning',
            expandPath: (value) => value,
            inferComponentType: jest.fn().mockReturnValue('databaseQuery'),
            saveResourceBinding
          }
        }
      }
    );

    expect(result.type).toBe('result');
    expect(saveResourceBinding).toHaveBeenCalledWith(expect.objectContaining({
      business: '商品搜索',
      componentType: 'databaseQuery',
      provider: 'aliyun-rds-query',
      mcpServer: 'db-redis-query'
    }), expect.any(Object));
    expect(result.data.binding.connection.sourceId).toBe('00000000-0000-0000-0000-000000000001');
    expect(result.data.binding.connection.database).toBe('demo_search');
  });

  test('resource-bind surfaces source-derived project and env details', async () => {
    const result = await resourceBind.execute('查看 demo-content-search 的数据库状态', {
      sourceInference: {
        matched: true,
        project: 'demo-content-search',
        environment: 'uat',
        database: { database: 'uat-retail-search' },
        redis: { database: 1 },
        matchedEntries: [{ title: '搜索推荐词' }]
      },
      componentRegistry: {
        getStatus: () => ({})
      },
      flowmind: {
        learning: {
          matchResourceBinding: jest.fn().mockResolvedValue(null)
        }
      }
    });

    expect(result.data.inferredSource).toEqual(expect.objectContaining({
      project: 'demo-content-search',
      environment: 'uat',
      database: 'uat-retail-search'
    }));
  });

  test('aliyun-sls adapter normalizes ISO timestamps into integers for MCP queryLogs', () => {
    const adapter = new AliyunSlsAdapter({
      enabled: true,
      config: {
        endpoints: {
          test: 'cn-shenzhen.log.aliyuncs.com',
          uat: 'cn-shenzhen.log.aliyuncs.com'
        },
        envConfig: {
          test: {
            project: 'test-project',
            logstore: 'test-reg-log'
          },
          uat: {
            project: 'uat-project',
            logstore: 'uat-log'
          }
        }
      }
    });

    const queryParams = adapter.buildQueryParams({
      env: 'uat',
      project: 'k8s-log-cf93fe1dde8584346a2d81575c79aff9e',
      logstore: 'uat-log',
      query: 'level: ERROR and "商家基本盘检测整改校验任务失败"',
      from: '2026-07-01T16:00:00.000Z',
      to: '2026-07-02T09:29:15.165Z',
      line: 100
    });

    expect(queryParams).toEqual(expect.objectContaining({
      from: expect.any(Number),
      to: expect.any(Number),
      reverse: true,
      endpoint: 'cn-shenzhen.log.aliyuncs.com'
    }));
    expect(queryParams.from).toBe(1782921600);
    expect(queryParams.to).toBe(1782984555);
    expect(queryParams.project).toBe('k8s-log-cf93fe1dde8584346a2d81575c79aff9e');
    expect(queryParams.logstore).toBe('uat-log');
  });

  test('aliyun-sls adapter falls back to envConfig project and logstore when not provided', () => {
    const adapter = new AliyunSlsAdapter({
      enabled: true,
      config: {
        endpoints: {
          test: 'cn-shenzhen.log.aliyuncs.com',
          uat: 'cn-shenzhen.log.aliyuncs.com'
        },
        envConfig: {
          test: {
            project: 'test-project',
            logstore: 'test-reg-log'
          },
          uat: {
            project: 'uat-project',
            logstore: 'uat-log'
          }
        }
      }
    });

    const queryParams = adapter.buildQueryParams({
      env: 'test',
      query: 'level: ERROR and "商家基本盘检测整改校验任务失败"',
      from: '2026-07-01T16:00:00.000Z',
      to: '2026-07-02T09:29:15.165Z',
      line: 100
    });

    expect(queryParams).toEqual(expect.objectContaining({
      endpoint: 'cn-shenzhen.log.aliyuncs.com',
      project: 'test-project',
      logstore: 'test-reg-log',
      reverse: true
    }));
  });

  test('aliyun-sls adapter ignores mismatched learned binding when env is explicitly prod', () => {
    const adapter = new AliyunSlsAdapter({
      enabled: true,
      config: {
        endpoints: {
          test: 'cn-shenzhen.log.aliyuncs.com',
          uat: 'cn-shenzhen.log.aliyuncs.com',
          gray: 'cn-hongkong.log.aliyuncs.com',
          prod: 'cn-hongkong.log.aliyuncs.com'
        },
        envConfig: {
          uat: {
            project: 'uat-project',
            logstore: 'uat-log'
          },
          prod: {
            project: 'prod-project',
            logstore: 'prod-log'
          }
        }
      }
    });

    const queryParams = adapter.buildQueryParams({
      env: 'prod',
      query: "'4183' and app_name :'demo-business-promotion-kafka'",
      resourceBinding: {
        connection: {
          env: 'uat',
          endpoint: 'cn-shenzhen.log.aliyuncs.com',
          project: 'uat-project',
          logstore: 'uat-log'
        }
      }
    });

    expect(queryParams).toEqual(expect.objectContaining({
      endpoint: 'cn-hongkong.log.aliyuncs.com',
      project: 'prod-project',
      logstore: 'prod-log'
    }));
  });

  test('mcp adapter surfaces a binding hint when transport is missing', async () => {
    const adapter = new AliyunSlsAdapter({
      enabled: true,
      config: {
        endpoints: {
          test: 'cn-shenzhen.log.aliyuncs.com'
        }
      }
    });

    await expect(adapter.queryLogs({
      query: 'level: ERROR',
      from: 1,
      to: 2
    })).rejects.toMatchObject({
      code: 'MCP_TRANSPORT_MISSING',
      bindingHint: expect.objectContaining({
        kind: 'mcp-binding',
        serverName: 'sls-logs',
        suggestedCommand: expect.stringContaining('绑定资源')
      })
    });
  });

  test('learning-feedback records corrections through the injected flowmind context', async () => {
    const recordCorrection = jest.fn().mockResolvedValue({ id: 'learn-1' });
    const result = await learningFeedback.execute('不对，应该用表格格式', {
      flowmind: {
        learning: {
          detectCorrection: jest.fn().mockReturnValue({ summary: 'format' }),
          recordCorrection,
          detectPreference: jest.fn().mockReturnValue(null),
          detectSceneMapping: jest.fn().mockReturnValue(null)
        }
      },
      currentSkill: 'log-audit'
    });

    expect(result.type).toBe('learning');
    expect(recordCorrection).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      currentSkill: 'log-audit'
    }));
  });

  test('log-audit returns a configuration hint when no adapter is available', async () => {
    const result = await logAudit.execute('查询 traceId abc123 的日志', {});

    expect(result.type).toBe('error');
    expect(result.message).toMatch(/not configured/i);
    expect(result.data.bindingHint).toEqual(expect.objectContaining({
      suggestedCommand: expect.stringContaining('绑定日志')
    }));
  });

  test('log-audit executes through the adapter when one is configured', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => ({
      endpoint: 'cn-shenzhen.log.aliyuncs.com',
      ...params
    }));
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          logs: [{ message: 'hit' }]
        })
      }]
    });

    const result = await logAudit.execute('查询 traceId abc123 的日志', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      },
      skillConfig: {
        excludeInfrastructure: false
      }
    });

    expect(buildQueryParams).toHaveBeenCalled();
    expect(buildQueryParams.mock.calls[0][0]).toEqual(expect.objectContaining({
      excludeInfrastructure: false
    }));
    expect(queryLogs).toHaveBeenCalled();
    expect(result.data.execution).toEqual(expect.objectContaining({
      records: expect.any(Array)
    }));
  });

  test('log-audit persists resolved log bindings after successful queries', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });
    const saveResourceBinding = jest.fn().mockResolvedValue({ id: 'bind-log-1', business: 'log-test' });

    await logAudit.execute('在test环境查询下日志中今天 商家基本盘检测整改校验任务失败 project=explicit-project logstore=explicit-log', {
      flowmind: {
        learning: {
          saveResourceBinding
        }
      },
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(saveResourceBinding).toHaveBeenCalledWith(expect.objectContaining({
      componentType: 'logService',
      provider: 'aliyun-sls',
      connection: expect.objectContaining({
        project: 'explicit-project',
        logstore: 'explicit-log',
        env: 'test'
      })
    }), expect.objectContaining({
      currentSkill: 'log-audit'
    }));
  });

  test('log-audit omits binding hints when the query is already fully configured', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    const result = await logAudit.execute('在test环境查询下日志中今天 商家基本盘检测整改校验任务失败 project=explicit-project logstore=explicit-log', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(result.data.bindingHint).toBeNull();
  });

  test('aliyun-sls adapter fills a default last-hour time window', () => {
    const adapter = new AliyunSlsAdapter({
      enabled: true,
      config: {
        endpoints: {
          test: 'cn-shenzhen.log.aliyuncs.com'
        }
      }
    });

    const queryParams = adapter.buildQueryParams({
      env: 'test',
      project: 'k8s-log-cf93fe1dde8584346a2d81575c79aff9e',
      logstore: 'test_reg_log',
      query: 'level: ERROR'
    });

    expect(queryParams.from).toEqual(expect.any(Number));
    expect(queryParams.to).toEqual(expect.any(Number));
    expect(queryParams.from).toBeLessThan(queryParams.to);
  });

  test('log-audit prefers explicit user parameters over resource bindings', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute('在test环境查询下日志中今天 商家基本盘检测整改校验任务失败 project=explicit-project logstore=explicit-log', {
      resourceBinding: {
        id: 'bind-1',
        business: 'log-test',
        componentType: 'logService',
        provider: 'aliyun-sls',
        connection: {
          endpoint: 'https://binding-endpoint',
          project: 'binding-project',
          logstore: 'binding-log',
          env: 'uat'
        }
      },
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      }
    });

    const [queryInput] = buildQueryParams.mock.calls[0];
    expect(queryInput).toEqual(expect.objectContaining({
      env: 'test',
      project: 'explicit-project',
      logstore: 'explicit-log'
    }));
  });

  test('log-audit falls back to resource binding when explicit parameters are missing', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute("查询下日志中今天 '商家基本盘检测整改校验任务失败'", {
      resourceBinding: {
        id: 'bind-1',
        business: 'log-test',
        componentType: 'logService',
        provider: 'aliyun-sls',
        connection: {
          endpoint: 'https://binding-endpoint',
          project: 'binding-project',
          logstore: 'binding-log',
          env: 'test'
        }
      },
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      }
    });

    const [queryInput] = buildQueryParams.mock.calls[0];
    expect(queryInput).toEqual(expect.objectContaining({
      endpoint: 'https://binding-endpoint',
      project: 'binding-project',
      logstore: 'binding-log',
      env: 'test'
    }));
  });

  test('log-audit returns a structured error when MCP query fails', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockRejectedValue(new Error('MCP request failed for sls-logs: timeout'));

    const result = await logAudit.execute('在test环境查询下日志中今天 商家基本盘检测整改校验任务失败', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(result.type).toBe('error');
    expect(result.message).toContain('日志查询失败');
    expect(result.data).toEqual(expect.objectContaining({
      mcpError: expect.stringContaining('timeout'),
      bindingHint: expect.objectContaining({
        suggestedCommand: expect.stringContaining('绑定日志')
      })
    }));
  });

  test('log-audit extracts quoted Chinese text as keyword and shows no-records message', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 0,
          logs: []
        })
      }]
    });

    const result = await logAudit.execute("查询下日志，'商家基本盘检测整改校验任务失败' 是什么异常", {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('"商家基本盘检测整改校验任务失败"')
    }));
    expect(result.message).toMatch(/未找到符合關鍵字/);
    expect(result.data.noRecords).toBe(true);
    expect(result.data.execution).toEqual(expect.objectContaining({
      status: 'ok',
      total: 0,
      empty: true
    }));
    expect(result.data.execution.rawSummary).toEqual(expect.objectContaining({
      topLevelKeys: expect.arrayContaining(['status', 'total', 'logs']),
      hasContent: true
    }));
  });

  test('log-audit treats uat log queries with a colon suffix as env plus traceId', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute('查询uat日志：6727e6af908337f2', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'uat',
      traceId: '6727e6af908337f2',
      service: undefined,
      query: '* and "6727e6af908337f2"'
    }));
  });

  test('log-audit treats bare suffix trace ids as trace queries even with env and yesterday', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute('查询下uat中昨天的日志036b299bf54abb8b', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'uat',
      traceId: '036b299bf54abb8b',
      timeRange: 'yesterday',
      query: '* and "036b299bf54abb8b"'
    }));
  });

  test('log-audit parses pts structured env and logstore without treating them as service names', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute(
      'env=pts logstore=pts-log 查询当前最近5分钟 acme-takeout-restful-api 的请求耗时分布、慢请求Top、错误率80%左右原因；统计ERROR日志、HTTP状态码/业务错误码分布，判断是业务错误还是超时/降级/fallback/熔断',
      {
        componentRegistry: {
          getAdapter: () => ({
            providerName: 'aliyun-sls',
            buildQueryParams,
            queryLogs
          })
        }
      }
    );

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'pts',
      logstore: 'pts-log',
      service: undefined,
      level: 'ERROR',
      keyword: 'acme-takeout-restful-api',
      query: 'level: ERROR and "acme-takeout-restful-api"'
    }));
  });

  test('log-audit reuses a matching pts resource binding when env is explicit', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ status: 'ok', logs: [] }) }]
    });

    await logAudit.execute('查询 pts 环境最近5分钟压测错误日志', {
      resourceBinding: {
        id: 'bind-pts',
        connection: {
          env: 'pts',
          endpoint: 'pts-region.log.aliyuncs.com',
          project: 'pts-project',
          logstore: 'pts-logstore'
        }
      },
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'pts',
      project: 'pts-project',
      logstore: 'pts-logstore',
      endpoint: 'pts-region.log.aliyuncs.com'
    }));
  });

  test('log-audit unwraps nested SLS data.data arrays as real records', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
      text: JSON.stringify({
        data: {
          data: [
              {
                time: '2026-07-03 15:33:48.696',
                service: 'order-service',
                response: '2026-07-03 15:33:48.696 [order-service,trace-old]DEBUG POST /api/orders status=200 duration=128ms requestId=req-old order ok',
                traceId: 'trace-old',
                requestMethod: 'POST',
                requestUrl: '/api/orders'
              },
              {
                time: '2026-07-03 16:33:48.696',
                service: 'user-service',
                response: '2026-07-03 16:33:48.696 [user-service,trace-new]ERROR GET /api/users/1 status=500 duration=532ms requestId=req-new user fail',
                traceId: 'trace-new',
                requestMethod: 'GET',
                requestUrl: '/api/users/1'
              }
            ],
          meta: {
              count: 2,
              elapsedMillisecond: 114
            }
          },
          success: true
        })
      }]
    });

    const result = await logAudit.execute('查询uat环境中的日志：6727e6af908337f2', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(result.data.execution.total).toBe(2);
    expect(result.data.execution.records).toEqual([
      expect.objectContaining({
        time: '2026-07-03 16:33:48.696',
        service: 'user-service',
        api: '/api/users/1',
        result: '2026-07-03 16:33:48.696 [user-service,trace-new]ERROR GET /api/users/1 status=500 duration=532ms requestId=req-new user fail',
        fields: expect.objectContaining({
          traceId: 'trace-new',
          requestId: 'req-new',
          method: 'GET',
          requestMethod: 'GET',
          requestUrl: '/api/users/1',
          api: '/api/users/1',
          statusCode: '500',
          durationMs: 532
        })
      }),
      expect.objectContaining({
        time: '2026-07-03 15:33:48.696',
        service: 'order-service',
        api: '/api/orders',
        result: '2026-07-03 15:33:48.696 [order-service,trace-old]DEBUG POST /api/orders status=200 duration=128ms requestId=req-old order ok',
        fields: expect.objectContaining({
          traceId: 'trace-old',
          requestId: 'req-old',
          method: 'POST',
          requestMethod: 'POST',
          requestUrl: '/api/orders',
          api: '/api/orders',
          statusCode: '200',
          durationMs: 128
        })
      })
    ]);
    expect(result.data.noRecords).toBe(false);
  });

  test('log-audit extracts HTTP response body and prefers HTTP status over duration-like numbers', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{
            time: '2026-07-13 09:42:42.866',
            service: 'demo-takeout-restful-api',
            result:
              'Outgoing Response: 99d1a19ddc37760d\nDuration: 352 ms\nHTTP/1.1 200 OK\nConnection: keep-alive\nContent-Type: application/json; charset=UTF-8\n\n{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}'
          }]
        })
      }]
    });

    const result = await logAudit.execute('查询下uat今天的日志1a3ff66f4f063de4', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(result.data.execution.records[0]).toEqual(
      expect.objectContaining({
        fields: expect.objectContaining({
          statusCode: '200',
          durationMs: 352,
          responseSummary: '{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}'
        })
      })
    );
  });

  test('sls-log-audit reuses log-audit execution and returns the same execution contract', async () => {
    const slsLogAudit = require('../skills/sls-log-audit');
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{
            time: '2026-07-13 09:42:42.866',
            service: 'demo-takeout-restful-api',
            result: 'Outgoing Response: req\nDuration: 352 ms\nHTTP/1.1 200 OK\n\n{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}'
          }]
        })
      }]
    });

    const result = await slsLogAudit.execute('查询下uat今天的sls日志1a3ff66f4f063de4', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(result.skill).toBe('sls-log-audit');
    expect(result.data.execution.records[0]).toEqual(
      expect.objectContaining({
        fields: expect.objectContaining({
          statusCode: '200',
          responseSummary: '{"deliveryStatus":"OUTSIDE_VALID_AREA_SCOPE","storeId":"21527"}'
        })
      })
    );
  });

  test('log-audit extracts bracketed feign body lines as response summaries', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{
            time: '2026-07-13 09:41:24.749',
            service: 'demo-takeout-restful-api',
            result: '[BaseCommonConfigFeign#getConfig] {"storeIds":["20627"]}'
          }]
        })
      }]
    });

    const result = await logAudit.execute('查询下日志0d02c7dcffa04217', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(result.data.execution.records[0]).toEqual(
      expect.objectContaining({
        fields: expect.objectContaining({
          responseSummary: '{"storeIds":["20627"]}'
        })
      })
    );
  });

  test('log-audit parses test environment phrases into env-aware queries', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute("在test环境查询下日志中今天 '商家基本盘检测整改校验任务失败'", {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'test',
      query: expect.stringContaining('"商家基本盘检测整改校验任务失败"')
    }));
  });

  test('log-audit routes explicit SLS query fragments to prod without AI parsing', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{
            message: '4183 matched',
            app_name: 'demo-business-promotion-kafka'
          }]
        })
      }]
    });

    const result = await logAudit.execute("'4183' and app_name :'demo-business-promotion-kafka'查询线上环境，输出的日志内容", {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(logAudit.canHandle("'4183' and app_name :'demo-business-promotion-kafka'查询线上环境，输出的日志内容")).toBe(true);
    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'prod',
      service: 'demo-business-promotion-kafka',
      query: "'4183' and app_name :'demo-business-promotion-kafka'"
    }));
    expect(result.message).toContain("已执行日志查询：'4183' and app_name :'demo-business-promotion-kafka'");
  });

  test('log-audit prefers AI-extracted log params and falls back to parser for time range', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: '4183 matched' }]
        })
      }]
    });

    const result = await logAudit.execute('帮我看今天的日志输出', {
      env: 'prod',
      serviceName: 'demo-business-promotion-kafka',
      rawQuery: "'4183' and app_name :'demo-business-promotion-kafka'",
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'prod',
      service: 'demo-business-promotion-kafka',
      query: "'4183' and app_name :'demo-business-promotion-kafka'",
      from: expect.any(String),
      to: expect.any(String)
    }));
    expect(result.data.resolution.parameterSource).toBe('ai+parser');
  });

  test('log-audit does not reuse a mismatched uat binding when env is explicitly prod', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 0,
          logs: []
        })
      }]
    });

    await logAudit.execute("'4183' and app_name :'demo-business-promotion-kafka'查询线上环境，输出的日志内容", {
      resourceBinding: {
        id: 'sdd-sls-uat',
        business: '日志-uat',
        componentType: 'logService',
        provider: 'aliyun-sls',
        connection: {
          endpoint: 'cn-shenzhen.log.aliyuncs.com',
          project: 'k8s-log-cf93fe1dde8584346a2d81575c79aff9e',
          logstore: 'uat-log',
          env: 'uat'
        }
      },
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      env: 'prod',
      project: undefined,
      logstore: undefined,
      endpoint: undefined,
      query: "'4183' and app_name :'demo-business-promotion-kafka'"
    }));
  });

  test('log-audit extracts a natural language keyword even without quotes', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 0,
          logs: []
        })
      }]
    });

    await logAudit.execute('查询下日志，商家基本盘检测整改校验任务失败 是什么异常', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('"商家基本盘检测整改校验任务失败"')
    }));
  });

  test('log-audit extracts natural language level and time window for recent error logs', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'boom' }]
        })
      }]
    });

    await logAudit.execute('查询最近1小时的错误日志', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.stringContaining('level: ERROR'),
      from: expect.any(String),
      to: expect.any(String)
    }));
  });

  test('log-audit extracts natural language service and project names', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 1,
          logs: [{ message: 'hit' }]
        })
      }]
    });

    await logAudit.execute('查询 demo-content-search 项目的 demo-merchant 错误日志', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalled();
    const [queryInput] = buildQueryParams.mock.calls[0];
    expect(queryInput).toEqual(expect.objectContaining({
      project: 'demo-content-search',
      query: expect.stringContaining('service: demo-merchant')
    }));
    expect(queryInput.query).toContain('level: ERROR');
  });

  test('log-audit does not ask for time range when today is already present', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          status: 'ok',
          total: 0,
          data: []
        })
      }]
    });

    const result = await logAudit.execute("查询下日志中今天 '商家基本盘检测整改校验任务失败'", {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalledWith(expect.objectContaining({
      from: expect.any(String),
      to: expect.any(String)
    }));
    expect(result.message).toContain('放寬關鍵字');
    expect(result.message).not.toContain('時間範圍');
  });

  test('yapi-sync-interface executes search through the adapter with skill defaults', async () => {
    const searchApis = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          items: [{ _id: 'api-1', name: 'getUserList', method: 'GET' }],
          total: 1
        })
      }]
    });

    const result = await yapiSyncInterface.execute('yapi 搜索 关键词=用户', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'yapi',
          searchApis
        })
      },
      skillConfig: {
        defaultProjectId: 'retail-default',
        syncMode: 'merge'
      }
    });

    expect(searchApis).toHaveBeenCalledWith(expect.objectContaining({
      projectKeyword: 'retail-default',
      nameKeyword: '用户'
    }));
    expect(result.data.execution).toEqual(expect.objectContaining({
      action: 'search',
      total: 1,
      items: [expect.objectContaining({ name: 'getUserList', method: 'GET' })]
    }));
  });

  test('yapi-sync-interface imports an OpenAPI file through the adapter', async () => {
    const filePath = path.join(os.tmpdir(), 'flowmind-openapi-import.json');
    const fs = require('fs-extra');
    await fs.writeJson(filePath, { openapi: '3.0.0', paths: {} });
    const importSwagger = jest.fn().mockResolvedValue({ status: 'ok', runId: 'run-1' });

    try {
      const result = await yapiSyncInterface.execute(
        `导入 swagger path=${filePath} project=316 catid=99`,
        { componentRegistry: { getAdapter: () => ({ importSwagger }) } }
      );
      expect(importSwagger).toHaveBeenCalledWith('316', '99', expect.stringContaining('openapi'));
      expect(result.data.execution).toEqual(expect.objectContaining({ action: 'import', status: 'ok', runId: 'run-1' }));
    } finally {
      await fs.remove(filePath);
    }
  });

  test('yuque-sync-design executes document sync through the adapter with a concise summary', async () => {
    const filePath = path.join(os.tmpdir(), 'flowmind-design-sync-test.md');
    const fs = require('fs-extra');
    await fs.writeFile(filePath, '# New Feature\n\nBody content.');

    const createDoc = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({ id: 'doc-1', title: 'New Feature' })
      }]
    });

    try {
      const result = await yuqueSyncDesign.execute(`同步设计文档 path=${filePath}`, {
        componentRegistry: {
          getAdapter: () => ({
            providerName: 'yuque',
            createDoc
          })
        },
        skillConfig: {
          defaultRepo: 'team-docs',
          syncFormat: 'markdown',
          archiveAfterSync: true
        }
      });

      expect(createDoc).toHaveBeenCalledWith('team-docs', expect.objectContaining({
        slug: 'new-feature',
        title: 'New Feature',
        format: 'markdown'
      }));
      expect(result.data.execution).toEqual(expect.objectContaining({
        action: 'sync',
        id: 'doc-1'
      }));
      expect(result.data.args).toEqual(expect.objectContaining({
        namespace: 'team-docs',
        format: 'markdown',
        archiveAfterSync: true
      }));
    } finally {
      await fs.remove(filePath);
    }
  });

  test('data-logic-validation executes SQL through the direct query adapter with source inference', async () => {
    const queryExec = jest.fn().mockResolvedValue({
      ok: true,
      rows: [{ value: 1 }]
    });

    const result = await dataLogicValidation.execute('sql: select 1', {
      sourceInference: {
        matched: true,
        project: 'demo-content-search',
        environment: 'uat',
        database: {
          host: 'rm-test.mysql.rds.aliyuncs.com',
          port: 3306,
          database: 'uat-retail-search',
          username: 'uat_user',
          password: 'secret'
        },
        matchedEntries: [{ title: '搜索推荐词' }]
      },
      componentRegistry: {
        getAdapter: (type) => {
          if (type === 'databaseQuery') {
            return { providerName: 'aliyun-rds-query', queryExec };
          }
          return null;
        }
      },
      skillConfig: {
        database: { maxRows: 25 },
        redis: { scanCount: 17 }
      }
    });

    expect(queryExec).toHaveBeenCalledWith(expect.objectContaining({
      schema: 'uat-retail-search',
      sql: 'select 1',
      env: 'uat',
      host: 'rm-test.mysql.rds.aliyuncs.com',
      limit: 25
    }));
    expect(result.data.execution).toEqual(expect.objectContaining({
      ok: true
    }));
  });

  test('data-logic-validation infers SQL from a natural-language table query', async () => {
    const queryExec = jest.fn().mockResolvedValue({
      ok: true,
      rows: [{ id: 1 }]
    });

    const result = await dataLogicValidation.execute('查询uat商城的数据库config_settings表中的数据', {
      sourceInference: {
        matched: false,
        environment: 'uat'
      },
      resourceBinding: {
        business: '商品搜索',
        connection: {
          project: 'demo-takeout-manager',
          database: 'demo_search',
          sourceId: '00000000-0000-0000-0000-000000000001',
          env: 'uat'
        }
      },
      componentRegistry: {
        getAdapter: (type) => {
          if (type === 'databaseQuery') {
            return { providerName: 'aliyun-rds-query', queryExec };
          }
          return null;
        }
      }
    });

    expect(queryExec).toHaveBeenCalledWith(expect.objectContaining({
      source_id: '00000000-0000-0000-0000-000000000001',
      schema: 'demo_search',
      sql: 'select * from config_settings limit 20',
      env: 'uat'
    }));
    expect(result.type).toBe('result');
  });

  test('data-logic-validation executes Redis scan through the direct query adapter using skill config', async () => {
    const redisKeyGet = jest.fn().mockResolvedValue({
      ok: true,
      value: '{"demo":true}'
    });
    const redisScan = jest.fn().mockResolvedValue({
      ok: true,
      items: [{ key: 'store:1', value: 'demo' }]
    });

    const result = await dataLogicValidation.execute('redis key: store:*', {
      sourceInference: {
        matched: true,
        project: 'demo-content-search',
        environment: 'uat',
        redis: {
          host: 'r-test.redis.rds.aliyuncs.com',
          port: 6379,
          password: 'secret',
          database: 1
        },
        matchedEntries: [{ title: '搜索推荐词' }]
      },
      componentRegistry: {
        getAdapter: (type) => {
          if (type === 'databaseQuery') {
            return { providerName: 'aliyun-rds-query', redisKeyGet, redisScan };
          }
          return null;
        }
      },
      skillConfig: {
        database: { maxRows: 25 },
        redis: { scanCount: 17 }
      }
    });

    expect(redisScan).toHaveBeenCalledWith(expect.objectContaining({
      pattern: 'store:*',
      env: 'uat',
      host: 'r-test.redis.rds.aliyuncs.com',
      database: 1,
      count: 17
    }));
    expect(result.data.execution).toEqual(expect.objectContaining({
      ok: true
    }));
  });

  test('code-review applies global severity and custom rule settings', async () => {
    const fs = require('fs-extra');
    const filePath = path.join(os.tmpdir(), 'flowmind-code-review-test.js');
    await fs.writeFile(filePath, [
      'console.log("demo")',
      'eval("1+1")'
    ].join('\n'));

    try {
      const result = await codeReview.execute(`审查 ${filePath}`, {
        skillConfig: {
          security: {
            enabled: true,
            severity: ['HIGH']
          },
          quality: {
            enabled: false
          },
          customRules: [
            {
              name: 'demo-rule',
              pattern: 'console\\.log',
              severity: 'low',
              message: 'Remove console.log statements'
            }
          ]
        }
      });

      expect(result.data.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'Code Injection (eval)',
          severity: 'HIGH'
        }),
        expect.objectContaining({
          name: 'Remove console.log statements',
          severity: 'LOW',
          type: 'custom'
        })
      ]));
      expect(result.data.summary.high).toBe(1);
      expect(result.data.summary.low).toBe(1);
      expect(result.data.skillConfig.security.severity).toEqual(['HIGH']);
    } finally {
      await fs.remove(filePath);
    }
  });

  test('archive-change uses skill defaults for archive location and kept artifacts', async () => {
    const result = await archiveChange.execute('归档 feature-x', {
      skillConfig: {
        location: 'docs/archive',
        keepTests: false,
        keepArtifacts: false,
        generateSummary: true,
        updateChangelog: false
      }
    });

    expect(result.data.archiveDir).toContain('docs/archive');
    expect(result.data.structure).toEqual(expect.arrayContaining([
      'SUMMARY.md',
      'CHANGELOG.md'
    ]));
    expect(result.data.structure).not.toEqual(expect.arrayContaining(['TESTS.md', 'artifacts/']));
    expect(result.data.updateChangelog).toBe(false);
    expect(result.data.skillConfig.location).toBe('docs/archive');
  });

  test('archive-change materializes files only in execute mode', async () => {
    const fs = require('fs-extra');
    const sourceDir = path.join(os.tmpdir(), `flowmind-archive-source-${Date.now()}`);
    const archiveRoot = path.join(os.tmpdir(), `flowmind-archive-target-${Date.now()}`);
    await fs.ensureDir(sourceDir);
    await fs.writeFile(`${sourceDir}/README.md`, '# Demo');
    await fs.writeFile(`${sourceDir}/package.json`, '{}');
    await fs.writeFile(`${sourceDir}/SUMMARY.md`, '# Summary');

    try {
      const result = await archiveChange.execute(`归档 name=feature-x path=${sourceDir}`, {
        executionMode: 'execute',
        skillConfig: { location: archiveRoot, keepTests: false, keepArtifacts: false }
      });
      expect(result.data.execution.status).toBe('completed');
      expect(await fs.pathExists(`${archiveRoot}/feature-x/SUMMARY.md`)).toBe(true);
      expect(await fs.pathExists(`${archiveRoot}/feature-x/archive-manifest.json`)).toBe(true);
    } finally {
      await fs.remove(sourceDir);
      await fs.remove(archiveRoot);
    }
  });

  test('api-sync uses the global platform and connection defaults', async () => {
    const result = await apiSync.execute('同步 api', {
      skillConfig: {
        platform: 'swagger',
        connection: {
          host: 'https://swagger.example.com',
          projectId: '123'
        },
        options: {
          autoSync: false
        }
      }
    });

    expect(result.data.platform).toBe('swagger');
    expect(result.data.connection.host).toBe('https://swagger.example.com');
    expect(result.data.options.autoSync).toBe(false);
    expect(result.data.skillConfig.platform).toBe('swagger');
  });

  test('project-review respects global check toggles and thresholds', async () => {
    const fs = require('fs-extra');
    const tempDir = path.join(os.tmpdir(), 'flowmind-project-review');
    await fs.ensureDir(tempDir);
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: 'demo-project',
      version: '1.0.0'
    }, { spaces: 2 });

    try {
      const result = await projectReview.execute(`项目审查 ${tempDir}`, {
        skillConfig: {
          checks: {
            dependencies: true,
            security: false,
            quality: true,
            documentation: false
          },
          thresholds: {
            coverage: 90,
            complexity: 8
          }
        }
      });

      expect(result.data.checks.some((item) => item.name === 'No README.md')).toBe(false);
      expect(result.data.summary.thresholds.coverage).toBe(90);
      expect(result.data.skillConfig.checks.security).toBe(false);
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('auto-flow uses the configured workflow map path before falling back to defaults', async () => {
    const fs = require('fs-extra');
    const tempDir = path.join(os.tmpdir(), 'flowmind-auto-flow-map');
    await fs.ensureDir(tempDir);
    await fs.writeJson(path.join(tempDir, 'auto-flow-pipeline-map.json'), {
      'retail-manager': {
        uat: {
          pipelineName: 'uat-retail-manager',
          pipelineId: 918273
        }
      }
    }, { spaces: 2 });

    const startPipelineRun = jest.fn().mockResolvedValue({
      submitted: true,
      pipelineRunId: '900'
    });

    try {
      const result = await autoFlow.execute('自动部署 uat-retail-manager', {
        skillConfig: {
          workflows: {
            path: tempDir
          },
          execution: {
            parallel: false,
            maxConcurrent: 2,
            timeout: 1800
          },
          notifications: {
            onComplete: false
          }
        },
        componentRegistry: {
          getAdapter: () => ({
            providerName: 'auto-flow',
            mcpServer: 'auto-flow',
            startPipelineRun
          })
        }
      });

      expect(startPipelineRun).toHaveBeenCalledWith('918273');
      expect(result.data.skillConfig.workflows.path).toBe(tempDir);
      expect(result.data.execution.summary).toContain('Deployment submitted');
    } finally {
      await fs.remove(tempDir);
    }
  });

  test('yapi-sync-interface can reuse a learned binding without a configured adapter', async () => {
    const result = await yapiSyncInterface.execute('同步零售业务 yapi 项目 retail', {
      resourceBinding: {
        business: '零售',
        componentType: 'apiDoc',
        provider: 'yapi',
        connection: {
          project: 'retail',
          address: 'https://yapi.example.com'
        }
      }
    });

    expect(result.type).toBe('error');
    expect(result.data.binding).toEqual(expect.objectContaining({
      provider: 'yapi',
      business: '零售'
    }));
    expect(result.data).toEqual(expect.objectContaining({
      kind: 'missing-component',
      retryable: true
    }));
  });

  test('skill loader falls back to markdown triggers when a custom canHandle is too strict', async () => {
    const loader = new SkillLoader({
      get: jest.fn((key, fallbackValue) => fallbackValue)
    }, null);

    loader.skills.set('auto-flow', {
      name: 'auto-flow',
      definition: {
        triggers: ['自动化', 'workflow'],
        metadata: { category: 'automation' }
      },
      canHandle: jest.fn().mockReturnValue(false),
      execute: jest.fn()
    });

    const candidates = await loader.getCandidates('使用自动化部署技能，运行 retail-manager', {});

    expect(candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'auto-flow' })
    ]));
  });

  test('skill loader does not use a broad flow trigger after custom intent rejection', async () => {
    const loader = new SkillLoader({
      get: jest.fn((key, fallbackValue) => fallbackValue)
    }, null);

    loader.skills.set('auto-flow', {
      name: 'auto-flow',
      definition: { triggers: ['流程'], metadata: { category: 'automation' } },
      canHandle: jest.fn().mockReturnValue(false),
      execute: jest.fn()
    });

    const candidates = await loader.getCandidates('分析下当前合同校验额度的流程', {});

    expect(candidates).toEqual([]);
  });

  test('auto-flow resolves prefixed services to pipeline ids before starting deployment', async () => {
    const startPipelineRun = jest.fn().mockResolvedValue({
      submitted: true,
      pipelineRunId: '270'
    });

    const result = await autoFlow.execute(
      '自动部署uat-retail-takeout-manager',
      {
        componentRegistry: {
          getAdapter: () => ({
            providerName: 'auto-flow',
            mcpServer: 'auto-flow',
            startPipelineRun
          })
        },
        pipelineMap: {
          'retail-takeout-manager': {
            uat: {
              pipelineName: 'uat-retail-takeout-manager',
              pipelineId: 2436072
            }
          }
        }
      }
    );

    expect(startPipelineRun).toHaveBeenCalledWith('2436072');
    expect(result.message).toBe('Workflow status: deployment submitted');
    expect(result.data).toEqual(expect.objectContaining({
      status: 'submitted',
      mcpServer: 'auto-flow'
    }));
    expect(result.data.resolution).toEqual(expect.objectContaining({
      source: 'local-map',
      pipelineIds: ['2436072']
    }));
    expect(result.data.execution).toEqual(expect.objectContaining({
      action: 'deploy',
      status: 'submitted',
      pipelineId: '2436072',
      runId: '270'
    }));
    expect(result.data.execution.summary).toContain('Deployment submitted');
  });

  test('auto-flow refuses to deploy when the requested environment has no exact pipeline match', async () => {
    const startPipelineRun = jest.fn();

    const result = await autoFlow.execute(
      '自动部署 test-demo-merchant',
      {
        componentRegistry: {
          getAdapter: () => ({
            providerName: 'auto-flow',
            mcpServer: 'auto-flow',
            startPipelineRun
          })
        },
        pipelineMap: {
          'demo-merchant': {
            uat: {
              pipelineName: 'uat-demo-merchant',
              pipelineId: 987654
            }
          }
        }
      }
    );

    expect(startPipelineRun).not.toHaveBeenCalled();
    expect(result.type).toBe('error');
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/unable to resolve deployment target/i);
    expect(result.data).toEqual(expect.objectContaining({
      status: 'not_resolved',
      resolution: expect.objectContaining({
        source: 'not-resolved',
        serviceNames: ['demo-merchant'],
        environment: 'test'
      })
    }));
  });

  test('auto-flow falls back to remote checklist lookup when local pipeline map misses', async () => {
    const getCurrentIterate = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: '8.6'
        })
      }]
    });
    const listDeployChecklists = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: 1,
          data: [{
            fields: JSON.stringify({
              service: ['retail-manager', 'retail-takeout-manager'],
              pipeline: ['uat-retail-manager#@1853334', 'uat-retail-takeout-manager#@2436072']
            })
          }]
        })
      }]
    });
    const orderList = jest.fn().mockResolvedValue({ data: [] });
    const startPipelineRun = jest.fn().mockResolvedValue({ submitted: true });

    const result = await autoFlow.execute('自动部署 uat-retail-takeout-manager', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'auto-flow',
          mcpServer: 'auto-flow',
          getCurrentIterate,
          listDeployChecklists,
          orderList,
          startPipelineRun
        })
      },
      pipelineMap: {}
    });

    expect(getCurrentIterate).toHaveBeenCalled();
    expect(listDeployChecklists).toHaveBeenCalledWith(expect.objectContaining({
      pageNum: '1',
      pageSize: '200',
      iterate: '8.6'
    }));
    expect(startPipelineRun).toHaveBeenCalledWith('2436072');
    expect(result.data.resolution).toEqual(expect.objectContaining({
      source: 'deploy-checklists',
      pipelineIds: ['2436072']
    }));
    expect(result.data.execution).toEqual(expect.objectContaining({
      action: 'deploy',
      status: 'submitted'
    }));
  });

  test('auto-flow does not start a pipeline when remote checklist matches another service', async () => {
    const getCurrentIterate = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: '8.6'
        })
      }]
    });
    const listDeployChecklists = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: 1,
          data: [{
            fields: JSON.stringify({
              service: ['demo-data-center'],
              pipeline: ['uat-demo-data-center#@406']
            })
          }]
        })
      }]
    });
    const orderList = jest.fn().mockResolvedValue({ data: [] });
    const startPipelineRun = jest.fn();

    const result = await autoFlow.execute('自动部署 test-demo-merchant', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'auto-flow',
          mcpServer: 'auto-flow',
          getCurrentIterate,
          listDeployChecklists,
          orderList,
          startPipelineRun
        })
      },
      pipelineMap: {}
    });

    expect(getCurrentIterate).toHaveBeenCalled();
    expect(listDeployChecklists).toHaveBeenCalled();
    expect(startPipelineRun).not.toHaveBeenCalled();
    expect(result.type).toBe('error');
    expect(result.data.status).toBe('not_resolved');
    expect(result.data.resolution.source).toBe('not-resolved');
  });

  test('auto-flow ignores remote checklist entries when the pipeline descriptor does not match the requested service', async () => {
    const getCurrentIterate = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          name: '8.6'
        })
      }]
    });
    const listDeployChecklists = jest.fn().mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          total: 1,
          data: [{
            fields: JSON.stringify({
              service: ['demo-merchant', 'demo-data-center'],
              pipeline: ['uat-demo-data-center#@406', 'test-demo-merchant#@407']
            })
          }]
        })
      }]
    });
    const orderList = jest.fn().mockResolvedValue({ data: [] });
    const startPipelineRun = jest.fn();

    const result = await autoFlow.execute('自动部署 test-demo-merchant', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'auto-flow',
          mcpServer: 'auto-flow',
          getCurrentIterate,
          listDeployChecklists,
          orderList,
          startPipelineRun
        })
      },
      pipelineMap: {}
    });

    expect(getCurrentIterate).toHaveBeenCalled();
    expect(listDeployChecklists).toHaveBeenCalled();
    expect(startPipelineRun).toHaveBeenCalledWith('407');
    expect(result.data.resolution).toEqual(expect.objectContaining({
      source: 'deploy-checklists',
      pipelineIds: ['407']
    }));
  });

  test('auto-flow uses a learned workflow binding to call MCP directly when no adapter is registered', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { total: 1, data: [{ pipelineId: '2436072' }] }
      })
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock;

    try {
      const result = await autoFlow.execute('查看流程列表 uat-retail-takeout-manager', {
        resourceBinding: {
          business: '发布平台',
          componentType: 'workflow',
          provider: 'auto-flow',
          mcpServer: 'auto-flow',
          connection: {
            address: 'https://workflow.example.com/mcp',
            token: 'secret'
          }
        }
      });

      expect(fetchMock).toHaveBeenCalledWith('https://workflow.example.com/mcp', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer secret'
        })
      }));
      expect(result.data.execution).toEqual(expect.objectContaining({
        total: 1
      }));
      expect(result.data.execution.summary).toContain('Listed workflows');
      expect(result.data.execution.items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          pipelineId: '2436072'
        })
      ]));
      expect(result.data.mcpServer).toBe('auto-flow');
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('AutoFlowAdapter sends actual MCP JSON-RPC requests', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { submitted: true }
      })
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock;

    const adapter = new AutoFlowAdapter({
      transport: {
        url: 'https://example.com/mcp',
        headers: { mcp_token: 'secret' }
      }
    });
    await adapter.init();
    const response = await adapter.startBatchPipelineRun({ env: 'uat', services: ['retail-manager'] });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/mcp', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        mcp_token: 'secret'
      })
    }));
    expect(response).toEqual({ submitted: true });

    global.fetch = originalFetch;
  });

  test('AliyunRdsQueryAdapter sends actual MCP JSON-RPC requests', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { ok: true, rows: [{ value: 1 }] }
      })
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock;

    const adapter = new AliyunRdsQueryAdapter({
      transport: {
        url: 'https://example.com/mcp',
        headers: { mcp_token: 'secret' }
      }
    });
    await adapter.init();
    const response = await adapter.queryExec({ schema: 'demo', sql: 'select 1' });

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/mcp', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        mcp_token: 'secret'
      })
    }));
    expect(response).toEqual({ ok: true, rows: [{ value: 1 }] });

    global.fetch = originalFetch;
  });

  test('auto-flow returns a bind hint that includes a runnable workflow example', async () => {
    const result = await autoFlow.execute('部署xxx-', {});

    expect(result.type).toBe('error');
    expect(result.data.hint).toContain('flowmind "绑定发布业务 mcp=auto-flow token=xxx env=uat"');
    expect(result.data.execution).toEqual(expect.objectContaining({
      action: 'hint',
      configured: false
    }));
    expect(result.data).toEqual(expect.objectContaining({
      kind: 'missing-component',
      retryable: true
    }));
  });

  test('auto-flow does not claim resource binding commands', () => {
    expect(autoFlow.canHandle('绑定发布平台 mcp=auto-flow token=secret env=uat')).toBe(false);
  });

  test('auto-flow returns built-in workflow summaries as execution details', async () => {
    const result = await autoFlow.execute('workflow dev-workflow', {});

    expect(result.type).toBe('result');
    expect(result.message).toBe('Workflow ready: Development Workflow');
    expect(result.data.execution).toEqual(expect.objectContaining({
      action: 'workflow',
      workflow: 'dev-workflow',
      stepCount: 4
    }));
    expect(result.data.execution.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'review',
        skill: 'code-review'
      })
    ]));
  });

  test('FlowMind injects componentRegistry into live skill execution context', async () => {
    const fm = new FlowMind();
    fm.components = { sentinel: 'workflow-registry' };
    fm.learning = {
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      getPreferences: jest.fn().mockResolvedValue({})
    };
    fm.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };

    const skill = {
      name: 'test-skill',
      execute: jest.fn().mockImplementation(async (_input, context) => {
        expect(context.componentRegistry).toBe(fm.components);
        return { type: 'result', ok: true };
      })
    };

    const result = await fm.executeWithLearning(skill, 'test', {});

    expect(skill.execute).toHaveBeenCalled();
    expect(result).toEqual({ type: 'result', ok: true });
  });
});
