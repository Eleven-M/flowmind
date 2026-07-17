const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');
const LearningEngine = require('../core/learning-engine');

describe('learning bundle export and install', () => {
  const originalHome = process.env.FLOWMIND_HOME;

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.FLOWMIND_HOME;
    } else {
      process.env.FLOWMIND_HOME = originalHome;
    }
  });

  test('exports an installable bundle with records, scenes, preferences and sanitized bindings', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-bundle-src-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();

    await learning.saveResourceBinding({
      id: 'bind-retail-yapi',
      business: '零售',
      aliases: ['retail', '零售项目'],
      keywords: ['retail', 'api'],
      componentType: 'apiDoc',
      provider: 'yapi',
      mcpServer: 'yapi-mcp',
      connection: {
        endpoint: 'https://yapi.example.com',
        project: 'retail-project',
        token: 'secret-token',
        headers: {
          Authorization: 'Bearer secret-token',
          'X-Api-Key': 'hidden'
        }
      },
      metadata: {
        token: 'secret-token',
        note: 'team binding',
        credentials: {
          password: 'secret-password'
        }
      }
    }, { currentSkill: 'resource-bind' });

    const record = {
      id: 'learn-1',
      timestamp: '2026-07-03T08:00:00.000Z',
      skill: 'log-audit',
      type: 'correction',
      severity: 'major',
      trigger: '应该是',
      input: '应该是用表格格式',
      application: {
        condition: 'When formatting trace output',
        action: 'Use table layout',
        priority: 'high'
      }
    };
    await learning.saveLearningRecord(record);
    await learning.updateSkillBindings(record);
    await learning.updateStats('correction', 'log-audit');

    await learning.savePreference({
      id: 'pref-1',
      preferenceType: 'outputFormat',
      skill: 'log-audit',
      input: '用表格格式',
      value: 'table'
    });

    await learning.saveSceneMapping({
      id: 'scene-bundle-1',
      name: 'Bundle Trace Scene',
      keywords: ['bundle-trace'],
      patterns: ['bundle-trace'],
      workflow: {
        skills: [{ skill: 'log-audit', params: { action: 'query-trace' } }]
      },
      preferences: {
        outputFormat: 'sequential-list'
      },
      stats: {
        useCount: 2,
        lastUsed: '2026-07-03T08:00:00.000Z',
        successRate: 1
      }
    });

    const outputPath = path.join(tempHome, 'bundle.json');
    const bundle = await learning.export({ bundle: true, output: outputPath });

    expect(bundle.kind).toBe('flowmind-learning-bundle');
    expect(bundle.resourceBindings.bindings[0].connection).toEqual(expect.objectContaining({
      endpoint: 'https://yapi.example.com',
      project: 'retail-project'
    }));
    expect(bundle.resourceBindings.bindings[0].connection.token).toBeUndefined();
    expect(bundle.resourceBindings.bindings[0].connection.headers).toBeUndefined();
    expect(bundle.resourceBindings.bindings[0].metadata.token).toBeUndefined();
    expect(bundle.resourceBindings.bindings[0].metadata.credentials).toBeUndefined();
    expect(bundle.records['log-audit']).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'learn-1' })
    ]));
    expect(bundle.scenes.mappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'scene-bundle-1' })
    ]));
    expect(bundle.preferences['log-audit']).toEqual(expect.objectContaining({
      outputFormat: 'table'
    }));
    expect(await fs.pathExists(outputPath)).toBe(true);

    await fs.remove(tempHome);
  });

  test('installs a learning bundle and loads records, preferences and bindings for direct matching', async () => {
    const sourceHome = path.join(os.tmpdir(), `flowmind-bundle-src-${Date.now()}`);
    const targetHome = path.join(os.tmpdir(), `flowmind-bundle-target-${Date.now()}`);
    await fs.ensureDir(sourceHome);
    await fs.ensureDir(targetHome);

    process.env.FLOWMIND_HOME = sourceHome;
    const sourceConfig = new ConfigManager();
    await sourceConfig.load();
    const sourceLearning = new LearningEngine(sourceConfig);
    await sourceLearning.init();

    await sourceLearning.saveResourceBinding({
      id: 'bind-retail-yapi',
      business: '零售',
      aliases: ['retail', '零售项目'],
      keywords: ['retail', 'api'],
      componentType: 'apiDoc',
      provider: 'yapi',
      mcpServer: 'yapi-mcp'
    }, { currentSkill: 'resource-bind' });

    await sourceLearning.saveLearningRecord({
      id: 'learn-2',
      timestamp: '2026-07-03T08:00:00.000Z',
      skill: 'log-audit',
      type: 'preference',
      application: {
        condition: 'Always',
        action: 'Use compact output',
        priority: 'medium'
      }
    });
    await sourceLearning.updateSkillBindings({
      id: 'learn-2',
      timestamp: '2026-07-03T08:00:00.000Z',
      skill: 'log-audit',
      type: 'preference',
      application: {
        condition: 'Always',
        action: 'Use compact output',
        priority: 'medium'
      }
    });
    await sourceLearning.savePreference({
      id: 'pref-2',
      preferenceType: 'detailLevel',
      skill: 'log-audit',
      input: '显示简洁一点',
      value: 'compact'
    });
    await sourceLearning.saveSceneMapping({
      id: 'scene-bundle-2',
      name: 'Bundle Install Scene',
      keywords: ['bundle-install'],
      patterns: ['bundle-install'],
      workflow: {
        skills: [{ skill: 'log-audit', params: { action: 'query-trace' } }]
      },
      preferences: {}
    });

    const bundle = await sourceLearning.export({ bundle: true });

    process.env.FLOWMIND_HOME = targetHome;
    const targetConfig = new ConfigManager();
    await targetConfig.load();
    const targetLearning = new LearningEngine(targetConfig);
    await targetLearning.init();
    const importResult = await targetLearning.import(bundle);

    expect(importResult).toEqual(expect.objectContaining({
      success: true,
      bundle: true
    }));

    const reloaded = new LearningEngine(targetConfig);
    await reloaded.init();

    expect(reloaded.records['log-audit']).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'learn-2' })
    ]));

    const prefs = await reloaded.getPreferences('log-audit');
    expect(prefs).toEqual(expect.objectContaining({
      detailLevel: 'compact'
    }));

    const matchedBinding = await reloaded.matchResourceBinding('同步 retail 接口', 'yapi-sync-interface');
    expect(matchedBinding).toEqual(expect.objectContaining({
      business: '零售',
      componentType: 'apiDoc',
      provider: 'yapi'
    }));

    expect(reloaded.scenes.mappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'scene-bundle-2' })
    ]));

    await fs.remove(sourceHome);
    await fs.remove(targetHome);
  });
});
