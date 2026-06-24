/**
 * Model Manager - AI 模型管理器
 * 管理多个模型 Provider，提供统一的调用接口
 */

const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const prompts = require('./prompts');

class ModelManager {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider || 'openai';
    this.features = {
      intentUnderstanding: true,
      parameterExtraction: true,
      skillSelection: true,
      resultSummary: true,
      learningFeedback: true,
      ...config.features
    };
    this.fallbackToRules = config.fallbackToRules !== false;
    this.initialized = false;
  }

  /**
   * 初始化模型管理器
   */
  async init() {
    // 注册内置 Provider
    this._registerBuiltinProviders();

    // 初始化配置的 Provider
    const providersConfig = this.config.providers || {};
    for (const [name, providerConfig] of Object.entries(providersConfig)) {
      try {
        await this.initProvider(name, providerConfig);
      } catch (error) {
        console.warn(`Failed to initialize provider ${name}: ${error.message}`);
      }
    }

    this.initialized = true;
    return this;
  }

  /**
   * 注册内置 Provider
   * @private
   */
  _registerBuiltinProviders() {
    this.providerFactories = {
      openai: (config) => new OpenAIProvider(config),
      anthropic: (config) => new AnthropicProvider(config),
      ollama: (config) => new OllamaProvider(config)
    };
  }

  /**
   * 初始化指定 Provider
   */
  async initProvider(name, config = {}) {
    const factory = this.providerFactories[name];
    if (!factory) {
      throw new Error(`Unknown provider: ${name}`);
    }

    const provider = factory(config);
    await provider.init();
    this.providers.set(name, provider);
    return provider;
  }

  /**
   * 注册自定义 Provider
   */
  registerProvider(name, provider) {
    this.providers.set(name, provider);
  }

  /**
   * 获取 Provider
   */
  getProvider(name) {
    return this.providers.get(name || this.defaultProvider);
  }

  /**
   * 获取默认 Provider
   */
  getDefaultProvider() {
    const provider = this.getProvider(this.defaultProvider);
    if (!provider) {
      // 尝试获取任意可用的 Provider
      for (const [name, p] of this.providers) {
        if (p.initialized) return p;
      }
      return null;
    }
    return provider;
  }

  /**
   * 理解用户意图
   * @param {string} input - 用户输入
   * @param {Object} context - 上下文
   * @returns {Promise<Object>} 意图分析结果
   */
  async understandIntent(input, context = {}) {
    if (!this.features.intentUnderstanding) {
      return null;
    }

    const provider = this.getDefaultProvider();
    if (!provider) {
      return this._fallback('intentUnderstanding', input, context);
    }

    try {
      const messages = [
        { role: 'system', content: prompts.intent.system },
        { role: 'user', content: prompts.intent.user(input, context) }
      ];

      const response = await provider.chat(messages, {
        responseFormat: { type: 'json_object' }
      });

      return JSON.parse(response);
    } catch (error) {
      console.warn(`AI intent understanding failed: ${error.message}`);
      return this._fallback('intentUnderstanding', input, context);
    }
  }

  /**
   * 提取参数
   * @param {string} input - 用户输入
   * @param {string} skillName - 技能名称
   * @param {Object} skillSchema - 参数 schema
   * @returns {Promise<Object>} 提取的参数
   */
  async extractParameters(input, skillName, skillSchema = {}) {
    if (!this.features.parameterExtraction) {
      return {};
    }

    const provider = this.getDefaultProvider();
    if (!provider) {
      return this._fallback('parameterExtraction', input, { skillName });
    }

    try {
      const messages = [
        { role: 'system', content: prompts.extraction.system },
        { role: 'user', content: prompts.extraction.user(input, skillName, skillSchema) }
      ];

      const response = await provider.chat(messages, {
        responseFormat: { type: 'json_object' }
      });

      return JSON.parse(response);
    } catch (error) {
      console.warn(`AI parameter extraction failed: ${error.message}`);
      return this._fallback('parameterExtraction', input, { skillName });
    }
  }

  /**
   * 选择技能
   * @param {string} input - 用户输入
   * @param {Array} candidates - 候选技能列表
   * @returns {Promise<Object>} 选择的技能
   */
  async selectSkill(input, candidates) {
    if (!this.features.skillSelection) {
      return null;
    }

    const provider = this.getDefaultProvider();
    if (!provider) {
      return this._fallback('skillSelection', input, { candidates });
    }

    try {
      const messages = [
        { role: 'system', content: prompts.selection.system },
        { role: 'user', content: prompts.selection.user(input, candidates) }
      ];

      const response = await provider.chat(messages, {
        responseFormat: { type: 'json_object' }
      });

      return JSON.parse(response);
    } catch (error) {
      console.warn(`AI skill selection failed: ${error.message}`);
      return this._fallback('skillSelection', input, { candidates });
    }
  }

  /**
   * 生成结果摘要
   * @param {Object} result - 执行结果
   * @param {Object} context - 上下文
   * @returns {Promise<string>} 摘要文本
   */
  async summarizeResult(result, context = {}) {
    if (!this.features.resultSummary) {
      return null;
    }

    const provider = this.getDefaultProvider();
    if (!provider) {
      return this._fallback('resultSummary', result, context);
    }

    try {
      const messages = [
        { role: 'system', content: prompts.summary.system },
        { role: 'user', content: prompts.summary.user(result, context) }
      ];

      return await provider.chat(messages);
    } catch (error) {
      console.warn(`AI result summary failed: ${error.message}`);
      return this._fallback('resultSummary', result, context);
    }
  }

  /**
   * 分析学习反馈
   * @param {string} input - 用户输入
   * @param {Object} context - 上下文
   * @returns {Promise<Object>} 学习分析结果
   */
  async analyzeLearningFeedback(input, context = {}) {
    if (!this.features.learningFeedback) {
      return null;
    }

    const provider = this.getDefaultProvider();
    if (!provider) {
      return this._fallback('learningFeedback', input, context);
    }

    try {
      const messages = [
        { role: 'system', content: prompts.learning.system },
        { role: 'user', content: prompts.learning.user(input, context) }
      ];

      const response = await provider.chat(messages, {
        responseFormat: { type: 'json_object' }
      });

      return JSON.parse(response);
    } catch (error) {
      console.warn(`AI learning feedback analysis failed: ${error.message}`);
      return this._fallback('learningFeedback', input, context);
    }
  }

  /**
   * 降级处理
   * @private
   */
  _fallback(feature, input, context) {
    if (!this.fallbackToRules) {
      return null;
    }
    // 返回 null，让调用方使用规则引擎
    return null;
  }

  /**
   * 检查是否有可用的 Provider
   */
  hasAvailableProvider() {
    for (const [name, provider] of this.providers) {
      if (provider.initialized) return true;
    }
    return false;
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    const providers = {};
    for (const [name, provider] of this.providers) {
      providers[name] = {
        initialized: provider.initialized,
        info: provider.getInfo()
      };
    }

    return {
      initialized: this.initialized,
      defaultProvider: this.defaultProvider,
      features: this.features,
      providers: providers
    };
  }
}

module.exports = ModelManager;
