/**
 * Jev Provider - TypeSafe Jev 决策模型接入
 *
 * Jev 是 System-1 决策模型：不生成文本，只对给定 state 返回
 * Choice / Score / Noul 类型化决策（含概率与置信度）。
 * FlowMind 仅将其用于决策类特性（当前为 skillSelection），
 * 且必须由用户显式开启并配置后才真实接管路由。
 *
 * 开启方式（ai-config.json 的 ai 节点）:
 * {
 *   "providers": {
 *     "jev": { "enabled": true, "apiKey": "...", "model": "jev-latest" }
 *   },
 *   "featureProviders": { "skillSelection": "jev" }
 * }
 */

const BaseModel = require('../base-model');

const DECISION_FIELDS = ['selected', 'answer', 'value', 'choice'];

class JevProvider extends BaseModel {
  constructor(config = {}) {
    super('jev', config);
    // 双重开关：必须显式 enabled === true 且已配置凭据才允许初始化
    this.explicitEnableRequired = true;
    this.enabled = config.enabled === true;
    this.apiKey = config.apiKey || process.env.JEV_API_KEY;
    this.model = config.model || 'jev-latest';
    this.baseUrl = config.baseUrl || 'https://api.typesafe.ai/v1';
    // 决策模型不支持 chat 语义；通用聊天路由据此跳过本 provider
    this.supportsChat = false;
  }

  /**
   * 是否满足启用条件：显式开启 + 已配置 API key
   */
  isReadyToEnable() {
    return this.enabled === true && Boolean(this.apiKey);
  }

  async init() {
    if (this.enabled !== true) {
      throw new Error(
        'Jev provider is not enabled. Set providers.jev.enabled=true and configure JEV_API_KEY to take over skill routing.'
      );
    }
    if (!this.apiKey) {
      throw new Error(
        'Jev API key is required. Set JEV_API_KEY environment variable or providers.jev.apiKey in ai-config.'
      );
    }
    this.initialized = true;
  }

  validateConfig() {
    return this.isReadyToEnable();
  }

  /**
   * 决策端点：对同一 state 并行回答一组类型化问题
   * @param {object} state - 待评估上下文（如用户输入与当前技能）
   * @param {Array} questions - 类型化问题，如 [{ id, type: 'choice', options }]
   * @returns {Promise<object>} 决策结果（含选项、概率分布、置信度）
   */
  async evaluate(state, questions = []) {
    if (!this.initialized) {
      await this.init();
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        state,
        questions
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Jev API error: ${response.status} - ${error}`);
    }

    return response.json();
  }

  /**
   * 决策模型不提供 chat/complete 语义；显式抛错防止被通用路由误用
   */
  async chat() {
    throw new Error('Jev is a decision model and does not support chat; use evaluate() instead.');
  }

  async complete() {
    throw new Error('Jev is a decision model and does not support completion; use evaluate() instead.');
  }

  async isAvailable() {
    return this.initialized && this.isReadyToEnable();
  }

  async listModels() {
    return [
      { id: 'jev-latest', label: 'Jev Latest' }
    ];
  }

  /**
   * 容错解析 Jev 决策响应（兼容 decisions 数组或单对象、常见字段命名）
   * @param {object} response - evaluate() 返回的原始结构
   * @param {string} questionId - 目标问题 id
   * @returns {object|null} { selected, confidence, probabilities, raw }
   */
  parseDecision(response, questionId) {
    const list = Array.isArray(response?.decisions)
      ? response.decisions
      : Array.isArray(response)
        ? response
        : [response].filter(Boolean);

    const match = list.find((item) => (
      item && (item.id === questionId || item.question === questionId || item.questionId === questionId)
    )) || list.find(Boolean);

    if (!match || typeof match !== 'object') {
      return null;
    }

    const selected = DECISION_FIELDS
      .map((field) => match[field])
      .find((value) => value !== undefined && value !== null);
    if (selected === undefined) {
      return null;
    }

    const probabilities = match.probabilities || match.distribution || null;
    const confidenceRaw = match.confidence ?? (probabilities ? probabilities[selected] : undefined);
    const confidence = Number(confidenceRaw);

    return {
      selected: String(selected),
      confidence: Number.isFinite(confidence) ? confidence : null,
      probabilities,
      raw: match
    };
  }

  getInfo() {
    return {
      name: this.name,
      provider: this.constructor.name,
      model: this.model,
      baseUrl: this.baseUrl,
      initialized: this.initialized,
      enabled: this.enabled
    };
  }
}

module.exports = JevProvider;
