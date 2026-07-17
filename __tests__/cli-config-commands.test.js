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
    expect(config.skillConfig.skills['log-audit']).toEqual(expect.objectContaining({
      excludeInfrastructure: false
    }));

    await fs.remove(tempHome);
  });

  test('resource file operations resolve against FLOWMIND_HOME', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-resource-${Date.now()}`);
    const configDir = path.join(tempHome, '.flowmind');
    await fs.ensureDir(configDir);
    await fs.writeFile(path.join(configDir, 'demo.txt'), 'resource-from-flowmind-home', 'utf8');

    const { stdout } = await runCli(['resource', '--show', 'demo.txt', '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result).toEqual(expect.objectContaining({
      file: 'demo.txt',
      content: 'resource-from-flowmind-home'
    }));

    await fs.remove(tempHome);
  });
});
