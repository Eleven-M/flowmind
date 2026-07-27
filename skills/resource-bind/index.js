/**
 * Resource Bind Skill
 * Manage database, Redis, API, and other external resource connections
 */

const { inferSourceContext } = require('../../core/source-inference');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

const PROVIDER_MAP = {
  'friday-rds-redis-query': {
    componentType: 'databaseQuery',
    provider: 'aliyun-rds-query',
    mcpServer: 'friday-rds-redis-query'
  },
  'aliyun-rds-query': {
    componentType: 'databaseQuery',
    provider: 'aliyun-rds-query',
    mcpServer: 'friday-rds-redis-query'
  },
  'yapi-mcp': { componentType: 'apiDoc', provider: 'yapi', mcpServer: 'yapi-mcp' },
  yapi: { componentType: 'apiDoc', provider: 'yapi', mcpServer: 'yapi-mcp' },
  'yuque-mcp': { componentType: 'knowledgeBase', provider: 'yuque', mcpServer: 'yuque-mcp' },
  yuque: { componentType: 'knowledgeBase', provider: 'yuque', mcpServer: 'yuque-mcp' },
  'aliyun-dms-mcp-server': {
    componentType: 'databaseManager',
    provider: 'aliyun-dms',
    mcpServer: 'aliyun-dms-mcp-server'
  },
  'aliyun-dms': { componentType: 'databaseManager', provider: 'aliyun-dms', mcpServer: 'aliyun-dms-mcp-server' },
  'aliyun-redis': { componentType: 'redisMonitor', provider: 'aliyun-redis', mcpServer: 'aliyun-redis' },
  redis: { componentType: 'redisMonitor', provider: 'aliyun-redis', mcpServer: 'aliyun-redis' },
  'friday-auto-flow': { componentType: 'workflow', provider: 'friday-flow', mcpServer: 'friday-auto-flow' },
  'friday-flow': { componentType: 'workflow', provider: 'friday-flow', mcpServer: 'friday-auto-flow' },
  'aliyun-sls': { componentType: 'logService', provider: 'aliyun-sls', mcpServer: 'aliyun-sls' },
  sls: { componentType: 'logService', provider: 'aliyun-sls', mcpServer: 'aliyun-sls' },
  'aliyun-mse-mcp': { componentType: 'serviceGovernance', provider: 'aliyun-mse', mcpServer: 'aliyun-mse-mcp' },
  'aliyun-mse': { componentType: 'serviceGovernance', provider: 'aliyun-mse', mcpServer: 'aliyun-mse-mcp' },
  'huawei-cse-mcp': { componentType: 'serviceGovernance', provider: 'huawei-cse', mcpServer: 'huawei-cse-mcp' },
  'huawei-cse': { componentType: 'serviceGovernance', provider: 'huawei-cse', mcpServer: 'huawei-cse-mcp' },
  'baidu-mse-mcp': { componentType: 'serviceGovernance', provider: 'baidu-mse', mcpServer: 'baidu-mse-mcp' },
  'baidu-mse': { componentType: 'serviceGovernance', provider: 'baidu-mse', mcpServer: 'baidu-mse-mcp' }
};

