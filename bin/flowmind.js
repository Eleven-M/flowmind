#!/usr/bin/env node

/**
 * FlowMind CLI
 * The AI Agent That Learns How You Work
 */

const { program } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const FlowMind = require('../core');
const HonorEngine = require('../core/honor-engine');
const { main: runUpdateCheck } = require('../scripts/check-update');
const { launchInkApp } = require('../core/cli-ink');
const { syncSddAgentToFlowMind } = require('../core/sdd-agent-sync');
const { getUpgradeStatus } = require('../core/upgrade-status');
const { runReleaseCheck } = require('../core/release-check');
const { previewWorkflow } = require('../core/dry-run');
const { executeWorkflow } = require('../core/workflow-executor');
const { formatResultText } = require('../tui/format-result');
const {
  buildAiConfig,
  buildBaseConfig,
  buildComponentConfig,
  buildResourceConfig,
  buildSkillConfig,
  getMcpSkillCatalog,
  getAiProviderChoices,
  getAiModelChoices,
  getResourceChoices,
  AI_PROVIDER_META
} = require('../core/init-scaffold');
const { detectManagedCliHost, shouldUseAsciiUi, getNestedTuiGuardMessage } = require('../core/utils');
const { isExitCommand } = require('../tui/ui');

/**
 * Restore terminal to sane state (cancel raw mode, show cursor, reset colors)
 */
function restoreTerminal() {
  try {
    if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
      process.stdin.setRawMode(false);
    }
  } catch (e) { /* ignore */ }
  if (process.stdout.isTTY) {
    // Show cursor, reset colors, clear scroll region
    process.stdout.write('\x1b[?25h\x1b[0m\x1b[r');
  }
}

function getFlowMindHomeDir() {
  return process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE || os.homedir();
}

function getFlowMindConfigDir() {
  return path.join(getFlowMindHomeDir(), '.flowmind');
}

const INIT_MODULE_CHOICES = [
  { name: 'AI model', value: 'ai' },
  { name: 'MCP config', value: 'mcp' },
  { name: 'Skills', value: 'skills' },
  { name: 'Save and exit', value: 'finish' }
];

async function promptInitModuleChoice(state = {}) {
  const choiceLabels = [
    state.aiProvider ? `AI model (${state.aiProvider})` : 'AI model',
    state.selectedResources?.length > 0
      ? `MCP config (${state.selectedResources.length} selected)`
      : 'MCP config',
    state.selectedMcpSkills?.length > 0
      ? `Skills (${state.selectedMcpSkills.length} selected)`
      : 'Skills',
    'Save and exit'
  ];

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'module',
      message: 'Choose a section:',
      choices: INIT_MODULE_CHOICES.map((choice, index) => ({
        ...choice,
        name: choiceLabels[index]
      })),
      default: state.lastModule || 'ai'
    }
  ]);

  return answer.module;
}

async function promptAiProvider(defaultProvider = null, allowBack = false) {
  const choices = getAiProviderChoices();
  if (allowBack) {
    choices.push(new inquirer.Separator(), { name: 'Back to main menu', value: '__back__' });
  }

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Choose AI provider:',
      choices,
      default: defaultProvider || 'openai'
    }
  ]);
  return answer.provider;
}

async function promptAiDetails(provider, defaults = {}) {
  const meta = AI_PROVIDER_META[provider] || {};
  const modelChoices = getAiModelChoices(provider);
  const prompts = [
    {
      type: 'list',
      name: 'model',
      message: `Choose the model for ${meta.label || provider} (${defaults.model || defaultModelForProvider(provider)} is recommended):`,
      choices: modelChoices,
      default: defaults.model || modelChoices[0]?.value || '__custom__'
    }
  ];

  if (provider !== 'ollama') {
    prompts.push({
      type: 'password',
      name: 'apiKey',
      message: `Enter ${meta.apiKeyLabel || `${provider} API key`}:`,
      mask: '*',
      default: defaults.apiKey || ''
    });
  }

  if (provider === 'ernie') {
    prompts.push({
      type: 'password',
      name: 'secretKey',
      message: 'Enter Baidu Secret key:',
      mask: '*',
      default: defaults.secretKey || ''
    });
  }

  prompts.push({
    type: 'input',
    name: 'baseUrl',
    message: `Base URL or endpoint for ${meta.label || provider} (optional):`,
    default: defaults.baseUrl || defaultBaseUrlForProvider(provider)
  });

  const answers = await inquirer.prompt(prompts);
  if (answers.model === '__custom__') {
    const custom = await inquirer.prompt([
      {
        type: 'input',
        name: 'model',
        message: `Enter custom model name for ${meta.label || provider}:`,
        default: defaults.model || defaultModelForProvider(provider)
      }
    ]);
    answers.model = custom.model;
  }
  return answers;
}

async function promptResourceDetails(resourceKey) {
  const detailPrompts = {
    sls: [
      {
        type: 'input',
        name: 'mcpServer',
        message: 'SLS MCP server name:',
        default: 'friday-sls-logs'
      },
      {
        type: 'list',
        name: 'defaultEnv',
        message: 'Default SLS environment:',
        choices: ['test', 'uat', 'gray', 'prod'],
        default: 'uat'
      },
      {
        type: 'input',
        name: 'testEndpoint',
        message: 'Test SLS endpoint:',
        default: 'cn-shenzhen.log.aliyuncs.com'
      },
      {
        type: 'input',
        name: 'testProject',
        message: 'Test SLS project:',
        default: ''
      },
      {
        type: 'input',
        name: 'testLogstore',
        message: 'Test SLS logstore:',
        default: ''
      },
      {
        type: 'input',
        name: 'uatEndpoint',
        message: 'UAT SLS endpoint:',
        default: 'cn-shenzhen.log.aliyuncs.com'
      },
      {
        type: 'input',
        name: 'uatProject',
        message: 'UAT SLS project:',
        default: ''
      },
      {
        type: 'input',
        name: 'uatLogstore',
        message: 'UAT SLS logstore:',
        default: ''
      },
      {
        type: 'input',
        name: 'prodEndpoint',
        message: 'Prod SLS endpoint:',
        default: 'cn-hongkong.log.aliyuncs.com'
      },
      {
        type: 'input',
        name: 'prodProject',
        message: 'Prod SLS project:',
        default: ''
      },
      {
        type: 'input',
        name: 'prodLogstore',
        message: 'Prod SLS logstore:',
        default: ''
      }
    ],
    database: [
      {
        type: 'input',
        name: 'dms',
        message: 'Database manager MCP server name:',
        default: 'aliyun-dms-mcp-server'
      },
      {
        type: 'input',
        name: 'directQuery',
        message: 'Direct query MCP server name:',
        default: 'friday-rds-redis-query'
      },
      {
        type: 'input',
        name: 'defaultSourceId',
        message: 'Default database source ID (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'defaultDatabaseId',
        message: 'Default database ID (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'defaultSchema',
        message: 'Default database schema (optional):',
        default: ''
      }
    ],
    redis: [
      {
        type: 'input',
        name: 'monitor',
        message: 'Redis monitor MCP server name:',
        default: 'friday-aliyun-sz-rds-redis'
      },
      {
        type: 'input',
        name: 'directQuery',
        message: 'Direct query MCP server name:',
        default: 'friday-rds-redis-query'
      },
      {
        type: 'input',
        name: 'defaultSourceId',
        message: 'Default Redis source ID (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'defaultKeyPrefix',
        message: 'Default Redis key prefix (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'defaultLabelName',
        message: 'Default Redis label name (optional):',
        default: ''
      }
    ],
    yapi: [
      {
        type: 'input',
        name: 'mcpServer',
        message: 'YApi MCP server name:',
        default: 'yapi-mcp'
      },
      {
        type: 'input',
        name: 'defaultProjectId',
        message: 'Default YApi project ID (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'defaultCategoryId',
        message: 'Default YApi category ID (optional):',
        default: ''
      }
    ],
    yuque: [
      {
        type: 'input',
        name: 'mcpServer',
        message: 'Yuque MCP server name:',
        default: 'yuque-mcp'
      },
      {
        type: 'input',
        name: 'defaultNamespace',
        message: 'Default Yuque namespace (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'defaultSlugPrefix',
        message: 'Default Yuque doc slug prefix (optional):',
        default: ''
      }
    ],
    workflow: [
      {
        type: 'input',
        name: 'mcpServer',
        message: 'Workflow MCP server name:',
        default: 'friday-auto-flow'
      }
    ],
    report: [
      {
        type: 'input',
        name: 'mcpServer',
        message: 'Report MCP server name:',
        default: 'friday-auto-report'
      }
    ]
  };

  const prompts = detailPrompts[resourceKey] || [];
  if (prompts.length === 0) {
    return {};
  }
  const answers = await inquirer.prompt(prompts);
  if (resourceKey === 'sls') {
    return {
      ...answers,
      envConfig: buildSlsEnvConfig(answers)
    };
  }
  if (resourceKey === 'database') {
    return {
      ...answers,
      config: buildDatabaseConfig(answers)
    };
  }
  if (resourceKey === 'redis') {
    return {
      ...answers,
      config: buildRedisConfig(answers)
    };
  }
  if (resourceKey === 'yapi') {
    return {
      ...answers,
      config: buildYapiConfig(answers)
    };
  }
  if (resourceKey === 'yuque') {
    return {
      ...answers,
      config: buildYuqueConfig(answers)
    };
  }
  return answers;
}

