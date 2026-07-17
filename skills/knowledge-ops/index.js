const fs = require('fs-extra');
const path = require('path');
const { reportProgress } = require('../../core/skill-progress');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural-language knowledge operation request, such as search/list/save/update/template'
    },
    context: {
      type: 'object',
      description: 'Optional execution context'
    }
  },
  required: ['input']
};

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    action: { type: 'string' },
    summary: { type: 'object' },
    namespace: { type: 'string' },
    slug: { type: 'string' },
    retryHints: { type: 'array' },
    bindingHint: { type: 'object' },
    nextActions: { type: 'array' }
  }
};

module.exports = {
  capabilities: ['knowledge'],
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,
  canHandle(input) {
    if (!input) return false;
    return /知识库|knowledge base|知识沉淀|搜索知识|保存知识|runbook/i.test(input);
  },

  async execute(input, context = {}) {
    const knowledgeBase = context.componentRegistry?.getAdapter('knowledgeBase');
    const skillSettings = {
      ...(context.skillConfig || {}),
      ...(context.preferences || {})
    };
    reportProgress(context, 'parse', 10, 'Parsing knowledge operation request');

    if (!knowledgeBase) {
      return createSkillError('knowledge-ops', 'Knowledge-base service not configured. Add the knowledgeBase component first.', {
        input,
        kind: 'missing-component',
        retryable: true,
        data: {
          hint: 'Configure a Yuque or other knowledge-base provider.',
        },
        retryHints: [
          'Configure the knowledgeBase component with Yuque or another provider.',
          'Provide repo=<namespace> after the provider is connected.'
        ],
        bindingHint: buildKnowledgeBindingHint(paramsFromInput(input))
      });
    }

    const params = parseParams(input);

    if (params.action === 'search') {
      reportProgress(context, 'search', 45, 'Searching knowledge base');
      const execution = await knowledgeBase.search(params.keyword || '', 'doc');
      reportProgress(context, 'finalize', 95, 'Preparing knowledge search response');
      return createSkillResult('knowledge-ops', `Knowledge search completed for: ${params.keyword || 'all docs'}`, {
        input,
        data: {
          action: 'search',
          query: params.keyword || '',
          summary: summarizeExecution(execution)
        }
      });
    }

    if (params.action === 'list') {
      reportProgress(context, 'list', 45, 'Listing knowledge repositories');
      const execution = await knowledgeBase.getRepos();
      reportProgress(context, 'finalize', 95, 'Preparing repository listing response');
      return createSkillResult('knowledge-ops', 'Knowledge repositories listed', {
        input,
        data: {
          action: 'list',
          summary: summarizeExecution(execution)
        }
      });
    }

    if (params.action === 'save') {
      const filePath = params.path || 'README.md';
      reportProgress(context, 'validate-source', 25, `Checking knowledge source: ${filePath}`);
      if (!(await fs.pathExists(filePath))) {
        return createSkillError('knowledge-ops', `Knowledge source file not found: ${filePath}`, {
          input,
          kind: 'invalid-input',
          retryable: true,
          data: {
            action: 'save',
            path: filePath
          },
          retryHints: [
            'Check the source path and retry with an existing markdown file.',
            'Use an absolute path if the current working directory is different from the file location.'
          ]
        });
      }

      reportProgress(context, 'read-source', 40, `Reading knowledge source: ${filePath}`);
      const body = await fs.readFile(filePath, 'utf-8');
      const title = params.title || inferTitle(body) || path.basename(filePath, path.extname(filePath));
      const namespace = params.repo || skillSettings.defaultNamespace;
      if (!namespace) {
        return buildMissingNamespaceResult(input, 'save', filePath);
      }
      const slug = slugify(title);
      reportProgress(context, 'persist', 75, `Saving knowledge entry to ${namespace}`);
      const execution = await knowledgeBase.createDoc(namespace, {
        slug,
        title,
        body,
        format: 'markdown'
      });
      reportProgress(context, 'finalize', 95, 'Preparing knowledge save response');

      return createSkillResult('knowledge-ops', `Knowledge entry saved: ${title}`, {
        input,
        data: {
          action: 'save',
          namespace,
          slug,
          summary: summarizeExecution(execution),
          deposition: {
            mode: 'save',
            sourcePath: filePath,
            namespace,
            slug,
            title
          },
          nextActions: [
            {
              skill: 'knowledge-ops',
              reason: 'Review or update the saved entry later',
              suggestedInput: `更新知识 path=${filePath} repo=${namespace} slug=${slug}`
            }
          ]
        }
      });
    }

    if (params.action === 'update') {
      const filePath = params.path || 'README.md';
      reportProgress(context, 'validate-source', 25, `Checking knowledge source: ${filePath}`);
      if (!(await fs.pathExists(filePath))) {
        return createSkillError('knowledge-ops', `Knowledge source file not found: ${filePath}`, {
          input,
          kind: 'invalid-input',
          retryable: true,
          data: {
            action: 'update',
            path: filePath
          },
          retryHints: [
            'Check the source path and retry with an existing markdown file.',
            'Use an absolute path if the current working directory is different from the file location.'
          ]
        });
      }

      reportProgress(context, 'read-source', 40, `Reading knowledge source: ${filePath}`);
      const body = await fs.readFile(filePath, 'utf-8');
      const namespace = params.repo || skillSettings.defaultNamespace;
      if (!namespace) {
        return buildMissingNamespaceResult(input, 'update', filePath);
      }
      const slug = params.slug || slugify(params.title || inferTitle(body) || path.basename(filePath, path.extname(filePath)));
      const title = params.title || inferTitle(body) || path.basename(filePath, path.extname(filePath));
      reportProgress(context, 'persist', 75, `Updating knowledge entry in ${namespace}`);
      const execution = await knowledgeBase.updateDoc(namespace, slug, {
        title,
        body,
        format: 'markdown'
      });
      reportProgress(context, 'finalize', 95, 'Preparing knowledge update response');

      return createSkillResult('knowledge-ops', `Knowledge entry updated: ${title}`, {
        input,
        data: {
          action: 'update',
          namespace,
          slug,
          summary: summarizeExecution(execution),
          deposition: {
            mode: 'update',
            sourcePath: filePath,
            namespace,
            slug,
            title
          }
        }
      });
    }

    if (params.action === 'template') {
      const outputPath = params.path || 'runbook.md';
      const title = params.title || 'Runbook';
      reportProgress(context, 'template', 55, `Generating runbook template: ${outputPath}`);
      const body = buildRunbookTemplate(title);
      await fs.ensureDir(path.dirname(outputPath));
      await fs.writeFile(outputPath, body, 'utf-8');
      reportProgress(context, 'finalize', 95, 'Preparing runbook template response');

      return createSkillResult('knowledge-ops', `Runbook template created: ${outputPath}`, {
        input,
        data: {
          action: 'template',
          path: outputPath,
          title,
          nextActions: [
            {
              skill: 'knowledge-ops',
              reason: 'Persist the generated runbook into the configured knowledge base',
              suggestedInput: `保存知识 path=${outputPath}${skillSettings.defaultNamespace ? ` repo=${skillSettings.defaultNamespace}` : ''}`
            }
          ]
        }
      });
    }

    return createSkillResult('knowledge-ops', 'Knowledge operations available: search, list, save', {
      input,
      data: {
        actions: ['search', 'list', 'save', 'update', 'template'],
        examples: [
          '搜索知识 keyword=发布回滚',
          '知识库列表',
          '保存知识 path=docs/runbook.md repo=team/ops',
          '更新知识 path=docs/runbook.md repo=team/ops slug=发布回滚手册',
          'runbook 模板 path=docs/runbook.md title=发布回滚'
        ]
      }
    });
  }
};

