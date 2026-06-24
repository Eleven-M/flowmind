/**
 * MiMo Provider - 小米 MiMo 模型接入
 * 支持 MiMo-7B 等模型
 */

const BaseModel = require('../base-model');

class MiMoProvider extends BaseModel {
  constructor(config = {}) {
    super('mimo', config);
    this.apiKey = config.apiKey || process.env.MIMO_API_KEY;
    this.model = config.model || 'mimo-7b';
    this.baseUrl = config.baseUrl || 'https://api.mimo.ai/v1';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 2000;
  }

  async init() {
    if (!this.apiKey) {
      throw new Error('MiMo API key is required. Set MIMO_API_KEY environment variable or provide in config.');
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

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
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
      throw new Error(`MiMo API error: ${response.status} - ${error}`);
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
      return true;
    } catch {
      return false;
    }
  }

  getInfo() {
    return {
      ...super.getInfo(),
      model: this.model,
      baseUrl: this.baseUrl,
      provider: 'Xiaomi'
    };
  }
}

module.exports = MiMoProvider;
