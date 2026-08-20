/**
 * Project Review Skill
 * Analyzes project health, dependencies, and overall quality
 */

const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const { createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /项目审查|project review|项目健康|health check|依赖检查|dependency/i.test(input);
  },

  async execute(input, context) {
    const skillSettings = getSkillSettings(context);
    const checksConfig = skillSettings.checks || {};
    const thresholds = skillSettings.thresholds || {};
    const projectDir = extractProjectDir(input) || process.cwd();
    const checks = [];
    let score = 100;

    // Check package.json
    const pkgPath = path.join(projectDir, 'package.json');
    if (await fs.pathExists(pkgPath)) {
      const pkg = await fs.readJson(pkgPath);

      // Check for missing description
      if (checksConfig.quality !== false && !pkg.description) {
        checks.push({ type: 'warning', name: 'Missing description', impact: -5 });
        score -= 5;
      }

      // Check for missing license
      if (checksConfig.quality !== false && !pkg.license) {
        checks.push({ type: 'warning', name: 'Missing license', impact: -5 });
        score -= 5;
      }

      // Check for missing test script
      if (checksConfig.quality !== false && (!pkg.scripts?.test || pkg.scripts.test === 'echo "Error: no test specified"')) {
        checks.push({ type: 'warning', name: 'No test script configured', impact: -10 });
        score -= 10;
      }

      // Check for missing lint script
      if (checksConfig.quality !== false && !pkg.scripts?.lint) {
        checks.push({ type: 'info', name: 'No lint script configured', impact: -5 });
        score -= 5;
      }

      // Check dependency count
      if (checksConfig.dependencies !== false) {
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        checks.push({ type: 'info', name: `Dependencies: ${deps.length} prod, ${devDeps.length} dev` });
      }

      // Check for outdated (if npm is available)
      if (checksConfig.security !== false) {
        try {
          const outdated = execSync('npm outdated --json 2>/dev/null || echo "{}"', {
            encoding: 'utf-8', cwd: projectDir, timeout: 30000
          });
          const outdatedPkgs = JSON.parse(outdated);
          const count = Object.keys(outdatedPkgs).length;
          if (count > 0) {
            checks.push({ type: 'warning', name: `${count} outdated package(s)`, impact: -5 });
            score -= 5;
          }
        } catch {}
      }
    } else {
      checks.push({ type: 'error', name: 'No package.json found', impact: -20 });
      score -= 20;
    }

    // Check for README
    if (checksConfig.documentation !== false && !(await fs.pathExists(path.join(projectDir, 'README.md')))) {
      checks.push({ type: 'warning', name: 'No README.md', impact: -10 });
      score -= 10;
    }

    // Check for .git
    if (!(await fs.pathExists(path.join(projectDir, '.git')))) {
      checks.push({ type: 'info', name: 'Not a git repository' });
    }

    // Check for .gitignore
    if (checksConfig.quality !== false && !(await fs.pathExists(path.join(projectDir, '.gitignore')))) {
      checks.push({ type: 'warning', name: 'No .gitignore', impact: -5 });
      score -= 5;
    }

    score = Math.max(0, score);

    return createSkillResult('project-review', `Project health score: ${score}/100 (${checks.filter(c => c.type === 'warning' || c.type === 'error').length} issues)`, {
      input,
      data: {
        score,
        checks,
        summary: {
          score,
          issues: checks.filter(c => c.type !== 'info').length,
          thresholds
        },
        skillConfig: skillSettings
      }
    });
  }
};

function extractProjectDir(input) {
  const match = input.match(/(?:项目|project|目录|dir)\s+(.+?)(?:\s|$)/i);
  return match ? match[1].trim() : null;
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}
