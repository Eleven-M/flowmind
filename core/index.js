/**
 * FlowMind - The AI Agent That Learns How You Work
 * Core Engine Entry Point
 */

const SkillLoader = require('./skill-loader');
const LearningEngine = require('./learning-engine');
const SceneMatcher = require('./scene-matcher');
const ConfigManager = require('./config-manager');

class FlowMind {
  constructor(options = {}) {
    this.config = new ConfigManager(options.configPath);
    this.learning = new LearningEngine(this.config);
    this.matcher = new SceneMatcher(this.config, this.learning);
    this.skills = new SkillLoader(this.config, this.learning);
    this.initialized = false;
  }

  /**
   * Initialize FlowMind
   */
  async init() {
    if (this.initialized) return this;

    await this.config.load();
    await this.learning.init();
    await this.skills.loadAll();
    await this.matcher.loadScenes();

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
      // 1. Check for learning patterns (corrections, feedback)
      const learningResult = await this.learning.detectLearning(input, context);
      if (learningResult) {
        return this.formatLearningResponse(learningResult);
      }

      // 2. Check scene mappings
      const sceneMatch = await this.matcher.match(input);
      if (sceneMatch && sceneMatch.confidence >= 0.7) {
        return this.executeSceneWorkflow(sceneMatch, input, context);
      }

      // 3. Select and execute skill
      const skill = await this.skills.select(input, context);
      if (!skill) {
        return this.formatError('No matching skill found', input);
      }

      // 4. Execute with learning applied
      const result = await this.executeWithLearning(skill, input, context);

      // 5. Format and return
      return this.formatResult(result, {
        skill: skill.name,
        duration: Date.now() - startTime,
        sceneMatch: sceneMatch
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