module.exports = {
  canHandle(input) {
    if (!input) return false;
    return /资源绑定|resource.*bind|数据库.*连接|redis.*连接|连接.*管理|connection.*manage|绑定.*(mcp|token|地址|endpoint|url|host)|使用.*已绑定/i.test(
      input
    );
  },

  async execute(input, context) {
    const registry = context.componentRegistry;
    const params = parseResourceParams(input);
    const sourceInference = context.sourceInference || (await safeInferSourceContext(input));

    if (params.action === 'bind') {
      return bindResource(input, context, params, sourceInference);
    }

    if (params.action === 'list') {
      const components = registry?.getAll ? registry.getAll() : [];
      const bindings = (await context.flowmind?.learning?.listResourceBindings?.()) || [];
      return createSkillResult(
        'resource-bind',
        `Found ${components.length} configured component(s) and ${bindings.length} learned binding(s)`,
        {
          input,
          data: {
            components: components.map((c) => ({
              name: c.name,
              type: c.type,
              provider: c.provider,
              active: c.active,
              initialized: c.initialized,
              mcpServer: c.mcpServer
            })),
            bindings,
            inferredSource: summarizeSourceInference(sourceInference)
          }
        }
      );
    }

    if (params.action === 'status' || params.action === 'use' || params.action === 'show') {
      const status = registry?.getStatus ? registry.getStatus() : {};
      const matchedBinding =
        context.resourceBinding ||
        (await context.flowmind?.learning?.matchResourceBinding?.(input, 'resource-bind')) ||
        null;

      return createSkillResult(
        'resource-bind',
        matchedBinding
          ? `Using learned binding for business: ${matchedBinding.business}`
          : 'Resource connection status',
        {
          input,
          data: {
            status,
            matchedBinding,
            inferredSource: summarizeSourceInference(sourceInference)
          }
        }
      );
    }

    return createSkillResult('resource-bind', 'Resource binding. Available actions: bind, list, status, use', {
      input,
      data: {
        actions: [
          'bind - Save MCP/address/token for a business',
          'list - List configured resources and learned bindings',
          'status - Show connection status and matched binding',
          'use - Resolve a learned binding for the current business'
        ],
        supportedTypes: ['MySQL', 'PostgreSQL', 'Redis', 'REST API', 'YApi', 'Yuque', 'Workflow', 'Service Governance'],
        inferredSource: summarizeSourceInference(sourceInference)
      }
    });
  }
};

async function bindResource(input, context, params, sourceInference) {
  const learning = context.flowmind?.learning;
  if (!learning?.saveResourceBinding) {
    return createSkillError('resource-bind', 'Learning engine is not available for resource binding', {
      input,
      kind: 'missing-component',
      retryable: false
    });
  }

  const binding = buildBinding(input, params, context, sourceInference);
  const saved = await learning.saveResourceBinding(binding, {
    currentSkill: 'resource-bind'
  });
  const storagePath = learning.expandPath(learning.learningPath);

  return createSkillResult('resource-bind', `Saved learned binding for business: ${saved.business}`, {
    input,
    data: {
      binding: saved,
      storage: `${storagePath}/resource-bindings.json`
    }
  });
}

function buildBinding(input, params, context, sourceInference) {
  const inferred = resolveProviderInfo(params);
  const inferredDatabase = sourceInference?.database || null;
  const inferredRedis = sourceInference?.redis || null;
  const business = inferBusiness(input, params, inferred, sourceInference);
  const aliases = [
    business,
    params.project,
    sourceInference?.project,
    params.namespace,
    params.alias,
    params.env,
    sourceInference?.environment
  ].filter(Boolean);
  const keywords = extractKeywords(input, aliases);

  return {
    business,
    aliases,
    componentType:
      params.componentType ||
      inferred.componentType ||
      context.flowmind?.learning?.inferComponentType?.(input, 'resource-bind') ||
      null,
    provider: params.provider || inferred.provider || null,
    mcpServer: params.mcpServer || inferred.mcpServer || null,
    connection: {
      address: params.address || params.url || params.endpoint || null,
      host: params.host || inferredDatabase?.host || inferredRedis?.host || null,
      port: params.port || inferredDatabase?.port || inferredRedis?.port || null,
      token: params.token || null,
      apiKey: params.apiKey || null,
      namespace: params.namespace || null,
      project: params.project || sourceInference?.project || null,
      database: params.database || inferredDatabase?.database || null,
      sourceId: params.sourceId || inferredDatabase?.sourceId || inferredRedis?.sourceId || null,
      databaseId: params.databaseId || inferredDatabase?.databaseId || null,
      env: params.env || sourceInference?.environment || null
    },
    metadata: {
      input,
      sourceInference: summarizeSourceInference(sourceInference)
    },
    keywords
  };
}

