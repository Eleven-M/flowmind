/**
 * Model Manager - AI 模型管理器
 * 管理多个模型 Provider，提供统一的调用接口
 */

const { createHash } = require('crypto');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const GLMProvider = require('./providers/glm');
const MiMoProvider = require('./providers/mimo');
const QwenProvider = require('./providers/qwen');
const ERNIEProvider = require('./providers/ernie');
const DeepSeekProvider = require('./providers/deepseek');
const JevProvider = require('./providers/jev');
const prompts = require('./prompts');

class ModelManager {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.defaultProvider = config.defaultProvider || 'openai';
    this.defaultModel = config.defaultModel || null;
    // 特性级路由：featureProviders[feature] 指定决策类 provider（如 jev）
    this.featureProviders = config.featureProviders || {};
    // 决策 provider 返回的置信度低于该阈值时回落到默认 LLM provider
    this.decisionMinConfidence = Number(config.decisionMinConfidence) || 0.6;
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

    // 注册环境级接管 Provider（当前模型工具）：主 Provider 不可用时按最高优先级接管
    await this._ensureEnvTakeoverProvider();

    this.initialized = true;
    return this;
  }

  /**
   * 注册环境提供的接管 Provider（当前模型工具，如 Claude Code 注入的 anthropic 网关凭据）。
   * 不改变 defaultProvider；当默认 Provider 失败（如 glm 余额不足 429）时，
   * 该 Provider 以最高 failover 优先级接管 AI 调用。
   */
  async _ensureEnvTakeoverProvider() {
    if (this.providers.has('anthropic')) return null;
    if (process.env.FLOWMIND_DISABLE_ENV_AI_TAKEOVER === '1') return null;

    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    const token = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
    if (!baseUrl || !token) return null;

    try {
      const provider = await this.initProvider('anthropic', {
        baseUrl,
        authToken: process.env.ANTHROPIC_AUTH_TOKEN || undefined,
        apiKey: process.env.ANTHROPIC_API_KEY || undefined,
        model: process.env.ANTHROPIC_MODEL || undefined
      });
      provider.envTakeover = true;
      return provider;
    } catch (error) {
      this._warn(`Env takeover provider (anthropic) unavailable: ${error.message}`);
      return null;
    }
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
      deepseek: (config) => new DeepSeekProvider(config),
      jev: (config) => new JevProvider(config)
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

    // 显式开启类 Provider（如 Jev）：未开启或未配置时不初始化、不接管。
    // 仍保留在注册表中，便于 doctor / status 展示禁用原因。
    if (provider.explicitEnableRequired && !provider.isReadyToEnable()) {
      provider.disabled = true;
      provider.disabledReason = provider.enabled === true
        ? 'missing API key'
        : 'not enabled';
      this.providers.set(name, provider);
      return provider;
    }

    await provider.init();
    this.providers.set(name, provider);
    return provider;
  }

  /**
   * 获取指定特性的路由 Provider（如 skillSelection -> jev）。
   * 仅当 Provider 已启用并初始化时返回；否则返回 null 走默认链路。
   */
  _getFeatureProvider(feature) {
    const name = this.featureProviders?.[feature];
    if (!name) return null;

    const provider = this.providers.get(name);
    if (!provider || provider.disabled || !provider.initialized) return null;
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

    return this._cachedCallWithFailover('intentUnderstanding', { input, context: compactCacheContext(context) }, async (provider) => {
      const messages = [
        { role: 'system', content: prompts.intent.system },
        { role: 'user', content: prompts.intent.user(input, context) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return this._parseJsonResponse(response, 'intentUnderstanding');
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

    return this._cachedCallWithFailover('parameterExtraction', { input, skillName, skillSchema }, async (provider) => {
      const messages = [
        { role: 'system', content: prompts.extraction.system },
        { role: 'user', content: prompts.extraction.user(input, skillName, skillSchema) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return this._parseJsonResponse(response, 'parameterExtraction');
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

    // 决策类 Provider（如 Jev）优先：低成本高并发的技能路由
    const featureProvider = this._getFeatureProvider('skillSelection');
    if (featureProvider && typeof featureProvider.evaluate === 'function') {
      try {
        const selection = await this._cachedCall('skillSelection', {
          input,
          candidates: compactSkillCandidates(candidates),
          context: compactCacheContext(context),
          featureProvider: featureProvider.name
        }, async () => this._selectSkillWithDecisionProvider(featureProvider, input, candidates, context));

        if (selection && selection.selectedSkill) {
          return selection;
        }
      } catch (error) {
        this._warnOnce(
          this._buildWarningKey(featureProvider, error),
          `Feature provider (${featureProvider.name}) failed for skillSelection, falling back to LLM providers: ${error.message}`
        );
      }
    }

    return this._cachedCallWithFailover('skillSelection', {
      input,
      candidates: compactSkillCandidates(candidates),
      context: compactCacheContext(context)
    }, async (provider) => {
      const messages = [
        { role: 'system', content: prompts.selection.system },
        { role: 'user', content: prompts.selection.user(input, candidates, context) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return this._parseJsonResponse(response, 'skillSelection');
    }, 'skillSelection');
  }

  /**
   * 通过决策类 Provider（evaluate 语义）选择技能。
   * 置信度低于 decisionMinConfidence 或选项非法时返回 null，交由上层回落。
   * @private
   */
  async _selectSkillWithDecisionProvider(provider, input, candidates, context = {}) {
    const options = (Array.isArray(candidates) ? candidates : [])
      .map((candidate) => ({
        id: candidate?.name || candidate?.skill || null,
        label: candidate?.description || candidate?.name || null
      }))
      .filter((option) => option.id);

    if (options.length === 0) return null;

    const state = {
      input,
      currentSkill: context.currentSkill || null,
      routeHistory: Array.isArray(context.routeHistory) ? context.routeHistory : []
    };

    const response = await provider.evaluate(state, [
      {
        id: 'selected_skill',
        type: 'choice',
        question: 'Which skill best matches the user input?',
        options
      }
    ]);

    const decision = typeof provider.parseDecision === 'function'
      ? provider.parseDecision(response, 'selected_skill')
      : this._parseDecisionResponse(response);

    if (!decision || !decision.selected) return null;

    const selectedSkill = String(decision.selected);
    const validIds = new Set(options.map((option) => option.id));
    if (!validIds.has(selectedSkill)) return null;

    const confidence = Number(decision.confidence);
    if (!Number.isFinite(confidence) || confidence < this.decisionMinConfidence) {
      return null;
    }

    return {
      selectedSkill,
      confidence,
      source: provider.name || 'decision',
      probabilities: decision.probabilities || null
    };
  }

  /**
   * 通用决策响应兜底解析（Provider 未提供 parseDecision 时使用）
   * @private
   */
  _parseDecisionResponse(response) {
    const list = Array.isArray(response?.decisions)
      ? response.decisions
      : Array.isArray(response)
        ? response
        : [response].filter(Boolean);
    const decision = list.find((item) => item && typeof item === 'object');
    if (!decision) return null;

    return {
      selected: decision.selected ?? decision.answer ?? decision.value ?? decision.choice ?? null,
      confidence: Number(decision.confidence),
      probabilities: decision.probabilities || null
    };
  }

  /**
   * 生成结果摘要
   * @param {Object} result - 执行结果
   * @param {Object} context - 上下文
   * @returns {Promise<string>} 摘要文本
   */
  async summarizeResult(result, context = {}) {
    if (!this.features.resultSummary) return null;

    return this._cachedCallWithFailover('resultSummary', {
      result: compactForCache(result),
      context: compactCacheContext(context)
    }, async (provider) => {
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
    if (defaultProvider && defaultProvider.supportsChat !== false) {
      attemptedProviders.push(defaultProvider);
    }
    for (const [_name, provider] of this.providers) {
      if (provider && provider.initialized && provider.supportsChat !== false && provider !== defaultProvider) {
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

    return this._cachedCallWithFailover('learningFeedback', { input, context: compactCacheContext(context) }, async (provider) => {
      const messages = [
        { role: 'system', content: prompts.learning.system },
        { role: 'user', content: prompts.learning.user(input, context) }
      ];
      const response = await provider.chat(messages, { responseFormat: { type: 'json_object' } });
      return this._parseJsonResponse(response, 'learningFeedback');
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
    if (defaultProvider && defaultProvider.supportsChat !== false) {
      try {
        return await fn(defaultProvider);
      } catch (error) {
        this._warnOnce(this._buildWarningKey(defaultProvider, error), `Default provider (${this.defaultProvider}) failed for ${feature}: ${error.message}`);
      }
    }

    // Try other providers; env takeover provider (当前模型工具) gets top failover priority
    const failoverCandidates = [...this.providers.entries()]
      .filter(([_name, provider]) => (
        provider.initialized
        && provider !== defaultProvider
        && provider.supportsChat !== false
      ))
      .sort((a, b) => (b[1].envTakeover ? 1 : 0) - (a[1].envTakeover ? 1 : 0));

    for (const [name, provider] of failoverCandidates) {
      try {
        this._warnOnce(
          `failover:${name}`,
          provider.envTakeover
            ? `[AI接管] ${this.defaultProvider} 不可用，当前模型工具已接管 AI 调用 (provider: ${name}) for ${feature}`
            : `Failing over to provider: ${name} for ${feature}`
        );
        return await fn(provider);
      } catch (error) {
        this._warnOnce(this._buildWarningKey(provider, error), `Failover provider ${name} failed for ${feature}: ${error.message}`);
      }
    }

    // All providers failed, use rule-based fallback
    return this._fallback(feature);
  }

  async _cachedCallWithFailover(feature, payload, fn) {
    const key = this._buildCacheKey(feature, payload);
    const cached = this._getCached(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const value = await this._callWithFailover(fn, feature);
    if (value !== null && value !== undefined) {
      this._setCache(key, value);
    }
    return value;
  }

  /**
   * 不走 provider 链路的特性级缓存调用（用于决策 Provider 直连）
   * @private
   */
  async _cachedCall(feature, payload, compute) {
    const key = this._buildCacheKey(feature, payload);
    const cached = this._getCached(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const value = await compute();
    if (value !== null && value !== undefined) {
      this._setCache(key, value);
    }
    return value;
  }

  _buildCacheKey(feature, payload) {
    const digest = createHash('sha1')
      .update(stableStringify({
        provider: this.defaultProvider,
        model: this.defaultModel,
        feature,
        payload
      }))
      .digest('hex');
    return `${feature}:${digest}`;
  }

  /**
   * 解析模型返回的 JSON（容忍 ```json 代码块、前后缀说明文字、thinking 前缀等）
   * @private
   */
  _parseJsonResponse(response, feature) {
    const text = String(response || '').trim();
    if (!text) {
      throw new Error(`Empty AI response for ${feature}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      // fallthrough: try to locate the first JSON object/array in the text
    }

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [];
    if (fenced && fenced[1]) candidates.push(fenced[1].trim());

    const firstBrace = text.indexOf('{');
    const firstBracket = text.indexOf('[');
    const start = firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)
      ? firstBracket
      : firstBrace;
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (start !== -1 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate);
      } catch {
        continue;
      }
    }

    throw new Error(`Invalid JSON response for ${feature}: ${text.slice(0, 120)}`);
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
        disabled: provider.disabled === true,
        disabledReason: provider.disabledReason || null,
        envTakeover: provider.envTakeover === true,
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

function compactCacheContext(context = {}) {
  return {
    intent: context.intent || null,
    action: context.action || null,
    currentSkill: context.currentSkill || null,
    skill: context.skill || null,
    aiAvailable: context.aiAvailable,
    routeHistory: Array.isArray(context.routeHistory)
      ? context.routeHistory.slice(0, 5).map((hint) => ({
          skill: hint.skill,
          input: hint.input,
          useCount: hint.useCount,
          similarity: hint.similarity
        }))
      : []
  };
}

function compactSkillCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => ({
    name: candidate.name,
    description: candidate.description,
    category: candidate.category,
    score: candidate.score
  }));
}

function compactForCache(value) {
  const text = stableStringify(value);
  return text.length > 12000 ? `${text.slice(0, 12000)}...[truncated:${text.length}]` : text;
}

function stableStringify(value) {
  return JSON.stringify(normalizeForStableStringify(value));
}

function normalizeForStableStringify(value, depth = 0) {
  if (depth > 6) return '[MaxDepth]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => normalizeForStableStringify(item, depth + 1));
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const key of Object.keys(value).sort()) {
    const item = value[key];
    if (typeof item === 'function') continue;
    if (key === 'flowmind' || key === 'componentRegistry' || key === 'conversationHistory') continue;
    result[key] = normalizeForStableStringify(item, depth + 1);
  }
  return result;
}

module.exports = ModelManager;
