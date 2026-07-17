/**
 * YApi Sync Interface Skill
 * Sync Controller interfaces to YApi, import/export Swagger
 */

const { createSkillError, createSkillResult } = require('../../core/result-contract');
const fs = require('fs-extra');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /yapi.*sync|同步.*yapi|yapi.*接口|接口.*yapi|swagger.*import|swagger.*export/i.test(input);
  },

  async execute(input, context = {}) {
    const apiDoc = context.componentRegistry?.getAdapter('apiDoc')
      || context.componentRegistry?.getAdapterByProvider?.('apiDoc', 'yapi')
      || null;
    const learnedBinding = context.resourceBinding?.componentType === 'apiDoc'
      ? context.resourceBinding
      : null;
    const skillSettings = getSkillSettings(context);

    if (!apiDoc && !learnedBinding) {
      return createSkillError('yapi-sync-interface', 'YApi service not configured. Add yapi-mcp component first.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: { hint: 'Configure YApi MCP server in component registry' },
        retryHints: [
          'Configure the apiDoc component with the yapi MCP server.',
          'Or bind a YApi resource before retrying the sync request.'
        ]
      });
    }

    if (!apiDoc) {
      return createSkillError('yapi-sync-interface', 'YApi adapter is not available in the current registry.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: {
          hint: 'Make sure the apiDoc component is configured and loaded',
          binding: learnedBinding
        },
        retryHints: [
          'Load the apiDoc adapter in the component registry.',
          'Verify the bound YApi resource matches the current runtime registry.'
        ]
      });
    }

    const params = parseYApiParams(input);

    if (params.action === 'search') {
      const args = {
        projectKeyword: params.project || skillSettings.defaultProjectId || learnedBinding?.connection?.project,
        nameKeyword: params.keyword,
        limit: 20
      };
      const execution = await apiDoc.searchApis(args);
      return createSkillResult('yapi-sync-interface', `Searching YApi for: ${params.keyword || 'all'}`, {
        input,
        data: {
          action: 'search',
          args,
          binding: learnedBinding,
          execution: summarizeYApiExecution('search', execution)
        }
      });
    }

    if (params.action === 'list') {
      const projectId = params.project || skillSettings.defaultProjectId || learnedBinding?.connection?.project;
      const execution = await apiDoc.getCategories(projectId);
      return createSkillResult('yapi-sync-interface', `Listing YApi categories for project: ${projectId || 'default'}`, {
        input,
        data: {
          action: 'list',
          args: { projectId },
          binding: learnedBinding,
          execution: summarizeYApiExecution('list', execution)
        }
      });
    }

    if (params.action === 'export') {
      const projectId = params.project || skillSettings.defaultProjectId || learnedBinding?.connection?.project;
      const execution = await apiDoc.exportProject(projectId, params.format || 'swagger');
      return createSkillResult('yapi-sync-interface', `Exporting YApi project: ${projectId || 'default'}`, {
        input,
        data: {
          action: 'export',
          args: { projectId, type: params.format || 'swagger', syncMode: skillSettings.syncMode || 'merge' },
          binding: learnedBinding,
          execution: summarizeYApiExecution('export', execution)
        }
      });
    }

    if (params.action === 'import') {
      const filePath = params.path;
      if (!filePath || !(await fs.pathExists(filePath))) {
        return createSkillError('yapi-sync-interface', `Swagger/OpenAPI file not found: ${filePath || '(missing path)'}`, {
          input,
          kind: 'invalid-input',
          retryable: true,
          retryHints: ['Provide an existing file with path=<swagger-or-openapi-file>.']
        });
      }
      const projectId = params.project || skillSettings.defaultProjectId || learnedBinding?.connection?.project;
      const catId = params.catId || skillSettings.defaultCategoryId || learnedBinding?.connection?.catid;
      if (!projectId || !catId) {
        return createSkillError('yapi-sync-interface', 'YApi project and category are required for Swagger import.', {
          input,
          kind: 'missing-parameter',
          retryable: true,
          retryHints: ['Provide project=<id> catid=<id>, or configure defaults.']
        });
      }
      const swaggerData = await fs.readFile(filePath, 'utf-8');
      const execution = await apiDoc.importSwagger(projectId, catId, swaggerData);
      return createSkillResult('yapi-sync-interface', `Imported Swagger/OpenAPI into YApi project ${projectId}`, {
        input,
        data: {
          action: 'import',
          args: { projectId, catId, path: filePath, syncMode: skillSettings.syncMode || 'merge' },
          binding: learnedBinding,
          execution: summarizeYApiExecution('import', execution)
        }
      });
    }

    return createSkillResult('yapi-sync-interface', 'YApi sync. Available actions: search, list, export, import', {
      input,
      data: {
        actions: ['search - Search interfaces', 'list - List categories', 'export - Export project', 'import - Import Swagger'],
        mcpTools: ['yapi_search_apis', 'yapi_get_categories', 'yapi_save_api', 'yapi_import_swagger', 'yapi_export_project'],
        binding: learnedBinding,
        skillConfig: skillSettings
      }
    });
  }
};

