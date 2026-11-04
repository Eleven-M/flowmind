const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');
const LearningEngine = require('../core/learning-engine');
const { PersistThrottler, isWeakAlias, bigramDice } = require('../core/learning-engine');
const summaryPrompt = require('../core/ai/prompts/summary');
const selectionPrompt = require('../core/ai/prompts/selection');

function tempHomeDir(label) {
  return path.join(os.tmpdir(), `flowmind-persist-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function bindingsFile(tempHome) {
  return path.join(tempHome, '.flowmind', 'learning', 'resource-bindings.json');
}

function skillBindingsFile(tempHome) {
  return path.join(tempHome, '.flowmind', 'learning', 'skill-bindings.json');
}

describe('learning persistence throttling', () => {
  const originalDirectWrite = process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
  let tempHome;
  let writeJsonSpy;
  let renameSpy;

  beforeEach(async () => {
    jest.useFakeTimers();
    tempHome = tempHomeDir('engine');
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;
    delete process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
    writeJsonSpy = jest.spyOn(fs, 'writeJson');
    renameSpy = jest.spyOn(fs, 'rename');
  });

  afterEach(async () => {
    writeJsonSpy.mockRestore();
    renameSpy.mockRestore();
    jest.useRealTimers();
    if (originalDirectWrite === undefined) {
      delete process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
    } else {
      process.env.FLOWMIND_LEARNING_DIRECT_WRITE = originalDirectWrite;
    }
    delete process.env.FLOWMIND_HOME;
    await fs.remove(tempHome);
  });

  async function freshEngine() {
    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();
    return learning;
  }

  function writesFor(fileName) {
    return writeJsonSpy.mock.calls.filter(([target]) => String(target).includes(fileName)).length;
  }

  test('defaults to a 5s debounce that stays off-disk until the timer fires', async () => {
    const learning = await freshEngine();
    expect(learning.persistThrottleMs).toBe(5000);

    await learning.saveResourceBinding(
      { id: 'bind-1', business: '日志-uat', componentType: 'logService', aliases: ['uat-sls'] },
      { currentSkill: 'resource-bind' }
    );
    writeJsonSpy.mockClear();
    renameSpy.mockClear();

    await learning.markResourceBindingUsed('bind-1', { skillName: 'log-audit' });
    await learning.markResourceBindingUsed('bind-1', { skillName: 'log-audit' });

    expect(writesFor('resource-bindings.json')).toBe(0);
    expect(await fs.pathExists(bindingsFile(tempHome))).toBe(true); // setup write only
    const beforeAdvance = await fs.readJson(bindingsFile(tempHome));
    expect(beforeAdvance.bindings[0].stats.useCount).toBe(0);

    await jest.advanceTimersByTimeAsync(5000);
    await learning.flushLearningPersists();

    expect(writesFor('resource-bindings.json')).toBe(1);
    const persisted = await fs.readJson(bindingsFile(tempHome));
    expect(persisted.bindings[0].stats.useCount).toBe(2);
  });

  test('matchSkillRoute coalesces repeated stats writes into one flush', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('review code', 'code-review');
    writeJsonSpy.mockClear();
    renameSpy.mockClear();

    for (let i = 0; i < 5; i++) {
      await learning.matchSkillRoute('review code', ['code-review']);
    }

    expect(writesFor('skill-bindings.json')).toBe(0);
    await jest.advanceTimersByTimeAsync(5000);
    await learning.flushLearningPersists();

    expect(writesFor('skill-bindings.json')).toBe(1);
    const persisted = await fs.readJson(skillBindingsFile(tempHome));
    expect(persisted.routes[0].stats.useCount).toBe(5);
  });

  test('flushLearningPersists writes the latest content without waiting', async () => {
    const learning = await freshEngine();
    await learning.saveResourceBinding(
      { id: 'bind-flush', business: '日志-uat', componentType: 'logService' },
      { currentSkill: 'resource-bind' }
    );
    await learning.learnSkillRoute('review code', 'code-review');
    writeJsonSpy.mockClear();
    renameSpy.mockClear();

    await learning.markResourceBindingUsed('bind-flush', { skillName: 'log-audit' });
    await learning.matchSkillRoute('review code', ['code-review']);
    expect(writesFor('resource-bindings.json')).toBe(0);
    expect(writesFor('skill-bindings.json')).toBe(0);

    await learning.flushLearningPersists();

    const persistedBindings = await fs.readJson(bindingsFile(tempHome));
    expect(persistedBindings.bindings[0].stats.useCount).toBe(1);
    const persistedSkill = await fs.readJson(skillBindingsFile(tempHome));
    expect(persistedSkill.routes[0].stats.useCount).toBe(1);

    // The debounce timer is gone: no further writes happen.
    writeJsonSpy.mockClear();
    await jest.advanceTimersByTimeAsync(10000);
    expect(writesFor('resource-bindings.json')).toBe(0);
  });

  test('direct-write mode (FLOWMIND_LEARNING_DIRECT_WRITE=1) persists immediately', async () => {
    process.env.FLOWMIND_LEARNING_DIRECT_WRITE = '1';
    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();
    expect(learning.persistThrottleMs).toBe(0);

    await learning.saveResourceBinding(
      { id: 'bind-direct', business: '日志-uat', componentType: 'logService' },
      { currentSkill: 'resource-bind' }
    );
    await learning.markResourceBindingUsed('bind-direct', { skillName: 'log-audit' });

    const persisted = await fs.readJson(bindingsFile(tempHome));
    expect(persisted.bindings[0].stats.useCount).toBe(1);
  });
});

describe('PersistThrottler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('coalesces bursts into a single write and flush forces it', async () => {
    const writes = [];
    const throttler = new PersistThrottler(async () => {
      writes.push(Date.now());
    }, 100);

    throttler.markDirty();
    throttler.markDirty();
    throttler.markDirty();

    expect(writes).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(100);
    expect(writes).toHaveLength(1);
  });

  test('flush writes dirty state immediately and clears the timer', async () => {
    const writes = [];
    const throttler = new PersistThrottler(async () => {
      writes.push(1);
    }, 60000);

    throttler.markDirty();
    await throttler.flush();
    expect(writes).toHaveLength(1);

    // No double write after the (cleared) timer window.
    await jest.advanceTimersByTimeAsync(120000);
    expect(writes).toHaveLength(1);
  });

  test('a failed write restores the dirty flag for the next flush', async () => {
    let shouldFail = true;
    const attempts = [];
    const throttler = new PersistThrottler(async () => {
      attempts.push(1);
      if (shouldFail) {
        throw new Error('disk full');
      }
    }, 50);

    throttler.markDirty();
    await jest.advanceTimersByTimeAsync(50);
    expect(attempts).toHaveLength(1);
    expect(throttler.dirty).toBe(true);

    shouldFail = false;
    await throttler.flush();
    expect(attempts).toHaveLength(2);
    expect(throttler.dirty).toBe(false);
  });

  test('flush is a no-op when nothing is dirty', async () => {
    let writes = 0;
    const throttler = new PersistThrottler(async () => {
      writes += 1;
    }, 50);

    await throttler.flush();
    expect(writes).toBe(0);
  });
});

describe('matchResourceBinding scoring quality', () => {
  const originalDirectWrite = process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
  let tempHome;

  beforeEach(async () => {
    tempHome = tempHomeDir('match');
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;
    process.env.FLOWMIND_LEARNING_DIRECT_WRITE = '1';
  });

  afterEach(async () => {
    if (originalDirectWrite === undefined) {
      delete process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
    } else {
      process.env.FLOWMIND_LEARNING_DIRECT_WRITE = originalDirectWrite;
    }
    delete process.env.FLOWMIND_HOME;
    await fs.remove(tempHome);
  });

  async function freshEngine() {
    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();
    return learning;
  }

  test('isWeakAlias flags short and environment-only aliases', () => {
    expect(isWeakAlias('test')).toBe(true);
    expect(isWeakAlias('uat')).toBe(true);
    expect(isWeakAlias('生产')).toBe(true);
    expect(isWeakAlias('api')).toBe(true);
    expect(isWeakAlias('acme-takeout')).toBe(false);
    expect(isWeakAlias('uat-sls')).toBe(false);
    expect(isWeakAlias('')).toBe(true);
  });

  test('weak aliases no longer steal matches from strong aliases', async () => {
    const learning = await freshEngine();
    await learning.saveResourceBinding(
      {
        id: 'bind-short',
        business: 'api文档',
        aliases: ['api'],
        componentType: 'apiDoc',
        provider: 'yapi'
      },
      { currentSkill: 'resource-bind' }
    );
    await learning.saveResourceBinding(
      {
        id: 'bind-service',
        business: 'acme-takeout',
        aliases: ['acme-takeout'],
        componentType: 'apiDoc',
        provider: 'yapi'
      },
      { currentSkill: 'resource-bind' }
    );

    // The short alias "api" appears inside "yapi-api-takeout" but must not
    // outscore the concrete service alias.
    const matched = await learning.matchResourceBinding('同步 yapi-api-takeout 接口', 'yapi-sync-interface');
    expect(matched?.id).toBe('bind-service');
  });

  test('bigram similarity scores fuzzy alias hits', async () => {
    const learning = await freshEngine();
    await learning.saveResourceBinding(
      {
        id: 'bind-fuzzy',
        business: 'acme-takeout',
        aliases: ['acme-takeout'],
        componentType: 'logService',
        provider: 'aliyun-sls'
      },
      { currentSkill: 'resource-bind' }
    );

    // Typo: "acme-takeuot" instead of "acme-takeout".
    const matched = await learning.matchResourceBinding('查 acme-takeuot 服务日志', 'log-audit');
    expect(matched?.id).toBe('bind-fuzzy');
    expect(bigramDice('acme-takeout', '查 acme-takeuot 服务日志')).toBeGreaterThanOrEqual(0.5);
  });

  test('bestScore=0 without a promoted preference returns null', async () => {
    const learning = await freshEngine();
    await learning.saveResourceBinding(
      {
        id: 'bind-db',
        business: '订单库',
        aliases: ['order-db'],
        componentType: 'databaseQuery',
        provider: 'mysql'
      },
      { currentSkill: 'resource-bind' }
    );

    // No component type, env, alias, or keyword matches the input, and no
    // preference was ever promoted: the unique binding must not leak through.
    const matched = await learning.matchResourceBinding('帮我看看今天天气', 'resource-bind');
    expect(matched).toBeNull();
  });

  test('bestScore=0 still falls back to a promoted preference', async () => {
    const learning = await freshEngine();
    await learning.saveResourceBinding(
      {
        id: 'bind-promoted',
        business: '订单库',
        aliases: ['order-db'],
        componentType: 'databaseQuery',
        provider: 'mysql'
      },
      { currentSkill: 'resource-bind' }
    );

    // Manually promote: the log-audit skill prefers this binding even though
    // the binding itself scores zero for log queries.
    learning.skillBindings.bindings['log-audit'] = {
      learningCount: 0,
      records: [],
      rules: [],
      preferredResourceBindings: { logService: 'bind-promoted' }
    };

    const matched = await learning.matchResourceBinding('查询日志', 'log-audit');
    expect(matched?.id).toBe('bind-promoted');
  });

  test('explicit env requests keep working and do not cross environments', async () => {
    const learning = await freshEngine();
    await learning.saveResourceBinding(
      {
        id: 'bind-test',
        business: '日志-test',
        aliases: ['test-sls'],
        componentType: 'logService',
        connection: { env: 'test', project: 'k8s-log-test', logstore: 'test_reg_log' }
      },
      { currentSkill: 'resource-bind' }
    );
    await learning.saveResourceBinding(
      {
        id: 'bind-uat',
        business: '日志-uat',
        aliases: ['uat-sls'],
        componentType: 'logService',
        connection: { env: 'uat', project: 'k8s-log-uat', logstore: 'uat_reg_log' }
      },
      { currentSkill: 'resource-bind' }
    );

    const uatMatch = await learning.matchResourceBinding('查询uat环境的日志', 'log-audit');
    expect(uatMatch?.id).toBe('bind-uat');

    const prodMatch = await learning.matchResourceBinding('查询prod环境的日志', 'log-audit');
    expect(prodMatch).toBeNull();
  });
});

describe('getRouteHistoryHint', () => {
  const originalDirectWrite = process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
  let tempHome;

  beforeEach(async () => {
    tempHome = tempHomeDir('hint');
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;
    process.env.FLOWMIND_LEARNING_DIRECT_WRITE = '1';
  });

  afterEach(async () => {
    if (originalDirectWrite === undefined) {
      delete process.env.FLOWMIND_LEARNING_DIRECT_WRITE;
    } else {
      process.env.FLOWMIND_LEARNING_DIRECT_WRITE = originalDirectWrite;
    }
    delete process.env.FLOWMIND_HOME;
    await fs.remove(tempHome);
  });

  async function freshEngine() {
    const config = new ConfigManager();
    await config.load();
    const learning = new LearningEngine(config);
    await learning.init();
    return learning;
  }

  test('returns similar routes for available skills without mutating stats', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('查询 uat-acme-takeout pipeline', 'auto-flow');
    await learning.learnSkillRoute('查询 uat-acme-takeout 状态', 'auto-flow-status');
    await learning.learnSkillRoute('查询 完全不同的东西', 'log-audit');

    const hints = learning.getRouteHistoryHint('查询 uat-acme-takeout 的流水线', ['auto-flow', 'auto-flow-status']);
    expect(hints.length).toBeGreaterThan(0);
    expect(hints[0]).toEqual(
      expect.objectContaining({
        skill: expect.any(String),
        useCount: expect.any(Number),
        similarity: expect.any(Number)
      })
    );
    expect(hints.every((hint) => ['auto-flow', 'auto-flow-status'].includes(hint.skill))).toBe(true);

    // Pure read: use counts unchanged.
    expect(learning.skillBindings.routes.every((route) => (route.stats.useCount || 0) === 0)).toBe(true);
  });

  test('filters by intent family and respects the limit', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('部署 uat-acme-takeout 服务', 'auto-flow');
    await learning.learnSkillRoute('查询 uat-acme-takeout pipeline', 'auto-flow');

    const hints = learning.getRouteHistoryHint('查询 uat-acme-takeout 的流水线', ['auto-flow'], 3);
    expect(hints).toHaveLength(1);
    expect(hints[0].skill).toBe('auto-flow');

    expect(learning.getRouteHistoryHint('完全无关', ['auto-flow'])).toEqual([]);
    expect(learning.getRouteHistoryHint('查询 uat-acme-takeout 的流水线', ['other-skill'])).toEqual([]);
  });
});

describe('AI prompts consume learning context', () => {
  test('summary prompt renders learned constraints', () => {
    const withLearnings = summaryPrompt.user({ ok: true }, {
      skill: 'log-audit',
      learnings: [
        { condition: '当查询日志时', action: '使用表格输出' },
        { condition: '当出现 traceId 时', action: '优先按 trace 查询' }
      ]
    });
    expect(withLearnings).toContain('已学习约束（必须遵循）');
    expect(withLearnings).toContain('当查询日志时 → 使用表格输出');
    expect(withLearnings).toContain('当出现 traceId 时 → 优先按 trace 查询');

    const withoutLearnings = summaryPrompt.user({ ok: true }, { skill: 'log-audit' });
    expect(withoutLearnings).not.toContain('已学习约束');
  });

  test('summary prompt caps learned constraints at 10', () => {
    const learnings = Array.from({ length: 15 }, (_, i) => ({ condition: `条件${i}`, action: `动作${i}` }));
    const prompt = summaryPrompt.user({ ok: true }, { learnings });
    expect(prompt).toContain('条件0 → 动作0');
    expect(prompt).toContain('条件9 → 动作9');
    expect(prompt).not.toContain('条件10 →');
  });

  test('selection prompt renders route history hints', () => {
    const prompt = selectionPrompt.user('查询日志', [{ name: 'log-audit' }], {
      routeHistory: [
        { skill: 'log-audit', useCount: 3, similarity: 0.85 },
        { skill: 'auto-flow', useCount: 1, similarity: 0.6 }
      ]
    });
    expect(prompt).toContain('历史学习路由');
    expect(prompt).toContain('log-audit（历史使用 3 次，相似度 0.85）');

    const withoutHistory = selectionPrompt.user('查询日志', [{ name: 'log-audit' }], {});
    expect(withoutHistory).not.toContain('历史学习路由');
  });
});
