/**
 * FlowMind Database Manager Adapter Interface
 * Abstract interface for database management services (DMS, etc.)
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class DatabaseManagerAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.DATABASE_MANAGER;
  }

  /**
   * List database instances.
   * @param {object} params - Optional filter params
   * @returns {Promise<object>}
   */
  async listInstances(params) {
    throw new Error('Subclasses must implement listInstances()');
  }

  /**
   * Execute a SQL script against a database.
   * @param {object} params - { database_id, script }
   * @returns {Promise<object>}
   */
  async executeScript(params) {
    throw new Error('Subclasses must implement executeScript()');
  }

  /**
   * Search for databases by name.
   * @param {string} searchKey
   * @returns {Promise<object>}
   */
  async searchDatabase(searchKey) {
    throw new Error('Subclasses must implement searchDatabase()');
  }

  /**
   * List tables in a database.
   * @param {string} databaseId
   * @returns {Promise<object>}
   */
  async listTables(databaseId) {
    throw new Error('Subclasses must implement listTables()');
  }

  /**
   * Get table detail information.
   * @param {string} tableGuid
   * @returns {Promise<object>}
   */
  async getTableDetail(tableGuid) {
    throw new Error('Subclasses must implement getTableDetail()');
  }
}

module.exports = DatabaseManagerAdapter;
