/**
 * FlowMind - The AI Agent That Learns How You Work
 * Core Engine Entry Point
 */

const SkillLoader = require('./skill-loader');
const LearningEngine = require('./learning-engine');
const HonorEngine = require('./honor-engine');
const SceneMatcher = require('./scene-matcher');
const ConfigManager = require('./config-manager');
const ComponentRegistry = require('./component-registry');
const ModelManager = require('./ai/model-manager');
const eventBus = require('./event-bus');

class FlowMind {
  constructor(options = {}) {
    this.config = new ConfigManager(options.configPath);
    this.honor = new HonorEngine(this.config);
    this.learning = new LearningEngine(this.config, this.honor);
    this.matcher = new SceneMatcher(this.config, this.learning);
    this.components = new ComponentRegistry(this.config);
    this.skills = new SkillLoader(this.config, this.learning, this.components, this.honor);
    this.ai = new ModelManager(options.ai || {});
    this.initialized = false;
    this.conversationHistory = [];
    this.maxHistoryLength = options.maxHistoryLength || 50;
  }

  /**
   * Initialize FlowMind
   */
  async init() {
    if (this.initialized) return this;

    await this.config.load();
    await this.components.init();
    await this.components.initAll();
    await this.honor.init();
    await this.learning.init();
    await this.skills.loadAll();
    await this.matcher.loadScenes();

    // Initialize AI model manager
    try {
      await this.ai.init();
    } catch (error) {
      console.warn(`AI model initialization failed: ${error.message}. Falling back to rule-based engine.`);
    }

    this.initialized = true;
    return this;
  }

  /**
   * Process a user request with streaming support
   * Yields progress updates as an async generator
   */
  async *processStream(input, context = {}) {
    yield { type: 'start', input, timestamp: new Date().toISOString() };

    const result = await this.process(input, context);

    yield { type: 'progress', message: `Skill: ${result.metadata?.skill || 'unknown'}`, timestamp: new Date().toISOString() };
    yield { type: 'result', data: result, timestamp: new Date().toISOString() };
  }

  /**
   * Process a user request
   */
  async process(input, context = {}) {
    if (!this.initialized) {
      await this.init();
    }

    if (!input || typeof input !== 'string') {
      return this.formatError('Invalid input: expected a non-empty string', input);
    }

    const startTime = Date.now();

    // Build context with conversation history
    const enhancedContext = {
      ...context,
      conversationHistory: this.conversationHistory.slice(-10),
      sessionId: context.sessionId || 'default'
    };

    eventBus.emit('process:start', { input, timestamp: new Date().toISOString() });

    try {
      // 1. AI Intent Understanding (if available)
      const intent = await this.ai.understandIntent(input, enhancedContext);

      // 2. Check for learning patterns (corrections, feedback)
      // Use AI to analyze learning feedback if available
      const aiLearningResult = await this.ai.analyzeLearningFeedback(input, enhancedContext);
      const learningResult = aiLearningResult?.isLearning
        ? aiLearningResult
        : await this.learning.detectLearning(input, enhancedContext);
      if (learningResult) {
        return this.formatLearningResponse(learningResult);
      }

      // 3. Check scene mappings (with AI intent if available)
      const sceneMatch = await this.matcher.match(input, intent);
      if (sceneMatch && sceneMatch.confidence >= 0.7) {
        return this.executeSceneWorkflow(sceneMatch, input, context);
      }

      // 4. Select skill (AI-assisted if available)
      let skill = null;
      const candidates = await this.skills.getCandidates(input, context);

      if (candidates.length > 0) {
        // Use AI to select skill if available
        const aiSelection = await this.ai.selectSkill(input, candidates);
        if (aiSelection && aiSelection.selectedSkill) {
          skill = this.skills.get(aiSelection.selectedSkill);
        }
      }

      // Fallback to rule-based selection
      if (!skill) {
        skill = await this.skills.select(input, context);
      }

      if (!skill) {
        return this.formatError('No matching skill found', input);
      }

      // 5. Extract parameters using AI (if available)
      const extractedParams = await this.ai.extractParameters(input, skill.name);

      // 6. Execute with learning applied
      const executeContext = {
        ...enhancedContext,
        ...extractedParams,
        intent: intent
      };
      const result = await this.executeWithLearning(skill, input, executeContext);

      // 7. Generate AI summary (if available)
      const summary = await this.ai.summarizeResult(result, {
        skill: skill.name,
        intent: intent
      });

      // 8. Format and return
      const formatted = this.formatResult(summary || result, {
        skill: skill.name,
        duration: Date.now() - startTime,
        sceneMatch: sceneMatch,
        intent: intent,
        aiEnhanced: !!summary
      });

      // Save to conversation history
      this.conversationHistory.push({
        input,
        output: formatted,
        skill: skill.name,
        timestamp: new Date().toISOString()
      });
      if (this.conversationHistory.length > this.maxHistoryLength) {
        this.conversationHistory.shift();
      }

      eventBus.emit('process:complete', {
        input,
        skill: skill.name,
        duration: formatted.metadata.duration,
        success: true,
        timestamp: formatted.timestamp
      });

      return formatted;

    } catch (error) {
      eventBus.emit('process:error', { input, error: error.message, timestamp: new Date().toISOString() });
      return this.formatError(error.message, input);
    }
  }

