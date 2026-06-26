/**
 * Requirement Analyst Skill
 * Six-dimensional analysis of requirements, design, and code alignment
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /需求分析|requirement.*analy|六维分析|需求.*审查|分析需求/i.test(input);
  },

  async execute(input, context) {
    const dimensions = [
      { name: '历史设计原则', weight: 0.15, description: '评估历史设计意图、依据、当前有效性' },
      { name: '迭代合理性', weight: 0.15, description: '评估迭代驱动力、演进路径、迭代质量' },
      { name: '可扩展性', weight: 0.20, description: '评估开发扩展性、需求升级扩展性、用户增长扩展性' },
      { name: '市场路线图', weight: 0.15, description: '评估功能覆盖度、需求趋势、竞争定位' },
      { name: '需求代码偏差', weight: 0.20, description: '评估功能缺失、过度实现、理解偏差' },
      { name: '升级脆弱性', weight: 0.15, description: '评估数据模型脆弱性、API不兼容、硬编码陷阱' }
    ];

    const requirementText = extractRequirement(input);

    if (!requirementText) {
      return {
        type: 'result',
        skill: 'requirement-analyst',
        message: 'Please provide requirement text or a requirement document path for analysis',
        data: { dimensions: dimensions.map(d => ({ ...d, score: null })) },
        input,
        timestamp: new Date().toISOString()
      };
    }

    // Basic analysis based on text content
    const analysis = dimensions.map(dim => {
      const keywords = getDimensionKeywords(dim.name);
      const matches = keywords.filter(k => requirementText.toLowerCase().includes(k));
      const coverage = Math.min(1, matches.length / Math.max(1, keywords.length * 0.3));
      const score = Math.round(50 + coverage * 50);

      return {
        name: dim.name,
        weight: dim.weight,
        score,
        description: dim.description,
        findings: matches.length > 0 ? [`Found ${matches.length} relevant keywords`] : ['Insufficient data for analysis']
      };
    });

    const overallScore = Math.round(
      analysis.reduce((sum, d) => sum + d.score * d.weight, 0)
    );

    const priorityActions = [];
    analysis.filter(d => d.score < 60).forEach(d => {
      priorityActions.push({ priority: d.score < 40 ? 'P0' : 'P1', dimension: d.name, action: `Improve ${d.name}` });
    });

    return {
      type: 'result',
      skill: 'requirement-analyst',
      message: `Six-dimensional analysis complete. Overall score: ${overallScore}/100`,
      data: { overallScore, dimensions: analysis, priorityActions },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function extractRequirement(input) {
  const jsonMatch = input.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  const textMatch = input.replace(/需求分析|requirement.*analy|分析/gi, '').trim();
  return textMatch.length > 10 ? textMatch : null;
}

function getDimensionKeywords(dimName) {
  const map = {
    '历史设计原则': ['设计', '架构', '历史', '原理', '依据', 'design', 'architecture'],
    '迭代合理性': ['迭代', '版本', '功能', '需求', 'iteration', 'feature', 'release'],
    '可扩展性': ['扩展', '模块', '接口', '性能', 'scalable', 'extensible', 'modular'],
    '市场路线图': ['市场', '竞争', '路线', '规划', 'market', 'roadmap', 'competitive'],
    '需求代码偏差': ['偏差', '缺失', '过度', '偏差', 'gap', 'deviation', 'mismatch'],
    '升级脆弱性': ['脆弱', '兼容', '硬编码', '升级', 'fragile', 'breaking', 'migration']
  };
  return map[dimName] || [];
}
