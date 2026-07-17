/**
 * Code Review Skill
 * Analyzes code for security vulnerabilities, style violations, and best practices
 */

const fs = require('fs-extra');
const path = require('path');
const { createSkillResult } = require('../../core/result-contract');

const SECURITY_PATTERNS = [
  { pattern: /(\bselect\b.*\bfrom\b.*\bwhere\b.*['"]\s*\+\s*)/i, name: 'SQL Injection', severity: 'HIGH' },
  { pattern: /eval\s*\(/, name: 'Code Injection (eval)', severity: 'HIGH' },
  { pattern: /innerHTML\s*=/, name: 'XSS (innerHTML)', severity: 'MEDIUM' },
  { pattern: /password\s*=\s*['"][^'"]+['"]/i, name: 'Hardcoded Password', severity: 'HIGH' },
  { pattern: /api[_-]?key\s*=\s*['"][^'"]+['"]/i, name: 'Hardcoded API Key', severity: 'HIGH' },
  { pattern: /secret\s*=\s*['"][^'"]+['"]/i, name: 'Hardcoded Secret', severity: 'HIGH' },
  { pattern: /md5\s*\(/i, name: 'Weak Crypto (MD5)', severity: 'MEDIUM' },
  { pattern: /exec\s*\(\s*['"`]/, name: 'Command Injection', severity: 'HIGH' },
];

const QUALITY_PATTERNS = [
  { pattern: /console\.(log|debug|info)\s*\(/, name: 'Console statement', severity: 'LOW' },
  { pattern: /\/\/\s*TODO/i, name: 'TODO comment', severity: 'LOW' },
  { pattern: /\/\/\s*FIXME/i, name: 'FIXME comment', severity: 'MEDIUM' },
  { pattern: /\/\/\s*HACK/i, name: 'HACK comment', severity: 'MEDIUM' },
  { pattern: /catch\s*\(\s*\w*\s*\)\s*\{\s*\}/, name: 'Empty catch block', severity: 'MEDIUM' },
];

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    const lower = input.toLowerCase();
    return /代码审查|code review|review code|检查代码|分析代码/.test(lower);
  },

  async execute(input, context) {
    const skillSettings = getSkillSettings(context);
    const issues = [];
    const filePath = extractFilePath(input);
    const reviewRules = buildReviewRules(skillSettings);

    if (filePath && await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const relPath = path.basename(filePath);

      lines.forEach((line, idx) => {
        reviewRules.forEach(({ pattern, name, severity, type }) => {
          if (pattern.test(line)) {
            issues.push({ file: relPath, line: idx + 1, type, name, severity, code: line.trim() });
          }
        });
      });
    }

    const high = issues.filter(i => i.severity === 'HIGH').length;
    const medium = issues.filter(i => i.severity === 'MEDIUM').length;
    const low = issues.filter(i => i.severity === 'LOW').length;

    return createSkillResult('code-review', issues.length > 0
        ? `Found ${issues.length} issue(s): ${high} HIGH, ${medium} MEDIUM, ${low} LOW`
        : 'No issues found', {
      input,
      data: {
        issues,
        summary: { total: issues.length, high, medium, low },
        skillConfig: skillSettings
      }
    });
  }
};

function extractFilePath(input) {
  const match = input.match(/(?:review|审查|检查|分析)\s+(.+?\.[a-zA-Z]+)$/i)
    || input.match(/([^\s]+\.(js|ts|jsx|tsx|py|java|go|rs|c|cpp|rb))$/i);
  return match ? match[1].trim() : null;
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}

function buildReviewRules(skillSettings) {
  const reviewRules = [];
  const allowedSecuritySeverities = new Set(
    normalizeSeverityList(skillSettings.security?.severity || ['HIGH', 'MEDIUM', 'LOW'])
  );

  if (skillSettings.security?.enabled !== false) {
    for (const rule of SECURITY_PATTERNS) {
      if (!allowedSecuritySeverities.has(rule.severity)) {
        continue;
      }
      reviewRules.push({ ...rule, type: 'security' });
    }
  }

  if (skillSettings.quality?.enabled !== false) {
    for (const rule of QUALITY_PATTERNS) {
      reviewRules.push({ ...rule, type: 'quality' });
    }
  }

  for (const rule of Array.isArray(skillSettings.customRules) ? skillSettings.customRules : []) {
    if (!rule || !rule.pattern) continue;
    try {
      reviewRules.push({
        pattern: rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern, 'i'),
        name: rule.message || rule.name || 'Custom rule',
        severity: normalizeSeverity(rule.severity || 'LOW'),
        type: 'custom'
      });
    } catch {
      continue;
    }
  }

  return reviewRules;
}

function normalizeSeverityList(values) {
  return values.map((value) => normalizeSeverity(value));
}

function normalizeSeverity(value) {
  return String(value || 'LOW').toUpperCase();
}