async function promptSkillDetails(skillName) {
  const promptsBySkill = {
    'log-audit': [
      {
        type: 'list',
        name: 'defaultFormat',
        message: 'Default log output format:',
        choices: ['sequential-list', 'summary', 'json'],
        default: 'sequential-list'
      },
      {
        type: 'confirm',
        name: 'excludeInfrastructure',
        message: 'Exclude infrastructure services by default?',
        default: true
      }
    ],
    'sls-log-audit': [
      {
        type: 'list',
        name: 'defaultFormat',
        message: 'Default log output format:',
        choices: ['sequential-list', 'summary', 'json'],
        default: 'sequential-list'
      },
      {
        type: 'confirm',
        name: 'excludeInfrastructure',
        message: 'Exclude infrastructure services by default?',
        default: true
      }
    ],
    'data-logic-validation': [
      {
        type: 'number',
        name: 'databaseMaxRows',
        message: 'Max database rows to inspect:',
        default: 100,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive integer'
      },
      {
        type: 'number',
        name: 'redisScanCount',
        message: 'Redis scan count:',
        default: 100,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive integer'
      },
      {
        type: 'confirm',
        name: 'checkIntegrity',
        message: 'Check data integrity by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'checkConsistency',
        message: 'Check data consistency by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'checkPerformance',
        message: 'Check performance by default?',
        default: true
      }
    ],
    'yapi-sync-interface': [
      {
        type: 'input',
        name: 'defaultProjectId',
        message: 'Default YApi project ID:',
        default: ''
      },
      {
        type: 'list',
        name: 'syncMode',
        message: 'YApi sync mode:',
        choices: ['merge', 'overwrite'],
        default: 'merge'
      },
      {
        type: 'confirm',
        name: 'autoCreateCategory',
        message: 'Auto create category when missing?',
        default: true
      },
      {
        type: 'input',
        name: 'excludePatterns',
        message: 'Exclude patterns (comma separated, optional):',
        default: ''
      }
    ],
    'yuque-sync-design': [
      {
        type: 'input',
        name: 'defaultRepo',
        message: 'Default Yuque repository:',
        default: ''
      },
      {
        type: 'list',
        name: 'syncFormat',
        message: 'Yuque sync format:',
        choices: ['markdown', 'html'],
        default: 'markdown'
      },
      {
        type: 'confirm',
        name: 'autoCreateToc',
        message: 'Auto create table of contents?',
        default: true
      },
      {
        type: 'confirm',
        name: 'archiveAfterSync',
        message: 'Archive after sync?',
        default: true
      }
    ],
    'code-review': [
      {
        type: 'checkbox',
        name: 'securitySeverity',
        message: 'Security severities to enable:',
        choices: [
          { name: 'HIGH', value: 'HIGH', checked: true },
          { name: 'MEDIUM', value: 'MEDIUM', checked: true },
          { name: 'LOW', value: 'LOW', checked: true }
        ]
      },
      {
        type: 'confirm',
        name: 'qualityEnabled',
        message: 'Enable quality checks by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'styleEnabled',
        message: 'Enable style checks by default?',
        default: true
      }
    ],
    'project-review': [
      {
        type: 'confirm',
        name: 'checkDependencies',
        message: 'Check dependencies by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'checkSecurity',
        message: 'Check security by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'checkQuality',
        message: 'Check code quality by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'checkDocumentation',
        message: 'Check documentation by default?',
        default: true
      },
      {
        type: 'number',
        name: 'coverageThreshold',
        message: 'Coverage threshold:',
        default: 80,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive integer'
      },
      {
        type: 'number',
        name: 'complexityThreshold',
        message: 'Complexity threshold:',
        default: 10,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive integer'
      }
    ],
    'archive-change': [
      {
        type: 'input',
        name: 'location',
        message: 'Archive location:',
        default: 'archive/changes'
      },
      {
        type: 'confirm',
        name: 'keepTests',
        message: 'Keep test reports in archive?',
        default: true
      },
      {
        type: 'confirm',
        name: 'keepArtifacts',
        message: 'Keep artifacts in archive?',
        default: true
      },
      {
        type: 'confirm',
        name: 'generateSummary',
        message: 'Generate summary file?',
        default: true
      },
      {
        type: 'confirm',
        name: 'updateChangelog',
        message: 'Update changelog during archive?',
        default: true
      }
    ],
    'auto-flow': [
      {
        type: 'input',
        name: 'workflowPath',
        message: 'Workflow map directory or file:',
        default: './workflows'
      },
      {
        type: 'confirm',
        name: 'autoDiscover',
        message: 'Auto-discover workflow maps?',
        default: true
      },
      {
        type: 'confirm',
        name: 'parallel',
        message: 'Enable parallel workflow steps by default?',
        default: true
      },
      {
        type: 'number',
        name: 'maxConcurrent',
        message: 'Max concurrent workflow steps:',
        default: 5,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive integer'
      },
      {
        type: 'number',
        name: 'timeout',
        message: 'Workflow timeout in seconds:',
        default: 3600,
        validate: (value) => Number.isInteger(Number(value)) && Number(value) > 0 ? true : 'Enter a positive integer'
      }
    ],
    'api-sync': [
      {
        type: 'list',
        name: 'platform',
        message: 'Default API sync platform:',
        choices: ['yapi', 'swagger', 'postman'],
        default: 'yapi'
      },
      {
        type: 'input',
        name: 'host',
        message: 'API platform host:',
        default: ''
      },
      {
        type: 'input',
        name: 'projectId',
        message: 'Default API project ID:',
        default: ''
      },
      {
        type: 'input',
        name: 'token',
        message: 'API platform token (optional):',
        default: ''
      },
      {
        type: 'confirm',
        name: 'autoSync',
        message: 'Enable auto sync by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'generateDocs',
        message: 'Generate docs by default?',
        default: true
      },
      {
        type: 'confirm',
        name: 'validateSchema',
        message: 'Validate schema by default?',
        default: true
      }
    ]
  };

  const prompts = promptsBySkill[skillName] || [];
  if (prompts.length === 0) {
    return {};
  }

  const answers = await inquirer.prompt(prompts);

  if (skillName === 'data-logic-validation') {
    return {
      database: {
        maxRows: Number(answers.databaseMaxRows) || 100
      },
      redis: {
        scanCount: Number(answers.redisScanCount) || 100
      },
      validation: {
        checkIntegrity: Boolean(answers.checkIntegrity),
        checkConsistency: Boolean(answers.checkConsistency),
        checkPerformance: Boolean(answers.checkPerformance)
      }
    };
  }

  if (skillName === 'yapi-sync-interface') {
    return {
      defaultProjectId: answers.defaultProjectId || '',
      syncMode: answers.syncMode || 'merge',
      autoCreateCategory: Boolean(answers.autoCreateCategory),
      excludePatterns: String(answers.excludePatterns || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    };
  }

  if (skillName === 'code-review') {
    return {
      security: {
        enabled: true,
        severity: Array.isArray(answers.securitySeverity) && answers.securitySeverity.length > 0
          ? answers.securitySeverity
          : ['HIGH', 'MEDIUM', 'LOW']
      },
      quality: {
        enabled: Boolean(answers.qualityEnabled)
      },
      style: {
        enabled: Boolean(answers.styleEnabled)
      }
    };
  }

  if (skillName === 'project-review') {
    return {
      checks: {
        dependencies: Boolean(answers.checkDependencies),
        security: Boolean(answers.checkSecurity),
        quality: Boolean(answers.checkQuality),
        documentation: Boolean(answers.checkDocumentation)
      },
      thresholds: {
        coverage: Number(answers.coverageThreshold) || 80,
        complexity: Number(answers.complexityThreshold) || 10
      }
    };
  }

  if (skillName === 'archive-change') {
    return {
      location: answers.location || 'archive/changes',
      keepTests: Boolean(answers.keepTests),
      keepArtifacts: Boolean(answers.keepArtifacts),
      generateSummary: Boolean(answers.generateSummary),
      updateChangelog: Boolean(answers.updateChangelog)
    };
  }

  if (skillName === 'auto-flow') {
    return {
      workflows: {
        path: answers.workflowPath || './workflows',
        autoDiscover: Boolean(answers.autoDiscover)
      },
      execution: {
        parallel: Boolean(answers.parallel),
        maxConcurrent: Number(answers.maxConcurrent) || 5,
        timeout: Number(answers.timeout) || 3600
      },
      notifications: {
        onComplete: true,
        onError: true
      }
    };
  }

  if (skillName === 'api-sync') {
    return {
      platform: answers.platform || 'yapi',
      connection: {
        host: answers.host || '',
        projectId: answers.projectId || '',
        token: answers.token || ''
      },
      options: {
        autoSync: Boolean(answers.autoSync),
        generateDocs: Boolean(answers.generateDocs),
        validateSchema: Boolean(answers.validateSchema)
      }
    };
  }

  return {
    ...answers,
    ...(skillName === 'log-audit' || skillName === 'sls-log-audit'
      ? {
          defaultFormat: answers.defaultFormat || 'sequential-list',
          excludeInfrastructure: Boolean(answers.excludeInfrastructure)
        }
      : {}),
    ...(skillName === 'yuque-sync-design'
      ? {
          defaultRepo: answers.defaultRepo || '',
          syncFormat: answers.syncFormat || 'markdown',
          autoCreateToc: Boolean(answers.autoCreateToc),
          archiveAfterSync: Boolean(answers.archiveAfterSync)
        }
      : {})
  };
}

async function promptInitModuleAction(title, lines, prompt = 'Save this configuration?') {
  console.log(chalk.cyan(`\n${title}`));
  for (const line of lines) {
    console.log(`  ${line}`);
  }

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: prompt,
      choices: [
        { name: 'Save and return to the main menu', value: 'save' },
        { name: 'Back to the main menu', value: 'back' },
        { name: 'Exit init without saving more changes', value: 'exit' }
      ],
      default: 'save'
    }
  ]);

  return answer.action;
}

async function promptInitModuleEntry(moduleLabel) {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: `${moduleLabel}: choose an action`,
      choices: [
        { name: 'Continue', value: 'configure' },
        { name: 'Back', value: 'back' }
      ],
      default: 'configure'
    }
  ]);

  return answer.action;
}

async function promptSkillCategoryChoice(categoryNames, selectionCounts = {}) {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: 'Choose a skill group:',
      choices: [
        ...categoryNames.map((category) => ({
          name: selectionCounts[category] > 0 ? `${category} (${selectionCounts[category]} selected)` : category,
          value: category
        })),
        new inquirer.Separator(),
        {
          name: 'Save and exit',
          value: '__save__'
        },
        {
          name: 'Back',
          value: '__back__'
        }
      ],
      default: categoryNames[0] || '__back__'
    }
  ]);

  return answer.category;
}

async function promptSkillsForCategory(category, skills, defaults = []) {
  const defaultSet = new Set(defaults);
  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'skills',
      message: `Choose skills in ${category}:`,
      choices: skills.map((skill) => ({
        name: `${skill.label}${skill.description ? ` - ${skill.description}` : ''}`,
        value: skill.skill,
        checked: defaultSet.size > 0 ? defaultSet.has(skill.skill) : false
      })),
      validate: (value) => value.length > 0 ? true : 'Select at least one skill'
    }
  ]);

  return answer.skills;
}

async function promptResourceCategoryChoice(categoryNames, selectionCounts = {}) {
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: 'Choose an MCP group:',
      choices: [
        ...categoryNames.map((category) => ({
          name: selectionCounts[category] > 0 ? `${category} (${selectionCounts[category]} selected)` : category,
          value: category
        })),
        new inquirer.Separator(),
        {
          name: 'Save and exit',
          value: '__save__'
        },
        {
          name: 'Back',
          value: '__back__'
        }
      ],
      default: categoryNames[0] || '__back__'
    }
  ]);

  return answer.category;
}

async function promptResourcesForCategory(category, resources, defaults = []) {
  const defaultSet = new Set(defaults);
  const answer = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'resources',
      message: `Choose resources in ${category}:`,
      choices: resources.map((resource) => ({
        name: `${resource.name}${resource.description ? ` - ${resource.description}` : ''}`,
        value: resource.value,
        checked: defaultSet.size > 0 ? defaultSet.has(resource.value) : false
      })),
      validate: (value) => value.length > 0 ? true : 'Select at least one resource'
    }
  ]);

  return answer.resources;
}

async function runAiInitModule({
  configDir,
  interactive,
  requestedAiProvider,
  requestedDefaults
}) {
  const provider = interactive
    ? await promptAiProvider(requestedAiProvider || 'openai', true)
    : requestedAiProvider;

  if (!provider) {
    if (interactive) {
      return { status: 'back' };
    }
    throw new Error('AI provider is required for init --ai in non-interactive mode');
  }

  if (provider === '__back__') {
    return { status: 'back' };
  }

  const details = interactive
    ? await promptAiDetails(provider, requestedDefaults)
    : {
        ...buildDefaultAiDetails(provider),
        ...(requestedDefaults.model ? { model: requestedDefaults.model } : {}),
        ...(requestedDefaults.baseUrl ? { baseUrl: requestedDefaults.baseUrl } : {}),
        ...(requestedDefaults.apiKey && provider !== 'ollama' ? { apiKey: requestedDefaults.apiKey } : {}),
        ...(requestedDefaults.secretKey && provider === 'ernie' ? { secretKey: requestedDefaults.secretKey } : {})
      };

  if (interactive) {
    const action = await promptInitModuleAction(
      'AI model',
      buildAiReviewLines(configDir, provider, details),
      'Save the AI model provider configuration?'
    );
    if (action === 'back') {
      return { status: 'back' };
    }
    if (action === 'exit') {
      return { status: 'exit' };
    }
  }

  const aiConfigPath = path.join(configDir, 'ai-config.json');
  await fs.writeJson(aiConfigPath, buildAiConfig(provider, details), { spaces: 2 });
  console.log(chalk.green(`✓ AI model configured: ${provider} / ${details.model}`));

  return {
    status: 'saved',
    aiProvider: provider,
    aiDetails: details
  };
}

async function runMcpInitModule({ configDir, interactive }) {
  if (interactive) {
    const action = await promptInitModuleEntry('MCP config');
    if (action === 'back') {
      return { status: 'back' };
    }
  }

  const resourceChoices = getResourceChoices();
  const categoryMap = new Map([
    ['Monitoring', resourceChoices.filter((item) => ['sls'].includes(item.value))],
    ['Data', resourceChoices.filter((item) => ['database', 'redis'].includes(item.value))],
    ['Docs', resourceChoices.filter((item) => ['yapi', 'yuque'].includes(item.value))],
    ['Automation', resourceChoices.filter((item) => ['workflow', 'report'].includes(item.value))]
  ].filter(([, items]) => items.length > 0));
  const categoryNames = Array.from(categoryMap.keys());
  const selectedResourceDetails = {};

  let selectedResources = resourceChoices.filter((choice) => choice.checked !== false).map((choice) => choice.value);
  if (interactive) {
    const selectedByCategory = new Map();
    for (const [category, resources] of categoryMap.entries()) {
      const defaultSelected = resources.filter((item) => item.checked !== false).map((item) => item.value);
      if (defaultSelected.length > 0) {
        selectedByCategory.set(category, defaultSelected);
      }
    }
    while (true) {
      const selectionCounts = Object.fromEntries(
        Array.from(selectedByCategory.entries()).map(([category, resources]) => [category, resources.length])
      );
      const categoryChoice = await promptResourceCategoryChoice(categoryNames, selectionCounts);
      if (categoryChoice === '__back__') {
        return { status: 'back' };
      }
      if (categoryChoice === '__save__') {
        break;
      }

      const categoryResources = categoryMap.get(categoryChoice) || [];
      const selectedCategoryResources = await promptResourcesForCategory(
        categoryChoice,
        categoryResources,
        selectedByCategory.get(categoryChoice) || []
      );
      selectedByCategory.set(categoryChoice, selectedCategoryResources);
    }

    selectedResources = Array.from(new Set(Array.from(selectedByCategory.values()).flat()));
  }

  for (const resourceKey of selectedResources) {
    if (interactive) {
      console.log(chalk.cyan(`\nConfigure ${resourceKey}`));
      selectedResourceDetails[resourceKey] = await promptResourceDetails(resourceKey);
    } else {
      selectedResourceDetails[resourceKey] = {};
    }
  }

  if (interactive) {
    const action = await promptInitModuleAction(
      'MCP config',
      buildResourceReviewLines(configDir, selectedResources, selectedResourceDetails),
      'Save MCP config?'
    );
    if (action === 'back') {
      return { status: 'back' };
    }
    if (action === 'exit') {
      return { status: 'exit' };
    }
  }

  await fs.writeJson(
    path.join(configDir, 'resource-config.json'),
    buildResourceConfig(selectedResources, selectedResourceDetails),
    { spaces: 2 }
  );
  await fs.writeJson(
    path.join(configDir, 'component-config.json'),
    buildComponentConfig(selectedResources, selectedResourceDetails),
    { spaces: 2 }
  );
  console.log(chalk.green(`✓ MCP config saved: ${selectedResources.length > 0 ? selectedResources.join(', ') : 'none'}`));

  return {
    status: 'saved',
    selectedResources,
    selectedResourceDetails
  };
}

async function runSkillInitModule({ configDir, interactive }) {
  if (interactive) {
    const action = await promptInitModuleEntry('Skills');
    if (action === 'back') {
      return { status: 'back' };
    }
  }

  const skillCatalog = getMcpSkillCatalog();
  const categoryMap = new Map();
  for (const skill of skillCatalog) {
    const category = skill.category || 'other';
    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category).push(skill);
  }
  const categoryNames = Array.from(categoryMap.keys());
  const selectedSkillDetails = {};
  const selectedByCategory = new Map();

  let selectedMcpSkills = [];
  if (interactive) {
    while (true) {
      const selectionCounts = Object.fromEntries(
        Array.from(selectedByCategory.entries()).map(([category, skills]) => [category, skills.length])
      );
      const categoryChoice = await promptSkillCategoryChoice(categoryNames, selectionCounts);
      if (categoryChoice === '__back__') {
        return { status: 'back' };
      }
      if (categoryChoice === '__save__') {
        break;
      }

      const selectedCategorySkills = await promptSkillsForCategory(
        categoryChoice,
        categoryMap.get(categoryChoice) || [],
        selectedByCategory.get(categoryChoice) || []
      );
      selectedByCategory.set(categoryChoice, selectedCategorySkills);
    }

    selectedMcpSkills = Array.from(
      new Set(Array.from(selectedByCategory.values()).flat())
    );
  }

  for (const skillName of selectedMcpSkills) {
    if (interactive) {
      console.log(chalk.cyan(`\nConfigure ${skillName}`));
      selectedSkillDetails[skillName] = await promptSkillDetails(skillName);
    } else {
      selectedSkillDetails[skillName] = {};
    }
  }

  if (interactive) {
    const action = await promptInitModuleAction(
      'Skills',
      buildSkillReviewLines(configDir, selectedMcpSkills, selectedSkillDetails),
      'Save skills?'
    );
    if (action === 'back') {
      return { status: 'back' };
    }
    if (action === 'exit') {
      return { status: 'exit' };
    }
  }

  await fs.writeJson(
    path.join(configDir, 'skill-config.json'),
    buildSkillConfig(selectedMcpSkills, selectedSkillDetails),
    { spaces: 2 }
  );
  console.log(chalk.green(`✓ Skills saved: ${selectedMcpSkills.length > 0 ? selectedMcpSkills.join(', ') : 'none'}`));

  return {
    status: 'saved',
    selectedMcpSkills,
    selectedSkillDetails
  };
}

