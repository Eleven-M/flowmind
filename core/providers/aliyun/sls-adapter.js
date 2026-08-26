/**
 * Aliyun SLS Log Service Adapter
 * Wraps the sls-logs MCP server for Alibaba Cloud SLS queries
 */

const LogServiceAdapter = require('../../adapters/log-service-adapter');

class AliyunSlsAdapter extends LogServiceAdapter {
  constructor(config = {}) {
    super('aliyun-sls', config);

    // Register MCP tool mappings
    this.registerTool('queryLogs', 'queryLogs');
    this.registerTool('listProjects', 'listProject');
    this.registerTool('listProject', 'listProject');
  }

  get mcpServer() {
    return 'sls-logs';
  }

  /**
   * Get SLS endpoints from config. Environment-to-region mapping is a
   * company deployment fact, so no endpoint is guessed when unconfigured.
   */
  getEndpoints() {
    if (this.config.config && this.config.config.endpoints) {
      return this.config.config.endpoints;
    }
    return {};
  }

  /**
   * Get the endpoint for a given environment.
   * @param {string} env - 'test', 'uat', 'gray', 'prod'
   * @returns {string}
   */
  getEndpoint(env) {
    const endpoints = this.getEndpoints();
    const normalizedEnv = normalizeEnvironment(env) || 'test';
    const envMap = { uat: 'test', gray: 'prod' };
    const mappedEnv = envMap[normalizedEnv] || normalizedEnv;
    return endpoints[normalizedEnv] || endpoints[mappedEnv] || endpoints.test;
  }

  getEnvironmentConfig(env) {
    const normalizedEnv = normalizeEnvironment(env);
    if (!normalizedEnv) {
      return null;
    }

    const config = this.config.config || {};
    const envConfig = config.envConfig || config.environmentConfig || {};
    return envConfig[normalizedEnv] || null;
  }

  async queryLogs(params) {
    return this.callMcpTool('queryLogs', params || {});
  }

  async listProjects() {
    return this.callMcpTool('listProjects', {});
  }

  /**
   * Build query parameters for SLS log query.
   * @param {object} params
   * @returns {object} MCP-compatible parameters
   */
  buildQueryParams(params) {
    const { project, logstore, query, from, to, line = 100, env, endpoint, resourceBinding } = params;
    const bindingConnection = resolveCompatibleBindingConnection(env, resourceBinding);
    const normalizedEnv = normalizeEnvironment(env || bindingConnection.env) || 'test';
    const envConfig = this.getEnvironmentConfig(normalizedEnv);
    const baseConfig = this.config.config || {};
    const resolvedEndpoint = endpoint || bindingConnection.endpoint || this.getEndpoint(normalizedEnv);
    const resolvedProject = project || bindingConnection.project || envConfig?.project || baseConfig.defaultProject;
    const resolvedLogstore = logstore || bindingConnection.logstore || envConfig?.logstore || baseConfig.defaultLogstore;
    const timeWindow = resolveQueryTimeWindow(from, to);

    return {
      endpoint: resolvedEndpoint,
      project: resolvedProject,
      logstore: resolvedLogstore,
      query: query || '',
      from: normalizeTimestamp(timeWindow.from),
      to: normalizeTimestamp(timeWindow.to),
      line,
      reverse: true
    };
  }
}

function resolveQueryTimeWindow(from, to) {
  if (from && to) {
    return { from, to };
  }

  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  return {
    from: from || hourAgo.toISOString(),
    to: to || now.toISOString()
  };
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeEpochLikeNumber(value);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric) && String(value).trim() !== '') {
    return normalizeEpochLikeNumber(numeric);
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) {
    return Math.trunc(parsed / 1000);
  }

  return undefined;
}

function normalizeEpochLikeNumber(value) {
  const integer = Math.trunc(value);
  if (!Number.isFinite(integer)) {
    return undefined;
  }

  if (Math.abs(integer) >= 1e11) {
    return Math.trunc(integer / 1000);
  }

  return integer;
}

function normalizeEnvironment(env) {
  const value = String(env || '').trim().toLowerCase();
  if (!value) return null;
  if (value === '测试') return 'test';
  if (value === '预发') return 'uat';
  if (value === '灰度') return 'gray';
  if (value === '生产' || value === '线上' || value === '正式') return 'prod';
  if (value === '压测') return 'pts';
  return value;
}

function resolveCompatibleBindingConnection(env, resourceBinding) {
  const bindingConnection = resourceBinding?.connection || {};
  if (!bindingConnection || Object.keys(bindingConnection).length === 0) {
    return {};
  }

  const requestedEnv = normalizeEnvironment(env);
  if (requestedEnv) {
    return {};
  }

  const bindingEnv = normalizeEnvironment(bindingConnection.env);
  if (requestedEnv && bindingEnv && requestedEnv !== bindingEnv) {
    return {};
  }

  return bindingConnection;
}

module.exports = AliyunSlsAdapter;
