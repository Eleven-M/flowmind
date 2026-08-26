/**
 * FlowMind Entity Extraction
 * Pure functions that turn skill results into entity-memory records.
 * No I/O — callers own persistence and error handling.
 */

const AUTO_FLOW_SKILLS = new Set(['auto-flow']);
const LOG_AUDIT_SKILLS = new Set(['log-audit', 'sls-log-audit']);

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function compactObject(value) {
  const result = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined || item === null || item === '') continue;
    result[key] = item;
  }
  return result;
}

/**
 * Extract a quoted trace token from an SLS query such as `* and "abc-123"`.
 */
function extractTraceIdFromQuery(query) {
  if (typeof query !== 'string') return null;
  const quoted = query.match(/"([A-Za-z0-9][A-Za-z0-9:_-]{7,})"/);
  return quoted ? quoted[1] : null;
}

/**
 * auto-flow results expose data.resolution.services[]:
 * { source, serviceName, environment, pipelineId, pipelineName }
 * plus data.resolution.pipelineIds, and list/status executions expose
 * data.execution.items[]: { pipelineName, pipelineId, service, env }.
 */
function extractFromAutoFlow(data) {
  const resolution = isPlainObject(data?.resolution) ? data.resolution : {};
  const services = Array.isArray(resolution.services) ? resolution.services : [];
  const entities = [];
  const seen = new Set();

  for (const service of services) {
    if (!isPlainObject(service)) continue;
    const name = String(service.serviceName || '').trim();
    if (!name) continue;

    entities.push({
      type: 'service',
      name,
      env: service.environment || null,
      attributes: compactObject({
        pipelineIds: service.pipelineId ? [String(service.pipelineId)] : [],
        pipelineName: service.pipelineName || null
      })
    });
    seen.add(`${name}|${service.environment || ''}`);
  }

  const execution = isPlainObject(data?.execution) ? data.execution : {};
  const items = Array.isArray(execution.items) ? execution.items : [];
  for (const item of items) {
    if (!isPlainObject(item)) continue;
    const pipelineName = String(item.pipelineName || '').trim();
    const pipelineId = item.pipelineId === null || item.pipelineId === undefined ? null : String(item.pipelineId);
    if (!pipelineName || !pipelineId) continue;

    const inferred = inferServiceFromPipelineName(pipelineName);
    const name = String(item.service || inferred?.serviceName || '').trim();
    if (!name) continue;

    const env = item.env || inferred?.env || null;
    const key = `${name}|${env || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    entities.push({
      type: 'service',
      name,
      env,
      attributes: {
        pipelineIds: [pipelineId],
        pipelineName
      }
    });
  }

  return entities;
}

function inferServiceFromPipelineName(pipelineName) {
  const match = String(pipelineName || '').toLowerCase().match(/^(test|dev|uat|gray|prod)-(.+)$/);
  if (!match || !match[2]) return null;
  return { env: match[1], serviceName: match[2] };
}

/**
 * log-audit results expose data.resolution (env/endpoint/project/logstore)
 * and data.queryParams (traceId/service/query).
 */
function extractFromLogAudit(data) {
  const resolution = isPlainObject(data?.resolution) ? data.resolution : {};
  const queryParams = isPlainObject(data?.queryParams) ? data.queryParams : {};

  const env = resolution.env || queryParams.env || null;
  const endpoint = resolution.endpoint || queryParams.endpoint || null;
  const project = resolution.project || queryParams.project || null;
  const logstore = resolution.logstore || queryParams.logstore || null;
  const service = queryParams.service || null;
  const traceId = queryParams.traceId || extractTraceIdFromQuery(queryParams.query);

  const entities = [];

  if (traceId) {
    entities.push({
      type: 'trace',
      name: String(traceId),
      env,
      attributes: compactObject({
        service,
        project
      })
    });
  }

  if (service || (project && logstore)) {
    entities.push({
      type: 'service',
      name: String(service || `${project}:${logstore}`),
      env,
      attributes: compactObject({
        logstore,
        endpoint,
        project
      })
    });
  }

  return entities;
}

/**
 * Extract entity-memory records from a skill result.
 * @returns {Array<{type, name, env, attributes}>}
 */
function extractEntitiesFromResult(result, skillName = null) {
  if (!isPlainObject(result)) return [];
  const data = isPlainObject(result.data) ? result.data : result;
  if (!isPlainObject(data)) return [];

  const effectiveSkill = skillName || result.skill;
  if (AUTO_FLOW_SKILLS.has(effectiveSkill)) {
    return extractFromAutoFlow(data);
  }
  if (LOG_AUDIT_SKILLS.has(effectiveSkill)) {
    return extractFromLogAudit(data);
  }

  return [];
}

module.exports = {
  extractEntitiesFromResult,
  extractTraceIdFromQuery
};
