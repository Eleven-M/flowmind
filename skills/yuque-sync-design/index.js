/**
 * Yuque Sync Design Skill
 * Sync design documents to Yuque knowledge base
 */

const fs = require('fs-extra');
const path = require('path');

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /语雀.*同步|yuque.*sync|设计.*文档.*同步|同步.*设计|yuque.*design/i.test(input);
  },

  async execute(input, context) {
    const knowledgeBase = context.componentRegistry?.getAdapter('knowledgeBase');

    if (!knowledgeBase) {
      return {
        type: 'result',
        skill: 'yuque-sync-design',
        message: 'Yuque service not configured. Add yuque-mcp component first.',
        data: { hint: 'Configure Yuque MCP server in component registry' },
        input,
        timestamp: new Date().toISOString()
      };
    }

    const params = parseYuqueParams(input);

    if (params.action === 'search') {
      return {
        type: 'result',
        skill: 'yuque-sync-design',
        message: `Searching Yuque for: ${params.keyword || 'all'}`,
        data: {
          mcpTool: 'search',
          args: { q: params.keyword, type: 'doc' }
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'list') {
      return {
        type: 'result',
        skill: 'yuque-sync-design',
        message: 'Listing Yuque repositories',
        data: {
          mcpTool: 'get_user_repos',
          args: {}
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'sync') {
      return syncDesignDoc(params, input);
    }

    return {
      type: 'result',
      skill: 'yuque-sync-design',
      message: 'Yuque design sync. Available actions: search, list, sync',
      data: {
        actions: ['search - Search documents', 'list - List repos', 'sync - Sync design doc'],
        mcpTools: ['get_user_repos', 'get_repo_docs', 'get_doc', 'create_doc', 'update_doc', 'search']
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseYuqueParams(input) {
  const params = {};
  if (/搜索|search|查找/i.test(input)) params.action = 'search';
  if (/列表|list|仓库|repo/i.test(input)) params.action = 'list';
  if (/同步|sync|上传|push/i.test(input)) params.action = 'sync';

  const pathMatch = input.match(/(?:路径|path|文件|file)\s*[:=]?\s*(\S+)/i);
  if (pathMatch) params.path = pathMatch[1];

  const repoMatch = input.match(/(?:仓库|repo|namespace)\s*[:=]?\s*(\S+)/i);
  if (repoMatch) params.repo = repoMatch[1];

  const keywordMatch = input.match(/(?:关键词|keyword|搜索)\s*[:=]?\s*(.+?)(?:\s*$)/i);
  if (keywordMatch) params.keyword = keywordMatch[1].trim();

  return params;
}

async function syncDesignDoc(params, input) {
  const filePath = params.path || 'DESIGN.md';

  if (!(await fs.pathExists(filePath))) {
    return {
      type: 'error',
      skill: 'yuque-sync-design',
      message: `Design file not found: ${filePath}`,
      input,
      timestamp: new Date().toISOString()
    };
  }

  const content = await fs.readFile(filePath, 'utf-8');
  const title = extractTitle(content) || path.basename(filePath, '.md');

  return {
    type: 'result',
    skill: 'yuque-sync-design',
    message: `Ready to sync "${title}" to Yuque`,
    data: {
      mcpTool: 'create_doc',
      args: {
        namespace: params.repo,
        slug: title.toLowerCase().replace(/\s+/g, '-'),
        title,
        body: content,
        format: 'markdown'
      }
    },
    input,
    timestamp: new Date().toISOString()
  };
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}
