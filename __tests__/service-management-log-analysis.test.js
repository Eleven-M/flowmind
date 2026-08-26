const skill = require('../skills/service-management-log-analysis');

describe('service-management-log-analysis skill', () => {
  test('matches project-specific service management log requests', () => {
    expect(skill.canHandle('查询服务管理日志 商户后台日志 资源名称=POI管理 操作内容=编辑')).toBe(true);
    expect(skill.canHandle('查询 门店23387是什么时候设置POI显示的')).toBe(true);
    expect(skill.canHandle('查询 门店：23387 今日什么时候设置POI显示')).toBe(true);
    expect(skill.canHandle('查询普通 SLS 日志')).toBe(false);
  });

  test('parses store id and POI display operation from natural project query', async () => {
    const result = await skill.execute('查询 门店23387是什么时候设置POI显示的', {
      preferences: sampleConfig()
    });

    expect(result.type).toBe('result');
    expect(result.data.params).toEqual(expect.objectContaining({
      storeId: '23387',
      keyword: '23387',
      operationContent: 'POI显示'
    }));
    expect(result.data.executionPlan.filters).toEqual(expect.objectContaining({
      storeId: '23387',
      keyword: '23387',
      operationContent: 'POI显示'
    }));
  });

  test('parses merchant operation log query with store id, today and product keyword', async () => {
    const result = await skill.execute('查询 门店：27994 今日的商户操作日志中商品的有什么', {
      preferences: sampleConfig()
    });

    expect(result.type).toBe('result');
    expect(result.data.params).toEqual(expect.objectContaining({
      source: 'merchantBackendLog',
      storeId: '27994',
      keyword: '27994',
      resourceName: '商品',
      entityType: 'product',
      timeRange: 'today'
    }));
    expect(result.data.executionPlan.filters).toEqual(expect.objectContaining({
      storeId: '27994',
      keyword: '27994',
      entityType: 'product'
    }));
    expect(result.data.executionPlan.filters.resourceName).toBeNull();
    expect(result.data.executionPlan.filters.from).toMatch(/\d{4}-\d{2}-\d{2} 00:00:00/);
    expect(result.data.executionPlan.filters.to).toMatch(/\d{4}-\d{2}-\d{2} 23:59:59/);
  });

  test('builds a read-only plan when no browser executor is configured', async () => {
    const result = await skill.execute('查询商户后台日志 资源名称=POI管理 操作内容=编辑 limit=20', {
      preferences: sampleConfig()
    });

    expect(result.type).toBe('result');
    expect(result.data.mode).toBe('plan-only');
    expect(result.data.target).toEqual(expect.objectContaining({
      key: 'merchantBackendLog',
      hasApi: true
    }));
    expect(result.data.executionPlan).toEqual(expect.objectContaining({
      readonly: true,
      auth: 'reuse-logged-in-browser-session',
      mode: 'api'
    }));
    expect(result.data.executionPlan.filters).toEqual(expect.objectContaining({
      resourceName: 'POI管理',
      operationContent: '编辑',
      limit: 20
    }));
  });

  test('uses injected executor and summarizes resource and operation fields', async () => {
    const queryLogs = jest.fn().mockResolvedValue({
      records: [
        {
          资源名称: 'POI管理',
          操作内容: '编辑门店',
          操作人: '梁贤',
          IP: '10.0.0.1',
          返回参数: { success: true }
        },
        {
          resourceName: 'POI管理',
          operationContent: '编辑门店失败',
          operator: '梁贤',
          ip: '10.0.0.2',
          responseParams: { error: 'failed' }
        }
      ],
      pageInfo: { total: 2, pages: 1 }
    });

    const result = await skill.execute('查询商户后台日志 资源名称=POI管理 操作内容=编辑', {
      preferences: sampleConfig(),
      serviceManagementLogClient: { queryLogs }
    });

    expect(queryLogs).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'api',
      target: expect.objectContaining({ key: 'merchantBackendLog' }),
      params: expect.objectContaining({ resourceName: 'POI管理', operationContent: '编辑' })
    }));
    expect(result.type).toBe('result');
    expect(result.data.analysis).toEqual(expect.objectContaining({
      total: 2,
      suspiciousCount: 1
    }));
    expect(result.data.analysis.resourceCounts['POI管理']).toBe(2);
    expect(result.data.analysis.operationCounts['编辑门店']).toBe(1);
  });

  test('fails clearly when browser executor reports an error', async () => {
    const result = await skill.execute('查询 门店：23387 今日什么时候设置POI显示', {
      preferences: sampleConfig(),
      serviceManagementLogClient: async () => ({
        records: [],
        error: 'Page API failed: HTTP 401'
      })
    });

    expect(result.type).toBe('error');
    expect(result.message).toContain('Page API failed: HTTP 401');
  });

  test('converts date range filters to epoch milliseconds for API parameter mapping', () => {
    const target = {
      key: 'merchantBackendLog',
      url: 'https://service.example.com/logs/merchant',
      api: { url: 'https://service.example.com/api/log/page', method: 'GET' }
    };

    const plan = skill.buildExecutionPlan(target, {
      from: '2026-08-19 00:00:00',
      to: '2026-08-19 23:59:59'
    });
    expect(plan.filters.fromMs).toBe(new Date(2026, 7, 19, 0, 0, 0).getTime());
    expect(plan.filters.toMs).toBe(new Date(2026, 7, 19, 23, 59, 59).getTime());

    const dateOnlyPlan = skill.buildExecutionPlan(target, {
      from: '2026-08-19',
      to: '2026-08-19'
    });
    expect(dateOnlyPlan.filters.fromMs).toBe(new Date(2026, 7, 19, 0, 0, 0).getTime());
    expect(dateOnlyPlan.filters.toMs).toBe(new Date(2026, 7, 19, 23, 59, 59).getTime());

    const emptyPlan = skill.buildExecutionPlan(target, {});
    expect(emptyPlan.filters.fromMs).toBeNull();
    expect(emptyPlan.filters.toMs).toBeNull();
  });

  test('uses browser bridge client when configured', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        records: [{
          resourceName: 'POI管理',
          operationContent: '设置POI显示',
          operationDate: '2026-08-14 15:20:00'
        }]
      })
    });

    try {
      const result = await skill.execute('查询 门店23387是什么时候设置POI显示的', {
        preferences: {
          ...sampleConfig(),
          browserBridge: {
            enabled: true,
            url: 'http://127.0.0.1:47631',
            token: 'test-token'
          }
        }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://127.0.0.1:47631/query/service-management-logs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-FlowMind-Token': 'test-token'
          })
        })
      );
      expect(result.data.records).toEqual([
        expect.objectContaining({
          resourceName: 'POI管理',
          operationContent: '设置POI显示'
        })
      ]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('enrichment helpers extract ids, status tokens, and parse DMS markdown tables', () => {
    const enrichment = require('../skills/service-management-log-analysis/enrichment');

    expect(enrichment.extractEntityIds('storeId=25498 menuId=20241210091517433750', '\\d{17,25}'))
      .toEqual(['20241210091517433750']);
    expect(enrichment.extractStatusTokens('{"name":"x","status":"（狀態）售罄"}')).toEqual(['（狀態）售罄']);

    const excludeKeys = new Set(['businessId', 'bid', 'storeId']);
    expect(enrichment.extractIdsFromJsonText(
      '[{"ids":["20241210091517433750"],"status":"（狀態）售罄"},{"businessId":"27219629127978375","storeId":"25498","bid":"00298228207"}]',
      '\\d{17,25}',
      excludeKeys
    )).toEqual(['20241210091517433750']);

    // Nested arrays, SKU ids, classification ids, and account objects must
    // not leak into the product id list.
    const nested = '[[{"id":"20260716121358201759","typeId":"20251110143241844147","name":"(商品) 頂香料頭醬油","skus":[{"id":"202607161213582127600","menuId":"20260716121358201759","price":"(價格（分）) 300"}],"tags":{"categoryId":"20250410110907134110"}},{"id":"20220720172827353040","orgId":"300000009","loginId":"a@b.com"}]]';
    expect(enrichment.extractIdsFromJsonText(nested, '\\d{17,25}', excludeKeys))
      .toEqual(['20260716121358201759']);

    const changeSets = enrichment.extractChangeSets(nested, '\\d{17,25}', excludeKeys);
    expect(changeSets).toEqual([
      {
        id: '20260716121358201759',
        fields: expect.objectContaining({
          名称: '頂香料頭醬油',
          价格: '1 个规格（3.00 元）'
        })
      }
    ]);
    expect(Object.keys(changeSets[0].fields)).not.toContain('typeId');
    expect(changeSets[0].fields).not.toHaveProperty('orgId');

    // Project-specific SKU price fields come from local skillConfig.
    const projectField = nested.replace('"price":"(價格（分）) 300"', '"unitFee":"(價格（分）) 300"');
    const projectChangeSets = enrichment.extractChangeSets(projectField, '\\d{17,25}', excludeKeys, {
      enrichment: { skuPriceFields: ['unitFee'] }
    });
    expect(projectChangeSets[0].fields.价格).toBe('1 个规格（3.00 元）');

    const rows = enrichment.parseMarkdownTable(
      '| ID | NAME | STORE_ID |\n| --- | --- | --- |\n| 20241210091517433750 | 布里歐修吐司 | 25498 |'
    );
    expect(rows).toEqual([
      { ID: '20241210091517433750', NAME: '布里歐修吐司', STORE_ID: '25498' }
    ]);

    const script = enrichment.buildLookupScript(['20241210091517433750'], {
      idField: 'ID',
      nameField: 'NAME',
      extraFields: ['STORE_ID'],
      table: 'your_schema.takeout_menu'
    });
    expect(script).toBe(
      "SELECT ID, NAME, STORE_ID FROM your_schema.takeout_menu WHERE ID IN ('20241210091517433750')"
    );
  });

  test('enriches product ids to names and builds a customer-service report', async () => {
    const enrichmentClient = {
      callTool: jest.fn().mockImplementation(async (tool, args) => {
        expect(tool).toBe('executeScript');
        if (args.database_id === '111') {
          return dmsResult('| ID | NAME | STORE_ID |\n| --- | --- | --- |\n| 20241210091517433750 | 布里歐修吐司 | 25498 |');
        }
        if (args.database_id === '222') {
          return dmsResult('| id | name |\n| --- | --- |\n| 20990101010101010101 | 零售商品A |');
        }
        return dmsResult('| ID | NAME |\n| --- | --- |');
      })
    };

    const result = await skill.execute('查询 门店：25498 今日的商户操作日志中商品的有什么', {
      preferences: sampleConfig(),
      serviceManagementLogClient: async () => ({
        records: [
          {
            resourceName: '商品',
            operationContent: '保存',
            operator: 'a62632983',
            ip: '27.109.250.26',
            optTime: '2026-08-19 15:20:00',
            requestParams: '[{"ids":["20241210091517433750"],"status":"（狀態）售罄"},{"businessId":"27219629127978375","storeId":"25498","bid":"00298228207"}]'
          },
          {
            resourceName: '商品',
            operationContent: '保存',
            operator: 'a62632983',
            operationDate: '2026-08-19 16:01:00',
            requestParams: '{"id":"20990101010101010101","name":"零售商品A改名","price":45,"description":"新描述"}'
          },
          {
            resourceName: '门店',
            operationContent: '编辑门店',
            operator: 'someone',
            operationDate: '2026-08-19 17:00:00',
            requestParams: '{"storeId":25498}'
          }
        ],
        pageInfo: { total: 3, pages: 1 }
      }),
      enrichmentClient
    });

    expect(result.type).toBe('result');
    expect(result.message).toContain('已解析 2 个商品名称');
    expect(result.data.enrichment).toEqual(expect.objectContaining({
      enabled: true,
      requestedIds: 2,
      resolvedProducts: 2
    }));
    expect(result.data.records[0].products).toEqual([
      expect.objectContaining({ id: '20241210091517433750', name: '布里歐修吐司' })
    ]);
    expect(result.data.records[0].operationDate).toBe('2026-08-19 15:20:00');

    const report = result.data.csReport;
    expect(report.includedCount).toBe(2);
    expect(report.excludedCount).toBe(1);
    const joined = report.lines.join('\n');
    expect(joined).toContain('[15:20:00] a62632983 保存「布里歐修吐司」（IP 27.109.250.26）');
    expect(joined).toContain('状态：售罄');
    expect(joined).toContain('[16:01:00] a62632983 保存「零售商品A」');
    expect(joined).toContain('零售商品A → 名称：零售商品A改名｜价格：45｜描述：新描述');
    expect(report.markdown).toContain('| 时间 | 操作人 | 操作 | 商品 | 变更内容 | IP |');
    expect(report.markdown).toContain('状态：售罄');
  });

  test('falls through chained product sources until the id resolves', async () => {
    const calls = [];
    const enrichmentClient = {
      callTool: jest.fn().mockImplementation(async (tool, args) => {
        calls.push(args.database_id);
        if (args.database_id === '111') return dmsResult('| ID | NAME |\n| --- | --- |');
        return dmsResult('| id | name |\n| --- | --- |\n| 20990101010101010101 | 零售商品A |');
      })
    };

    const result = await skill.execute('查询 门店：25498 今日的商户操作日志中商品的有什么', {
      preferences: sampleConfig(),
      serviceManagementLogClient: async () => ({
        records: [
          {
            operationContent: '保存',
            operator: 'op',
            operationDate: '2026-08-19 15:20:00',
            requestParams: '{"id":"20990101010101010101"}'
          }
        ]
      }),
      enrichmentClient
    });

    expect(calls).toEqual(['111', '222']);
    expect(result.data.csReport.lines[0]).toContain('零售商品A');
    expect(result.data.csReport.unresolvedIds).toEqual([]);
  });

  test('reports unresolved ids and survives enrichment data-source errors', async () => {
    const failing = {
      callTool: jest.fn().mockRejectedValue(new Error('DMS unavailable'))
    };

    const result = await skill.execute('查询 门店：25498 今日的商户操作日志中商品的有什么', {
      preferences: sampleConfig(),
      serviceManagementLogClient: async () => ({
        records: [
          {
            operationContent: '保存',
            operator: 'op',
            operationDate: '2026-08-19 15:20:00',
            requestParams: '{"id":"20990101010101010101"}'
          }
        ]
      }),
      enrichmentClient: failing
    });

    expect(result.type).toBe('result');
    expect(result.data.enrichment.error).toContain('DMS unavailable');
    expect(result.data.csReport.unresolvedIds).toEqual(['20990101010101010101']);
    expect(result.data.csReport.lines[0]).toContain('未知商品（ID 20990101010101010101）');
    expect(result.data.records.length).toBe(1);
  });

  test('builds a plain report without enrichment config', async () => {
    const result = await skill.execute('查询 门店：25498 今日的商户操作日志', {
      preferences: { targets: sampleConfig().targets },
      serviceManagementLogClient: async () => ({
        records: [
          {
            operationContent: '保存',
            operator: 'op',
            operationDate: '2026-08-19 15:20:00',
            requestParams: '{"id":"20990101010101010101"}'
          }
        ]
      })
    });

    expect(result.type).toBe('result');
    expect(result.data.enrichment.enabled).toBe(false);
    expect(result.data.csReport.lines[0]).toContain('20990101010101010101');
  });
});

