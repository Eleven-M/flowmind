/**
 * Yuque Knowledge Base Adapter
 * Wraps the aomi-yuque-mcp MCP server for Yuque platform management
 */

const KnowledgeBaseAdapter = require('../../adapters/knowledge-base-adapter');

class YuqueAdapter extends KnowledgeBaseAdapter {
  constructor(config = {}) {
    super('yuque', config);

    // Register MCP tool mappings
    this.registerTool('getRepos', 'get_user_repos');
    this.registerTool('getDocs', 'get_repo_docs');
    this.registerTool('getDoc', 'get_doc');
    this.registerTool('createDoc', 'create_doc');
    this.registerTool('updateDoc', 'update_doc');
    this.registerTool('search', 'search');
    this.registerTool('getCurrentUser', 'get_current_user');
    this.registerTool('getUserDocs', 'get_user_docs');
    this.registerTool('getGroupStatistics', 'get_group_statistics');
    this.registerTool('getGroupMemberStatistics', 'get_group_member_statistics');
  }

  get mcpServer() {
    return 'aomi-yuque-mcp';
  }

  async getRepos(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getRepos'),
      params
    };
  }

  async getDocs(namespace, params = {}) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getDocs'),
      params: { namespace, ...params }
    };
  }

  async getDoc(namespace, slug) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getDoc'),
      params: { namespace, slug }
    };
  }

  async createDoc(namespace, docData) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('createDoc'),
      params: { namespace, ...docData }
    };
  }

  async updateDoc(namespace, slug, docData) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('updateDoc'),
      params: { namespace, slug, ...docData }
    };
  }

  async search(query, type = 'doc') {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('search'),
      params: { q: query, type }
    };
  }

  /**
   * Get current authenticated user info.
   * @returns {Promise<object>}
   */
  async getCurrentUser() {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getCurrentUser'),
      params: {}
    };
  }
}

module.exports = YuqueAdapter;
