/**
 * GLM Provider - 智谱AI GLM 模型接入
 * 支持 GLM-4、GLM-4-Flash、ChatGLM 等模型
 */

const BaseModel = require('../base-model');

class GLMProvider extends BaseModel {
  constructor(config = {}) {
    super('glm', config);
    this.apiKey = config.apiKey || process.env.ZHIPU_API_KEY;
    this.model = config.model || 'glm-4-flash';
    this.baseUrl = config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 2000;
  }

  async init() {
    if (!this.apiKey) {
      throw new Error('Zhipu API key is required. Set ZHIPU_API_KEY environment variable or provide in config.');
    }
    this.initialized = true;
  }

  validateConfig() {
    return !!this.apiKey;
  }

  async chat(messages, options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: messages,
        temperature: options.temperature ?? this.temperature,
        max_tokens: options.maxTokens ?? this.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GLM API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  async complete(prompt, options = {}) {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async isAvailable() {
    try {
      if (!this.apiKey) return false;
      const response = await this.fetchWithRetry(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
        retries: 1,
        timeout: 10000
      });
      return response.ok || response.status === 400;
    } catch {
      return false;
    }
  }

  getInfo() {
    return {
      ...super.getInfo(),
      model: this.model,
      baseUrl: this.baseUrl,
      provider: 'Zhipu AI'
    };
  }
}

module.exports = GLMProvider;
