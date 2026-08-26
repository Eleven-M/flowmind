const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const execa = require('execa');
const FlowMind = require('../core');
const { analyzeOffline, isSafeArchivePath, readTarJsonEntries } = require('../core/offline-analysis');
const { FlowMindMCPServer } = require('../mcp/server');
const offlineDesignAnalysis = require('../skills/offline-design-analysis');

describe('offline design analysis', () => {
  let tempRoot;
  let sourceDir;
  let repoDir;
  let previousHome;

  beforeEach(async () => {
    previousHome = process.env.FLOWMIND_HOME;
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'flowmind-offline-'));
    process.env.FLOWMIND_HOME = tempRoot;
    sourceDir = path.join(tempRoot, '.flowmind', 'source');
    repoDir = path.join(tempRoot, 'renewal-service');
    await fs.ensureDir(sourceDir);
    await fs.ensureDir(path.join(repoDir, 'src'));
    await seedAnalysisFixtures(sourceDir, repoDir);
  });

  afterEach(async () => {
    if (previousHome === undefined) delete process.env.FLOWMIND_HOME;
    else process.env.FLOWMIND_HOME = previousHome;
    await fs.remove(tempRoot);
  });

  test('summarizes indexed documents and code into a cited deterministic flow', async () => {
    const result = await analyzeOffline('离线分析合同续约历史资料和代码，生成设计流程', {
      sourceDir,
      repoDir,
      learningAssets: {
        feedback: [
          {
            id: 'feedback-1',
            skill: 'requirement-analyst',
            input: '合同续约必须先校验门店 password=must-not-leak',
            application: { action: 'validate store before renewal' }
          }
        ]
      }
    });

    expect(result.mode).toBe('offline-deterministic');
    expect(result.guarantees).toContain('No AI provider used');
    expect(result.citations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourcePath: 'contract-renewal.md', kind: 'document', chunk: expect.any(Object) }),
        expect.objectContaining({ sourcePath: 'src/renewal-service.js', kind: 'code', chunk: expect.any(Object) })
      ])
    );
    expect(result.scope.scanned.chunks).toBeGreaterThan(0);
    expect(result.citations.some((citation) => String(citation.path).includes('#'))).toBe(true);
    expect(result.designFlow.map((step) => step.description).join(' ')).toContain('校验合同状态');
    expect(result.architecture.symbols).toContain('RenewalService');
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
  });

  test('reuses the offline source cache for unchanged local files', async () => {
    const first = await analyzeOffline('离线分析合同续约历史资料和代码，生成设计流程', {
      sourceDir,
      repoDir
    });
    const second = await analyzeOffline('离线分析合同续约历史资料和代码，生成设计流程', {
      sourceDir,
      repoDir
    });

    expect(first.scope.scanned.cacheWrites).toBeGreaterThan(0);
    expect(second.scope.scanned.cacheHits).toBeGreaterThan(0);
    expect(second.scope.scanned.cacheWrites).toBe(0);
    expect(second.scope.scanned.chunks).toBeGreaterThan(0);
    expect(await fs.pathExists(path.join(tempRoot, '.flowmind', 'cache', 'offline-analysis-cache.json'))).toBe(true);
    expect(second.citations.map((citation) => citation.sourcePath)).toEqual(
      expect.arrayContaining(first.citations.map((citation) => citation.sourcePath))
    );
  });

  test('reads safe Lakebook JSON entries and ignores traversal entries', () => {
    const archive = Buffer.concat([
      createTarEntry('../escape.json', JSON.stringify({ title: 'unsafe', body: 'should not appear' })),
      createTarEntry('book/renewal.json', JSON.stringify({ title: '合同续约', doc: { body: '<p>1、校验合同</p>' } })),
      Buffer.alloc(1024)
    ]);

    const issues = [];
    const entries = readTarJsonEntries(archive, { maxArchiveEntries: 10, maxFileBytes: 1024 * 1024 }, issues);

    expect(isSafeArchivePath('../escape.json')).toBe(false);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual(expect.objectContaining({ name: 'book/renewal.json' }));
    expect(issues).toContain('unsafe archive path ../escape.json');
  });

  test('routes a natural-language request to the offline skill with no AI provider', async () => {
    const flowmind = new FlowMind({ ai: { providers: {}, defaultProvider: null } });
    const result = await flowmind.process('没有AI模型，分析合同续约历史资料并总结设计流程', {
      sourceDir,
      cwd: repoDir
    });

    expect(result.metadata.skill).toBe('offline-design-analysis');
    expect(result.metadata.skillRoute).toMatch(/rules/);
    expect(result.data.data.mode).toBe('offline-deterministic');
    expect(result.data.data.citations.length).toBeGreaterThan(0);
  });

  test('only auto-routes ordinary analysis to the offline skill when AI is unavailable', () => {
    const input = '分析下采购合同的额度使用流程';

    expect(offlineDesignAnalysis.canHandle(input, { aiAvailable: true })).toBe(false);
    expect(offlineDesignAnalysis.canHandle(input, { aiAvailable: false })).toBe(true);
    expect(offlineDesignAnalysis.canHandle(`离线${input}`, { aiAvailable: true })).toBe(true);
  });

  test('treats an analysis flow request as analysis instead of auto-flow', async () => {
    const flowmind = new FlowMind({ ai: { providers: {}, defaultProvider: null } });
    const result = await flowmind.process('分析下当前合同校验额度的流程', {
      sourceDir,
      cwd: repoDir
    });

    expect(result.metadata.skill).toBe('offline-design-analysis');
    expect(result.metadata.skillRoute).toMatch(/rules/);
  });

  test('learns a persistent route after the user explicitly specifies a skill', async () => {
    const flowmind = new FlowMind({ ai: { providers: {}, defaultProvider: null } });
    await flowmind.process('帮我分析一下合同校验额度流程', {
      skill: 'offline-design-analysis',
      sourceDir,
      cwd: repoDir
    });

    const result = await flowmind.process('分析合同校验额度流程', {
      sourceDir,
      cwd: repoDir
    });

    expect(result.metadata.skill).toBe('offline-design-analysis');
    expect(result.metadata.skillRoute).toBe('learned');
    expect(flowmind.learning.skillBindings.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'offline-design-analysis', source: 'explicit-option' })
    ]));
  });

  test('passively promotes repeated successful skill routes', async () => {
    const flowmind = new FlowMind({ ai: { providers: {}, defaultProvider: null } });

    const first = await flowmind.process('分析合同续约设计流程', {
      sourceDir,
      cwd: repoDir
    });
    const second = await flowmind.process('帮我分析一下合同续约设计流程', {
      sourceDir,
      cwd: repoDir
    });
    const third = await flowmind.process('梳理合同续约设计流程', {
      sourceDir,
      cwd: repoDir
    });

    expect(first.metadata.skill).toBe('offline-design-analysis');
    expect(second.metadata.skill).toBe('offline-design-analysis');
    expect(third.metadata.skill).toBe('offline-design-analysis');
    expect(third.metadata.skillRoute).toBe('learned');
    expect(flowmind.learning.skillBindings.routes).toEqual(expect.arrayContaining([
      expect.objectContaining({ skill: 'offline-design-analysis', source: 'passive-success' })
    ]));
  });

  test('learns the previous request from a conversational skill correction', async () => {
    const flowmind = new FlowMind({ ai: { providers: {}, defaultProvider: null } });
    await flowmind.init();
    flowmind.conversationHistory.push({
      input: '分析下当前合同校验额度的流程',
      skill: 'auto-flow',
      output: { type: 'error' },
      timestamp: new Date().toISOString()
    });

    const learned = await flowmind.process('这个应该改用 offline-design-analysis');

    expect(learned.type).toBe('learning');
    expect(learned.record).toEqual(expect.objectContaining({
      input: '分析下当前合同校验额度的流程',
      skill: 'offline-design-analysis'
    }));
    const selected = await flowmind.selectSkill('分析下当前合同校验额度的流程');
    expect(selected.name).toBe('offline-design-analysis');
    expect(flowmind.lastSkillRoute).toBe('learned');
  });

  test('exposes JSON CLI and MCP entry points', async () => {
    const cli = await execa(
      'node',
      [
        path.join(__dirname, '..', 'bin', 'flowmind.js'),
        'analyze',
        '分析合同续约设计流程',
        '--offline',
        '--source-dir', sourceDir,
        '--repo-dir', repoDir,
        '--json'
      ],
      { env: { ...process.env, FLOWMIND_HOME: tempRoot } }
    );
    const cliResult = JSON.parse(cli.stdout);
    expect(cliResult.mode).toBe('offline-deterministic');

    const server = new FlowMindMCPServer();
    await server.init();
    expect(server.getTools()).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'flowmind_offline_analyze' })]));
    const response = await server.callTool('flowmind_offline_analyze', {
      input: '分析合同续约设计流程',
      sourceDir,
      repoDir
    });
    expect(response.isError).not.toBe(true);
    expect(JSON.parse(response.content[0].text)).toEqual(expect.objectContaining({ mode: 'offline-deterministic' }));
  });
});

