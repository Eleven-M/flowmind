const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const ConfigManager = require('../core/config-manager');
const SkillLoader = require('../core/skill-loader');
const scaffold = require('../core/skill-scaffold');
const {
  runReleaseCheck,
  scanPackedFilesForLocalData,
  scanContentForCompanyMarkers,
  scanShippedSourceForCompanyMarkers
} = require('../core/release-check');

const REPO_ROOT = path.join(__dirname, '..');

describe('local data isolation (git/npm)', () => {
  let tempHome;

  beforeEach(async () => {
    tempHome = path.join(os.tmpdir(), `flowmind-isolation-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.ensureDir(tempHome);
    process.env.FLOWMIND_HOME = tempHome;
  });

  afterEach(async () => {
    delete process.env.FLOWMIND_HOME;
    await fs.remove(tempHome);
  });

  test('skill scaffold writes local skills to FLOWMIND_HOME, never the repo skills dir', async () => {
    expect(scaffold.getLocalSkillsDir()).toBe(path.join(tempHome, '.flowmind', 'skills'));

    const skillDir = await scaffold.createSkill('my-business-skill', {
      description: '内部业务技能',
      category: 'general',
      triggerPatterns: ['内部'],
      components: []
    });

    expect(skillDir).toBe(path.join(tempHome, '.flowmind', 'skills', 'my-business-skill'));
    expect(await fs.pathExists(path.join(skillDir, 'SKILL.md'))).toBe(true);
    // Nothing leaked into the repository skills/ directory.
    expect(await fs.pathExists(path.join(REPO_ROOT, 'skills', 'my-business-skill'))).toBe(false);
  });

  test('skill scaffold can still target an explicit directory (builtin contribution flow)', async () => {
    const target = path.join(tempHome, 'repo-mock-skills');
    const skillDir = await scaffold.createSkill('builtin-skill', { category: 'general' }, target);
    expect(skillDir).toBe(path.join(target, 'builtin-skill'));

    await fs.remove(target);
  });

  test('skill loader merges builtin and local skills, local overrides same name', async () => {
    const builtinDir = path.join(tempHome, 'builtin-skills');
    const localDir = path.join(tempHome, '.flowmind', 'skills');
    await fs.ensureDir(path.join(builtinDir, 'skill-a'));
    await fs.ensureDir(path.join(builtinDir, 'shared-skill'));
    await fs.ensureDir(localDir);
    await fs.ensureDir(path.join(localDir, 'shared-skill'));
    await fs.ensureDir(path.join(localDir, 'local-only-skill'));

    await fs.writeFile(
      path.join(builtinDir, 'skill-a', 'SKILL.md'),
      '---\nname: skill-a\ndescription: builtin a\n---\n## Trigger Patterns\n- "builtin a"\n'
    );
    await fs.writeFile(
      path.join(builtinDir, 'shared-skill', 'SKILL.md'),
      '---\nname: shared-skill\ndescription: builtin version\n---\n'
    );
    await fs.writeFile(
      path.join(localDir, 'shared-skill', 'SKILL.md'),
      '---\nname: shared-skill\ndescription: LOCAL OVERRIDE\n---\n'
    );
    await fs.writeFile(
      path.join(localDir, 'local-only-skill', 'SKILL.md'),
      '---\nname: local-only-skill\ndescription: local only\n---\n'
    );

    const config = new ConfigManager();
    await config.load();
    const loader = new SkillLoader(config, null);
    loader.skillPath = builtinDir;
    await loader.loadAll();

    const names = Array.from(loader.skills.keys()).sort();
    expect(names).toEqual(['local-only-skill', 'shared-skill', 'skill-a']);
    expect(loader.skills.get('shared-skill').definition.description).toBe('LOCAL OVERRIDE');
    expect(loader.skills.get('shared-skill').path).toBe(path.join(localDir, 'shared-skill'));
    expect(loader.skills.get('skill-a').path).toBe(path.join(builtinDir, 'skill-a'));
  });

  test('local skill loading can be disabled via skills.localPath=false', async () => {
    const builtinDir = path.join(tempHome, 'builtin-skills');
    const localDir = path.join(tempHome, '.flowmind', 'skills');
    await fs.ensureDir(path.join(builtinDir, 'skill-a'));
    await fs.ensureDir(path.join(localDir, 'local-only-skill'));
    await fs.writeFile(path.join(builtinDir, 'skill-a', 'SKILL.md'), '---\nname: skill-a\n---\n');
    await fs.writeFile(path.join(localDir, 'local-only-skill', 'SKILL.md'), '---\nname: local-only-skill\n---\n');

    const loader = new SkillLoader(
      {
        get: (key, fallbackValue) => (key === 'skills.localPath' ? false : fallbackValue)
      },
      null
    );
    loader.skillPath = builtinDir;
    await loader.loadAll();

    expect(Array.from(loader.skills.keys())).toEqual(['skill-a']);
  });

  test('npm pack list scan flags every category of local business data', () => {
    const findings = scanPackedFilesForLocalData([
      'core/index.js',
      'skills/log-audit/index.js',
      'bin/flowmind.js',
      'docs/usage.md',
      'config/default.json',
      'learning/records/log-audit/learn-1.json',
      'learning/entities.json',
      'entities.json',
      '.flowmind/learning/skill-bindings.json',
      '.flowmind-demo/notes.md',
      'source/RESOURCE_INDEX.md',
      'sdd-records/2026-07-02-analysis.md',
      'models/mistral/model.gguf',
      'model-cache/openai/snapshot.json',
      'weights/service-ranker.safetensors',
      '.cache/huggingface/hub/index.json',
      'skills/my-inner-skill/.local.json',
      'flowmind-learnings.json',
      'flowmind-learning-bundle-2026.json',
      '.env.production',
      '.npmrc',
      'config/project-git-map.json',
      'mcp/server.js'
    ]);

    const flagged = new Map(findings.map((item) => [item.file, item.issue]));
    expect(flagged.get('learning/records/log-audit/learn-1.json')).toBe('learning data');
    expect(flagged.get('entities.json')).toBe('learning store file');
    expect(flagged.get('.flowmind/learning/skill-bindings.json')).toBe('flowmind home directory');
    expect(flagged.get('source/RESOURCE_INDEX.md')).toBe('synced source material');
    expect(flagged.get('sdd-records/2026-07-02-analysis.md')).toBe('sdd-agent records');
    expect(flagged.get('models/mistral/model.gguf')).toBe('AI model artifact directory');
    expect(flagged.get('model-cache/openai/snapshot.json')).toBe('AI model artifact directory');
    expect(flagged.get('weights/service-ranker.safetensors')).toBe('AI model artifact directory');
    expect(flagged.get('.cache/huggingface/hub/index.json')).toBe('AI model artifact directory');
    expect(flagged.get('config/project-git-map.json')).toBe('internal resource index');
    expect(flagged.get('skills/my-inner-skill/.local.json')).toBe('local skill marker');
    expect(flagged.get('.env.production')).toBe('env file');
    expect(flagged.get('.npmrc')).toBe('npm config with credentials');
    expect(flagged.get('flowmind-learnings.json')).toBe('flowmind export bundle');
    // Clean distribution files stay unflagged.
    for (const clean of ['core/index.js', 'skills/log-audit/index.js', 'bin/flowmind.js', 'docs/usage.md', 'mcp/server.js']) {
      expect(flagged.has(clean)).toBe(false);
    }
  });

  test('runReleaseCheck exposes the local-data-scan gate', async () => {
    const result = await runReleaseCheck({ skipExternalPackageChecks: true });
    const scan = result.checks.find((check) => check.key === 'local-data-scan');
    expect(scan).toBeDefined();
    expect(scan.status).toBe('ok');
  });

  test('company markers in skill content are flagged, allowlisted aliases are not', () => {
    expect(scanContentForCompanyMarkers('查询 aomi-takeout 服务', 'skills/demo/index.js')).toEqual([
      expect.objectContaining({ file: 'skills/demo/index.js', issue: 'company name' })
    ]);
    expect(scanContentForCompanyMarkers('字段 amountOfSendInfo 为空', 'skills/demo/SKILL.md')).toEqual([
      expect.objectContaining({ issue: 'company business field' })
    ]);
    expect(scanContentForCompanyMarkers('webhook?access_token=abcdef0123456789abcd', 'skills/demo/SKILL.md')).toEqual([
      expect.objectContaining({ issue: 'hardcoded webhook token' })
    ]);
    // Legacy provider aliases are compatibility name mappings, allowed.
    expect(scanContentForCompanyMarkers('provider friday-flow / mcp friday-auto-flow', 'core/compat.js')).toEqual([]);
    // Generic skill content stays clean.
    expect(scanContentForCompanyMarkers('const price = sku.price;', 'skills/demo/index.js')).toEqual([]);
  });

  test('the shipped repository currently passes the generic-skill-scan gate', async () => {
    const findings = await scanShippedSourceForCompanyMarkers(REPO_ROOT);
    expect(findings).toEqual([]);
  });

  test('scanShippedSourceForCompanyMarkers detects company content in a temp tree', async () => {
    const root = path.join(tempHome, 'shipped-root');
    await fs.ensureDir(path.join(root, 'skills', 'demo-skill'));
    await fs.writeFile(path.join(root, 'skills', 'demo-skill', 'SKILL.md'), '# generic skill\n');
    await fs.ensureDir(path.join(root, 'core'));
    await fs.writeFile(path.join(root, 'core', 'compat.js'), 'module.exports = { friday-flow: 1 };\n');
    await fs.writeFile(path.join(root, 'skills', 'leak.md'), '字段 takeout_store_search 命中\n');

    const findings = await scanShippedSourceForCompanyMarkers(root);
    expect(findings).toEqual([
      expect.objectContaining({ file: path.join('skills', 'leak.md'), issue: 'internal API route' })
    ]);
  });
});
