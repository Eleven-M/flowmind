/**
 * Git Review Skill
 * Reviews commit history, analyzes changes, ensures code quality
 */

const { execSync } = require('child_process');
const { createSkillError, createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /git\s*review|commit.*review|代码提交|提交审查|review.*commit|检查提交/i.test(input);
  },

  async execute(input, _context) {
    const count = extractCount(input) || 5;

    try {
      const logRaw = execSync(
        `git log --oneline -${count} --format="%H|%s|%an|%ai"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();

      if (!logRaw) {
        return createSkillResult('git-review', 'No commits found', { input });
      }

      const commits = logRaw.split('\n').map(line => {
        const [hash, subject, author, date] = line.split('|');
        return { hash: hash?.slice(0, 8), subject, author, date };
      });

      const issues = [];
      const good = [];

      commits.forEach(c => {
        // Check conventional commit format
        const conventional = /^(feat|fix|docs|style|refactor|test|chore|perf|ci|build)(\(.+\))?: .+/;
        if (!conventional.test(c.subject)) {
          issues.push({ hash: c.hash, type: 'format', message: `Non-conventional commit message: "${c.subject}"` });
        } else {
          good.push({ hash: c.hash, message: c.subject });
        }

        // Check length
        if (c.subject && c.subject.length > 72) {
          issues.push({ hash: c.hash, type: 'length', message: `Subject too long (${c.subject.length} chars)` });
        }
      });

      return createSkillResult('git-review', `Reviewed ${commits.length} commits: ${good.length} good, ${issues.length} issues`, {
        input,
        data: { commits, issues, good, summary: { total: commits.length, good: good.length, issues: issues.length } }
      });
    } catch (e) {
      return createSkillError('git-review', `Git review failed: ${e.message}`, {
        input,
        kind: 'execution-failed',
        retryable: true
      });
    }
  }
};

function extractCount(input) {
  const match = input.match(/(\d+)\s*(?:个|条|commits?|次)/i) || input.match(/-(\d+)/);
  return match ? parseInt(match[1]) : null;
}
