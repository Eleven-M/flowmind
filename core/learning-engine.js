/**
 * FlowMind Learning Engine
 * Handles learning from user corrections and preferences
 */

const fs = require('fs-extra');
const path = require('path');
const { randomUUID } = require('crypto');
const eventBus = require('./event-bus');
const { expandPath } = require('./utils');

function shortId() {
  return randomUUID().slice(0, 8);
}

function compareBindingFallback(left, right) {
  const leftUses = Number(left?.stats?.useCount) || 0;
  const rightUses = Number(right?.stats?.useCount) || 0;
  if (leftUses !== rightUses) {
    return rightUses - leftUses;
  }

  const leftLastUsed = Date.parse(left?.stats?.lastUsed || left?.timestamp || 0) || 0;
  const rightLastUsed = Date.parse(right?.stats?.lastUsed || right?.timestamp || 0) || 0;
  if (leftLastUsed !== rightLastUsed) {
    return rightLastUsed - leftLastUsed;
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''));
}

/**
 * Per-key write queue to prevent concurrent read-modify-write races
 */
class WriteQueue {
  constructor() {
    this.queues = new Map();
  }

  async run(key, fn) {
    if (!this.queues.has(key)) {
      this.queues.set(key, Promise.resolve());
    }
    const prev = this.queues.get(key);
    const next = prev.then(fn, fn);
    this.queues.set(key, next);
    return next;
  }
}

/**
 * Debounced persister for high-frequency write paths. Marks state dirty and
 * coalesces bursts of writes into a single delayed flush; a failed write
 * restores the dirty flag so the next flush retries.
 */
class PersistThrottler {
  constructor(writeFn, delayMs = 5000) {
    this.writeFn = writeFn;
    this.delayMs = Math.max(0, Number(delayMs) || 0);
    this.dirty = false;
    this.timer = null;
    this.pending = null;
  }

  markDirty() {
    this.dirty = true;
    if (this.delayMs > 0 && !this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        this.write();
      }, this.delayMs);
      if (typeof this.timer.unref === 'function') {
        this.timer.unref();
      }
    }
  }

  write() {
    if (this.pending) {
      return this.pending;
    }
    if (!this.dirty) {
      return Promise.resolve();
    }
    this.dirty = false;
    this.pending = Promise.resolve()
      .then(() => this.writeFn())
      .catch(() => {
        this.dirty = true;
      })
      .then(() => {
        this.pending = null;
      });
    return this.pending;
  }

  async flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.write();
  }
}

class LearningEngine {
  constructor(config, honorEngine = null) {
    this.config = config;
    this.honorEngine = honorEngine;
    this.learningPath = null;
    this.writeQueue = new WriteQueue();
    this.persistThrottleMs = Math.max(
      0,
      Number(
        config?.get?.(
          'learning.persistThrottleMs',
          process.env.FLOWMIND_LEARNING_DIRECT_WRITE === '1' ? 0 : 5000
        )
      ) || 0
    );
    this.resourceBindingsThrottler = new PersistThrottler(
      () => this.saveResourceBindings(),
      this.persistThrottleMs
    );
    this.skillBindingsThrottler = new PersistThrottler(
      () => this.saveSkillBindings(),
      this.persistThrottleMs
    );
    this.records = {};
    this.skillBindings = {};
    this.resourceBindings = {};
    this.scenes = { version: '1.0', mappings: [] };
    this.semanticIndex = { version: '1.0', entries: [], lastUpdated: null };
    this.stats = {};
    this.initialized = false;
  }

  /**
   * Initialize learning engine
   */
  async init() {
    this.learningPath = this.config.get(
      'learning.storagePath',
      path.join(process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE || '', '.flowmind', 'learning')
    );

    // Ensure directories exist
    await fs.ensureDir(this.expandPath(this.learningPath));
    await fs.ensureDir(path.join(this.expandPath(this.learningPath), 'records'));

    // Load existing data
    await this.loadRecords();
    await this.loadSkillBindings();
    await this.loadResourceBindings();
    await this.loadScenes();
    await this.loadStats();
    await this.loadSemanticIndex();

    this.initialized = true;
  }

  /**
   * Detect if input is a learning opportunity
   */
  async detectLearning(input, context) {
    // Check for correction patterns
    const correction = this.detectCorrection(input);
    if (correction) {
      return await this.recordCorrection(correction, context);
    }

    // Check for scene mapping patterns
    const sceneMapping = this.detectSceneMapping(input);
    if (sceneMapping) {
      return await this.recordSceneMapping(sceneMapping, context);
    }

    // Check for preference patterns
    const preference = this.detectPreference(input);
    if (preference) {
      return await this.recordPreference(preference, context);
    }

    return null;
  }

  /**
   * Detect correction patterns
   */
  detectCorrection(input) {
    const correctionPatterns = [
      // Chinese patterns
      { regex: /不对|错了|错误|有误/i, type: 'correction', severity: 'major' },
      { regex: /应该是|正确的是|改成|改为/i, type: 'correction', severity: 'major' },
      { regex: /不是这样|重新处理|重来/i, type: 'correction', severity: 'major' },
      { regex: /更准确|更好|优化|改进|调整/i, type: 'refinement', severity: 'minor' },
      // English patterns
      { regex: /incorrect|wrong|error|mistake/i, type: 'correction', severity: 'major' },
      { regex: /should be|change to|fix this/i, type: 'correction', severity: 'major' },
      { regex: /refine|improve|optimize|adjust/i, type: 'refinement', severity: 'minor' }
    ];

    for (const pattern of correctionPatterns) {
      if (pattern.regex.test(input)) {
        return {
          type: pattern.type,
          severity: pattern.severity,
          trigger: input.match(pattern.regex)[0],
          input: input
        };
      }
    }

    return null;
  }

  /**
   * Detect scene mapping patterns
   */
  detectSceneMapping(input) {
    const scenePatterns = [
      { regex: /查询.*用.*方式/i, pattern: 'query_method' },
      { regex: /xxx.*问题找.*技能/i, pattern: 'skill_mapping' },
      { regex: /这类.*需求走.*流程/i, pattern: 'workflow' },
      { regex: /以后.*这种.*都用/i, pattern: 'preference' },
      { regex: /直接用.*处理/i, pattern: 'direct_method' },
      { regex: /记住.*方式|下次.*这样/i, pattern: 'remember' }
    ];

    for (const pattern of scenePatterns) {
      if (pattern.regex.test(input)) {
        return {
          type: 'scene_mapping',
          pattern: pattern.pattern,
          input: input
        };
      }
    }

    return null;
  }

  /**
   * Detect preference patterns
   */
  detectPreference(input) {
    const preferencePatterns = [
      { regex: /用.*格式|格式用/i, type: 'format' },
      { regex: /语言用|用.*语言/i, type: 'language' },
      { regex: /排序.*方式|按.*排序/i, type: 'sorting' },
      { regex: /显示.*详情|简洁.*显示/i, type: 'detail_level' }
    ];

    for (const pattern of preferencePatterns) {
      if (pattern.regex.test(input)) {
        return {
          type: 'preference',
          preferenceType: pattern.type,
          input: input
        };
      }
    }

    return null;
  }

  /**
   * Record a correction
   */
  async recordCorrection(correction, context) {
    const record = {
      id: `learn-${Date.now()}-${shortId()}`,
      timestamp: new Date().toISOString(),
      type: correction.type,
      severity: correction.severity,
      trigger: correction.trigger,
      input: correction.input,
      context: context,
      skill: context.currentSkill || 'unknown',
      application: {
        condition: this.extractCondition(correction.input),
        action: this.extractAction(correction.input),
        priority: correction.severity === 'major' ? 'high' : 'medium'
      },
      stats: {
        appliedCount: 0,
        successCount: 0
      }
    };

    // Save record
    await this.saveLearningRecord(record);

    // Update skill bindings
    await this.updateSkillBindings(record);

    // Update stats
    await this.updateStats('correction', record.skill);

    eventBus.emit('learning:recorded', {
      type: 'correction',
      skill: record.skill,
      recordId: record.id,
      severity: record.severity
    });

    return {
      type: 'correction',
      record: record,
      confirmation: this.formatLearningConfirmation(record)
    };
  }

  /**
   * Record a scene mapping
   */
  async recordSceneMapping(sceneMapping, context) {
    const record = {
      id: `scene-${Date.now()}-${shortId()}`,
      timestamp: new Date().toISOString(),
      type: 'scene_mapping',
      input: sceneMapping.input,
      pattern: sceneMapping.pattern,
      context: context,
      keywords: this.extractKeywords(sceneMapping.input),
      workflow: this.extractWorkflow(sceneMapping.input),
      preferences: this.extractPreferences(sceneMapping.input),
      stats: {
        useCount: 0,
        lastUsed: null,
        successRate: 1.0
      }
    };

    // Save scene mapping
    await this.saveSceneMapping(record);

    // Update stats
    await this.updateStats('scene_mapping', 'global');

    eventBus.emit('learning:recorded', {
      type: 'scene_mapping',
      skill: 'global',
      recordId: record.id,
      keywords: record.keywords
    });

    return {
      type: 'scene_mapping',
      record: record,
      confirmation: this.formatSceneMappingConfirmation(record)
    };
  }

