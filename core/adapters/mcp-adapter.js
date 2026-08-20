/**
 * FlowMind MCP Adapter
 * Base class for adapters that wrap MCP server tools
 */

const BaseAdapter = require('./base-adapter');
const { callMcpTool, createMcpBindingError } = require('../mcp-http-client');

class McpAdapter extends BaseAdapter {
  constructor(providerName, config = {}) {
    super(providerName, config);
    this.mcpTools = new Map();
  }

  /**
   * Register an MCP tool mapping.
   * @param {string} localName - The abstract tool name used by skills
   * @param {string} mcpToolName - The actual MCP tool name on the server
   */
  registerTool(localName, mcpToolName) {
    this.mcpTools.set(localName, mcpToolName);
  }

  /**
   * Get the actual MCP tool name for a local tool name.
   * @param {string} localName
   * @returns {string|null}
   */
  resolveTool(localName) {
    return this.mcpTools.get(localName) || null;
  }

  /**
   * Get all registered tool mappings.
   * @returns {object}
   */
  getToolMappings() {
    const mappings = {};
    for (const [local, mcp] of this.mcpTools) {
      mappings[local] = mcp;
    }
    return mappings;
  }

  /**
   * Get the list of abstract tool names this adapter provides.
   * @returns {string[]}
   */
  getProvidedTools() {
    return Array.from(this.mcpTools.keys());
  }

  /**
   * Get the MCP server name for tool invocation context.
   * Skills use this to know which MCP server to call.
   * @returns {string}
   */
  getMcpServerContext() {
    return {
      server: this.mcpServer,
      tools: this.getToolMappings()
    };
  }

  getTransportConfig() {
    return this.config.transport || this.config.mcpServerConfig || this.config.mcpTransport || {};
  }

  async callTool(tool, args = {}) {
    const transport = this.getTransportConfig();
    const serverName = this.mcpServer || this.providerName;
    if (!transport.url && !transport.endpoint && !transport.baseUrl) {
      throw createMcpBindingError({
        serverName,
        tool,
        args,
        reason: `MCP transport URL not configured for ${serverName}`,
        headers: transport.headers || {}
      });
    }
    return callMcpTool({
      url: transport.url || transport.endpoint || transport.baseUrl,
      headers: transport.headers || {},
      tool,
      args,
      timeoutMs: transport.timeoutMs || 60000,
      maxRetries: transport.maxRetries ?? 2,
      retryDelay: transport.retryDelay ?? 1000,
      serverName
    });
  }

  async callMcpTool(localName, args = {}) {
    const tool = this.resolveTool(localName);
    if (!tool) {
      throw new Error(`Unknown MCP tool mapping: ${localName}`);
    }
    return this.callTool(tool, args);
  }
}

module.exports = McpAdapter;
