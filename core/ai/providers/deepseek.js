/**
 * DeepSeek Provider - DeepSeek 模型接入
 * 支持 DeepSeek-V3、DeepSeek-R1 等模型
 */

const BaseModel = require('../base-model');

class DeepSeekProvider extends BaseModel {
  constructor(config = {}) {
    super('deepseek', config);
    this.apiKey = config.apiKey || process.env.DEEPSEEK_API_KEY;
    this.model = config.model || 'deepseek-chat';
    this.baseUrl = config.baseUrl || 'https://api.deepseek.com/v1';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 2000;
  }

  async init() {
    if (!this.apiKey) {
      throw new Error('DeepSeek API key is required. Set DEEPSEEK_API_KEY environment variable or provide in config.');
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
      throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
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
      provider: 'DeepSeek'
    };
  }
}

module.exports = DeepSeekProvider;
