#!/usr/bin/env node
/**
 * OpenSpec 生命周期检查（强制闭环：设计 → 开发 → 代码合入 → 双归档）
 *
 * 用法: node scripts/check-openspec-lifecycle.js [项目changes目录]
 *       缺省目录为 flowmind 自身的 openspec/changes；可传入任意项目的目录检查。
 * 退出码: 0 = 无悬挂变更; 1 = 存在悬挂变更（详见输出）
 */
const fs = require('fs');
const path = require('path');

// 代码归档规则生效日：此后归档的变更必须有 code-delivery.md
const CODE_DELIVERY_EFFECTIVE = '2026-08-20';
const NAMING_RULE_EFFECTIVE = '2026-08-26';
const CHANGE_DIR_PATTERN = /^\d{4}-\d{2}-\d{2}-\d+-[a-z0-9][a-z0-9-]*$/;
const LOWERCASE_REQUIRED_FILES = new Set(['proposal.md', 'design.md', 'specs.md', 'tasks.md', 'code-delivery.md']);
const LEGACY_FILE_ALIASES = Object.freeze({
  // Legacy aliases are readable so old archives can be checked without
  // migration, but new changes still fail naming validation.
  'tasks.md': ['TASKS.md'],
  'code-delivery.md': ['CODE-DELIVERY.md']
});

function resolveFile(dir, canonicalName) {
  const canonicalPath = path.join(dir, canonicalName);
  if (fs.existsSync(canonicalPath)) {
    return canonicalPath;
  }
  for (const alias of LEGACY_FILE_ALIASES[canonicalName] || []) {
    const aliasPath = path.join(dir, alias);
    if (fs.existsSync(aliasPath)) {
      return aliasPath;
    }
  }
  return canonicalPath;
}

function readTasksStatus(dir) {
  const tasksPath = resolveFile(dir, 'tasks.md');
  if (!fs.existsSync(tasksPath)) {
    return { hasTasks: false, done: 0, open: 0 };
  }
  const content = fs.readFileSync(tasksPath, 'utf-8');
  const done = (content.match(/^- \[x\]/gm) || []).length;
  const open = (content.match(/^- \[ \]/gm) || []).length;
  return { hasTasks: true, done, open };
}

function readYaml(dir) {
  const yamlPath = path.join(dir, '.openspec.yaml');
  if (!fs.existsSync(yamlPath)) {
    return {};
  }
  const yaml = {};
  for (const line of fs.readFileSync(yamlPath, 'utf-8').split('\n')) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      yaml[match[1]] = match[2].trim();
    }
  }
  return yaml;
}

function readChangeDate(name, yaml) {
  const fromName = name.match(/^(\d{4}-\d{2}-\d{2})-/)?.[1];
  return (yaml.created || yaml.createdAt || yaml.archivedAt || fromName || '').slice(0, 10);
}

function shouldEnforceNaming(name, yaml) {
  const changeDate = readChangeDate(name, yaml);
  return !changeDate || changeDate >= NAMING_RULE_EFFECTIVE;
}

function validateNaming(relativeName, dir, yaml, issues) {
  const baseName = path.basename(relativeName);
  const enforce = shouldEnforceNaming(baseName, yaml);
  const report = enforce ? issues.violations : issues.warnings;
  const prefix = enforce ? '' : '存量提醒：';

  if (!CHANGE_DIR_PATTERN.test(baseName)) {
    report.push(
      `${relativeName}: ${prefix}OpenSpec 目录名必须为 YYYY-MM-DD-需求编号-小写短横线名称，例如 2026-08-26-3418-store-restriction`
    );
  }

  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    if (!fs.statSync(filePath).isFile()) {
      continue;
    }
    const lower = file.toLowerCase();
    if (LOWERCASE_REQUIRED_FILES.has(lower) && file !== lower) {
      report.push(`${relativeName}/${file}: ${prefix}OpenSpec 文件名必须小写，改为 ${lower}`);
    }
  }
}

