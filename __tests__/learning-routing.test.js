const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');
const LearningEngine = require('../core/learning-engine');

describe('learning-engine smart routing', () => {
  let tempHome;

  beforeEach(async () => {
    tempHome = path.join(os.tmpdir(), `flowmind-routing-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;
  });

  afterEach(async () => {
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

  test('frequency boost makes high-use route win over equal-dice route', async () => {
    const learning = await freshEngine();
    const skillA = 'code-review';
    const skillB = 'project-review';

    // Two routes with nearly identical normalized inputs that produce high/equal Dice scores.
    // "review code changes a" → "reviewcodechangesa"
    // "review code changes b" → "reviewcodechangesb"
    // Query "review code changes c" → "reviewcodechangesc" shares 16/17 bigrams with each.
    await learning.learnSkillRoute('review code changes a', skillA);
    await learning.learnSkillRoute('review code changes b', skillB);

    // Simulate heavy usage of skillA by bumping useCount directly
    learning.skillBindings.routes[0].stats.useCount = 10;
    learning.skillBindings.routes[1].stats.useCount = 0;
    await learning.saveSkillBindings();

    const matched = await learning.matchSkillRoute('review code changes c', [skillA, skillB]);
    expect(matched).not.toBeNull();
    expect(matched.skill).toBe(skillA);
  });

  test('temporal decay favors recently used route over stale route', async () => {
    const learning = await freshEngine();
    const skillA = 'code-review';
    const skillB = 'project-review';

    await learning.learnSkillRoute('review code changes a', skillA);
    await learning.learnSkillRoute('review code changes b', skillB);

    // Route A last used 200 days ago, Route B last used just now
    learning.skillBindings.routes[0].stats.lastUsed = new Date(Date.now() - 200 * 86400000).toISOString();
    learning.skillBindings.routes[1].stats.lastUsed = new Date().toISOString();
    await learning.saveSkillBindings();

    const matched = await learning.matchSkillRoute('review code changes c', [skillA, skillB]);
    expect(matched).not.toBeNull();
    expect(matched.skill).toBe(skillB);
  });

  test('correction penalty suppresses repeatedly corrected routes', async () => {
    const learning = await freshEngine();
    const skillA = 'code-review';
    const skillB = 'project-review';

    // Start with skillA
    await learning.learnSkillRoute('review code', skillA);
    // Alternate to accumulate 3 corrections
    await learning.learnSkillRoute('review code', skillB); // correction 1 (A→B)
    await learning.learnSkillRoute('review code', skillA); // correction 2 (B→A)
    await learning.learnSkillRoute('review code', skillB); // correction 3 (A→B)

    const correctionCount = learning.skillBindings.routes[0].stats.correctionCount;
    expect(correctionCount).toBe(3);

    // Exact match bypasses the 0.72 threshold check, but correctionPenalty=0.3
    // heavily reduces the score: (1.0 + 0) * 0.85 - 0.3 = 0.55
    const matched = await learning.matchSkillRoute('review code', [skillA, skillB]);
    expect(matched).not.toBeNull();
    expect(matched.skill).toBe(skillB);
    expect(matched.confidence).toBeLessThan(0.7);
  });

  test('exact match still wins when there are no corrections', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('analyze code', 'code-review');

    const matched = await learning.matchSkillRoute('analyze code', ['code-review']);
    expect(matched).not.toBeNull();
    expect(matched.skill).toBe('code-review');
    // With no corrections and fresh route: (1.0 + 0) * ~1.0 - 0 = ~1.0
    expect(matched.confidence).toBeGreaterThanOrEqual(0.85);
  });

  test('routes without stats object work correctly (backward compatibility)', async () => {
    const learning = await freshEngine();
    // Manually inject a route without stats
    learning.skillBindings.routes = [
      {
        id: 'legacy-route',
        input: 'review code',
        normalizedInput: 'reviewcode',
        intentFamily: 'analyze',
        skill: 'code-review',
        source: 'user',
        createdAt: new Date().toISOString()
        // no stats field at all
      }
    ];
    await learning.saveSkillBindings();

    const matched = await learning.matchSkillRoute('review code', ['code-review']);
    expect(matched).not.toBeNull();
    expect(matched.skill).toBe('code-review');
    // After matching, stats should be created
    expect(matched.route.stats.useCount).toBe(1);
  });

  test('learnSkillRoute records correctionCount when skill changes', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('review code', 'code-review');
    expect(learning.skillBindings.routes[0].stats.correctionCount || 0).toBe(0);

    await learning.learnSkillRoute('review code', 'project-review');
    expect(learning.skillBindings.routes[0].stats.correctionCount).toBe(1);
    expect(learning.skillBindings.routes[0].stats.lastCorrected).toBeTruthy();

    // Learning the same skill again should NOT increment correctionCount
    await learning.learnSkillRoute('review code', 'project-review');
    expect(learning.skillBindings.routes[0].stats.correctionCount).toBe(1);
  });

  test('semantic duplicates link to the previously learned skill route quickly', async () => {
    const learning = await freshEngine();

    await learning.learnSkillRoute('帮我分析当前合同校验额度流程', 'offline-design-analysis');
    await learning.learnSkillRoute('梳理一下合同校验额度流程', 'offline-design-analysis');

    expect(learning.skillBindings.routes).toHaveLength(1);
    expect(learning.skillBindings.routes[0].stats.learnCount).toBe(2);
    expect(learning.skillBindings.routes[0].semanticKey).toBeTruthy();

    const matched = await learning.matchSkillRoute(
      '分析合同校验额度流程',
      ['offline-design-analysis', 'auto-flow']
    );
    expect(matched).toEqual(expect.objectContaining({
      skill: 'offline-design-analysis',
      confidence: expect.any(Number)
    }));
    expect(matched.confidence).toBeGreaterThan(0.8);
    expect(matched.route.stats.useCount).toBe(1);
  });

  test('route below Dice threshold is not matched even with high useCount', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('completely different thing', 'code-review');
    learning.skillBindings.routes[0].stats.useCount = 100;
    await learning.saveSkillBindings();

    const matched = await learning.matchSkillRoute('review code', ['code-review']);
    expect(matched).toBeNull();
  });

  test('confidence never goes below 0', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('review code', 'code-review');
    // Alternate many times to push penalty to max (0.3)
    for (let i = 0; i < 10; i++) {
      const target = i % 2 === 0 ? 'project-review' : 'code-review';
      await learning.learnSkillRoute('review code', target);
    }

    const matched = await learning.matchSkillRoute('review code', ['code-review']);
    expect(matched).not.toBeNull();
    expect(matched.confidence).toBeGreaterThanOrEqual(0);
  });

  test('disables a route after repeated negative feedback', async () => {
    const learning = await freshEngine();
    await learning.learnSkillRoute('查询部署状态', 'auto-flow');

    await learning.recordSkillRouteFeedback('查询部署状态', { correct: false });
    await learning.recordSkillRouteFeedback('查询部署状态', { correct: false });
    const route = await learning.recordSkillRouteFeedback('查询部署状态', { correct: false });

    expect(route.status).toBe('disabled');
    expect(await learning.matchSkillRoute('查询部署状态', ['auto-flow'])).toBeNull();
  });

  test('passive route promotion requires three eligible observations', async () => {
    const learning = await freshEngine();
    learning.config.set('learning.autoPromote.skillRouteMinSuccesses', 3);

    const first = await learning.learnSuccessfulSkillRoute('分析部署变更', 'offline-design-analysis', {
      quality: 'likely',
      confidence: 0.7
    });
    const second = await learning.learnSuccessfulSkillRoute('分析部署变更', 'offline-design-analysis', {
      quality: 'likely',
      confidence: 0.8
    });
    expect(first.promoted).toBe(false);
    expect(second.promoted).toBe(false);

    const third = await learning.learnSuccessfulSkillRoute('分析部署变更', 'offline-design-analysis', {
      quality: 'confirmed',
      confidence: 1
    });
    expect(third.promoted).toBe(true);
    expect(third.route.source).toBe('passive-success');
  });
});
