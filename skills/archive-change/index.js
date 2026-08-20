/**
 * Archive Change Skill
 * Archive completed changes and maintain project history
 */

const fs = require('fs-extra');
const path = require('path');
const { createSkillResult } = require('../../core/result-contract');

module.exports = {
  canHandle(input, _context) {
    if (!input) return false;
    return /归档|archive|完成.*存档|change.*archive|整理.*完成/i.test(input);
  },

  async execute(input, context) {
    const skillSettings = getSkillSettings(context);
    const params = parseArchiveParams(input);

    if (params.action === 'check') {
      const checklist = await checkArchiveReadiness(params.path || '.', skillSettings);
      return createSkillResult('archive-change', `Archive readiness: ${checklist.passed}/${checklist.total} checks passed`, {
        input,
        data: {
          checklist,
          archiveLocation: skillSettings.location || 'archive/changes',
          skillConfig: skillSettings
        }
      });
    }

    if (params.action === 'archive') {
      const archiveDir = params.archiveDir || skillSettings.location || '.archive';
      const changeName = params.name || `change-${Date.now()}`;
      const keepTests = params.keepTests !== undefined ? params.keepTests : skillSettings.keepTests !== false;
      const keepArtifacts = params.keepArtifacts !== undefined ? params.keepArtifacts : skillSettings.keepArtifacts !== false;
      const generateSummary = skillSettings.generateSummary !== false;
      const updateChangelog = skillSettings.updateChangelog !== false;
      const structure = ['SUMMARY.md', 'PROPOSAL.md', 'SPECS.md', 'DESIGN.md', 'TASKS.md'];

      if (generateSummary) {
        structure.push('CHANGELOG.md');
      }
      if (keepTests) {
        structure.push('TESTS.md');
      }
      if (keepArtifacts) {
        structure.push('artifacts/');
      }

      const archivePath = path.resolve(archiveDir, changeName);
      const execution = context.executionMode === 'execute'
        ? await materializeArchive(params.path || '.', archivePath, structure)
        : { status: 'preview', written: [] };

      return createSkillResult('archive-change', `${execution.status === 'completed' ? 'Archived' : 'Archiving'} change: ${changeName}`, {
        input,
        data: {
          changeName,
          archiveDir: archivePath,
          structure,
          updateChangelog,
          preCheck: await checkArchiveReadiness(params.path || '.', skillSettings),
          execution,
          skillConfig: skillSettings
        }
      });
    }

    return createSkillResult('archive-change', 'Archive change. Available actions: check, archive', {
      input,
      data: {
        actions: ['check - Check readiness', 'archive - Archive change'],
        archiveStructure: ['SUMMARY.md', 'CODE-DELIVERY.md', 'PROPOSAL.md', 'SPECS.md', 'DESIGN.md', 'TASKS.md', 'CHANGELOG.md', 'TESTS.md'],
        archiveLocation: skillSettings.location || 'archive/changes',
        skillConfig: skillSettings
      }
    });
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

async function materializeArchive(sourceDir, archivePath, structure) {
  if (await fs.pathExists(archivePath)) {
    throw new Error(`Archive target already exists: ${archivePath}`);
  }

  await fs.ensureDir(archivePath);
  const written = [];
  for (const entry of structure) {
    const sourcePath = path.resolve(sourceDir, entry);
    const targetPath = path.join(archivePath, entry);
    if (entry.endsWith('/')) {
      await fs.ensureDir(targetPath);
      written.push(entry);
    } else if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, targetPath, { overwrite: false, errorOnExist: true });
      written.push(entry);
    }
  }

  const manifest = {
    archivedAt: new Date().toISOString(),
    sourceDir: path.resolve(sourceDir),
    files: written
  };
  await fs.writeJson(path.join(archivePath, 'archive-manifest.json'), manifest, { spaces: 2 });
  written.push('archive-manifest.json');
  return { status: 'completed', written };
}

async function checkArchiveReadiness(dir, skillSettings = {}) {
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
    ready: results.every(r => r.passed),
    location: skillSettings.location || 'archive/changes'
  };
}

function getSkillSettings(context = {}) {
  return {
    ...(context.skillConfig || {}),
    ...(context.preferences || {})
  };
}