function runCheck(targetDir) {
  if (!fs.existsSync(targetDir)) {
    return {
      targetDir,
      violations: [`changes 目录不存在: ${targetDir}`],
      warnings: [],
      inProgress: []
    };
  }

  const issues = { violations: [], warnings: [] };
  const inProgress = [];

  for (const entry of fs.readdirSync(targetDir)) {
    const dir = path.join(targetDir, entry);
    if (!fs.statSync(dir).isDirectory()) {
      continue;
    }

    if (entry === 'archive') {
      // 归档区：检查命名与代码归档记录（规则生效后的归档必须有 code-delivery.md）
      for (const archived of fs.readdirSync(dir)) {
        const aDir = path.join(dir, archived);
        if (!fs.statSync(aDir).isDirectory()) {
          continue;
        }
        const yaml = readYaml(aDir);
        validateNaming(`archive/${archived}`, aDir, yaml, issues);
        const archivedAt = (yaml.archivedAt || '').slice(0, 10);
        const hasDelivery = fs.existsSync(resolveFile(aDir, 'code-delivery.md'));
        if (!hasDelivery) {
          if (archivedAt && archivedAt >= CODE_DELIVERY_EFFECTIVE) {
            issues.violations.push(`archive/${archived}: 归档于 ${archivedAt}，缺少代码归档 code-delivery.md`);
          } else {
            issues.warnings.push(`archive/${archived}: 早于 ${CODE_DELIVERY_EFFECTIVE} 归档，无 code-delivery.md（存量，建议补记）`);
          }
        } else if (yaml.status === 'delivered-pending-merge') {
          issues.warnings.push(`archive/${archived}: 代码待合入（delivered-pending-merge），合入后需补记并改 completed`);
        }
      }
      continue;
    }

    const yaml = readYaml(dir);
    validateNaming(entry, dir, yaml, issues);

    const { hasTasks, done, open } = readTasksStatus(dir);
    const status = yaml.status;

    if (!hasTasks) {
      issues.violations.push(`${entry}: 只有设计没有 tasks.md（设计后未进入开发）`);
    } else if (open === 0 && done > 0) {
      issues.violations.push(`${entry}: tasks.md ${done} 项全部完成但未归档（需代码合入闭环 + 双归档到 archive/）`);
    } else if (status === 'completed') {
      issues.violations.push(`${entry}: .openspec.yaml 标记 completed 但仍留在 changes/ 根目录`);
    } else {
      inProgress.push(`${entry}: 进行中（已完成 ${done}，剩余 ${open}）`);
    }
  }

  return { targetDir, violations: issues.violations, warnings: issues.warnings, inProgress };
}

function printResult(result) {
  if (result.inProgress.length) {
    console.log('进行中的变更:');
    result.inProgress.forEach((line) => console.log(`  - ${line}`));
  }
  if (result.warnings.length) {
    console.log('提醒:');
    result.warnings.forEach((line) => console.log(`  ? ${line}`));
  }

  if (result.violations.length) {
    console.error(`悬挂变更（违反 OpenSpec 生命周期强制规则，目录: ${result.targetDir}）:`);
    result.violations.forEach((line) => console.error(`  ! ${line}`));
    console.error('处理: 完成开发并双归档（设计归档 + code-delivery.md），或注明阻塞原因。');
    return 1;
  }

  console.log(`OpenSpec 生命周期检查通过：无悬挂变更（${result.targetDir}）。`);
  return 0;
}

if (require.main === module) {
  const targetDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'openspec', 'changes');
  process.exitCode = printResult(runCheck(targetDir));
}

module.exports = {
  runCheck,
  validateNaming,
  readTasksStatus,
  constants: {
    CODE_DELIVERY_EFFECTIVE,
    NAMING_RULE_EFFECTIVE,
    CHANGE_DIR_PATTERN
  }
};