  /**
   * Record a preference
   */
  async recordPreference(preference, context) {
    const record = {
      id: `pref-${Date.now()}-${shortId()}`,
      timestamp: new Date().toISOString(),
      type: 'preference',
      preferenceType: preference.preferenceType,
      input: preference.input,
      context: context,
      value: this.extractPreferenceValue(preference.input),
      skill: context.currentSkill || 'global'
    };

    // Save preference
    await this.savePreference(record);

    // Update stats
    await this.updateStats('preference', record.skill);

    eventBus.emit('learning:recorded', {
      type: 'preference',
      skill: record.skill,
      recordId: record.id,
      preferenceType: record.preferenceType
    });

    return {
      type: 'preference',
      record: record,
      confirmation: this.formatPreferenceConfirmation(record)
    };
  }

  /**
   * Get learning rules for a skill
   */
  async getSkillLearnings(skillName) {
    const bindings = this.skillBindings.bindings?.[skillName] || { records: [], rules: [] };
    return bindings.rules || [];
  }

  /**
   * Get preferences for a skill
   */
  async getPreferences(skillName) {
    const prefsPath = path.join(this.expandPath(this.learningPath), 'records', skillName, 'preferences.json');

    if (await fs.pathExists(prefsPath)) {
      return await fs.readJson(prefsPath);
    }

    return {};
  }

  /**
   * Save a business/resource binding for later reuse.
   */
  async saveResourceBinding(binding, context = {}) {
    const normalized = {
      id: binding.id || `bind-${Date.now()}-${shortId()}`,
      timestamp: binding.timestamp || new Date().toISOString(),
      business: binding.business || 'default',
      aliases: [...new Set([binding.business, ...(binding.aliases || [])].filter(Boolean))],
      componentType: binding.componentType || null,
      provider: binding.provider || null,
      mcpServer: binding.mcpServer || null,
      skill: binding.skill || context.currentSkill || 'resource-bind',
      source: binding.source || 'manual',
      keywords: [...new Set(binding.keywords || this.extractKeywords(binding.business || ''))],
      connection: { ...(binding.connection || {}) },
      metadata: { ...(binding.metadata || {}) },
      stats: {
        useCount: binding.stats?.useCount || 0,
        lastUsed: binding.stats?.lastUsed || null
      }
    };

    await this.writeQueue.run('resource-bindings', async () => {
      this.resourceBindings.bindings = this.resourceBindings.bindings || [];
      const index = this.resourceBindings.bindings.findIndex(
        (item) =>
          item.id === normalized.id ||
          (item.business === normalized.business &&
            item.componentType === normalized.componentType &&
            item.provider === normalized.provider)
      );

      if (index >= 0) {
        const previous = this.resourceBindings.bindings[index];
        this.resourceBindings.bindings[index] = {
          ...previous,
          ...normalized,
          aliases: [...new Set([...(previous.aliases || []), ...normalized.aliases])],
          keywords: [...new Set([...(previous.keywords || []), ...normalized.keywords])],
          connection: { ...(previous.connection || {}), ...(normalized.connection || {}) },
          metadata: { ...(previous.metadata || {}), ...(normalized.metadata || {}) },
          timestamp: normalized.timestamp
        };
        normalized.id = this.resourceBindings.bindings[index].id;
      } else {
        this.resourceBindings.bindings.push(normalized);
      }

      this.resourceBindings.lastUpdated = new Date().toISOString();
      await this.saveResourceBindings();
    });

    await this.updateStats('resource_binding', normalized.skill);

    eventBus.emit('learning:recorded', {
      type: 'resource_binding',
      skill: normalized.skill,
      recordId: normalized.id,
      business: normalized.business,
      componentType: normalized.componentType,
      provider: normalized.provider
    });

    return normalized;
  }

  /**
   * Return all stored resource bindings.
   */
  async listResourceBindings() {
    return this.resourceBindings.bindings || [];
  }

  /**
   * Find the best-matching binding for an input and skill context.
   */
  async matchResourceBinding(input, skillName = null) {
    const bindings = this.resourceBindings.bindings || [];
    if (!bindings.length) return null;

    const componentType = this.inferComponentType(input, skillName);
    const normalized = String(input || '').toLowerCase();
    const requestedEnv = inferEnvToken(input);
    const preferredBindingId = componentType
      ? this.skillBindings.bindings?.[skillName]?.preferredResourceBindings?.[componentType] || null
      : null;

    let best = null;
    let bestScore = 0;
    const envMatches = [];

    for (const binding of bindings) {
      let score = 0;
      const bindingEnv = inferBindingEnv(binding);

      if (requestedEnv && bindingEnv && bindingEnv !== requestedEnv) {
        continue;
      }

      if (requestedEnv && bindingEnv && bindingEnv === requestedEnv) {
        score += 10;
        envMatches.push(binding);
      }

      if (componentType && binding.componentType === componentType) {
        score += 4;
      }

      if (binding.provider && normalized.includes(String(binding.provider).toLowerCase())) {
        score += 3;
      }

      if (binding.mcpServer && normalized.includes(String(binding.mcpServer).toLowerCase())) {
        score += 3;
      }

      if (preferredBindingId && binding.id === preferredBindingId) {
        score += 8;
      }

      for (const alias of binding.aliases || []) {
        if (!alias) continue;
        const normalizedAlias = String(alias).toLowerCase();
        if (isWeakAlias(normalizedAlias)) continue;
        if (normalized.includes(normalizedAlias)) {
          score += 6;
        } else if (bigramDice(normalizedAlias, normalized) >= 0.5) {
          score += 3;
        }
      }

      for (const keyword of binding.keywords || []) {
        if (!keyword) continue;
        const normalizedKeyword = String(keyword).toLowerCase();
        if (normalized.includes(normalizedKeyword)) {
          score += 1;
        } else if (bigramDice(normalizedKeyword, normalized) >= 0.5) {
          score += 1;
        }
      }

      if (!best || score > bestScore) {
        best = binding;
        bestScore = score;
      }
    }

    if (!best) return null;

    if (bestScore === 0) {
      if (requestedEnv) {
        if (envMatches.length === 0) {
          return null;
        }

        const preferredEnvMatch = preferredBindingId
          ? envMatches.find((binding) => binding.id === preferredBindingId)
          : null;
        if (preferredEnvMatch) {
          return preferredEnvMatch;
        }

        return envMatches.slice().sort(compareBindingFallback)[0];
      }

      // Without an env hint or textual match, only a previously promoted
      // binding (preferredResourceBindings) may act as a fallback.
      if (!preferredBindingId) {
        return null;
      }

      const preferred = bindings.find((binding) => binding.id === preferredBindingId);
      return preferred || null;
    }

    return best;
  }

  /**
   * Mark a binding as used.
   */
  async markResourceBindingUsed(bindingId, context = {}) {
    if (!bindingId) return;

    let updatedBinding = null;
    await this.writeQueue.run('resource-bindings', async () => {
      const bindings = this.resourceBindings.bindings || [];
      const index = bindings.findIndex((binding) => binding.id === bindingId);
      if (index < 0) return;

      const current = bindings[index];
      updatedBinding = {
        ...current,
        stats: {
          useCount: (current.stats?.useCount || 0) + 1,
          lastUsed: new Date().toISOString()
        }
      };
      bindings[index] = updatedBinding;
      this.resourceBindings.lastUpdated = new Date().toISOString();
      await this.scheduleResourceBindingsPersist();
    });

    if (updatedBinding) {
      await this.promoteResourceBindingPreference(updatedBinding, context);
    }
  }

  /**
   * Save learning record
   */
  async saveLearningRecord(record) {
    const recordPath = path.join(this.expandPath(this.learningPath), 'records', record.skill, `${record.id}.json`);

    await fs.ensureDir(path.dirname(recordPath));
    await fs.writeJson(recordPath, record, { spaces: 2 });

    // Cache in memory
    if (!this.records[record.skill]) {
      this.records[record.skill] = [];
    }
    this.records[record.skill].push(record);
  }

  /**
   * Save scene mapping
   */
  async saveSceneMapping(record) {
    const scenesPath = path.join(this.expandPath(this.learningPath), 'scenes.json');
    await this.writeQueue.run('scenes.json', async () => {
      let scenes = { version: '1.0', mappings: [] };
      if (await fs.pathExists(scenesPath)) {
        scenes = await fs.readJson(scenesPath);
      }

      scenes.mappings = Array.isArray(scenes.mappings) ? scenes.mappings : [];
      const index = scenes.mappings.findIndex((item) => item.id === record.id);
      if (index >= 0) {
        scenes.mappings[index] = record;
      } else {
        scenes.mappings.push(record);
      }
      scenes.lastUpdated = new Date().toISOString();

      await fs.writeJson(scenesPath, scenes, { spaces: 2 });
    });

    this.scenes.version = this.scenes.version || '1.0';
    this.scenes.mappings = Array.isArray(this.scenes.mappings) ? this.scenes.mappings : [];
    const index = this.scenes.mappings.findIndex((item) => item.id === record.id);
    if (index >= 0) {
      this.scenes.mappings[index] = record;
    } else {
      this.scenes.mappings.push(record);
    }
  }

  /**
   * Save preference
   */
  async savePreference(record) {
    const prefsPath = path.join(this.expandPath(this.learningPath), 'records', record.skill, 'preferences.json');
    const queueKey = `prefs:${record.skill}`;
    await this.writeQueue.run(queueKey, async () => {
      let prefs = {};
      if (await fs.pathExists(prefsPath)) {
        prefs = await fs.readJson(prefsPath);
      }

      prefs[record.preferenceType] = record.value;
      prefs.lastUpdated = new Date().toISOString();

      await fs.ensureDir(path.dirname(prefsPath));
      await fs.writeJson(prefsPath, prefs, { spaces: 2 });
    });
  }

