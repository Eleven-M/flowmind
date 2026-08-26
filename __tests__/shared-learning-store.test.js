const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');
const LearningEngine = require('../core/learning-engine');
const { getFlowMindHome } = require('../core/runtime-home');

describe('shared learning store', () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  const originalFlowMindHome = process.env.FLOWMIND_HOME;
  const originalSharedHome = process.env.FLOWMIND_SHARED_HOME;
  let sharedHome;

  beforeEach(async () => {
    sharedHome = path.join(os.tmpdir(), `flowmind-shared-learning-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(sharedHome);
    delete process.env.FLOWMIND_HOME;
    process.env.FLOWMIND_SHARED_HOME = sharedHome;
  });

  afterEach(async () => {
    for (const [key, value] of Object.entries({
      HOME: originalHome,
      USERPROFILE: originalUserProfile,
      FLOWMIND_HOME: originalFlowMindHome,
      FLOWMIND_SHARED_HOME: originalSharedHome
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.remove(sharedHome);
  });

  async function createLearningEngine() {
    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();
    return learning;
  }

  test('uses shared home when clients do not provide FLOWMIND_HOME', () => {
    expect(getFlowMindHome()).toBe(sharedHome);
  });

  test('shares bindings between independently initialized clients', async () => {
    const writer = await createLearningEngine();
    await writer.saveResourceBinding({
      id: 'shared-sls-binding',
      business: 'pts压测',
      aliases: ['pts', '压力测试'],
      componentType: 'logService',
      provider: 'aliyun-sls',
      connection: { project: 'pts-project', logstore: 'pts-logstore' }
    });

    const reader = await createLearningEngine();
    expect(reader.learningPath).toBe(path.join(sharedHome, '.flowmind', 'learning'));
    expect(await reader.listResourceBindings()).toHaveLength(1);

    const matched = await reader.matchResourceBinding('查询 pts 压测日志', 'log-audit');
    expect(matched.id).toBe('shared-sls-binding');
    expect(matched.connection.project).toBe('pts-project');
  });

  test('explicit FLOWMIND_HOME remains the higher-priority isolation override', () => {
    const isolatedHome = path.join(sharedHome, 'isolated');
    process.env.FLOWMIND_HOME = isolatedHome;
    expect(getFlowMindHome()).toBe(isolatedHome);
  });
});
