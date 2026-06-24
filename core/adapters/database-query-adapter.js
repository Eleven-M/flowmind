/**
 * FlowMind Database Query Adapter Interface
 * Abstract interface for direct database query services
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class DatabaseQueryAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.DATABASE_QUERY;
  }

  /**
   * Get available data sources.
   * @returns {Promise<object>}
   */
  async fetchSources() {
    throw new Error('Subclasses must implement fetchSources()');
  }

  /**
   * Get databases for a data source.
   * @param {string} sourceId
   * @returns {Promise<object>}
   */
  async fetchDatabases(sourceId) {
    throw new Error('Subclasses must implement fetchDatabases()');
  }

  /**
   * Get tables in a database.
   * @param {string} sourceId
   * @param {string} schema
   * @returns {Promise<object>}
   */
  async fetchTables(sourceId, schema) {
    throw new Error('Subclasses must implement fetchTables()');
  }

  /**
   * Execute a SELECT query.
   * @param {object} params - { source_id, schema, sql }
   * @returns {Promise<object>}
   */
  async queryExec(params) {
    throw new Error('Subclasses must implement queryExec()');
  }
}

module.exports = DatabaseQueryAdapter;