  async saveAutoGeneratedRecord(record, skill = record.skill || '_global') {
    const recordPath = path.join(this.expandPath(this.learningPath), 'records', skill, `${record.id}.json`);

    const existed = await fs.pathExists(recordPath);
    await fs.ensureDir(path.dirname(recordPath));
    await fs.writeJson(recordPath, record, { spaces: 2 });

    if (!this.records[skill]) {
      this.records[skill] = [];
    }
    const index = this.records[skill].findIndex((item) => item.id === record.id);
    if (index >= 0) {
      this.records[skill][index] = record;
    } else {
      this.records[skill].push(record);
    }

    return { created: !existed, path: recordPath };
  }

  async savePassivePreferences(skillName, updates) {
    const prefsPath = path.join(this.expandPath(this.learningPath), 'records', skillName, 'preferences.json');
    const queueKey = `prefs:${skillName}`;
    await this.writeQueue.run(queueKey, async () => {
      let prefs = {};
      if (await fs.pathExists(prefsPath)) {
        prefs = await fs.readJson(prefsPath);
      }

      const next = typeof updates === 'function' ? updates(prefs) : { ...prefs, ...updates };
      next.lastUpdated = new Date().toISOString();

      await fs.ensureDir(path.dirname(prefsPath));
      await fs.writeJson(prefsPath, next, { spaces: 2 });
    });
  }

  getAutoPromoteConfig() {
    return this.config.get('learning.autoPromote', {
      enabled: true,
      resourceBindingMinUses: 3,
      sceneMinUses: 2,
      skillRouteMinSuccesses: 2
    });
  }

  async promoteResourceBindingPreference(binding, context = {}) {
    const config = this.getAutoPromoteConfig();
    const skillName = context.skillName || context.currentSkill || binding.skill || null;
    if (!config.enabled || !skillName || !binding.componentType) {
      return false;
    }

    if ((binding.stats?.useCount || 0) < config.resourceBindingMinUses) {
      return false;
    }

    this.skillBindings.bindings = this.skillBindings.bindings || {};
    const skillBinding = this.skillBindings.bindings[skillName] || {
      learningCount: 0,
      records: [],
      rules: [],
      preferredResourceBindings: {}
    };
    skillBinding.preferredResourceBindings = skillBinding.preferredResourceBindings || {};

    const existingPreferred = skillBinding.preferredResourceBindings[binding.componentType];
    const changed = existingPreferred !== binding.id;
    if (changed) {
      skillBinding.preferredResourceBindings[binding.componentType] = binding.id;
      skillBinding.lastLearning = new Date().toISOString();
      this.skillBindings.bindings[skillName] = skillBinding;
      await this.saveSkillBindings();
    }

    await this.savePassivePreferences(skillName, (prefs) => ({
      ...prefs,
      preferredResourceBindings: {
        ...(prefs.preferredResourceBindings || {}),
        [binding.componentType]: {
          bindingId: binding.id,
          business: binding.business,
          provider: binding.provider,
          componentType: binding.componentType,
          useCount: binding.stats?.useCount || 0,
          lastUsed: binding.stats?.lastUsed || null
        }
      }
    }));

    const record = {
      id: `auto-resource-${skillName}-${binding.componentType}`,
      timestamp: new Date().toISOString(),
      type: 'resource_preference',
      source: 'passive',
      autoGenerated: true,
      input: context.input || binding.metadata?.input || binding.business,
      skill: skillName,
      componentType: binding.componentType,
      business: binding.business,
      provider: binding.provider,
      bindingId: binding.id,
      useCount: binding.stats?.useCount || 0,
      lastUsed: binding.stats?.lastUsed || null,
      application: {
        condition: `When ${skillName} resolves ${binding.componentType}`,
        action: `Prefer resource binding ${binding.business}`,
        priority: 'medium'
      }
    };
    const saved = await this.saveAutoGeneratedRecord(record, skillName);
    if (saved.created) {
      await this.updateStats('resource_preference', skillName);
    }

    return changed || saved.created;
  }

  async promoteSceneUsage(scene, context = {}) {
    const config = this.getAutoPromoteConfig();
    if (!config.enabled || !scene?.id) {
      return false;
    }

    if ((scene.stats?.useCount || 0) < config.sceneMinUses) {
      return false;
    }

    const primarySkill = scene.workflow?.skills?.[0]?.skill || 'global';
    const record = {
      id: `auto-scene-${scene.id}`,
      timestamp: new Date().toISOString(),
      type: 'scene_preference',
      source: 'passive',
      autoGenerated: true,
      input: context.input || scene.name,
      skill: '_global',
      sceneId: scene.id,
      sceneName: scene.name,
      primarySkill,
      keywords: scene.keywords || [],
      workflow: scene.workflow || {},
      preferences: scene.preferences || {},
      stats: {
        useCount: scene.stats?.useCount || 0,
        lastUsed: scene.stats?.lastUsed || null,
        successRate: scene.stats?.successRate || 1.0
      },
      application: {
        condition: `When request matches scene ${scene.name}`,
        action: `Apply workflow starting with ${primarySkill}`,
        priority: 'medium'
      }
    };

    const saved = await this.saveAutoGeneratedRecord(record, '_global');
    if (saved.created) {
      await this.updateStats('scene_preference', 'global');
    }

    await this.savePassivePreferences('_global', (prefs) => ({
      ...prefs,
      preferredScenes: {
        ...(prefs.preferredScenes || {}),
        [scene.id]: {
          name: scene.name,
          primarySkill,
          useCount: scene.stats?.useCount || 0,
          successRate: scene.stats?.successRate || 1.0
        }
      }
    }));

    return saved.created;
  }

  /**
   * Update skill bindings
   */
  async updateSkillBindings(record) {
    this.skillBindings.bindings = this.skillBindings.bindings || {};

    if (!this.skillBindings.bindings[record.skill]) {
      this.skillBindings.bindings[record.skill] = {
        learningCount: 0,
        records: [],
        rules: []
      };
    }

    const binding = this.skillBindings.bindings[record.skill];
    binding.learningCount++;
    binding.lastLearning = record.timestamp;
    binding.records.push({
      recordId: record.id,
      type: record.type,
      summary: this.generateSummary(record),
      priority: record.application.priority
    });
    binding.rules.push(record.application);

    await this.saveSkillBindings();
  }

  /**
   * Persist an explicit user choice so similar requests can bypass ambiguous
   * keyword/model routing on later turns.
   */
  async learnSkillRoute(input, skill, metadata = {}) {
    const normalizedInput = normalizeRouteInput(input);
    if (!normalizedInput || !skill) return null;

    this.skillBindings.routes = Array.isArray(this.skillBindings.routes)
      ? this.skillBindings.routes
      : [];
    const now = new Date().toISOString();
    const intentFamily = classifyRouteIntent(input);
    const semanticKey = buildRouteSemanticKey(input);
    let route = this.skillBindings.routes.find((item) => item.normalizedInput === normalizedInput);

    if (!route && semanticKey) {
      route = this.skillBindings.routes.find((item) => item.semanticKey === semanticKey);
    }

    if (route) {
      route.stats = route.stats || {};
      if (route.skill !== skill) {
        route.stats.correctionCount = (Number(route.stats.correctionCount) || 0) + 1;
        route.stats.lastCorrected = now;
      }
      route.input = String(input).trim();
      route.skill = skill;
      route.intentFamily = intentFamily;
      route.normalizedInput = normalizedInput;
      route.semanticKey = semanticKey;
      route.updatedAt = now;
      route.source = metadata.source || route.source || 'user';
      route.stats.learnCount = (Number(route.stats.learnCount) || 0) + 1;
    } else {
      route = {
        id: `route-${Date.now()}-${shortId()}`,
        input: String(input).trim(),
        normalizedInput,
        semanticKey,
        intentFamily,
        skill,
        source: metadata.source || 'user',
        createdAt: now,
        updatedAt: now,
        stats: { learnCount: 1, useCount: 0, lastUsed: null }
      };
      this.skillBindings.routes.push(route);
    }

    await this.saveSkillBindings();
    await this.updateStats('skill_route', skill);
    eventBus.emit('learning:recorded', {
      type: 'skill_route',
      skill,
      recordId: route.id,
      input: route.input
    });
    return route;
  }

  async learnSuccessfulSkillRoute(input, skill, metadata = {}) {
    const config = this.getAutoPromoteConfig();
    if (!config.enabled || !skill || !input) return null;

    const normalizedInput = normalizeRouteInput(input);
    if (!normalizedInput) return null;

    const semanticKey = buildRouteSemanticKey(input);
    const routeKey = semanticKey || normalizedInput;
    const threshold = Math.max(2, Number(config.skillRouteMinSuccesses) || 2);
    const now = new Date().toISOString();

    this.skillBindings.passiveRoutes = Array.isArray(this.skillBindings.passiveRoutes)
      ? this.skillBindings.passiveRoutes
      : [];

    let passive = this.skillBindings.passiveRoutes.find((item) => item.routeKey === routeKey && item.skill === skill);
    if (!passive) {
      passive = {
        id: `passive-route-${Date.now()}-${shortId()}`,
        input: String(input).trim(),
        normalizedInput,
        semanticKey,
        routeKey,
        intentFamily: classifyRouteIntent(input),
        skill,
        source: metadata.source || 'passive-success',
        stats: { successCount: 0, firstSeen: now, lastSeen: now }
      };
      this.skillBindings.passiveRoutes.push(passive);
    }

    passive.input = String(input).trim();
    passive.normalizedInput = normalizedInput;
    passive.semanticKey = semanticKey;
    passive.intentFamily = classifyRouteIntent(input);
    passive.stats = passive.stats || {};
    passive.stats.successCount = (Number(passive.stats.successCount) || 0) + 1;
    passive.stats.lastSeen = now;

    if (passive.stats.successCount >= threshold) {
      const promoted = await this.learnSkillRoute(input, skill, {
        source: metadata.source || 'passive-success'
      });
      this.skillBindings.passiveRoutes = this.skillBindings.passiveRoutes.filter((item) => item.id !== passive.id);
      await this.saveSkillBindings();
      return { promoted: true, route: promoted, passive };
    }

    await this.saveSkillBindings();
    return { promoted: false, passive };
  }

