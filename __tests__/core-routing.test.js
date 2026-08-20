const FlowMind = require('../core');
const { createSkillError } = require('../core/result-contract');

describe('FlowMind routing and learning', () => {
  test('does not treat a normal error log query as learning', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.ai = {
      understandIntent: jest.fn().mockResolvedValue({ intent: 'logs', confidence: 0.9 }),
      analyzeLearningFeedback: jest.fn().mockResolvedValue(null),
      selectSkill: jest.fn().mockResolvedValue({ selectedSkill: 'log-audit' }),
      extractParameters: jest.fn().mockResolvedValue({}),
      summarizeResult: jest.fn().mockResolvedValue(null)
    };
    flowmind.learning = {
      detectLearning: jest.fn().mockResolvedValue(null),
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.matcher = {
      match: jest.fn().mockResolvedValue(null)
    };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([{
        name: 'log-audit',
        skill: {
          name: 'log-audit',
          execute: jest.fn().mockResolvedValue({ ok: true })
        }
      }]),
      get: jest.fn((name) => ({
        'log-audit': {
          name: 'log-audit',
          execute: jest.fn().mockResolvedValue({ ok: true })
        }
      })[name]),
      select: jest.fn().mockResolvedValue({
        name: 'log-audit',
        execute: jest.fn().mockResolvedValue({ ok: true })
      })
    };

    const result = await flowmind.process('查看最近1小时的错误日志');

    expect(result.type).toBe('result');
    expect(result.metadata.skillRoute).toBe('ai');
    expect(flowmind.learning.detectLearning).not.toHaveBeenCalled();
  });

  test('creates flowmind ai manager with silent warnings by default', () => {
    const flowmind = new FlowMind();
    expect(flowmind.ai.silenceWarnings).toBe(true);
  });

  test('captures explicit feedback and binds it to the previous skill', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.conversationHistory = [{
      input: '查询 traceId abc123 的日志',
      output: { type: 'result' },
      skill: 'log-audit',
      timestamp: new Date().toISOString()
    }];
    flowmind.ai = {
      understandIntent: jest.fn().mockResolvedValue({ intent: 'feedback', confidence: 0.9 }),
      analyzeLearningFeedback: jest.fn().mockResolvedValue(null),
      selectSkill: jest.fn().mockResolvedValue({ selectedSkill: 'learning-feedback' }),
      extractParameters: jest.fn().mockResolvedValue({}),
      summarizeResult: jest.fn().mockResolvedValue(null)
    };
    flowmind.learning = {
      detectLearning: jest.fn().mockImplementation(async (input, context) => ({
        type: 'preference',
        record: { skill: context.currentSkill },
        confirmation: 'saved'
      }))
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.matcher = {
      match: jest.fn().mockResolvedValue(null)
    };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([{
        name: 'learning-feedback',
        skill: {
          name: 'learning-feedback',
          execute: jest.fn()
        }
      }]),
      get: jest.fn((name) => ({
        'learning-feedback': {
          name: 'learning-feedback',
          execute: jest.fn()
        }
      })[name]),
      select: jest.fn().mockResolvedValue(null)
    };

    const result = await flowmind.process('下次用表格格式');

    expect(result.type).toBe('learning');
    expect(result.input).toBe('下次用表格格式');
    expect(result.data).toEqual(expect.objectContaining({
      confirmation: 'saved'
    }));
    expect(flowmind.learning.detectLearning).toHaveBeenCalled();
    expect(result.record.skill).toBe('log-audit');
  });

  test('process surfaces skill contract errors as top-level runtime errors with metadata', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.ai = {
      understandIntent: jest.fn().mockResolvedValue({ intent: 'docs', confidence: 0.9 }),
      analyzeLearningFeedback: jest.fn().mockResolvedValue(null),
      selectSkill: jest.fn().mockResolvedValue({ selectedSkill: 'yapi-sync-interface' }),
      extractParameters: jest.fn().mockResolvedValue({}),
      summarizeResult: jest.fn().mockResolvedValue(null)
    };
    flowmind.learning = {
      detectLearning: jest.fn().mockResolvedValue(null),
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.matcher = {
      match: jest.fn().mockResolvedValue(null)
    };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([{
        name: 'yapi-sync-interface',
        skill: {
          name: 'yapi-sync-interface',
          execute: jest.fn().mockResolvedValue(
            createSkillError('yapi-sync-interface', 'YApi service not configured', {
              input: '同步接口到YApi',
              kind: 'missing-component',
              retryable: true
            })
          )
        }
      }]),
      get: jest.fn((name) => ({
        'yapi-sync-interface': {
          name: 'yapi-sync-interface',
          execute: jest.fn().mockResolvedValue(
            createSkillError('yapi-sync-interface', 'YApi service not configured', {
              input: '同步接口到YApi',
              kind: 'missing-component',
              retryable: true
            })
          )
        }
      })[name]),
      select: jest.fn().mockResolvedValue({
        name: 'yapi-sync-interface',
        execute: jest.fn().mockResolvedValue(
          createSkillError('yapi-sync-interface', 'YApi service not configured', {
            input: '同步接口到YApi',
            kind: 'missing-component',
            retryable: true
          })
        )
      })
    };

    const result = await flowmind.process('同步接口到YApi');

    expect(result.type).toBe('error');
    expect(result.data).toEqual(expect.objectContaining({
      kind: 'missing-component',
      retryable: true
    }));
    expect(result.metadata).toEqual(expect.objectContaining({
      skill: 'yapi-sync-interface',
      skillRoute: 'ai'
    }));
  });

  test('executeWithLearning injects flowmind and currentSkill into context', async () => {
    const flowmind = new FlowMind();
    flowmind.config = {
      get: jest.fn((key, defaultValue) => {
        if (key === 'skillConfig.skills.log-audit') {
          return { defaultFormat: 'summary', excludeInfrastructure: false };
        }
        return defaultValue;
      })
    };
    flowmind.learning = {
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({ outputFormat: 'compact' }),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });

    await flowmind.executeWithLearning({ name: 'log-audit', execute }, 'query logs', {});

    expect(execute).toHaveBeenCalledWith('query logs', expect.objectContaining({
      flowmind,
      currentSkill: 'log-audit',
      skillConfig: {
        defaultFormat: 'summary',
        excludeInfrastructure: false
      },
      preferences: {
        defaultFormat: 'summary',
        excludeInfrastructure: false,
        outputFormat: 'compact'
      }
    }));
  });

  test('executeWithLearning injects matched resource bindings into context', async () => {
    const flowmind = new FlowMind();
    const binding = {
      id: 'bind-1',
      business: 'retail',
      componentType: 'apiDoc',
      provider: 'yapi'
    };
    flowmind.learning = {
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(binding),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });

    await flowmind.executeWithLearning({ name: 'yapi-sync-interface', execute }, '同步零售业务 yapi', {});

    expect(execute).toHaveBeenCalledWith('同步零售业务 yapi', expect.objectContaining({
      resourceBinding: binding
    }));
    expect(flowmind.learning.markResourceBindingUsed).toHaveBeenCalledWith('bind-1', expect.objectContaining({
      input: '同步零售业务 yapi',
      skillName: 'yapi-sync-interface'
    }));
  });

  test('selectSkill returns null for an unknown explicit skill', async () => {
    const flowmind = new FlowMind();
    flowmind.skills = {
      get: jest.fn().mockReturnValue(undefined)
    };

    const result = await flowmind.selectSkill('query', { skill: 'missing' });

    expect(result).toBeNull();
  });

  test('selectSkill lets AI route from the full skill catalog when rules do not match', async () => {
    const flowmind = new FlowMind();
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([]),
      getAll: jest.fn().mockReturnValue([
        {
          name: 'log-audit',
          definition: {
            description: 'Log audit',
            triggers: ['日志'],
            category: 'monitoring'
          }
        },
        {
          name: 'auto-flow',
          definition: {
            description: 'Deployment workflow',
            triggers: ['部署'],
            category: 'automation'
          }
        }
      ]),
      get: jest.fn((name) => ({
        'log-audit': { name: 'log-audit', execute: jest.fn() },
        'auto-flow': { name: 'auto-flow', execute: jest.fn() }
      })[name]),
      select: jest.fn()
    };
    flowmind.ai = {
      selectSkill: jest.fn().mockResolvedValue({
        selectedSkill: 'auto-flow',
        confidence: 0.91,
        reason: '部署请求更适合自动化流程'
      })
    };

    const result = await flowmind.selectSkill('帮我部署到 UAT', {
      intent: { intent: 'deploy', action: 'deploy' }
    });

    expect(flowmind.ai.selectSkill).toHaveBeenCalledWith(
      '帮我部署到 UAT',
      expect.arrayContaining([
        expect.objectContaining({ name: 'log-audit' }),
        expect.objectContaining({ name: 'auto-flow' })
      ]),
      expect.objectContaining({
        intent: expect.objectContaining({ intent: 'deploy', action: 'deploy' })
      })
    );
    expect(result?.name).toBe('auto-flow');
  });

  test('does not offer offline analysis for ordinary analysis when AI is available', async () => {
    const flowmind = new FlowMind();
    const offlineSkill = { name: 'offline-design-analysis', execute: jest.fn() };
    const generalSkill = { name: 'change-impact-review', execute: jest.fn() };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([{ name: offlineSkill.name, skill: offlineSkill, score: 20 }]),
      getAll: jest.fn().mockReturnValue([
        { ...offlineSkill, definition: { description: 'Offline analysis' } },
        { ...generalSkill, definition: { description: 'Change analysis' } }
      ]),
      get: jest.fn((name) => ({
        'offline-design-analysis': offlineSkill,
        'change-impact-review': generalSkill
      })[name])
    };
    flowmind.ai = {
      hasAvailableProvider: jest.fn().mockReturnValue(true),
      selectSkill: jest.fn().mockResolvedValue(null)
    };

    const result = await flowmind.selectSkill('分析下采购合同的额度使用流程', { aiAvailable: true });

    expect(result).toBeNull();
    expect(flowmind.ai.selectSkill).toHaveBeenCalledWith(
      '分析下采购合同的额度使用流程',
      [expect.objectContaining({ name: 'change-impact-review' })],
      expect.objectContaining({ aiAvailable: true })
    );
  });

  test('process marks ai-plus-rules routing when AI does not select and rule fallback wins', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.ai = {
      understandIntent: jest.fn().mockResolvedValue({ intent: 'query', confidence: 0.8 }),
      analyzeLearningFeedback: jest.fn().mockResolvedValue(null),
      selectSkill: jest.fn().mockResolvedValue(null),
      extractParameters: jest.fn().mockResolvedValue({}),
      summarizeResult: jest.fn().mockResolvedValue(null),
      getStatus: jest.fn().mockReturnValue({
        defaultProvider: 'openai',
        defaultModel: 'gpt-4.1-mini'
      })
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });
    flowmind.learning = {
      detectLearning: jest.fn().mockResolvedValue(null),
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.matcher = {
      match: jest.fn().mockResolvedValue(null)
    };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([{
        name: 'log-audit',
        skill: {
          name: 'log-audit',
          execute
        }
      }]),
      get: jest.fn((name) => ({
        'log-audit': {
          name: 'log-audit',
          execute
        }
      })[name]),
      select: jest.fn().mockResolvedValue({
        name: 'log-audit',
        execute
      }),
      getAll: jest.fn().mockReturnValue([])
    };

    const result = await flowmind.process('查一下错误日志');

    expect(result.type).toBe('result');
    expect(result.metadata.skillRoute).toBe('ai+rules');
    expect(execute).toHaveBeenCalled();
  });

  test('process keeps rule execution when AI parameter extraction fails', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    const execute = jest.fn().mockResolvedValue({ ok: true });
    flowmind.ai = {
      understandIntent: jest.fn().mockResolvedValue({ intent: 'query', confidence: 0.8 }),
      analyzeLearningFeedback: jest.fn().mockResolvedValue(null),
      selectSkill: jest.fn().mockResolvedValue(null),
      extractParameters: jest.fn().mockRejectedValue(new Error('Qwen API error: 401')),
      summarizeResult: jest.fn().mockResolvedValue(null),
      getStatus: jest.fn().mockReturnValue({
        defaultProvider: 'qwen',
        defaultModel: 'qwen-plus'
      })
    };
    flowmind.learning = {
      detectLearning: jest.fn().mockResolvedValue(null),
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.matcher = {
      match: jest.fn().mockResolvedValue(null)
    };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([{
        name: 'log-audit',
        skill: {
          name: 'log-audit',
          execute
        }
      }]),
      get: jest.fn((name) => ({
        'log-audit': {
          name: 'log-audit',
          execute
        }
      })[name]),
      select: jest.fn().mockResolvedValue({
        name: 'log-audit',
        execute
      }),
      getAll: jest.fn().mockReturnValue([])
    };

    const result = await flowmind.process('查一下线上错误日志');

    expect(result.type).toBe('result');
    expect(result.metadata.skillRoute).toBe('ai+rules');
    expect(execute).toHaveBeenCalledWith('查一下线上错误日志', expect.not.objectContaining({
      env: expect.anything()
    }));
  });

  test('process answers AI identity questions without skill routing', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.ai = {
      getStatus: jest.fn().mockReturnValue({
        initialized: true,
        defaultProvider: 'mimo',
        defaultModel: 'mimo-7b',
        health: 'error',
        features: {
          intentUnderstanding: true
        },
        providers: {
          mimo: {
            initialized: true,
            health: 'error',
            error: 'MiMo API error: 401 - invalid_key',
            info: {
              model: 'mimo-7b',
              baseUrl: 'https://api.mimo.ai/v1',
              provider: 'MiMo'
            }
          }
        }
      }),
      answerQuery: jest.fn().mockRejectedValue(new Error('MiMo API error: 401 - invalid_key')),
      understandIntent: jest.fn(),
      selectSkill: jest.fn(),
      extractParameters: jest.fn(),
      summarizeResult: jest.fn()
    };
    flowmind.learning = {
      detectLearning: jest.fn(),
      getSkillLearnings: jest.fn(),
      getPreferences: jest.fn(),
      matchResourceBinding: jest.fn(),
      markResourceBindingUsed: jest.fn()
    };
    flowmind.matcher = {
      match: jest.fn()
    };
    flowmind.skills = {
      getCandidates: jest.fn(),
      select: jest.fn()
    };

    const result = await flowmind.process('你是什么模型');

    expect(result.type).toBe('result');
    expect(result.metadata.skill).toBe('ai-status');
    expect(result.metadata.skillRoute).toBe('ai-status');
    expect(result.data.message).toContain('MiMo API error: 401');
    expect(result.data.replyError).toContain('MiMo API error: 401');
  });

  test('process reports AI connection health for status questions', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.ai = {
      getStatus: jest.fn().mockReturnValue({
        initialized: true,
        defaultProvider: 'mimo',
        defaultModel: 'mimo-7b',
        health: 'error',
        features: {},
        providers: {
          mimo: {
            initialized: false,
            health: 'error',
            error: 'MiMo API error: 401 - invalid_key',
            info: {
              model: 'mimo-7b',
              baseUrl: 'https://api.mimo.ai/v1',
              provider: 'MiMo'
            }
          }
        }
      }),
      answerQuery: jest.fn().mockRejectedValue(new Error('MiMo API error: 401 - invalid_key')),
      understandIntent: jest.fn(),
      selectSkill: jest.fn(),
      extractParameters: jest.fn(),
      summarizeResult: jest.fn()
    };

    const result = await flowmind.process('AI连接正常吗');

    expect(result.type).toBe('result');
    expect(result.data.health).toBe('error');
    expect(result.data.providers.mimo.health).toBe('error');
    expect(result.data.replyError).toContain('MiMo API error: 401');
  });

  test('process falls back to AI answer when no skill matches', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    flowmind.ai = {
      understandIntent: jest.fn().mockResolvedValue({ intent: 'query', confidence: 0.9 }),
      answerQuery: jest.fn().mockResolvedValue('珠海当前天气需要接入实时天气数据源。'),
      analyzeLearningFeedback: jest.fn().mockResolvedValue(null),
      selectSkill: jest.fn().mockResolvedValue(null),
      extractParameters: jest.fn().mockResolvedValue({}),
      summarizeResult: jest.fn().mockResolvedValue(null),
      getStatus: jest.fn().mockReturnValue({
        defaultProvider: 'mimo',
        defaultModel: 'mimo-7b'
      })
    };
    flowmind.learning = {
      detectLearning: jest.fn().mockResolvedValue(null),
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.matcher = {
      match: jest.fn().mockResolvedValue(null)
    };
    flowmind.skills = {
      getCandidates: jest.fn().mockResolvedValue([]),
      list: jest.fn().mockReturnValue([]),
      getAll: jest.fn().mockReturnValue([]),
      get: jest.fn().mockReturnValue(undefined),
      select: jest.fn().mockResolvedValue(null)
    };

    const result = await flowmind.process('测试下当前的珠海天气返回');

    expect(result.type).toBe('result');
    expect(result.metadata.skill).toBe('ai-fallback');
    expect(result.metadata.skillRoute).toBe('ai-only');
    expect(result.data.replyMode).toBe('ai-fallback');
    expect(result.data.message).toContain('珠海当前天气需要接入实时天气数据源');
    expect(flowmind.ai.answerQuery).toHaveBeenCalled();
  });

  test('executes deferred MCP invocations returned by a skill', async () => {
    const flowmind = new FlowMind();
    flowmind.initialized = true;
    const callTool = jest.fn().mockResolvedValue({ ok: true, items: [1, 2] });
    const adapter = {
      mcpServer: 'yapi-mcp',
      providerName: 'yapi',
      callTool
    };
    flowmind.components = {
      getAdapter: jest.fn().mockReturnValue(adapter)
    };
    flowmind.learning = {
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({}),
      matchResourceBinding: jest.fn().mockResolvedValue(null),
      markResourceBindingUsed: jest.fn().mockResolvedValue(undefined)
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };

    const execute = jest.fn().mockResolvedValue({
      type: 'result',
      skill: 'yapi-sync-interface',
      message: 'Listing YApi categories',
      data: {
        mcpTool: 'yapi_get_categories',
        args: { projectId: 'demo' }
      }
    });

    const result = await flowmind.executeWithLearning({
      name: 'yapi-sync-interface',
      execute
    }, '同步 YApi', {
      componentRegistry: flowmind.components
    });

    expect(callTool).toHaveBeenCalledWith('yapi_get_categories', { projectId: 'demo' });
    expect(result.data.execution).toEqual({ ok: true, items: [1, 2] });
    expect(result.data.mcpExecuted).toBe(true);
  });
});
