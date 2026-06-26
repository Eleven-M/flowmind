/**
 * Git Review Skill
 * Reviews commit history, analyzes changes, ensures code quality
 */

const { execSync } = require('child_process');

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /git\s*review|commit.*review|代码提交|提交审查|review.*commit|检查提交/i.test(input);
  },

  async execute(input, context) {
    const count = extractCount(input) || 5;

    try {
      const logRaw = execSync(
        `git log --oneline -${count} --format="%H|%s|%an|%ai"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();

      if (!logRaw) {
        return { type: 'result', skill: 'git-review', message: 'No commits found', input, timestamp: new Date().toISOString() };
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

      return {
        type: 'result',
        skill: 'git-review',
        message: `Reviewed ${commits.length} commits: ${good.length} good, ${issues.length} issues`,
        data: { commits, issues, good, summary: { total: commits.length, good: good.length, issues: issues.length } },
        input,
        timestamp: new Date().toISOString()
      };
    } catch (e) {
      return {
        type: 'error',
        skill: 'git-review',
        message: `Git review failed: ${e.message}`,
        input,
        timestamp: new Date().toISOString()
      };
    }
  }
};

function extractCount(input) {
  const match = input.match(/(\d+)\s*(?:个|条|commits?|次)/i) || input.match(/-(\d+)/);
  return match ? parseInt(match[1]) : null;
}
