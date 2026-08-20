const { inferSourceContext } = require('../../core/source-inference');
const { createSkillError, createSkillResult } = require('../../core/result-contract');
const { reportProgress } = require('../../core/skill-progress');

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural-language SQL or Redis risk-audit request'
    },
    context: {
      type: 'object',
      description: 'Optional execution context'
    }
  },
  required: ['input']
};

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    risk: { type: 'object' },
    findings: { type: 'array' },
    recommendations: { type: 'array' },
    explain: { type: 'object' },
    metadata: { type: 'object' },
    retryHints: { type: 'array' }
  }
};

module.exports = {
  capabilities: ['data'],
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  canHandle(input) {
    if (!input) return false;
    return /数据风险|risk audit|sql风险|redis风险|危险sql|data risk/i.test(input);
  },

  async execute(input, context = {}) {
    reportProgress(context, 'parse', 10, 'Parsing risk-audit request');
    const sql = extractSql(input);
    const redis = extractRedisCommand(input);
    const dbQuery = context.componentRegistry?.getAdapter?.('databaseQuery') || null;
    const sourceInference = context.sourceInference || await safeInferSourceContext(input);
    const resourceBinding = context.resourceBinding || null;
    const availableComponents = {
      databaseQuery: !!dbQuery
    };

    if (sql) {
      reportProgress(context, 'audit-sql', 30, 'Analyzing SQL risk');
      const audit = auditSql(sql);
      const target = resolveSqlTarget(sourceInference, resourceBinding);
      reportProgress(context, 'preview-explain', 55, 'Preparing EXPLAIN preview');
      const explain = shouldRunExplain(audit, context)
        ? await runExplainPreview(dbQuery, target, sql, context)
        : null;
      reportProgress(context, 'preview-metadata', 75, 'Preparing metadata preview');
      const metadata = shouldRunMetadataPreview(audit, context)
        ? await runMetadataPreview(dbQuery, target, sql)
        : null;
      reportProgress(context, 'finalize', 95, 'Preparing SQL risk response');
      return createSkillResult('data-risk-audit', `SQL risk audit completed. Risk: ${audit.risk.level}`, {
        input,
        data: {
          action: 'sql',
          statement: sql,
          target,
          availableComponents,
          risk: audit.risk,
          findings: audit.findings,
          recommendations: audit.recommendations,
          explain,
          metadata,
          retryHints: buildRetryHints('sql', availableComponents, target)
        }
      });
    }

    if (redis) {
      reportProgress(context, 'audit-redis', 35, 'Analyzing Redis risk');
      const audit = auditRedis(redis);
      const target = resolveRedisTarget(sourceInference, resourceBinding);
      reportProgress(context, 'finalize', 95, 'Preparing Redis risk response');
      return createSkillResult('data-risk-audit', `Redis risk audit completed. Risk: ${audit.risk.level}`, {
        input,
        data: {
          action: 'redis',
          command: redis,
          target,
          availableComponents,
          risk: audit.risk,
          findings: audit.findings,
          recommendations: audit.recommendations,
          retryHints: buildRetryHints('redis', availableComponents, target)
        }
      });
    }

    return createSkillError('data-risk-audit', 'Provide SQL or Redis input to run a risk audit.', {
      input,
      kind: 'invalid-input',
      retryable: true,
      data: {
        actions: ['Audit SQL statements', 'Audit Redis commands or key patterns'],
        examples: [
          '数据风险 sql: DELETE FROM orders',
          'Redis风险 key=*'
        ],
        availableComponents,
        inferredSource: summarizeInferredSource(sourceInference)
      },
      retryHints: [
        'Provide a SQL statement such as `数据风险 sql: SELECT * FROM orders`.',
        'Or provide a Redis command such as `Redis风险 redis: KEYS *`.'
      ]
    });
  }
};

