/**
 * Data Logic Validation Skill
 * Verify SQL queries, Redis operations, and data processing logic against real data via MCP
 */

const { inferSourceContext } = require('../../core/source-inference');
const { createSkillError, createSkillResult } = require('../../core/result-contract');
const { wrapSkillCall } = require('../../core/skill-error-wrapper');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /数据逻辑|data.*logic.*valid|sql.*验证|redis.*验证|数据.*校验.*逻辑|查询.*表.*数据|查.*表.*数据|数据库.*表/i.test(input);
  },

  async execute(input, context = {}) {
    const registry = context.componentRegistry;
    const skillSettings = getSkillSettings(context);
    const params = parseValidationParams(input);
    const learnedBinding = context.resourceBinding;
    const sourceInference = context.sourceInference || await safeInferSourceContext(input);

    // Check MCP component availability
    const dbManager = registry?.getAdapter('databaseManager');
    const dbQuery = registry?.getAdapter('databaseQuery');
    const redisMonitor = registry?.getAdapter('redisMonitor');

    const availableComponents = {
      databaseManager: !!dbManager,
      databaseQuery: !!dbQuery,
      redisMonitor: !!redisMonitor
    };

    if (params.action === 'sql') {
      if (!dbQuery) {
        return createSkillError('data-logic-validation', 'Database query service not configured (need db-redis-query MCP)', {
          input,
          kind: 'missing-component',
          retryable: true,
          data: { availableComponents, hint: 'Configure database query MCP server first' },
          retryHints: [
            'Configure the databaseQuery component before validating SQL.',
            'Bind a database resource so the target project/environment can be inferred automatically.'
          ]
        });
      }

      const target = resolveDatabaseTarget(params, learnedBinding, sourceInference);
      const sql = params.query || 'SELECT 1';
      return wrapSkillCall('data-logic-validation', input, async () => {
        const execution = await dbQuery.queryExec(buildSqlExecutionParams(target, sql, skillSettings));

        return createSkillResult('data-logic-validation', `SQL validation executed for: ${target.project || target.database || 'resolved target'}`, {
          input,
          data: {
            action: 'validate_sql',
            query: sql,
            target,
            execution,
            availableComponents,
            binding: learnedBinding,
            inferredSource: summarizeSourceInference(sourceInference),
            skillConfig: skillSettings
          }
        });
      }, { action: 'SQL validation' });
    }

    if (params.action === 'redis') {
      if (!dbQuery) {
        return createSkillError('data-logic-validation', 'Redis direct query service not configured (need db-redis-query MCP)', {
          input,
          kind: 'missing-component',
          retryable: true,
          data: { availableComponents, hint: 'Configure database query MCP server first' },
          retryHints: [
            'Configure the databaseQuery component before validating Redis operations.',
            'Bind a Redis-capable data resource so the target project/environment can be inferred automatically.'
          ]
        });
      }

      const target = resolveRedisTarget(params, learnedBinding, sourceInference);
      return wrapSkillCall('data-logic-validation', input, async () => {
        const execution = await executeRedisAction(dbQuery, params, target, skillSettings);

        return createSkillResult('data-logic-validation', `Redis validation executed for: ${target.project || target.host || 'resolved target'}`, {
          input,
          data: {
            action: 'validate_redis',
            key: params.key,
            target,
            execution,
            availableComponents,
            binding: learnedBinding,
            inferredSource: summarizeSourceInference(sourceInference),
            monitorProvider: redisMonitor?.providerName || null,
            skillConfig: skillSettings
          }
        });
      }, { action: 'Redis validation' });
    }

    return createSkillError('data-logic-validation', 'Data logic validation requires an explicit sql or redis target.', {
      input,
      kind: 'invalid-input',
      retryable: true,
      data: {
          actions: ['sql - Validate SQL queries', 'redis - Validate Redis operations'],
          availableComponents,
          requiredMCP: ['databaseManager', 'databaseQuery', 'redisMonitor'],
          binding: learnedBinding,
          inferredSource: summarizeSourceInference(sourceInference),
          skillConfig: skillSettings
        },
      retryHints: [
        'Provide a SQL statement such as `sql: SELECT * FROM orders`.',
        'Or provide a Redis key pattern such as `redis key=order:*`.'
      ]
    });
  }
};

