/**
 * Learning Engine Skill
 * Delegates to core LearningEngine for detecting and recording learning patterns
 */

const { createSkillError, createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    const lower = input.toLowerCase();
    const patterns = [
      /不[对是]/, /错[了误]/, /应该[是用]/, /改[成为]/, /优化/, /改进/,
      /记住/, /学习/, /纠正/, /prefer/, /learn/, /correct/, /remember/
    ];
    return patterns.some(p => p.test(lower));
  },

  async execute(input, context) {
    const learning = context.flowmind?.learning;
    if (!learning) {
      return createSkillError('learning-engine', 'Learning engine not available', {
        input,
        kind: 'missing-component',
        retryable: false
      });
    }

    const result = await learning.detectLearning(input, context);

    if (result) {
      return {
        type: 'learning',
        skill: 'learning-engine',
        learningType: result.type,
        message: result.message || `Detected ${result.type} learning pattern`,
        data: result,
        input,
        timestamp: new Date().toISOString()
      };
    }

    return createSkillResult('learning-engine', 'No learning pattern detected in input', {
      input
    });
  }
};
