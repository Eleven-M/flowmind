const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { getFlowMindHome } = require('./runtime-home');

const SDD_SOURCE_SYNC_FILES = Object.freeze([
  'RESOURCE_INDEX.md',
  'project-db-configs.json',
  'project-git-map.json',
  'feign-link-map.json',
  'auto-flow-apis.md',
  'auto-flow-pipeline-map.json'
]);

const RESOURCE_BINDING_SPECS = Object.freeze({
  yapi: { componentType: 'apiDoc', provider: 'yapi' },
  yuque: { componentType: 'knowledgeBase', provider: 'yuque' },
  database: { componentType: 'databaseQuery', provider: 'aliyun-rds-query' },
  redis: { componentType: 'redisMonitor', provider: 'aliyun-redis' },
  sls: { componentType: 'logService', provider: 'aliyun-sls' },
  workflow: { componentType: 'workflow', provider: 'auto-flow' },
  report: { componentType: 'report', provider: 'auto-report' }
});

function getHomeDir() {
  return getFlowMindHome();
}

function normalizeMcpServer(name) {
  if (!name) return null;
  if (/^[^-]+-yapi-mcp$/i.test(name)) return 'yapi-mcp';
  if (/^[^-]+-yuque-mcp$/i.test(name)) return 'yuque-mcp';
  return name;
}

function deepMerge(target, source) {
  if (!isObject(target) || !isObject(source)) {
    return source;
  }

  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (isObject(value) && isObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeResourceConfig(sddConfig, skillBindingData = {}) {
  const resources = { ...(sddConfig.resources || {}) };
  if (!resources.workflow) {
    const workflowResource = buildWorkflowResource(skillBindingData);
    if (workflowResource) {
      resources.workflow = workflowResource;
    }
  }

  return {
    version: sddConfig.version || '1.0',
    lastUpdated: new Date().toISOString(),
    resources,
    mcpServers: sddConfig.mcpServers || {},
    aliases: sddConfig.aliases || {},
    metadata: {
      source: 'sdd-agent',
      syncedAt: new Date().toISOString()
    }
  };
}

function buildAliasIndex(aliasConfig = {}) {
  const index = {};
  for (const [alias, mapping] of Object.entries(aliasConfig)) {
    if (!isObject(mapping)) continue;
    for (const [resourceType, bindingKey] of Object.entries(mapping)) {
      if (!bindingKey) continue;
      const composite = `${resourceType}:${bindingKey}`;
      index[composite] = index[composite] || [];
      index[composite].push(alias);
    }
  }
  return index;
}

function inferBindingMcpServer(resourceType, resourceConfig = {}) {
  if (resourceConfig.mcpServer) {
    return normalizeMcpServer(resourceConfig.mcpServer);
  }
  if (isObject(resourceConfig.mcpServers)) {
    let preferred = null;
    if (resourceType === 'database') {
      preferred = resourceConfig.mcpServers.directQuery || resourceConfig.mcpServers.dms;
    } else if (resourceType === 'redis') {
      preferred = resourceConfig.mcpServers.monitor || resourceConfig.mcpServers.directQuery;
    } else {
      preferred = resourceConfig.mcpServers.directQuery
        || resourceConfig.mcpServers.monitor
        || resourceConfig.mcpServers.dms;
    }
    return normalizeMcpServer(preferred);
  }
  return null;
}

function buildResourceBinding(resourceType, bindingKey, bindingValue, resourceConfig, aliasIndex) {
  const spec = RESOURCE_BINDING_SPECS[resourceType];
  if (!spec) return null;

  const bindingAliases = aliasIndex[`${resourceType}:${bindingKey}`] || [];
  const business = bindingAliases[0] || bindingValue.name || bindingKey;
  const aliases = [
    bindingKey,
    bindingValue.name,
    bindingValue.database,
    bindingValue.namespace,
    bindingValue.projectId,
    bindingValue.envType,
    bindingValue.env,
    ...bindingAliases
  ].filter(Boolean);

  const env = bindingValue.envType || bindingValue.env || null;

  return {
    id: `sdd-${resourceType}-${bindingKey}`,
    timestamp: new Date().toISOString(),
    business,
    aliases: [...new Set(aliases)],
    componentType: spec.componentType,
    provider: spec.provider,
    mcpServer: inferBindingMcpServer(resourceType, resourceConfig),
    source: 'sdd-agent-sync',
    keywords: [...new Set([business, bindingKey, resourceType, env, ...aliases].filter(Boolean))],
    connection: {
      ...bindingValue,
      env
    },
    metadata: {
      source: 'sdd-agent',
      resourceType,
      bindingKey
    },
    stats: {
      useCount: 0,
      lastUsed: null
    }
  };
}

function buildLogBindings(resourceConfig = {}) {
  const spec = RESOURCE_BINDING_SPECS.sls;
  const envConfig = resourceConfig.envConfig || {};
  return Object.entries(envConfig).map(([env, value]) => ({
    id: `sdd-sls-${env}`,
    timestamp: new Date().toISOString(),
    business: `日志-${env}`,
    aliases: [env, value.name, `${env}-日志`, `${env}-sls`].filter(Boolean),
    componentType: spec.componentType,
    provider: spec.provider,
    mcpServer: normalizeMcpServer(resourceConfig.mcpServer),
    source: 'sdd-agent-sync',
    keywords: ['日志', 'log', 'trace', 'sls', env, value.logstore, value.project].filter(Boolean),
    connection: {
      env,
      project: value.project,
      endpoint: value.endpoint,
      logstore: value.logstore,
      ...value
    },
    metadata: {
      source: 'sdd-agent',
      resourceType: 'sls',
      env
    },
    stats: {
      useCount: 0,
      lastUsed: null
    }
  }));
}

function buildWorkflowResource(skillBindingData = {}) {
  const workflowBinding = skillBindingData.bindings?.['auto-flow'];
  if (!workflowBinding) return null;

  const learningCount = workflowBinding.learningCount || (workflowBinding.records || []).length || (workflowBinding.rules || []).length;

  return {
    enabled: true,
    mcpServer: 'auto-flow',
    bindings: {
      'auto-flow': {
        name: '自动部署',
        skill: 'auto-flow',
        provider: 'auto-flow',
        mcpServer: 'auto-flow',
        learningCount,
        lastLearning: workflowBinding.lastLearning || null,
        records: workflowBinding.records || [],
        rules: workflowBinding.rules || []
      }
    },
    defaultBinding: 'auto-flow'
  };
}

function normalizeWorkflowTransport(transport) {
  if (!transport || !transport.url) return null;

  const headers = transport.headers || {};
  const normalizedHeaders = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null || value === '') continue;
    normalizedHeaders[key] = value;
  }

  return {
    url: transport.url,
    type: transport.type || 'http',
    headers: normalizedHeaders,
    description: transport.description || 'Workflow MCP server'
  };
}

