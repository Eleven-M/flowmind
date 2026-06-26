/**
 * Anthropic Provider - Claude 模型接入
 */

const BaseModel = require('../base-model');

class AnthropicProvider extends BaseModel {
  constructor(config = {}) {
    super('anthropic', config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.baseUrl = config.baseUrl || 'https://api.anthropic.com';
    this.maxTokens = config.maxTokens ?? 2000;
    this.temperature = config.temperature ?? 0.3;
  }

  async init() {
    if (!this.apiKey) {
      throw new Error('Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or provide in config.');
    }
    this.initialized = true;
  }

  validateConfig() {
    return !!this.apiKey;
  }

  async chat(messages, options = {}) {
    if (!this.initialized) await this.init();

    let systemPrompt = '';
    const userMessages = [];
    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt = msg.content;
      } else {
        userMessages.push(msg);
      }
    }

    const response = await this.fetchWithRetry(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: options.model || this.model,
        max_tokens: options.maxTokens ?? this.maxTokens,
        system: systemPrompt || undefined,
        messages: userMessages,
        temperature: options.temperature ?? this.temperature
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  async complete(prompt, options = {}) {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async isAvailable() {
    try {
      if (!this.apiKey) return false;
      // Anthropic has no /models endpoint; make a lightweight messages call to verify
      const response = await this.fetchWithRetry(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }]
        }),
        retries: 1,
        timeout: 10000
      });
      return response.ok || response.status === 400; // 400 = bad request but API is reachable
    } catch {
      return false;
    }
  }

  getInfo() {
    return { ...super.getInfo(), model: this.model, baseUrl: this.baseUrl };
  }
}

module.exports = AnthropicProvider;
