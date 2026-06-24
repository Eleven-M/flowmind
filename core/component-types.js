/**
 * FlowMind Component Types
 * Defines all pluggable component type constants
 */

const ComponentType = Object.freeze({
  LOG_SERVICE: 'logService',
  DATABASE_MANAGER: 'databaseManager',
  DATABASE_QUERY: 'databaseQuery',
  REDIS_MONITOR: 'redisMonitor',
  API_DOC: 'apiDoc',
  KNOWLEDGE_BASE: 'knowledgeBase',
  WORKFLOW: 'workflow',
  REPORT: 'report'
});

/**
 * Component type metadata - describes each component type
 */
const ComponentTypeMeta = Object.freeze({
  [ComponentType.LOG_SERVICE]: {
    name: 'Log Service',
    description: 'Cloud log querying and analysis',
    requiredCapabilities: ['queryLogs', 'listProjects']
  },
  [ComponentType.DATABASE_MANAGER]: {
    name: 'Database Manager',
    description: 'Database instance management and DDL/DML execution',
    requiredCapabilities: ['listInstances', 'executeScript', 'searchDatabase']
  },
  [ComponentType.DATABASE_QUERY]: {
    name: 'Database Query',
    description: 'Direct database querying via SQL',
    requiredCapabilities: ['queryExec', 'fetchSource', 'fetchTables']
  },
  [ComponentType.REDIS_MONITOR]: {
    name: 'Redis Monitor',
    description: 'Redis monitoring and key inspection',
    requiredCapabilities: ['query', 'queryRange', 'getLabelValues']
  },
  [ComponentType.API_DOC]: {
    name: 'API Documentation',
    description: 'API documentation management and sync',
    requiredCapabilities: ['searchApis', 'saveApi', 'getCategories']
  },
  [ComponentType.KNOWLEDGE_BASE]: {
    name: 'Knowledge Base',
    description: 'Knowledge base and document management',
    requiredCapabilities: ['getRepos', 'getDocs', 'createDoc', 'updateDoc']
  },
  [ComponentType.WORKFLOW]: {
    name: 'Workflow',
    description: 'Automated workflow and pipeline management',
    requiredCapabilities: ['listPipelines', 'startPipelineRun']
  },
  [ComponentType.REPORT]: {
    name: 'Report',
    description: 'Automated test and coverage reporting',
    requiredCapabilities: ['listBuilds', 'getBuildInfo']
  }
});

module.exports = { ComponentType, ComponentTypeMeta };
