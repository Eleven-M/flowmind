/**
 * FlowMind Component Registry
 * Central registry for pluggable component adapters.
 * Manages component discovery, registration, and provider switching.
 */

const { ComponentType, ComponentTypeMeta } = require('./component-types');
const McpCompatibility = require('./mcp-compatibility');

class ComponentRegistry {
  constructor(config) {
    this.config = config;
    // Map<ComponentType, Map<providerName, adapter>>
    this.adapters = new Map();
    // Map<ComponentType, providerName> - which provider is active for each type
    this.activeProviders = new Map();
    // Built-in provider factories
    this.providerFactories = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the registry: register built-in providers and load config.
   */
  async init() {
    this.registerBuiltinProviders();
    await this.loadFromConfig();
    this.initialized = true;
  }

  /**
   * Register built-in provider factories.
   */
  registerBuiltinProviders() {
    // Aliyun providers
    this.registerFactory('aliyun-sls', () => {
      const AliyunSlsAdapter = require('./providers/aliyun/sls-adapter');
      return new AliyunSlsAdapter(this.getProviderConfig('logService', 'aliyun-sls'));
    });
    this.registerFactory('aliyun-dms', () => {
      const AliyunDmsAdapter = require('./providers/aliyun/dms-adapter');
      return new AliyunDmsAdapter(this.getProviderConfig('databaseManager', 'aliyun-dms'));
    });
    this.registerFactory('aliyun-redis', () => {
      const AliyunRedisAdapter = require('./providers/aliyun/redis-adapter');
      return new AliyunRedisAdapter(this.getProviderConfig('redisMonitor', 'aliyun-redis'));
    });

    // YApi provider
    this.registerFactory('yapi', () => {
      const YapiAdapter = require('./providers/yapi/yapi-adapter');
      return new YapiAdapter(this.getProviderConfig('apiDoc', 'yapi'));
    });

    // Yuque provider
    this.registerFactory('yuque', () => {
      const YuqueAdapter = require('./providers/yuque/yuque-adapter');
      return new YuqueAdapter(this.getProviderConfig('knowledgeBase', 'yuque'));
    });

    // Friday providers
    this.registerFactory('friday-flow', () => {
      const FridayFlowAdapter = require('./providers/friday/flow-adapter');
      return new FridayFlowAdapter(this.getProviderConfig('workflow', 'friday-flow'));
    });
    this.registerFactory('friday-report', () => {
      const FridayReportAdapter = require('./providers/friday/report-adapter');
      return new FridayReportAdapter(this.getProviderConfig('report', 'friday-report'));
    });
  }

  /**
   * Get provider config from the component config.
   * @param {string} componentType
   * @param {string} providerName
   * @returns {object}
   */
  getProviderConfig(componentType, providerName) {
    const components = this.config.get('components', {});
    const typeConfig = components[componentType] || {};
    const providers = typeConfig.providers || {};
    return providers[providerName] || {};
  }

  /**
   * Register a provider factory function.
   * @param {string} providerName
   * @param {function} factory - Function that returns an adapter instance
   */
  registerFactory(providerName, factory) {
    this.providerFactories.set(providerName, factory);
  }

  /**
   * Load and activate providers based on configuration.
   */
  async loadFromConfig() {
    const components = this.config.get('components', {});

    for (const type of Object.values(ComponentType)) {
      const typeConfig = components[type];
      if (!typeConfig) continue;

      const defaultProvider = typeConfig.default;
      const providers = typeConfig.providers || {};

      for (const [providerName, providerConfig] of Object.entries(providers)) {
        if (providerConfig.enabled === false) continue;

        const adapter = this.createAdapter(providerName, providerConfig);
        if (adapter) {
          this.register(type, providerName, adapter);
        }
      }

      // Set default provider
      if (defaultProvider && this.adapters.get(type)?.has(defaultProvider)) {
        this.activeProviders.set(type, defaultProvider);
      }
    }
  }

  /**
   * Create an adapter instance from a provider name.
   * @param {string} providerName
   * @param {object} providerConfig
   * @returns {BaseAdapter|null}
   */
  createAdapter(providerName, providerConfig) {
    const factory = this.providerFactories.get(providerName);
    if (!factory) {
      console.warn(`No factory registered for provider: ${providerName}`);
      return null;
    }
    try {
      return factory();
    } catch (error) {
      console.warn(`Failed to create adapter for ${providerName}:`, error.message);
      return null;
    }
  }

  /**
   * Register an adapter for a component type.
   * @param {string} componentType - ComponentType value
   * @param {string} providerName
   * @param {BaseAdapter} adapter
   */
  register(componentType, providerName, adapter) {
    if (!this.adapters.has(componentType)) {
      this.adapters.set(componentType, new Map());
    }
    this.adapters.get(componentType).set(providerName, adapter);

    // If this is the first provider for this type, make it active
    if (!this.activeProviders.has(componentType)) {
      this.activeProviders.set(componentType, providerName);
    }
  }

  /**
   * Get the active adapter for a component type.
   * @param {string} componentType
   * @returns {BaseAdapter|null}
   */
  getAdapter(componentType) {
    const providerName = this.activeProviders.get(componentType);
    if (!providerName) return null;
    const typeAdapters = this.adapters.get(componentType);
    return typeAdapters ? typeAdapters.get(providerName) || null : null;
  }

  /**
   * Get a specific adapter by type and provider name.
   * @param {string} componentType
   * @param {string} providerName
   * @returns {BaseAdapter|null}
   */
  getAdapterByProvider(componentType, providerName) {
    const typeAdapters = this.adapters.get(componentType);
    return typeAdapters ? typeAdapters.get(providerName) || null : null;
  }

  /**
   * Set the active provider for a component type.
   * @param {string} componentType
   * @param {string} providerName
   */
  setActiveProvider(componentType, providerName) {
    const typeAdapters = this.adapters.get(componentType);
    if (!typeAdapters || !typeAdapters.has(providerName)) {
      throw new Error(`Provider ${providerName} not registered for ${componentType}`);
    }
    this.activeProviders.set(componentType, providerName);
  }

  /**
   * Get the MCP server name for a component type.
   * @param {string} componentType
   * @returns {string|null}
   */
  getMcpServer(componentType) {
    const adapter = this.getAdapter(componentType);
    return adapter ? adapter.mcpServer : null;
  }

  /**
   * Get the MCP server name by looking up from MCP compatibility layer.
   * Used for backward compatibility with existing MCP server names.
   * @param {string} mcpServerName
   * @returns {object|null} - { type, provider, adapter }
   */
  resolveMcpServer(mcpServerName) {
    return McpCompatibility.resolve(mcpServerName);
  }

  /**
   * Get all registered providers for a component type.
   * @param {string} componentType
   * @returns {object[]}
   */
  getProviders(componentType) {
    const typeAdapters = this.adapters.get(componentType);
    if (!typeAdapters) return [];
    const result = [];
    for (const [name, adapter] of typeAdapters) {
      result.push({
        name,
        active: this.activeProviders.get(componentType) === name,
        ...adapter.getStatus()
      });
    }
    return result;
  }

  /**
   * Get the active provider name for a component type.
   * @param {string} componentType
   * @returns {string|null}
   */
  getActiveProvider(componentType) {
    return this.activeProviders.get(componentType) || null;
  }

  /**
   * Get a summary of all component types and their status.
   * @returns {object}
   */
  getStatus() {
    const status = {};
    for (const type of Object.values(ComponentType)) {
      const adapter = this.getAdapter(type);
      status[type] = {
        active: this.activeProviders.get(type) || null,
        providers: this.getProviders(type).map(p => ({
          name: p.name,
          enabled: p.enabled,
          mcpServer: p.mcpServer
        }))
      };
    }
    return status;
  }

  /**
   * Initialize all registered adapters.
   */
  async initAll() {
    for (const [type, typeAdapters] of this.adapters) {
      for (const [name, adapter] of typeAdapters) {
        try {
          await adapter.init();
        } catch (error) {
          console.warn(`Failed to init adapter ${name} for ${type}:`, error.message);
        }
      }
    }
  }
}

module.exports = ComponentRegistry;
