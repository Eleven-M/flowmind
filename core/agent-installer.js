const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const { ensurePrivateDir, writePrivateJson } = require('./secure-files');

const CLIENTS = Object.freeze({
  claude: {
    label: 'Claude',
    envPath: 'FLOWMIND_CLAUDE_CONFIG',
    defaultPath: () => path.join(os.homedir(), '.claude', 'settings.json')
  },
  workbuddy: {
    label: 'WorkBuddy',
    envPath: 'FLOWMIND_WORKBUDDY_CONFIG',
    defaultPath: () => path.join(os.homedir(), '.workbuddy', 'mcp.json')
  }
});

function getSupportedClients() {
  return Object.keys(CLIENTS);
}

function resolveClientConfigPath(client, explicitPath = null) {
  const meta = CLIENTS[client];
  if (!meta) {
    throw new Error(`Unsupported client: ${client}`);
  }
  return path.resolve(explicitPath || process.env[meta.envPath] || meta.defaultPath());
}

function buildFlowMindMcpServer({ command = 'flowmind-mcp', flowmindHome = null, env = {} } = {}) {
  const mcpEnv = { ...env };
  if (flowmindHome) {
    mcpEnv.FLOWMIND_HOME = path.resolve(flowmindHome);
  }

  const server = {
    command,
    args: []
  };

  if (Object.keys(mcpEnv).length > 0) {
    server.env = mcpEnv;
  }

  return server;
}

async function installAgentClient(client, options = {}) {
  if (!CLIENTS[client]) {
    throw new Error(`Unsupported client: ${client}`);
  }

  const configPath = resolveClientConfigPath(client, options.configPath);
  const existing = await readJsonIfExists(configPath);
  const nextConfig = {
    ...existing,
    mcpServers: {
      ...(existing.mcpServers || {}),
      flowmind: buildFlowMindMcpServer({
        command: options.command || 'flowmind-mcp',
        flowmindHome: options.flowmindHome,
        env: options.env || {}
      })
    }
  };

  const result = {
    client,
    label: CLIENTS[client].label,
    configPath,
    serverName: 'flowmind',
    server: nextConfig.mcpServers.flowmind,
    changed: JSON.stringify(existing.mcpServers?.flowmind || null) !== JSON.stringify(nextConfig.mcpServers.flowmind),
    dryRun: Boolean(options.dryRun)
  };

  if (!options.dryRun) {
    await ensurePrivateDir(path.dirname(configPath));
    await writePrivateJson(configPath, nextConfig);
  }

  return result;
}

async function installAgentClients(clients, options = {}) {
  const selected = normalizeClients(clients);
  const installed = [];
  for (const client of selected) {
    installed.push(await installAgentClient(client, options));
  }
  return {
    ok: true,
    installed
  };
}

function normalizeClients(clients) {
  const values = Array.isArray(clients) ? clients : String(clients || '').split(',');
  const normalized = values.map((item) => String(item).trim().toLowerCase()).filter(Boolean);
  if (normalized.length === 0 || normalized.includes('all')) {
    return getSupportedClients();
  }
  for (const client of normalized) {
    if (!CLIENTS[client]) {
      throw new Error(`Unsupported client: ${client}`);
    }
  }
  return Array.from(new Set(normalized));
}

async function readJsonIfExists(filePath) {
  if (!await fs.pathExists(filePath)) {
    return {};
  }
  try {
    const value = await fs.readJson(filePath);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    throw new Error(`Failed to read existing config ${filePath}: ${error.message}`);
  }
}

module.exports = {
  buildFlowMindMcpServer,
  getSupportedClients,
  installAgentClient,
  installAgentClients,
  resolveClientConfigPath
};