function buildSlsEnvConfig(answers) {
  return {
    test: {
      endpoint: answers.testEndpoint || 'cn-shenzhen.log.aliyuncs.com',
      project: answers.testProject || '',
      logstore: answers.testLogstore || ''
    },
    uat: {
      endpoint: answers.uatEndpoint || 'cn-shenzhen.log.aliyuncs.com',
      project: answers.uatProject || '',
      logstore: answers.uatLogstore || ''
    },
    prod: {
      endpoint: answers.prodEndpoint || 'cn-hongkong.log.aliyuncs.com',
      project: answers.prodProject || '',
      logstore: answers.prodLogstore || ''
    }
  };
}

function buildDatabaseConfig(answers) {
  return {
    defaultSourceId: answers.defaultSourceId || '',
    defaultDatabaseId: answers.defaultDatabaseId || '',
    defaultSchema: answers.defaultSchema || ''
  };
}

function buildRedisConfig(answers) {
  return {
    defaultSourceId: answers.defaultSourceId || '',
    defaultKeyPrefix: answers.defaultKeyPrefix || '',
    defaultLabelName: answers.defaultLabelName || ''
  };
}

function buildYapiConfig(answers) {
  return {
    defaultProjectId: answers.defaultProjectId || '',
    defaultCategoryId: answers.defaultCategoryId || ''
  };
}

function buildYuqueConfig(answers) {
  return {
    defaultNamespace: answers.defaultNamespace || '',
    defaultSlugPrefix: answers.defaultSlugPrefix || ''
  };
}

function defaultModelForProvider(provider) {
  const defaults = {
    openai: AI_PROVIDER_META.openai.defaultModel,
    anthropic: AI_PROVIDER_META.anthropic.defaultModel,
    glm: AI_PROVIDER_META.glm.defaultModel,
    mimo: AI_PROVIDER_META.mimo.defaultModel,
    qwen: AI_PROVIDER_META.qwen.defaultModel,
    ernie: AI_PROVIDER_META.ernie.defaultModel,
    deepseek: AI_PROVIDER_META.deepseek.defaultModel,
    ollama: AI_PROVIDER_META.ollama.defaultModel
  };
  return defaults[provider] || '';
}

function defaultBaseUrlForProvider(provider) {
  const defaults = {
    ollama: AI_PROVIDER_META.ollama.defaultBaseUrl,
    openai: AI_PROVIDER_META.openai.defaultBaseUrl,
    anthropic: AI_PROVIDER_META.anthropic.defaultBaseUrl,
    glm: AI_PROVIDER_META.glm.defaultBaseUrl,
    mimo: AI_PROVIDER_META.mimo.defaultBaseUrl,
    qwen: AI_PROVIDER_META.qwen.defaultBaseUrl,
    ernie: AI_PROVIDER_META.ernie.defaultBaseUrl,
    deepseek: AI_PROVIDER_META.deepseek.defaultBaseUrl
  };
  return defaults[provider] || '';
}

function buildDefaultAiDetails(provider) {
  return {
    model: defaultModelForProvider(provider),
    baseUrl: defaultBaseUrlForProvider(provider)
  };
}

function summarizeResourceSelection(selectedResources, selectedResourceDetails) {
  return selectedResources.map((resourceKey) => {
    const details = selectedResourceDetails[resourceKey] || {};
    const summary = [resourceKey];

    if (resourceKey === 'yapi') {
      summary.push(details.config?.defaultProjectId ? `project=${details.config.defaultProjectId}` : null);
      summary.push(details.config?.defaultCategoryId ? `category=${details.config.defaultCategoryId}` : null);
    } else if (resourceKey === 'yuque') {
      summary.push(details.config?.defaultNamespace ? `namespace=${details.config.defaultNamespace}` : null);
      summary.push(details.config?.defaultSlugPrefix ? `slugPrefix=${details.config.defaultSlugPrefix}` : null);
    } else if (resourceKey === 'database') {
      summary.push(details.config?.defaultSourceId ? `source=${details.config.defaultSourceId}` : null);
      summary.push(details.config?.defaultDatabaseId ? `db=${details.config.defaultDatabaseId}` : null);
    } else if (resourceKey === 'redis') {
      summary.push(details.config?.defaultSourceId ? `source=${details.config.defaultSourceId}` : null);
      summary.push(details.config?.defaultKeyPrefix ? `prefix=${details.config.defaultKeyPrefix}` : null);
    } else if (resourceKey === 'sls') {
      summary.push(details.defaultEnv ? `env=${details.defaultEnv}` : null);
    }

    return summary.filter(Boolean).join(' ');
  });
}

function summarizeAiSelection(aiProvider, aiDetails) {
  if (!aiProvider) {
    return ['ai: none'];
  }

  const lines = [];
  const model = aiDetails?.model || defaultModelForProvider(aiProvider);
  lines.push(`ai: ${aiProvider}${model ? ` / model=${model}` : ''}`);
  if (aiDetails?.baseUrl) {
    lines.push(`baseUrl: ${aiDetails.baseUrl}`);
  }
  if (aiDetails?.apiKey) {
    lines.push('apiKey: configured');
  }
  if (aiDetails?.secretKey) {
    lines.push('secretKey: configured');
  }
  return lines;
}

function summarizeSkillSelection(selectedMcpSkills, selectedSkillDetails) {
  if (!selectedMcpSkills || selectedMcpSkills.length === 0) {
    return ['skills: none'];
  }

  return selectedMcpSkills.map((skillName) => {
    const details = selectedSkillDetails[skillName] || {};
    const summary = [skillName];

    if (skillName === 'log-audit' || skillName === 'sls-log-audit') {
      summary.push(details.defaultFormat ? `format=${details.defaultFormat}` : null);
      summary.push(typeof details.excludeInfrastructure === 'boolean' ? `excludeInfra=${details.excludeInfrastructure}` : null);
    } else if (skillName === 'data-logic-validation') {
      summary.push(details.database?.maxRows ? `dbRows=${details.database.maxRows}` : null);
      summary.push(details.redis?.scanCount ? `redisScan=${details.redis.scanCount}` : null);
    } else if (skillName === 'yapi-sync-interface') {
      summary.push(details.defaultProjectId ? `project=${details.defaultProjectId}` : null);
      summary.push(details.syncMode ? `mode=${details.syncMode}` : null);
    } else if (skillName === 'yuque-sync-design') {
      summary.push(details.defaultRepo ? `repo=${details.defaultRepo}` : null);
      summary.push(details.syncFormat ? `format=${details.syncFormat}` : null);
    } else if (skillName === 'code-review') {
      summary.push(Array.isArray(details.security?.severity) ? `severity=${details.security.severity.join('|')}` : null);
      summary.push(typeof details.quality?.enabled === 'boolean' ? `quality=${details.quality.enabled}` : null);
    } else if (skillName === 'project-review') {
      summary.push(details.checks ? `checks=${Object.entries(details.checks).filter(([, value]) => value).map(([key]) => key).join('|')}` : null);
    } else if (skillName === 'archive-change') {
      summary.push(details.location ? `location=${details.location}` : null);
    } else if (skillName === 'auto-flow') {
      summary.push(details.workflows?.path ? `workflowPath=${details.workflows.path}` : null);
      summary.push(details.execution?.maxConcurrent ? `maxConcurrent=${details.execution.maxConcurrent}` : null);
    } else if (skillName === 'api-sync') {
      summary.push(details.platform ? `platform=${details.platform}` : null);
      summary.push(details.connection?.projectId ? `project=${details.connection.projectId}` : null);
    }

    return summary.filter(Boolean).join(' ');
  });
}

function buildAiReviewLines(configDir, aiProvider, aiDetails) {
  return [
    `config: ${path.join(configDir, 'config.json')}`,
    ...summarizeAiSelection(aiProvider, aiDetails),
    `ai-config: ${path.join(configDir, 'ai-config.json')}`
  ];
}

function buildSkillReviewLines(configDir, selectedMcpSkills, selectedSkillDetails) {
  return [
    `skill-config: ${path.join(configDir, 'skill-config.json')}`,
    ...summarizeSkillSelection(selectedMcpSkills, selectedSkillDetails)
  ];
}

function buildResourceReviewLines(configDir, selectedResources, selectedResourceDetails) {
  const lines = [`resource-config: ${path.join(configDir, 'resource-config.json')}`];
  if (selectedResources.length > 0) {
    lines.push(`binding-config: ${path.join(configDir, 'component-config.json')}`);
    lines.push(...summarizeResourceSelection(selectedResources, selectedResourceDetails));
  } else {
    lines.push('bindings: none');
  }
  return lines;
}

function _buildFinalReviewLines(configDir, selectedMcpSkills, selectedSkillDetails, selectedResources, selectedResourceDetails, aiProvider, aiDetails) {
  const lines = [`config: ${path.join(configDir, 'config.json')}`];
  lines.push(...summarizeAiSelection(aiProvider, aiDetails));
  lines.push(...summarizeResourceSelection(selectedResources, selectedResourceDetails).map((line) => `resource: ${line}`));
  lines.push(...summarizeSkillSelection(selectedMcpSkills, selectedSkillDetails).map((line) => `skill: ${line}`));
  lines.push(`ai-config: ${path.join(configDir, 'ai-config.json')}`);
  lines.push(`resource-config: ${path.join(configDir, 'resource-config.json')}`);
  lines.push(`binding-config: ${path.join(configDir, 'component-config.json')}`);
  lines.push(`skill-config: ${path.join(configDir, 'skill-config.json')}`);
  return lines;
}

async function _confirmInitPage(title, lines, prompt = 'Continue to next step?') {
  console.log(chalk.cyan(`\n${title}`));
  for (const line of lines) {
    console.log(`  ${line}`);
  }

  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: prompt,
      default: true
    }
  ]);

  return Boolean(answer.confirm);
}

function printInitSummary(configDir, selectedMcpSkills, selectedResources, selectedResourceDetails, aiProvider, aiDetails) {
  console.log(chalk.cyan('\nInit summary:'));
  console.log(`  config: ${path.join(configDir, 'config.json')}`);

  if (aiProvider) {
    const model = aiDetails?.model || defaultModelForProvider(aiProvider);
    console.log(`  ai: ${aiProvider}${model ? ` / model=${model}` : ''}`);
    console.log(`  ai-config: ${path.join(configDir, 'ai-config.json')}`);
  }

  if (selectedMcpSkills.length > 0) {
    console.log(`  mcp: ${selectedMcpSkills.join(', ')}`);
  }

  if (selectedResources.length > 0) {
    console.log(`  mcp-bindings: ${summarizeResourceSelection(selectedResources, selectedResourceDetails).join(', ')}`);
    console.log(`  mcp-config: ${path.join(configDir, 'resource-config.json')}`);
    console.log(`  binding-config: ${path.join(configDir, 'component-config.json')}`);
  }

  console.log(`  skill-config: ${path.join(configDir, 'skill-config.json')}`);
}

// Global error handlers to prevent silent CLI crashes
process.on('uncaughtException', (err) => {
  console.error(chalk.red('\nUncaught Exception:'), err.message);
  restoreTerminal();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error(chalk.red('\nUnhandled Rejection:'), reason?.message || reason);
  restoreTerminal();
  process.exit(1);
});

// Handle SIGINT (Ctrl+C) to restore terminal state
process.on('SIGINT', () => {
  restoreTerminal();
  process.exit(0);
});

process.on('SIGTERM', () => {
  restoreTerminal();
  process.exit(0);
});

// Package info
const packageJson = require('../package.json');

// Create FlowMind instance
let flowmind;

/**
 * Initialize FlowMind
 */
async function initFlowMind(options = {}) {
  flowmind = new FlowMind(options);
  await flowmind.init();
  return flowmind;
}

/**
 * Display banner
 */
function showBanner(asciiMode = false) {
  if (asciiMode) {
    console.log(chalk.cyan(`
  +--------------------------------------------------+
  |                                                  |
  |   FlowMind                                       |
  |   The AI Agent That Learns How You Work          |
  |                                                  |
  +--------------------------------------------------+
  `));
    return;
  }

  console.log(chalk.cyan(`
  ╔══════════════════════════════════════════════════╗
  ║                                                ║
  ║   🧠 FlowMind                                  ║
  ║   The AI Agent That Learns How You Work        ║
  ║                                                ║
  ╚══════════════════════════════════════════════════╝
  `));
}

/**
 * Dragon Totem ASCII Art by level - Chinese Dragon (中国龙)
 */
