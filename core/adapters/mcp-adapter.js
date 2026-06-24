/**
 * FlowMind MCP Adapter
 * Base class for adapters that wrap MCP server tools
 */

const BaseAdapter = require('./base-adapter');

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
}

module.exports = McpAdapter;
