const ModelManager = require('../core/ai/model-manager');
const JevProvider = require('../core/ai/providers/jev');

const SKILL_CANDIDATES = [
  { name: 'log-audit', description: 'Log audit skill' },
  { name: 'code-review', description: 'Code review skill' }
];

function buildManager({ jevConfig, featureProviders = { skillSelection: 'jev' }, chat } = {}) {
  const manager = new ModelManager({
    defaultProvider: 'demo',
    providers: {
      demo: {},
      jev: jevConfig || {}
    },
    featureProviders
  });

  manager._registerBuiltinProviders = () => {};
  manager.providerFactories = {
    demo: () => ({
      initialized: true,
      supportsChat: true,
      async init() {},
      chat,
      getInfo() {
        return {};
      }
    }),
    jev: (config) => new JevProvider(config)
  };

  return manager;
}

describe('jev provider integration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('registers a built-in jev factory that requires explicit enable', () => {
    const manager = new ModelManager({});
    manager._registerBuiltinProviders();

    const provider = manager.createProvider('jev', { enabled: true, apiKey: 'test-key' });
    expect(provider).toBeInstanceOf(JevProvider);
    expect(provider.explicitEnableRequired).toBe(true);
    expect(provider.supportsChat).toBe(false);
  });

  test('stays disabled until the user enables and configures it', async () => {
    const chat = jest.fn().mockResolvedValue(JSON.stringify({
      selectedSkill: 'code-review',
      confidence: 0.9
    }));
    const manager = buildManager({ jevConfig: { apiKey: 'test-key' }, chat });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.init();

    const jev = manager.getProvider('jev');
    expect(jev.disabled).toBe(true);
    expect(jev.initialized).toBe(false);
    expect(jev.disabledReason).toBe('not enabled');

    const selection = await manager.selectSkill('审查一下这个 PR', SKILL_CANDIDATES);

    // 未开启时 Jev 不接管，回落到默认 LLM Provider
    expect(selection.selectedSkill).toBe('code-review');
    expect(selection.source).toBeUndefined();
    expect(chat).toHaveBeenCalledTimes(1);

    const status = manager.getStatus();
    expect(status.providers.jev.disabled).toBe(true);

    warnSpy.mockRestore();
  });

  test('stays disabled when enabled without an API key', async () => {
    const manager = buildManager({ jevConfig: { enabled: true } });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.init();

    expect(manager.getProvider('jev').disabled).toBe(true);
    expect(manager.getProvider('jev').disabledReason).toBe('missing API key');

    warnSpy.mockRestore();
  });

  test('routes skillSelection through jev once enabled and configured', async () => {
    const chat = jest.fn();
    const manager = buildManager({
      jevConfig: { enabled: true, apiKey: 'test-key' },
      chat
    });

    await manager.init();

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        decisions: [
          {
            id: 'selected_skill',
            type: 'choice',
            selected: 'log-audit',
            confidence: 0.92,
            probabilities: { 'log-audit': 0.92, 'code-review': 0.08 }
          }
        ]
      })
    });

    const selection = await manager.selectSkill('查询 traceId abc123 的日志', SKILL_CANDIDATES);

    expect(selection).toMatchObject({
      selectedSkill: 'log-audit',
      confidence: 0.92,
      source: 'jev'
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/decisions');
    expect(chat).not.toHaveBeenCalled();

    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(requestBody.questions[0].type).toBe('choice');
    expect(requestBody.questions[0].options.map((option) => option.id))
      .toEqual(['log-audit', 'code-review']);
  });

  test('falls back to the default LLM provider when jev fails', async () => {
    const chat = jest.fn().mockResolvedValue(JSON.stringify({
      selectedSkill: 'code-review',
      confidence: 0.8
    }));
    const manager = buildManager({
      jevConfig: { enabled: true, apiKey: 'test-key' },
      chat
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.init();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request'
    });

    const selection = await manager.selectSkill('review this pull request', SKILL_CANDIDATES);

    expect(selection.selectedSkill).toBe('code-review');
    expect(selection.source).toBeUndefined();
    expect(chat).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test('falls back to the default LLM provider when jev confidence is below threshold', async () => {
    const chat = jest.fn().mockResolvedValue(JSON.stringify({
      selectedSkill: 'code-review',
      confidence: 0.85
    }));
    const manager = buildManager({
      jevConfig: { enabled: true, apiKey: 'test-key' },
      chat
    });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await manager.init();
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        decisions: [
          {
            id: 'selected_skill',
            selected: 'log-audit',
            confidence: 0.3
          }
        ]
      })
    });

    const selection = await manager.selectSkill('帮我看看日志', SKILL_CANDIDATES);

    // 低置信度不接管，回落到 LLM
    expect(selection.selectedSkill).toBe('code-review');
    expect(chat).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
  });

  test('never routes chat calls to jev', async () => {
    const chat = jest.fn().mockResolvedValue('hello from demo');
    const manager = buildManager({
      jevConfig: { enabled: true, apiKey: 'test-key' },
      chat
    });

    await manager.init();

    const reply = await manager.answerQuery('你好');

    expect(reply).toBe('hello from demo');
    // Jev 即便已启用也不会被 chat 链路调用
    expect(manager.getProvider('jev').lastError).toBeUndefined();
  });

  test('parses decision responses tolerantly', () => {
    const provider = new JevProvider({ enabled: true, apiKey: 'test-key' });

    expect(provider.parseDecision({
      decisions: [{ id: 'q1', answer: 'log-audit', confidence: 0.7 }]
    }, 'q1')).toMatchObject({ selected: 'log-audit', confidence: 0.7 });

    expect(provider.parseDecision({ selected: 'code-review' }, 'q1'))
      .toMatchObject({ selected: 'code-review', confidence: null });

    expect(provider.parseDecision(null, 'q1')).toBeNull();
  });
});
