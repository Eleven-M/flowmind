/**
 * Code Review Audit Skill
 * Three-dimensional review: security audit, design compliance, mandatory constraints
 */

const fs = require('fs-extra');

const SECURITY_CHECKS = [
  { pattern: /(\bselect\b.*\bfrom\b.*\bwhere\b.*['"]\s*\+\s*)/i, name: 'SQL Injection', severity: 'HIGH' },
  { pattern: /eval\s*\(/, name: 'Code Injection', severity: 'HIGH' },
  { pattern: /innerHTML\s*=/, name: 'XSS Risk', severity: 'MEDIUM' },
  { pattern: /password|secret|apikey|token/i, name: 'Potential Sensitive Data', severity: 'MEDIUM' },
];

const CONSTRAINT_CHECKS = [
  { pattern: /class\s+[a-z]/, name: 'Class naming (should be PascalCase)', severity: 'LOW' },
  { pattern: /function\s+[A-Z]/, name: 'Function naming (should be camelCase)', severity: 'LOW' },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, name: 'Empty catch block', severity: 'MEDIUM' },
  { pattern: /\/\/\s*TODO/i, name: 'TODO comment', severity: 'LOW' },
];

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /安全审计|security audit|design compliance|设计合规|code review audit|审查审计/i.test(input);
  },

  async execute(input, context) {
    const findings = [];
    const filePath = extractFilePath(input);

    if (filePath && await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        SECURITY_CHECKS.forEach(({ pattern, name, severity }) => {
          if (pattern.test(line)) {
            findings.push({ dimension: 'security', line: idx + 1, name, severity, code: line.trim() });
          }
        });
        CONSTRAINT_CHECKS.forEach(({ pattern, name, severity }) => {
          if (pattern.test(line)) {
            findings.push({ dimension: 'constraint', line: idx + 1, name, severity, code: line.trim() });
          }
        });
      });
    }

    const high = findings.filter(f => f.severity === 'HIGH').length;
    const medium = findings.filter(f => f.severity === 'MEDIUM').length;
    const verdict = high > 0 ? 'FAIL' : medium > 0 ? 'CONDITIONAL' : 'PASS';

    return {
      type: 'result',
      skill: 'code-review-audit',
      message: `Audit verdict: ${verdict} (${findings.length} findings)`,
      data: {
        verdict,
        findings,
        summary: { total: findings.length, high, medium, low: findings.filter(f => f.severity === 'LOW').length },
        dimensions: {
          security: findings.filter(f => f.dimension === 'security').length,
          constraint: findings.filter(f => f.dimension === 'constraint').length
        }
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function extractFilePath(input) {
  const match = input.match(/(?:audit|审计|审查)\s+(.+?\.[a-zA-Z]+)$/i)
    || input.match(/([^\s]+\.(js|ts|jsx|tsx|py|java|go))$/i);
  return match ? match[1].trim() : null;
}
