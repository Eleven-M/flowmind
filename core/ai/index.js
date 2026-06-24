/**
 * AI Module - AI 模型接入层入口
 */

const ModelManager = require('./model-manager');
const BaseModel = require('./base-model');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const prompts = require('./prompts');

module.exports = {
  ModelManager,
  BaseModel,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  prompts
};