  /**
   * Execute skill with learning applied
   */
  async executeWithLearning(skill, input, context) {
    const skillStartTime = Date.now();

    // Get learning rules for this skill
    const learnings = await this.learning.getSkillLearnings(skill.name);

    // Apply learning rules to context
    const enhancedContext = {
      ...context,
      learnings: learnings,
      preferences: await this.learning.getPreferences(skill.name)
    };

    // Execute skill
    const result = await skill.execute(input, enhancedContext);

    const duration = Date.now() - skillStartTime;

    // Emit skill execution event
    eventBus.emit('skill:executed', {
      name: skill.name,
      duration,
      success: true,
      timestamp: new Date().toISOString()
    });

    // Award honor point for skill use
    await this.honor.award('skill_use', `Used skill: ${skill.name}`);

    return result;
  }

  /**
   * Execute scene workflow
   */
  async executeSceneWorkflow(sceneMatch, input, context) {
    const { scene, params } = sceneMatch;
    const results = [];

    for (const step of scene.workflow.skills) {
      const skill = this.skills.get(step.skill);
      if (!skill) continue;

      const stepContext = {
        ...context,
        params: { ...step.params, ...params },
        previousResults: results
      };

      const result = await this.executeWithLearning(skill, input, stepContext);
      results.push({
        skill: step.skill,
        result: result
      });
    }

    return {
      type: 'scene_workflow',
      scene: scene.name,
      results: results,
      preferences: scene.preferences
    };
  }

  /**
   * Format learning response
   */
  formatLearningResponse(learningResult) {
    const { type, record, confirmation } = learningResult;

    return {
      type: 'learning',
      learningType: type,
      record: record,
      message: confirmation,
      success: true
    };
  }