function parseParams(input) {
  const text = String(input || '');
  const params = {};

  if (/更新|update/i.test(text)) params.action = 'update';
  else if (/模板|template|runbook/i.test(text)) params.action = 'template';
  else if (/保存|save|沉淀/i.test(text)) params.action = 'save';
  else if (/搜索|search/i.test(text)) params.action = 'search';
  else if (/列表|list|仓库\b/i.test(text)) params.action = 'list';

  const keywordMatch = text.match(/(?:keyword|关键词)\s*[:=]?\s*(.+?)(?:\s+(?:path|repo|title)\s*=|\s*$)/i);
  if (keywordMatch) params.keyword = keywordMatch[1].trim();

  const pathMatch = text.match(/(?:path|文件|路径)\s*[:=]?\s*(\S+)/i);
  if (pathMatch) params.path = pathMatch[1];

  const repoMatch = text.match(/(?:repo|仓库|namespace)\s*[:=]?\s*(\S+)/i);
  if (repoMatch) params.repo = repoMatch[1];

  const titleMatch = text.match(/(?:title|标题)\s*[:=]?\s*(.+)$/i);
  if (titleMatch) params.title = titleMatch[1].trim();

  const slugMatch = text.match(/(?:slug)\s*[:=]?\s*(\S+)/i);
  if (slugMatch) params.slug = slugMatch[1];

  return params;
}