function extractSql(input) {
  const sqlKeywordMatch = String(input || '').match(/(?:sql|语句)\s*[:=]?\s*((?:select|update|delete|insert).+)$/i);
  if (sqlKeywordMatch) {
    return sqlKeywordMatch[1].trim();
  }

  const directMatch = String(input || '').match(/\b(select|update|delete|insert)\b[\s\S]*$/i);
  return directMatch ? directMatch[0].trim() : null;
}

function extractRedisCommand(input) {
  const text = String(input || '');
  const commandMatch = text.match(/(?:redis|缓存)\s*[:=]?\s*(.+)$/i);
  if (commandMatch) {
    return commandMatch[1].trim();
  }
  const keyMatch = text.match(/(?:key|键)\s*[:=]?\s*(\S+)/i);
  return keyMatch ? `GET ${keyMatch[1]}` : null;
}

function auditSql(sql) {
  const normalized = sql.toLowerCase();
  const findings = [];
  let score = 0;

  if (/^\s*(update|delete)\b/.test(normalized) && !/\bwhere\b/.test(normalized)) {
    score += 5;
    findings.push({ severity: 'critical', issue: 'Destructive statement without WHERE clause' });
  }
  if (/^\s*select\s+\*/.test(normalized)) {
    score += 2;
    findings.push({ severity: 'medium', issue: 'SELECT * may read unnecessary columns' });
  }
  if (/^\s*select\b/.test(normalized) && !/\blimit\b/.test(normalized)) {
    score += 2;
    findings.push({ severity: 'medium', issue: 'SELECT statement has no LIMIT' });
  }
  if (/\border\s+by\s+rand\s*\(/.test(normalized)) {
    score += 3;
    findings.push({ severity: 'high', issue: 'ORDER BY RAND() is expensive on large datasets' });
  }
  if (/\blike\s+['"]%/.test(normalized)) {
    score += 1;
    findings.push({ severity: 'low', issue: 'Leading wildcard LIKE may bypass indexes' });
  }
  if (/\bor\s+1\s*=\s*1\b/.test(normalized)) {
    score += 4;
    findings.push({ severity: 'high', issue: 'Suspicious always-true predicate detected' });
  }

  return {
    risk: classifyRisk(score),
    findings,
    recommendations: [
      'Prefer bounded queries with WHERE and LIMIT.',
      'Run EXPLAIN before executing high-impact SQL in shared environments.',
      'Validate blast radius on non-prod data first.'
    ]
  };
}

function auditRedis(command) {
  const normalized = String(command || '').toLowerCase();
  const findings = [];
  let score = 0;

  if (/\bkeys\b/.test(normalized)) {
    score += 5;
    findings.push({ severity: 'critical', issue: 'KEYS can block Redis on large keyspaces' });
  }
  if (/[*?]/.test(normalized)) {
    score += 3;
    findings.push({ severity: 'high', issue: 'Wildcard key access may scan a broad keyspace' });
  }
  if (/\bscan\b/.test(normalized) && /\bcount\s+([1-9]\d{3,})\b/.test(normalized)) {
    score += 2;
    findings.push({ severity: 'medium', issue: 'Large SCAN count may still cause noticeable load' });
  }

  return {
    risk: classifyRisk(score),
    findings,
    recommendations: [
      'Prefer SCAN over KEYS and keep match patterns narrow.',
      'Audit key prefixes and environment before running broad cache operations.',
      'Use sampled reads before expanding to large scans.'
    ]
  };
}

function classifyRisk(score) {
  return {
    score,
    level: score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low'
  };
}

function shouldRunExplain(audit, context = {}) {
  const explainSetting = context.skillConfig?.runExplain ?? context.preferences?.runExplain ?? true;
  return explainSetting !== false && audit.risk.level !== 'low';
}

function shouldRunMetadataPreview(audit, context = {}) {
  const metadataSetting = context.skillConfig?.runMetadataPreview ?? context.preferences?.runMetadataPreview ?? true;
  return metadataSetting !== false && audit.risk.level !== 'low';
}

async function runExplainPreview(dbQuery, target, sql, context = {}) {
  if (!dbQuery || typeof dbQuery.queryExec !== 'function') {
    return {
      attempted: false,
      reason: 'databaseQuery adapter unavailable'
    };
  }

  try {
    const explainSql = /^\s*explain\b/i.test(sql) ? sql : `EXPLAIN ${sql}`;
    const execution = await dbQuery.queryExec(buildExplainParams(target, explainSql, context));
    return {
      attempted: true,
      sql: explainSql,
      summary: summarizeExplainExecution(execution)
    };
  } catch (error) {
    return {
      attempted: true,
      error: error.message
    };
  }
}

async function runMetadataPreview(dbQuery, target, sql) {
  if (!dbQuery || typeof dbQuery.fetchTables !== 'function') {
    return {
      attempted: false,
      reason: 'database metadata provider unavailable'
    };
  }

  if (!target.sourceId || !target.database) {
    return {
      attempted: false,
      reason: 'database target unavailable for metadata lookup'
    };
  }

  const referencedTables = extractSqlTableNames(sql);
  if (referencedTables.length === 0) {
    return {
      attempted: false,
      reason: 'no table names inferred from SQL'
    };
  }

  try {
    const tablesExecution = await dbQuery.fetchTables({
      source_id: target.sourceId,
      database_id: target.databaseId || null,
      schema: target.database
    });
    const availableTables = normalizeTableList(tablesExecution);
    const matchedTables = referencedTables.map((name) => {
      const match = availableTables.find((table) => table.name.toLowerCase() === name.toLowerCase());
      return {
        name,
        exists: !!match
      };
    });

    let fields = [];
    if (typeof dbQuery.fetchFields === 'function') {
      const existingTable = matchedTables.find((table) => table.exists);
      if (existingTable) {
        const fieldsExecution = await dbQuery.fetchFields({
          source_id: target.sourceId,
          database_id: target.databaseId || null,
          schema: target.database,
          table: existingTable.name
        });
        fields = normalizeFieldList(fieldsExecution).slice(0, 10);
      }
    }

    return {
      attempted: true,
      referencedTables,
      matchedTables,
      sampledFields: fields
    };
  } catch (error) {
    return {
      attempted: true,
      error: error.message
    };
  }
}

function buildExplainParams(target, sql, context = {}) {
  const maxRows = context.skillConfig?.database?.maxRows
    || context.preferences?.database?.maxRows
    || 20;

  return compactObject({
    source_id: target.sourceId || null,
    database_id: target.databaseId || null,
    schema: target.database || null,
    env: target.environment || null,
    host: target.host || null,
    port: target.port || null,
    username: target.username || target.dbUser || null,
    password: target.password || target.dbPassword || null,
    sql,
    limit: maxRows
  });
}

function resolveSqlTarget(sourceInference, resourceBinding) {
  const bindingConnection = resourceBinding?.connection || {};
  const inferredDatabase = sourceInference?.database || {};

  return compactObject({
    project: sourceInference?.project || bindingConnection.project || null,
    environment: sourceInference?.environment || bindingConnection.env || inferredDatabase.envType || null,
    sourceId: bindingConnection.sourceId || inferredDatabase.sourceId || null,
    databaseId: bindingConnection.databaseId || inferredDatabase.databaseId || null,
    database: inferredDatabase.database || bindingConnection.database || null,
    host: bindingConnection.host || inferredDatabase.host || null,
    port: bindingConnection.port || inferredDatabase.port || null,
    username: bindingConnection.username || bindingConnection.dbUser || inferredDatabase.username || inferredDatabase.dbUser || null,
    password: bindingConnection.password || bindingConnection.dbPassword || inferredDatabase.password || inferredDatabase.dbPassword || null
  });
}

function resolveRedisTarget(sourceInference, resourceBinding) {
  const bindingConnection = resourceBinding?.connection || {};
  const inferredRedis = sourceInference?.redis || {};

  return compactObject({
    project: sourceInference?.project || bindingConnection.project || null,
    environment: sourceInference?.environment || bindingConnection.env || inferredRedis.envType || null,
    sourceId: bindingConnection.sourceId || inferredRedis.sourceId || null,
    database: inferredRedis.database ?? bindingConnection.database ?? null,
    host: bindingConnection.host || inferredRedis.host || null,
    port: bindingConnection.port || inferredRedis.port || null
  });
}

function summarizeExplainExecution(execution) {
  const payload = unwrap(execution);
  const rows = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.list)
      ? payload.list
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.result)
          ? payload.result
          : [];

  const normalizedRows = rows.map((row) => ({
    table: row.table || row.TABLE_NAME || null,
    type: row.type || row.access_type || row.select_type || null,
    key: row.key || row.possible_keys || null,
    rows: row.rows || row.examined_rows || null,
    extra: row.Extra || row.extra || null
  }));

  const warnings = [];
  for (const row of normalizedRows) {
    if (String(row.type || '').toUpperCase() === 'ALL') {
      warnings.push('Full table scan detected in EXPLAIN output.');
    }
    if (row.extra && /filesort|temporary/i.test(String(row.extra))) {
      warnings.push(`Potentially expensive EXPLAIN extra: ${row.extra}`);
    }
  }

  return {
    totalRows: normalizedRows.length,
    rows: normalizedRows.slice(0, 5),
    warnings: [...new Set(warnings)]
  };
}

