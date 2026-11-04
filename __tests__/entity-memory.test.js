const fs = require('fs-extra');
const os = require('os');
const path = require('path');

// Point auto-flow at an empty local pipeline map so entity memory is the
// only resolution source in the deploy tests below.
const autoFlowMapDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowmind-afmap-'));
process.env.FLOWMIND_AUTO_FLOW_MAP = path.join(autoFlowMapDir, 'empty-map.json');
fs.writeFileSync(process.env.FLOWMIND_AUTO_FLOW_MAP, '{}');

jest.mock('../core/mcp-http-client', () => ({
  callMcpTool: jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ status: 'ok', list: [] }) }]
  })
}));

const ConfigManager = require('../core/config-manager');
const EntityMemory = require('../core/entity-memory');
const { WriteQueue } = require('../core/learning-engine');
const autoFlow = require('../skills/auto-flow');
const { callMcpTool } = require('../core/mcp-http-client');
const { extractEntitiesFromResult } = require('../core/entity-extraction');

afterAll(() => {
  delete process.env.FLOWMIND_AUTO_FLOW_MAP;
  fs.removeSync(autoFlowMapDir);
});

describe('entity memory', () => {
  const originalDirectWrite = process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
  let tempHome;

  beforeEach(async () => {
    tempHome = path.join(os.tmpdir(), `flowmind-entity-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;
    process.env.FLOWMIND_LEARNING_DIRECT_WRITE = '1';
  });

  afterEach(async () => {
    if (originalDirectWrite === undefined) {
      delete process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
    } else {
      process.env.FLOWMIND_LEARNING_DIRECT_WRITE = originalDirectWrite;
    }
    delete process.env.FLOWMIND_HOME;
    await fs.remove(tempHome);
  });

  async function freshMemory(options = {}) {
    const config = new ConfigManager();
    await config.load();
    const memory = new EntityMemory(config, new WriteQueue(), options);
    await memory.init();
    return memory;
  }

  function entitiesPath() {
    return path.join(tempHome, '.flowmind', 'learning', 'entities.json');
  }

  test('persists entities to disk with the documented schema', async () => {
    const memory = await freshMemory();
    await memory.recordEntities(
      [
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'uat',
          attributes: { pipelineIds: ['12345'], pipelineName: 'uat-acme-takeout' }
        }
      ],
      'auto-flow'
    );

    const persisted = await fs.readJson(entitiesPath());
    expect(persisted.version).toBe('1.0');
    expect(persisted.lastUpdated).toEqual(expect.any(String));
    expect(persisted.entities).toHaveLength(1);
    expect(persisted.entities[0]).toEqual(
      expect.objectContaining({
        id: 'service|acme-takeout|uat',
        type: 'service',
        name: 'acme-takeout',
        env: 'uat',
        sources: ['auto-flow']
      })
    );
    expect(persisted.entities[0].attributes).toEqual({
      pipelineIds: ['12345'],
      pipelineName: 'uat-acme-takeout'
    });
    expect(persisted.entities[0].stats).toEqual(
      expect.objectContaining({ seenCount: 1, firstSeen: expect.any(String), lastSeen: expect.any(String) })
    );
  });

  test('merges duplicates by type|name|env and keeps different envs apart', async () => {
    const memory = await freshMemory();

    await memory.recordEntities(
      [
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'uat',
          attributes: { pipelineIds: ['1'], pipelineName: 'uat-acme-takeout' }
        }
      ],
      'auto-flow'
    );
    await memory.recordEntities(
      [
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'uat',
          attributes: { pipelineIds: ['2'], logstore: 'uat_reg_log' }
        },
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'test',
          attributes: { pipelineIds: ['3'] }
        }
      ],
      'log-audit'
    );

    expect(memory.store.entities).toHaveLength(2);

    const uat = memory.store.entities.find((entity) => entity.id === 'service|acme-takeout|uat');
    expect(uat.stats.seenCount).toBe(2);
    expect(uat.attributes).toEqual({ pipelineIds: ['2'], pipelineName: 'uat-acme-takeout', logstore: 'uat_reg_log' });
    expect(uat.sources.sort()).toEqual(['auto-flow', 'log-audit']);

    const test = memory.store.entities.find((entity) => entity.id === 'service|acme-takeout|test');
    expect(test.stats.seenCount).toBe(1);
  });

  test('enforces FIFO cap with traces evicted first', async () => {
    const memory = await freshMemory({ maxEntities: 5 });

    const batch = [];
    for (let i = 0; i < 4; i++) {
      batch.push({ type: 'service', name: `service-${i}`, env: null, attributes: { index: i } });
    }
    await memory.recordEntities(batch, 'auto-flow');

    // Traces added later should still be evicted before the older services.
    await memory.recordEntities(
      [
        { type: 'trace', name: 'trace-old', env: null, attributes: {} },
        { type: 'trace', name: 'trace-new', env: null, attributes: {} }
      ],
      'log-audit'
    );

    expect(memory.store.entities).toHaveLength(5);
    const names = memory.store.entities.map((entity) => entity.name);
    expect(names).not.toContain('trace-old');
    expect(names).toContain('trace-new');
    expect(names).toContain('service-0');
    expect(names).toContain('service-3');
  });

  test('caps total entities at 500 by default', async () => {
    const memory = await freshMemory();
    const batch = [];
    for (let i = 0; i < 520; i++) {
      batch.push({ type: 'service', name: `svc-${i}`, env: null, attributes: {} });
    }
    await memory.recordEntities(batch, 'auto-flow');

    expect(memory.store.entities).toHaveLength(500);
    expect(memory.store.entities.some((entity) => entity.name === 'svc-0')).toBe(false);
    expect(memory.store.entities.some((entity) => entity.name === 'svc-519')).toBe(true);
  });

  test('searchEntities scores includes, bigram, and pipelineName matches', async () => {
    const memory = await freshMemory();
    await memory.recordEntities(
      [
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'uat',
          attributes: { pipelineName: 'uat-acme-takeout', pipelineIds: ['9'] }
        },
        {
          type: 'service',
          name: 'merchant-backend',
          env: null,
          attributes: {}
        },
        {
          type: 'service',
          name: 'unrelated-thing',
          env: null,
          attributes: {}
        }
      ],
      'auto-flow'
    );

    const includesHits = memory.searchEntities('列出 acme-takeout 的流水线');
    expect(includesHits[0]).toEqual(expect.objectContaining({ name: 'acme-takeout', score: expect.any(Number) }));

    // Bigram path: typo'd input that still shares most character pairs.
    const bigramHits = memory.searchEntities('查一下 acme-takeuot 的日志');
    expect(bigramHits.map((hit) => hit.name)).toContain('acme-takeout');

    expect(memory.searchEntities('完全无关的词汇')).toEqual([]);
  });

  test('preserves higher-confidence attributes and expires stale entities', async () => {
    const memory = await freshMemory({ entityTtlMs: 10 });
    await memory.recordEntities([
      {
        type: 'service',
        name: 'confidence-service',
        env: 'uat',
        confidence: 0.9,
        attributes: { endpoint: 'trusted.example' }
      }
    ], 'auto-flow');
    await memory.recordEntities([
      {
        type: 'service',
        name: 'confidence-service',
        env: 'uat',
        confidence: 0.2,
        attributes: { endpoint: 'weak.example' }
      }
    ], 'log-audit');

    const entity = memory.store.entities[0];
    expect(entity.attributes.endpoint).toBe('trusted.example');
    expect(entity.observations).toHaveLength(2);
    entity.expiresAt = new Date(Date.now() - 1).toISOString();
    expect(memory.searchEntities('confidence-service')).toHaveLength(0);
  });

  test('handles 20 concurrent recordEntities without corruption', async () => {
    const memory = await freshMemory();

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        memory.recordEntities(
          [
            {
              type: 'service',
              name: 'acme-takeout',
              env: 'uat',
              attributes: { pipelineIds: [String(i)] }
            }
          ],
          'auto-flow'
        )
      )
    );

    expect(memory.store.entities).toHaveLength(1);
    expect(memory.store.entities[0].stats.seenCount).toBe(20);
    expect(memory.store.entities[0].attributes.pipelineIds).toEqual([expect.any(String)]);

    const persisted = await fs.readJson(entitiesPath());
    expect(persisted.entities).toHaveLength(1);
    expect(persisted.entities[0].stats.seenCount).toBe(20);
  });

  test('flush persists the latest state in throttled mode', async () => {
    delete process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
    const memory = await freshMemory({ persistThrottleMs: 60000 });
    expect(memory.persistThrottleMs).toBe(60000);

    await memory.recordEntities(
      [{ type: 'service', name: 'acme-takeout', env: 'uat', attributes: { pipelineIds: ['7'] } }],
      'auto-flow'
    );

    // Debounced mode: nothing on disk until flush.
    expect(await fs.pathExists(entitiesPath())).toBe(false);

    await memory.flush();
    const persisted = await fs.readJson(entitiesPath());
    expect(persisted.entities).toHaveLength(1);
    expect(persisted.entities[0].name).toBe('acme-takeout');
  });

  test('reloads persisted entities on init', async () => {
    const memory = await freshMemory();
    await memory.recordEntities(
      [{ type: 'service', name: 'acme-takeout', env: 'uat', attributes: { pipelineIds: ['7'] } }],
      'auto-flow'
    );

    const config = new ConfigManager();
    await config.load();
    const reloaded = new EntityMemory(config, null, {});
    await reloaded.init();

    expect(reloaded.store.entities).toHaveLength(1);
    expect(reloaded.searchEntities('acme-takeout')[0]).toEqual(
      expect.objectContaining({ name: 'acme-takeout', env: 'uat' })
    );
  });
});

describe('extractEntitiesFromResult', () => {
  test('extracts service entities from auto-flow deploy resolution', () => {
    const result = {
      type: 'result',
      skill: 'auto-flow',
      data: {
        action: 'deploy',
        provider: 'auto',
        resolution: {
          source: 'local-map',
          pipelineIds: ['1001'],
          services: [
            {
              source: 'local-map',
              serviceName: 'acme-takeout',
              environment: 'uat',
              pipelineId: '1001',
              pipelineName: 'uat-acme-takeout'
            }
          ]
        }
      }
    };

    const entities = extractEntitiesFromResult(result, 'auto-flow');
    expect(entities).toEqual([
      {
        type: 'service',
        name: 'acme-takeout',
        env: 'uat',
        attributes: { pipelineIds: ['1001'], pipelineName: 'uat-acme-takeout' }
      }
    ]);
  });

  test('extracts service entities from auto-flow list execution items', () => {
    const result = {
      type: 'result',
      skill: 'auto-flow',
      data: {
        action: 'list',
        provider: 'auto',
        execution: {
          action: 'list',
          items: [
            { pipelineName: 'uat-acme-takeout', pipelineId: 2001, service: null, env: null },
            { pipelineName: 'prod-acme-takeout', pipelineId: 2002, service: null, env: null },
            { pipelineName: 'no-env-prefix', pipelineId: null }
          ]
        }
      }
    };

    const entities = extractEntitiesFromResult(result, 'auto-flow');
    expect(entities).toEqual([
      {
        type: 'service',
        name: 'acme-takeout',
        env: 'uat',
        attributes: { pipelineIds: ['2001'], pipelineName: 'uat-acme-takeout' }
      },
      {
        type: 'service',
        name: 'acme-takeout',
        env: 'prod',
        attributes: { pipelineIds: ['2002'], pipelineName: 'prod-acme-takeout' }
      }
    ]);
  });

  test('extracts trace and service entities from log-audit results', () => {
    const result = {
      type: 'result',
      skill: 'log-audit',
      data: {
        action: 'trace',
        provider: 'aliyun-sls',
        queryParams: {
          traceId: '96a8f1cd42b4eed9',
          service: 'acme-takeout',
          query: '* and "96a8f1cd42b4eed9"'
        },
        resolution: {
          env: 'uat',
          endpoint: 'cn-shenzhen.log.aliyuncs.com',
          project: 'k8s-log-uat',
          logstore: 'uat_reg_log'
        }
      }
    };

    const entities = extractEntitiesFromResult(result, 'log-audit');
    const trace = entities.find((entity) => entity.type === 'trace');
    const service = entities.find((entity) => entity.type === 'service');

    expect(trace).toEqual({
      type: 'trace',
      name: '96a8f1cd42b4eed9',
      env: 'uat',
      attributes: { service: 'acme-takeout', project: 'k8s-log-uat' }
    });
    expect(service).toEqual({
      type: 'service',
      name: 'acme-takeout',
      env: 'uat',
      attributes: {
        logstore: 'uat_reg_log',
        endpoint: 'cn-shenzhen.log.aliyuncs.com',
        project: 'k8s-log-uat'
      }
    });
  });

  test('recovers traceId from the query string when the field is absent', () => {
    const result = {
      type: 'result',
      skill: 'log-audit',
      data: {
        queryParams: { query: '* and "0af7c9b2e1d84f01"' },
        resolution: { env: null, project: 'p', logstore: 'l' }
      }
    };

    const entities = extractEntitiesFromResult(result, 'log-audit');
    expect(entities.some((entity) => entity.type === 'trace' && entity.name === '0af7c9b2e1d84f01')).toBe(true);
  });

  test('returns empty for unknown skills or empty results', () => {
    expect(extractEntitiesFromResult({ type: 'result', data: { ok: true } }, 'code-review')).toEqual([]);
    expect(extractEntitiesFromResult(null, 'auto-flow')).toEqual([]);
    expect(extractEntitiesFromResult({ data: { resolution: {} } }, 'auto-flow')).toEqual([]);
  });
});

describe('auto-flow consumes entity memory for pipeline resolution', () => {
  function buildContext(relatedEntities) {
    return {
      onProgress: jest.fn(),
      relatedEntities,
      resourceBinding: {
        componentType: 'workflow',
        provider: 'friday-flow',
        mcpServer: 'friday-auto-flow',
        connection: {
          url: 'https://gateway.example.com/auto/flow/mcp',
          token: 'test-token'
        }
      },
      flowmind: {
        config: {
          get: (key, fallback) => fallback
        }
      }
    };
  }

  beforeEach(() => {
    callMcpTool.mockClear();
  });

  test('resolves pipelines through relatedEntities with source entity-memory', async () => {
    const context = buildContext([
      {
        type: 'service',
        name: 'retail-manager',
        env: 'uat',
        attributes: {
          pipelineIds: ['8888'],
          pipelineName: 'uat-retail-manager'
        }
      }
    ]);

    const result = await autoFlow.execute('部署 uat-retail-manager', context);

    expect(result.type).toBe('result');
    expect(result.data.resolution).toEqual(
      expect.objectContaining({
        source: 'entity-memory',
        pipelineIds: ['8888']
      })
    );
  });

  test('ignores entity memory when the environment does not match', async () => {
    const context = buildContext([
      {
        type: 'service',
        name: 'retail-manager',
        env: 'prod',
        attributes: {
          pipelineIds: ['9999'],
          pipelineName: 'prod-retail-manager'
        }
      }
    ]);

    const result = await autoFlow.execute('部署 uat-retail-manager', context);

    // Falls through to the (empty) remote lookup instead of the wrong env.
    expect(result.data.resolution?.source).not.toBe('entity-memory');
  });
});

describe('log-audit consumes entity memory for SLS resolution', () => {
  test('fills project/logstore/endpoint from a matching service entity', async () => {
    const logAudit = require('../skills/log-audit');
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ logs: [] }) }]
    });

    const result = await logAudit.execute('查询uat环境 acme-takeout 服务的日志', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          mcpServer: 'sls-logs',
          buildQueryParams,
          queryLogs
        })
      },
      relatedEntities: [
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'uat',
          attributes: {
            project: 'k8s-log-uat',
            logstore: 'uat_reg_log',
            endpoint: 'cn-shenzhen.log.aliyuncs.com'
          }
        }
      ]
    });

    expect(result.type).toBe('result');
    expect(buildQueryParams).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'k8s-log-uat',
        logstore: 'uat_reg_log',
        endpoint: 'cn-shenzhen.log.aliyuncs.com',
        env: 'uat'
      })
    );
  });

  test('does not use an entity from a different environment', async () => {
    const logAudit = require('../skills/log-audit');
    const buildQueryParams = jest.fn().mockImplementation((params) => params);
    const queryLogs = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({ logs: [] }) }]
    });

    await logAudit.execute('查询uat环境 acme-takeout 服务的日志', {
      componentRegistry: {
        getAdapter: () => ({
          providerName: 'aliyun-sls',
          buildQueryParams,
          queryLogs
        })
      },
      relatedEntities: [
        {
          type: 'service',
          name: 'acme-takeout',
          env: 'prod',
          attributes: {
            project: 'k8s-log-prod',
            logstore: 'prod_reg_log'
          }
        }
      ]
    });

    expect(buildQueryParams).toHaveBeenCalledWith(
      expect.objectContaining({ project: undefined, logstore: undefined })
    );
  });
});
