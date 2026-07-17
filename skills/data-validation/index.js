/**
 * Data Validation Skill
 * Validates data against schema rules and business logic
 */

const { createSkillError, createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /数据校验|数据验证|data valid|validate data|校验数据|检查数据/i.test(input);
  },

  async execute(input, _context) {
    const data = extractData(input);

    if (!data) {
      return createSkillError('data-validation', 'No data found to validate. Provide JSON data or a file path.', {
        input,
        kind: 'invalid-input',
        retryable: true,
        retryHints: [
          'Include a JSON payload with rules and values in the request.',
          'Or provide a file path if this skill is extended to load local validation input.'
        ]
      });
    }

    const issues = [];

    // Schema validation
    if (data.rules && data.values) {
      for (const [field, rule] of Object.entries(data.rules)) {
        const value = data.values[field];

        if (rule.required && (value === undefined || value === null || value === '')) {
          issues.push({ field, rule: 'required', message: `${field} is required but missing`, severity: 'ERROR' });
        }
        if (value !== undefined && rule.type && typeof value !== rule.type) {
          issues.push({ field, rule: 'type', message: `${field} should be ${rule.type}, got ${typeof value}`, severity: 'ERROR' });
        }
        if (value !== undefined && rule.min !== undefined && value < rule.min) {
          issues.push({ field, rule: 'min', message: `${field} (${value}) below minimum (${rule.min})`, severity: 'WARNING' });
        }
        if (value !== undefined && rule.max !== undefined && value > rule.max) {
          issues.push({ field, rule: 'max', message: `${field} (${value}) above maximum (${rule.max})`, severity: 'WARNING' });
        }
        if (value !== undefined && rule.pattern && !new RegExp(rule.pattern).test(String(value))) {
          issues.push({ field, rule: 'pattern', message: `${field} doesn't match pattern`, severity: 'WARNING' });
        }
      }
    }

    const errors = issues.filter(i => i.severity === 'ERROR').length;
    const warnings = issues.filter(i => i.severity === 'WARNING').length;

    return createSkillResult('data-validation', issues.length > 0
        ? `Validation: ${errors} errors, ${warnings} warnings`
        : 'All validations passed', {
      input,
      data: { issues, summary: { errors, warnings, passed: issues.length === 0 } }
    });
  }
};

function extractData(input) {
  const jsonMatch = input.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }
  return null;
}
