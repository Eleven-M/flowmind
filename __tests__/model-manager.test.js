const ModelManager = require('../core/ai/model-manager');

describe('model manager', () => {
  test('applies the global default model to providers without an explicit model', async () => {
    const manager = new ModelManager({
      defaultProvider: 'demo',
      defaultModel: 'global-model',
      providers: {
        demo: {}
      }
    });

    manager._registerBuiltinProviders = () => {};
    manager.providerFactories = {
      demo: (config) => ({
        initialized: false,
        model: config.model,
        async init() {
          this.initialized = true;
        },
        getInfo() {
          return { model: this.model };
        }
      })
    };

    await manager.init();

    const provider = manager.getProvider('demo');
    expect(provider.model).toBe('global-model');
    expect(manager.getStatus().defaultModel).toBe('global-model');
  });

  test('deduplicates repeated provider warnings for the same invalid credential failure', async () => {
    const manager = new ModelManager({
      defaultProvider: 'mimo',
      providers: {
        mimo: {}
      }
    });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    manager._registerBuiltinProviders = () => {};
    manager.providerFactories = {
      mimo: () => ({
        initialized: true,
        async init() {},
        async chat() {
          const error = new Error('MiMo API error: 401 - invalid key');
          error.code = '401';
          throw error;
        },
        getInfo() {
          return {};
        }
      })
    };

    await manager.init();

    await manager.understandIntent('查询日志');
    await manager.extractParameters('查询日志', 'log-audit');
    await manager.selectSkill('查询日志', []);
    await manager.summarizeResult({ ok: true });

    const warningMessages = warnSpy.mock.calls.map((call) => call[0]);
    expect(warningMessages.filter((message) => message.includes('Default provider (mimo) failed')).length).toBe(1);

    warnSpy.mockRestore();
  });
});
