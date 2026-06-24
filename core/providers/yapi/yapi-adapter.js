/**
 * YApi API Documentation Adapter
 * Wraps the aomi-yapi-mcp MCP server for YApi platform management
 */

const ApiDocAdapter = require('../../adapters/api-doc-adapter');

class YapiAdapter extends ApiDocAdapter {
  constructor(config = {}) {
    super('yapi', config);

    // Register MCP tool mappings
    this.registerTool('searchApis', 'yapi_search_apis');
    this.registerTool('getCategories', 'yapi_get_categories');
    this.registerTool('saveApi', 'yapi_save_api');
    this.registerTool('getApiDesc', 'yapi_get_api_desc');
    this.registerTool('importSwagger', 'yapi_import_swagger');
    this.registerTool('exportProject', 'yapi_export_project');
    this.registerTool('listProjects', 'yapi_list_projects');
    this.registerTool('createCategory', 'yapi_create_category');
    this.registerTool('deleteInterface', 'yapi_delete_interface');
    this.registerTool('copyInterface', 'yapi_copy_interface');
    this.registerTool('refreshCache', 'yapi_refresh_cache');
  }

  get mcpServer() {
    return 'aomi-yapi-mcp';
  }

  async searchApis(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('searchApis'),
      params
    };
  }

  async getCategories(projectId) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getCategories'),
      params: { projectId }
    };
  }

  async saveApi(apiData) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('saveApi'),
      params: apiData
    };
  }

  async importSwagger(projectId, catId, swaggerData) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('importSwagger'),
      params: { projectId, catId, swaggerData }
    };
  }

  async exportProject(projectId, type = 'swagger') {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('exportProject'),
      params: { projectId, type }
    };
  }

  async listProjects() {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listProjects'),
      params: {}
    };
  }
}

module.exports = YapiAdapter;
