/**
 * Model Manager - AI 模型管理器
 * 管理多个模型 Provider，提供统一的调用接口
 */

const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const GLMProvider = require('./providers/glm');
const MiMoProvider = require('./providers/mimo');
const QwenProvider = require('./providers/qwen');
const ERNIEProvider = require('./providers/ernie');
const DeepSeekProvider = require('./providers/deepseek');
const prompts = require('./prompts');

class ModelManager {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider || 'openai';
    this.defaultModel = config.defaultModel || null;
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
    this.cache = new Map();
    this.cacheMaxAge = config.cacheMaxAge || 300000; // 5 minutes
    this.cacheMaxSize = config.cacheMaxSize || 100;
    this.warnedErrors = new Set();
    this.silenceWarnings = config.silenceWarnings === true;
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
        this._warn(`Failed to initialize provider ${name}: ${error.message}`);
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
      ollama: (config) => new OllamaProvider(config),
      glm: (config) => new GLMProvider(config),
      mimo: (config) => new MiMoProvider(config),
      qwen: (config) => new QwenProvider(config),
      ernie: (config) => new ERNIEProvider(config),
      deepseek: (config) => new DeepSeekProvider(config)
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

    const resolvedConfig = { ...config };
    if (!resolvedConfig.model && this.defaultModel) {
      resolvedConfig.model = this.defaultModel;
    }

    const provider = factory(resolvedConfig);
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

  createProvider(name, config = {}) {
    if (!this.providerFactories) {
      this._registerBuiltinProviders();
    }

    const factory = this.providerFactories[name];
    if (!factory) {
      throw new Error(`Unknown provider: ${name}`);
    }

    const resolvedConfig = { ...config };
    if (!resolvedConfig.model && this.defaultModel) {
      resolvedConfig.model = this.defaultModel;
    }

    return factory(resolvedConfig);
  }

  async discoverModels(name, config = {}) {
    const provider = this.createProvider(name, config);
    const models = await provider.listModels();
    const seen = new Set();

    return (Array.isArray(models) ? models : [])
      .map((item) => {
        if (typeof item === 'string') {
          return { id: item, label: item };
        }

        const id = item?.id || item?.name || item?.model;
        if (!id || seen.has(id)) {
          return null;
        }

        return {
          id,
          label: item?.label || id,
          raw: item?.raw || item
        };
      })
      .filter((item) => {
        if (!item?.id || seen.has(item.id)) {
          return false;
        }
        seen.add(item.id);
        return true;
      });
  }

