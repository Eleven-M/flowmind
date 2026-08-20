/**
 * SLS Log Audit Skill
 * Query Alibaba Cloud SLS logs, trace ID chain analysis, performance analysis
 */

const logAuditSkill = require('../log-audit');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /sls.*日志|sls.*log|阿里云.*日志|trace.*分析|feign.*链|调用链.*分析/i.test(input);
  },

  async execute(input, context) {
    const result = await logAuditSkill.execute(input, context);
    return relabelSkillResult(result, 'sls-log-audit');
  }
};

function relabelSkillResult(result, skillName) {
  if (!result || typeof result !== 'object') {
    return result;
  }

  const cloned = {
    ...result
  };

  if (cloned.skill) {
    cloned.skill = skillName;
  }

  if (cloned.data && typeof cloned.data === 'object' && !Array.isArray(cloned.data)) {
    cloned.data = relabelSkillResult(cloned.data, skillName);
  }

  if (cloned.metadata && typeof cloned.metadata === 'object' && !Array.isArray(cloned.metadata)) {
    cloned.metadata = {
      ...cloned.metadata,
      skill: skillName
    };
  }

  return cloned;
}