function paramsFromInput(input) {
  return parseParams(input);
}

function buildMissingNamespaceResult(input, action, filePath) {
  return createSkillError('knowledge-ops', 'Knowledge namespace is required. Provide repo=<namespace> or configure defaultNamespace.', {
    input,
    kind: 'missing-parameter',
    retryable: true,
    data: {
      action,
      path: filePath
    },
    retryHints: [
      'Add repo=<namespace> to the request, for example repo=team/ops.',
      'Or configure skillConfig.defaultNamespace for knowledge-ops.'
    ],
    bindingHint: buildKnowledgeBindingHint({ path: filePath })
  });
}

function summarizeExecution(execution) {
  const payload = unwrap(execution);
  const items = Array.isArray(payload.list)
    ? payload.list
    : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.docs)
        ? payload.docs
        : Array.isArray(payload.repos)
          ? payload.repos
          : [];

  return {
    total: payload.total || items.length || null,
    items: items.slice(0, 5).map((item) => ({
      id: item.id || item.slug || item.namespace || null,
      title: item.title || item.name || item.slug || null,
      type: item.type || item.format || null
    }))
  };
}

function unwrap(value) {
  if (!value || typeof value !== 'object') return {};
  if (Array.isArray(value.content)) {
    const text = value.content.find((item) => typeof item?.text === 'string')?.text;
    if (text) {
      try {
        return JSON.parse(text);
      } catch {
        return { text };
      }
    }
  }
  return value.data && typeof value.data === 'object' ? value.data : value;
}

function inferTitle(body) {
  const match = String(body || '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

function buildKnowledgeBindingHint(params = {}) {
  const repoSegment = params.repo ? ` repo=${params.repo}` : ' repo=team/ops';
  const pathSegment = params.path ? ` path=${params.path}` : '';
  return {
    kind: 'mcp-binding',
    componentType: 'knowledgeBase',
    provider: 'yuque',
    mcpServer: 'yuque-mcp',
    suggestedCommand: `flowmind "绑定知识库 mcp=yuque-mcp${repoSegment}${pathSegment}"`
  };
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '');
}

function buildRunbookTemplate(title) {
  return `# ${title}

## Context

- Service:
- Environment:
- Owner:

## Trigger

- Symptom:
- Alert / signal:
- Impact:

## Diagnosis

1. Check logs:
2. Check database:
3. Check cache:
4. Check dependent services:

## Mitigation

1. Immediate mitigation:
2. Rollback plan:
3. Validation steps:

## Follow-up

- Root cause:
- Permanent fix:
- Related change / release:
`;
}
