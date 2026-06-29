const FlowMind = require('../core');

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
      getPreferences: jest.fn().mockResolvedValue({})
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
    expect(flowmind.learning.detectLearning).not.toHaveBeenCalled();
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
    expect(flowmind.learning.detectLearning).toHaveBeenCalled();
    expect(result.record.skill).toBe('log-audit');
  });

  test('executeWithLearning injects flowmind and currentSkill into context', async () => {
    const flowmind = new FlowMind();
    flowmind.learning = {
      getSkillLearnings: jest.fn().mockResolvedValue([]),
      getPreferences: jest.fn().mockResolvedValue({})
    };
    flowmind.honor = {
      award: jest.fn().mockResolvedValue(undefined)
    };
    const execute = jest.fn().mockResolvedValue({ ok: true });

    await flowmind.executeWithLearning({ name: 'log-audit', execute }, 'query logs', {});

    expect(execute).toHaveBeenCalledWith('query logs', expect.objectContaining({
      flowmind,
      currentSkill: 'log-audit'
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
});
