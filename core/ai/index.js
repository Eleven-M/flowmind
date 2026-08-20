/**
 * AI Module - AI 模型接入层入口
 */

const ModelManager = require('./model-manager');
const BaseModel = require('./base-model');
const OpenAIProvider = require('./providers/openai');
const AnthropicProvider = require('./providers/anthropic');
const OllamaProvider = require('./providers/ollama');
const GLMProvider = require('./providers/glm');
const MiMoProvider = require('./providers/mimo');
const QwenProvider = require('./providers/qwen');
const ERNIEProvider = require('./providers/ernie');
const DeepSeekProvider = require('./providers/deepseek');
const prompts = require('./prompts');

module.exports = {
  ModelManager,
  BaseModel,
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  GLMProvider,
  MiMoProvider,
  QwenProvider,
  ERNIEProvider,
  DeepSeekProvider,
  prompts
};
