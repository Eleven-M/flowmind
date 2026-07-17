/**
 * FlowMind Knowledge Base Adapter Interface
 * Abstract interface for knowledge base services (Yuque, Notion, Confluence, etc.)
 */

const McpAdapter = require('./mcp-adapter');
const { ComponentType } = require('../component-types');

class KnowledgeBaseAdapter extends McpAdapter {
  get componentType() {
    return ComponentType.KNOWLEDGE_BASE;
  }

  /**
   * Get user's repositories/knowledge bases.
   * @param {object} params
   * @returns {Promise<object>}
   */
  async getRepos(_params) {
    throw new Error('Subclasses must implement getRepos()');
  }

  /**
   * Get documents in a repository.
   * @param {string} namespace
   * @param {object} params
   * @returns {Promise<object>}
   */
  async getDocs(_namespace, _params) {
    throw new Error('Subclasses must implement getDocs()');
  }

  /**
   * Get a specific document.
   * @param {string} namespace
   * @param {string} slug
   * @returns {Promise<object>}
   */
  async getDoc(_namespace, _slug) {
    throw new Error('Subclasses must implement getDoc()');
  }

  /**
   * Create a new document.
   * @param {string} namespace
   * @param {object} docData - { slug, title, body, format }
   * @returns {Promise<object>}
   */
  async createDoc(_namespace, _docData) {
    throw new Error('Subclasses must implement createDoc()');
  }

  /**
   * Update an existing document.
   * @param {string} namespace
   * @param {string} slug
   * @param {object} docData
   * @returns {Promise<object>}
   */
  async updateDoc(_namespace, _slug, _docData) {
    throw new Error('Subclasses must implement updateDoc()');
  }

  /**
   * Search documents or repositories.
   * @param {string} query
   * @param {string} type - 'doc' or 'repo'
   * @returns {Promise<object>}
   */
  async search(_query, _type) {
    throw new Error('Subclasses must implement search()');
  }
}

module.exports = KnowledgeBaseAdapter;