async function discoverWorkflowTransport(options = {}) {
  const direct = normalizeWorkflowTransport(options.workflowTransport);
  if (direct) return direct;

  const envUrl = process.env.FLOWMIND_AUTO_FLOW_MCP_URL;
  if (envUrl) {
    return normalizeWorkflowTransport({
      url: envUrl,
      type: 'http',
      headers: process.env.FLOWMIND_AUTO_FLOW_MCP_TOKEN
        ? { mcp_token: process.env.FLOWMIND_AUTO_FLOW_MCP_TOKEN }
        : {},
      description: 'Workflow MCP server from environment'
    });
  }

  const debugDir = path.join(os.homedir(), '.claude', 'debug');
  if (!await fs.pathExists(debugDir)) return null;

  const entries = await fs.readdir(debugDir);
  const candidates = [];
  for (const entry of entries) {
    const filePath = path.join(debugDir, entry);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        candidates.push({ filePath, mtimeMs: stat.mtimeMs });
      }
    } catch (error) {
      // skip unreadable files
    }
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const { filePath } of candidates.slice(0, 10)) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const match = content.match(/MCP server "auto-flow": HTTP transport options: (\{[^\n]+\})/);
      if (!match) continue;

      const parsed = JSON.parse(match[1]);
      return normalizeWorkflowTransport({
        url: parsed.url,
        type: parsed.type || 'http',
        headers: parsed.headers || {},
        description: 'Workflow MCP server discovered from Claude debug logs'
      });
    } catch (error) {
      // continue scanning other files
    }
  }

  return null;
}

function buildWorkflowBindings(skillBindingData = {}, workflowTransport = null) {
  const workflowBinding = skillBindingData.bindings?.['auto-flow'];
  if (!workflowBinding) return [];

  const ruleSummaries = (workflowBinding.records || []).map((record) => record.summary).filter(Boolean);
  const ruleActions = (workflowBinding.rules || []).map((rule) => rule.action).filter(Boolean);
  const keywords = [
    'auto-flow',
    'workflow',
    'pipeline',
    'deploy',
    'deployment',
    '部署',
    '发布',
    '上线',
    '流水线',
    ...ruleSummaries,
    ...ruleActions
  ];

  return [{
    id: 'sdd-workflow-auto-flow',
    timestamp: new Date().toISOString(),
    business: '自动部署',
    aliases: [
      'auto-flow',
      'workflow',
      'pipeline',
      '飞流',
      '飞流部署',
      '部署',
      '发布',
      '上线',
      '流水线'
    ],
    componentType: 'workflow',
    provider: 'auto-flow',
    mcpServer: 'auto-flow',
    source: 'sdd-agent-sync',
    keywords: [...new Set(keywords.filter(Boolean))],
    connection: {
      skill: 'auto-flow',
      learningCount: workflowBinding.learningCount || 0,
      lastLearning: workflowBinding.lastLearning || null,
      records: workflowBinding.records || [],
      rules: workflowBinding.rules || [],
      transport: workflowTransport ? {
        url: workflowTransport.url,
        type: workflowTransport.type
      } : undefined
    },
    metadata: {
      source: 'sdd-agent',
      resourceType: 'workflow',
      bindingKey: 'auto-flow'
    },
    stats: {
      useCount: 0,
      lastUsed: null
    }
  }];
}

function convertResourceBindings(sddConfig, skillBindingData = {}, workflowTransport = null) {
  const resources = sddConfig.resources || {};
  const aliasIndex = buildAliasIndex(sddConfig.aliases);
  const bindings = [];

  for (const [resourceType, resourceConfig] of Object.entries(resources)) {
    if (resourceType === 'sls') {
      bindings.push(...buildLogBindings(resourceConfig));
      continue;
    }

    const bindingMap = resourceConfig.bindings || {};
    for (const [bindingKey, bindingValue] of Object.entries(bindingMap)) {
      const converted = buildResourceBinding(resourceType, bindingKey, bindingValue, resourceConfig, aliasIndex);
      if (converted) bindings.push(converted);
    }
  }

  bindings.push(...buildWorkflowBindings(skillBindingData, workflowTransport));

  return bindings;
}

