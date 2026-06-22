/**
 * FlowMind Configuration Manager
 * Manages configuration loading and access
 */

const fs = require('fs-extra');
const path = require('path');

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath;
    this.config = {};
    this.defaults = this.getDefaults();
    this.initialized = false;
  }

  /**
   * Load configuration
   */
  async load() {
    // Try to load from specified path
    if (this.configPath) {
      await this.loadFromFile(this.configPath);
    }

    // Try to load from default locations
    const defaultPaths = [
      path.join(process.cwd(), 'flowmind.config.js'),
      path.join(process.cwd(), 'flowmind.config.json'),
      path.join(this.getHomeDir(), '.flowmind', 'config.json'),
      path.join(this.getHomeDir(), '.flowmindrc')
    ];

    for (const configPath of defaultPaths) {
      if (await fs.pathExists(configPath)) {
        await this.loadFromFile(configPath);
        break;
      }
    }

    // Load resource config
    await this.loadResourceConfig();

    // Load learning config
    await this.loadLearningConfig();

    this.initialized = true;
    return this.config;
  }

  /**
   * Load configuration from file
   */
  async loadFromFile(filePath) {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (ext === '.js') {
        const module = require(filePath);
        this.mergeConfig(module);
      } else if (ext === '.json') {
        const data = await fs.readJson(filePath);
        this.mergeConfig(data);
      }
    } catch (error) {
      console.warn(`Failed to load config from ${filePath}:`, error.message);
    }
  }

  /**
   * Load resource configuration
   */
  async loadResourceConfig() {
    const resourceConfigPath = path.join(this.getHomeDir(), '.flowmind', 'resource-config.json');

    if (await fs.pathExists(resourceConfigPath)) {
      try {
        const resourceConfig = await fs.readJson(resourceConfigPath);
        this.mergeConfig({ resources: resourceConfig.resources || {} });
      } catch (error) {
        console.warn('Failed to load resource config:', error.message);
      }
    }
  }

  /**
   * Load learning configuration
   */
  async loadLearningConfig() {
    const learningConfigPath = path.join(this.getHomeDir(), '.flowmind', 'learning-config.json');

    if (await fs.pathExists(learningConfigPath)) {
      try {
        const learningConfig = await fs.readJson(learningConfigPath);
        this.mergeConfig({ learning: learningConfig });
      } catch (error) {
        console.warn('Failed to load learning config:', error.message);
      }
    }
  }

  /**
   * Get default configuration
   */
  getDefaults() {
    return {
      // Core settings
      version: '1.0.0',
      name: 'FlowMind',

      // Paths
      skills: {
        path: path.join(__dirname, '..', 'skills')
      },

      // Learning settings
      learning: {
        enabled: true,
        autoApply: true,
        confidenceThreshold: 0.7,
        maxRecordsPerSkill: 100,
        storagePath: path.join(this.getHomeDir(), '.flowmind', 'learning')
      },

      // Scene mapping settings
      sceneMapping: {
        enabled: true,
        matchAlgorithm: 'weighted',
        weights: {
          keywordMatch: 0.4,
          patternMatch: 0.3,
          historyScore: 0.2,
          confidence: 0.1
        }
      },

      // Output settings
      output: {
        format: 'text',
        language: 'auto',
        verbose: false
      },

      // Resource settings
      resources: {
        database: { enabled: false },
        redis: { enabled: false },
        logs: { enabled: false },
        apiDocs: { enabled: false }
      }
    };
  }

  /**
   * Merge configuration
   */
  mergeConfig(newConfig) {
    this.config = this.deepMerge(this.config, newConfig);
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (this.isObject(source[key]) && this.isObject(target[key])) {
          result[key] = this.deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * Check if value is object
   */
  isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /**
   * Get configuration value
   */
  get(keyPath, defaultValue = undefined) {
    const keys = keyPath.split('.');
    let value = this.config;

    for (const key of keys) {
      if (value === undefined || value === null) {
        return defaultValue;
      }
      value = value[key];
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * Set configuration value
   */
  set(keyPath, value) {
    const keys = keyPath.split('.');
    let current = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || !this.isObject(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
    return true;
  }

  /**
   * Check if key exists
   */
  has(keyPath) {
    return this.get(keyPath) !== undefined;
  }

  /**
   * Get all configuration
   */
  getAll() {
    return { ...this.config };
  }

  /**
   * Save configuration
   */
  async save() {
    const configPath = path.join(this.getHomeDir(), '.flowmind', 'config.json');

    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, this.config, { spaces: 2 });

    return configPath;
  }

  /**
   * Get home directory
   */
  getHomeDir() {
    return process.env.HOME || process.env.USERPROFILE || os.homedir();
  }

  /**
   * Reload configuration
   */
  async reload() {
    this.config = {};
    this.initialized = false;
    return await this.load();
  }

  /**
   * Validate configuration
   */
  validate() {
    const errors = [];

    // Check required fields
    if (!this.config.version) {
      errors.push('Missing required field: version');
    }

    // Validate learning settings
    if (this.config.learning) {
      if (this.config.learning.confidenceThreshold < 0 || this.config.learning.confidenceThreshold > 1) {
        errors.push('Invalid confidenceThreshold: must be between 0 and 1');
      }
    }

    // Validate scene mapping weights
    if (this.config.sceneMapping?.weights) {
      const weights = this.config.sceneMapping.weights;
      const sum = Object.values(weights).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 1) > 0.01) {
        errors.push('Scene mapping weights must sum to 1');
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}

module.exports = ConfigManager;
