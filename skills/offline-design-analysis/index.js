const path = require('path');
const { reportProgress } = require('../../core/skill-progress');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    input: {
      type: 'string',
      description: 'Natural-language request to analyze local learning material, documents, or code without AI'
    },
    context: {
      type: 'object',
      description: 'Optional sourceDir, repoDir/cwd, includeCode, and analysis limits'
    }
  },
  required: ['input']
};

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    mode: { type: 'string' },
    summary: { type: 'string' },
    designFlow: { type: 'array' },
    architecture: { type: 'object' },
    documentSummary: { type: 'array' },
    codeSummary: { type: 'array' },
    testFocus: { type: 'array' },
    citations: { type: 'array' },
    confidence: { type: 'object' },
    limitations: { type: 'array' }
  }
};

module.exports = {
  capabilities: ['analysis', 'knowledge'],
  inputSchema: INPUT_SCHEMA,
  outputSchema: OUTPUT_SCHEMA,

  canHandle(input, context = {}) {
    if (!input) return false;
    const text = String(input);
    const explicitOfflineIntent = /离线分析|无模型|没有\s*AI|不用\s*AI|本地资料分析|分析(?:历史|学习)资料|历史设计总结|(?:总结|分析)(?:本地)?(?:代码|文档)|(?:生成|梳理|总结)设计流程|offline analysis|without AI|summari[sz]e local (?:code|documents?)/i;
    const analysisAction = /分析(?:下|一下)?|梳理|总结|说明|解释|了解|还原|看(?:下|一下|看)|review|inspect|analy[sz]e|summari[sz]e|explain/i;
    const designSubject = /流程|链路|逻辑|规则|设计|实现|代码|文档|资料|模块|process|flow|logic|design|implementation|code|document/i;
    const analysisQuestion = /是什么|怎么走|如何实现|怎样实现|how does|what is/i;
    const executionAction = /^\s*(?:请|帮我)?\s*(?:执行|运行|启动|触发|部署|发布|上线|查询.*(?:流水线|pipeline).*状态|run|execute|deploy|release|start)/i;

    if (explicitOfflineIntent.test(text)) return true;
    if (context.aiAvailable !== false) return false;
    return (analysisAction.test(text) || analysisQuestion.test(text))
      && designSubject.test(text)
      && !executionAction.test(text);
  },

  async execute(input, context = {}) {
    const flowmind = context.flowmind;
    if (!flowmind || typeof flowmind.analyzeOffline !== 'function') {
      return createSkillError('offline-design-analysis', 'Offline analysis is not available in the current FlowMind runtime.', {
        input,
        kind: 'missing-runtime',
        retryable: false
      });
    }

    const parsed = parseOptions(input, context);
    reportProgress(context, 'discover', 10, 'Discovering local learning material and repository files');
    try {
      const analysis = await flowmind.analyzeOffline(input, parsed);
      reportProgress(context, 'finalize', 95, `Prepared ${analysis.citations.length} evidence citation(s)`);
      return createSkillResult('offline-design-analysis', analysis.summary, {
        input,
        data: analysis
      });
    } catch (error) {
      return createSkillError('offline-design-analysis', error.message, {
        input,
        kind: 'offline-analysis-failed',
        retryable: true,
        retryHints: ['Check sourceDir/repoDir permissions and retry.', 'Use smaller maxFiles/maxResults limits for very large repositories.']
      });
    }
  }
};

function parseOptions(input, context = {}) {
  const text = String(input || '');
  return {
    sourceDir: extractPathOption(text, ['sourceDir', 'source', '资料目录']) || context.sourceDir,
    repoDir: extractPathOption(text, ['repoDir', 'repo', '项目目录', '代码目录']) || context.repoDir || context.cwd,
    includeCode: context.includeCode !== false && !/不分析代码|excludeCode|includeCode\s*[:=]\s*false/i.test(text),
    maxResults: extractNumberOption(text, 'maxResults') || context.maxResults,
    maxMaterialFiles: extractNumberOption(text, 'maxMaterialFiles') || context.maxMaterialFiles,
    maxCodeFiles: extractNumberOption(text, 'maxCodeFiles') || context.maxCodeFiles
  };
}

function extractPathOption(input, keys) {
  const keyPattern = keys.map(escapeRegex).join('|');
  const quoted = input.match(new RegExp(`(?:${keyPattern})\\s*[:=]\\s*["']([^"']+)["']`, 'i'));
  if (quoted) return path.resolve(quoted[1]);
  const plain = input.match(new RegExp(`(?:${keyPattern})\\s*[:=]\\s*([^\\s,，]+)`, 'i'));
  return plain ? path.resolve(plain[1]) : null;
}

function extractNumberOption(input, key) {
  const match = input.match(new RegExp(`${escapeRegex(key)}\\s*[:=]\\s*(\\d+)`, 'i'));
  return match ? Number(match[1]) : null;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
