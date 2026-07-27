const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const cliPath = path.join(__dirname, '..', 'bin', 'flowmind.js');

describe('flowmind CLI config commands', () => {
  async function runCli(args, flowmindHome) {
    return execFileAsync('node', [cliPath, ...args], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        FLOWMIND_HOME: flowmindHome
      }
    });
  }

  test('config --set writes the provided value to the requested config key', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-config-${Date.now()}`);
    await fs.ensureDir(tempHome);

    await runCli(['config', '--set', 'output.language', 'zh-CN'], tempHome);

    const config = await fs.readJson(path.join(tempHome, '.flowmind', 'config.json'));
    expect(config.output.language).toBe('zh-CN');

    await fs.remove(tempHome);
  });

  test('skill --set writes skill settings into skillConfig.skills', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-skill-${Date.now()}`);
    await fs.ensureDir(tempHome);

    await runCli(['skill', 'log-audit', '--set', 'excludeInfrastructure', 'false'], tempHome);

    const config = await fs.readJson(path.join(tempHome, '.flowmind', 'config.json'));
    expect(config.skillConfig.skills['log-audit']).toEqual(
      expect.objectContaining({
        excludeInfrastructure: false
      })
    );

    await fs.remove(tempHome);
  });

  test('resource file operations resolve against FLOWMIND_HOME', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-resource-${Date.now()}`);
    const configDir = path.join(tempHome, '.flowmind');
    await fs.ensureDir(configDir);
    await fs.writeFile(path.join(configDir, 'demo.txt'), 'resource-from-flowmind-home', 'utf8');

    const { stdout } = await runCli(['resource', '--show', 'demo.txt', '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result).toEqual(
      expect.objectContaining({
        file: 'demo.txt',
        content: 'resource-from-flowmind-home'
      })
    );

    await fs.remove(tempHome);
  });

  test('learn --assets exposes learning feedback and material packages as JSON', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-assets-${Date.now()}`);
    const sourceDir = path.join(tempHome, '.flowmind', 'source');
    await fs.ensureDir(sourceDir);
    await fs.writeFile(path.join(sourceDir, 'RESOURCE_INDEX.md'), '# Resources', 'utf8');

    const { stdout } = await runCli(['learn', '--assets', '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result.summary).toEqual(expect.objectContaining({ sourceFiles: 1 }));
    expect(result.packages.sourceFiles).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'RESOURCE_INDEX.md' })])
    );

    await fs.remove(tempHome);
  });

  test('ai --models returns fallback model choices as JSON when live discovery is unavailable', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-ai-models-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const { stdout } = await runCli(['ai', '--models', 'openai', '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'openai',
        source: 'fallback',
        warning: expect.any(String)
      })
    );
    expect(result.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'gpt-4.1-mini' }),
        expect.objectContaining({ id: 'gpt-4.1' })
      ])
    );

    await fs.remove(tempHome);
  });

  test('demo log-audit returns a self-contained JSON result', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-demo-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const { stdout } = await runCli(['demo', 'log-audit', '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        scenario: 'log-audit',
        result: expect.objectContaining({
          skill: 'log-audit',
          traceId: 'demo-trace-001'
        })
      })
    );
    expect(result.result.timeline.length).toBeGreaterThan(0);

    await fs.remove(tempHome);
  });

  test('demo exposes code-review and workflow scenarios', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-demo-scenarios-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const codeReview = JSON.parse((await runCli(['demo', 'code-review', '--json'], tempHome)).stdout);
    const workflow = JSON.parse((await runCli(['demo', 'workflow', '--json'], tempHome)).stdout);

    expect(codeReview).toEqual(
      expect.objectContaining({
        ok: true,
        scenario: 'code-review',
        result: expect.objectContaining({
          skill: 'code-review',
          findings: expect.any(Array)
        })
      })
    );
    expect(workflow).toEqual(
      expect.objectContaining({
        ok: true,
        scenario: 'workflow',
        result: expect.objectContaining({
          mode: 'dry-run',
          approvalRequired: true,
          steps: expect.any(Array)
        })
      })
    );

    await fs.remove(tempHome);
  });
});
