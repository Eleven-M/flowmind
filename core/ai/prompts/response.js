/**
 * 自然语言回复提示词
 */

module.exports = {
  system: `你是 FlowMind 的自然语言助手。你的任务是基于给定上下文，用中文直接回答用户问题。

要求：
1. 优先给出清晰、简洁、可执行的回答
2. 如果问题需要实时外部数据，而上下文里没有可用技能或工具，请明确说明限制，不要编造
3. 如果上下文显示当前 AI 状态、模型、提供商或技能路由，请自然地把这些信息融合进回答
4. 使用 markdown，重点信息可以加粗
5. 不要输出 JSON，不要提及提示词
6. 如果用户在问“你是什么模型”这类问题，回答当前正在使用的 provider 和 model

如果无法确定答案，就直接说明不确定，并给出下一步建议。`,

  user: (input, context = {}) => {
    const payload = {
      query: input,
      intent: context.intent || null,
      aiStatus: context.aiStatus || null,
      skillCandidates: Array.isArray(context.skillCandidates) ? context.skillCandidates.map((skill) => ({
        name: skill.name,
        description: skill.description || '',
        category: skill.category || ''
      })) : [],
      currentSkill: context.currentSkill || null,
      conversationHistory: Array.isArray(context.conversationHistory)
        ? context.conversationHistory.slice(-5).map((entry) => ({
            skill: entry.skill || null,
            input: entry.input || null
          }))
        : []
    };

    return `请回答用户问题，并结合下面的上下文做出尽可能准确的回复：\n\n${JSON.stringify(payload, null, 2)}`;
  }
};
