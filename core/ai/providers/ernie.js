/**
 * ERNIE Provider - 百度文心一言模型接入
 * 支持 ERNIE-4.0-Turbo-8K、ERNIE-3.5-8K 等模型
 */

const BaseModel = require('../base-model');

class ERNIEProvider extends BaseModel {
  constructor(config = {}) {
    super('ernie', config);
    this.apiKey = config.apiKey || process.env.BAIDU_API_KEY;
    this.secretKey = config.secretKey || process.env.BAIDU_SECRET_KEY;
    this.model = config.model || 'ernie-4.0-turbo-8k';
    this.baseUrl = config.baseUrl || 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop';
    this.temperature = config.temperature ?? 0.3;
    this.maxTokens = config.maxTokens ?? 2000;
    this.accessToken = null;
  }

  async init() {
    if (!this.apiKey || !this.secretKey) {
      throw new Error('Baidu API key and secret key are required. Set BAIDU_API_KEY and BAIDU_SECRET_KEY environment variables or provide in config.');
    }
    await this.refreshAccessToken();
    this.initialized = true;
  }

  async refreshAccessToken() {
    const response = await this.fetchWithRetry(
      `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.apiKey}&client_secret=${this.secretKey}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error('Failed to get Baidu access token');
    }

    const data = await response.json();
    this.accessToken = data.access_token;
  }

  validateConfig() {
    return !!this.apiKey && !!this.secretKey;
  }

  async chat(messages, options = {}) {
    if (!this.initialized) {
      await this.init();
    }

    const model = options.model || this.model;
    const endpoint = this.getEndpoint(model);

    const response = await this.fetchWithRetry(`${this.baseUrl}${endpoint}?access_token=${this.accessToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: messages,
        temperature: options.temperature ?? this.temperature,
        max_output_tokens: options.maxTokens ?? this.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ERNIE API error: ${response.status} - ${error}`);
    }

    const data = await response.json();
    return data.result;
  }

  getEndpoint(model) {
    const endpoints = {
      'ernie-4.0-turbo-8k': '/chat/ernie-4.0-turbo-8k',
      'ernie-4.0-8k': '/chat/ernie-4.0-8k',
      'ernie-3.5-8k': '/chat/ernie-3.5-8k',
      'ernie-3.5-4k-0205': '/chat/ernie-3.5-4k-0205',
      'ernie-speed-8k': '/chat/ernie-speed-8k',
      'ernie-lite-8k': '/chat/ernie-lite-8k'
    };
    return endpoints[model] || `/chat/${model}`;
  }

  async complete(prompt, options = {}) {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async isAvailable() {
    try {
      if (!this.apiKey || !this.secretKey) return false;
      await this.refreshAccessToken();
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
      provider: 'Baidu'
    };
  }
}

module.exports = ERNIEProvider;
