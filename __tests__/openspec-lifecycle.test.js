const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const { runCheck } = require('../scripts/check-openspec-lifecycle');

describe('OpenSpec lifecycle check', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `flowmind-openspec-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempDir);
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  test('accepts in-progress changes with lower-case OpenSpec files and date-number folders', async () => {
    const changeDir = path.join(tempDir, '2026-08-26-3418-store-restriction');
    await fs.ensureDir(changeDir);
    await fs.writeFile(path.join(changeDir, '.openspec.yaml'), 'status: in-progress\ncreated: 2026-08-26\n');
    await fs.writeFile(path.join(changeDir, 'proposal.md'), '# Proposal\n');
    await fs.writeFile(path.join(changeDir, 'design.md'), '# Design\n');
    await fs.writeFile(path.join(changeDir, 'specs.md'), '# Specs\n');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] implement service\n');

    const result = runCheck(tempDir);

    expect(result.violations).toEqual([]);
    expect(result.inProgress).toEqual(['2026-08-26-3418-store-restriction: 进行中（已完成 0，剩余 1）']);
  });

  test('rejects new OpenSpec directories without date and requirement number', async () => {
    const changeDir = path.join(tempDir, 'store-restriction');
    await fs.ensureDir(changeDir);
    await fs.writeFile(path.join(changeDir, '.openspec.yaml'), 'status: in-progress\ncreated: 2026-08-26\n');
    await fs.writeFile(path.join(changeDir, 'tasks.md'), '- [ ] implement service\n');

    const result = runCheck(tempDir);

    expect(result.violations).toEqual([
      expect.stringContaining('目录名必须为 YYYY-MM-DD-需求编号-小写短横线名称')
    ]);
  });

  test('rejects uppercase OpenSpec filenames for new changes', async () => {
    const changeDir = path.join(tempDir, '2026-08-26-3418-store-restriction');
    await fs.ensureDir(changeDir);
    await fs.writeFile(path.join(changeDir, '.openspec.yaml'), 'status: in-progress\ncreated: 2026-08-26\n');
    await fs.writeFile(path.join(changeDir, 'TASKS.md'), '- [ ] implement service\n');
    await fs.writeFile(path.join(changeDir, 'DESIGN.md'), '# Design\n');

    const result = runCheck(tempDir);

    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('TASKS.md'),
        expect.stringContaining('DESIGN.md')
      ])
    );
  });

  test('requires lower-case code-delivery.md for archived changes after the naming rule date', async () => {
    const archiveDir = path.join(tempDir, 'archive', '2026-08-26-3418-store-restriction');
    await fs.ensureDir(archiveDir);
    await fs.writeFile(path.join(archiveDir, '.openspec.yaml'), 'status: completed\narchivedAt: 2026-08-26\n');
    await fs.writeFile(path.join(archiveDir, 'CODE-DELIVERY.md'), '# Delivery\n');

    const result = runCheck(tempDir);

    expect(result.violations).toEqual([expect.stringContaining('CODE-DELIVERY.md')]);
  });
});
