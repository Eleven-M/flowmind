const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const {
  buildFlowMindMcpServer,
  installAgentClient,
  installAgentClients
} = require('../core/agent-installer');

describe('agent installer', () => {
  test('builds a minimal FlowMind MCP server entry', () => {
    expect(buildFlowMindMcpServer()).toEqual({
      command: 'flowmind-mcp',
      args: []
    });
  });

  test('installs FlowMind into an existing client MCP config without removing other servers', async () => {
    const tempDir = path.join(os.tmpdir(), `flowmind-agent-install-${Date.now()}`);
    const configPath = path.join(tempDir, 'settings.json');
    await fs.ensureDir(tempDir);
    await fs.writeJson(configPath, {
      mcpServers: {
        existing: {
          command: 'existing-mcp',
          args: ['--demo']
        }
      }
    });

    const result = await installAgentClient('claude', {
      configPath,
      flowmindHome: path.join(tempDir, '.flowmind')
    });
    const config = await fs.readJson(configPath);

    expect(result).toEqual(expect.objectContaining({
      client: 'claude',
      changed: true,
      dryRun: false
    }));
    expect(config.mcpServers.existing.command).toBe('existing-mcp');
    expect(config.mcpServers.flowmind).toEqual({
      command: 'flowmind-mcp',
      args: [],
      env: {
        FLOWMIND_HOME: path.join(tempDir, '.flowmind')
      }
    });

    await fs.remove(tempDir);
  });

  test('supports installing all agent clients in dry-run mode', async () => {
    const tempDir = path.join(os.tmpdir(), `flowmind-agent-install-all-${Date.now()}`);
    const configPath = path.join(tempDir, 'mcp.json');

    const result = await installAgentClients('all', {
      configPath,
      dryRun: true
    });

    expect(result.ok).toBe(true);
    expect(result.installed.map((item) => item.client)).toEqual(expect.arrayContaining(['claude', 'workbuddy']));
    expect(await fs.pathExists(configPath)).toBe(false);
  });
});
