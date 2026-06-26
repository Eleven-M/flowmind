/**
 * Ollama Provider - 本地模型接入
 * 支持 Ollama 运行的本地模型（Llama2、Mistral、CodeLlama 等）
 */

const BaseModel = require('../base-model');

class OllamaProvider extends BaseModel {
  constructor(config = {}) {
    super('ollama', config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434';
    this.model = config.model || 'llama2';
    this.temperature = config.temperature ?? 0.3;
  }

  async init() {
    // 检查 Ollama 服务是否可用
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(`Ollama service is not available at ${this.baseUrl}. Please start Ollama first.`);
    }
    this.initialized = true;
  }

  validateConfig() {
    return !!this.baseUrl && !!this.model;
  }

  async chat(messages, options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    // 转换消息格式为 Ollama 格式
    const prompt = this._convertMessagesToPrompt(messages);

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? this.temperature,
          num_predict: options.maxTokens ?? 2000
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.response;
  }

  async complete(prompt, options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? this.temperature,
          num_predict: options.maxTokens ?? 2000
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.response;
  }

  async isAvailable() {
    try {
      const response = await this.fetchWithRetry(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        retries: 1,
        timeout: 5000
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 获取可用模型列表
   * @returns {Promise<Array>}
   */
  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];
      const data = await response.json();
      return data.models || [];
    } catch {
      return [];
    }
  }

  /**
   * 将消息数组转换为单个提示词
   * @private
   */
  _convertMessagesToPrompt(messages) {
    let prompt = '';
    for (const msg of messages) {
      if (msg.role === 'system') {
        prompt += `[System]: ${msg.content}\n\n`;
      } else if (msg.role === 'user') {
        prompt += `[User]: ${msg.content}\n\n`;
      } else if (msg.role === 'assistant') {
        prompt += `[Assistant]: ${msg.content}\n\n`;
      }
    }
    prompt += '[Assistant]: ';
    return prompt;
  }

  getInfo() {
    return {
      ...super.getInfo(),
      model: this.model,
      baseUrl: this.baseUrl
    };
  }
}

module.exports = OllamaProvider;