function getDragonArt(level, asciiMode = false) {
  if (asciiMode) {
    const asciiArts = {
      0: [
        '        /-----\\        ',
        '       /  /-\\  \\       ',
        '      |  | o |  |      ',
        '      |  |   |  |      ',
        '      |   \\_/   |      ',
        '       \\       /       ',
        '        \\-----/        ',
        '        Dragon Egg     '
      ],
      1: [
        '          /--\\          ',
        '     /----/  \\---\\      ',
        '    /  o    \\/    \\     ',
        '    \\    /\\    /\\  /    ',
        '     \\/\\/  \\/\\/  \\/     ',
        '      Hatchling Dragon  '
      ],
      2: [
        '       /-\\  /-\\         ',
        '  /----/  \\/  \\---\\     ',
        ' /  o      __      \\    ',
        ' \\     /--------\\  /    ',
        '  \\---/  //////  \\/     ',
        '   \\_/          \\_/     ',
        '      Juvenile Dragon   '
      ],
      3: [
        '     /---\\  /---\\       ',
        ' /---/   \\/   \\---\\     ',
        '/  o       __      \\    ',
        '|    /----------\\  |    ',
        ' \\--/  ////////  \\-/    ',
        '  \\/  //////////  \\/    ',
        '   \\_/          \\_/     ',
        '       Adult Dragon     '
      ],
      4: [
        '   /---\\      /---\\     ',
        '/---/   \\____/   \\---\\  ',
        '| o        __        |  ',
        '|   /------------\\   |  ',
        ' \\-/  //////////// \\-/  ',
        '  /  ////////////  \\    ',
        ' /_/              \\_\\   ',
        '       Elder Dragon     '
      ],
      5: [
        ' * /---\\      /---\\ *   ',
        '/-/   \\______/   \\-\\    ',
        '| o        __        |  ',
        '|   /--------------\\ |  ',
        ' \\-/  /////**/////  \\-/ ',
        '  /  /////    /////  \\  ',
        ' /_/   **      **   \\_\\ ',
        ' * \\______________/ *   ',
        '     Ascended Dragon    '
      ]
    };
    return asciiArts[level] || asciiArts[0];
  }

  const arts = {
    0: [
      '        ╭─────╮        ',
      '       ╱  ╭─╮  ╲       ',
      '      │  │   │  │      ',
      '      │  │ ◎ │  │      ',
      '      │   ╰─╯   │      ',
      '       ╲       ╱       ',
      '        ╰─────╯        ',
      '      龙 蛋 (Egg)      '
    ],
    1: [
      '           ╭──╮            ',
      '      ╭────╯  ╰───╮        ',
      '     ╱  ◎    ╰─╯   ╲      ',
      '    ╱    ▽           ╲     ',
      '    ╲    ╱╲   ╱╲     ╱     ',
      '     ╲╱╱  ╲╱╱  ╲╱╲╱       ',
      '       幼 龙 (Hatchling)   '
    ],
    2: [
      '        ╭─╮  ╭─╮             ',
      '   ╭────╯ ╰──╯ ╰───╮         ',
      '  ╱  ◎      ╰──╯     ╲       ',
      ' ╱      ╭────────╮     ╲     ',
      ' ╲     ╱ ╱╱╱╱╱╱╱╱ ╲    ╱     ',
      '  ╲───╯ ╱╱╱╱╱╱╱╱╱╱ ╰──╱      ',
      '   ╲   ╱╱╱╱╱╱╱╱╱╱╱╱  ╱       ',
      '    ╰─╯            ╰─╯       ',
      '    少 年 龙 (Juvenile)       '
    ],
    3: [
      '      ╭───╮  ╭───╮               ',
      '  ╭───╯   ╰──╯   ╰───╮           ',
      ' ╱  ◎        ╰───╯     ╲         ',
      '│     ╭──────────╮      │        ',
      '│    ╱ ╱╱╱╱╱╱╱╱╱╱ ╲     │        ',
      ' ╲──╯ ╱╱╱╱╱╱╱╱╱╱╱╱ ╰───╯        ',
      '  ╲  ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ╱         ',
      '   ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱          ',
      '    ╰───╯       ╰───╯            ',
      '    成 年 龙 (Adult)              '
    ],
    4: [
      '    ╭───╮      ╭───╮                 ',
      '╭───╯   ╰──────╯   ╰───╮             ',
      '│  ◎           ╰───╯     │           ',
      '│      ╭────────────╮    │           ',
      '│     ╱ ╱╱╱╱╱╱╱╱╱╱╱╱ ╲   │           ',
      ' ╲───╯ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱ ╰──╯          ',
      '  ╲   ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ╲          ',
      '   ╲─╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╰─╲         ',
      '    ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱         ',
      '     ╰───╯         ╰───╯             ',
      '     长 老 龙 (Elder)                 '
    ],
    5: [
      '  ★  ╭───╮          ╭───╮  ★           ',
      '╭─╯   ╰──╯          ╰──╯   ╰─╮         ',
      '│  ◎            ╰───╯         │         ',
      '│       ╭──────────────╮      │         ',
      '│      ╱ ★╱╱╱╱╱╱╱╱╱╱★╱╱ ╲     │         ',
      ' ╲────╯ ╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱ ╰───╯         ',
      '  ╲    ╱╱╱╱★╱╱╱╱╱╱╱╱★╱╱╱╱╱  ╲          ',
      '   ╲──╯╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╰──╲         ',
      '    ╲─╯╱╱╱★╱╱╱╱╱╱╱╱★╱╱╱╱╱╰──╲         ',
      '  ★  ╲╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱╱  ★       ',
      '       ╰───╯           ╰───╯            ',
      '       升 龙 (Ascended)                 '
    ]
  };
  return arts[level] || arts[0];
}

/**
 * Get dragon color function for a level
 */
function getDragonColor(level) {
  const colors = {
    0: (text) => chalk.gray(text),
    1: (text) => chalk.cyan(text),
    2: (text) => chalk.cyan.bold(text),
    3: (text) => chalk.cyanBright(text),
    4: (text) => chalk.cyanBright.bold(text),
    5: (text) => chalk.cyanBright.bold(text)
  };
  return colors[level] || colors[0];
}

/**
 * Get highlight color for Ascended level
 */
function getHighlightColor(level) {
  if (level >= 5) {
    return (text) => chalk.whiteBright(text);
  }
  return (text) => text;
}

/**
 * Render dragon totem with honor data
 */
