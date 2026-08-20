/**
 * FlowMind Base Adapter
 * Abstract base class for all component adapters
 */

class BaseAdapter {
  constructor(providerName, config = {}) {
    this.providerName = providerName;
    this.config = config;
    this.enabled = config.enabled !== false;
    this._initialized = false;
  }

  /**
   * Get the component type this adapter implements.
   * Subclasses must override this.
   * @returns {string} ComponentType value
   */
  get componentType() {
    throw new Error('Subclasses must implement componentType getter');
  }

  /**
   * Get the MCP server name associated with this adapter, if any.
   * @returns {string|null}
   */
  get mcpServer() {
    return this.config.mcpServer || null;
  }

  /**
   * Initialize the adapter. Called once before first use.
   * @returns {Promise<void>}
   */
  async init() {
    this._initialized = true;
  }

  /**
   * Check if the adapter is ready to serve requests.
   * @returns {boolean}
   */
  isReady() {
    return this.enabled && this._initialized;
  }

  /**
   * Get adapter status information.
   * @returns {object}
   */
  getStatus() {
    return {
      provider: this.providerName,
      type: this.componentType,
      enabled: this.enabled,
      initialized: this._initialized,
      mcpServer: this.mcpServer
    };
  }

  /**
   * Get the list of MCP tool names this adapter provides.
   * Subclasses should override to declare their tools.
   * @returns {string[]}
   */
  getProvidedTools() {
    return [];
  }

  /**
   * Check if a specific MCP tool is provided by this adapter.
   * @param {string} toolName
   * @returns {boolean}
   */
  hasTool(toolName) {
    return this.getProvidedTools().includes(toolName);
  }
}

module.exports = BaseAdapter;