function convertSceneMappings(sceneData = {}) {
  const mappings = sceneData.mappings || [];
  return mappings.map((mapping) => ({
    id: `sdd-${mapping.id || mapping.sceneName || Date.now()}`,
    name: mapping.sceneName || mapping.name || 'Imported Scene',
    keywords: mapping.keywords || [],
    patterns: mapping.patterns || [],
    workflow: {
      skills: (mapping.skillSequence || []).map((step) => ({
        skill: step.skill,
        params: {
          action: step.action,
          ...(step.params || {})
        }
      }))
    },
    preferences: mapping.userPreference || {},
    stats: {
      useCount: mapping.useCount || 0,
      lastUsed: mapping.lastUsed || null,
      successRate: typeof mapping.confidence === 'number' ? mapping.confidence : 1.0
    },
    metadata: {
      source: 'sdd-agent',
      originalId: mapping.id,
      categoryHints: Object.keys(sceneData.sceneCategories || {}).filter((key) => (sceneData.sceneCategories[key] || []).includes(mapping.id)),
      workflow: mapping.workflow || {}
    }
  }));
}

function buildComponentConfig(sddConfig, skillBindingData = {}, workflowTransport = null) {
  const resources = sddConfig.resources || {};
  const workflowResource = resources.workflow || buildWorkflowResource(skillBindingData);
  const components = {};
  const directQueryServer = resources.database?.mcpServers?.directQuery
    || resources.redis?.mcpServers?.directQuery
    || null;

  if (resources.sls?.enabled) {
    const defaultEnv = resources.sls.defaultEnv || 'uat';
    const envConfig = resources.sls.envConfig || {};
    components.logService = {
      default: 'aliyun-sls',
        providers: {
          'aliyun-sls': {
            enabled: true,
            mcpServer: normalizeMcpServer(resources.sls.mcpServer),
            config: {
              endpoints: {
                test: envConfig.test?.endpoint || envConfig.uat?.endpoint,
                uat: envConfig.uat?.endpoint || envConfig.test?.endpoint,
                gray: envConfig.gray?.endpoint || envConfig.prod?.endpoint,
                prod: envConfig.prod?.endpoint || envConfig.gray?.endpoint
              },
              envConfig,
              defaultProject: envConfig[defaultEnv]?.project,
              defaultLogstore: envConfig[defaultEnv]?.logstore
            }
          }
        }
    };
  }

  if (resources.database?.enabled && resources.database.mcpServers?.dms) {
    components.databaseManager = {
      default: 'aliyun-dms',
      providers: {
        'aliyun-dms': {
          enabled: true,
          mcpServer: normalizeMcpServer(resources.database.mcpServers.dms)
        }
      }
    };
  }

  if ((resources.database?.enabled || resources.redis?.enabled) && directQueryServer) {
    components.databaseQuery = {
      default: 'aliyun-rds-query',
      providers: {
        'aliyun-rds-query': {
          enabled: true,
          mcpServer: normalizeMcpServer(directQueryServer)
        }
      }
    };
  }

  if (resources.redis?.enabled && resources.redis.mcpServers?.monitor) {
    components.redisMonitor = {
      default: 'aliyun-redis',
      providers: {
        'aliyun-redis': {
          enabled: true,
          mcpServer: normalizeMcpServer(resources.redis.mcpServers.monitor)
        }
      }
    };
  }

  if (resources.yapi?.enabled && resources.yapi.mcpServer) {
    components.apiDoc = {
      default: 'yapi',
      providers: {
        yapi: {
          enabled: true,
          mcpServer: normalizeMcpServer(resources.yapi.mcpServer)
        }
      }
    };
  }

  if (resources.yuque?.enabled && resources.yuque.mcpServer) {
    components.knowledgeBase = {
      default: 'yuque',
      providers: {
        yuque: {
          enabled: true,
          mcpServer: normalizeMcpServer(resources.yuque.mcpServer)
        }
      }
    };
  }

  if (workflowResource?.enabled && workflowResource.mcpServer) {
    components.workflow = {
      default: 'auto-flow',
      providers: {
        'auto-flow': {
          enabled: true,
          mcpServer: normalizeMcpServer(workflowResource.mcpServer),
          ...(workflowTransport ? { transport: workflowTransport } : {})
        }
      }
    };
  }

  if (resources.report?.enabled && resources.report.mcpServer) {
    components.report = {
      default: 'auto-report',
      providers: {
        'auto-report': {
          enabled: true,
          mcpServer: normalizeMcpServer(resources.report.mcpServer)
        }
      }
    };
  }

  return {
    version: '1.0.0',
    components
  };
}

function mergeBindings(existingBindings = [], incomingBindings = []) {
  const merged = [...existingBindings];
  for (const binding of incomingBindings) {
    const index = merged.findIndex((item) => item.id === binding.id
      || (item.business === binding.business
        && item.componentType === binding.componentType
        && item.provider === binding.provider));
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...binding,
        aliases: [...new Set([...(merged[index].aliases || []), ...(binding.aliases || [])])],
        keywords: [...new Set([...(merged[index].keywords || []), ...(binding.keywords || [])])],
        connection: {
          ...(merged[index].connection || {}),
          ...(binding.connection || {})
        },
        metadata: {
          ...(merged[index].metadata || {}),
          ...(binding.metadata || {})
        }
      };
    } else {
      merged.push(binding);
    }
  }
  return merged;
}

function mergeScenes(existingScenes = [], incomingScenes = []) {
  const merged = [...existingScenes];
  for (const scene of incomingScenes) {
    const index = merged.findIndex((item) => item.id === scene.id || item.name === scene.name);
    if (index >= 0) {
      merged[index] = {
        ...merged[index],
        ...scene,
        keywords: [...new Set([...(merged[index].keywords || []), ...(scene.keywords || [])])],
        patterns: [...new Set([...(merged[index].patterns || []), ...(scene.patterns || [])])],
        workflow: scene.workflow || merged[index].workflow,
        preferences: {
          ...(merged[index].preferences || {}),
          ...(scene.preferences || {})
        },
        metadata: {
          ...(merged[index].metadata || {}),
          ...(scene.metadata || {})
        }
      };
    } else {
      merged.push(scene);
    }
  }
  return merged;
}

