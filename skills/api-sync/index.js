/**
 * API Sync Skill
 * Sync API definitions, generate documentation, maintain API consistency
 */

const fs = require('fs-extra');
const path = require('path');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /api.*sync|同步.*api|api.*文档|swagger.*sync|接口.*同步/i.test(input);
  },

  async execute(input, context) {
    const skillSettings = getSkillSettings(context);
    const params = parseApiSyncParams(input);
    params.platform = params.platform || skillSettings.platform || 'yapi';

    if (params.action === 'generate') {
      return generateDocs(params, input, skillSettings);
    }

    if (params.action === 'sync') {
      return syncToYApi(params, input, context, skillSettings);
    }

    return createSkillResult('api-sync', 'API sync. Available actions: generate (from code), sync (to platform)', {
      input,
      data: {
        actions: ['generate - Generate API docs from code', 'sync - Sync to YApi/Swagger Hub'],
        params,
        skillConfig: skillSettings
      }
    });
  }
};

function parseApiSyncParams(input) {
  const params = {};
  if (/生成|generate|导出/i.test(input)) params.action = 'generate';
  if (/同步|sync|上传|push/i.test(input)) params.action = 'sync';

  const pathMatch = input.match(/(?:路径|path|目录|dir)\s*[:=]?\s*(\S+)/i);
  if (pathMatch) params.path = pathMatch[1];

  const platformMatch = input.match(/(?:平台|platform)\s*[:=]?\s*(yapi|swagger|postman)/i);
  if (platformMatch) params.platform = platformMatch[1].toLowerCase();

  const projectMatch = input.match(/(?:项目|project)\s*[:=]?\s*(\S+)/i);
  if (projectMatch) params.project = projectMatch[1];

  return params;
}

async function generateDocs(params, input, skillSettings = {}) {
  const dirPath = params.path || '.';
  if (!(await fs.pathExists(dirPath))) {
    return createSkillError('api-sync', `Path not found: ${dirPath}`, {
      input,
      kind: 'invalid-input',
      retryable: true,
      data: {
        action: 'generate',
        path: dirPath
      },
      retryHints: [
        'Retry with an existing project path or source directory.',
        'Use path=<dir> to point to the codebase that contains controller or route files.'
      ]
    });
  }

  const apis = [];
  const files = await findApiFiles(dirPath);

  for (const file of files.slice(0, 20)) {
    const content = await fs.readFile(file, 'utf-8');
    const endpoints = extractEndpoints(content);
    apis.push(...endpoints.map(e => ({ ...e, file: path.relative(dirPath, file) })));
  }

  return createSkillResult('api-sync', `Found ${apis.length} API endpoint(s) in ${files.length} file(s)`, {
    input,
    data: { apis, totalEndpoints: apis.length, totalFiles: files.length, skillConfig: skillSettings }
  });
}

function syncToYApi(params, input, context, skillSettings = {}) {
  return createSkillResult('api-sync', 'API sync to platform (use yapi-sync-interface skill for YApi-specific operations)', {
    input,
    data: {
      platform: params.platform || skillSettings.platform || 'yapi',
      connection: skillSettings.connection || {},
      options: skillSettings.options || {},
      hint: 'Use yapi-sync-interface skill for direct YApi integration',
      skillConfig: skillSettings
    }
  });
}

async function findApiFiles(dir) {
  const results = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findApiFiles(fullPath));
    } else if (/\.(js|ts|java|py)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractEndpoints(content) {
  const endpoints = [];
  const patterns = [
    /@(?:GET|POST|PUT|DELETE|PATCH)Mapping\s*\(\s*["']([^"']+)["']/gi,
    /(?:app|router)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/gi,
    /@(?:Get|Post|Put|Delete|Patch)\s*\(\s*["']([^"']+)["']/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const method = match[1]?.toUpperCase() || 'GET';
      const urlPath = match[2] || match[1];
      endpoints.push({ method, path: urlPath });
    }
  }

  return endpoints;
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}
