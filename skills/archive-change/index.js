/**
 * Archive Change Skill
 * Archive completed changes and maintain project history
 */

const fs = require('fs-extra');
const path = require('path');

module.exports = {
  canHandle(input, context) {
    if (!input) return false;
    return /归档|archive|完成.*存档|change.*archive|整理.*完成/i.test(input);
  },

  async execute(input, context) {
    const params = parseArchiveParams(input);

    if (params.action === 'check') {
      const checklist = await checkArchiveReadiness(params.path || '.');
      return {
        type: 'result',
        skill: 'archive-change',
        message: `Archive readiness: ${checklist.passed}/${checklist.total} checks passed`,
        data: { checklist },
        input,
        timestamp: new Date().toISOString()
      };
    }

    if (params.action === 'archive') {
      const archiveDir = params.archiveDir || '.archive';
      const changeName = params.name || `change-${Date.now()}`;

      return {
        type: 'result',
        skill: 'archive-change',
        message: `Archiving change: ${changeName}`,
        data: {
          changeName,
          archiveDir: path.join(archiveDir, changeName),
          structure: ['SUMMARY.md', 'PROPOSAL.md', 'SPECS.md', 'DESIGN.md', 'TASKS.md', 'CHANGELOG.md', 'TESTS.md', 'artifacts/'],
          preCheck: await checkArchiveReadiness(params.path || '.')
        },
        input,
        timestamp: new Date().toISOString()
      };
    }

    return {
      type: 'result',
      skill: 'archive-change',
      message: 'Archive change. Available actions: check, archive',
      data: {
        actions: ['check - Check readiness', 'archive - Archive change'],
        archiveStructure: ['SUMMARY.md', 'PROPOSAL.md', 'SPECS.md', 'DESIGN.md', 'TASKS.md', 'CHANGELOG.md', 'TESTS.md']
      },
      input,
      timestamp: new Date().toISOString()
    };
  }
};

function parseArchiveParams(input) {
  const params = {};
  if (/检查|check|就绪|ready/i.test(input)) params.action = 'check';
  if (/归档|archive|执行/i.test(input)) params.action = 'archive';

  const nameMatch = input.match(/(?:名称|name)\s*[:=]?\s*(\S+)/i);
  if (nameMatch) params.name = nameMatch[1];

  const pathMatch = input.match(/(?:路径|path|目录|dir)\s*[:=]?\s*(\S+)/i);
  if (pathMatch) params.path = pathMatch[1];

  return params;
}

async function checkArchiveReadiness(dir) {
  const checks = [
    { name: 'README exists', check: () => fs.pathExists(path.join(dir, 'README.md')) },
    { name: 'Has git history', check: () => fs.pathExists(path.join(dir, '.git')) },
    { name: 'Has package.json or similar', check: async () =>
      await fs.pathExists(path.join(dir, 'package.json')) ||
      await fs.pathExists(path.join(dir, 'pom.xml')) ||
      await fs.pathExists(path.join(dir, 'Cargo.toml'))
    },
  ];

  const results = [];
  for (const c of checks) {
    try {
      const passed = await c.check();
      results.push({ name: c.name, passed });
    } catch {
      results.push({ name: c.name, passed: false });
    }
  }

  return {
    checks: results,
    passed: results.filter(r => r.passed).length,
    total: results.length,
    ready: results.every(r => r.passed)
  };
}
