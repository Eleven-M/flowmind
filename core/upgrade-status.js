const fs = require('fs-extra');
const path = require('path');
const LRUCache = require('lru-cache');
const pLimit = require('p-limit');
const packageJson = require('../package.json');

const fileListCache = new LRUCache({ max: 8, ttl: 30 * 1000 });
const contentSearchCache = new LRUCache({ max: 64, ttl: 30 * 1000 });

const UPGRADE_DIRECTIONS = [
  {
    id: '1',
    title: 'Deep integration chaining',
    checks: [
      { key: 'changeImpactSkill', label: 'change-impact-review skill', file: 'skills/change-impact-review/index.js' },
      { key: 'reportSkill', label: 'report-insights skill', file: 'skills/report-insights/index.js' },
      { key: 'workflowHistory', label: 'workflow audit history store', file: 'core/workflow-history.js' },
      { key: 'workflowResume', label: 'resumable workflow execution', search: 'flowmind_resume_workflow' },
      { key: 'automationCandidates', label: 'automation candidate contract', search: 'automationCandidates' },
      { key: 'followUpChain', label: 'guarded follow-up chain builder', file: 'core/automation-chain.js' },
      {
        key: 'executableFollowUpChain',
        label: 'reviewed follow-up chain execution',
        file: 'core/workflow-executor.js',
        phase: 'live'
      }
    ],
    next: 'Add live cloud validation and provider smoke tests.'
  },
  {
    id: '2',
    title: 'MCP task lifecycle',
    checks: [
      { key: 'taskTools', label: 'async task MCP tools', search: 'flowmind_start_task' },
      { key: 'taskProgress', label: 'task progress history', search: 'progressHistory' },
      { key: 'taskPersistence', label: 'task persistence store', file: 'core/task-store.js' }
    ],
    next: 'Persist task state, expose timeout/retry metadata, and support best-effort running cancellation.'
  },
  {
    id: '6',
    title: 'Knowledge deposition',
    checks: [
      { key: 'knowledgeOps', label: 'knowledge-ops skill', file: 'skills/knowledge-ops/index.js' },
      { key: 'depositionContract', label: 'deposition output contract', search: 'deposition' },
      { key: 'candidateBuilder', label: 'knowledge deposition candidate builder', file: 'core/knowledge-deposition.js' }
    ],
    next: 'Convert repeated task outputs, failures, and runbooks into reviewable save/update suggestions.'
  },
  {
    id: '7',
    title: 'CLI/TUI operational experience',
    checks: [
      { key: 'upgradeStatusCommand', label: 'upgrade-status CLI command', search: "command('upgrade-status')" },
      { key: 'taskProgressUi', label: 'task progress UI helpers', file: '__tests__/task-progress-ui.test.js' },
      {
        key: 'dryRunPreview',
        label: 'dry-run execution preview implementation',
        file: 'core/dry-run.js',
        phase: 'live'
      }
    ],
    next: 'Surface workflow approval and execution timelines in TUI/dashboard views.'
  },
  {
    id: '8',
    title: 'Release maintenance',
    checks: [
      { key: 'releaseNotes', label: 'current release notes', file: `releases/v${packageJson.version}.md` },
      { key: 'releaseCheck', label: 'release-check CLI command', search: "command('release-check')" },
      { key: 'updateCheck', label: 'update checker', file: 'scripts/check-update.js' }
    ],
    next: 'Run release-check before publish and keep release notes generated from the same status data.'
  }
];

async function repositoryContains(rootDir, pattern) {
  const cacheKey = `${rootDir}:${pattern}`;
  if (contentSearchCache.has(cacheKey)) {
    return contentSearchCache.get(cacheKey);
  }

  const files = await collectTextFiles(rootDir);
  const limit = pLimit(8);
  const matches = await Promise.all(
    files.map((file) =>
      limit(async () => {
        const content = await fs.readFile(file, 'utf-8');
        return content.includes(pattern);
      })
    )
  );
  const found = matches.some(Boolean);
  contentSearchCache.set(cacheKey, found);
  return found;
}

async function collectTextFiles(rootDir) {
  if (fileListCache.has(rootDir)) {
    return fileListCache.get(rootDir);
  }

  const results = [];
  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (['.git', 'node_modules', '.flowmind-codex', '.npm-cache'].includes(entry.name)) {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (/\.(js|jsx|json|md|yml|yaml|txt)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  await walk(rootDir);
  fileListCache.set(rootDir, results);
  return results;
}

async function evaluateCheck(rootDir, check) {
  if (check.file) {
    const filePath = path.join(rootDir, check.file);
    if (!(await fs.pathExists(filePath))) return false;
    if (!check.match) return true;
    const content = await fs.readFile(filePath, 'utf-8');
    return check.match.test(content);
  }
  if (check.search) {
    return repositoryContains(rootDir, check.search);
  }
  return false;
}

async function getUpgradeStatus(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const directions = [];

  for (const direction of UPGRADE_DIRECTIONS) {
    const checks = [];
    for (const check of direction.checks) {
      const passed = await evaluateCheck(rootDir, check);
      checks.push({
        key: check.key,
        label: check.label,
        phase: check.phase || 'local',
        passed
      });
    }
    const passedCount = checks.filter((check) => check.passed).length;
    const total = checks.length;
    directions.push({
      id: direction.id,
      title: direction.title,
      status: passedCount === total ? 'complete' : passedCount > 0 ? 'partial' : 'pending',
      passed: passedCount,
      total,
      checks,
      next: direction.next
    });
  }

  const totals = directions.reduce(
    (acc, direction) => {
      acc.passed += direction.passed;
      acc.total += direction.total;
      return acc;
    },
    { passed: 0, total: 0 }
  );

  const phases = directions
    .flatMap((direction) => direction.checks)
    .reduce((acc, check) => {
      const phase = check.phase || 'local';
      if (!acc[phase]) acc[phase] = { passed: 0, total: 0, percent: 0, status: 'pending' };
      acc[phase].total += 1;
      if (check.passed) acc[phase].passed += 1;
      return acc;
    }, {});

  for (const phase of Object.values(phases)) {
    phase.percent = phase.total === 0 ? 0 : Math.round((phase.passed / phase.total) * 100);
    phase.status = phase.passed === phase.total ? 'complete' : phase.passed > 0 ? 'partial' : 'pending';
  }

  return {
    package: packageJson.name,
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    summary: {
      status: totals.passed === totals.total ? 'complete' : 'partial',
      passed: totals.passed,
      total: totals.total,
      percent: totals.total === 0 ? 0 : Math.round((totals.passed / totals.total) * 100)
    },
    phases,
    directions
  };
}

module.exports = {
  UPGRADE_DIRECTIONS,
  getUpgradeStatus
};