/**
 * Convert sdd-agent skill bindings (records/rules per skill plus top-level
 * globalRules) into flowmind skill-binding shape. Global rules are mapped to
 * the reserved `_global` skill so they survive the migration without being
 * attributed to a nonexistent skill.
 */
function convertSkillBindings(sddSkillBindings = {}) {
  const converted = {};
  const sourceBindings = isObject(sddSkillBindings.bindings) ? sddSkillBindings.bindings : {};
  let importedSkillRecords = 0;
  let importedSkillRules = 0;

  for (const [skillName, binding] of Object.entries(sourceBindings)) {
    if (!isObject(binding)) continue;
    const records = (Array.isArray(binding.records) ? binding.records : [])
      .filter((record) => isObject(record) && record.recordId);
    const rules = (Array.isArray(binding.rules) ? binding.rules : []).filter(isObject);
    if (records.length === 0 && rules.length === 0) continue;

    converted[skillName] = {
      learningCount: Number(binding.learningCount) || records.length,
      lastLearning: binding.lastLearning || null,
      records,
      rules,
      metadata: {
        importedFrom: 'sdd-agent',
        originalLearningCount: Number(binding.learningCount) || records.length
      }
    };
    importedSkillRecords += records.length;
    importedSkillRules += rules.length;
  }

  const globalRules = (Array.isArray(sddSkillBindings.globalRules) ? sddSkillBindings.globalRules : [])
    .filter(isObject)
    .map((rule) => ({
      condition: rule.pattern || rule.condition || null,
      action: rule.action || null,
      source: rule.source || 'sdd-agent-global'
    }))
    .filter((rule) => rule.condition || rule.action);

  if (globalRules.length > 0) {
    const existing = converted._global || { learningCount: 0, lastLearning: null, records: [], rules: [] };
    converted._global = {
      ...existing,
      learningCount: Math.max(Number(existing.learningCount) || 0, globalRules.length),
      rules: [...(existing.rules || []), ...globalRules],
      metadata: { importedFrom: 'sdd-agent', scope: 'global' }
    };
  }

  return {
    bindings: converted,
    importedSkillRecords,
    importedSkillRules,
    importedGlobalRules: globalRules.length
  };
}

function mergeUniqueByKey(items, keyName) {
  const merged = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = item?.[keyName] || JSON.stringify(item || {});
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function mergeUniqueJson(items) {
  const merged = [];
  const seen = new Set();
  for (const item of items || []) {
    const key = JSON.stringify(item || {});
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function latestIsoTimestamp(left, right) {
  if (!left) return right || null;
  if (!right) return left || null;
  return String(right) > String(left) ? right : left;
}

/**
 * Union-merge imported sdd-agent skill bindings into flowmind's own learned
 * bindings. Flowmind-side data (records, rules, preferredResourceBindings)
 * is never removed or overwritten; re-running the import is idempotent.
 */
function mergeSkillBindingCollections(existing = {}, incoming = {}) {
  const merged = { ...existing };

  for (const [skillName, incomingBinding] of Object.entries(incoming || {})) {
    if (!isObject(incomingBinding)) continue;

    const existingBinding = isObject(merged[skillName])
      ? merged[skillName]
      : { learningCount: 0, records: [], rules: [] };

    const records = mergeUniqueByKey(
      [...(existingBinding.records || []), ...(incomingBinding.records || [])],
      'recordId'
    );
    const rules = mergeUniqueJson([...(existingBinding.rules || []), ...(incomingBinding.rules || [])]);

    merged[skillName] = {
      ...existingBinding,
      records,
      rules,
      learningCount: Math.max(
        Number(existingBinding.learningCount) || 0,
        Number(incomingBinding.learningCount) || 0,
        records.length
      ),
      lastLearning: latestIsoTimestamp(existingBinding.lastLearning, incomingBinding.lastLearning)
    };
  }

  return merged;
}

async function collectLearningRecordFiles(sourceDir) {
  const recordsDir = path.join(sourceDir, 'learning', 'records');
  if (!(await fs.pathExists(recordsDir))) return [];
  const entries = await fs.readdir(recordsDir).catch(() => []);
  return entries
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(recordsDir, name))
    .sort();
}

/**
 * Copy sdd-agent analysis deposit documents (learning/records/*.md plus the
 * index) into flowmind's source material directory so `flowmind analyze` and
 * learning assets can reference them.
 */
async function copyLearningRecordFiles(sourceDir, targetSourceDir) {
  const files = await collectLearningRecordFiles(sourceDir);
  const copied = [];
  if (files.length === 0) return copied;

  const targetRecordsDir = path.join(targetSourceDir, 'sdd-records');
  await fs.ensureDir(targetRecordsDir);

  for (const filePath of files) {
    const targetPath = path.join(targetRecordsDir, path.basename(filePath));
    await fs.copy(filePath, targetPath, { overwrite: true, dereference: true });
    copied.push(targetPath);
  }

  const indexPath = path.join(sourceDir, 'learning', 'learning-index.md');
  if (await fs.pathExists(indexPath)) {
    await fs.copy(indexPath, path.join(targetRecordsDir, 'learning-index.md'), {
      overwrite: true,
      dereference: true
    });
  }

  return copied;
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await fs.pathExists(filePath))) return fallback;
  return fs.readJson(filePath);
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    return null;
  }
}