function renderDragonTotem(honorData, asciiMode = false) {
  const info = getLevelInfo(honorData.points);
  const dragonColor = getDragonColor(info.level);
  const highlightColor = getHighlightColor(info.level);
  const art = getDragonArt(info.level, asciiMode);

  // Calculate max art line width for proper padding
  const maxArtWidth = Math.max(...art.map(l => l.length));
  const boxWidth = Math.max(maxArtWidth + 8, 55);

  const border = '─'.repeat(boxWidth - 2);
  const padRight = (text, width) => {
    const padding = Math.max(0, width - text.length);
    return ' '.repeat(padding);
  };

  console.log('');
  console.log(chalk.cyan('  ┌' + border + '┐'));
  const title = asciiMode ? '  Dragon Totem of Honor  ' : '  🐉 Dragon Totem of Honor  ';
  console.log(chalk.cyan('  │') + title + padRight(title, boxWidth - 2) + chalk.cyan('│'));
  console.log(chalk.cyan('  ├' + border + '┤'));

  for (const line of art) {
    const padded = '  ' + line + padRight('  ' + line, boxWidth - 2);
    console.log(chalk.cyan('  │') + dragonColor(padded) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('  ├' + border + '┤'));

  const levelLine = `  Level: ${info.level} - ${info.name}`;
  const pointsLine = `  Points: ${honorData.points}`;
  const stateLine = `  State: ${info.state}`;

  console.log(chalk.cyan('  │') + highlightColor(levelLine + padRight(levelLine, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + highlightColor(pointsLine + padRight(pointsLine, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + highlightColor(stateLine + padRight(stateLine, boxWidth - 2)) + chalk.cyan('│'));

  if (info.nextLevel) {
    const nextLine = `  Next: ${info.pointsToNext} points to ${info.nextLevelName}`;
    console.log(chalk.cyan('  │') + chalk.gray(nextLine + padRight(nextLine, boxWidth - 2)) + chalk.cyan('│'));
  } else {
    const maxLine = '  Maximum level reached!';
    console.log(chalk.cyan('  │') + chalk.yellow(maxLine + padRight(maxLine, boxWidth - 2)) + chalk.cyan('│'));
  }

  console.log(chalk.cyan('  ├' + border + '┤'));

  const statsTitle = '  Stats:';
  console.log(chalk.cyan('  │') + chalk.white(statsTitle + padRight(statsTitle, boxWidth - 2)) + chalk.cyan('│'));

  const stats1 = `    Skills Used: ${honorData.stats.skillUseCount}`;
  const stats2 = `    New Skills: ${honorData.stats.newSkillCount}`;
  const stats3 = `    Learnings: ${honorData.stats.learningCount}`;

  console.log(chalk.cyan('  │') + chalk.gray(stats1 + padRight(stats1, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + chalk.gray(stats2 + padRight(stats2, boxWidth - 2)) + chalk.cyan('│'));
  console.log(chalk.cyan('  │') + chalk.gray(stats3 + padRight(stats3, boxWidth - 2)) + chalk.cyan('│'));

  console.log(chalk.cyan('  └' + border + '┘'));
  console.log('');
}

/**
 * Get level info for points
 */
function getLevelInfo(points) {
  const levels = [
    { level: 0, minPoints: 0,   name: 'Egg',       state: 'dormant' },
    { level: 1, minPoints: 1,   name: 'Hatchling',  state: 'awakening' },
    { level: 2, minPoints: 10,  name: 'Juvenile',   state: 'growing' },
    { level: 3, minPoints: 30,  name: 'Adult',       state: 'soaring' },
    { level: 4, minPoints: 60,  name: 'Elder',       state: 'wise' },
    { level: 5, minPoints: 100, name: 'Ascended',   state: 'transcendent' }
  ];

  let current = levels[0];
  let next = levels[1];

  for (const tier of levels) {
    if (points >= tier.minPoints) {
      current = tier;
      next = levels[tier.level + 1] || null;
    }
  }

  return {
    level: current.level,
    name: current.name,
    state: current.state,
    nextLevel: next ? next.level : null,
    nextLevelName: next ? next.name : null,
    pointsToNext: next ? next.minPoints - points : 0
  };
}

/**
 * Get hint for next level
 */
function getNextLevelHint(points) {
  const info = getLevelInfo(points);
  if (info.nextLevel) {
    return `Earn ${info.pointsToNext} more points to reach ${info.nextLevelName} (Level ${info.nextLevel})`;
  }
  return 'You have reached the maximum dragon level!';
}

/**
 * Publish honor data
 */
async function publishHonor(options) {
  const configDir = getFlowMindConfigDir();
  const honorPath = path.join(configDir, 'honor.json');

  if (!await fs.pathExists(honorPath)) {
    console.error(chalk.red('No honor data found. Run flowmind init first.'));
    return;
  }

  const honorData = await fs.readJson(honorPath);
  const info = getLevelInfo(honorData.points);

  const exportData = {
    version: honorData.version,
    points: honorData.points,
    level: info.level,
    levelName: info.name,
    state: info.state,
    stats: honorData.stats,
    knownSkillsCount: honorData.knownSkills ? honorData.knownSkills.length : 0,
    recentHistory: (honorData.history || []).slice(-20),
    exportedAt: new Date().toISOString()
  };

  // Export to local JSON file
  const outputPath = options.output || 'flowmind-honor.json';
  await fs.writeJson(outputPath, exportData, { spaces: 2 });
  console.log(chalk.green(`✓ Honor data exported to: ${outputPath}`));

  // Create GitHub Gist if requested
  if (options.gist) {
    try {
      // Check if gh CLI is available
      try {
        execSync('gh --version', { stdio: 'ignore' });
      } catch {
        console.error(chalk.red('GitHub CLI (gh) is not installed. Install it from https://cli.github.com/'));
        return;
      }

      const gistContent = JSON.stringify(exportData, null, 2);
      const gistDescription = `FlowMind Honor: Level ${info.level} (${info.name}) - ${honorData.points} points`;

      // Create gist using gh CLI
      const gistCommand = `gh gist create --public --desc "${gistDescription}" --filename "flowmind-honor.json" - <<< '${gistContent.replace(/'/g, "'\\''")}'`;

      const gistUrl = execSync(gistCommand, { encoding: 'utf-8' }).trim();
      console.log(chalk.green(`✓ GitHub Gist created: ${gistUrl}`));
    } catch (error) {
      console.error(chalk.red(`Failed to create Gist: ${error.message}`));
    }
  }
}

// CLI Commands
program
  .name('flowmind')
  .description('The AI Agent That Learns How You Work')
  .version(packageJson.version);

// Init command
program
  .command('init')
  .description('Initialize FlowMind in current directory')
  .option('--ai <provider>', 'Initialize with AI provider (openai/anthropic/glm/mimo/qwen/ernie/deepseek/ollama)')
  .option('--model <model>', 'Specify AI model during init')
  .option('--base-url <url>', 'Specify AI base URL during init')
  .option('--api-key <key>', 'Specify AI API key during init')
  .option('--secret-key <key>', 'Specify Baidu ERNIE secret key during init')
  .action(async (options) => {
    showBanner(options.ascii || shouldUseAsciiUi());

    const spinner = ora('Initializing FlowMind...').start();

    try {
      // Create config directory
      const configDir = getFlowMindConfigDir();
      await fs.ensureDir(configDir);
      await fs.ensureDir(path.join(configDir, 'learning'));
      await fs.ensureDir(path.join(configDir, 'learning', 'records'));

      // Create default config
      const configPath = path.join(configDir, 'config.json');
      if (!await fs.pathExists(configPath)) {
        await fs.writeJson(configPath, buildBaseConfig(configDir), { spaces: 2 });
      }

      spinner.stop();

      const supportedAiProviders = new Set(getAiProviderChoices().map((choice) => choice.value));
      const interactive = process.stdin.isTTY && process.stdout.isTTY;
      const requestedAiProvider = options.ai && supportedAiProviders.has(options.ai) ? options.ai : null;
      const requestedDefaults = {
        model: options.model || null,
        baseUrl: options.baseUrl || null,
        apiKey: options.apiKey || null,
        secretKey: options.secretKey || null
      };

      const initState = {
        aiProvider: null,
        aiDetails: null,
        selectedResources: [],
        selectedResourceDetails: {},
        selectedMcpSkills: [],
        selectedSkillDetails: {},
        lastModule: 'ai'
      };

      if (interactive) {
        while (true) {
          const moduleChoice = await promptInitModuleChoice(initState);
          if (moduleChoice === 'finish') {
            break;
          }

          initState.lastModule = moduleChoice;
          if (moduleChoice === 'ai') {
            const result = await runAiInitModule({
              configDir,
              interactive: true,
              requestedAiProvider,
              requestedDefaults
            });
            if (result.status === 'exit') {
              return;
            }
            if (result.status === 'saved') {
              initState.aiProvider = result.aiProvider;
              initState.aiDetails = result.aiDetails;
            }
          } else if (moduleChoice === 'mcp') {
            const result = await runMcpInitModule({
              configDir,
              interactive: true
            });
            if (result.status === 'exit') {
              return;
            }
            if (result.status === 'saved') {
              initState.selectedResources = result.selectedResources;
              initState.selectedResourceDetails = result.selectedResourceDetails;
            }
          } else if (moduleChoice === 'skills') {
            const result = await runSkillInitModule({
              configDir,
              interactive: true
            });
            if (result.status === 'exit') {
              return;
            }
            if (result.status === 'saved') {
              initState.selectedMcpSkills = result.selectedMcpSkills;
              initState.selectedSkillDetails = result.selectedSkillDetails;
            }
          }
        }
      } else {
        if (requestedAiProvider) {
          const result = await runAiInitModule({
            configDir,
            interactive: false,
            requestedAiProvider,
            requestedDefaults
          });
          if (result.status === 'saved') {
            initState.aiProvider = result.aiProvider;
            initState.aiDetails = result.aiDetails;
          }
        } else {
          const mcpResult = await runMcpInitModule({
            configDir,
            interactive: false
          });
          const skillResult = await runSkillInitModule({
            configDir,
            interactive: false
          });
          if (mcpResult.status === 'saved') {
            initState.selectedResources = mcpResult.selectedResources;
            initState.selectedResourceDetails = mcpResult.selectedResourceDetails;
          }
          if (skillResult.status === 'saved') {
            initState.selectedMcpSkills = skillResult.selectedMcpSkills;
            initState.selectedSkillDetails = skillResult.selectedSkillDetails;
          }
        }
      }

      spinner.start('Finalizing configuration...');
      spinner.succeed('Initialization completed');
      console.log(chalk.green('\n✓ Configuration created at:'), configDir);
      console.log(chalk.green('✓ Learning system ready'));
      console.log(chalk.green('✓ Scene mapping ready'));
      printInitSummary(
        configDir,
        initState.selectedMcpSkills,
        initState.selectedResources,
        initState.selectedResourceDetails,
        initState.aiProvider,
        initState.aiDetails
      );
      console.log(chalk.cyan(`\nConfigured ${initState.selectedMcpSkills.length} MCP skill(s) and ${initState.selectedResources.length} binding group(s).`));

      if (!initState.aiProvider) {
        console.log(chalk.yellow('No AI model configured. You can still use FlowMind with rule-based behavior.'));
      }

      console.log(chalk.green('\nFlowMind init completed successfully.'));
      console.log(chalk.cyan('Next steps:'));
      console.log('  1. Run', chalk.yellow('flowmind'), 'to start interactive mode');
      console.log('  2. Or use', chalk.yellow('flowmind "your request"'), 'for single commands');
      console.log('  3. FlowMind will learn from your corrections automatically');

      if (!initState.aiProvider) {
        console.log(chalk.cyan('To enable AI features:'));
        console.log('  Run', chalk.yellow('flowmind init --ai openai'), 'or', chalk.yellow('flowmind init --ai anthropic'));
        console.log('  Or configure manually:', chalk.yellow('~/.flowmind/ai-config.json'));
      }

      // Award honor point for init without blocking the main init flow.
      setImmediate(async () => {
        try {
          const honorEngine = new HonorEngine({ get: (key, def) => def });
          honorEngine.honorPath = path.join(configDir, 'honor.json');
          await honorEngine.init();
          await honorEngine.award('init', 'FlowMind initialized');
          console.log(chalk.green('\n✓ Honor system activated (+1 point)'));
        } catch (honorError) {
          // Non-blocking
        }
      });

    } catch (error) {
      spinner.fail('Failed to initialize FlowMind');
      console.error(chalk.red(error.message));
    }
  });

// Process command (default)
program
  .command('process')
  .alias('p')
  .description('Process a request')
  .argument('[input]', 'Input to process')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .option('-s, --skill <skill>', 'Use specific skill')
  .option('-v, --verbose', 'Verbose output')
  .action(async (input, options) => {
    try {
      const fm = await initFlowMind();

      if (!input) {
        // Interactive mode
        await runInteractiveMode(fm);
      } else {
        // Single command mode
        const spinner = options.json ? null : ora('Processing...').start();

        const result = await fm.process(input, {
          skill: options.skill,
          verbose: options.verbose
        });

        if (spinner) {
          spinner.stop();
        }

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
          if (result.type === 'error') {
            process.exitCode = 1;
          }
        } else {
          displayResult(result);
        }
      }
    } catch (error) {
      if (options.json) {
        console.log(JSON.stringify({
          type: 'error',
          message: error.message
        }, null, 2));
        process.exitCode = 1;
      } else {
        console.error(chalk.red('Error:'), error.message);
      }
    } finally {
      restoreTerminal();
    }
  });

// Learn command
program
  .command('learn')
  .description('Manage learning records')
  .option('-l, --list', 'List learning records')
  .option('-s, --skill <skill>', 'Filter by skill')
  .option('-t, --type <type>', 'Filter by type')
  .option('-e, --export [file]', 'Export learnings')
  .option('-i, --import <file>', 'Import learnings')
  .option('-b, --bundle', 'Export as an installable portable bundle')
  .option('-I, --install <file>', 'Install a portable learning bundle')
  .option('-r, --reset <skill>', 'Reset skill learnings')
  .option('-d, --delete <id>', 'Delete learning record')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.list) {
        const stats = await fm.getStats();
        displayStats(stats);
      } else if (options.install) {
        const data = await fs.readJson(options.install);
        const result = await fm.importLearnings(data);
        console.log(chalk.green('✓ Learning bundle installed successfully'));
        if (result && result.bundle) {
          console.log(chalk.gray(`  Records imported: ${result.imported || 0}`));
        }
      } else if (options.export) {
        const exportPath = options.export || 'flowmind-learnings.json';
        await fm.exportLearnings({
          output: exportPath,
          bundle: !!options.bundle
        });
        console.log(chalk.green(options.bundle ? '✓ Learning bundle exported to:' : '✓ Learnings exported to:'), exportPath);
      } else if (options.import) {
        const data = await fs.readJson(options.import);
        const result = await fm.importLearnings(data);
        console.log(chalk.green(result && result.bundle ? '✓ Learning bundle installed successfully' : '✓ Learnings imported successfully'));
      } else if (options.reset) {
        const count = await fm.learning.resetSkill(options.reset);
        console.log(chalk.green(`✓ Reset ${count} learning(s) for skill: ${options.reset}`));
      } else if (options.delete) {
        const deleted = await fm.learning.deleteRecord(options.delete);
        if (deleted) {
          console.log(chalk.green(`✓ Deleted learning record: ${options.delete}`));
        } else {
          console.log(chalk.yellow(`Record not found: ${options.delete}`));
        }
      } else {
        // Default to list
        const stats = await fm.getStats();
        displayStats(stats);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Scenes command
program
  .command('scenes')
  .description('Manage scene mappings')
  .option('-l, --list', 'List scenes')
  .option('-a, --add', 'Add new scene')
  .option('-r, --remove <id>', 'Remove scene')
  .option('-e, --export [file]', 'Export scenes')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.list) {
        const scenes = fm.matcher.listScenes();
        displayScenes(scenes);
      } else if (options.add) {
        await addSceneInteractive(fm);
      } else if (options.remove) {
        await fm.matcher.removeScene(options.remove);
        console.log(chalk.green('✓ Scene removed'));
      } else if (options.export) {
        const exportPath = options.export || 'flowmind-scenes.json';
        const scenes = fm.matcher.listScenes();
        await fs.writeJson(exportPath, scenes, { spaces: 2 });
        console.log(chalk.green('✓ Scenes exported to:'), exportPath);
      } else {
        // Default to list
        const scenes = fm.matcher.listScenes();
        displayScenes(scenes);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Skills command (enhanced)
program
  .command('skills')
  .description('List available skills')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .option('-v, --verbose', 'Show detailed information')
  .option('-c, --category <category>', 'Filter by category')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const skills = fm.skills.list();

      // Filter by category if specified
      const filtered = options.category
        ? skills.filter(s => s.category === options.category)
        : skills;

      if (options.json) {
        // JSON output for codex/claude integration
        console.log(JSON.stringify({ skills: filtered }, null, 2));
      } else {
        displaySkills(filtered, options.verbose);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Skill command (view/modify single skill)
program
  .command('skill <name>')
  .description('View or modify skill configuration')
  .option('-i, --info', 'Show skill info (default)')
  .option('-c, --config', 'Show/edit skill configuration')
  .option('-s, --set <key>', 'Set config value (value as next argument)')
  .option('-r, --read', 'Read SKILL.md content')
  .option('-e, --edit', 'Open SKILL.md in editor')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .action(async (name, options) => {
    try {
      const fm = await initFlowMind();
      const skill = fm.skills.get(name);

      if (!skill) {
        console.error(chalk.red(`Skill not found: ${name}`));
        console.log(chalk.cyan('\nAvailable skills:'));
        fm.skills.list().forEach(s => console.log(`  - ${s.name}`));
        return;
      }

      // Default to info if no option specified
      if (!options.config && !options.read && !options.edit && !options.set) {
        options.info = true;
      }

      if (options.info) {
        await showSkillInfo(skill, options.json);
      } else if (options.read) {
        await readSkillMd(skill);
      } else if (options.edit) {
        await editSkillMd(skill);
      } else if (options.config) {
        await showSkillConfig(skill, fm, options.json);
      } else if (options.set) {
        const value = getTrailingValueForOption(process.argv.slice(2), ['--set', '-s']);
        if (value) {
          await setSkillConfig(skill, fm, options.set, value);
        } else {
          console.error(chalk.red('Usage: flowmind skill <name> --set <key> <value>'));
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Resource command (local resource files)
program
  .command('resource')
  .alias('res')
  .description('Manage FlowMind resource state, learned bindings, and local files under FLOWMIND_HOME/.flowmind')
  .option('-l, --list [dir]', 'List resource directory')
  .option('-s, --show <file>', 'Show file content')
  .option('-e, --edit <file>', 'Edit file')
  .option('-c, --config', 'Show resource configuration')
  .option('--sync-sdd-agent [dir]', 'Explicitly import local SDD-Agent resources and scenes into FlowMind')
  .option('-j, --json', 'Output as JSON (for tool integration)')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const resourceConfig = fm.config.get('resources', {});
      const configDir = getFlowMindConfigDir();
      const componentStatus = fm.getComponentStatus ? fm.getComponentStatus() : {};
      const bindings = await fm.learning.listResourceBindings();

      if (options.syncSddAgent !== undefined) {
        const summary = await syncSddAgentToFlowMind({
          sourceDir: typeof options.syncSddAgent === 'string' ? options.syncSddAgent : undefined
        });

        if (options.json) {
          console.log(JSON.stringify({ synced: summary }, null, 2));
        } else {
          displayResourceSyncSummary(summary);
        }
      } else if (options.config) {
        // Show resource configuration
        if (options.json) {
          console.log(JSON.stringify({ resources: resourceConfig }, null, 2));
        } else {
          displayResourceConfig(resourceConfig);
        }
      } else if (options.show) {
        // Show file content
        const filePath = resolveResourcePath(options.show, configDir);
        if (await fs.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf-8');
          if (options.json) {
            console.log(JSON.stringify({ file: options.show, content }, null, 2));
          } else {
            console.log(chalk.cyan(`\n📄 ${options.show}`));
            console.log(chalk.gray('─'.repeat(50)));
            console.log(content);
          }
        } else {
          console.error(chalk.red(`File not found: ${options.show}`));
        }
      } else if (options.edit) {
        // Edit file
        const filePath = resolveResourcePath(options.edit, configDir);
        await openInEditor(filePath);
      } else if (options.list !== undefined) {
        // List directory (default)
        const targetDir = options.list && typeof options.list === 'string'
          ? resolveResourcePath(options.list, configDir)
          : configDir;

        if (await fs.pathExists(targetDir)) {
          const files = await listResourceFiles(targetDir, configDir);
          if (options.json) {
            console.log(JSON.stringify({ directory: targetDir, files }, null, 2));
          } else {
            displayResourceFiles(files, targetDir);
          }
        } else {
          console.error(chalk.red(`Directory not found: ${targetDir}`));
        }
      } else if (options.json) {
        console.log(JSON.stringify({
          resources: resourceConfig,
          componentStatus,
          bindings,
          examples: getResourceSetupExamples()
        }, null, 2));
      } else {
        displayResourceOverview({
          resourceConfig,
          componentStatus,
          bindings,
          configDir
        });
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Stats command
program
  .command('stats')
  .description('Show FlowMind statistics')
  .action(async () => {
    try {
      const fm = await initFlowMind();
      const stats = await fm.getStats();
      displayStats(stats);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Honor command
program
  .command('honor')
  .description('Show honor points and dragon totem')
  .option('-j, --json', 'Output as JSON')
  .option('-p, --publish', 'Export honor data to JSON file')
  .option('-g, --gist', 'Create GitHub Gist (with --publish)')
  .option('-o, --output <file>', 'Output file path (default: flowmind-honor.json)')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const honorData = fm.getHonorData();

      if (options.json) {
        console.log(JSON.stringify(honorData, null, 2));
      } else if (options.publish) {
        await publishHonor({ output: options.output, gist: options.gist });
      } else {
        renderDragonTotem(honorData, shouldUseAsciiUi());
        console.log(chalk.gray(`  ${getNextLevelHint(honorData.points)}`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Config command
program
  .command('config')
  .description('Manage configuration')
  .option('-l, --list', 'List configuration')
  .option('-s, --set <key>', 'Set configuration value (value as next argument)')
  .option('-g, --get <key>', 'Get configuration value')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.list) {
        const config = fm.config.getAll();
        console.log(chalk.cyan('\nFlowMind Configuration:'));
        console.log(JSON.stringify(config, null, 2));
      } else if (options.set) {
        const value = getTrailingValueForOption(process.argv.slice(2), ['--set', '-s']);
        if (value) {
          fm.config.set(options.set, parseCliValue(value));
          await fm.config.save();
          console.log(chalk.green('✓ Configuration updated'));
        } else {
          console.error(chalk.red('Usage: flowmind config --set <key> <value>'));
        }
      } else if (options.get) {
        const value = fm.config.get(options.get);
        console.log(value);
      } else {
        const config = fm.config.getAll();
        console.log(JSON.stringify(config, null, 2));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// AI command
program
  .command('ai')
  .description('Manage AI model configuration')
  .option('-s, --status', 'Show AI model status')
  .option('-l, --list', 'List available providers')
  .option('-c, --config', 'Show AI configuration')
  .option('-t, --test [provider]', 'Test AI provider connection')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();

      if (options.status) {
        const status = fm.getAIStatus();
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          displayAIStatus(status);
        }
      } else if (options.list) {
        const status = fm.getAIStatus();
        const providers = Object.entries(status.providers).map(([name, info]) => ({
          name,
          ...info
        }));
        if (options.json) {
          console.log(JSON.stringify({ providers }, null, 2));
        } else {
          console.log(chalk.cyan('\nAI Providers:'));
          for (const provider of providers) {
            const providerStatus = provider.initialized ? chalk.green('✓') : chalk.red('✗');
            console.log(`  ${providerStatus} ${provider.name}`);
            if (provider.info?.model) {
              const modelSuffix = status.defaultModel && provider.info.model === status.defaultModel ? ' (global)' : ' (override)';
              console.log(`    Model: ${provider.info.model}${modelSuffix}`);
            }
          }
        }
      } else if (options.config) {
        const config = fm.config.get('ai', {});
        if (options.json) {
          console.log(JSON.stringify({ ai: config }, null, 2));
        } else {
          console.log(chalk.cyan('\nAI Configuration:'));
          console.log(JSON.stringify(config, null, 2));
        }
      } else if (options.test !== undefined) {
        const providerName = options.test || fm.ai.defaultProvider;
        const provider = fm.ai.getProvider(providerName);
        if (!provider) {
          console.error(chalk.red(`Provider not found: ${providerName}`));
          return;
        }
        console.log(chalk.cyan(`\nTesting ${providerName}...`));
        try {
          const result = await provider.complete('Hello, this is a test.', { maxTokens: 50 });
          console.log(chalk.green('✓ Connection successful'));
          console.log(chalk.white('Response:'), result.substring(0, 100) + '...');
        } catch (error) {
          console.log(chalk.red('✗ Connection failed'));
          console.error(chalk.red(error.message));
        }
      } else {
        // Default to status
        const status = fm.getAIStatus();
        if (options.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          displayAIStatus(status);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    }
  });

// Interactive mode
async function runInteractiveMode(fm) {
  showBanner(shouldUseAsciiUi());
  console.log(chalk.cyan('Interactive mode started. Type "exit" to quit.\n'));

  try {
    while (true) {
      let input;
      try {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'input',
            message: chalk.green('You:'),
            prefix: ''
          }
        ]);
        input = answers.input;
      } catch (promptErr) {
        // inquirer throws on SIGINT (Ctrl+C)
        console.log(chalk.cyan('\nGoodbye! 👋\n'));
        break;
      }

      if (isExitCommand(input)) {
        console.log(chalk.cyan('\nGoodbye! FlowMind will remember your preferences. 👋\n'));
        break;
      }

      if (!input.trim()) continue;

      const spinner = ora('Thinking...').start();

      try {
        const result = await fm.process(input);
        spinner.stop();
        displayResult(result);
        if (await maybeHandleBindingFlow(fm, input, result)) {
          console.log(chalk.green('✓ Binding saved'));
          const retry = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'retry',
              message: chalk.cyan('Retry the original request now?'),
              default: true
            }
          ]);

          if (retry.retry) {
            const retrySpinner = ora('Retrying...').start();
            try {
              const retryResult = await fm.process(input);
              retrySpinner.stop();
              displayResult(retryResult);
            } catch (retryError) {
              retrySpinner.stop();
              console.error(chalk.red('Error:'), retryError.message);
            }
          }
        }
      } catch (error) {
        spinner.stop();
        console.error(chalk.red('Error:'), error.message);
      }

      console.log(''); // Empty line for spacing
    }
  } finally {
    restoreTerminal();
  }
}

// Add scene interactive
async function addSceneInteractive(fm) {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Scene name:',
    },
    {
      type: 'input',
      name: 'keywords',
      message: 'Keywords (comma separated):',
    },
    {
      type: 'input',
      name: 'patterns',
      message: 'Trigger patterns (comma separated):',
    },
    {
      type: 'input',
      name: 'skills',
      message: 'Skills to execute (comma separated):',
    }
  ]);

  const scene = {
    name: answers.name,
    keywords: answers.keywords.split(',').map(k => k.trim()),
    patterns: answers.patterns.split(',').map(p => p.trim()),
    workflow: {
      skills: answers.skills.split(',').map(s => ({
        skill: s.trim(),
        params: {}
      }))
    }
  };

  await fm.matcher.addScene(scene);
  console.log(chalk.green('✓ Scene added successfully'));
}

// Display functions
function displayResult(result) {
  const payload = extractDisplayedPayload(result);

  if (result.type === 'learning') {
    console.log(chalk.cyan(result.message));
  } else if (result.type === 'result') {
    console.log(chalk.white('\n┌─────────────────────────────────────────────────────┐'));
    console.log(chalk.white('│ Result                                              │'));
    console.log(chalk.white('├─────────────────────────────────────────────────────┤'));

    if (result.metadata?.skill) {
      console.log(chalk.white(`│ Skill: ${result.metadata.skill}`));
    }
    if (result.metadata?.duration) {
      console.log(chalk.white(`│ Duration: ${result.metadata.duration}ms`));
    }
    if (result.metadata?.sceneMatch) {
      console.log(chalk.white(`│ Scene: ${result.metadata.sceneMatch.scene.name}`));
    }

    console.log(chalk.white('├─────────────────────────────────────────────────────┤'));
    console.log(chalk.white('│'));

    const formattedText = formatResultText(result, { colorize: true });
    const outputText = formattedText || (typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2));
    const shouldPreserveAnsi = /\u001b\[/.test(outputText);
    console.log(shouldPreserveAnsi ? outputText : chalk.white(outputText));

    console.log(chalk.white('│'));
    console.log(chalk.white('└─────────────────────────────────────────────────────┘'));
  } else if (result.type === 'error') {
    console.log(chalk.red('\n✗ Error:'), result.message);
    const bindingHint = extractBindingHint(result);
    if (bindingHint?.message) {
      console.log(chalk.yellow(bindingHint.message));
    }
    if (bindingHint?.suggestedCommand) {
      console.log(chalk.gray(`Hint: ${bindingHint.suggestedCommand}`));
    }
  }
}

async function maybeHandleBindingFlow(fm, input, result) {
  const bindingHint = extractBindingHint(result);
  if (!bindingHint || !bindingHint.message || !shouldHandleBindingFlow(bindingHint, result)) {
    return false;
  }

  const shouldBind = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'bindNow',
      message: chalk.yellow('当前请求缺少可复用配置，是否现在绑定？'),
      default: true
    }
  ]);

  if (!shouldBind.bindNow) {
    return false;
  }

  const resolution = extractBindingResolution(result);
  if (bindingHint.kind === 'mcp-binding') {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'business',
        message: 'Binding name:',
        default: inferMcpBindingBusiness(bindingHint, input, resolution)
      },
      {
        type: 'input',
        name: 'endpoint',
        message: 'MCP endpoint:',
        default: resolution.endpoint || bindingHint.fields?.endpoint || ''
      },
      {
        type: 'input',
        name: 'headers',
        message: 'Headers JSON:',
        default: '{}'
      }
    ]);

    const headers = parseHeadersJson(answers.headers);
    if (headers === null) {
      console.log(chalk.red('Headers JSON 格式错误，请输入合法的 JSON 对象。'));
      return false;
    }

    const saved = await fm.learning.saveResourceBinding({
      business: answers.business || inferMcpBindingBusiness(bindingHint, input, resolution),
      componentType: 'mcp',
      provider: bindingHint.serverName || 'mcp',
      mcpServer: bindingHint.serverName || null,
      source: 'dialog-mcp-bind',
      aliases: buildMcpBindingAliases(input, answers, resolution, bindingHint),
      keywords: buildMcpBindingKeywords(input, answers, resolution, bindingHint),
      connection: {
        endpoint: answers.endpoint || null,
        headers
      },
      metadata: {
        input,
        source: 'interactive-binding',
        tool: bindingHint.tool || null,
        suggestedCommand: bindingHint.suggestedCommand || null
      }
    }, {
      currentSkill: 'mcp-binding'
    });

    console.log(chalk.green(`Bound MCP service as: ${saved.business}`));
    return true;
  }

  const envDefault = resolution.env || inferLogEnvironmentFromInput(input) || 'test';
  const businessDefault = inferLogBindingBusiness(input, resolution);
  const endpointDefault = resolution.endpoint || endpointForEnv(envDefault);
  const projectDefault = resolution.project || inferLogProjectFromInput(input);
  const logstoreDefault = resolution.logstore || inferLogstoreFromInput(input);

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'business',
      message: 'Binding name:',
      default: businessDefault
    },
    {
      type: 'list',
      name: 'env',
      message: 'Environment:',
      choices: ['test', 'uat', 'gray', 'prod'],
      default: envDefault
    },
    {
      type: 'input',
      name: 'endpoint',
      message: 'SLS endpoint:',
      default: endpointDefault
    },
    {
      type: 'input',
      name: 'project',
      message: 'Project:',
      default: projectDefault
    },
    {
      type: 'input',
      name: 'logstore',
      message: 'Logstore:',
      default: logstoreDefault
    }
  ]);

  const saved = await fm.learning.saveResourceBinding({
    business: answers.business || businessDefault,
    componentType: 'logService',
    provider: 'aliyun-sls',
    mcpServer: 'friday-sls-logs',
    source: 'dialog-log-bind',
    aliases: buildLogBindingAliases(input, answers, resolution),
    keywords: buildLogBindingKeywords(input, answers, resolution),
    connection: {
      env: answers.env,
      endpoint: answers.endpoint,
      project: answers.project,
      logstore: answers.logstore
    },
    metadata: {
      input,
      source: 'interactive-binding',
      suggestedCommand: bindingHint.suggestedCommand || null
    }
  }, {
    currentSkill: 'log-audit'
  });

  console.log(chalk.green(`Bound log service as: ${saved.business}`));
  return true;
}