  /**
   * Match learned routes conservatively: exact matches always win, while
   * fuzzy matches must retain the same high-level action family.
   */
  async matchSkillRoute(input, availableSkills = []) {
    const normalizedInput = normalizeRouteInput(input);
    if (!normalizedInput) return null;
    const allowed = new Set(availableSkills || []);
    const intentFamily = classifyRouteIntent(input);
    const semanticKey = buildRouteSemanticKey(input);
    const routes = Array.isArray(this.skillBindings.routes) ? this.skillBindings.routes : [];
    const now = Date.now();

    const direct = findDirectRouteMatch(routes, {
      normalizedInput,
      semanticKey,
      intentFamily,
      allowed
    });
    if (direct) {
      direct.stats = direct.stats || {};
      direct.stats.useCount = (Number(direct.stats.useCount) || 0) + 1;
      direct.stats.lastUsed = new Date().toISOString();
      await this.scheduleSkillBindingsPersist();
      return {
        skill: direct.skill,
        confidence: scoreDirectRoute(direct, direct.normalizedInput === normalizedInput),
        route: direct
      };
    }

    let best = null;

    for (const route of routes) {
      if (!route?.skill || (allowed.size > 0 && !allowed.has(route.skill))) continue;
      if (route.intentFamily && route.intentFamily !== intentFamily) continue;

      const exactMatch = route.normalizedInput === normalizedInput;
      const baseScore = exactMatch
        ? 1
        : bigramDice(route.normalizedInput, normalizedInput);
      if (!exactMatch && baseScore < 0.72) continue;

      route.stats = route.stats || {};
      const useCount = Number(route.stats.useCount) || 0;
      const frequencyBoost = Math.min(useCount * 0.02, 0.1);

      const lastUsedTs = route.stats.lastUsed ? Date.parse(route.stats.lastUsed) : 0;
      const ageInDays = lastUsedTs > 0 ? Math.max(0, (now - lastUsedTs) / 86400000) : Infinity;
      const decayMultiplier = ageInDays === Infinity ? 0.85 : 0.85 + 0.15 * Math.exp(-ageInDays / 90);

      const correctionCount = Number(route.stats.correctionCount) || 0;
      const correctionPenalty = Math.min(correctionCount * 0.1, 0.3);

      const finalScore = Math.max(
        (baseScore + frequencyBoost) * decayMultiplier - correctionPenalty,
        0
      );

      if (best && finalScore <= best.confidence) continue;
      best = { skill: route.skill, confidence: finalScore, route };
    }

    if (!best) return null;
    best.route.stats = best.route.stats || {};
    best.route.stats.useCount = (Number(best.route.stats.useCount) || 0) + 1;
    best.route.stats.lastUsed = new Date().toISOString();
    await this.scheduleSkillBindingsPersist();
    return best;
  }

  /**
   * Persist resource bindings. High-frequency callers (markResourceBindingUsed)
   * go through the throttler; direct-write mode (persistThrottleMs=0) saves
   * immediately.
   */
  async scheduleResourceBindingsPersist() {
    if (this.persistThrottleMs <= 0) {
      await this.saveResourceBindings();
      return;
    }
    this.resourceBindingsThrottler.markDirty();
  }

  /**
   * Persist skill bindings. matchSkillRoute hits this on every successful
   * match, so it is debounced to avoid rewriting the whole bindings file.
   */
  async scheduleSkillBindingsPersist() {
    if (this.persistThrottleMs <= 0) {
      await this.saveSkillBindings();
      return;
    }
    this.skillBindingsThrottler.markDirty();
  }

  /**
   * Flush any pending throttled persistence immediately.
   */
  async flushLearningPersists() {
    await this.resourceBindingsThrottler.flush();
    await this.skillBindingsThrottler.flush();
  }

  /**
   * Pure-read hint of historically learned routes for AI skill selection.
   * Returns up to `limit` routes matching the input's intent family with
   * bigram similarity >= 0.5, boosted by usage frequency.
   */
  getRouteHistoryHint(input, availableSkills = [], limit = 3) {
    const normalizedInput = normalizeRouteInput(input);
    if (!normalizedInput) return [];

    const allowed = Array.isArray(availableSkills) && availableSkills.length > 0
      ? new Set(availableSkills)
      : null;
    const intentFamily = classifyRouteIntent(input);
    const routes = Array.isArray(this.skillBindings.routes) ? this.skillBindings.routes : [];
    const hints = [];

    for (const route of routes) {
      if (!route?.skill) continue;
      if (allowed && !allowed.has(route.skill)) continue;
      if (route.intentFamily && route.intentFamily !== intentFamily) continue;

      const similarity = bigramDice(route.normalizedInput, normalizedInput);
      if (similarity < 0.5) continue;

      const useCount = Number(route.stats?.useCount) || 0;
      hints.push({
        skill: route.skill,
        input: route.input || route.normalizedInput,
        useCount,
        similarity: Math.round(similarity * 100) / 100
      });
    }

    return hints
      .map((hint) => ({ ...hint, rank: hint.similarity + Math.min(hint.useCount * 0.02, 0.1) }))
      .sort((left, right) => right.rank - left.rank)
      .slice(0, Math.max(1, Number(limit) || 3))
      .map(({ rank, ...hint }) => hint);
  }

  /**
   * Load skill bindings
   */
  async loadSkillBindings() {
    const bindingsPath = path.join(this.expandPath(this.learningPath), 'skill-bindings.json');

    if (await fs.pathExists(bindingsPath)) {
      this.skillBindings = await fs.readJson(bindingsPath);
      this.skillBindings.bindings = this.skillBindings.bindings || {};
      this.skillBindings.routes = Array.isArray(this.skillBindings.routes) ? this.skillBindings.routes : [];
      this.skillBindings.passiveRoutes = Array.isArray(this.skillBindings.passiveRoutes) ? this.skillBindings.passiveRoutes : [];
    } else {
      this.skillBindings = { version: '1.0', bindings: {}, routes: [], passiveRoutes: [] };
    }
  }

  /**
   * Load resource bindings
   */
  async loadResourceBindings() {
    const bindingsPath = path.join(this.expandPath(this.learningPath), 'resource-bindings.json');

    if (await fs.pathExists(bindingsPath)) {
      this.resourceBindings = await fs.readJson(bindingsPath);
      this.resourceBindings.bindings = this.resourceBindings.bindings || [];
    } else {
      this.resourceBindings = { version: '1.0', bindings: [] };
    }
  }

  /**
   * Load learning records from disk
   */
  async loadRecords() {
    const recordsPath = path.join(this.expandPath(this.learningPath), 'records');
    this.records = {};

    if (!(await fs.pathExists(recordsPath))) {
      return;
    }

    const skillDirs = await fs.readdir(recordsPath);
    for (const skill of skillDirs) {
      const skillPath = path.join(recordsPath, skill);
      const stat = await fs.stat(skillPath).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        continue;
      }

      const files = await fs.readdir(skillPath);
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'preferences.json') {
          continue;
        }

