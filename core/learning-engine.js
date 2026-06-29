/**
 * FlowMind Learning Engine
 * Handles learning from user corrections and preferences
 */

const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const eventBus = require('./event-bus');
const { expandPath } = require('./utils');

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

class LearningEngine {
  constructor(config, honorEngine = null) {
    this.config = config;
    this.honorEngine = honorEngine;
    this.learningPath = null;
    this.writeQueue = new WriteQueue();
    this.records = {};
    this.skillBindings = {};
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
    await this.loadSkillBindings();
    await this.loadStats();

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
      id: `learn-${Date.now()}-${uuidv4().slice(0, 8)}`,
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
      id: `scene-${Date.now()}-${uuidv4().slice(0, 8)}`,
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
      id: `pref-${Date.now()}-${uuidv4().slice(0, 8)}`,
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
    const bindings = this.skillBindings[skillName] || { records: [], rules: [] };
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
   * Save learning record
   */
  async saveLearningRecord(record) {
    const recordPath = path.join(
      this.expandPath(this.learningPath),
      'records',
      record.skill,
      `${record.id}.json`
    );

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

      scenes.mappings.push(record);
      scenes.lastUpdated = new Date().toISOString();

      await fs.writeJson(scenesPath, scenes, { spaces: 2 });
    });
  }

  /**
   * Save preference
   */
  async savePreference(record) {
    const prefsPath = path.join(
      this.expandPath(this.learningPath),
      'records',
      record.skill,
      'preferences.json'
    );
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

  /**
   * Update skill bindings
   */
  async updateSkillBindings(record) {
    if (!this.skillBindings[record.skill]) {
      this.skillBindings[record.skill] = {
        learningCount: 0,
        records: [],
        rules: []
      };
    }

    const binding = this.skillBindings[record.skill];
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
   * Load skill bindings
   */
  async loadSkillBindings() {
    const bindingsPath = path.join(this.expandPath(this.learningPath), 'skill-bindings.json');

    if (await fs.pathExists(bindingsPath)) {
      this.skillBindings = await fs.readJson(bindingsPath);
    } else {
      this.skillBindings = { version: '1.0', bindings: {} };
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
   * Export learnings
   */
  async export(options = {}) {
    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      stats: this.stats,
      skillBindings: this.skillBindings,
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

    // Merge stats
    this.stats.totalRecords += data.stats.totalRecords || 0;
    Object.assign(this.stats.byType, data.stats.byType || {});
    Object.assign(this.stats.bySkill, data.stats.bySkill || {});

    // Merge skill bindings
    for (const [skill, binding] of Object.entries(data.skillBindings.bindings || {})) {
      if (!this.skillBindings.bindings[skill]) {
        this.skillBindings.bindings[skill] = binding;
      } else {
        this.skillBindings.bindings[skill].records.push(...binding.records);
        this.skillBindings.bindings[skill].rules.push(...binding.rules);
      }
    }

    // Save
    await this.saveSkillBindings();
    await this.saveStats();

    return { success: true, imported: data.stats.totalRecords };
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
          this.records[skill] = this.records[skill].filter(r => r.id !== recordId);
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

  /**
   * Helper methods
   */
  expandPath(filePath) {
    return expandPath(filePath);
  }

  extractCondition(input) {
    // Extract when to apply this learning
    const conditionPatterns = [
      /当.*时/i,
      /when.*is/i,
      /如果.*的话/i
    ];

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

  extractWorkflow(input) {
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

module.exports = LearningEngine;