function extractDisplayedPayload(result) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  if (result.type === 'result' && result.data && typeof result.data === 'object' && result.data.type) {
    return result.data;
  }

  return result.data ?? result;
}

function extractBindingHint(result) {
  const payload = extractDisplayedPayload(result);
  return payload?.data?.bindingHint || payload?.bindingHint || null;
}

function extractBindingResolution(result) {
  const payload = extractDisplayedPayload(result);
  return payload?.data?.resolution || payload?.resolution || {};
}

function shouldHandleBindingFlow(bindingHint, _result) {
  if (!bindingHint?.kind) {
    return false;
  }

  return bindingHint.kind === 'mcp-binding' || bindingHint.kind === 'resource-binding';
}

function inferLogEnvironmentFromInput(input) {
  const text = String(input || '').toLowerCase();
  if (/test|测试/.test(text)) return 'test';
  if (/uat|预发/.test(text)) return 'uat';
  if (/gray|灰度/.test(text)) return 'gray';
  if (/prod|生产/.test(text)) return 'prod';
  return null;
}

function inferLogBindingBusiness(input, resolution = {}) {
  const parts = [
    resolution.env,
    resolution.project,
    resolution.logstore
  ].filter(Boolean);
  if (parts.length > 0) {
    return `log-${parts.join('-')}`;
  }

  const keywordMatch = String(input || '').match(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/);
  if (keywordMatch && keywordMatch[1]) {
    return `log-${keywordMatch[1].slice(0, 16)}`;
  }

  return 'log-binding';
}

function inferLogProjectFromInput(input) {
  const match = String(input || '').match(/(?:project|项目)\s*[:=]?\s*(\S+)/i);
  return match ? match[1] : '';
}

function inferLogstoreFromInput(input) {
  const match = String(input || '').match(/(?:logstore|日志库)\s*[:=]?\s*(\S+)/i);
  return match ? match[1] : '';
}

function endpointForEnv(env) {
  const normalized = String(env || '').toLowerCase();
  if (normalized === 'gray' || normalized === 'prod') {
    return 'cn-hongkong.log.aliyuncs.com';
  }
  return 'cn-shenzhen.log.aliyuncs.com';
}

function buildLogBindingAliases(input, answers, resolution = {}) {
  return [
    answers.business,
    answers.env,
    answers.project,
    answers.logstore,
    resolution.project,
    resolution.logstore,
    resolution.endpoint,
    String(input || '').match(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/)?.[1]
  ].filter(Boolean);
}

function buildLogBindingKeywords(input, answers, resolution = {}) {
  return [
    answers.business,
    answers.env,
    answers.endpoint,
    answers.project,
    answers.logstore,
    resolution.env,
    resolution.project,
    resolution.logstore,
    resolution.endpoint
  ].filter(Boolean);
}

