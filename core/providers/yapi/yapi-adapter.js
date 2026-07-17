/**
 * YApi API Documentation Adapter
 * Wraps the yapi-mcp MCP server for YApi platform management
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
    return 'yapi-mcp';
  }

  async searchApis(params) {
    return this.callMcpTool('searchApis', params);
  }

  async getCategories(projectId) {
    return this.callMcpTool('getCategories', { projectId });
  }

  async saveApi(apiData) {
    return this.callMcpTool('saveApi', apiData);
  }

  async importSwagger(projectId, catId, swaggerData) {
    return this.callMcpTool('importSwagger', { projectId, catId, swaggerData });
  }

  async exportProject(projectId, type = 'swagger') {
    return this.callMcpTool('exportProject', { projectId, type });
  }

  async listProjects() {
    return this.callMcpTool('listProjects', {});
  }
}

module.exports = YapiAdapter;