        const recordPath = path.join(skillPath, file);
        try {
          const record = await fs.readJson(recordPath);
          if (!this.records[skill]) {
            this.records[skill] = [];
          }
          this.records[skill].push(record);
        } catch (error) {
          // Ignore malformed record files so one bad export does not block startup.
        }
      }
    }
  }

  /**
   * Load custom scene mappings from disk
   */
  async loadScenes() {
    const scenesPath = path.join(this.expandPath(this.learningPath), 'scenes.json');
    if (await fs.pathExists(scenesPath)) {
      try {
        this.scenes = await fs.readJson(scenesPath);
        this.scenes.version = this.scenes.version || '1.0';
        this.scenes.mappings = Array.isArray(this.scenes.mappings) ? this.scenes.mappings : [];
      } catch (error) {
        this.scenes = { version: '1.0', mappings: [] };
      }
    } else {
      this.scenes = { version: '1.0', mappings: [] };
    }
  }

  /**
   * Save skill bindings
   */
  async saveSkillBindings() {
    await this.writeQueue.run('bindings', async () => {
      const bindingsPath = path.join(this.expandPath(this.learningPath), 'skill-bindings.json');
      this.skillBindings.lastUpdated = new Date().toISOString();
      await fs.writeJson(bindingsPath, this.skillBindings, { spaces: 2 });
    });
  }

  /**
   * Save resource bindings
   */
  async saveResourceBindings() {
    const bindingsPath = path.join(this.expandPath(this.learningPath), 'resource-bindings.json');
    this.resourceBindings.lastUpdated = new Date().toISOString();
    await fs.writeJson(bindingsPath, this.resourceBindings, { spaces: 2 });
  }

  /**
   * Save custom scene mappings
   */
  async saveScenes() {
    const scenesPath = path.join(this.expandPath(this.learningPath), 'scenes.json');
    this.scenes.version = this.scenes.version || '1.0';
    this.scenes.lastUpdated = new Date().toISOString();
    this.scenes.mappings = Array.isArray(this.scenes.mappings) ? this.scenes.mappings : [];
    await fs.writeJson(scenesPath, this.scenes, { spaces: 2 });
  }

  /**
   * Load stats
   */
  async loadStats() {
    const statsPath = path.join(this.expandPath(this.learningPath), 'stats.json');

    if (await fs.pathExists(statsPath)) {
      this.stats = await fs.readJson(statsPath);
    } else {
      this.stats = {
        totalRecords: 0,
        byType: {},
        bySkill: {},
        lastLearning: null
      };
    }
  }

  /**
   * Update stats
   */
  async updateStats(type, skill) {
    await this.writeQueue.run('stats', async () => {
      this.stats.totalRecords++;
      this.stats.byType[type] = (this.stats.byType[type] || 0) + 1;
      this.stats.bySkill[skill] = (this.stats.bySkill[skill] || 0) + 1;
      this.stats.lastLearning = new Date().toISOString();

      const statsPath = path.join(this.expandPath(this.learningPath), 'stats.json');
      await fs.writeJson(statsPath, this.stats, { spaces: 2 });
    });

    // Award honor points for learning
    if (this.honorEngine) {
      await this.honorEngine.award('learning', `Learned: ${type} for ${skill}`);
    }
  }

  /**
   * Get statistics
   */
  async getStats() {
    return this.stats;
  }

  /**
   * Return a sanitized snapshot of learned feedback, skill state, and local material packages.
   */
  async getLearningAssets(options = {}) {
    const skill = options.skill ? String(options.skill) : null;
    const requestedLimit = Number(options.limit);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(500, requestedLimit)) : 50;
    const query = options.query ? String(options.query) : null;
    const recordsBySkill = await this.collectRecords();
    const semanticIndex = await this.rebuildSemanticIndex(recordsBySkill);
    const feedback = Object.entries(recordsBySkill)
      .flatMap(([recordSkill, records]) =>
        (Array.isArray(records) ? records : []).map((record) => ({ skill: record.skill || recordSkill, ...record }))
      )
      .filter((record) => !skill || record.skill === skill)
      .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))
      .slice(0, limit)
      .map(redactSensitiveDeep);
    const skillEntries = Object.entries(this.skillBindings.bindings || {})
      .filter(([name]) => !skill || name === skill)
      .map(([name, binding]) => ({
        name,
        feedbackCount: (binding.records || []).length,
        ruleCount: (binding.rules || []).length,
        lastLearning: binding.lastLearning || null,
        rules: redactSensitiveDeep(binding.rules || []),
        preferredResourceBindings: { ...(binding.preferredResourceBindings || {}) }
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
    const sourceRoot = path.join(path.dirname(this.expandPath(this.learningPath)), 'source');
    const sourceFiles = await listLearningSourceFiles(sourceRoot);

    return {
      generatedAt: new Date().toISOString(),
      filters: { skill, limit, query },
      summary: {
        totalFeedback: Object.values(recordsBySkill).reduce(
          (total, records) => total + (Array.isArray(records) ? records.length : 0),
          0
        ),
        returnedFeedback: feedback.length,
        learnedSkills: Object.keys(this.skillBindings.bindings || {}).length,
        learnedRoutes: (this.skillBindings.routes || []).length,
        passiveRoutes: (this.skillBindings.passiveRoutes || []).length,
        semanticEntries: semanticIndex.entries.length,
        scenes: (this.scenes?.mappings || []).length,
        resourceBindings: (this.resourceBindings.bindings || []).length,
        sourceFiles: sourceFiles.length
      },
      feedback,
      routes: (this.skillBindings.routes || [])
        .filter((route) => !skill || route.skill === skill)
        .map(redactSensitiveDeep),
      skills: skillEntries,
      scenes: (this.scenes?.mappings || []).map((scene) =>
        redactSensitiveDeep({
          id: scene.id,
          name: scene.name || scene.sceneName || null,
          keywords: scene.keywords || [],
          patterns: scene.patterns || [],
          workflow: scene.workflow || null,
          preferences: scene.preferences || {},
          stats: scene.stats || {}
        })
      ),
      resourceBindings: (this.resourceBindings.bindings || []).map((binding) => sanitizeResourceBinding(binding)),
      semanticIndex: {
        version: semanticIndex.version,
        lastUpdated: semanticIndex.lastUpdated,
        entries: this.searchSemanticIndex(query || skill || '', { skill, limit: Math.min(limit, 50) }).map(redactSensitiveDeep)
      },
      packages: {
        currentBundle: {
          kind: 'flowmind-learning-bundle',
          formatVersion: '1.0',
          summary: await this.getBundleSummary()
        },
        sourceRoot,
        sourceFiles
      }
    };
  }

  async loadSemanticIndex() {
    const indexPath = path.join(this.expandPath(this.learningPath), 'semantic-index.json');
    if (await fs.pathExists(indexPath)) {
      try {
        const loaded = await fs.readJson(indexPath);
        this.semanticIndex = {
          version: loaded.version || '1.0',
          entries: Array.isArray(loaded.entries) ? loaded.entries : [],
          lastUpdated: loaded.lastUpdated || null
        };
        return;
      } catch (error) {
        // Rebuilt lazily by getLearningAssets.
      }
    }
    this.semanticIndex = { version: '1.0', entries: [], lastUpdated: null };
  }

  async saveSemanticIndex() {
    const indexPath = path.join(this.expandPath(this.learningPath), 'semantic-index.json');
    await fs.writeJson(indexPath, this.semanticIndex, { spaces: 2 });
  }

  async rebuildSemanticIndex(recordsBySkill = null) {
    recordsBySkill = recordsBySkill || await this.collectRecords();
    const entries = [];

    for (const [recordSkill, records] of Object.entries(recordsBySkill || {})) {
      for (const record of records || []) {
        const text = [record.input, record.application?.condition, record.application?.action, record.type].filter(Boolean).join(' ');
        entries.push(createSemanticEntry({
          id: record.id || `record-${entries.length + 1}`,
          type: 'feedback',
          skill: record.skill || recordSkill,
          text,
          title: record.input || record.application?.action || record.type,
          source: `records/${recordSkill}/${record.id}.json`,
          stats: { timestamp: record.timestamp || null }
        }));
      }
    }

    for (const route of this.skillBindings.routes || []) {
      entries.push(createSemanticEntry({
        id: route.id,
        type: 'route',
        skill: route.skill,
        text: [route.input, route.normalizedInput, route.semanticKey].filter(Boolean).join(' '),
        title: route.input || route.normalizedInput,
        source: 'skill-bindings.routes',
        stats: route.stats || {},
        semanticKey: route.semanticKey || buildRouteSemanticKey(route.input || route.normalizedInput)
      }));
    }

    for (const route of this.skillBindings.passiveRoutes || []) {
      entries.push(createSemanticEntry({
        id: route.id,
        type: 'passive-route',
        skill: route.skill,
        text: [route.input, route.normalizedInput, route.semanticKey].filter(Boolean).join(' '),
        title: route.input || route.normalizedInput,
        source: 'skill-bindings.passiveRoutes',
        stats: route.stats || {},
        semanticKey: route.semanticKey || buildRouteSemanticKey(route.input || route.normalizedInput)
      }));
    }

    for (const [skillName, binding] of Object.entries(this.skillBindings.bindings || {})) {
      for (const rule of binding.rules || []) {
        entries.push(createSemanticEntry({
          id: `${skillName}-rule-${entries.length + 1}`,
          type: 'rule',
          skill: skillName,
          text: [rule.condition, rule.action, rule.priority].filter(Boolean).join(' '),
          title: rule.action || rule.condition,
          source: 'skill-bindings.rules',
          stats: { lastLearning: binding.lastLearning || null }
        }));
      }
    }

    for (const scene of this.scenes.mappings || []) {
      entries.push(createSemanticEntry({
        id: scene.id,
        type: 'scene',
        skill: scene.workflow?.skills?.[0]?.skill || null,
        text: [scene.name, ...(scene.keywords || []), ...(scene.patterns || [])].filter(Boolean).join(' '),
        title: scene.name || scene.id,
        source: 'scenes',
        stats: scene.stats || {}
      }));
    }

    for (const binding of this.resourceBindings.bindings || []) {
      entries.push(createSemanticEntry({
        id: binding.id,
        type: 'resource',
        skill: binding.skill || null,
        text: [binding.business, binding.provider, binding.componentType, ...(binding.aliases || []), ...(binding.keywords || [])].filter(Boolean).join(' '),
        title: binding.business || binding.id,
        source: 'resource-bindings',
        stats: binding.stats || {}
      }));
    }

    this.semanticIndex = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      entries: mergeSemanticEntries(entries.filter(Boolean))
    };
    await this.saveSemanticIndex();
    return this.semanticIndex;
  }

  searchSemanticIndex(input, options = {}) {
    const query = String(input || '').trim();
    if (!query) return [];
    const skill = options.skill ? String(options.skill) : null;
    const limit = Math.max(1, Math.min(100, Number(options.limit) || 20));
    const normalized = normalizeRouteInput(query);
    const semanticKey = buildRouteSemanticKey(query);

    return (this.semanticIndex.entries || [])
      .filter((entry) => !skill || entry.skill === skill)
      .map((entry) => {
        let score = 0;
        if (semanticKey && entry.semanticKey === semanticKey) score += 12;
        if (entry.normalizedText && normalized.includes(entry.normalizedText)) score += 8;
        if (entry.normalizedText && entry.normalizedText.includes(normalized)) score += 6;
        if (entry.normalizedText) score += bigramDice(entry.normalizedText, normalized) * 5;
        score += Math.min(Number(entry.stats?.useCount) || 0, 10) * 0.1;
        return { ...entry, score: Math.round(score * 100) / 100 };
      })
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score || String(left.type).localeCompare(String(right.type)))
      .slice(0, limit);
  }

  /**
   * Export learnings
   */
  async export(options = {}) {
    if (options.bundle) {
      return this.exportBundle(options);
    }

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stats: this.stats,
      skillBindings: this.skillBindings,
      resourceBindings: this.resourceBindings,
      scenes: this.scenes,
      records: this.records
    };

    if (options.output) {
      await fs.writeJson(options.output, exportData, { spaces: 2 });
    }

    return exportData;
  }

  /**
   * Import learnings
   */
  async import(data) {
    if (typeof data === 'string') {
      data = await fs.readJson(data);
    }

    if (isLearningBundle(data) || hasPortableLearningSections(data)) {
      return this.importBundle(normalizeLearningBundle(data));
    }

    // Merge stats
    this.stats.totalRecords += data.stats.totalRecords || 0;
    Object.assign(this.stats.byType, data.stats.byType || {});
    Object.assign(this.stats.bySkill, data.stats.bySkill || {});

    // Merge skill bindings
    for (const [skill, binding] of Object.entries(data.skillBindings.bindings || {})) {
      if (!this.skillBindings.bindings[skill]) {
        this.skillBindings.bindings[skill] = cloneSkillBinding(binding);
      } else {
        this.skillBindings.bindings[skill] = mergeSkillBindings(this.skillBindings.bindings[skill], binding);
      }
    }
    this.skillBindings.routes = mergeSkillRoutes(
      this.skillBindings.routes || [],
      data.skillBindings.routes || []
    );

    // Merge resource bindings
    for (const binding of data.resourceBindings?.bindings || []) {
      mergeResourceBinding(this.resourceBindings, binding);
    }

    // Merge scenes when present
    if (data.scenes) {
      this.scenes.version = this.scenes.version || data.scenes.version || '1.0';
      const existingScenes = Array.isArray(this.scenes.mappings) ? this.scenes.mappings : [];
      for (const scene of data.scenes.mappings || []) {
        const index = existingScenes.findIndex((item) => item.id === scene.id);
        if (index >= 0) {
          existingScenes[index] = mergeScene(existingScenes[index], scene);
        } else {
          existingScenes.push(scene);
        }
      }
      this.scenes.mappings = existingScenes;
    }

    await this.importRecords(data.records || {});
    await this.importPreferences(data.preferences || {});

    // Save
    await this.saveSkillBindings();
    await this.saveResourceBindings();
    await this.saveScenes();
    await this.saveStats();

    return { success: true, imported: data.stats.totalRecords };
  }

  async exportBundle(options = {}) {
    const records = await this.collectRecords();
    const preferences = await this.collectPreferences();
    const bundle = {
      kind: 'flowmind-learning-bundle',
      formatVersion: '1.0',
      exportedAt: new Date().toISOString(),
      summary: {
        totalRecords: this.stats.totalRecords || 0,
        skills: Object.keys(this.skillBindings.bindings || {}).length,
        skillRoutes: (this.skillBindings.routes || []).length,
        resourceBindings: (this.resourceBindings.bindings || []).length,
        scenes: (this.scenes?.mappings || []).length
      },
      stats: this.stats,
      skillBindings: this.skillBindings,
      resourceBindings: {
        ...this.resourceBindings,
        bindings: (this.resourceBindings.bindings || []).map((binding) => sanitizeResourceBinding(binding))
      },
      scenes: this.scenes,
      preferences,
      records
    };

    if (options.output) {
      await fs.writeJson(options.output, bundle, { spaces: 2 });
    }

    return bundle;
  }

  async importBundle(bundle) {
    const normalized = normalizeLearningBundle(bundle);

    // Merge stats
    this.stats.totalRecords += normalized.stats.totalRecords || 0;
    Object.assign(this.stats.byType, normalized.stats.byType || {});
    Object.assign(this.stats.bySkill, normalized.stats.bySkill || {});
    if (normalized.stats.lastLearning) {
      this.stats.lastLearning = normalized.stats.lastLearning;
    }

    // Merge skill bindings, preserving preferred resource bindings
    for (const [skill, binding] of Object.entries(normalized.skillBindings.bindings || {})) {
      if (!this.skillBindings.bindings[skill]) {
        this.skillBindings.bindings[skill] = cloneSkillBinding(binding);
      } else {
        this.skillBindings.bindings[skill] = mergeSkillBindings(this.skillBindings.bindings[skill], binding);
      }
    }
    this.skillBindings.routes = mergeSkillRoutes(
      this.skillBindings.routes || [],
      normalized.skillBindings.routes || []
    );

    // Merge resource bindings
    for (const binding of normalized.resourceBindings.bindings || []) {
      mergeResourceBinding(this.resourceBindings, binding);
    }

    // Merge scenes
    this.scenes.version = this.scenes.version || normalized.scenes.version || '1.0';
    const existingScenes = Array.isArray(this.scenes.mappings) ? this.scenes.mappings : [];
    for (const scene of normalized.scenes.mappings || []) {
      const index = existingScenes.findIndex((item) => item.id === scene.id);
      if (index >= 0) {
        existingScenes[index] = mergeScene(existingScenes[index], scene);
      } else {
        existingScenes.push(scene);
      }
    }
    this.scenes.mappings = existingScenes;

    // Merge records and preferences
    await this.importRecords(normalized.records || {});
    await this.importPreferences(normalized.preferences || {});

    // Save
    await this.saveSkillBindings();
    await this.saveResourceBindings();
    await this.saveScenes();
    await this.saveStats();

    return {
      success: true,
      imported: normalized.stats.totalRecords || 0,
      bundle: true
    };
  }

  /**
   * Reset all learnings for a specific skill
   */
  async resetSkill(skillName) {
    const basePath = this.expandPath(this.learningPath);

    // Delete records directory for this skill
    const recordsDir = path.join(basePath, 'records', skillName);
    if (await fs.pathExists(recordsDir)) {
      await fs.remove(recordsDir);
    }

    // Remove from skill bindings
    if (this.skillBindings.bindings && this.skillBindings.bindings[skillName]) {
      delete this.skillBindings.bindings[skillName];
      await this.saveSkillBindings();
    }

    // Update stats
    const count = (this.records[skillName] || []).length;
    if (count > 0 && this.stats.totalRecords) {
      this.stats.totalRecords = Math.max(0, this.stats.totalRecords - count);
    }
    if (this.stats.bySkill && this.stats.bySkill[skillName]) {
      delete this.stats.bySkill[skillName];
    }
    await this.saveStats();
    delete this.records[skillName];

    return count;
  }

  /**
   * Delete a specific learning record by ID
   */
  async deleteRecord(recordId) {
    const basePath = path.join(this.expandPath(this.learningPath), 'records');
    if (!(await fs.pathExists(basePath))) return false;

    const skillDirs = await fs.readdir(basePath);
    for (const skill of skillDirs) {
      const recordPath = path.join(basePath, skill, `${recordId}.json`);
      if (await fs.pathExists(recordPath)) {
        await fs.remove(recordPath);
        // Remove from memory cache
        if (this.records[skill]) {
          this.records[skill] = this.records[skill].filter((r) => r.id !== recordId);
        }
        // Update stats
        if (this.stats.totalRecords) this.stats.totalRecords--;
        await this.saveStats();
        return true;
      }
    }
    return false;
  }

  /**
   * Save stats to disk
   */
  async saveStats() {
    const statsPath = path.join(this.expandPath(this.learningPath), 'stats.json');
    await fs.writeJson(statsPath, this.stats, { spaces: 2 });
  }

  async collectRecords() {
    const snapshot = {};
    const basePath = path.join(this.expandPath(this.learningPath), 'records');
    if (!(await fs.pathExists(basePath))) {
      return snapshot;
    }

    const skillDirs = await fs.readdir(basePath);
    for (const skill of skillDirs) {
      const skillPath = path.join(basePath, skill);
      const stat = await fs.stat(skillPath).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        continue;
      }

      const files = await fs.readdir(skillPath);
      snapshot[skill] = [];
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'preferences.json') continue;
        const record = await fs.readJson(path.join(skillPath, file)).catch(() => null);
        if (record) {
          snapshot[skill].push(record);
        }
      }
    }

    return snapshot;
  }

  async collectPreferences() {
    const snapshot = {};
    const basePath = path.join(this.expandPath(this.learningPath), 'records');
    if (!(await fs.pathExists(basePath))) {
      return snapshot;
    }

    const skillDirs = await fs.readdir(basePath);
    for (const skill of skillDirs) {
      const prefsPath = path.join(basePath, skill, 'preferences.json');
      if (await fs.pathExists(prefsPath)) {
        const prefs = await fs.readJson(prefsPath).catch(() => null);
        if (prefs) {
          snapshot[skill] = prefs;
        }
      }
    }

    return snapshot;
  }

  async importRecords(records) {
    for (const [skill, list] of Object.entries(records)) {
      if (!Array.isArray(list) || list.length === 0) {
        continue;
      }

      if (!this.records[skill]) {
        this.records[skill] = [];
      }

      for (const record of list) {
        if (!record || !record.id) continue;
        const exists = this.records[skill].some((item) => item.id === record.id);
        if (!exists) {
          this.records[skill].push(record);
        }
        await fs.ensureDir(path.join(this.expandPath(this.learningPath), 'records', skill));
        await fs.writeJson(
          path.join(this.expandPath(this.learningPath), 'records', skill, `${record.id}.json`),
          record,
          { spaces: 2 }
        );
      }
    }
  }

  async importPreferences(preferences) {
    for (const [skill, prefs] of Object.entries(preferences)) {
      if (!prefs || typeof prefs !== 'object') continue;
      const prefsPath = path.join(this.expandPath(this.learningPath), 'records', skill, 'preferences.json');
      await fs.ensureDir(path.dirname(prefsPath));
      await fs.writeJson(prefsPath, prefs, { spaces: 2 });
    }
  }

  /**
   * Helper methods
   */
  expandPath(filePath) {
    return expandPath(filePath);
  }

  extractCondition(input) {
    // Extract when to apply this learning
    const conditionPatterns = [/当.*时/i, /when.*is/i, /如果.*的话/i];

    for (const pattern of conditionPatterns) {
      const match = input.match(pattern);
      if (match) return match[0];
    }

    return 'Always apply';
  }

  extractAction(input) {
    // Extract what to do
    return input.replace(/不对|错了|应该是|正确的是|改成|改为/i, '').trim() || 'Apply correction';
  }

  extractKeywords(input) {
    // Extract keywords for scene matching
    const words = input.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
    return [...new Set(words)].slice(0, 10);
  }

  inferComponentType(input, skillName = null) {
    const normalized = `${skillName || ''} ${input || ''}`.toLowerCase();

    if (/yapi|api 文档|api doc|swagger|接口/.test(normalized)) return 'apiDoc';
    if (/yuque|语雀|knowledge base|知识库|design/.test(normalized)) return 'knowledgeBase';
    if (/redis|缓存|cache/.test(normalized)) return 'redisMonitor';
    if (/sql|数据库|database|rds|dms/.test(normalized)) return 'databaseQuery';
    if (/log|日志|trace|sls/.test(normalized)) return 'logService';
    if (/pipeline|workflow|部署|流水线/.test(normalized)) return 'workflow';
    if (/report|coverage|报告/.test(normalized)) return 'report';

    return null;
  }

  extractWorkflow(_input) {
    // Extract workflow steps
    return {
      skills: ['auto-detect'],
      params: {}
    };
  }

  extractPreferences(input) {
    // Extract preferences from input
    const prefs = {};

    if (/顺序列表|sequential/i.test(input)) {
      prefs.outputFormat = 'sequential-list';
    }
    if (/表格|table/i.test(input)) {
      prefs.outputFormat = 'table';
    }
    if (/简洁|compact/i.test(input)) {
      prefs.detailLevel = 'compact';
    }
    if (/详细|detailed/i.test(input)) {
      prefs.detailLevel = 'detailed';
    }

    return prefs;
  }

  extractPreferenceValue(input) {
    // Extract preference value
    const formatMatch = input.match(/用(.+?)格式|格式用(.+)/);
    if (formatMatch) return formatMatch[1] || formatMatch[2];

    return input;
  }

  async getBundleSummary() {
    return {
      totalRecords: this.stats.totalRecords || 0,
      skills: Object.keys(this.skillBindings.bindings || {}).length,
      skillRoutes: (this.skillBindings.routes || []).length,
      resourceBindings: (this.resourceBindings.bindings || []).length,
      scenes: (this.scenes?.mappings || []).length
    };
  }

  generateSummary(record) {
    // Generate summary for display
    if (record.type === 'correction') {
      return `Corrected: ${record.trigger}`;
    }
    if (record.type === 'scene_mapping') {
      return `Scene: ${record.keywords.join(', ')}`;
    }
    return record.type;
  }

  formatLearningConfirmation(record) {
    return `
┌─────────────────────────────────────────────────────┐
│ 🧠 Learning Captured                                │
├─────────────────────────────────────────────────────┤
│ ID: ${record.id}                                    │
│ Skill: ${record.skill}                              │
│ Type: ${record.type}                                │
│ Severity: ${record.severity || 'N/A'}               │
├─────────────────────────────────────────────────────┤
│ FlowMind has recorded your preference.              │
│ It will be applied automatically next time.         │
└─────────────────────────────────────────────────────┘
    `.trim();
  }

  formatSceneMappingConfirmation(record) {
    return `
┌─────────────────────────────────────────────────────┐
│ 🎯 Scene Mapping Saved                              │
├─────────────────────────────────────────────────────┤
│ ID: ${record.id}                                    │
│ Keywords: ${record.keywords.join(', ')}             │
│ Preferences: ${JSON.stringify(record.preferences)}  │
├─────────────────────────────────────────────────────┤
│ FlowMind will auto-apply this workflow next time.   │
└─────────────────────────────────────────────────────┘
    `.trim();
  }

  formatPreferenceConfirmation(record) {
    return `
┌─────────────────────────────────────────────────────┐
│ ⚙️ Preference Saved                                 │
├─────────────────────────────────────────────────────┤
│ Type: ${record.preferenceType}                      │
│ Value: ${record.value}                              │
│ Skill: ${record.skill}                              │
├─────────────────────────────────────────────────────┤
│ FlowMind will use this preference going forward.    │
└─────────────────────────────────────────────────────┘
    `.trim();
  }
}