function inferMcpBindingBusiness(bindingHint, input, resolution = {}) {
  const base = bindingHint?.serverName || resolution?.serverName || null;
  if (base) {
    return `mcp-${base}`;
  }

  const text = String(input || '').trim();
  const quotedMatch = text.match(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/);
  if (quotedMatch && quotedMatch[1]) {
    return `mcp-${quotedMatch[1].slice(0, 16)}`;
  }

  return 'mcp-binding';
}

function parseHeadersJson(value) {
  const text = String(value || '').trim();
  if (!text) {
    return {};
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function buildMcpBindingAliases(input, answers, resolution = {}, bindingHint = {}) {
  return [
    answers.business,
    bindingHint.serverName,
    bindingHint.tool,
    answers.endpoint,
    resolution.endpoint
  ].filter(Boolean);
}

function buildMcpBindingKeywords(input, answers, resolution = {}, bindingHint = {}) {
  return [
    answers.business,
    bindingHint.serverName,
    bindingHint.tool,
    answers.endpoint,
    resolution.endpoint,
    Object.keys(parseHeadersJson(answers.headers) || {})
  ].flat().filter(Boolean);
}

function displayStats(stats) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ FlowMind Statistics                                 │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan(`│ Total Learning Records: ${stats.totalRecords || 0}`));
  console.log(chalk.cyan(`│ Last Learning: ${stats.lastLearning || 'Never'}`));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  if (stats.byType && Object.keys(stats.byType).length > 0) {
    console.log(chalk.cyan('│ By Type:'));
    for (const [type, count] of Object.entries(stats.byType)) {
      console.log(chalk.cyan(`│   ${type}: ${count}`));
    }
  }

  if (stats.bySkill && Object.keys(stats.bySkill).length > 0) {
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan('│ By Skill:'));
    for (const [skill, count] of Object.entries(stats.bySkill)) {
      console.log(chalk.cyan(`│   ${skill}: ${count}`));
    }
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function displayScenes(scenes) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Scene Mappings                                      │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  if (scenes.length === 0) {
    console.log(chalk.cyan('│ No scenes defined yet.                              │'));
  } else {
    for (const scene of scenes) {
      console.log(chalk.cyan(`│ ${scene.name}`));
      console.log(chalk.cyan(`│   Keywords: ${scene.keywords?.join(', ') || 'N/A'}`));
      console.log(chalk.cyan(`│   Used: ${scene.useCount || 0} times`));
      console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
    }
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function displaySkills(skills, verbose = false) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Available Skills                                    │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  for (const skill of skills) {
    console.log(chalk.cyan(`│ ${chalk.bold(skill.name)}`));
    if (skill.description) {
      const desc = verbose ? skill.description : skill.description.substring(0, 50) + '...';
      console.log(chalk.cyan(`│   ${desc}`));
    }
    if (verbose && skill.category) {
      console.log(chalk.cyan(`│   Category: ${skill.category}`));
    }
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

// Skill info display
async function showSkillInfo(skill, asJson = false) {
  const info = {
    name: skill.name,
    path: skill.path,
    description: skill.definition?.description || 'No description',
    version: skill.definition?.version || skill.definition?.metadata?.version || '1.0.0',
    author: skill.definition?.author || skill.definition?.metadata?.author || 'unknown',
    category: skill.definition?.category || skill.definition?.metadata?.category || 'general',
    componentDependencies: skill.definition?.componentDependencies || [],
    triggers: skill.definition?.triggers || []
  };

  if (asJson) {
    console.log(JSON.stringify(info, null, 2));
  } else {
    console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
    console.log(chalk.cyan(`│ ${chalk.bold(info.name)}`));
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
    console.log(chalk.cyan(`│ Description: ${info.description}`));
    console.log(chalk.cyan(`│ Version:     ${info.version}`));
    console.log(chalk.cyan(`│ Author:      ${info.author}`));
    console.log(chalk.cyan(`│ Category:    ${info.category}`));
    console.log(chalk.cyan(`│ Path:        ${info.path}`));

    if (info.componentDependencies.length > 0) {
      console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
      console.log(chalk.cyan('│ Component Dependencies:'));
      for (const dep of info.componentDependencies) {
        console.log(chalk.cyan(`│   - ${dep}`));
      }
    }

    if (info.triggers.length > 0) {
      console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
      console.log(chalk.cyan('│ Trigger Patterns:'));
      for (const trigger of info.triggers.slice(0, 10)) {
        console.log(chalk.cyan(`│   - ${trigger}`));
      }
      if (info.triggers.length > 10) {
        console.log(chalk.cyan(`│   ... and ${info.triggers.length - 10} more`));
      }
    }

    console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
  }
}

// Read SKILL.md content
async function readSkillMd(skill) {
  const skillMdPath = path.join(skill.path, 'SKILL.md');
  if (await fs.pathExists(skillMdPath)) {
    const content = await fs.readFile(skillMdPath, 'utf-8');
    console.log(chalk.cyan(`\n📄 ${skill.name}/SKILL.md`));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(content);
  } else {
    console.error(chalk.red('SKILL.md not found'));
  }
}

// Edit SKILL.md
async function editSkillMd(skill) {
  const skillMdPath = path.join(skill.path, 'SKILL.md');
  await openInEditor(skillMdPath);
}

// Show skill configuration
async function showSkillConfig(skill, fm, asJson = false) {
  const configKey = `skillConfig.skills.${skill.name}`;
  const config = fm.config.get(configKey, {});

  if (asJson) {
    console.log(JSON.stringify({ skill: skill.name, config }, null, 2));
  } else {
    console.log(chalk.cyan(`\n┌─────────────────────────────────────────────────────┐`));
    console.log(chalk.cyan(`│ ${skill.name} Configuration`));
    console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

    if (Object.keys(config).length === 0) {
      console.log(chalk.cyan('│ No configuration set'));
      console.log(chalk.cyan('│'));
      console.log(chalk.cyan('│ Default configuration from SKILL.md:'));

      // Extract default config from SKILL.md
      const skillMdPath = path.join(skill.path, 'SKILL.md');
      if (await fs.pathExists(skillMdPath)) {
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const configMatch = content.match(/## Configuration\n([\s\S]*?)(?=\n##|$)/);
        if (configMatch) {
          const configSection = configMatch[1].trim();
          const lines = configSection.split('\n').slice(0, 15);
          for (const line of lines) {
            console.log(chalk.cyan(`│ ${line}`));
          }
        }
      }
    } else {
      const configJson = JSON.stringify(config, null, 2);
      configJson.split('\n').forEach(line => {
        console.log(chalk.cyan(`│ ${line}`));
      });
    }

    console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
  }
}

// Set skill configuration
async function setSkillConfig(skill, fm, key, value) {
  const configKey = `skillConfig.skills.${skill.name}`;
  const config = fm.config.get(configKey, {});

  // Support nested keys like "security.enabled"
  const keys = key.split('.');
  let current = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) current[keys[i]] = {};
    current = current[keys[i]];
  }

  // Try to parse value as JSON, fallback to string
  const parsedValue = parseCliValue(value);

  current[keys[keys.length - 1]] = parsedValue;
  fm.config.set(configKey, config);
  await fm.config.save();

  console.log(chalk.green(`✓ Set ${skill.name}.${key} = ${value}`));
}

function parseCliValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getTrailingValueForOption(argv, optionNames, consumedCount = 1) {
  for (let index = 0; index < argv.length; index += 1) {
    if (!optionNames.includes(argv[index])) {
      continue;
    }

    const valueIndex = index + consumedCount + 1;
    if (valueIndex < argv.length) {
      return argv[valueIndex];
    }

    return null;
  }

  return null;
}

// Resource file helpers
function resolveResourcePath(filePath, configDir) {
  // If absolute path, use as-is
  if (path.isAbsolute(filePath)) {
    return filePath;
  }
  // Otherwise resolve relative to config dir
  return path.join(configDir, filePath);
}

async function listResourceFiles(dir, configDir) {
  const files = [];
  const entries = await fs.readdir(dir);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await fs.stat(fullPath);
    const relativePath = path.relative(configDir, fullPath);

    if (stat.isDirectory()) {
      files.push({
        name: entry,
        path: relativePath,
        type: 'directory',
        size: 0
      });
    } else {
      files.push({
        name: entry,
        path: relativePath,
        type: 'file',
        size: stat.size,
        modified: stat.mtime
      });
    }
  }

  return files.sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'directory' ? -1 : 1;
  });
}

function displayResourceFiles(files, dir) {
  console.log(chalk.cyan(`\n📁 ${dir}`));
  console.log(chalk.gray('─'.repeat(50)));

  if (files.length === 0) {
    console.log(chalk.cyan('  (empty)'));
    return;
  }

  for (const file of files) {
    if (file.type === 'directory') {
      console.log(chalk.blue(`  📁 ${file.name}/`));
    } else {
      const size = formatFileSize(file.size);
      console.log(chalk.white(`  📄 ${file.name}`) + chalk.gray(` (${size})`));
    }
  }
}

function displayResourceConfig(config) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ Resource Configuration                              │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  const entries = Object.entries(config);
  if (entries.length === 0) {
    console.log(chalk.cyan('│ No resources configured'));
  } else {
    for (const [key, value] of entries) {
      const enabled = value.enabled !== false;
      const status = enabled ? chalk.green('✓') : chalk.red('✗');
      console.log(chalk.cyan(`│ ${status} ${key}`));
      if (value.path) {
        console.log(chalk.cyan(`│   Path: ${value.path}`));
      }
    }
  }

  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function getResourceSetupExamples() {
  return [
    'flowmind resource',
    'flowmind resource --sync-sdd-agent',
    'flowmind resource --config',
    'flowmind "绑定零售业务 mcp=yapi-mcp 地址=https://yapi.example.com token=xxx project=retail"',
    'flowmind "绑定发布业务 mcp=friday-auto-flow token=xxx env=uat"',
    'flowmind "同步零售业务接口到 YApi"',
    'flowmind "部署零售服务到 UAT"'
  ];
}

function maskSecret(value) {
  if (!value) return null;
  const stringValue = String(value);
  if (stringValue.length <= 6) return '***';
  return `${stringValue.slice(0, 3)}***${stringValue.slice(-2)}`;
}

function describeConnection(binding) {
  const parts = [];
  if (binding.mcpServer) parts.push(`mcp=${binding.mcpServer}`);
  if (binding.connection?.address) parts.push(`address=${binding.connection.address}`);
  if (binding.connection?.project) parts.push(`project=${binding.connection.project}`);
  if (binding.connection?.namespace) parts.push(`namespace=${binding.connection.namespace}`);
  if (binding.connection?.env) parts.push(`env=${binding.connection.env}`);
  if (binding.connection?.token) parts.push(`token=${maskSecret(binding.connection.token)}`);
  return parts;
}

function displayResourceOverview({ resourceConfig, componentStatus, bindings, configDir }) {
  const configuredResources = Object.keys(resourceConfig || {});
  const activeComponents = Object.entries(componentStatus || {}).filter(([, value]) => value?.active);

  console.log(chalk.cyan('\nFlowMind Resource Overview'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white(`Config dir: ${configDir}`));
  console.log(chalk.white(`Configured resources: ${configuredResources.length}`));
  console.log(chalk.white(`Active components: ${activeComponents.length}/${Object.keys(componentStatus || {}).length}`));
  console.log(chalk.white(`Learned bindings: ${bindings.length}`));

  console.log(chalk.cyan('\nActive Components'));
  if (activeComponents.length === 0) {
    console.log(chalk.gray('  (none)'));
  } else {
    for (const [name, info] of activeComponents) {
      const provider = info.provider ? ` provider=${info.provider}` : '';
      console.log(chalk.white(`  - ${name}${provider}`));
    }
  }

  console.log(chalk.cyan('\nLearned Bindings'));
  if (bindings.length === 0) {
    console.log(chalk.gray('  (none)'));
    console.log(chalk.gray('  Save one with natural language, for example:'));
    console.log(chalk.white('  flowmind "绑定零售业务 mcp=yapi-mcp 地址=https://yapi.example.com token=xxx project=retail"'));
    console.log(chalk.gray('  Import existing SDD-Agent resources only when you explicitly want them in this workspace:'));
    console.log(chalk.white('  flowmind resource --sync-sdd-agent'));
  } else {
    for (const binding of bindings.slice(0, 8)) {
      const label = `${binding.business || 'default'} [${binding.componentType || 'unknown'}]`;
      console.log(chalk.white(`  - ${label}`));
      const details = describeConnection(binding);
      if (details.length > 0) {
        console.log(chalk.gray(`    ${details.join('  ')}`));
      }
    }
    if (bindings.length > 8) {
      console.log(chalk.gray(`  ... and ${bindings.length - 8} more`));
    }
  }

  console.log(chalk.cyan('\nCommon Commands'));
  for (const example of getResourceSetupExamples()) {
    console.log(chalk.white(`  ${example}`));
  }

  console.log(chalk.cyan('\nNext Step'));
  console.log(chalk.white('  Keep workspace state isolated by default. Import SDD-Agent resources only when needed, then bind `friday-auto-flow` before running deploy requests in natural language.'));
}

function displayResourceSyncSummary(summary) {
  console.log(chalk.cyan('\nFlowMind Sync Complete'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white(`Source: ${summary.sourceDir}`));
  console.log(chalk.white(`Target: ${summary.targetDir}`));
  console.log(chalk.white(`Bindings imported: ${summary.counts.importedBindings}`));
  console.log(chalk.white(`Scenes imported: ${summary.counts.importedScenes}`));
  console.log(chalk.white(`Components synced: ${summary.counts.components}`));
  console.log(chalk.gray('\nLocal files updated:'));
  console.log(chalk.white(`  ${summary.files.resourceConfig}`));
  console.log(chalk.white(`  ${summary.files.componentConfig}`));
  console.log(chalk.white(`  ${summary.files.resourceBindings}`));
  console.log(chalk.white(`  ${summary.files.scenes}`));
}

function displayAIStatus(status) {
  console.log(chalk.cyan('\n┌─────────────────────────────────────────────────────┐'));
  console.log(chalk.cyan('│ AI Model Status                                     │'));
  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));

  const initialized = status.initialized ? chalk.green('✓') : chalk.red('✗');
  const healthLabel = status.health || (Object.values(status.providers || {}).some((info) => info?.health === 'ready') ? 'ready' : 'not ready');
  const health = healthLabel === 'ready'
    ? chalk.green(healthLabel)
    : healthLabel === 'error'
      ? chalk.red(healthLabel)
      : chalk.yellow(healthLabel);
  console.log(chalk.cyan(`│ Initialized: ${initialized}`));
  console.log(chalk.cyan(`│ Health: ${health}`));
  console.log(chalk.cyan(`│ Default Provider: ${status.defaultProvider || 'None'}`));
  console.log(chalk.cyan(`│ Default Model: ${status.defaultModel || 'None'}`));

  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ Features:'));

  const features = status.features || {};
  for (const [feature, enabled] of Object.entries(features)) {
    const statusIcon = enabled ? chalk.green('✓') : chalk.red('✗');
    console.log(chalk.cyan(`│   ${statusIcon} ${feature}`));
  }

  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ Providers:'));

  const providers = status.providers || {};
  for (const [name, info] of Object.entries(providers)) {
    const statusIcon = info.health === 'ready'
      ? chalk.green('✓')
      : info.health === 'error'
        ? chalk.red('✗')
        : chalk.yellow('•');
    console.log(chalk.cyan(`│   ${statusIcon} ${name}`));
    if (info.info?.model) {
      const modelSuffix = status.defaultModel && info.info.model === status.defaultModel ? ' (global)' : ' (override)';
      console.log(chalk.cyan(`│     Model: ${info.info.model}${modelSuffix}`));
    }
    if (info.error) {
      console.log(chalk.cyan(`│     Error: ${info.error}`));
    }
    if (info.info?.baseUrl) {
      console.log(chalk.cyan(`│     URL: ${info.info.baseUrl}`));
    }
  }

  console.log(chalk.cyan('├─────────────────────────────────────────────────────┤'));
  console.log(chalk.cyan('│ Check: flowmind ai --status | flowmind ai --test <provider>'));
  console.log(chalk.cyan('└─────────────────────────────────────────────────────┘'));
}

