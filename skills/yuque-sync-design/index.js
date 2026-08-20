/**
 * Yuque Sync Design Skill
 * Sync design documents to Yuque knowledge base
 */

const fs = require('fs-extra');
const path = require('path');
const { createSkillError, createSkillResult } = require('../../core/result-contract');
const { wrapSkillCall } = require('../../core/skill-error-wrapper');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /语雀.*同步|yuque.*sync|设计.*文档.*同步|同步.*设计|yuque.*design/i.test(input);
  },

  async execute(input, context = {}) {
    const knowledgeBase = context.componentRegistry?.getAdapter('knowledgeBase')
      || context.componentRegistry?.getAdapterByProvider?.('knowledgeBase', 'yuque')
      || null;
    const learnedBinding = context.resourceBinding?.componentType === 'knowledgeBase'
      ? context.resourceBinding
      : null;
    const skillSettings = getSkillSettings(context);

    if (!knowledgeBase && !learnedBinding) {
      return createSkillError('yuque-sync-design', 'Yuque service not configured. Add yuque-mcp component first.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: { hint: 'Configure Yuque MCP server in component registry' },
        retryHints: [
          'Configure the knowledgeBase component with a Yuque MCP backend.',
          'Or bind a Yuque resource before retrying the design sync request.'
        ]
      });
    }

    if (!knowledgeBase) {
      return createSkillError('yuque-sync-design', 'Yuque adapter is not available in the current registry.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: {
          hint: 'Make sure the knowledgeBase component is configured and loaded',
          binding: learnedBinding
        },
        retryHints: [
          'Load the knowledgeBase adapter in the component registry.',
          'Verify the bound Yuque resource matches the current runtime registry.'
        ]
      });
    }

    const params = parseYuqueParams(input);

    if (params.action === 'search') {
      return wrapSkillCall('yuque-sync-design', input, async () => {
        const execution = await knowledgeBase.search(params.keyword, 'doc');
        return createSkillResult('yuque-sync-design', `Searching Yuque for: ${params.keyword || 'all'}`, {
          input,
          data: {
            action: 'search',
            args: { q: params.keyword, type: 'doc' },
            binding: learnedBinding,
            execution: summarizeYuqueExecution('search', execution)
          }
        });
      }, { action: 'Yuque search' });
    }

    if (params.action === 'list') {
      return wrapSkillCall('yuque-sync-design', input, async () => {
        const execution = await knowledgeBase.getRepos();
        return createSkillResult('yuque-sync-design', 'Listing Yuque repositories', {
          input,
          data: {
            action: 'list',
            args: {},
            binding: learnedBinding,
            execution: summarizeYuqueExecution('list', execution)
          }
        });
      }, { action: 'Yuque list' });
    }

    if (params.action === 'sync') {
      return syncDesignDoc(params, input, learnedBinding, knowledgeBase, skillSettings);
    }

    return createSkillResult('yuque-sync-design', 'Yuque design sync. Available actions: search, list, sync', {
      input,
      data: {
        actions: ['search - Search documents', 'list - List repos', 'sync - Sync design doc'],
        mcpTools: ['get_user_repos', 'get_repo_docs', 'get_doc', 'create_doc', 'update_doc', 'search'],
        binding: learnedBinding,
        skillConfig: skillSettings
      }
    });
  }
};

function parseYuqueParams(input) {
  const params = {};
  if (/同步|sync|上传|push/i.test(input)) params.action = 'sync';
  else if (/搜索|search|查找/i.test(input)) params.action = 'search';
  else if (/列表|list|仓库|repo/i.test(input)) params.action = 'list';

  const pathMatch = input.match(/(?:路径|path|文件|file)\s*[:=]?\s*(\S+)/i);
  if (pathMatch) params.path = pathMatch[1];

  const repoMatch = input.match(/(?:仓库|repo|namespace)\s*[:=]?\s*(\S+)/i);
  if (repoMatch) params.repo = repoMatch[1];

  const keywordMatch = input.match(/(?:关键词|keyword|搜索)\s*[:=]?\s*(.+?)(?:\s*$)/i);
  if (keywordMatch) params.keyword = keywordMatch[1].trim();

  return params;
}

async function syncDesignDoc(params, input, learnedBinding, knowledgeBase, skillSettings = {}) {
  const filePath = params.path || 'DESIGN.md';

  if (!(await fs.pathExists(filePath))) {
    return createSkillError('yuque-sync-design', `Design file not found: ${filePath}`, {
      input,
      kind: 'invalid-input',
      retryable: true,
      data: {
        action: 'sync',
        path: filePath
      },
      retryHints: [
        'Retry with an existing markdown design file.',
        'Use path=<file> to point to the design document you want to sync.'
      ]
    });
  }

  return wrapSkillCall('yuque-sync-design', input, async () => {
    const content = await fs.readFile(filePath, 'utf-8');
    const title = extractTitle(content) || path.basename(filePath, '.md');
    const namespace = params.repo || skillSettings.defaultRepo || learnedBinding?.connection?.namespace;
    const execution = await knowledgeBase.createDoc(namespace, {
      slug: title.toLowerCase().replace(/\s+/g, '-'),
      title,
      body: content,
      format: skillSettings.syncFormat || 'markdown'
    });

    return createSkillResult('yuque-sync-design', `Ready to sync "${title}" to Yuque`, {
      input,
      data: {
        action: 'sync',
        args: {
          namespace,
          slug: title.toLowerCase().replace(/\s+/g, '-'),
          title,
          format: skillSettings.syncFormat || 'markdown',
          archiveAfterSync: skillSettings.archiveAfterSync !== false
        },
        binding: learnedBinding,
        execution: summarizeYuqueExecution('sync', execution)
      }
    });
  }, { action: 'Yuque design sync' });
}

function summarizeYuqueExecution(action, execution) {
  const payload = unwrapPayload(execution);
  const data = payload && typeof payload === 'object' ? payload : {};
  const items = extractItems(data);

  return {
    action,
    status: extractStatus(data) || 'ok',
    total: extractTotal(data, items),
    items: items.slice(0, 5).map(summarizeItem),
    id: data.id || data.doc_id || data.slug || null
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

  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data;
  }

  return payload;
}

function extractItems(data) {
  const candidates = [data.list, data.items, data.repos, data.docs, data.result];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  return [];
}

function extractStatus(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  if (typeof data.status === 'string') {
    return data.status;
  }

  if (data.success === false) {
    return 'error';
  }

  return null;
}

function extractTotal(data, items) {
  return data.total || items.length || null;
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

function summarizeItem(item) {
  if (!item || typeof item !== 'object') {
    return item;
  }

  return {
    id: item.id || item.slug || item.namespace || null,
    title: item.title || item.name || item.slug || null,
    type: item.type || item.format || null
  };
}

function extractTitle(content) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}
