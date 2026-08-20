const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const {
  createSkill,
  generateSkillMd,
  generateSkillIndex,
  validateSkillName,
  VALID_CATEGORIES
} = require('../core/skill-scaffold');

const PROJECT_ROOT = path.join(__dirname, '..');

/**
 * Create a fake project root with a symlinked core/ so that generated
 * skills/ under it can resolve ../../core/* correctly.
 */
async function makeFakeProjectRoot() {
  const tmpRoot = path.join(os.tmpdir(), `scaffold-fake-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.ensureDir(path.join(tmpRoot, 'skills'));
  await fs.ensureSymlink(path.join(PROJECT_ROOT, 'core'), path.join(tmpRoot, 'core'));
  return tmpRoot;
}

describe('skill-scaffold', () => {
  describe('validateSkillName', () => {
    test('accepts lowercase kebab-case', () => {
      expect(validateSkillName('my-skill').valid).toBe(true);
      expect(validateSkillName('code-review').valid).toBe(true);
      expect(validateSkillName('a').valid).toBe(true);
      expect(validateSkillName('skill123').valid).toBe(true);
    });

    test('rejects empty', () => {
      expect(validateSkillName('').valid).toBe(false);
      expect(validateSkillName('   ').valid).toBe(false);
    });

    test('rejects uppercase', () => {
      expect(validateSkillName('MySkill').valid).toBe(false);
    });

    test('rejects leading hyphen or digit', () => {
      expect(validateSkillName('-skill').valid).toBe(false);
      expect(validateSkillName('2skill').valid).toBe(false);
    });

    test('rejects special characters', () => {
      expect(validateSkillName('my_skill').valid).toBe(false);
      expect(validateSkillName('my.skill').valid).toBe(false);
    });
  });

  describe('generateSkillMd', () => {
    test('produces valid YAML frontmatter with name and category', () => {
      const md = generateSkillMd({
        name: 'my-test-skill',
        description: 'A test skill.',
        category: 'reporting',
        triggerPatterns: ['test', '测试'],
        components: ['report', 'logService']
      });

      expect(md).toContain('name: my-test-skill');
      expect(md).toContain('category: reporting');
      expect(md).toContain('"A test skill."');
      expect(md).toContain('# My Test Skill Skill');
      expect(md).toContain('componentDependencies:');
      expect(md).toContain('  - report');
      expect(md).toContain('  - logService');
      expect(md).toContain('## Trigger Patterns');
      expect(md).toContain('"test"');
      expect(md).toContain('"测试"');
    });

    test('falls back to default category for invalid category', () => {
      const md = generateSkillMd({ name: 'x', category: 'invalid-cat' });
      expect(md).toContain('category: general');
    });

    test('works without trigger patterns or components', () => {
      const md = generateSkillMd({ name: 'simple-skill' });
      expect(md).toContain('name: simple-skill');
      expect(md).not.toContain('Trigger Patterns');
      expect(md).not.toContain('componentDependencies');
    });
  });

  describe('generateSkillIndex', () => {
    test('generates syntactically valid JavaScript', () => {
      const code = generateSkillIndex({
        name: 'my-test-skill',
        triggerPatterns: ['test'],
        components: ['databaseQuery']
      });

      // Should not throw when parsed
      expect(() => new Function(code)).not.toThrow();
    });

    test('includes trigger regex when patterns provided', () => {
      const code = generateSkillIndex({
        name: 'trigger-skill',
        triggerPatterns: ['code review', '代码审查']
      });
      expect(code).toContain('code review|代码审查');
    });

    test('includes component adapter resolution when components provided', () => {
      const code = generateSkillIndex({
        name: 'comp-skill',
        components: ['report', 'logService']
      });
      expect(code).toContain("getAdapter('report')");
      expect(code).toContain("getAdapter('logService')");
      expect(code).toContain('missing-component');
    });

    test('includes wrapSkillCall wrapper', () => {
      const code = generateSkillIndex({ name: 'wrap-skill' });
      expect(code).toContain('wrapSkillCall');
      expect(code).toContain("require('../../core/skill-error-wrapper')");
    });
  });

  describe('createSkill + require integration', () => {
    let fakeRoot;

    beforeEach(async () => {
      fakeRoot = await makeFakeProjectRoot();
    });

    afterEach(async () => {
      await fs.remove(fakeRoot);
    });

    test('generated index.js can be required and canHandle works', async () => {
      const skillDir = await createSkill(
        'trigger-test-skill',
        {
          description: 'Trigger test.',
          category: 'general',
          triggerPatterns: ['test', '测试']
        },
        path.join(fakeRoot, 'skills')
      );

      const skill = require(path.join(skillDir, 'index.js'));
      expect(typeof skill.canHandle).toBe('function');
      expect(typeof skill.execute).toBe('function');
      expect(skill.canHandle('this is a test')).toBe(true);
      expect(skill.canHandle('completely unrelated')).toBe(false);

      delete require.cache[path.join(skillDir, 'index.js')];
    });

    test('execute with missing component returns createSkillError', async () => {
      const skillDir = await createSkill(
        'comp-test-skill',
        {
          description: 'Comp test.',
          components: ['report']
        },
        path.join(fakeRoot, 'skills')
      );

      const skill = require(path.join(skillDir, 'index.js'));
      const result = await skill.execute('comp test', {
        componentRegistry: { getAdapter: () => null }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);
      expect(result.data.kind).toBe('missing-component');

      delete require.cache[path.join(skillDir, 'index.js')];
    });

    test('execute without components returns createSkillResult', async () => {
      const skillDir = await createSkill(
        'plain-test-skill',
        { description: 'Plain.' },
        path.join(fakeRoot, 'skills')
      );

      const skill = require(path.join(skillDir, 'index.js'));
      const result = await skill.execute('plain', {
        componentRegistry: { getAdapter: () => null }
      });
      expect(result.type).toBe('result');
      expect(result.success).toBe(true);

      delete require.cache[path.join(skillDir, 'index.js')];
    });

    test('execute wraps thrown errors via wrapSkillCall', async () => {
      const skillDir = await createSkill(
        'throw-test-skill',
        { description: 'Throw.', components: ['report'] },
        path.join(fakeRoot, 'skills')
      );

      const skill = require(path.join(skillDir, 'index.js'));
      const result = await skill.execute('throw test', {
        componentRegistry: {
          getAdapter: () => { throw new TypeError('network failure'); }
        }
      });
      expect(result.type).toBe('error');
      expect(result.success).toBe(false);

      delete require.cache[path.join(skillDir, 'index.js')];
    });

    test('creates SKILL.md and index.js on disk', async () => {
      const skillDir = await createSkill(
        'disk-test-skill',
        {
          description: 'Disk test.',
          category: 'general',
          triggerPatterns: ['disk'],
          components: ['report']
        },
        path.join(fakeRoot, 'skills')
      );

      expect(await fs.pathExists(path.join(skillDir, 'SKILL.md'))).toBe(true);
      expect(await fs.pathExists(path.join(skillDir, 'index.js'))).toBe(true);
    });
  });

  describe('createSkill validation', () => {
    test('throws on invalid skill name', async () => {
      await expect(createSkill('InvalidName', {}, os.tmpdir())).rejects.toThrow(/kebab-case/);
    });

    test('throws when skill already exists', async () => {
      const tmpRoot = await makeFakeProjectRoot();
      try {
        await createSkill('dup-skill', { description: 'first' }, path.join(tmpRoot, 'skills'));
        await expect(createSkill('dup-skill', { description: 'second' }, path.join(tmpRoot, 'skills'))).rejects.toThrow(/already exists/);
      } finally {
        await fs.remove(tmpRoot);
      }
    });
  });

  test('VALID_CATEGORIES includes expected entries', () => {
    expect(VALID_CATEGORIES).toContain('general');
    expect(VALID_CATEGORIES).toContain('reporting');
    expect(VALID_CATEGORIES).toContain('knowledge');
  });
});
