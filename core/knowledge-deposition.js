const path = require('path');

function unwrapPayload(value) {
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
  return value;
}

function inferSkill(payload) {
  return payload.skill || payload.metadata?.skill || payload.data?.skill || null;
}

function buildTitle(skill, payload) {
  if (payload.data?.risk) {
    return `${skill || 'flowmind'} risk review`;
  }
  if (payload.data?.summary) {
    return `${skill || 'flowmind'} summary`;
  }
  if (payload.type === 'error') {
    return `${skill || 'flowmind'} failure runbook`;
  }
  return `${skill || 'flowmind'} knowledge note`;
}

function buildSuggestedPath(skill, title) {
  const base =
    String(title || 'flowmind-note')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'flowmind-note';
  return path.posix.join('docs', 'knowledge', `${skill || 'flowmind'}-${base}.md`);
}

function shouldSuggestDeposition(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.type === 'error') return true;
  const data = payload.data || {};
  return Boolean(
    data.risk ||
    data.regressionChecklist ||
    data.automationCandidates ||
    data.deposition ||
    data.summary ||
    data.nextActions
  );
}

function buildKnowledgeDepositionCandidates(result, options = {}) {
  const payload = unwrapPayload(result);
  if (!shouldSuggestDeposition(payload)) {
    return [];
  }

  const skill = inferSkill(payload);
  const title = options.title || buildTitle(skill, payload);
  const suggestedPath = options.path || buildSuggestedPath(skill, title);
  const namespace = options.namespace || options.repo || null;
  const suggestedInput = namespace
    ? `保存知识 path=${suggestedPath} repo=${namespace} title=${title}`
    : `runbook 模板 path=${suggestedPath} title=${title}`;

  return [
    {
      skill: 'knowledge-ops',
      reason:
        payload.type === 'error'
          ? 'Capture the failure context and retry hints as a reusable runbook'
          : 'Capture the execution result as reusable team knowledge',
      title,
      suggestedPath,
      suggestedInput,
      sourceSkill: skill,
      confidence: payload.type === 'error' ? 0.8 : 0.7
    }
  ];
}

function attachKnowledgeDepositionCandidates(result, options = {}) {
  const candidates = buildKnowledgeDepositionCandidates(result, options);
  if (candidates.length === 0 || !result || typeof result !== 'object') {
    return result;
  }

  if (result.data && typeof result.data === 'object') {
    return {
      ...result,
      data: {
        ...result.data,
        knowledgeDepositionCandidates: result.data.knowledgeDepositionCandidates || candidates
      }
    };
  }

  return {
    ...result,
    knowledgeDepositionCandidates: result.knowledgeDepositionCandidates || candidates
  };
}

module.exports = {
  buildKnowledgeDepositionCandidates,
  attachKnowledgeDepositionCandidates
};