function isLearningBundle(data) {
  return data && typeof data === 'object' && data.kind === 'flowmind-learning-bundle';
}

function hasPortableLearningSections(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  return Boolean(data.records || data.scenes || data.preferences || data.resourceBindings || data.skillBindings);
}

function normalizeLearningBundle(data) {
  const normalized = isLearningBundle(data)
    ? data
    : {
        kind: 'flowmind-learning-bundle',
        formatVersion: '1.0',
        exportedAt: data.exportedAt || new Date().toISOString(),
        stats: data.stats || {},
        skillBindings: data.skillBindings || { version: '1.0', bindings: {} },
        resourceBindings: data.resourceBindings || { version: '1.0', bindings: [] },
        scenes: data.scenes || { version: '1.0', mappings: [] },
        preferences: data.preferences || {},
        records: data.records || {}
      };

  normalized.stats = normalized.stats || {};
  normalized.skillBindings = normalized.skillBindings || { version: '1.0', bindings: {} };
  normalized.skillBindings.bindings = normalized.skillBindings.bindings || {};
  normalized.skillBindings.routes = Array.isArray(normalized.skillBindings.routes)
    ? normalized.skillBindings.routes
    : [];
  normalized.resourceBindings = normalized.resourceBindings || { version: '1.0', bindings: [] };
  normalized.resourceBindings.bindings = Array.isArray(normalized.resourceBindings.bindings)
    ? normalized.resourceBindings.bindings
    : [];
  normalized.scenes = normalized.scenes || { version: '1.0', mappings: [] };
  normalized.scenes.mappings = Array.isArray(normalized.scenes.mappings) ? normalized.scenes.mappings : [];
  normalized.preferences = normalized.preferences || {};
  normalized.records = normalized.records || {};

  return normalized;
}

