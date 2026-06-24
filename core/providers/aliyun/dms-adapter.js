/**
 * Aliyun DMS Database Manager Adapter
 * Wraps the aliyun-dms-mcp-server MCP server for database management
 */

const DatabaseManagerAdapter = require('../../adapters/database-manager-adapter');

class AliyunDmsAdapter extends DatabaseManagerAdapter {
  constructor(config = {}) {
    super('aliyun-dms', config);

    // Register MCP tool mappings
    this.registerTool('listInstances', 'listInstances');
    this.registerTool('searchDatabase', 'searchDatabase');
    this.registerTool('getDatabase', 'getDatabase');
    this.registerTool('listTables', 'listTables');
    this.registerTool('getTableDetailInfo', 'getTableDetailInfo');
    this.registerTool('executeScript', 'executeScript');
    this.registerTool('createDataChangeOrder', 'createDataChangeOrder');
    this.registerTool('generateSql', 'generateSql');
    this.registerTool('optimizeSql', 'optimizeSql');
    this.registerTool('fixSql', 'fixSql');
  }

  get mcpServer() {
    return 'aliyun-dms-mcp-server';
  }

  async listInstances(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listInstances'),
      params: params || {}
    };
  }

  async executeScript(params) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('executeScript'),
      params
    };
  }

  async searchDatabase(searchKey) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('searchDatabase'),
      params: { search_key: searchKey }
    };
  }

  async listTables(databaseId) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('listTables'),
      params: { database_id: databaseId }
    };
  }

  async getTableDetail(tableGuid) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('getTableDetailInfo'),
      params: { table_guid: tableGuid }
    };
  }

  /**
   * Generate SQL from natural language.
   * @param {string} databaseId
   * @param {string} question
   * @returns {Promise<object>}
   */
  async generateSql(databaseId, question) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('generateSql'),
      params: { database_id: databaseId, question }
    };
  }

  /**
   * Optimize a SQL statement.
   * @param {string} databaseId
   * @param {string} sql
   * @returns {Promise<object>}
   */
  async optimizeSql(databaseId, sql) {
    return {
      mcpServer: this.mcpServer,
      tool: this.resolveTool('optimizeSql'),
      params: { database_id: databaseId, sql }
    };
  }
}

module.exports = AliyunDmsAdapter;
