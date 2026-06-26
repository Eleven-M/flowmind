/**
 * Learning Engine Skill
 * Delegates to core LearningEngine for detecting and recording learning patterns
 */

module.exports = {
  canHandle(input, context) {
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
      return {
        type: 'error',
        skill: 'learning-engine',
        message: 'Learning engine not available',
        input
      };
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

    return {
      type: 'result',
      skill: 'learning-engine',
      message: 'No learning pattern detected in input',
      input,
      timestamp: new Date().toISOString()
    };
  }
};
