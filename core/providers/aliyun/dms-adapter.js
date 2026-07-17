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
    return this.callMcpTool('listInstances', params || {});
  }

  async executeScript(params) {
    return this.callMcpTool('executeScript', params);
  }

  async searchDatabase(searchKey) {
    return this.callMcpTool('searchDatabase', { search_key: searchKey });
  }

  async listTables(databaseId) {
    return this.callMcpTool('listTables', { database_id: databaseId });
  }

  async getTableDetail(tableGuid) {
    return this.callMcpTool('getTableDetailInfo', { table_guid: tableGuid });
  }

  /**
   * Generate SQL from natural language.
   * @param {string} databaseId
   * @param {string} question
   * @returns {Promise<object>}
   */
  async generateSql(databaseId, question) {
    return this.callMcpTool('generateSql', { database_id: databaseId, question });
  }

  /**
   * Optimize a SQL statement.
   * @param {string} databaseId
   * @param {string} sql
   * @returns {Promise<object>}
   */
  async optimizeSql(databaseId, sql) {
    return this.callMcpTool('optimizeSql', { database_id: databaseId, sql });
  }
}

module.exports = AliyunDmsAdapter;