async function copySelectedSourceFiles(sourceDir, targetDir) {
  const sourceRoot = path.join(sourceDir, 'source');
  const copied = [];

  if (!(await fs.pathExists(sourceRoot))) {
    return copied;
  }

  await fs.ensureDir(targetDir);

  for (const fileName of SDD_SOURCE_SYNC_FILES) {
    const sourcePath = path.join(sourceRoot, fileName);
    if (!(await fs.pathExists(sourcePath))) {
      continue;
    }

    const targetPath = path.join(targetDir, fileName);
    await fs.copy(sourcePath, targetPath, { overwrite: true, dereference: true });
    copied.push({
      name: fileName,
      sourcePath,
      targetPath
    });
  }

  return copied;
}

async function buildSyncSignature(sourceDir) {
  const trackedFiles = [
    path.join(sourceDir, 'resource-config.json'),
    path.join(sourceDir, 'learning', 'scene-mappings.json'),
    path.join(sourceDir, 'learning', 'skill-bindings.json'),
    path.join(sourceDir, 'learning', 'learning-index.md'),
    ...SDD_SOURCE_SYNC_FILES.map((fileName) => path.join(sourceDir, 'source', fileName)),
    ...(await collectLearningRecordFiles(sourceDir))
  ];

  const entries = [];
  for (const filePath of trackedFiles) {
    const stat = await statIfExists(filePath);
    if (!stat) continue;
    entries.push({
      path: filePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return JSON.stringify(entries);
}

async function autoSyncSddAgentToFlowMind(options = {}) {
  if (process.env.FLOWMIND_DISABLE_SDD_AGENT_AUTO_SYNC === '1') {
    return { synced: false, skipped: true, reason: 'disabled' };
  }

  if (options.force !== true && process.env.FLOWMIND_ENABLE_SDD_AGENT_AUTO_SYNC !== '1') {
    return { synced: false, skipped: true, reason: 'not-enabled' };
  }

  const sourceDir = options.sourceDir || path.join(os.homedir(), '.sdd-agent');
  const targetHome = options.targetHome || getHomeDir();
  const sourceConfigPath = path.join(sourceDir, 'resource-config.json');

  if (!(await fs.pathExists(sourceConfigPath))) {
    return { synced: false, skipped: true, reason: 'missing-source-config' };
  }

  const targetDir = path.join(targetHome, '.flowmind');
  const statePath = path.join(targetDir, 'sdd-agent-sync-state.json');
  const signature = await buildSyncSignature(sourceDir);
  const previousState = await readJsonIfExists(statePath, null);

  if (previousState?.signature === signature) {
    return {
      synced: false,
      skipped: true,
      reason: 'up-to-date',
      sourceDir,
      targetDir,
      statePath
    };
  }

  const summary = await syncSddAgentToFlowMind({
    ...options,
    sourceDir,
    targetHome
  });

  await fs.ensureDir(targetDir);
  await fs.writeJson(statePath, {
    sourceDir,
    targetDir,
    signature,
    syncedAt: new Date().toISOString(),
    files: summary.files,
    counts: summary.counts
  }, { spaces: 2 });

  return {
    synced: true,
    skipped: false,
    statePath,
    ...summary
  };
}

async function syncSddAgentToFlowMind(options = {}) {
  const sourceDir = options.sourceDir || path.join(os.homedir(), '.sdd-agent');
  const targetHome = options.targetHome || getHomeDir();
  const sourceConfigPath = path.join(sourceDir, 'resource-config.json');
  const sourceScenesPath = path.join(sourceDir, 'learning', 'scene-mappings.json');
  const sourceSkillBindingsPath = path.join(sourceDir, 'learning', 'skill-bindings.json');
  const targetDir = path.join(targetHome, '.flowmind');
  const targetLearningDir = path.join(targetDir, 'learning');

  if (!(await fs.pathExists(sourceConfigPath))) {
    throw new Error(`SDD-Agent resource config not found: ${sourceConfigPath}`);
  }

  const sddConfig = await fs.readJson(sourceConfigPath);
  const sddScenes = await readJsonIfExists(sourceScenesPath, { mappings: [] });
  const sddSkillBindings = await readJsonIfExists(sourceSkillBindingsPath, { version: '1.0', bindings: {} });
  sddConfig.skillBindings = sddSkillBindings;
  const workflowTransport = await discoverWorkflowTransport(options);
  if (workflowTransport) {
    sddConfig.mcpServers = {
      ...(sddConfig.mcpServers || {}),
      'auto-flow': workflowTransport
    };
  }

  const targetResourceConfigPath = path.join(targetDir, 'resource-config.json');
  const targetComponentConfigPath = path.join(targetDir, 'component-config.json');
  const targetBindingsPath = path.join(targetLearningDir, 'resource-bindings.json');
  const targetScenesPath = path.join(targetLearningDir, 'scenes.json');
  const targetSkillBindingsPath = path.join(targetLearningDir, 'skill-bindings.json');
  const targetSourceDir = path.join(targetDir, 'source');

  const existingResourceConfig = await readJsonIfExists(targetResourceConfigPath, {});
  const existingComponentConfig = await readJsonIfExists(targetComponentConfigPath, { version: '1.0.0', components: {} });
  const existingBindings = await readJsonIfExists(targetBindingsPath, { version: '1.0', bindings: [] });
  const existingScenes = await readJsonIfExists(targetScenesPath, { version: '1.0', mappings: [] });
  const existingSkillBindings = await readJsonIfExists(targetSkillBindingsPath, { version: '1.0', bindings: {} });

  const nextResourceConfig = deepMerge(existingResourceConfig, sanitizeResourceConfig(sddConfig, sddSkillBindings));
  const nextComponentConfig = deepMerge(existingComponentConfig, buildComponentConfig(sddConfig, sddSkillBindings, workflowTransport));
  const importedBindings = convertResourceBindings(sddConfig, sddSkillBindings, workflowTransport);
  const nextBindings = {
    version: existingBindings.version || '1.0',
    lastUpdated: new Date().toISOString(),
    bindings: mergeBindings(existingBindings.bindings || [], importedBindings)
  };
  const importedScenes = convertSceneMappings(sddScenes);
  const nextScenes = {
    version: existingScenes.version || '1.0',
    lastUpdated: new Date().toISOString(),
    mappings: mergeScenes(existingScenes.mappings || [], importedScenes)
  };

  const convertedSkillBindings = convertSkillBindings(sddSkillBindings);
  const nextSkillBindings = {
    version: existingSkillBindings.version || '1.0',
    lastUpdated: new Date().toISOString(),
    bindings: mergeSkillBindingCollections(
      isObject(existingSkillBindings.bindings) ? existingSkillBindings.bindings : {},
      convertedSkillBindings.bindings
    ),
    routes: Array.isArray(existingSkillBindings.routes) ? existingSkillBindings.routes : []
  };

  await fs.ensureDir(targetLearningDir);
  await fs.writeJson(targetResourceConfigPath, nextResourceConfig, { spaces: 2 });
  await fs.writeJson(targetComponentConfigPath, nextComponentConfig, { spaces: 2 });
  await fs.writeJson(targetBindingsPath, nextBindings, { spaces: 2 });
  await fs.writeJson(targetScenesPath, nextScenes, { spaces: 2 });
  await fs.writeJson(targetSkillBindingsPath, nextSkillBindings, { spaces: 2 });
  const copiedSourceFiles = await copySelectedSourceFiles(sourceDir, targetSourceDir);
  const copiedLearningRecords = await copyLearningRecordFiles(sourceDir, targetSourceDir);

  return {
    sourceDir,
    targetDir,
    files: {
      resourceConfig: targetResourceConfigPath,
      componentConfig: targetComponentConfigPath,
      resourceBindings: targetBindingsPath,
      scenes: targetScenesPath,
      skillBindings: targetSkillBindingsPath,
      sourceFiles: copiedSourceFiles.map((item) => item.targetPath),
      learningRecords: copiedLearningRecords
    },
    counts: {
      importedBindings: importedBindings.length,
      totalBindings: nextBindings.bindings.length,
      importedScenes: importedScenes.length,
      totalScenes: nextScenes.mappings.length,
      importedSkillRecords: convertedSkillBindings.importedSkillRecords,
      importedSkillRules: convertedSkillBindings.importedSkillRules,
      importedGlobalRules: convertedSkillBindings.importedGlobalRules,
      totalSkills: Object.keys(nextSkillBindings.bindings || {}).length,
      components: Object.keys(nextComponentConfig.components || {}).length,
      copiedSourceFiles: copiedSourceFiles.length,
      copiedLearningRecords: copiedLearningRecords.length
    }
  };
}

function toSddRecordSummary(record = {}) {
  return record.summary || record.input || record.application?.action || record.type || record.id;
}

function toSddRule(record = {}) {
  const application = record.application || {};
  return {
    condition: application.condition || record.condition || record.input || `When ${record.skill || 'flowmind'} is used`,
    action: application.action || record.action || toSddRecordSummary(record),
    source: record.id || record.recordId || 'flowmind'
  };
}

function convertFlowMindSkillBindingsForSdd(flowmindSkillBindings = {}, recordsBySkill = {}) {
  const next = {
    version: flowmindSkillBindings.version || '1.0',
    lastUpdated: new Date().toISOString(),
    bindings: {},
    globalRules: [],
    routes: Array.isArray(flowmindSkillBindings.routes) ? flowmindSkillBindings.routes : []
  };

  for (const [skillName, binding] of Object.entries(flowmindSkillBindings.bindings || {})) {
    if (!isObject(binding)) continue;
    const records = (binding.records || []).filter(isObject);
    const rules = (binding.rules || []).filter(isObject);
    next.bindings[skillName] = {
      learningCount: Math.max(Number(binding.learningCount) || 0, records.length, (recordsBySkill[skillName] || []).length),
      lastLearning: binding.lastLearning || null,
      records,
      rules,
      preferredResourceBindings: binding.preferredResourceBindings || undefined,
      metadata: {
        ...(binding.metadata || {}),
        syncedFrom: 'flowmind'
      }
    };
  }

  for (const [skillName, records] of Object.entries(recordsBySkill || {})) {
    if (!Array.isArray(records) || records.length === 0) continue;
    const binding = next.bindings[skillName] || {
      learningCount: 0,
      lastLearning: null,
      records: [],
      rules: [],
      metadata: { syncedFrom: 'flowmind' }
    };
    const existingRecordIds = new Set((binding.records || []).map((item) => item.recordId || item.id).filter(Boolean));
    const existingRuleKeys = new Set((binding.rules || []).map((item) => JSON.stringify(item || {})));

    for (const record of records) {
      if (!record?.id || existingRecordIds.has(record.id)) continue;
      binding.records.push({
        recordId: record.id,
        type: record.type || 'flowmind_learning',
        summary: toSddRecordSummary(record),
        priority: record.application?.priority || record.priority || 'medium'
      });
      const rule = toSddRule(record);
      const ruleKey = JSON.stringify(rule);
      if (!existingRuleKeys.has(ruleKey)) {
        binding.rules.push(rule);
        existingRuleKeys.add(ruleKey);
      }
      existingRecordIds.add(record.id);
      binding.lastLearning = latestIsoTimestamp(binding.lastLearning, record.timestamp);
    }

    binding.learningCount = Math.max(Number(binding.learningCount) || 0, binding.records.length);
    next.bindings[skillName] = binding;
  }

  const globalBinding = next.bindings._global;
  if (globalBinding?.rules?.length) {
    next.globalRules = globalBinding.rules.map((rule) => ({
      pattern: rule.condition || rule.pattern || null,
      action: rule.action || null,
      source: rule.source || 'flowmind-global'
    })).filter((rule) => rule.pattern || rule.action);
  }

  return next;
}

function convertFlowMindScenesForSdd(flowmindScenes = {}) {
  return {
    version: flowmindScenes.version || '1.0',
    lastUpdated: new Date().toISOString(),
    mappings: (flowmindScenes.mappings || []).map((scene) => ({
      id: String(scene.id || '').startsWith('sdd-') ? String(scene.id).slice(4) : scene.id,
      sceneName: scene.name || scene.sceneName || 'FlowMind Scene',
      keywords: scene.keywords || [],
      patterns: scene.patterns || [],
      skillSequence: (scene.workflow?.skills || []).map((step) => ({
        skill: step.skill,
        action: step.params?.action,
        params: step.params || {}
      })),
      userPreference: scene.preferences || {},
      useCount: scene.stats?.useCount || 0,
      lastUsed: scene.stats?.lastUsed || null,
      confidence: scene.stats?.successRate || 1.0,
      metadata: {
        ...(scene.metadata || {}),
        syncedFrom: 'flowmind'
      }
    }))
  };
}

function mergeSddSkillBindings(existing = {}, incoming = {}) {
  const merged = {
    version: existing.version || incoming.version || '1.0',
    lastUpdated: new Date().toISOString(),
    bindings: { ...(existing.bindings || {}) },
    globalRules: mergeUniqueJson([...(existing.globalRules || []), ...(incoming.globalRules || [])]),
    routes: mergeUniqueByKey([...(existing.routes || []), ...(incoming.routes || [])], 'id')
  };

  for (const [skillName, incomingBinding] of Object.entries(incoming.bindings || {})) {
    const current = merged.bindings[skillName] || { learningCount: 0, records: [], rules: [] };
    const records = mergeUniqueByKey([...(current.records || []), ...(incomingBinding.records || [])], 'recordId');
    const rules = mergeUniqueJson([...(current.rules || []), ...(incomingBinding.rules || [])]);
    merged.bindings[skillName] = {
      ...current,
      ...incomingBinding,
      records,
      rules,
      learningCount: Math.max(Number(current.learningCount) || 0, Number(incomingBinding.learningCount) || 0, records.length),
      lastLearning: latestIsoTimestamp(current.lastLearning, incomingBinding.lastLearning),
      preferredResourceBindings: {
        ...(current.preferredResourceBindings || {}),
        ...(incomingBinding.preferredResourceBindings || {})
      },
      metadata: {
        ...(current.metadata || {}),
        ...(incomingBinding.metadata || {})
      }
    };
  }

  return merged;
}

function mergeSddSceneMappings(existing = {}, incoming = {}) {
  return {
    version: existing.version || incoming.version || '1.0',
    lastUpdated: new Date().toISOString(),
    mappings: mergeScenes(existing.mappings || [], incoming.mappings || [])
  };
}

async function collectFlowMindRecords(flowmindLearningDir) {
  const recordsRoot = path.join(flowmindLearningDir, 'records');
  const records = {};
  if (!(await fs.pathExists(recordsRoot))) return records;

  const skillDirs = await fs.readdir(recordsRoot);
  for (const skill of skillDirs) {
    const skillPath = path.join(recordsRoot, skill);
    const stat = await fs.stat(skillPath).catch(() => null);
    if (!stat?.isDirectory()) continue;
    const files = await fs.readdir(skillPath);
    for (const file of files) {
      if (!file.endsWith('.json') || file === 'preferences.json') continue;
      const record = await fs.readJson(path.join(skillPath, file)).catch(() => null);
      if (!record?.id) continue;
      records[skill] = records[skill] || [];
      records[skill].push(record);
    }
  }
  return records;
}

function buildSddLearningMarkdown(record, skill) {
  const rule = toSddRule(record);
  return [
    '# Learning Record',
    '',
    '## Metadata',
    `- **ID**: ${record.id}`,
    `- **Timestamp**: ${record.timestamp || new Date().toISOString()}`,
    `- **Skill**: ${record.skill || skill}`,
    `- **Type**: ${record.type || 'flowmind_learning'}`,
    `- **Severity**: ${record.severity || 'minor'}`,
    '- **Status**: active',
    '',
    '## Context',
    `- **User Request**: ${record.input || ''}`,
    '- **Execution Context**: Synced from FlowMind learning runtime',
    `- **Trigger**: ${record.trigger || record.source || 'flowmind'}`,
    '',
    '## Correction Details',
    '',
    '### Corrected Approach (Accurate)',
    '```',
    rule.action || '',
    '```',
    '',
    '## Application Rules',
    `- **Condition**: ${rule.condition}`,
    `- **Action**: ${rule.action}`,
    `- **Priority**: ${record.application?.priority || record.priority || 'medium'}`,
    '',
    '## Skill Binding',
    `- **Primary Skill**: ${record.skill || skill}`,
    '- **Binding Strength**: normal',
    '',
    '## Tags',
    ['flowmind-sync', record.type, record.skill || skill].filter(Boolean).join(', '),
    ''
  ].join('\n');
}

async function writeSddLearningRecordMarkdown(recordsBySkill, targetDir) {
  const recordsDir = path.join(targetDir, 'learning', 'records');
  await fs.ensureDir(recordsDir);
  const written = [];

  for (const [skill, records] of Object.entries(recordsBySkill || {})) {
    for (const record of records || []) {
      if (!record?.id) continue;
      const safeSkill = String(skill || record.skill || 'global').replace(/[^a-zA-Z0-9_.-]+/g, '-');
      const safeId = String(record.id).replace(/[^a-zA-Z0-9_.-]+/g, '-');
      const filePath = path.join(recordsDir, `${safeSkill}-${safeId}.md`);
      if (await fs.pathExists(filePath)) continue;
      await fs.writeFile(filePath, buildSddLearningMarkdown(record, skill), 'utf8');
      written.push(filePath);
    }
  }

  return written;
}

async function syncFlowMindToSddAgent(options = {}) {
  const sourceHome = options.sourceHome || getHomeDir();
  const sourceDir = path.join(sourceHome, '.flowmind');
  const sourceLearningDir = path.join(sourceDir, 'learning');
  const targetDir = options.targetDir || path.join(os.homedir(), '.sdd-agent');

  const sourceSkillBindingsPath = path.join(sourceLearningDir, 'skill-bindings.json');
  if (!(await fs.pathExists(sourceSkillBindingsPath))) {
    throw new Error(`FlowMind skill bindings not found: ${sourceSkillBindingsPath}`);
  }

  const sourceResourceBindingsPath = path.join(sourceLearningDir, 'resource-bindings.json');
  const sourceScenesPath = path.join(sourceLearningDir, 'scenes.json');
  const targetLearningDir = path.join(targetDir, 'learning');
  await fs.ensureDir(targetLearningDir);

  const flowmindSkillBindings = await readJsonIfExists(sourceSkillBindingsPath, { version: '1.0', bindings: {}, routes: [] });
  const flowmindResourceBindings = await readJsonIfExists(sourceResourceBindingsPath, { version: '1.0', bindings: [] });
  const flowmindScenes = await readJsonIfExists(sourceScenesPath, { version: '1.0', mappings: [] });
  const flowmindRecords = await collectFlowMindRecords(sourceLearningDir);

  const targetSkillBindingsPath = path.join(targetLearningDir, 'skill-bindings.json');
  const targetResourceBindingsPath = path.join(targetLearningDir, 'resource-bindings.json');
  const targetScenesPath = path.join(targetLearningDir, 'scene-mappings.json');

  const existingSkillBindings = await readJsonIfExists(targetSkillBindingsPath, { version: '1.0', bindings: {}, globalRules: [] });
  const existingResourceBindings = await readJsonIfExists(targetResourceBindingsPath, { version: '1.0', bindings: [] });
  const existingScenes = await readJsonIfExists(targetScenesPath, { version: '1.0', mappings: [] });

  const incomingSkillBindings = convertFlowMindSkillBindingsForSdd(flowmindSkillBindings, flowmindRecords);
  const nextSkillBindings = mergeSddSkillBindings(existingSkillBindings, incomingSkillBindings);
  const nextResourceBindings = {
    version: existingResourceBindings.version || '1.0',
    lastUpdated: new Date().toISOString(),
    bindings: mergeBindings(existingResourceBindings.bindings || [], flowmindResourceBindings.bindings || [])
  };
  const nextScenes = mergeSddSceneMappings(existingScenes, convertFlowMindScenesForSdd(flowmindScenes));
  const writtenRecords = await writeSddLearningRecordMarkdown(flowmindRecords, targetDir);

  await fs.writeJson(targetSkillBindingsPath, nextSkillBindings, { spaces: 2 });
  await fs.writeJson(targetResourceBindingsPath, nextResourceBindings, { spaces: 2 });
  await fs.writeJson(targetScenesPath, nextScenes, { spaces: 2 });

  return {
    sourceDir,
    targetDir,
    files: {
      skillBindings: targetSkillBindingsPath,
      resourceBindings: targetResourceBindingsPath,
      scenes: targetScenesPath,
      learningRecords: writtenRecords
    },
    counts: {
      exportedSkills: Object.keys(incomingSkillBindings.bindings || {}).length,
      exportedRoutes: incomingSkillBindings.routes.length,
      exportedResourceBindings: (flowmindResourceBindings.bindings || []).length,
      exportedScenes: (flowmindScenes.mappings || []).length,
      exportedLearningRecords: Object.values(flowmindRecords).reduce((sum, records) => sum + records.length, 0),
      writtenLearningRecords: writtenRecords.length
    }
  };
}

async function syncSharedLearning(options = {}) {
  const importSummary = await syncSddAgentToFlowMind({
    sourceDir: options.sddDir,
    targetHome: options.flowmindHome,
    workflowTransport: options.workflowTransport
  });
  const exportSummary = await syncFlowMindToSddAgent({
    sourceHome: options.flowmindHome,
    targetDir: options.sddDir
  });

  return {
    sourceDir: importSummary.sourceDir,
    targetDir: importSummary.targetDir,
    importSummary,
    exportSummary,
    counts: {
      ...importSummary.counts,
      exportedSkills: exportSummary.counts.exportedSkills,
      exportedRoutes: exportSummary.counts.exportedRoutes,
      exportedResourceBindings: exportSummary.counts.exportedResourceBindings,
      exportedScenes: exportSummary.counts.exportedScenes,
      exportedLearningRecords: exportSummary.counts.exportedLearningRecords
    },
    files: {
      ...importSummary.files,
      sddSkillBindings: exportSummary.files.skillBindings,
      sddResourceBindings: exportSummary.files.resourceBindings,
      sddScenes: exportSummary.files.scenes
    }
  };
}

module.exports = {
  buildAliasIndex,
  buildComponentConfig,
  convertResourceBindings,
  convertSceneMappings,
  convertSkillBindings,
  deepMerge,
  mergeBindings,
  mergeScenes,
  mergeSkillBindingCollections,
  buildWorkflowBindings,
  buildWorkflowResource,
  normalizeMcpServer,
  sanitizeResourceConfig,
  syncSddAgentToFlowMind,
  autoSyncSddAgentToFlowMind,
  syncFlowMindToSddAgent,
  syncSharedLearning
};