  /**
   * Format result
   */
  formatResult(result, metadata) {
    return {
      type: 'result',
      success: true,
      data: result,
      metadata: metadata,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Format error
   */
  formatError(message, input) {
    return {
      type: 'error',
      success: false,
      message: message,
      input: input,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get learning statistics
   */
  async getStats() {
    return this.learning.getStats();
  }

  /**
   * Get honor data
   */
  getHonorData() {
    return this.honor.getData();
  }

  /**
   * Get the component registry
   * @returns {ComponentRegistry}
   */
  getComponentRegistry() {
    return this.components;
  }

  /**
   * Get the active adapter for a component type
   * @param {string} componentType
   * @returns {BaseAdapter|null}
   */
  getAdapter(componentType) {
    return this.components.getAdapter(componentType);
  }

  /**
   * Get component status summary
   * @returns {object}
   */
  getComponentStatus() {
    return this.components.getStatus();
  }

  /**
   * Get AI model status
   * @returns {object}
   */
  getAIStatus() {
    return this.ai.getStatus();
  }

  /**
   * Check if AI is available
   * @returns {boolean}
   */
  hasAI() {
    return this.ai.hasAvailableProvider();
  }

  /**
   * Export learnings
   */
  async exportLearnings(options) {
    return this.learning.export(options);
  }

  /**
   * Import learnings
   */
  async importLearnings(data) {
    return this.learning.import(data);
  }

  /**
   * Get conversation history
   */
  getConversationHistory(sessionId) {
    if (sessionId) {
      return this.conversationHistory.filter(h => h.sessionId === sessionId);
    }
    return this.conversationHistory;
  }

  /**
   * Clear conversation history
   */
  clearHistory() {
    this.conversationHistory = [];
  }

  /**
   * Graceful shutdown - flush pending data and clean up
   */
  async shutdown() {
    eventBus.emit('shutdown:start', { timestamp: new Date().toISOString() });

    // Save learning data
    try {
      if (this.learning?.skillBindings) {
        await this.learning.saveSkillBindings();
      }
      if (this.learning?.stats) {
        await this.learning.saveStats();
      }
    } catch (e) {
      console.warn('Failed to save learning data during shutdown:', e.message);
    }

    // Save honor data
    try {
      if (this.honor?.save) {
        await this.honor.save();
      }
    } catch (e) {
      console.warn('Failed to save honor data during shutdown:', e.message);
    }

    // Clear conversation history
    this.conversationHistory = [];

    this.initialized = false;
    eventBus.emit('shutdown:complete', { timestamp: new Date().toISOString() });
  }

  /**
   * Run system health checks (doctor)
   */
  async doctor() {
    const checks = [];

    // 1. Config check
    try {
      await this.config.load();
      checks.push({ name: 'Configuration', status: 'ok', message: 'Config loaded successfully' });
    } catch (e) {
      checks.push({ name: 'Configuration', status: 'error', message: e.message });
    }

    // 2. Skills check
    try {
      const skills = this.skills.list();
      checks.push({ name: 'Skills', status: 'ok', message: `${skills.length} skill(s) loaded` });
    } catch (e) {
      checks.push({ name: 'Skills', status: 'error', message: e.message });
    }

    // 3. Learning engine check
    try {
      const stats = await this.learning.getStats();
      checks.push({ name: 'Learning Engine', status: 'ok', message: `${stats.totalRecords || 0} records` });
    } catch (e) {
      checks.push({ name: 'Learning Engine', status: 'error', message: e.message });
    }

    // 4. Honor engine check
    try {
      const honor = this.honor.getData();
      checks.push({ name: 'Honor Engine', status: 'ok', message: `Level ${honor.level}, ${honor.points} pts` });
    } catch (e) {
      checks.push({ name: 'Honor Engine', status: 'error', message: e.message });
    }

    // 5. AI providers check
    try {
      const aiStatus = this.ai.getStatus();
      const providerCount = Object.keys(aiStatus.providers || {}).length;
      const activeCount = Object.values(aiStatus.providers || {}).filter(p => p.initialized).length;
      checks.push({ name: 'AI Providers', status: activeCount > 0 ? 'ok' : 'warning', message: `${activeCount}/${providerCount} active` });
    } catch (e) {
      checks.push({ name: 'AI Providers', status: 'warning', message: e.message });
    }

    // 6. Components check
    try {
      const compStatus = this.components.getStatus();
      const compCount = Object.keys(compStatus).length;
      checks.push({ name: 'Components', status: 'ok', message: `${compCount} registered` });
    } catch (e) {
      checks.push({ name: 'Components', status: 'warning', message: e.message });
    }

    // 7. Node.js version check
    const nodeVersion = process.version;
    const major = parseInt(nodeVersion.slice(1));
    checks.push({
      name: 'Node.js',
      status: major >= 18 ? 'ok' : 'warning',
      message: `${nodeVersion} ${major < 18 ? '(recommend >= 18)' : ''}`
    });

    // 8. Disk space for learning data
    try {
      const fs = require('fs-extra');
      const learningPath = this.learning.expandPath(this.learning.learningPath);
      if (await fs.pathExists(learningPath)) {
        checks.push({ name: 'Learning Storage', status: 'ok', message: learningPath });
      } else {
        checks.push({ name: 'Learning Storage', status: 'warning', message: 'Directory not yet created' });
      }
    } catch (e) {
      checks.push({ name: 'Learning Storage', status: 'warning', message: e.message });
    }

    const errors = checks.filter(c => c.status === 'error').length;
    const warnings = checks.filter(c => c.status === 'warning').length;

    return {
      healthy: errors === 0,
      checks,
      summary: { total: checks.length, ok: checks.filter(c => c.status === 'ok').length, warnings, errors }
    };
  }
}

module.exports = FlowMind;
