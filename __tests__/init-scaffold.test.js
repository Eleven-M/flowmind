const {
  buildAiConfig,
  buildBaseConfig,
  buildComponentConfig,
  buildResourceConfig,
  buildSkillConfig,
  getAiProviderChoices,
  getAiModelChoices,
  getMcpResourcesForSkills,
  normalizeResourceKeys,
  getMcpSkillChoices,
  getMcpSkillChoicesGrouped,
  getResourceChoices,
  getSetupChoices
} = require('../core/init-scaffold');

describe('init scaffold', () => {
  test('returns setup choices for AI model and MCP configuration', () => {
    const choices = getSetupChoices(true);
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'ai', checked: true }),
      expect.objectContaining({ value: 'mcp', checked: false })
    ]));
  });

  test('exposes the supported ai providers', () => {
    const choices = getAiProviderChoices();
    const providers = choices.map((item) => item.value);
    expect(providers).toEqual(expect.arrayContaining(['openai', 'anthropic', 'ollama']));
    expect(choices).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'openai', name: expect.stringContaining('recommended') }),
      expect.objectContaining({ value: 'openai', name: expect.stringContaining('gpt-4.1-mini') }),
      expect.objectContaining({ value: 'deepseek', name: expect.stringContaining('deepseek-chat') })
    ]));
  });

  test('exposes provider-specific ai model choices', () => {
    const openaiModels = getAiModelChoices('openai').map((item) => item.value);
    expect(openaiModels).toEqual(expect.arrayContaining(['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini']));
    const openaiChoiceNames = getAiModelChoices('openai').map((item) => item.name);
    expect(openaiChoiceNames[0]).toContain('(default)');
  });

  test('exposes the supported resource templates', () => {
    const resources = getResourceChoices().map((item) => item.value);
    expect(resources).toEqual(expect.arrayContaining(['sls', 'database', 'redis', 'yapi']));
  });

  test('exposes mcp skill choices with component-backed skills', () => {
    const skills = getMcpSkillChoices().map((item) => item.value);
    expect(skills).toEqual(expect.arrayContaining([
      'log-audit',
      'yapi-sync-interface',
      'yuque-sync-design'
    ]));
  });

  test('groups mcp skill choices by category for the init wizard', () => {
    const grouped = getMcpSkillChoicesGrouped();
    const labels = grouped.filter((item) => item.type === 'separator').map((item) => item.line);
    expect(labels).toEqual(expect.arrayContaining([
      'Quality',
      'Documentation',
      'Monitoring'
    ]));
    expect(grouped.some((item) => item.value === 'log-audit')).toBe(true);
    expect(grouped.some((item) => item.value === 'yapi-sync-interface')).toBe(true);
    expect(grouped.some((item) => item.value === 'yuque-sync-design')).toBe(true);
  });

  test('maps selected mcp skills to the underlying resource keys', () => {
    const resources = getMcpResourcesForSkills(['log-audit', 'yapi-sync-interface', 'yuque-sync-design']);
    expect(resources).toEqual(expect.arrayContaining(['sls', 'yapi', 'yuque']));
  });

  test('maps multi-resource skills to all required resources', () => {
    const resources = getMcpResourcesForSkills(['data-logic-validation']);
    expect(resources).toEqual(expect.arrayContaining(['database', 'redis']));
  });

  test('maps resource-like component dependencies to resource keys', () => {
    expect(getMcpResourcesForSkills(['report-insights'])).toEqual(expect.arrayContaining(['report']));
    expect(normalizeResourceKeys(['logService', 'apiDoc', 'report'])).toEqual(
      expect.arrayContaining(['sls', 'yapi', 'report'])
    );
  });

  test('builds a base config rooted at the config directory', () => {
    const config = buildBaseConfig('/tmp/flowmind-home');
    expect(config.learning.storagePath).toBe('/tmp/flowmind-home/learning');
    expect(config.sceneMapping.enabled).toBe(true);
  });

  test('builds ai config with provider-specific details', () => {
    const config = buildAiConfig('openai', {
      apiKey: 'sk-test',
      model: 'gpt-4.1-mini',
      baseUrl: 'https://api.openai.com/v1'
    });

    expect(config.ai.defaultProvider).toBe('openai');
    expect(config.ai.defaultModel).toBe('gpt-4.1-mini');
    expect(config.ai.providers.openai).toEqual(expect.objectContaining({
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1'
    }));
    expect(config.ai.providers.openai.model).toBeUndefined();
  });

  test('builds ollama ai config without an api key', () => {
    const config = buildAiConfig('ollama', {
      model: 'llama3.1',
      baseUrl: 'http://127.0.0.1:11434'
    });

    expect(config.ai.defaultProvider).toBe('ollama');
    expect(config.ai.defaultModel).toBe('llama3.1');
    expect(config.ai.providers.ollama).toEqual(expect.objectContaining({
      baseUrl: 'http://127.0.0.1:11434'
    }));
    expect(config.ai.providers.ollama.model).toBeUndefined();
    expect(config.ai.providers.ollama.apiKey).toBeUndefined();
  });

  test('builds resource and component configs for selected integrations', () => {
    const resourceConfig = buildResourceConfig(['sls', 'database', 'yapi'], {
      sls: {
        mcpServer: 'sls-logs',
        defaultEnv: 'uat',
        envConfig: {
          test: { endpoint: 'cn-shenzhen.log.aliyuncs.com', project: 'test-project', logstore: 'test-log' },
          uat: { endpoint: 'cn-shenzhen.log.aliyuncs.com', project: 'uat-project', logstore: 'uat-log' },
          prod: { endpoint: 'cn-hongkong.log.aliyuncs.com', project: 'prod-project', logstore: 'prod-log' }
        }
      },
      database: {
        dms: 'aliyun-dms-mcp-server',
        directQuery: 'db-redis-query',
        config: {
          defaultSourceId: 'source-1',
          defaultDatabaseId: 'db-1',
          defaultSchema: 'public'
        }
      },
      yapi: {
        mcpServer: 'yapi-mcp',
        config: {
          defaultProjectId: '42',
          defaultCategoryId: '7'
        }
      }
    });
    const componentConfig = buildComponentConfig(['sls', 'database', 'yapi'], {
      sls: {
        mcpServer: 'sls-logs',
        defaultEnv: 'uat',
        envConfig: {
          test: { endpoint: 'cn-shenzhen.log.aliyuncs.com', project: 'test-project', logstore: 'test-log' },
          uat: { endpoint: 'cn-shenzhen.log.aliyuncs.com', project: 'uat-project', logstore: 'uat-log' },
          prod: { endpoint: 'cn-hongkong.log.aliyuncs.com', project: 'prod-project', logstore: 'prod-log' }
        }
      },
      database: {
        dms: 'aliyun-dms-mcp-server',
        directQuery: 'db-redis-query',
        config: {
          defaultSourceId: 'source-1',
          defaultDatabaseId: 'db-1',
          defaultSchema: 'public'
        }
      },
      yapi: {
        mcpServer: 'yapi-mcp',
        config: {
          defaultProjectId: '42',
          defaultCategoryId: '7'
        }
      }
    });

    expect(resourceConfig.resources.sls.enabled).toBe(true);
    expect(resourceConfig.resources.sls.envConfig.uat.project).toBe('uat-project');
    expect(resourceConfig.resources.database.mcpServers.dms).toBe('aliyun-dms-mcp-server');
    expect(resourceConfig.resources.database.config.defaultSchema).toBe('public');
    expect(resourceConfig.resources.yapi.mcpServer).toBe('yapi-mcp');
    expect(resourceConfig.resources.yapi.config.defaultProjectId).toBe('42');
    expect(componentConfig.components.logService.default).toBe('aliyun-sls');
    expect(componentConfig.components.databaseQuery.providers['aliyun-rds-query'].config.defaultDatabaseId).toBe('db-1');
    expect(componentConfig.components.logService.providers['aliyun-sls'].config.envConfig.uat.logstore).toBe('uat-log');
    expect(componentConfig.components.databaseQuery.providers['aliyun-rds-query'].mcpServer).toBe('db-redis-query');
    expect(componentConfig.components.apiDoc.providers.yapi.mcpServer).toBe('yapi-mcp');
    expect(componentConfig.components.apiDoc.providers.yapi.config.defaultCategoryId).toBe('7');
  });

  test('builds yuque defaults into the resource and component config', () => {
    const resourceConfig = buildResourceConfig(['yuque'], {
      yuque: {
        mcpServer: 'yuque-mcp',
        config: {
          defaultNamespace: 'team/handbook',
          defaultSlugPrefix: 'flowmind-'
        }
      }
    });
    const componentConfig = buildComponentConfig(['yuque'], {
      yuque: {
        mcpServer: 'yuque-mcp',
        config: {
          defaultNamespace: 'team/handbook',
          defaultSlugPrefix: 'flowmind-'
        }
      }
    });

    expect(resourceConfig.resources.yuque.mcpServer).toBe('yuque-mcp');
    expect(resourceConfig.resources.yuque.config.defaultNamespace).toBe('team/handbook');
    expect(componentConfig.components.knowledgeBase.providers.yuque.config.defaultSlugPrefix).toBe('flowmind-');
  });

  test('builds redis defaults into the component config', () => {
    const componentConfig = buildComponentConfig(['redis'], {
      redis: {
        monitor: 'redis-monitor',
        directQuery: 'db-redis-query',
        config: {
          defaultSourceId: 'redis-source',
          defaultKeyPrefix: 'cache:',
          defaultLabelName: 'cluster'
        }
      }
    });

    expect(componentConfig.components.redisMonitor.providers['aliyun-redis'].mcpServer).toBe('redis-monitor');
    expect(componentConfig.components.redisMonitor.providers['aliyun-redis'].config.defaultKeyPrefix).toBe('cache:');
    expect(componentConfig.components.databaseQuery.providers['aliyun-rds-query'].config.defaultSourceId).toBe('redis-source');
  });

  test('builds skill config for selected mcp skills', () => {
    const config = buildSkillConfig(['log-audit', 'yapi-sync-interface', 'data-logic-validation', 'code-review', 'archive-change', 'auto-flow', 'api-sync'], {
      'yapi-sync-interface': {
        defaultProjectId: '28',
        syncMode: 'overwrite',
        autoCreateCategory: false,
        excludePatterns: ['**/internal/**']
      },
      'code-review': {
        security: {
          enabled: true,
          severity: ['HIGH']
        }
      },
      'archive-change': {
        location: 'docs/archive'
      },
      'auto-flow': {
        workflows: {
          path: './pipelines'
        }
      },
      'api-sync': {
        platform: 'swagger'
      }
    });

    expect(config.skills['log-audit']).toEqual(expect.objectContaining({
      enabled: true,
      defaultFormat: 'sequential-list',
      excludeInfrastructure: true
    }));
    expect(config.skills['yapi-sync-interface']).toEqual(expect.objectContaining({
      enabled: true,
      defaultProjectId: '28',
      syncMode: 'overwrite',
      autoCreateCategory: false
    }));
    expect(config.skills['data-logic-validation']).toEqual(expect.objectContaining({
      enabled: true
    }));
    expect(config.skills['data-logic-validation'].validation.checkPerformance).toBe(true);
    expect(config.skills['code-review'].security.severity).toEqual(['HIGH']);
    expect(config.skills['archive-change'].location).toBe('docs/archive');
    expect(config.skills['auto-flow'].workflows.path).toBe('./pipelines');
    expect(config.skills['api-sync'].platform).toBe('swagger');
  });
});
