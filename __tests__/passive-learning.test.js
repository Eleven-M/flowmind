const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');
const LearningEngine = require('../core/learning-engine');
const SceneMatcher = require('../core/scene-matcher');

describe('passive learning promotion', () => {
  const originalHome = process.env.FLOWMIND_HOME;

  afterEach(async () => {
    if (originalHome === undefined) {
      delete process.env.FLOWMIND_HOME;
    } else {
      process.env.FLOWMIND_HOME = originalHome;
    }
  });

  test('promotes frequently used resource bindings into skill preferences', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-passive-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();

    const preferred = await learning.saveResourceBinding({
      id: 'bind-preferred',
      business: '零售',
      aliases: ['retail'],
      componentType: 'apiDoc',
      provider: 'yapi',
      mcpServer: 'yapi-mcp'
    }, { currentSkill: 'resource-bind' });
    await learning.saveResourceBinding({
      id: 'bind-other',
      business: '外卖',
      aliases: ['takeout'],
      componentType: 'apiDoc',
      provider: 'yapi',
      mcpServer: 'yapi-mcp'
    }, { currentSkill: 'resource-bind' });

    for (let i = 0; i < 3; i++) {
      await learning.markResourceBindingUsed(preferred.id, {
        input: '同步接口到 yapi',
        skillName: 'yapi-sync-interface'
      });
    }

    const matched = await learning.matchResourceBinding('同步接口到 yapi', 'yapi-sync-interface');
    expect(matched.id).toBe('bind-preferred');

    const prefsPath = path.join(tempHome, '.flowmind', 'learning', 'records', 'yapi-sync-interface', 'preferences.json');
    const prefs = await fs.readJson(prefsPath);
    expect(prefs.preferredResourceBindings.apiDoc).toEqual(expect.objectContaining({
      bindingId: 'bind-preferred',
      business: '零售'
    }));

    const recordPath = path.join(tempHome, '.flowmind', 'learning', 'records', 'yapi-sync-interface', 'auto-resource-yapi-sync-interface-apiDoc.json');
    expect(await fs.pathExists(recordPath)).toBe(true);

    await fs.remove(tempHome);
  });

  test('falls back to the most used binding when a skill has no direct log match', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-passive-fallback-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();

    await learning.saveResourceBinding({
      id: 'bind-sls-test',
      business: '日志-test',
      aliases: ['test', 'test-sls'],
      componentType: 'logService',
      provider: 'aliyun-sls',
      mcpServer: 'friday-sls-logs',
      stats: {
        useCount: 11,
        lastUsed: '2026-07-02T09:22:20.275Z'
      }
    }, { currentSkill: 'resource-bind' });

    await learning.saveResourceBinding({
      id: 'bind-sls-uat',
      business: '日志-uat',
      aliases: ['uat', 'uat-sls'],
      componentType: 'logService',
      provider: 'aliyun-sls',
      mcpServer: 'friday-sls-logs',
      stats: {
        useCount: 2,
        lastUsed: '2026-07-01T09:22:20.275Z'
      }
    }, { currentSkill: 'resource-bind' });

    const matched = await learning.matchResourceBinding('查看最近 1 小时日志', 'sls-log-audit');
    expect(matched.id).toBe('bind-sls-test');

    await fs.remove(tempHome);
  });

  test('does not reuse a test binding when the request explicitly asks for uat', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-passive-env-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();

    await learning.saveResourceBinding({
      id: 'bind-sls-test',
      business: 'test:test_reg_log',
      aliases: ['test', 'test-sls'],
      componentType: 'logService',
      provider: 'aliyun-sls',
      mcpServer: 'friday-sls-logs',
      connection: {
        env: 'test',
        project: 'k8s-log-cf93fe1dde8584346a2d81575c79aff9e',
        logstore: 'test_reg_log'
      }
    }, { currentSkill: 'resource-bind' });

    const matched = await learning.matchResourceBinding('查询uat环境中的日志：96a8f1cd42b4eed9', 'log-audit');
    expect(matched).toBeNull();

    await fs.remove(tempHome);
  });

  test('does not reuse a uat binding when the request explicitly asks for online prod', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-passive-prod-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();

    await learning.saveResourceBinding({
      id: 'bind-sls-uat',
      business: 'uat:uat-log',
      aliases: ['uat', 'uat-sls'],
      componentType: 'logService',
      provider: 'aliyun-sls',
      mcpServer: 'friday-sls-logs',
      connection: {
        env: 'uat',
        project: 'k8s-log-cf93fe1dde8584346a2d81575c79aff9e',
        logstore: 'uat-log'
      }
    }, { currentSkill: 'resource-bind' });

    const matched = await learning.matchResourceBinding('查询线上环境日志内容', 'log-audit');
    expect(matched).toBeNull();

    await fs.remove(tempHome);
  });

  test('promotes successful scene usage into a global learning record', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-scene-${Date.now()}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;

    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();
    const matcher = new SceneMatcher(config, learning);
    await matcher.loadScenes();

    const scene = await matcher.addScene({
      name: '查询业务配置数据',
      keywords: ['配置数据', '查询配置'],
      patterns: ['查询.*配置.*数据'],
      workflow: {
        skills: [
          { skill: 'data-logic-validation', params: { action: 'query-by-code-logic' } }
        ]
      },
      preferences: {
        outputFormat: 'structured'
      }
    });

    await matcher.updateSceneStats(scene.id, true, { input: '查询业务配置数据' });
    await matcher.updateSceneStats(scene.id, true, { input: '查询业务配置数据' });

    const recordPath = path.join(tempHome, '.flowmind', 'learning', 'records', '_global', `auto-scene-${scene.id}.json`);
    expect(await fs.pathExists(recordPath)).toBe(true);

    const prefsPath = path.join(tempHome, '.flowmind', 'learning', 'records', '_global', 'preferences.json');
    const prefs = await fs.readJson(prefsPath);
    expect(prefs.preferredScenes[scene.id]).toEqual(expect.objectContaining({
      name: '查询业务配置数据',
      primarySkill: 'data-logic-validation',
      useCount: 2
    }));

    await fs.remove(tempHome);
  });
});