function extractSqlTableNames(sql) {
  const matches = String(sql || '').matchAll(/\b(?:from|join|update|into)\s+([`"'A-Za-z0-9_.-]+)/gi);
  const names = [];
  for (const match of matches) {
    const raw = String(match[1] || '').replace(/[`'"]/g, '');
    const table = raw.split('.').pop();
    if (table) {
      names.push(table);
    }
  }
  return [...new Set(names)];
}

function normalizeTableList(execution) {
  const payload = unwrap(execution);
  const items = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.list)
      ? payload.list
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.result)
          ? payload.result
          : Array.isArray(payload.tables)
            ? payload.tables
            : [];

  return items.map((item) => ({
    name: item.table || item.tableName || item.TABLE_NAME || item.name || item.value || ''
  })).filter((item) => item.name);
}

function normalizeFieldList(execution) {
  const payload = unwrap(execution);
  const items = Array.isArray(payload.rows)
    ? payload.rows
    : Array.isArray(payload.list)
      ? payload.list
      : Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.result)
          ? payload.result
          : Array.isArray(payload.fields)
            ? payload.fields
            : [];

  return items.map((item) => ({
    name: item.field || item.fieldName || item.COLUMN_NAME || item.name || '',
    type: item.type || item.dataType || item.COLUMN_TYPE || null
  })).filter((item) => item.name);
}

function buildRetryHints(action, availableComponents, target) {
  const hints = [];
  if (action === 'sql') {
    hints.push('Execute high-risk SQL in non-production first.');
    if (!availableComponents.databaseQuery) {
      hints.push('Connect a databaseQuery provider to enable EXPLAIN and metadata previews.');
    }
    if (!target.sourceId || !target.database) {
      hints.push('Specify project/environment or bind a database resource so FlowMind can resolve the exact database target.');
    }
  } else if (action === 'redis') {
    hints.push('Reduce Redis key scope before scanning large keyspaces.');
    if (!target.sourceId) {
      hints.push('Bind a Redis-capable data source to resolve the exact cache target.');
    }
  }
  return hints;
}

function unwrap(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value.content)) {
    const text = value.content.find((item) => typeof item?.text === 'string')?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }
  return value.data && typeof value.data === 'object' ? value.data : value;
}

function compactObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined && fieldValue !== ''));
}

async function safeInferSourceContext(input) {
  try {
    return await inferSourceContext(input);
  } catch {
    return null;
  }
}

function summarizeInferredSource(sourceInference) {
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
    redisDatabase: sourceInference.redis?.database ?? null
  };
}
