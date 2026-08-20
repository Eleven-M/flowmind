/**
 * Tests for skill error wrapping (Item 2).
 * Verifies that skills with wrapSkillCall return structured errors
 * instead of throwing when underlying MCP/filesystem calls fail.
 */
const knowledgeOps = require('../skills/knowledge-ops');
const reportInsights = require('../skills/report-insights');
const resourceBind = require('../skills/resource-bind');
const yapiSyncInterface = require('../skills/yapi-sync-interface');
const yuqueSyncDesign = require('../skills/yuque-sync-design');
const { wrapSkillCall, isRetryableError } = require('../core/skill-error-wrapper');

describe('skill error wrapping', () => {
  describe('isRetryableError', () => {
    test('MCP_TIMEOUT is retryable', () => {
      const error = new Error('timeout');
      error.code = 'MCP_TIMEOUT';
      expect(isRetryableError(error)).toBe(true);
    });

    test('MCP_NETWORK_ERROR is retryable', () => {
      const error = new Error('network');
      error.code = 'MCP_NETWORK_ERROR';
      expect(isRetryableError(error)).toBe(true);
    });

    test('MCP_RATE_LIMIT is retryable', () => {
      const error = new Error('rate limited');
      error.code = 'MCP_RATE_LIMIT';
      expect(isRetryableError(error)).toBe(true);
    });

    test('MCP_HTTP_5XX is retryable', () => {
      const error = new Error('server error');
      error.code = 'MCP_HTTP_5XX';
      expect(isRetryableError(error)).toBe(true);
    });

    test('MCP_TOOL_CALL_FAILED is NOT retryable', () => {
      const error = new Error('tool failed');
      error.code = 'MCP_TOOL_CALL_FAILED';
      expect(isRetryableError(error)).toBe(false);
    });

    test('TypeError is retryable (fetch network failure)', () => {
      expect(isRetryableError(new TypeError('fetch failed'))).toBe(true);
    });
  });

  describe('wrapSkillCall', () => {
    test('passes through successful results', async () => {
      const result = await wrapSkillCall('test-skill', 'input', async () => ({
        type: 'result',
        success: true
      }));
      expect(result.success).toBe(true);
    });

    test('catches error and returns structured skill error', async () => {
      const result = await wrapSkillCall('test-skill', 'input', async () => {
        throw new Error('connection refused');
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
      expect(result.skill).toBe('test-skill');
      expect(result.message).toContain('connection refused');
      expect(result.data.error).toBe('connection refused');
    });

    test('marks transient errors as retryable', async () => {
      const result = await wrapSkillCall('test-skill', 'input', async () => {
        const error = new Error('timed out');
        error.code = 'MCP_TIMEOUT';
        throw error;
      }, { action: 'Test op' });
      expect(result.type).toBe('error');
      expect(result.data.retryable).toBe(true);
      expect(result.data.errorCode).toBe('MCP_TIMEOUT');
    });

    test('marks MCP business errors as not retryable', async () => {
      const result = await wrapSkillCall('test-skill', 'input', async () => {
        const error = new Error('tool not found');
        error.code = 'MCP_TOOL_CALL_FAILED';
        throw error;
      });
      expect(result.data.retryable).toBe(false);
    });

    test('preserves bindingHint from error', async () => {
      const result = await wrapSkillCall('test-skill', 'input', async () => {
        const error = new Error('not configured');
        error.code = 'MCP_TRANSPORT_MISSING';
        error.bindingHint = { kind: 'mcp-binding', message: 'Configure MCP first' };
        throw error;
      });
      expect(result.data.bindingHint).toEqual(expect.objectContaining({
        kind: 'mcp-binding'
      }));
    });
  });

  describe('knowledge-ops error handling', () => {
    test('search catches MCP network error and returns structured error', async () => {
      const result = await knowledgeOps.execute('搜索知识 keyword=test', {
        componentRegistry: {
          getAdapter: () => ({
            search: jest.fn().mockRejectedValue(new TypeError('fetch failed'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
      expect(result.skill).toBe('knowledge-ops');
      expect(result.data.error).toContain('fetch failed');
    });

    test('list catches adapter error and returns structured error', async () => {
      const result = await knowledgeOps.execute('知识库列表', {
        componentRegistry: {
          getAdapter: () => ({
            getRepos: jest.fn().mockRejectedValue(new Error('server returned 503'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
    });
  });

  describe('report-insights error handling', () => {
    test('query catches adapter error', async () => {
      const result = await reportInsights.execute('构建报告 job=myapp', {
        componentRegistry: {
          getAdapter: () => ({
            listBuilds: jest.fn().mockRejectedValue(new Error('connection reset'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
      expect(result.data.error).toContain('connection reset');
    });

    test('coverage query catches adapter error', async () => {
      const result = await reportInsights.execute('覆盖率报告', {
        componentRegistry: {
          getAdapter: () => ({
            listJacocoReports: jest.fn().mockRejectedValue(new TypeError('ECONNREFUSED'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.data.retryable).toBe(true);
    });
  });

  describe('resource-bind error handling', () => {
    test('list catches learning error', async () => {
      const result = await resourceBind.execute('列表资源', {
        componentRegistry: {
          getAll: () => []
        },
        flowmind: {
          learning: {
            listResourceBindings: jest.fn().mockRejectedValue(new Error('disk read failed'))
          }
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
    });

    test('status catches matchResourceBinding error', async () => {
      const result = await resourceBind.execute('资源状态', {
        componentRegistry: {
          getStatus: () => ({})
        },
        flowmind: {
          learning: {
            matchResourceBinding: jest.fn().mockRejectedValue(new TypeError('network down'))
          }
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
      expect(result.data.retryable).toBe(true);
    });

    test('bind catches saveResourceBinding error', async () => {
      const result = await resourceBind.execute('绑定零售业务 mcp=yapi-mcp', {
        flowmind: {
          learning: {
            learningPath: '/tmp/learning',
            expandPath: (value) => value,
            inferComponentType: jest.fn().mockReturnValue('apiDoc'),
            saveResourceBinding: jest.fn().mockRejectedValue(new Error('write lock conflict'))
          }
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
    });
  });

  describe('yapi-sync-interface error handling', () => {
    test('search catches adapter error', async () => {
      const result = await yapiSyncInterface.execute('搜索yapi keyword=user', {
        componentRegistry: {
          getAdapter: () => ({
            searchApis: jest.fn().mockRejectedValue(new Error('yapi gateway 502'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
    });

    test('export catches adapter error', async () => {
      const result = await yapiSyncInterface.execute('导出yapi project=123', {
        componentRegistry: {
          getAdapter: () => ({
            exportProject: jest.fn().mockRejectedValue(new TypeError('socket hang up'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.data.retryable).toBe(true);
    });
  });

  describe('yuque-sync-design error handling', () => {
    test('search catches adapter error', async () => {
      const result = await yuqueSyncDesign.execute('搜索yuque keyword=design', {
        componentRegistry: {
          getAdapter: () => ({
            search: jest.fn().mockRejectedValue(new Error('yuque 503'))
          })
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
    });
  });
});
