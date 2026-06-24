/**
 * FlowMind - The AI Agent That Learns How You Work
 * Core Engine Entry Point
 */

const SkillLoader = require('./skill-loader');
const LearningEngine = require('./learning-engine');
const SceneMatcher = require('./scene-matcher');
const ConfigManager = require('./config-manager');
const ComponentRegistry = require('./component-registry');
const ModelManager = require('./ai/model-manager');

class FlowMind {
  constructor(options = {}) {
    this.config = new ConfigManager(options.configPath);
    this.learning = new LearningEngine(this.config);
    this.matcher = new SceneMatcher(this.config, this.learning);
    this.components = new ComponentRegistry(this.config);
    this.skills = new SkillLoader(this.config, this.learning, this.components);
    this.ai = new ModelManager(options.ai || {});
    this.initialized = false;
  }

  /**
   * Initialize FlowMind
   */
  async init() {
    if (this.initialized) return this;

    await this.config.load();
    await this.components.init();
    await this.components.initAll();
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
   * Process a user request
   */
  async process(input, context = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const startTime = Date.now();

    try {
      // 1. AI Intent Understanding (if available)
      const intent = await this.ai.understandIntent(input, context);

      // 2. Check for learning patterns (corrections, feedback)
      // Use AI to analyze learning feedback if available
      const aiLearningResult = await this.ai.analyzeLearningFeedback(input, context);
      const learningResult = aiLearningResult?.isLearning
        ? aiLearningResult
        : await this.learning.detectLearning(input, context);
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
      const enhancedContext = {
        ...context,
        ...extractedParams,
        intent: intent
      };
      const result = await this.executeWithLearning(skill, input, enhancedContext);

      // 7. Generate AI summary (if available)
      const summary = await this.ai.summarizeResult(result, {
        skill: skill.name,
        intent: intent
      });

      // 8. Format and return
      return this.formatResult(summary || result, {
        skill: skill.name,
        duration: Date.now() - startTime,
        sceneMatch: sceneMatch,
        intent: intent,
        aiEnhanced: !!summary
      });

    } catch (error) {
      return this.formatError(error.message, input);
    }
  }

  /**
   * Execute skill with learning applied
   */
  async executeWithLearning(skill, input, context) {
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
}

module.exports = FlowMind;
