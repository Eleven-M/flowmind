/**
 * YApi Sync Interface Skill
 * Sync Controller interfaces to YApi, import/export Swagger
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /yapi.*sync|同步.*yapi|yapi.*接口|接口.*yapi|swagger.*import|swagger.*export/i.test(input);
  },

  async execute(input, context) {
    const apiDoc = context.componentRegistry?.getAdapter('apiDoc');

    if (!apiDoc) {
      return {
        type: 'result',
        skill: 'yapi-sync-interface',
        message: 'YApi service not configured. Add yapi-mcp component first.',
        data: { hint: 'Configure YApi MCP server in component registry' },
        input,
        timestamp: new Date().toISOString()
      };
    }

    const params = parseYApiParams(input);

    if (params.action === 'search') {
      return {
        type: 'result',
        skill: 'yapi-sync-interface',
        message: `Searching YApi for: ${params.keyword || 'all'}`,
        data: {
          mcpTool: 'yapi_search_apis',
          args: { projectKeyword: params.project, nameKeyword: params.keyword, limit: 20 }
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'list') {
      return {
        type: 'result',
        skill: 'yapi-sync-interface',
        message: `Listing YApi categories for project: ${params.project || 'default'}`,
        data: {
          mcpTool: 'yapi_get_categories',
          args: { projectId: params.project }
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'export') {
      return {
        type: 'result',
        skill: 'yapi-sync-interface',
        message: `Exporting YApi project: ${params.project}`,
        data: {
          mcpTool: 'yapi_export_project',
          args: { projectId: params.project, type: params.format || 'swagger' }
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'yapi-sync-interface',
      message: 'YApi sync. Available actions: search, list, export, import',
      data: {
        actions: ['search - Search interfaces', 'list - List categories', 'export - Export project', 'import - Import Swagger'],
        mcpTools: ['yapi_search_apis', 'yapi_get_categories', 'yapi_save_api', 'yapi_import_swagger', 'yapi_export_project']
      },
      input,
      timestamp: new Date().toISOString()
    };
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

  const keywordMatch = input.match(/(?:关键词|keyword|搜索|名称|name)\s*[:=]?\s*(.+?)(?:\s*$)/i);
  if (keywordMatch) params.keyword = keywordMatch[1].trim();

  const formatMatch = input.match(/(?:格式|format)\s*[:=]?\s*(json|markdown|swagger)/i);
  if (formatMatch) params.format = formatMatch[1].toLowerCase();

  return params;
}
