const fs = require('fs-extra');
const os = require('os');
const path = require('path');

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
  workflow: { componentType: 'workflow', provider: 'friday-flow' },
  report: { componentType: 'report', provider: 'friday-report' }
});

function getHomeDir() {
  return process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE || os.homedir();
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
    mcpServer: 'friday-auto-flow',
    bindings: {
      'auto-flow': {
        name: '自动部署',
        skill: 'auto-flow',
        provider: 'friday-flow',
        mcpServer: 'friday-auto-flow',
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
      const match = content.match(/MCP server "friday-auto-flow": HTTP transport options: (\{[^\n]+\})/);
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
    provider: 'friday-flow',
    mcpServer: 'friday-auto-flow',
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
      default: 'friday-flow',
      providers: {
        'friday-flow': {
          enabled: true,
          mcpServer: normalizeMcpServer(workflowResource.mcpServer),
          ...(workflowTransport ? { transport: workflowTransport } : {})
        }
      }
    };
  }

  if (resources.report?.enabled && resources.report.mcpServer) {
    components.report = {
      default: 'friday-report',
      providers: {
        'friday-report': {
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
    ...SDD_SOURCE_SYNC_FILES.map((fileName) => path.join(sourceDir, 'source', fileName))
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
      'friday-auto-flow': workflowTransport
    };
  }

  const targetResourceConfigPath = path.join(targetDir, 'resource-config.json');
  const targetComponentConfigPath = path.join(targetDir, 'component-config.json');
  const targetBindingsPath = path.join(targetLearningDir, 'resource-bindings.json');
  const targetScenesPath = path.join(targetLearningDir, 'scenes.json');
  const targetSourceDir = path.join(targetDir, 'source');

  const existingResourceConfig = await readJsonIfExists(targetResourceConfigPath, {});
  const existingComponentConfig = await readJsonIfExists(targetComponentConfigPath, { version: '1.0.0', components: {} });
  const existingBindings = await readJsonIfExists(targetBindingsPath, { version: '1.0', bindings: [] });
  const existingScenes = await readJsonIfExists(targetScenesPath, { version: '1.0', mappings: [] });

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

  await fs.ensureDir(targetLearningDir);
  await fs.writeJson(targetResourceConfigPath, nextResourceConfig, { spaces: 2 });
  await fs.writeJson(targetComponentConfigPath, nextComponentConfig, { spaces: 2 });
  await fs.writeJson(targetBindingsPath, nextBindings, { spaces: 2 });
  await fs.writeJson(targetScenesPath, nextScenes, { spaces: 2 });
  const copiedSourceFiles = await copySelectedSourceFiles(sourceDir, targetSourceDir);

  return {
    sourceDir,
    targetDir,
    files: {
      resourceConfig: targetResourceConfigPath,
      componentConfig: targetComponentConfigPath,
      resourceBindings: targetBindingsPath,
      scenes: targetScenesPath,
      sourceFiles: copiedSourceFiles.map((item) => item.targetPath)
    },
    counts: {
      importedBindings: importedBindings.length,
      totalBindings: nextBindings.bindings.length,
      importedScenes: importedScenes.length,
      totalScenes: nextScenes.mappings.length,
      components: Object.keys(nextComponentConfig.components || {}).length,
      copiedSourceFiles: copiedSourceFiles.length
    }
  };
}

module.exports = {
  buildAliasIndex,
  buildComponentConfig,
  convertResourceBindings,
  convertSceneMappings,
  deepMerge,
  mergeBindings,
  mergeScenes,
  buildWorkflowBindings,
  buildWorkflowResource,
  normalizeMcpServer,
  sanitizeResourceConfig,
  syncSddAgentToFlowMind,
  autoSyncSddAgentToFlowMind
};