async function seedAnalysisFixtures(sourceDir, repoDir) {
  await fs.writeFile(
    path.join(sourceDir, 'RESOURCE_INDEX.md'),
    [
      '### 合同续约设计',
      '- path: contract-renewal.md',
      '- aliases: 合同续约, 续约流程',
      '- domains: 合同',
      '- modules: renewal-service',
      '- tags: 校验, 查询, 更新',
      '- note: 合同续约主流程'
    ].join('\n')
  );
  await fs.writeFile(
    path.join(sourceDir, 'contract-renewal.md'),
    [
      '# 合同续约设计',
      '1、接收合同续约请求',
      '2、校验合同状态和门店归属',
      '3、查询续约方案',
      '4、更新合同有效期',
      '5、返回续约结果'
    ].join('\n')
  );
  await fs.writeFile(
    path.join(sourceDir, 'contract-rules.lake'),
    '<!doctype lake><h2>续约规则</h2><p>若合同已终止，则拒绝续约。</p><p>接口 /contracts/renew</p>'
  );
  await fs.writeFile(
    path.join(repoDir, 'src', 'renewal-service.js'),
    [
      'class RenewalService {',
      '  async renew(contractId) {',
      "    const endpoint = '/contracts/renew';",
      "    const sql = 'SELECT id FROM contract WHERE id = ?';",
      '    return { contractId, endpoint, sql };',
      '  }',
      '}',
      'module.exports = RenewalService;'
    ].join('\n')
  );
}

function createTarEntry(name, content) {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 8, 'ascii');
  header.write('0000000\0', 108, 8, 'ascii');
  header.write('0000000\0', 116, 8, 'ascii');
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  header.write('00000000000\0', 136, 12, 'ascii');
  header.fill(0x20, 148, 156);
  header.write('0', 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  const checksum = [...header].reduce((total, value) => total + value, 0);
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return Buffer.concat([header, body, Buffer.alloc(Math.ceil(body.length / 512) * 512 - body.length)]);
}
