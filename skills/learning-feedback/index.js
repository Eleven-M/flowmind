/**
 * Learning Feedback Skill
 * Captures user corrections, feedback, and refinement suggestions.
 * Overlaps with learning-engine but focuses on feedback capture and binding.
 */

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    const lower = input.toLowerCase();
    const feedbackPatterns = [
      /不对/, /错了/, /应该是/, /不要/, /别这样/,
      /下次/, /以后/, /记得/, /别再/, /改成/,
      /wrong/, /should be/, /don't/, /next time/, /change to/
    ];
    return feedbackPatterns.some(p => p.test(lower));
  },

  async execute(input, context) {
    const learning = context.flowmind?.learning;
    if (!learning) {
      return {
        type: 'error',
        skill: 'learning-feedback',
        message: 'Learning engine not available',
        input
      };
    }

    // Detect correction patterns
    const correction = learning.detectCorrection(input);
    if (correction) {
      const record = await learning.recordCorrection(correction, context);
      return {
        type: 'learning',
        skill: 'learning-feedback',
        learningType: 'correction',
        message: `Recorded correction: ${correction.summary || 'user feedback captured'}`,
        data: record,
        input,
        timestamp: new Date().toISOString()
      };
    }

    // Detect preference patterns
    const preference = learning.detectPreference(input);
    if (preference) {
      const record = await learning.recordPreference(preference, context);
      return {
        type: 'learning',
        skill: 'learning-feedback',
        learningType: 'preference',
        message: `Recorded preference: ${preference.type} = ${preference.value}`,
        data: record,
        input,
        timestamp: new Date().toISOString()
      };
    }

    // Detect scene mapping
    const scene = learning.detectSceneMapping(input);
    if (scene) {
      const record = await learning.recordSceneMapping(scene, context);
      return {
        type: 'learning',
        skill: 'learning-feedback',
        learningType: 'scene_mapping',
        message: `Recorded scene mapping for skill: ${scene.skill}`,
        data: record,
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'learning-feedback',
      message: 'No feedback pattern detected',
      input,
      timestamp: new Date().toISOString()
    };
  }
};