function parseValidationParams(input) {
  const params = {};
  if (/sql|查询|query|select|insert|update|delete/i.test(input)) params.action = 'sql';
  if (/redis|缓存|cache|key/i.test(input)) params.action = 'redis';

  const sqlMatch = input.match(/(?:sql|查询)\s*[:=]?\s*(select\s+.+?)(?:\s*$)/i);
  if (sqlMatch) params.query = sqlMatch[1].trim();

  const keyMatch = input.match(/(?:key|键)\s*[:=]?\s*(\S+)/i);
  if (keyMatch) params.key = keyMatch[1];

  const projectMatch = input.match(/(?:project|项目)\s*[:=]?\s*([\u4e00-\u9fa5A-Za-z0-9._-]+)/i);
  if (projectMatch) params.project = projectMatch[1];

  const envMatch = input.match(/(?:env|环境)\s*[:=]?\s*([A-Za-z_-]+)/i);
  if (envMatch) params.env = envMatch[1].toLowerCase();

  if (!params.query && params.action === 'sql') {
    const inferred = inferSqlFromNaturalLanguage(input);
    if (inferred.query) params.query = inferred.query;
    if (!params.project && inferred.project) params.project = inferred.project;
  }

  return params;
}

function inferSqlFromNaturalLanguage(input) {
  const tableMatch = String(input || '').match(/([A-Za-z0-9_]+)\s*表/);
  if (!tableMatch) {
    return {};
  }

  const schemaMatch = String(input || '').match(/([A-Za-z0-9_]+)\s*(?:库|schema|数据库)/i);
  const limit = parseNaturalLimit(input);
  const tableName = tableMatch[1];
  const qualifiedTable = schemaMatch && schemaMatch[1] !== tableName
    ? `${schemaMatch[1]}.${tableName}`
    : tableName;

  return {
    query: `select * from ${qualifiedTable} limit ${limit}`
  };
}

function parseNaturalLimit(input) {
  const explicitLimit = String(input || '').match(/\blimit\s+(\d+)\b/i);
  if (explicitLimit) {
    return Number(explicitLimit[1]) || 20;
  }

  const topRows = String(input || '').match(/(?:前|最近)\s*(\d+)\s*(?:条|行)/i);
  if (topRows) {
    return Number(topRows[1]) || 20;
  }

  return 20;
}

async function safeInferSourceContext(input) {
  try {
    return await inferSourceContext(input);
  } catch (error) {
    return null;
  }
}

function resolveDatabaseTarget(params, learnedBinding, sourceInference) {
  const bindingConnection = learnedBinding?.connection || {};
  const inferredDatabase = sourceInference?.database || {};

  return compactObject({
    project: params.project || sourceInference?.project || bindingConnection.project || null,
    environment: params.env || sourceInference?.environment || bindingConnection.env || inferredDatabase.envType || null,
    sourceId: bindingConnection.sourceId || inferredDatabase.sourceId || null,
    databaseId: bindingConnection.databaseId || inferredDatabase.databaseId || null,
    database: inferredDatabase.database || bindingConnection.database || null,
    host: bindingConnection.host || inferredDatabase.host || null,
    port: bindingConnection.port || inferredDatabase.port || null,
    username: bindingConnection.username || bindingConnection.dbUser || inferredDatabase.username || inferredDatabase.dbUser || null,
    password: bindingConnection.password || bindingConnection.dbPassword || inferredDatabase.password || inferredDatabase.dbPassword || null
  });
}

function resolveRedisTarget(params, learnedBinding, sourceInference) {
  const bindingConnection = learnedBinding?.connection || {};
  const inferredRedis = sourceInference?.redis || {};

  return compactObject({
    project: params.project || sourceInference?.project || bindingConnection.project || null,
    environment: params.env || sourceInference?.environment || bindingConnection.env || inferredRedis.envType || null,
    sourceId: bindingConnection.sourceId || inferredRedis.sourceId || null,
    host: bindingConnection.host || inferredRedis.host || null,
    port: bindingConnection.port || inferredRedis.port || null,
    password: bindingConnection.password || inferredRedis.password || null,
    database: inferredRedis.database ?? bindingConnection.database ?? 1
  });
}

function buildSqlExecutionParams(target, sql, skillSettings = {}) {
  return compactObject({
    source_id: target.sourceId || null,
    database_id: target.databaseId || null,
    schema: target.database || null,
    sql,
    limit: skillSettings.database?.maxRows || null,
    env: target.environment || null,
    host: target.host || null,
    port: target.port || null,
    username: target.username || null,
    password: target.password || null
  });
}

async function executeRedisAction(dbQuery, params, target, skillSettings = {}) {
  const baseParams = compactObject({
    source_id: target.sourceId || null,
    env: target.environment || null,
    host: target.host || null,
    port: target.port || null,
    password: target.password || null,
    database: target.database ?? 1
  });

  if (params.key && !/[*?]/.test(params.key)) {
    return dbQuery.redisKeyGet({
      ...baseParams,
      key: params.key
    });
  }

  return dbQuery.redisScan({
    ...baseParams,
    pattern: params.key || '*',
    count: skillSettings.redis?.scanCount || 50
  });
}

function summarizeSourceInference(sourceInference) {
  if (!sourceInference?.matched) {
    return sourceInference?.environment
      ? { matched: false, environment: sourceInference.environment }
      : null;
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

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined && fieldValue !== ''));
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}