  /**
   * 获取默认 Provider
   */
  getDefaultProvider() {
    const provider = this.getProvider(this.defaultProvider);
    if (!provider) {
      // 尝试获取任意可用的 Provider
      for (const [_name, p] of this.providers) {
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
    if (!this.features.intentUnderstanding) return null;

    return this._callWithFailover(async (provider) => {
      const messages = [
        { role: 'system', content: prompts.intent.system },
        { role: 'user', content: prompts.intent.user(input, context) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return JSON.parse(response);
    }, 'intentUnderstanding');
  }

  /**
   * 提取参数
   * @param {string} input - 用户输入
   * @param {string} skillName - 技能名称
   * @param {Object} skillSchema - 参数 schema
   * @returns {Promise<Object>} 提取的参数
   */
  async extractParameters(input, skillName, skillSchema = {}) {
    if (!this.features.parameterExtraction) return {};

    return this._callWithFailover(async (provider) => {
      const messages = [
        { role: 'system', content: prompts.extraction.system },
        { role: 'user', content: prompts.extraction.user(input, skillName, skillSchema) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return JSON.parse(response);
    }, 'parameterExtraction');
  }

  /**
   * 选择技能
   * @param {string} input - 用户输入
   * @param {Array} candidates - 候选技能列表
   * @returns {Promise<Object>} 选择的技能
   */
  async selectSkill(input, candidates, context = {}) {
    if (!this.features.skillSelection) return null;

    return this._callWithFailover(async (provider) => {
      const messages = [
        { role: 'system', content: prompts.selection.system },
        { role: 'user', content: prompts.selection.user(input, candidates, context) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return JSON.parse(response);
    }, 'skillSelection');
  }

  /**
   * 生成结果摘要
   * @param {Object} result - 执行结果
   * @param {Object} context - 上下文
   * @returns {Promise<string>} 摘要文本
   */
  async summarizeResult(result, context = {}) {
    if (!this.features.resultSummary) return null;

    return this._callWithFailover(async (provider) => {
      const messages = [
        { role: 'system', content: prompts.summary.system },
        { role: 'user', content: prompts.summary.user(result, context) }
      ];
      return await provider.chat(messages);
    }, 'resultSummary');
  }

  /**
   * 生成自然语言回复
   * @param {string} input - 用户输入
   * @param {Object} context - 上下文
   * @returns {Promise<string>}
   */
  async answerQuery(input, context = {}) {
    const messages = [
      { role: 'system', content: prompts.response.system },
      { role: 'user', content: prompts.response.user(input, context) }
    ];

    const attemptedProviders = [];
    const defaultProvider = this.getDefaultProvider();
    if (defaultProvider) {
      attemptedProviders.push(defaultProvider);
    }
    for (const [_name, provider] of this.providers) {
      if (provider && provider.initialized && provider !== defaultProvider) {
        attemptedProviders.push(provider);
      }
    }

    let lastError = null;
    for (const provider of attemptedProviders) {
      try {
        const response = await provider.chat(messages);
        provider.lastError = null;
        provider.lastCheckedAt = new Date().toISOString();
        provider.lastHealth = 'ready';
        return response;
      } catch (error) {
        lastError = error;
        provider.lastError = error.message || String(error);
        provider.lastCheckedAt = new Date().toISOString();
        provider.lastHealth = 'error';
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('No available AI provider');
  }

  /**
   * 分析学习反馈
   * @param {string} input - 用户输入
   * @param {Object} context - 上下文
   * @returns {Promise<Object>} 学习分析结果
   */
  async analyzeLearningFeedback(input, context = {}) {
    if (!this.features.learningFeedback) return null;

    return this._callWithFailover(async (provider) => {
      const messages = [
        { role: 'system', content: prompts.learning.system },
        { role: 'user', content: prompts.learning.user(input, context) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return JSON.parse(response);
    }, 'learningFeedback');
  }

  /**
   * Get cached result if available and not expired
   * @private
   */
  _getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.cacheMaxAge) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set cache entry, evicting oldest if at capacity
   * @private
   */
  _setCache(key, value) {
    if (this.cache.size >= this.cacheMaxSize) {
      const oldest = this.cache.keys().next().value;
      this.cache.delete(oldest);
    }
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  /**
   * Clear the AI response cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Call AI with automatic failover to other providers
   * @private
   */
  async _callWithFailover(fn, feature) {
    // Try default provider first
    const defaultProvider = this.getDefaultProvider();
    if (defaultProvider) {
      try {
        return await fn(defaultProvider);
      } catch (error) {
        this._warnOnce(this._buildWarningKey(defaultProvider, error), `Default provider (${this.defaultProvider}) failed for ${feature}: ${error.message}`);
      }
    }

    // Try other providers
    for (const [name, provider] of this.providers) {
      if (name === this.defaultProvider || !provider.initialized) continue;
      try {
        this._warnOnce(`failover:${name}`, `Failing over to provider: ${name} for ${feature}`);
        return await fn(provider);
      } catch (error) {
        this._warnOnce(this._buildWarningKey(provider, error), `Failover provider ${name} failed for ${feature}: ${error.message}`);
      }
    }

    // All providers failed, use rule-based fallback
    return this._fallback(feature);
  }

  _warn(message) {
    if (this.silenceWarnings || process.env.FLOWMIND_SILENCE_AI_WARNINGS === '1') {
      return;
    }
    console.warn(message);
  }

  _warnOnce(key, message) {
    if (this.silenceWarnings || process.env.FLOWMIND_SILENCE_AI_WARNINGS === '1') {
      return;
    }

    const normalizedKey = String(key || message || '').trim();
    if (!normalizedKey || this.warnedErrors.has(normalizedKey)) {
      return;
    }

    this.warnedErrors.add(normalizedKey);
    console.warn(message);
  }

  _buildWarningKey(provider, error) {
    const providerName = provider?.providerName || provider?.name || this.defaultProvider || 'provider';
    const code = error?.code || error?.statusCode || 'error';
    const message = String(error?.message || '').replace(/failed for [^:]+:/i, 'failed for *:');
    return `${providerName}:${code}:${message}`;
  }

  /**
   * Rule-based fallback when AI is unavailable
   * @private
   */
  _fallback(feature) {
    if (!this.fallbackToRules) return null;

    switch (feature) {
      case 'intentUnderstanding':
        return { intent: 'unknown', confidence: 0, source: 'rules' };
      case 'parameterExtraction':
        return {};
      case 'skillSelection':
        return { selectedSkill: null, confidence: 0, source: 'rules' };
      case 'resultSummary':
        return null;
      case 'learningFeedback':
        return { isLearning: false, source: 'rules' };
      default:
        return null;
    }
  }

  /**
   * 检查是否有可用的 Provider
   */
  hasAvailableProvider() {
    for (const [_name, provider] of this.providers) {
      if (provider.initialized) return true;
    }
    return false;
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    const providers = {};
    let overallHealth = 'off';
    for (const [name, provider] of this.providers) {
      const providerHealth = provider.lastError
        ? 'error'
        : provider.initialized
          ? 'ready'
          : 'off';
      if (overallHealth !== 'error' && providerHealth === 'error') {
        overallHealth = 'error';
      } else if (overallHealth === 'off' && providerHealth === 'ready') {
        overallHealth = 'ready';
      }
      providers[name] = {
        initialized: provider.initialized,
        health: providerHealth,
        error: provider.lastError || null,
        lastCheckedAt: provider.lastCheckedAt || null,
        info: provider.getInfo()
      };
    }

    return {
      initialized: this.initialized,
      defaultProvider: this.defaultProvider,
      defaultModel: this.defaultModel,
      health: overallHealth,
      features: this.features,
      providers: providers
    };
  }
}

module.exports = ModelManager;