function parseResourceParams(input) {
  const params = {};
  if (/列表|list|查看全部|show all/i.test(input)) params.action = 'list';
  if (/状态|status|连接/i.test(input)) params.action = 'status';
  if (/绑定|bind|添加|add|记住|保存/i.test(input)) params.action = 'bind';
  if (/使用|use|套用|复用/i.test(input)) params.action = 'use';
  if (/查看绑定|show binding|显示绑定/i.test(input)) params.action = 'show';

  const keyMap = {
    business: ['业务', 'business', 'biz', 'service'],
    alias: ['别名', 'alias'],
    mcpServer: ['mcp', 'mcpServer', 'mcp_server'],
    provider: ['provider', '服务商'],
    componentType: ['component', 'componentType', '组件'],
    address: ['地址', 'address'],
    url: ['url', 'baseUrl', 'baseURL'],
    endpoint: ['endpoint'],
    host: ['host'],
    port: ['port'],
    token: ['token'],
    apiKey: ['apiKey', 'apikey', 'key'],
    namespace: ['namespace', 'repo', '仓库'],
    project: ['project', '项目'],
    database: ['database', 'schema', 'db', '库'],
    sourceId: ['sourceId', 'source_id'],
    databaseId: ['databaseId', 'database_id'],
    env: ['env', '环境']
  };

  for (const [targetKey, aliases] of Object.entries(keyMap)) {
    const value = findKeyValue(input, aliases);
    if (value) params[targetKey] = value;
  }

  const bizSuffixMatch = input.match(/(?:绑定|bind)?\s*([\u4e00-\u9fa5A-Za-z0-9._-]+)\s*业务/i);
  if (!params.business && bizSuffixMatch) {
    params.business = bizSuffixMatch[1];
  }

  if (!params.business) {
    const bizKeywordMatch = input.match(
      /(?:绑定|bind)\s*([\u4e00-\u9fa5A-Za-z0-9._-]+?)\s*(平台|服务|环境|工程|项目)/i
    );
    if (bizKeywordMatch) {
      params.business = `${bizKeywordMatch[1]}${bizKeywordMatch[2]}`;
    }
  }

  const urlMatch = input.match(/https?:\/\/[^\s,，]+/i);
  if (!params.address && !params.url && urlMatch) {
    params.address = urlMatch[0];
  }

  return params;
}

function findKeyValue(input, aliases) {
  for (const alias of aliases) {
    const regex = new RegExp(`${escapeRegex(alias)}\\s*[:=：]\\s*([^\\s,，]+)`, 'i');
    const match = input.match(regex);
    if (match) return match[1].trim();
  }
  return null;
}

function resolveProviderInfo(params) {
  const candidates = [params.provider, params.mcpServer, params.componentType]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  for (const candidate of candidates) {
    if (PROVIDER_MAP[candidate]) return PROVIDER_MAP[candidate];
  }

  return {};
}

function inferBusiness(input, params, inferred = {}, sourceInference = null) {
  const explicit = params.business || params.project || sourceInference?.project || params.namespace;
  if (explicit) return explicit;

  const keywordMatch = String(input || '').match(
    /(?:绑定|bind)\s*([\u4e00-\u9fa5A-Za-z0-9._-]+?)\s*(平台|服务|环境|工程|项目)/i
  );
  if (keywordMatch) {
    return `${keywordMatch[1]}${keywordMatch[2]}`;
  }

  if (inferred.componentType === 'workflow') {
    return params.env ? `发布平台-${params.env}` : '发布平台';
  }

  if (inferred.provider) {
    return params.env ? `${inferred.provider}-${params.env}` : inferred.provider;
  }

  return params.env ? `default-${params.env}` : 'default';
}

function extractKeywords(input, aliases = []) {
  const words = input.match(/[\u4e00-\u9fa5A-Za-z0-9._-]+/g) || [];
  return [...new Set([...aliases.filter(Boolean), ...words])].slice(0, 16);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function safeInferSourceContext(input) {
  try {
    return await inferSourceContext(input);
  } catch (error) {
    return null;
  }
}

function summarizeSourceInference(sourceInference) {
  if (!sourceInference?.matched) {
    return sourceInference?.environment ? { matched: false, environment: sourceInference.environment } : null;
  }

  return {
    matched: true,
    project: sourceInference.project,
    environment: sourceInference.environment,
    database: sourceInference.database?.database || null,
    redisDatabase: sourceInference.redis?.database ?? null,
    matchedEntries: sourceInference.matchedEntries?.map((entry) => entry.title) || []
  };
}
