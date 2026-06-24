/**
 * Base Model - AI 模型抽象基类
 * 所有模型 Provider 必须继承此类并实现抽象方法
 */

class BaseModel {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.initialized = false;
  }

  /**
   * 初始化模型
   * @returns {Promise<void>}
   */
  async init() {
    throw new Error('init() must be implemented by subclass');
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息数组 [{role, content}]
   * @param {Object} options - 请求选项
   * @returns {Promise<string>} 模型响应
   */
  async chat(messages, options = {}) {
    throw new Error('chat() must be implemented by subclass');
  }

  /**
   * 发送补全请求
   * @param {string} prompt - 提示词
   * @param {Object} options - 请求选项
   * @returns {Promise<string>} 模型响应
   */
  async complete(prompt, options = {}) {
    throw new Error('complete() must be implemented by subclass');
  }

  /**
   * 检查模型是否可用
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error('isAvailable() must be implemented by subclass');
  }

  /**
   * 获取模型信息
   * @returns {Object}
   */
  getInfo() {
    return {
      name: this.name,
      provider: this.constructor.name,
      initialized: this.initialized
    };
  }

  /**
   * 验证配置
   * @returns {boolean}
   */
  validateConfig() {
    return true;
  }
}

module.exports = BaseModel;