function cloneSkillBinding(binding = {}) {
  return {
    ...binding,
    records: Array.isArray(binding.records) ? [...binding.records] : [],
    rules: Array.isArray(binding.rules) ? [...binding.rules] : [],
    preferredResourceBindings: { ...(binding.preferredResourceBindings || {}) }
  };
}

function mergeSkillBindings(existing, incoming) {
  const merged = cloneSkillBinding(existing);
  merged.learningCount = (Number(existing?.learningCount) || 0) + (Number(incoming?.learningCount) || 0);
  merged.lastLearning = incoming?.lastLearning || existing?.lastLearning || null;
  merged.records = mergeUniqueByKey([...(existing.records || []), ...(incoming.records || [])], 'recordId');
  merged.rules = mergeUniqueRules(existing.rules || [], incoming.rules || []);
  merged.preferredResourceBindings = {
    ...(existing.preferredResourceBindings || {}),
    ...(incoming.preferredResourceBindings || {})
  };
  return merged;
}

function mergeSkillRoutes(existing, incoming) {
  const routes = new Map();
  for (const route of [...(existing || []), ...(incoming || [])]) {
    if (!route?.skill || !route?.normalizedInput) continue;
    const normalizedRoute = {
      ...route,
      semanticKey: route.semanticKey || buildRouteSemanticKey(route.input || route.normalizedInput),
      intentFamily: route.intentFamily || classifyRouteIntent(route.input || route.normalizedInput),
      stats: { ...(route.stats || {}) }
    };
    const key = normalizedRoute.semanticKey || normalizedRoute.normalizedInput;
    const previous = routes.get(key);
    routes.set(key, previous ? {
      ...previous,
      ...normalizedRoute,
      aliases: [...new Set([...(previous.aliases || []), previous.input, normalizedRoute.input].filter(Boolean))],
      stats: {
        ...(previous.stats || {}),
        ...(normalizedRoute.stats || {}),
        learnCount: (Number(previous.stats?.learnCount) || 0) + (Number(normalizedRoute.stats?.learnCount) || 0),
        useCount: (Number(previous.stats?.useCount) || 0) + (Number(normalizedRoute.stats?.useCount) || 0)
      }
    } : normalizedRoute);
  }
  return [...routes.values()];
}

function normalizeRouteInput(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/^\s*(?:请|麻烦|劳驾|帮我|帮忙)\s*/i, '')
    .replace(/分析(?:一下|下)?|梳理(?:一下|下)?|总结(?:一下|下)?|说明(?:一下|下)?|解释(?:一下|下)?/g, '分析')
    .replace(/\s+/g, '')
    .replace(/[^\u4e00-\u9fffa-z0-9_-]/gi, '');
}

function classifyRouteIntent(input) {
  const text = String(input || '').toLowerCase();
  if (/执行|运行|启动|触发|部署|发布|上线|run|execute|deploy|release|start/.test(text)) return 'execute';
  if (/分析|梳理|总结|说明|解释|了解|还原|review|analy[sz]e|summari[sz]e|explain/.test(text)) return 'analyze';
  if (/查询|查看|状态|search|query|status|list/.test(text)) return 'query';
  return 'general';
}

