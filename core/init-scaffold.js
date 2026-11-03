const path = require('path');
const fs = require('fs-extra');

const AI_PROVIDER_META = Object.freeze({
  openai: {
    label: 'OpenAI',
    apiKeyLabel: 'OpenAI API key',
    modelLabel: 'OpenAI model',
    baseUrlLabel: 'OpenAI base URL',
    defaultModel: 'gpt-4.1-mini',
    defaultBaseUrl: 'https://api.openai.com/v1',
    recommended: true
  },
  anthropic: {
    label: 'Anthropic',
    apiKeyLabel: 'Anthropic API key',
    modelLabel: 'Anthropic model',
    baseUrlLabel: 'Anthropic base URL',
    defaultModel: 'claude-sonnet-4-20250514',
    defaultBaseUrl: 'https://api.anthropic.com'
  },
  glm: {
    label: 'Zhipu AI',
    apiKeyLabel: 'Zhipu AI API key',
    modelLabel: 'GLM model',
    baseUrlLabel: 'Zhipu API base URL',
    defaultModel: 'glm-4.5',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4'
  },
  mimo: {
    label: 'MiMo',
    apiKeyLabel: 'MiMo API key',
    modelLabel: 'MiMo model',
    baseUrlLabel: 'MiMo base URL',
    defaultModel: 'mimo-1.0',
    defaultBaseUrl: 'https://api.mimo.ai/v1'
  },
  qwen: {
    label: 'DashScope',
    apiKeyLabel: 'DashScope API key',
    modelLabel: 'Qwen model',
    baseUrlLabel: 'DashScope base URL',
    defaultModel: 'qwen-plus',
    defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  ernie: {
    label: 'Baidu ERNIE',
    apiKeyLabel: 'Baidu API key',
    modelLabel: 'ERNIE model',
    baseUrlLabel: 'Baidu API base URL',
    defaultModel: 'ernie-4.0-turbo-8k',
    defaultBaseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop'
  },
  deepseek: {
    label: 'DeepSeek',
    apiKeyLabel: 'DeepSeek API key',
    modelLabel: 'DeepSeek model',
    baseUrlLabel: 'DeepSeek base URL',
    defaultModel: 'deepseek-chat',
    defaultBaseUrl: 'https://api.deepseek.com/v1'
  },
  ollama: {
    label: 'Ollama',
    apiKeyLabel: 'Ollama token',
    modelLabel: 'Ollama model',
    baseUrlLabel: 'Ollama base URL',
    defaultModel: 'llama3.1',
    defaultBaseUrl: 'http://127.0.0.1:11434'
  }
});

const RESOURCE_META = Object.freeze({
  sls: {
    label: 'Logs',
    resourceKey: 'sls',
    componentKey: 'logService',
    provider: 'aliyun-sls',
    mcpServer: 'sls-logs'
  },
  database: {
    label: 'Database',
    resourceKey: 'database',
    componentKey: 'databaseManager',
    provider: 'aliyun-dms',
    mcpServer: 'aliyun-dms-mcp-server'
  },
  redis: {
    label: 'Redis',
    resourceKey: 'redis',
    componentKey: 'redisMonitor',
    provider: 'aliyun-redis',
    mcpServer: 'redis-monitor'
  },
  yapi: {
    label: 'API Docs',
    resourceKey: 'yapi',
    componentKey: 'apiDoc',
    provider: 'yapi',
    mcpServer: 'yapi-mcp'
  },
  yuque: {
    label: 'Knowledge Base',
    resourceKey: 'yuque',
    componentKey: 'knowledgeBase',
    provider: 'yuque',
    mcpServer: 'yuque-mcp'
  },
  workflow: {
    label: 'Workflow',
    resourceKey: 'workflow',
    componentKey: 'workflow',
    provider: 'auto-flow',
    mcpServer: 'auto-flow'
  },
  report: {
    label: 'Report',
    resourceKey: 'report',
    componentKey: 'report',
    provider: 'auto-report',
    mcpServer: 'auto-report'
  },
  governance: {
    label: 'Service Governance',
    resourceKey: 'governance',
    componentKey: 'serviceGovernance',
    provider: 'aliyun-mse',
    mcpServer: 'aliyun-mse-mcp'
  }
});

const RESOURCE_CHOICES = Object.freeze([
  { name: 'Logs / SLS', value: 'sls', checked: true },
  { name: 'Database', value: 'database', checked: true },
  { name: 'Redis', value: 'redis', checked: true },
  { name: 'API Docs / YApi', value: 'yapi', checked: true },
  { name: 'Knowledge Base / Yuque', value: 'yuque', checked: false },
  { name: 'Workflow / Auto Flow', value: 'workflow', checked: false },
  { name: 'Report / Auto Report', value: 'report', checked: false },
  { name: 'Service Governance', value: 'governance', checked: false }
]);

const RESOURCE_KEY_BY_COMPONENT = Object.freeze(
  Object.values(RESOURCE_META).reduce((acc, meta) => {
    acc[meta.componentKey] = meta.resourceKey;
    acc[meta.resourceKey] = meta.resourceKey;
    return acc;
  }, {})
);

const SKILL_CATEGORY_LABELS = Object.freeze({
  quality: 'Quality',
  documentation: 'Documentation',
  workflow: 'Workflow',
  automation: 'Automation',
  monitoring: 'Monitoring',
  operations: 'Operations',
  analysis: 'Analysis',
  infrastructure: 'Infrastructure',
  core: 'Core'
});

const SKILL_CATEGORY_ORDER = [
  'quality',
  'documentation',
  'workflow',
  'automation',
  'monitoring',
  'operations',
  'analysis',
  'infrastructure',
  'core'
];

const AI_MODEL_CHOICES = Object.freeze({
  openai: [
    { name: 'gpt-4.1-mini', value: 'gpt-4.1-mini' },
    { name: 'gpt-4.1', value: 'gpt-4.1' },
    { name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  anthropic: [
    { name: 'claude-3-5-sonnet-latest', value: 'claude-3-5-sonnet-latest' },
    { name: 'claude-3-5-haiku-latest', value: 'claude-3-5-haiku-latest' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  glm: [
    { name: 'glm-4.5', value: 'glm-4.5' },
    { name: 'glm-4.1', value: 'glm-4.1' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  mimo: [
    { name: 'mimo-1.0', value: 'mimo-1.0' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  qwen: [
    { name: 'qwen-plus', value: 'qwen-plus' },
    { name: 'qwen-max', value: 'qwen-max' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  ernie: [
    { name: 'ernie-4.0', value: 'ernie-4.0' },
    { name: 'ernie-4.0-turbo', value: 'ernie-4.0-turbo' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  deepseek: [
    { name: 'deepseek-chat', value: 'deepseek-chat' },
    { name: 'deepseek-reasoner', value: 'deepseek-reasoner' },
    { name: 'Custom model...', value: '__custom__' }
  ],
  ollama: [
    { name: 'llama3.1', value: 'llama3.1' },
    { name: 'qwen2.5', value: 'qwen2.5' },
    { name: 'Custom model...', value: '__custom__' }
  ]
});

const SKILL_CONFIG_DEFAULTS = Object.freeze({
  'log-audit': {
    defaultFormat: 'sequential-list',
    excludeInfrastructure: true
  },
  'sls-log-audit': {
    defaultFormat: 'sequential-list',
    excludeInfrastructure: true
  },
  'code-review': {
    security: {
      enabled: true,
      severity: ['HIGH', 'MEDIUM', 'LOW']
    },
    quality: {
      enabled: true
    },
    style: {
      enabled: true
    }
  },
  'project-review': {
    checks: {
      dependencies: true,
      security: true,
      quality: true,
      documentation: true
    },
    thresholds: {
      coverage: 80,
      complexity: 10
    }
  },
  'archive-change': {
    location: 'archive/changes',
    keepTests: true,
    keepArtifacts: true,
    generateSummary: true,
    updateChangelog: true
  },
  'auto-flow': {
    workflows: {
      path: './workflows',
      autoDiscover: true
    },
    execution: {
      parallel: true,
      maxConcurrent: 4,
      timeout: 3600
    },
    notifications: {
      onComplete: true,
      onError: true
    }
  },
  'api-sync': {
    platform: 'yapi',
    connection: {
      host: '',
      projectId: '',
      token: ''
    },
    options: {
      autoSync: true,
      generateDocs: true,
      validateSchema: true
    }
  },
  'data-logic-validation': {
    database: {
      maxRows: 100
    },
    redis: {
      scanCount: 100
    },
    validation: {
      checkIntegrity: true,
      checkConsistency: true,
      checkPerformance: true
    }
  },
  'yapi-sync-interface': {
    defaultProjectId: '',
    syncMode: 'merge',
    autoCreateCategory: true,
    excludePatterns: []
  },
  'yuque-sync-design': {
    defaultRepo: '',
    syncFormat: 'markdown',
    autoCreateToc: true,
    archiveAfterSync: true
  }
});

function getSetupChoices(defaultAiSelected = false) {
  return [
    { name: 'AI model', value: 'ai', checked: defaultAiSelected },
    { name: 'MCP configuration', value: 'mcp', checked: false }
  ];
}

function getAiProviderChoices() {
  return Object.keys(AI_PROVIDER_META).map((value) => ({
    name: `${AI_PROVIDER_META[value].label}${AI_PROVIDER_META[value].recommended ? ' (recommended)' : ''} (${AI_PROVIDER_META[value].defaultModel})`,
    value
  }));
}

function getAiModelChoices(provider) {
  const choices = AI_MODEL_CHOICES[provider]
    ? AI_MODEL_CHOICES[provider].slice()
    : [
        { name: 'Default model', value: defaultModelForProvider(provider) || '__custom__' },
        { name: 'Custom model...', value: '__custom__' }
      ];

  return choices.map((choice, index) => {
    if (choice.value === '__custom__') {
      return { ...choice, name: 'Custom model...' };
    }

    const isDefault = index === 0 || choice.value === defaultModelForProvider(provider);
    return {
      ...choice,
      name: `${choice.name}${isDefault ? ' (default)' : ''}`
    };
  });
}

function defaultModelForProvider(provider) {
  const defaults = {
    openai: 'gpt-4.1-mini',
    anthropic: 'claude-3-5-sonnet-latest',
    glm: 'glm-4.5',
    mimo: 'mimo-1.0',
    qwen: 'qwen-plus',
    ernie: 'ernie-4.0',
    deepseek: 'deepseek-chat',
    ollama: 'llama3.1'
  };
  return defaults[provider] || '';
}

function getResourceChoices() {
  return RESOURCE_CHOICES.slice();
}

function parseSkillFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const definition = {};
  const lines = frontmatterMatch[1].split('\n');
  let currentListKey = null;
  let metadataKey = null;

  for (const line of lines) {
    const scalarMatch = line.match(/^(\w+):\s*(.+)$/);
    if (scalarMatch) {
      definition[scalarMatch[1]] = scalarMatch[2].replace(/^["']|["']$/g, '');
      currentListKey = null;
      metadataKey = null;
      continue;
    }

    const metadataMatch = line.match(/^metadata:\s*$/);
    if (metadataMatch) {
      definition.metadata = definition.metadata || {};
      metadataKey = 'metadata';
      currentListKey = null;
      continue;
    }

    const listKeyMatch = line.match(/^(\w+):\s*$/);
    if (listKeyMatch) {
      definition[listKeyMatch[1]] = [];
      currentListKey = listKeyMatch[1];
      metadataKey = null;
      continue;
    }

    const metadataScalarMatch = line.match(/^\s+(\w+):\s*(.+)$/);
    if (metadataScalarMatch && metadataKey === 'metadata') {
      definition.metadata[metadataScalarMatch[1]] = metadataScalarMatch[2].replace(/^["']|["']$/g, '');
      continue;
    }

    const listItemMatch = line.match(/^\s+-\s+(.+)$/);
    if (listItemMatch && currentListKey && Array.isArray(definition[currentListKey])) {
      definition[currentListKey].push(listItemMatch[1].replace(/^["']|["']$/g, ''));
    }
  }

  return definition;
}

function getMcpSkillCatalog() {
  const skillsDir = path.join(__dirname, '..', 'skills');
  const catalog = [];

  if (!fs.pathExistsSync(skillsDir)) {
    return catalog;
  }

  for (const entry of fs.readdirSync(skillsDir)) {
    const skillDir = path.join(skillsDir, entry);
    const skillMdPath = path.join(skillDir, 'SKILL.md');

    if (!fs.statSync(skillDir).isDirectory() || !fs.pathExistsSync(skillMdPath)) {
      continue;
    }

    const content = fs.readFileSync(skillMdPath, 'utf-8');
    const definition = parseSkillFrontmatter(content);
    const indexPath = path.join(skillDir, 'index.js');
    const implementation = fs.pathExistsSync(indexPath) ? require(indexPath) : {};
    const dependencies = Array.isArray(definition.componentDependencies)
      ? definition.componentDependencies
      : Array.isArray(implementation.componentDependencies)
        ? implementation.componentDependencies
        : [];
    const category =
      definition.metadata?.category || implementation.category || extractCategoryFromFrontmatter(content) || 'other';

    if (dependencies.length === 0) {
      continue;
    }

    catalog.push({
      skill: entry,
      label: definition.name || entry,
      description: definition.description || '',
      category,
      componentDependencies: dependencies
    });
  }

  return catalog.sort((a, b) => {
    const orderA = SKILL_CATEGORY_ORDER.indexOf(a.category);
    const orderB = SKILL_CATEGORY_ORDER.indexOf(b.category);
    if (orderA !== orderB) {
      return (
        (orderA === -1 ? SKILL_CATEGORY_ORDER.length : orderA) - (orderB === -1 ? SKILL_CATEGORY_ORDER.length : orderB)
      );
    }
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.label.localeCompare(b.label);
  });
}

function getMcpSkillChoices(defaultSelectedSkills = []) {
  const selected = new Set(defaultSelectedSkills);
  return getMcpSkillCatalog().map((skill) => ({
    name: `${skill.label}${skill.description ? ` - ${skill.description}` : ''}`,
    value: skill.skill,
    checked: selected.size > 0 ? selected.has(skill.skill) : true
  }));
}

function getMcpSkillChoicesGrouped(defaultSelectedSkills = []) {
  const selected = new Set(defaultSelectedSkills);
  const catalog = getMcpSkillCatalog();
  const grouped = [];
  const seenCategories = new Set();

  for (const category of SKILL_CATEGORY_ORDER) {
    const skills = catalog.filter((skill) => skill.category === category);
    if (skills.length === 0) continue;

    seenCategories.add(category);
    grouped.push({ type: 'separator', line: `${SKILL_CATEGORY_LABELS[category] || category}` });
    for (const skill of skills) {
      grouped.push({
        name: `${skill.label}${skill.description ? ` - ${skill.description}` : ''}`,
        value: skill.skill,
        checked: selected.size > 0 ? selected.has(skill.skill) : true
      });
    }
  }

  const otherSkills = catalog.filter((skill) => !seenCategories.has(skill.category));
  if (otherSkills.length > 0) {
    grouped.push({ type: 'separator', line: 'Other' });
    for (const skill of otherSkills) {
      grouped.push({
        name: `${skill.label}${skill.description ? ` - ${skill.description}` : ''}`,
        value: skill.skill,
        checked: selected.size > 0 ? selected.has(skill.skill) : true
      });
    }
  }

  return grouped;
}

function getMcpResourcesForSkills(selectedSkills = []) {
  const selected = new Set(selectedSkills);
  const resources = new Set();
  const catalog = getMcpSkillCatalog();
  const skillMap = new Map(catalog.map((skill) => [skill.skill, skill]));

  for (const skillName of selected) {
    const skill = skillMap.get(skillName);
    if (!skill) continue;

    for (const componentKey of skill.componentDependencies) {
      const resourceKey = RESOURCE_KEY_BY_COMPONENT[componentKey];
      if (resourceKey) {
        resources.add(resourceKey);
      }
    }
  }

  return Array.from(resources);
}

function normalizeResourceKeys(resources = []) {
  const normalized = new Set();
  for (const resource of resources) {
    const key = RESOURCE_KEY_BY_COMPONENT[String(resource || '').trim()] || String(resource || '').trim();
    if (RESOURCE_META[key]) {
      normalized.add(key);
    }
  }
  return Array.from(normalized);
}

function extractCategoryFromFrontmatter(content) {
  const categoryMatch = content.match(/^\s*category:\s*([A-Za-z0-9_-]+)/im);
  return categoryMatch ? categoryMatch[1].toLowerCase() : null;
}

function buildBaseConfig(configDir) {
  return {
    version: '1.1.0',
    learning: {
      enabled: true,
      autoApply: true,
      confidenceThreshold: 0.7,
      storagePath: path.join(configDir, 'learning')
    },
    sceneMapping: {
      enabled: true,
      weights: {
        keywordMatch: 0.4,
        patternMatch: 0.3,
        historyScore: 0.2,
        confidence: 0.1
      }
    }
  };
}

function buildAiConfig(provider, details = {}) {
  const aiConfig = {
    version: '1.0.0',
    ai: {
      enabled: true,
      defaultProvider: provider,
      defaultModel: details.model || defaultModelForProvider(provider),
      providers: {}
    }
  };

  aiConfig.ai.providers[provider] = {
    enabled: true
  };

  if (details.apiKey) {
    aiConfig.ai.providers[provider].apiKey = details.apiKey;
  }

  if (details.secretKey) {
    aiConfig.ai.providers[provider].secretKey = details.secretKey;
  }

  if (details.baseUrl) {
    aiConfig.ai.providers[provider].baseUrl = details.baseUrl;
  }

  return aiConfig;
}

function buildSkillConfig(selectedSkills = [], details = {}) {
  const selected = new Set(selectedSkills);
  const skillConfig = {};

  for (const skillName of selected) {
    skillConfig[skillName] = {
      enabled: true,
      ...(SKILL_CONFIG_DEFAULTS[skillName] || {}),
      ...(details[skillName] || {})
    };
  }

  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    skills: skillConfig
  };
}

function buildResourceConfig(selectedResources = [], details = {}) {
  const selected = new Set(normalizeResourceKeys(selectedResources));
  const resources = {};

  if (selected.has('sls')) {
    resources.sls = {
      enabled: true,
      mcpServer: details.sls?.mcpServer || RESOURCE_META.sls.mcpServer,
      defaultEnv: details.sls?.defaultEnv || 'uat',
      envConfig: details.sls?.envConfig || {
        test: {
          endpoint: '',
          project: '',
          logstore: ''
        },
        uat: {
          endpoint: '',
          project: '',
          logstore: ''
        },
        prod: {
          endpoint: '',
          project: '',
          logstore: ''
        }
      }
    };
  }

  if (selected.has('database')) {
    const database = details.database || {};
    resources.database = {
      enabled: true,
      mcpServers: {
        dms: database.dms || RESOURCE_META.database.mcpServer,
        directQuery: database.directQuery || 'db-redis-query'
      },
      config: database.config || {}
    };
  }

  if (selected.has('redis')) {
    const redis = details.redis || {};
    resources.redis = {
      enabled: true,
      mcpServers: {
        monitor: redis.monitor || RESOURCE_META.redis.mcpServer,
        directQuery: redis.directQuery || 'db-redis-query'
      },
      config: redis.config || {}
    };
  }

  if (selected.has('yapi')) {
    const yapi = details.yapi || {};
    resources.yapi = {
      enabled: true,
      mcpServer: yapi.mcpServer || RESOURCE_META.yapi.mcpServer,
      config: {
        defaultProjectId: yapi.config?.defaultProjectId || '',
        defaultCategoryId: yapi.config?.defaultCategoryId || ''
      }
    };
  }

  if (selected.has('yuque')) {
    const yuque = details.yuque || {};
    resources.yuque = {
      enabled: true,
      mcpServer: yuque.mcpServer || RESOURCE_META.yuque.mcpServer,
      config: {
        defaultNamespace: yuque.config?.defaultNamespace || '',
        defaultSlugPrefix: yuque.config?.defaultSlugPrefix || ''
      }
    };
  }

  if (selected.has('workflow')) {
    resources.workflow = {
      enabled: true,
      mcpServer: details.workflow?.mcpServer || RESOURCE_META.workflow.mcpServer
    };
  }

  if (selected.has('report')) {
    resources.report = {
      enabled: true,
      mcpServer: details.report?.mcpServer || RESOURCE_META.report.mcpServer
    };
  }

  if (selected.has('governance')) {
    const governance = details.governance || {};
    resources.governance = {
      enabled: true,
      provider: governance.provider || RESOURCE_META.governance.provider,
      mcpServer: governance.mcpServer || RESOURCE_META.governance.mcpServer,
      config: governance.config || {}
    };
  }

  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    resources,
    mcpServers: details.mcpServers || {}
  };
}

function buildComponentConfig(selectedResources = [], details = {}) {
  const selected = new Set(normalizeResourceKeys(selectedResources));
  const components = {};

  if (selected.has('sls')) {
    const sls = details.sls || {};
    components.logService = {
      default: 'aliyun-sls',
      providers: {
        'aliyun-sls': {
          enabled: true,
          mcpServer: sls.mcpServer || RESOURCE_META.sls.mcpServer,
          config: {
            endpoints: sls.endpoints || {},
            envConfig: sls.envConfig || {},
            defaultProject: sls.defaultProject || '',
            defaultLogstore: sls.defaultLogstore || ''
          }
        }
      }
    };
  }

  if (selected.has('database')) {
    const database = details.database || {};
    components.databaseManager = {
      default: 'aliyun-dms',
      providers: {
        'aliyun-dms': {
          enabled: true,
          mcpServer: database.dms || RESOURCE_META.database.mcpServer
        }
      }
    };
    components.databaseQuery = {
      default: 'aliyun-rds-query',
      providers: {
        'aliyun-rds-query': {
          enabled: true,
          mcpServer: database.directQuery || 'db-redis-query',
          config: {
            defaultSourceId: database.config?.defaultSourceId || '',
            defaultDatabaseId: database.config?.defaultDatabaseId || '',
            defaultSchema: database.config?.defaultSchema || ''
          }
        }
      }
    };
  }

  if (selected.has('redis')) {
    const redis = details.redis || {};
    components.redisMonitor = {
      default: 'aliyun-redis',
      providers: {
        'aliyun-redis': {
          enabled: true,
          mcpServer: redis.monitor || RESOURCE_META.redis.mcpServer,
          config: {
            defaultSourceId: redis.config?.defaultSourceId || '',
            defaultKeyPrefix: redis.config?.defaultKeyPrefix || '',
            defaultLabelName: redis.config?.defaultLabelName || ''
          }
        }
      }
    };
    if (!components.databaseQuery) {
      components.databaseQuery = {
        default: 'aliyun-rds-query',
        providers: {
          'aliyun-rds-query': {
            enabled: true,
            mcpServer: redis.directQuery || 'db-redis-query',
            config: {
              defaultSourceId: redis.config?.defaultSourceId || '',
              defaultDatabaseId: '',
              defaultSchema: ''
            }
          }
        }
      };
    }
  }

  if (selected.has('yapi')) {
    const yapi = details.yapi || {};
    components.apiDoc = {
      default: 'yapi',
      providers: {
        yapi: {
          enabled: true,
          mcpServer: yapi.mcpServer || RESOURCE_META.yapi.mcpServer,
          config: {
            defaultProjectId: yapi.config?.defaultProjectId || '',
            defaultCategoryId: yapi.config?.defaultCategoryId || ''
          }
        }
      }
    };
  }

  if (selected.has('yuque')) {
    const yuque = details.yuque || {};
    components.knowledgeBase = {
      default: 'yuque',
      providers: {
        yuque: {
          enabled: true,
          mcpServer: yuque.mcpServer || RESOURCE_META.yuque.mcpServer,
          config: {
            defaultNamespace: yuque.config?.defaultNamespace || '',
            defaultSlugPrefix: yuque.config?.defaultSlugPrefix || ''
          }
        }
      }
    };
  }

  if (selected.has('workflow')) {
    components.workflow = {
      default: 'auto-flow',
      providers: {
        'auto-flow': {
          enabled: true,
          mcpServer: details.workflow?.mcpServer || RESOURCE_META.workflow.mcpServer
        }
      }
    };
  }

  if (selected.has('report')) {
    components.report = {
      default: 'auto-report',
      providers: {
        'auto-report': {
          enabled: true,
          mcpServer: details.report?.mcpServer || RESOURCE_META.report.mcpServer
        }
      }
    };
  }

  if (selected.has('governance')) {
    const governance = details.governance || {};
    const provider = governance.provider || RESOURCE_META.governance.provider;
    components.serviceGovernance = {
      default: provider,
      providers: {
        [provider]: {
          enabled: true,
          mcpServer: governance.mcpServer || RESOURCE_META.governance.mcpServer,
          tools: governance.tools || {},
          config: governance.config || {}
        }
      }
    };
  }

  return {
    version: '1.0.0',
    components
  };
}

function _buildResourceMcpServers(selectedResources = [], details = {}) {
  const selected = new Set(normalizeResourceKeys(selectedResources));
  const mcpServers = {};

  if (selected.has('sls')) {
    mcpServers[RESOURCE_META.sls.mcpServer] = {
      type: 'http',
      description: 'FlowMind SLS log service'
    };
  }
  if (selected.has('database')) {
    mcpServers[details.database?.dms || RESOURCE_META.database.mcpServer] = {
      type: 'http',
      description: 'FlowMind DMS database manager'
    };
    mcpServers[details.database?.directQuery || 'db-redis-query'] = {
      type: 'http',
      description: 'FlowMind direct database query'
    };
  }
  if (selected.has('redis')) {
    mcpServers[details.redis?.monitor || RESOURCE_META.redis.mcpServer] = {
      type: 'http',
      description: 'FlowMind Redis monitor'
    };
    mcpServers[details.redis?.directQuery || 'db-redis-query'] = {
      type: 'http',
      description: 'FlowMind direct database/Redis query'
    };
  }
  if (selected.has('yapi')) {
    mcpServers[details.yapi?.mcpServer || RESOURCE_META.yapi.mcpServer] = {
      type: 'http',
      description: 'FlowMind YApi integration'
    };
  }
  if (selected.has('yuque')) {
    mcpServers[details.yuque?.mcpServer || RESOURCE_META.yuque.mcpServer] = {
      type: 'http',
      description: 'FlowMind Yuque integration'
    };
  }
  if (selected.has('workflow')) {
    mcpServers[details.workflow?.mcpServer || RESOURCE_META.workflow.mcpServer] = {
      type: 'http',
      description: 'FlowMind workflow integration'
    };
  }
  if (selected.has('report')) {
    mcpServers[details.report?.mcpServer || RESOURCE_META.report.mcpServer] = {
      type: 'http',
      description: 'FlowMind report integration'
    };
  }
  if (selected.has('governance')) {
    mcpServers[details.governance?.mcpServer || RESOURCE_META.governance.mcpServer] = {
      type: 'http',
      description: 'FlowMind multi-cloud service governance integration'
    };
  }

  return mcpServers;
}

module.exports = {
  AI_PROVIDER_META,
  RESOURCE_META,
  buildAiConfig,
  buildBaseConfig,
  buildComponentConfig,
  buildResourceConfig,
  buildSkillConfig,
  getMcpSkillCatalog,
  getMcpSkillChoices,
  getMcpSkillChoicesGrouped,
  getMcpResourcesForSkills,
  normalizeResourceKeys,
  getAiProviderChoices,
  getAiModelChoices,
  getResourceChoices,
  getSetupChoices
};
