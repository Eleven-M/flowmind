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

const targetDir = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'openspec', 'changes');

// 代码归档规则生效日：此后归档的变更必须有 CODE-DELIVERY.md
const CODE_DELIVERY_EFFECTIVE = '2026-08-20';

function readTasksStatus(dir) {
  const tasksPath = path.join(dir, 'TASKS.md');
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

if (!fs.existsSync(targetDir)) {
  console.error(`changes 目录不存在: ${targetDir}`);
  process.exit(1);
}

const violations = [];
const warnings = [];
const inProgress = [];

for (const entry of fs.readdirSync(targetDir)) {
  const dir = path.join(targetDir, entry);
  if (!fs.statSync(dir).isDirectory()) {
    continue;
  }

  if (entry === 'archive') {
    // 归档区：检查代码归档记录（规则生效后的归档必须有 CODE-DELIVERY.md）
    for (const archived of fs.readdirSync(dir)) {
      const aDir = path.join(dir, archived);
      if (!fs.statSync(aDir).isDirectory()) {
        continue;
      }
      const yaml = readYaml(aDir);
      const archivedAt = (yaml.archivedAt || '').slice(0, 10);
      const hasDelivery = fs.existsSync(path.join(aDir, 'CODE-DELIVERY.md'));
      if (!hasDelivery) {
        if (archivedAt && archivedAt >= CODE_DELIVERY_EFFECTIVE) {
          violations.push(`archive/${archived}: 归档于 ${archivedAt}，缺少代码归档 CODE-DELIVERY.md`);
        } else {
          warnings.push(`archive/${archived}: 早于 ${CODE_DELIVERY_EFFECTIVE} 归档，无 CODE-DELIVERY.md（存量，建议补记）`);
        }
      } else if (yaml.status === 'delivered-pending-merge') {
        warnings.push(`archive/${archived}: 代码待合入（delivered-pending-merge），合入后需补记并改 completed`);
      }
    }
    continue;
  }

  const { hasTasks, done, open } = readTasksStatus(dir);
  const status = readYaml(dir).status;

  if (!hasTasks) {
    violations.push(`${entry}: 只有设计没有 TASKS（设计后未进入开发）`);
  } else if (open === 0 && done > 0) {
    violations.push(`${entry}: TASKS ${done} 项全部完成但未归档（需代码合入闭环 + 双归档到 archive/）`);
  } else if (status === 'completed') {
    violations.push(`${entry}: .openspec.yaml 标记 completed 但仍留在 changes/ 根目录`);
  } else {
    inProgress.push(`${entry}: 进行中（已完成 ${done}，剩余 ${open}）`);
  }
}

if (inProgress.length) {
  console.log('进行中的变更:');
  inProgress.forEach((line) => console.log(`  - ${line}`));
}
if (warnings.length) {
  console.log('提醒:');
  warnings.forEach((line) => console.log(`  ? ${line}`));
}

if (violations.length) {
  console.error(`悬挂变更（违反 OpenSpec 生命周期强制规则，目录: ${targetDir}）:`);
  violations.forEach((line) => console.error(`  ! ${line}`));
  console.error('处理: 完成开发并双归档（设计归档 + CODE-DELIVERY.md），或注明阻塞原因。');
  process.exit(1);
}

console.log(`OpenSpec 生命周期检查通过：无悬挂变更（${targetDir}）。`);