function buildRouteSemanticKey(input) {
  const intent = classifyRouteIntent(input);
  const normalized = normalizeRouteInput(input)
    .replace(/(?:帮我|请|麻烦|一下|一下子|当前|这个|这些|一下当前|一下这个|需求|任务|问题)/g, '')
    .replace(/(?:分析|梳理|总结|说明|解释|了解|还原|查询|查看|状态|执行|运行|启动|触发|部署|发布|上线)/g, '');
  const tokens = normalized.match(/[\u4e00-\u9fffa-z0-9_-]+/gi) || [];
  const compact = [...new Set(tokens.join('').match(/[\u4e00-\u9fffa-z0-9_-]{2,}/gi) || [])]
    .join('')
    .slice(0, 80);
  return compact ? `${intent}:${compact}` : null;
}

function findDirectRouteMatch(routes, options) {
  const { normalizedInput, semanticKey, intentFamily, allowed } = options;
  const exactByInput = new Map();
  const exactBySemantic = new Map();

  for (const route of routes) {
    if (!route?.skill || (allowed.size > 0 && !allowed.has(route.skill))) continue;
    if (route.intentFamily && route.intentFamily !== intentFamily) continue;
    if (route.normalizedInput) {
      exactByInput.set(route.normalizedInput, route);
    }
    const routeSemanticKey = route.semanticKey || buildRouteSemanticKey(route.input || route.normalizedInput);
    if (routeSemanticKey) {
      exactBySemantic.set(routeSemanticKey, route);
    }
  }

  return exactByInput.get(normalizedInput) || (semanticKey ? exactBySemantic.get(semanticKey) : null) || null;
}

function scoreDirectRoute(route, exactMatch) {
  const baseScore = exactMatch ? 1 : 0.96;
  const correctionCount = Number(route.stats?.correctionCount) || 0;
  const correctionPenalty = Math.min(correctionCount * 0.1, 0.3);
  return Math.max(baseScore * 0.85 - correctionPenalty, 0);
}

function createSemanticEntry(entry = {}) {
  const text = String(entry.text || entry.title || '').trim();
  if (!entry.id || !text) return null;
  const normalizedText = normalizeRouteInput(text);
  return {
    id: String(entry.id),
    type: entry.type || 'unknown',
    skill: entry.skill || null,
    title: String(entry.title || text).slice(0, 160),
    source: entry.source || null,
    semanticKey: entry.semanticKey || buildRouteSemanticKey(text),
    normalizedText,
    keywords: extractSemanticKeywords(text),
    stats: { ...(entry.stats || {}) }
  };
}

function extractSemanticKeywords(value) {
  return [...new Set(String(value || '').toLowerCase().match(/[\u3400-\u9fffa-z0-9._-]{2,}/gi) || [])].slice(0, 20);
}

function mergeSemanticEntries(entries) {
  const merged = new Map();
  for (const entry of entries || []) {
    const key = `${entry.type}:${entry.semanticKey || entry.normalizedText || entry.id}:${entry.skill || ''}`;
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, entry);
      continue;
    }
    merged.set(key, {
      ...previous,
      ...entry,
      keywords: [...new Set([...(previous.keywords || []), ...(entry.keywords || [])])],
      stats: {
        ...(previous.stats || {}),
        ...(entry.stats || {}),
        useCount: (Number(previous.stats?.useCount) || 0) + (Number(entry.stats?.useCount) || 0)
      }
    });
  }
  return [...merged.values()];
}

function bigramDice(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const leftPairs = new Map();
  for (let index = 0; index < left.length - 1; index++) {
    const pair = left.slice(index, index + 2);
    leftPairs.set(pair, (leftPairs.get(pair) || 0) + 1);
  }
  let overlap = 0;
  for (let index = 0; index < right.length - 1; index++) {
    const pair = right.slice(index, index + 2);
    const count = leftPairs.get(pair) || 0;
    if (count > 0) {
      overlap++;
      leftPairs.set(pair, count - 1);
    }
  }
  return (2 * overlap) / ((left.length - 1) + (right.length - 1));
}

const ENV_ONLY_ALIASES = new Set([
  'test', 'prod', 'uat', 'gray', 'dev', 'online', 'pts',
  '测试', '生产', '预发', '灰度', '压测'
]);

/**
 * Weak aliases are too short or purely environment words; matching on them
 * causes false positives (e.g. alias "test" hitting any test-env request).
 */
function isWeakAlias(alias) {
  const normalized = String(alias || '').trim().toLowerCase();
  if (!normalized) return true;
  if (ENV_ONLY_ALIASES.has(normalized)) return true;
  return normalized.length <= 4;
}

function mergeUniqueRules(left, right) {
  const merged = [];
  const seen = new Set();
  for (const rule of [...left, ...right]) {
    const key = JSON.stringify(rule || {});
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(rule);
  }
  return merged;
}

function mergeUniqueByKey(items, keyName) {
  const merged = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = item?.[keyName] || JSON.stringify(item || {});
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeResourceBinding(collection, binding) {
  collection.bindings = collection.bindings || [];
  const index = collection.bindings.findIndex(
    (item) =>
      item.id === binding.id ||
      (item.business === binding.business &&
        item.componentType === binding.componentType &&
        item.provider === binding.provider)
  );

  if (index < 0) {
    collection.bindings.push(binding);
    return;
  }

  const previous = collection.bindings[index];
  collection.bindings[index] = {
    ...previous,
    ...binding,
    aliases: [...new Set([...(previous.aliases || []), ...(binding.aliases || [])])],
    keywords: [...new Set([...(previous.keywords || []), ...(binding.keywords || [])])],
    connection: { ...(previous.connection || {}), ...(binding.connection || {}) },
    metadata: { ...(previous.metadata || {}), ...(binding.metadata || {}) },
    stats: {
      useCount: Math.max(Number(previous.stats?.useCount) || 0, Number(binding.stats?.useCount) || 0),
      lastUsed: binding.stats?.lastUsed || previous.stats?.lastUsed || null
    }
  };
}

function mergeScene(existing, incoming) {
  return {
    ...existing,
    ...incoming,
    keywords: [...new Set([...(existing.keywords || []), ...(incoming.keywords || [])])],
    patterns: [...new Set([...(existing.patterns || []), ...(incoming.patterns || [])])],
    workflow: {
      ...(existing.workflow || {}),
      ...(incoming.workflow || {})
    },
    preferences: {
      ...(existing.preferences || {}),
      ...(incoming.preferences || {})
    },
    stats: {
      ...(existing.stats || {}),
      ...(incoming.stats || {})
    }
  };
}

function sanitizeResourceBinding(binding) {
  const clone = {
    ...binding,
    aliases: Array.isArray(binding.aliases) ? [...binding.aliases] : [],
    keywords: Array.isArray(binding.keywords) ? [...binding.keywords] : [],
    connection: redactSensitiveDeep(binding.connection || {}),
    metadata: redactSensitiveDeep(binding.metadata || {})
  };

  clone.stats = {
    useCount: Number(binding.stats?.useCount) || 0,
    lastUsed: binding.stats?.lastUsed || null
  };
  return clone;
}

function inferEnvToken(value) {
  const normalized = String(value || '').toLowerCase();
  if (/(?:^|[^a-z])uat(?:[^a-z]|$)|预发/.test(normalized)) return 'uat';
  if (/(?:^|[^a-z])test(?:[^a-z]|$)|测试/.test(normalized)) return 'test';
  if (/(?:^|[^a-z])gray(?:[^a-z]|$)|灰度/.test(normalized)) return 'gray';
  if (/(?:^|[^a-z])prod(?:[^a-z]|$)|生产|线上|正式/.test(normalized)) return 'prod';
  if (/(?:^|[^a-z])pts(?:[^a-z]|$)|压测/.test(normalized)) return 'pts';
  return null;
}

function inferBindingEnv(binding) {
  if (!binding || typeof binding !== 'object') {
    return null;
  }

  const candidates = [
    binding.connection?.env,
    binding.metadata?.env,
    binding.env,
    binding.business,
    ...(binding.aliases || []),
    ...(binding.keywords || [])
  ];

  for (const candidate of candidates) {
    const env = inferEnvToken(candidate);
    if (env) return env;
  }

  return null;
}

function redactSensitiveDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveDeep(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const safe = {};
  for (const [key, nested] of Object.entries(value)) {
    if (isSensitiveKey(key)) {
      continue;
    }

    if (isSensitiveValue(key, nested)) {
      continue;
    }

    safe[key] = redactSensitiveDeep(nested);
  }

  return safe;
}

function isSensitiveKey(key) {
  return /headers?|token|secret|password|passwd|api[-_ ]?key|authorization|auth|credential|cookie|session/i.test(
    String(key || '')
  );
}

function isSensitiveValue(key, value) {
  if (typeof value !== 'string') {
    return false;
  }

  if (/headers?/i.test(String(key || ''))) {
    return true;
  }

  return /^(Bearer\s+.+|Basic\s+.+)$/i.test(value.trim());
}

async function listLearningSourceFiles(rootDir) {
  if (!(await fs.pathExists(rootDir))) return [];
  const files = [];

  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: path.relative(rootDir, fullPath),
          extension: path.extname(entry.name).toLowerCase(),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        });
      }
    }
  }

  await visit(rootDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

module.exports = LearningEngine;
module.exports.bigramDice = bigramDice;
module.exports.isWeakAlias = isWeakAlias;
module.exports.PersistThrottler = PersistThrottler;
module.exports.WriteQueue = WriteQueue;
