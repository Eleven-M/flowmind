const ComponentRegistry = require('../core/component-registry');
const learningFeedback = require('../skills/learning-feedback');
const logAudit = require('../skills/log-audit');
const resourceBind = require('../skills/resource-bind');

describe('skills and registry integration', () => {
  test('ComponentRegistry.getAll returns a flat provider list', () => {
    const registry = new ComponentRegistry({ get: jest.fn().mockReturnValue({}) });
    const adapter = {
      getStatus: jest.fn().mockReturnValue({
        provider: 'aliyun-sls',
        type: 'logService',
        enabled: true,
        initialized: true,
        mcpServer: 'friday-sls-logs'
      })
    };

    registry.register('logService', 'aliyun-sls', adapter);

    expect(registry.getAll()).toEqual([expect.objectContaining({
      name: 'aliyun-sls',
      type: 'logService',
      active: true,
      mcpServer: 'friday-sls-logs'
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
          mcpServer: 'friday-sls-logs'
        }]
      }
    });

    expect(result.data.components).toEqual([expect.objectContaining({
      name: 'aliyun-sls',
      type: 'logService',
      active: true
    })]);
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

    expect(result.type).toBe('result');
    expect(result.message).toMatch(/not configured/i);
  });

  test('log-audit executes through the adapter when one is configured', async () => {
    const buildQueryParams = jest.fn().mockImplementation((params) => ({
      endpoint: 'cn-shenzhen.log.aliyuncs.com',
      ...params
    }));
    const queryLogs = jest.fn().mockResolvedValue({
      mcpServer: 'friday-sls-logs',
      tool: 'queryLogs',
      params: { query: '* and "abc123"' }
    });

    const result = await logAudit.execute('查询 traceId abc123 的日志', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      }
    });

    expect(buildQueryParams).toHaveBeenCalled();
    expect(queryLogs).toHaveBeenCalled();
    expect(result.data.execution).toEqual(expect.objectContaining({
      mcpServer: 'friday-sls-logs',
      tool: 'queryLogs'
    }));
  });
});
