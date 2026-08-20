const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const cliPath = path.join(__dirname, '..', 'bin', 'flowmind.js');
const { saveServiceManagementApiBinding } = require('../core/browser-extension-setup');
const {
  buildServicePlist,
  getBrowserBridgeServiceStatus,
  SERVICE_LABEL
} = require('../core/browser-bridge-service');

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

  test('config --import loads a markdown config package into local FlowMind config files', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-config-package-${Date.now()}`);
    const packagePath = path.join(tempHome, 'flowmind-config.md');
    await fs.ensureDir(tempHome);
    await fs.writeFile(
      packagePath,
      [
        '# FlowMind config package',
        '```bash',
        'flowmind config --import flowmind-config.md',
        '```',
        '```json',
        JSON.stringify({
          ai: {
            provider: 'ollama',
            model: 'llama3.1',
            baseUrl: 'http://127.0.0.1:11434'
          },
          resources: {
            yapi: {
              mcpServer: 'yapi-mcp',
              defaultProjectId: '42',
              defaultCategoryId: '7'
            },
            report: {
              mcpServer: 'auto-report'
            }
          },
          skills: {
            'report-insights': {},
            'yapi-sync-interface': {
              defaultProjectId: '42'
            }
          }
        }),
        '```'
      ].join('\n'),
      'utf8'
    );

    const { stdout } = await runCli(['config', '--import', packagePath, '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result.selectedResources).toEqual(expect.arrayContaining(['yapi', 'report']));
    expect(result.selectedMcpSkills).toEqual(expect.arrayContaining(['report-insights', 'yapi-sync-interface']));

    const configDir = path.join(tempHome, '.flowmind');
    const aiConfig = await fs.readJson(path.join(configDir, 'ai-config.json'));
    const resourceConfig = await fs.readJson(path.join(configDir, 'resource-config.json'));
    const componentConfig = await fs.readJson(path.join(configDir, 'component-config.json'));
    const skillConfig = await fs.readJson(path.join(configDir, 'skill-config.json'));

    expect(aiConfig.ai.defaultProvider).toBe('ollama');
    expect(resourceConfig.resources.yapi.config.defaultProjectId).toBe('42');
    expect(componentConfig.components.apiDoc.providers.yapi.config.defaultCategoryId).toBe('7');
    expect(componentConfig.components.report.providers['auto-report'].mcpServer).toBe('auto-report');
    expect(skillConfig.skills['report-insights'].enabled).toBe(true);
    expect(skillConfig.skills['yapi-sync-interface'].defaultProjectId).toBe('42');

    await fs.remove(tempHome);
  });

  test('install can import a FlowMind config package into the installed FLOWMIND_HOME', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-install-config-${Date.now()}`);
    const clientConfig = path.join(tempHome, 'workbuddy-mcp.json');
    const flowmindHome = path.join(tempHome, 'flowmind-home');
    const packagePath = path.join(tempHome, 'flowmind-config.md');
    await fs.ensureDir(tempHome);
    await fs.writeFile(
      packagePath,
      [
        '# FlowMind config package',
        '```json',
        JSON.stringify({
          resources: {
            yapi: {
              mcpServer: 'yapi-mcp',
              defaultProjectId: '42'
            }
          },
          skills: {
            'yapi-sync-interface': {
              defaultProjectId: '42'
            }
          }
        }),
        '```'
      ].join('\n'),
      'utf8'
    );

    const { stdout } = await runCli(
      [
        'install',
        'workbuddy',
        '--config',
        clientConfig,
        '--flowmind-home',
        flowmindHome,
        '--flowmind-config',
        packagePath,
        '--json'
      ],
      tempHome
    );
    const result = JSON.parse(stdout);

    expect(result.flowmindConfig.configDir).toBe(path.join(flowmindHome, '.flowmind'));
    expect(result.flowmindConfig.selectedResources).toEqual(expect.arrayContaining(['yapi']));

    const installedClientConfig = await fs.readJson(clientConfig);
    const resourceConfig = await fs.readJson(path.join(flowmindHome, '.flowmind', 'resource-config.json'));
    const skillConfig = await fs.readJson(path.join(flowmindHome, '.flowmind', 'skill-config.json'));

    expect(installedClientConfig.mcpServers.flowmind.env.FLOWMIND_HOME).toBe(flowmindHome);
    expect(resourceConfig.resources.yapi.config.defaultProjectId).toBe('42');
    expect(skillConfig.skills['yapi-sync-interface'].defaultProjectId).toBe('42');

    await fs.remove(tempHome);
  });

  test('browser-setup writes local service management browser config', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-cli-browser-setup-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const { stdout } = await runCli(
      [
        'browser-setup',
        '--merchant-url',
        'https://service.example.test/#/merchant-log',
        '--admin-url',
        'https://service.example.test/#/admin-log',
        '--token',
        'setup-token',
        '--json'
      ],
      tempHome
    );
    const result = JSON.parse(stdout);

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      bridgeUrl: 'http://127.0.0.1:47631',
      token: 'setup-token',
      allowedOrigin: 'https://service.example.test/*',
      extensionPath: expect.stringContaining('browser-extension/service-management-log')
    }));

    const skillConfig = await fs.readJson(path.join(tempHome, '.flowmind', 'skill-config.json'));
    expect(skillConfig.skills['service-management-log-analysis']).toEqual(expect.objectContaining({
      browserBridge: expect.objectContaining({
        enabled: true,
        token: 'setup-token'
      }),
      targets: expect.objectContaining({
        merchantBackendLog: expect.objectContaining({
          url: 'https://service.example.test/#/merchant-log'
        }),
        adminService: expect.objectContaining({
          url: 'https://service.example.test/#/admin-log'
        })
      })
    }));

    await fs.remove(tempHome);
  });

  test('saveServiceManagementApiBinding stores captured API binding in local skill config', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-browser-bind-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const result = await saveServiceManagementApiBinding(
      {
        target: 'merchantBackendLog',
        api: {
          url: 'https://service.example.test/api/logs',
          method: 'GET',
          bodyTemplate: {
            pageNo: 1,
            pageSize: 20,
            query: {
              resourceName: '',
              content: ''
            }
          },
          parameterMap: { storeId: 'store' },
          responsePath: { records: 'data.records', total: 'data.total' },
          fieldMap: { resourceName: 'name', operationContent: 'content' }
        }
      },
      { flowmindHome: tempHome }
    );

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      target: 'merchantBackendLog',
      parameterMapKeys: ['storeId'],
      responsePathKeys: expect.arrayContaining(['records', 'total']),
      fieldMapKeys: expect.arrayContaining(['resourceName', 'operationContent'])
    }));

    const skillConfig = await fs.readJson(path.join(tempHome, '.flowmind', 'skill-config.json'));
    expect(skillConfig.skills['service-management-log-analysis'].targets.merchantBackendLog.api).toEqual(
      expect.objectContaining({
        url: 'https://service.example.test/api/logs',
        bodyTemplate: {
          pageNo: 1,
          pageSize: 20,
          query: {
            resourceName: '',
            content: ''
          }
        },
        parameterMap: { storeId: 'store' },
        responsePath: { records: 'data.records', total: 'data.total' },
        fieldMap: { resourceName: 'name', operationContent: 'content' }
      })
    );

    await fs.remove(tempHome);
  });

  test('buildServicePlist creates a loopback browser bridge launch agent', () => {
    const plist = buildServicePlist({
      flowmindHome: '/tmp/flowmind-home',
      flowmindBin: '/tmp/flowmind/bin/flowmind.js',
      nodePath: '/usr/local/bin/node',
      host: '127.0.0.1',
      port: 47632
    });

    expect(plist).toContain(`<string>${SERVICE_LABEL}</string>`);
    expect(plist).toContain('<string>browser-bridge</string>');
    expect(plist).toContain('<string>127.0.0.1</string>');
    expect(plist).toContain('<string>47632</string>');
    expect(plist).toContain('<key>RunAtLoad</key>');
    expect(plist).toContain('<key>KeepAlive</key>');
    expect(plist).toContain('<string>/tmp/flowmind-home</string>');
  });

  test('browser-service install --dry-run writes a user launch agent plist', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-browser-service-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const { stdout } = await runCli(['browser-service', 'install', '--dry-run', '--port', '47632', '--json'], tempHome);
    const result = JSON.parse(stdout);

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      action: 'installed',
      label: SERVICE_LABEL,
      port: 47632,
      dryRun: true
    }));
    expect(result.plistPath).toBe(path.join(tempHome, 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`));
    expect(await fs.pathExists(result.plistPath)).toBe(true);

    const plist = await fs.readFile(result.plistPath, 'utf8');
    expect(plist).toContain('<string>browser-bridge</string>');
    expect(plist).toContain('<string>47632</string>');

    await fs.remove(tempHome);
  });

  test('getBrowserBridgeServiceStatus exposes responsive health fields in dry-run', async () => {
    const tempHome = path.join(os.tmpdir(), `flowmind-browser-service-status-${Date.now()}`);
    await fs.ensureDir(tempHome);

    const status = await getBrowserBridgeServiceStatus({
      platform: 'darwin',
      homeDir: tempHome,
      dryRun: true
    });

    expect(status).toEqual(expect.objectContaining({
      ok: true,
      action: 'status',
      registered: false,
      running: false,
      responsive: null
    }));

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
