/**
 * Anthropic Provider - Claude 模型接入
 */

const BaseModel = require('../base-model');

class AnthropicProvider extends BaseModel {
  constructor(config = {}) {
    super('anthropic', config);
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || null;
    // 当前模型工具（Claude Code 等）通过 ANTHROPIC_AUTH_TOKEN 注入 Bearer 凭据
    this.authToken = config.authToken || process.env.ANTHROPIC_AUTH_TOKEN || null;
    this.model = config.model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
    this.baseUrl = config.baseUrl || process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
    this.maxTokens = config.maxTokens ?? 2000;
    this.temperature = config.temperature ?? 0.3;
  }

  async init() {
    if (!this.apiKey && !this.authToken) {
      throw new Error('Anthropic credentials are required. Set ANTHROPIC_AUTH_TOKEN/ANTHROPIC_API_KEY environment variables or provide apiKey/authToken in config.');
    }
    this.initialized = true;
  }

  validateConfig() {
    return !!(this.apiKey || this.authToken);
  }

  _authHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    };
    if (this.authToken) headers.Authorization = `Bearer ${this.authToken}`;
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    return headers;
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
      headers: this._authHeaders(),
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
    // 兼容 thinking/text 混合块（如 glm 经 anthropic 网关输出 reasoning 块）
    const blocks = Array.isArray(data.content) ? data.content : [];
    const text = blocks
      .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
      .join('');
    return text || (typeof data.completion === 'string' ? data.completion : '');
  }

  async complete(prompt, options = {}) {
    return this.chat([{ role: 'user', content: prompt }], options);
  }

  async isAvailable() {
    try {
      if (!this.apiKey && !this.authToken) return false;
      // Anthropic has no /models endpoint; make a lightweight messages call to verify
      const response = await this.fetchWithRetry(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: this._authHeaders(),
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
    return {
      ...super.getInfo(),
      model: this.model,
      baseUrl: this.baseUrl,
      envTakeover: this.envTakeover === true,
      takeoverLabel: this.envTakeover ? '当前模型工具(env接管·优先failover)' : null
    };
  }
}

module.exports = AnthropicProvider;
