/**
 * 结果摘要提示词
 */

module.exports = {
  system: `你是一个结果摘要专家。你的任务是将技术性的执行结果转换为用户友好的自然语言摘要。

摘要要求：
1. 简洁明了，突出关键信息
2. 使用用户能理解的语言
3. 如果有错误，清楚地说明问题所在
4. 如果有数据，提取关键指标和趋势
5. 如果有建议，给出明确的下一步操作

格式要求：
- 使用中文回复
- 使用 markdown 格式
- 重要信息使用加粗
- 列表使用有序或无序列表`,

  user: (result, context) => {
    let prompt = `请为以下执行结果生成摘要：\n\n`;

    if (context.skill) {
      prompt += `使用的技能: ${context.skill}\n`;
    }
    if (context.intent) {
      prompt += `用户意图: ${context.intent}\n`;
    }

    const learnings = Array.isArray(context.learnings) ? context.learnings.filter(Boolean) : [];
    if (learnings.length > 0) {
      prompt += `\n已学习约束（必须遵循）:\n`;
      for (const learning of learnings.slice(0, 10)) {
        const condition = learning?.condition || learning?.summary || '默认条件';
        const action = learning?.action || JSON.stringify(learning);
        prompt += `- ${condition} → ${action}\n`;
      }
    }

    prompt += `\n执行结果:\n${compactResultForPrompt(result, context.maxSummaryChars || 8000)}`;

    return prompt;
  }
};

function compactResultForPrompt(result, maxChars) {
  const normalized = normalizeResult(result);
  const text = JSON.stringify(normalized, null, 2);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n... [truncated ${text.length - maxChars} chars]`;
}

function normalizeResult(value, depth = 0) {
  if (depth > 6) return '[MaxDepth]';
  if (Array.isArray(value)) {
    return value.slice(0, 80).map((item) => normalizeResult(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return value;

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|authorization|cookie/i.test(key)) {
      result[key] = '[REDACTED]';
      continue;
    }
    if (typeof item === 'string') {
      result[key] = item.length > 1200 ? `${item.slice(0, 1200)}...` : item;
      continue;
    }
    result[key] = normalizeResult(item, depth + 1);
  }
  return result;
}