function parseYApiParams(input) {
  const params = {};
  if (/搜索|search|查找|find/i.test(input)) params.action = 'search';
  if (/列表|list|分类|categor/i.test(input)) params.action = 'list';
  if (/导出|export/i.test(input)) params.action = 'export';
  if (/导入|import|swagger/i.test(input)) params.action = 'import';

  const projectMatch = input.match(/(?:项目|project)\s*[:=]?\s*(\S+)/i);
  if (projectMatch) params.project = projectMatch[1];

  const keywordMatch = input.match(/(?:关键词|keyword|名称|name)\s*[:=]?\s*(.+?)(?=\s+(?:项目|project|格式|format)\s*[:=]|\s*$)/i);
  if (keywordMatch) params.keyword = keywordMatch[1].trim();

  const formatMatch = input.match(/(?:格式|format)\s*[:=]?\s*(json|markdown|swagger)/i);
  if (formatMatch) params.format = formatMatch[1].toLowerCase();

  const pathMatch = input.match(/(?:路径|path|文件|file)\s*[:=]?\s*(\S+)/i);
  if (pathMatch) params.path = pathMatch[1];

  const catIdMatch = input.match(/(?:分类|catid|category)\s*[:=]?\s*(\S+)/i);
  if (catIdMatch) params.catId = catIdMatch[1];

  return params;
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}

function summarizeYApiExecution(action, execution) {
  const payload = unwrapPayload(execution);
  const data = getPayloadData(payload);
  const items = extractListItems(data);

  return {
    action,
    status: extractStatus(data) || extractStatus(payload) || 'ok',
    total: extractTotal(data, payload, items),
    items: items.slice(0, 5).map(summarizeItem),
    runId: extractRunId(data) || extractRunId(payload) || null
  };
}

function unwrapPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }

  const textPayload = extractContentText(payload);
  if (textPayload) {
    return parseMaybeJson(textPayload);
  }

  if ('data' in payload && payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
}

function getPayloadData(payload) {
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

function extractListItems(data) {
  const candidates = [data.list, data.items, data.records, data.result, data.data];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractStatus(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (typeof payload.status === 'string') {
    return payload.status;
  }

  if (payload.success === false) {
    return 'error';
  }

  return typeof payload.code === 'string' ? payload.code : null;
}

function extractTotal(data, payload, items) {
  return data.total || payload.total || items.length || null;
}

function extractRunId(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return payload.runId || payload.id || payload.requestId || null;
}

function summarizeItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  return {
    id: item._id || item.id || item.api_id || item.catid || null,
    name: item.name || item.title || item.path || item.url || null,
    method: item.method || item.req_method || null
  };
}

function extractContentText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const textItem = content.find((item) => item && typeof item.text === 'string');
  return textItem ? textItem.text : null;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return { text: value };
  }
}
