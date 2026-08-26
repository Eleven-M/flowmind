/**
 * 技能选择提示词
 */

module.exports = {
  system: `你是一个技能选择专家。你的任务是根据用户的输入，从候选技能列表中选择最合适的技能。

你需要返回一个 JSON 对象：
{
  "selectedSkill": "选中的技能名称",
  "confidence": 0.0-1.0,
  "reason": "选择原因"
}

选择标准：
1. 技能的触发词是否匹配用户输入
2. 技能的描述是否符合用户意图
3. 技能的参数是否能满足用户需求
4. 优先选择更具体的技能（如"sls-log-audit"优于"log-audit"）

请只返回 JSON，不要返回其他内容。`,

  user: (input, candidates, context = {}) => {
    const candidateList = candidates.slice(0, 12).map(c => ({
      name: c.name,
      description: truncateText(c.description, 220),
      triggers: Array.isArray(c.triggers) ? c.triggers.slice(0, 8) : [],
      category: c.category,
      score: c.score || undefined
    }));

    const contextParts = [];
    if (context.intent?.intent) {
      contextParts.push(`意图: ${context.intent.intent}`);
    }
    if (context.intent?.action) {
      contextParts.push(`动作: ${context.intent.action}`);
    }
    if (context.currentSkill) {
      contextParts.push(`当前技能: ${context.currentSkill}`);
    }

    const routeHistory = Array.isArray(context.routeHistory)
      ? context.routeHistory.filter((hint) => hint?.skill)
      : [];
    if (routeHistory.length > 0) {
      const historyLines = routeHistory
        .map((hint) => `- ${hint.skill}（历史使用 ${Number(hint.useCount) || 0} 次，相似度 ${Number(hint.similarity) || 0}）`)
        .join('\n');
      contextParts.push(`历史学习路由:\n${historyLines}`);
    }

    return `用户输入: "${input}"

${contextParts.length > 0 ? `上下文:\n${contextParts.join('\n')}\n` : ''}

候选技能列表:
${JSON.stringify(candidateList, null, 2)}

请选择最合适的技能。`;
  }
};

function truncateText(value, limit) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}
