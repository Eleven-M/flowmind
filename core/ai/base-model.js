/**
 * Base Model - AI 模型抽象基类
 * 所有模型 Provider 必须继承此类并实现抽象方法
 */

class BaseModel {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.initialized = false;
    this.requestTimeout = config.requestTimeout || 30000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    // 通用路由标记：决策模型（如 Jev）会覆盖为 false 并要求显式开启
    this.supportsChat = true;
    this.explicitEnableRequired = false;
    this.disabled = false;
    this.disabledReason = null;
  }

  async init() {
    throw new Error('init() must be implemented by subclass');
  }

  async chat(messages, _options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  async complete(prompt, _options = {}) {
    throw new Error('complete() must be implemented by subclass');
  }

  async isAvailable() {
    throw new Error('isAvailable() must be implemented by subclass');
  }

  async listModels() {
    return [];
  }

  getInfo() {
    return {
      name: this.name,
      provider: this.constructor.name,
      initialized: this.initialized
    };
  }

  validateConfig() {
    return true;
  }

  async listOpenAICompatibleModels(headers = {}) {
    const response = await this.fetchWithRetry(`${this.baseUrl}/models`, {
      method: 'GET',
      headers,
      retries: 1,
      timeout: 10000
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Model discovery failed: ${response.status} - ${error}`);
    }

    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    return models
      .map((item) => ({
        id: item?.id,
        label: item?.id,
        raw: item
      }))
      .filter((item) => typeof item.id === 'string' && item.id.trim());
  }

  /**
   * Fetch with retry, timeout, and exponential backoff
   */
  async fetchWithRetry(url, options = {}) {
    const timeout = options.timeout || this.requestTimeout;
    const maxRetries = options.retries || this.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });

        clearTimeout(timer);

        // Retry on rate limit (429) and server errors (5xx)
        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries) {
            const delay = this.retryDelay * Math.pow(2, attempt);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }

        return response;
      } catch (error) {
        if (error.name === 'AbortError') {
          if (attempt < maxRetries) continue;
          throw new Error(`Request timeout after ${timeout}ms`);
        }
        if (attempt < maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw error;
      }
    }
  }
}

module.exports = BaseModel;
