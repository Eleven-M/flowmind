const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');

describe('config manager defaults', () => {
  const originalHome = process.env.FLOWMIND_HOME;

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.FLOWMIND_HOME;
    } else {
      process.env.FLOWMIND_HOME = originalHome;
    }
  });

  test('load applies default configuration before validation', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-config-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();

    expect(config.get('version')).toBe('1.0.0');
    expect(config.validate()).toEqual({
      valid: true,
      errors: []
    });

    await fs.remove(tempHome);
  });

  test('load merges global ai config from ai-config.json', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-ai-config-${Date.now()}`);
    const flowmindHome = path.join(tempHome, '.flowmind');
    await fs.ensureDir(flowmindHome);
    process.env.FLOWMIND_HOME = tempHome;

    await fs.writeJson(path.join(flowmindHome, 'ai-config.json'), {
      ai: {
        enabled: true,
        defaultProvider: 'deepseek',
        defaultModel: 'deepseek-chat',
        providers: {
          deepseek: {
            enabled: true,
            apiKey: 'sk-test',
            baseUrl: 'https://api.deepseek.com/v1'
          }
        }
      }
    }, { spaces: 2 });

    const config = new ConfigManager();
    await config.load();

    expect(config.get('ai.defaultProvider')).toBe('deepseek');
    expect(config.get('ai.defaultModel')).toBe('deepseek-chat');
    expect(config.get('ai.providers.deepseek.apiKey')).toBe('sk-test');

    await fs.remove(tempHome);
  });

  test('load merges global skill config from skill-config.json', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-skill-config-${Date.now()}`);
    const flowmindHome = path.join(tempHome, '.flowmind');
    await fs.ensureDir(flowmindHome);
    process.env.FLOWMIND_HOME = tempHome;

    await fs.writeJson(path.join(flowmindHome, 'skill-config.json'), {
      version: '1.0.0',
      skills: {
        'yapi-sync-interface': {
          enabled: true,
          defaultProjectId: '28',
          syncMode: 'merge'
        }
      }
    }, { spaces: 2 });

    const config = new ConfigManager();
    await config.load();

    expect(config.get('skillConfig.skills.yapi-sync-interface.defaultProjectId')).toBe('28');
    expect(config.get('skillConfig.skills.yapi-sync-interface.syncMode')).toBe('merge');

    await fs.remove(tempHome);
  });

  test('save writes config with private file permissions when supported', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-private-config-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    config.set('ai.providers.openai.apiKey', 'sk-private');

    const configPath = await config.save();
    const mode = (await fs.stat(configPath)).mode & 0o777;

    if (process.platform !== 'win32') {
      expect(mode).toBe(0o600);
    }

    await fs.remove(tempHome);
  });
});