function displayUpgradeStatus(status) {
  console.log(chalk.cyan('\nFlowMind Upgrade Status'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white(`Version: ${status.version}`));
  console.log(chalk.white(`Overall: ${status.summary.status} (${status.summary.passed}/${status.summary.total}, ${status.summary.percent}%)`));
  if (status.phases) {
    for (const [phaseName, phase] of Object.entries(status.phases)) {
      console.log(chalk.white(`  ${phaseName}: ${phase.status} (${phase.passed}/${phase.total}, ${phase.percent}%)`));
    }
  }

  for (const direction of status.directions) {
    const marker = direction.status === 'complete'
      ? chalk.green('✓')
      : direction.status === 'partial'
        ? chalk.yellow('•')
        : chalk.red('✗');
    console.log(chalk.cyan(`\n${marker} ${direction.id}. ${direction.title}`));
    console.log(chalk.gray(`  Status: ${direction.status} (${direction.passed}/${direction.total})`));
    for (const check of direction.checks) {
      const checkMarker = check.passed ? chalk.green('✓') : chalk.red('✗');
      console.log(`  ${checkMarker} ${check.label}`);
    }
    console.log(chalk.gray(`  Next: ${direction.next}`));
  }
}

function displayReleaseCheck(result) {
  console.log(chalk.cyan('\nFlowMind Release Check'));
  console.log(chalk.gray('─'.repeat(60)));
  console.log(chalk.white(`Version: ${result.version}`));
  console.log(chalk.white(`Result: ${result.ok ? chalk.green('ok') : chalk.red('failed')}`));

  for (const check of result.checks) {
    const marker = check.status === 'ok' ? chalk.green('✓') : chalk.red('✗');
    console.log(`  ${marker} ${check.message}`);
  }

  if (!result.ok) {
    console.log(chalk.yellow('\nFix release check errors before publishing.'));
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function openInEditor(filePath) {
  const { spawn } = require('child_process');
  const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

  console.log(chalk.cyan(`Opening ${filePath} in ${editor}...`));

  return new Promise((resolve, reject) => {
    const child = spawn(editor, [filePath], {
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}

// TUI command - Rich terminal interface using Ink
program
  .command('tui')
  .description('Launch enhanced TUI with split panels, skill browser, and dragon display')
  .option('--ascii', 'Force ASCII-safe terminal rendering')
  .action(async (options) => {
    try {
      const managedHost = detectManagedCliHost();
      if (managedHost) {
        console.error(chalk.red(`TUI is not supported inside ${managedHost.name}.`));
        console.log(chalk.yellow(getNestedTuiGuardMessage(managedHost)));
        process.exitCode = 1;
        return;
      }

      const React = require('react');
      const App = require('../tui/app.jsx');
      const asciiMode = options.ascii || shouldUseAsciiUi();

      const previousWarningFlag = process.env.FLOWMIND_SILENCE_AI_WARNINGS;
      process.env.FLOWMIND_SILENCE_AI_WARNINGS = '1';
      try {
        const fm = await initFlowMind();
        await launchInkApp({
          element: React.createElement(App, { flowmind: fm, asciiMode: asciiMode }),
          stdin: process.stdin
        });
      } finally {
        if (previousWarningFlag === undefined) {
          delete process.env.FLOWMIND_SILENCE_AI_WARNINGS;
        } else {
          process.env.FLOWMIND_SILENCE_AI_WARNINGS = previousWarningFlag;
        }
      }
    } catch (error) {
      console.error(chalk.red('TUI Error:'), error.message);
      if (error.message.includes('Cannot find module')) {
        console.log(chalk.yellow('Try running: npm install ink@3 react ink-text-input ink-spinner'));
      }
    } finally {
      restoreTerminal();
    }
  });

// Dashboard command - Hybrid monitoring dashboard
program
  .command('dashboard')
  .description('Launch real-time monitoring dashboard for MCP activity and events')
  .option('--ascii', 'Force ASCII-safe terminal rendering')
  .action(async (options) => {
    try {
      const managedHost = detectManagedCliHost();
      if (managedHost) {
        console.error(chalk.red(`Dashboard is not supported inside ${managedHost.name}.`));
        console.log(chalk.yellow(getNestedTuiGuardMessage(managedHost)));
        process.exitCode = 1;
        return;
      }

      const React = require('react');
      const DashboardApp = require('../dashboard/app.jsx');
      const eventBus = require('../core/event-bus');
      const asciiMode = options.ascii || shouldUseAsciiUi();

      const fm = await initFlowMind();
      await launchInkApp({
        element: React.createElement(DashboardApp, { flowmind: fm, eventBus, asciiMode: asciiMode }),
        stdin: process.stdin
      });
    } catch (error) {
      console.error(chalk.red('Dashboard Error:'), error.message);
      if (error.message.includes('Cannot find module')) {
        console.log(chalk.yellow('Try running: npm install ink@3 react'));
      }
    } finally {
      restoreTerminal();
    }
  });

// Doctor command - System health check
program
  .command('doctor')
  .description('Run system health checks and diagnostics')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const fm = await initFlowMind();
      const result = await fm.doctor();

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      console.log(chalk.cyan('\nFlowMind Health Check\n'));
      console.log('─'.repeat(60));

      for (const check of result.checks) {
        const icon = check.status === 'ok' ? chalk.green('✓')
          : check.status === 'warning' ? chalk.yellow('⚠')
          : chalk.red('✗');
        console.log(`  ${icon} ${check.name.padEnd(20)} ${check.message}`);
      }

      console.log('─'.repeat(60));
      const { ok, warnings, errors } = result.summary;
      const summaryLine = [
        chalk.green(`${ok} ok`),
        warnings > 0 ? chalk.yellow(`${warnings} warning(s)`) : null,
        errors > 0 ? chalk.red(`${errors} error(s)`) : null
      ].filter(Boolean).join(', ');
      console.log(`\n  Result: ${summaryLine}`);

      if (errors > 0) {
        console.log(chalk.red('\n  Some checks failed. Please fix the errors above.'));
      } else if (warnings > 0) {
        console.log(chalk.yellow('\n  Some warnings detected. Review for potential issues.'));
      } else {
        console.log(chalk.green('\n  All checks passed!'));
      }
    } catch (error) {
      console.error(chalk.red('Doctor Error:'), error.message);
    }
  });

program
  .command('upgrade-status')
  .description('Show FlowMind upgrade checklist status and next upgrade directions')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const status = await getUpgradeStatus();
      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }
      displayUpgradeStatus(status);
    } catch (error) {
      console.error(chalk.red('Upgrade Status Error:'), error.message);
      process.exitCode = 1;
    }
  });

program
  .command('workflow')
  .description('Preview or execute a guarded follow-up workflow from a JSON file')
  .requiredOption('--chain <file>', 'JSON file containing a followUpChain')
  .option('--execute', 'Execute the reviewed workflow')
  .option('--approval-token <token>', 'Approval token returned by dry-run')
  .option('--continue-on-error', 'Continue after a failed step')
  .action(async (options) => {
    try {
      const chain = await fs.readJson(path.resolve(options.chain));
      if (!options.execute) {
        console.log(JSON.stringify(previewWorkflow(chain), null, 2));
        return;
      }
      const fm = await initFlowMind();
      const result = await executeWorkflow(chain, {
        flowmind: fm,
        approvalToken: options.approvalToken,
        continueOnError: options.continueOnError === true,
        dryRun: false
      });
      console.log(JSON.stringify(result, null, 2));
      if (result.status !== 'succeeded') process.exitCode = 1;
    } catch (error) {
      console.error(chalk.red('Workflow Error:'), error.message);
      process.exitCode = 1;
    }
  });

program
  .command('release-check')
  .description('Run release maintenance checks before publishing')
  .option('-j, --json', 'Output as JSON')
  .action(async (options) => {
    try {
      const result = await runReleaseCheck();
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        displayReleaseCheck(result);
      }
      if (!result.ok) {
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(chalk.red('Release Check Error:'), error.message);
      process.exitCode = 1;
    }
  });

// Update command - Auto-update flowmind
program
  .command('update')
  .description('Update FlowMind to the latest version')
  .option('--check', 'Only check for updates, do not install')
  .action(async (options) => {
    const { execSync } = require('child_process');
    const currentVersion = packageJson.version;

    console.log(chalk.cyan(`\nCurrent version: ${currentVersion}`));

    try {
      // Check latest version on npm
      const latestVersion = execSync('npm view flowmind version', { encoding: 'utf-8' }).trim();
      console.log(chalk.cyan(`Latest version:  ${latestVersion}`));

      if (currentVersion === latestVersion) {
        console.log(chalk.green('\n✓ You are already on the latest version!'));
        return;
      }

      // Compare versions
      const parse = (v) => v.split('.').map(Number);
      const curr = parse(currentVersion);
      const latest = parse(latestVersion);
      const isNewer = latest[0] > curr[0] || (latest[0] === curr[0] && latest[1] > curr[1]) || (latest[0] === curr[0] && latest[1] === curr[1] && latest[2] > curr[2]);

      if (!isNewer) {
        console.log(chalk.green('\n✓ You are on a newer version than npm latest.'));
        return;
      }

      console.log(chalk.yellow(`\n⬆ Update available: ${currentVersion} → ${latestVersion}`));

      if (options.check) {
        console.log(chalk.cyan('\nRun `flowmind update` to install.'));
        return;
      }

      // Detect install method
      const isGlobal = (() => {
        try {
          const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
          const localPath = require.resolve('../package.json');
          return localPath.startsWith(globalRoot);
        } catch { return false; }
      })();

      const installCmd = isGlobal
        ? `npm install -g flowmind@${latestVersion}`
        : `npm install flowmind@${latestVersion}`;

      console.log(chalk.cyan(`\nInstalling: ${installCmd}`));
      const spinner = ora('Updating FlowMind...').start();

      try {
        execSync(installCmd, { encoding: 'utf-8', stdio: 'pipe' });
        spinner.succeed(`FlowMind updated to ${latestVersion}!`);

        console.log(chalk.green('\n✓ Update complete!'));
        console.log(chalk.gray('  Run `flowmind --version` to verify.'));
      } catch (installError) {
        spinner.fail('Update failed');
        console.error(chalk.red('\nInstall error:'), installError.message);
        console.log(chalk.yellow('\nTry manually:'));
        console.log(chalk.white(`  ${installCmd}`));
      }

    } catch (error) {
      console.error(chalk.red('Failed to check for updates:'), error.message);
      console.log(chalk.yellow('\nYou can manually update with:'));
      console.log(chalk.white('  npm install -g flowmind@latest'));
    }
  });

program
  .command('check-update')
  .description('Check whether a newer FlowMind version is available')
  .action(async () => {
    await runUpdateCheck();
  });

// Parse arguments
const knownCommands = new Set([
  'init', 'process', 'p', 'learn', 'scenes', 'skills', 'skill', 'resource', 'res',
  'stats', 'honor', 'config', 'ai', 'tui', 'dashboard', 'doctor', 'upgrade-status', 'workflow',
  'release-check', 'update', 'check-update', 'help'
]);
const cliArgs = process.argv.slice(2);

if (cliArgs.length > 0 && !cliArgs[0].startsWith('-') && !knownCommands.has(cliArgs[0])) {
  process.argv.splice(2, 0, 'process');
}

program.parse(process.argv);

// Default to interactive mode if no command specified
if (!process.argv.slice(2).length) {
  (async () => {
    try {
      const fm = await initFlowMind();
      await runInteractiveMode(fm);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
    } finally {
      restoreTerminal();
    }
  })();
}
