/**
 * FlowMind API Doc Adapter Interface
 * Abstract interface for API documentation services (YApi, Swagger Hub, etc.)
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class ApiDocAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.API_DOC;
  }

  /**
   * Search APIs by keyword.
   * @param {object} params - { nameKeyword, pathKeyword, projectKeyword }
   * @returns {Promise<object>}
   */
  async searchApis(params) {
    throw new Error('Subclasses must implement searchApis()');
  }

  /**
   * Get categories for a project.
   * @param {string} projectId
   * @returns {Promise<object>}
   */
  async getCategories(projectId) {
    throw new Error('Subclasses must implement getCategories()');
  }

  /**
   * Save (create/update) an API interface.
   * @param {object} apiData
   * @returns {Promise<object>}
   */
  async saveApi(apiData) {
    throw new Error('Subclasses must implement saveApi()');
  }

  /**
   * Import Swagger/OpenAPI data.
   * @param {string} projectId
   * @param {string} catId
   * @param {string} swaggerData
   * @returns {Promise<object>}
   */
  async importSwagger(projectId, catId, swaggerData) {
    throw new Error('Subclasses must implement importSwagger()');
  }

  /**
   * Export project data.
   * @param {string} projectId
   * @param {string} type - 'json', 'markdown', 'swagger'
   * @returns {Promise<object>}
   */
  async exportProject(projectId, type) {
    throw new Error('Subclasses must implement exportProject()');
  }

  /**
   * List projects.
   * @returns {Promise<object>}
   */
  async listProjects() {
    throw new Error('Subclasses must implement listProjects()');
  }
}

module.exports = ApiDocAdapter;