function dmsResult(table) {
  return {
    content: [
      { type: 'text', text: JSON.stringify({ result: table }) }
    ]
  };
}

function sampleConfig() {
  return {
    project: 'service-management',
    defaultTarget: 'merchantBackendLog',
    queryMode: 'api-first',
    enrichment: {
      mcpServers: {
        'aliyun-dms-mcp-server': {
          url: 'https://dms.example.com/sse',
          type: 'sse',
          headers: { Authorization: 'Bearer test' }
        }
      },
      productLookup: {
        provider: 'dms',
        mcpServer: 'aliyun-dms-mcp-server',
        idPattern: '\\d{17,25}',
        batchSize: 20,
        sources: [
          {
            name: 'menu-source',
            databaseId: '111',
            table: 'your_schema.takeout_menu',
            idField: 'ID',
            nameField: 'NAME',
            extraFields: ['STORE_ID']
          },
          {
            name: 'goods-source',
            databaseId: '222',
            table: 'your_schema.takeout_goods',
            idField: 'id',
            nameField: 'name',
            extraFields: ['store_id']
          }
        ]
      }
    },
    targets: {
      merchantBackendLog: {
        label: '商户后台日志',
        matchKeywords: ['商户后台', '商户操作', 'merchant'],
        url: 'https://service.example.com/logs/merchant',
        api: {
          url: 'https://service.example.com/api/log/page',
          method: 'POST',
          credentials: 'include'
        },
        selectors: {
          queryButton: "button:has-text('查询')"
        },
        columns: {
          resourceName: '资源名称',
          operationContent: '操作内容'
        }
      },
      adminService: {
        label: '管理后台服务',
        matchKeywords: ['管理后台服务', 'admin'],
        url: 'https://service.example.com/logs/admin-service',
        selectors: {
          queryButton: "button:has-text('查询')"
        },
        columns: {
          resourceName: '资源名称',
          operationContent: '操作内容'
        }
      }
    }
  };
}
