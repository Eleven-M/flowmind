#!/usr/bin/env node

/**
 * FlowMind Configuration Migration Tool
 * Migrates existing MCP server configurations to the new component architecture.
 *
 * Usage:
 *   node scripts/migrate-config.js [--dry-run] [--output <path>]
 */

const fs = require('fs-extra');
const path = require('path');

const { ComponentType } = require('../core/component-types');

// Default MCP server to component provider mapping
const DEFAULT_MAPPING = {
  'friday-sls-logs': { type: 'logService', provider: 'aliyun-sls' },
  'aliyun-dms-mcp-server': { type: 'databaseManager', provider: 'aliyun-dms' },
  'friday-rds-redis-query': { type: 'databaseQuery', provider: 'aliyun-rds-query' },
  'friday-aliyun-sz-rds-redis': { type: 'redisMonitor', provider: 'aliyun-redis' },
  'aomi-yapi-mcp': { type: 'apiDoc', provider: 'yapi' },
  'aomi-yuque-mcp': { type: 'knowledgeBase', provider: 'yuque' },
  'friday-auto-flow': { type: 'workflow', provider: 'friday-flow' },
  'friday-auto-report': { type: 'report', provider: 'friday-report' }
};

// MCP server default configurations
const SERVER_DEFAULTS = {
  'friday-sls-logs': {
    config: {
      endpoints: {
        test: 'cn-shenzhen.log.aliyuncs.com',
        prod: 'cn-hongkong.log.aliyuncs.com'
      }
    }
  }
};

function getHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || require('os').homedir();
}

/**
 * Read existing MCP server configuration from settings.
 */
function readExistingConfig() {
  const settingsPaths = [
    path.join(process.cwd(), '.claude', 'settings.local.json'),
    path.join(getHomeDir(), '.claude', 'settings.local.json')
  ];

  for (const settingsPath of settingsPaths) {
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = fs.readJsonSync(settingsPath);
        return settings.enabledMcpjsonServers || [];
      } catch (e) {
        // skip
      }
    }
  }

  return [];
}

/**
 * Generate component config from enabled MCP servers.
 */
function generateComponentConfig(enabledServers) {
  const components = {};

  for (const serverName of enabledServers) {
    const mapping = DEFAULT_MAPPING[serverName];
    if (!mapping) continue;

    const { type, provider } = mapping;

    if (!components[type]) {
      components[type] = {
        default: provider,
        providers: {}
      };
    }

    components[type].providers[provider] = {
      adapter: `${provider}-adapter`,
      enabled: true,
      mcpServer: serverName,
      ...(SERVER_DEFAULTS[serverName] || {})
    };
  }

  return components;
}

/**
 * Main migration function.
 */
async function migrate() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outputIdx = args.indexOf('--output');
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  console.log('FlowMind Configuration Migration Tool');
  console.log('=====================================\n');

  // 1. Read existing config
  const enabledServers = readExistingConfig();
  console.log(`Found ${enabledServers.length} enabled MCP servers:`);
  enabledServers.forEach(s => console.log(`  - ${s}`));
  console.log('');

  // 2. Generate component config
  const components = generateComponentConfig(enabledServers);

  // 3. Build full config
  const config = {
    version: '1.0.0',
    components
  };

  // 4. Output
  const configJson = JSON.stringify(config, null, 2);

  if (dryRun) {
    console.log('Generated component configuration (dry run):');
    console.log(configJson);
  } else {
    const targetPath = outputPath || path.join(getHomeDir(), '.flowmind', 'component-config.json');
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeJson(targetPath, config, { spaces: 2 });
    console.log(`Component configuration written to: ${targetPath}`);
  }

  // 5. Summary
  console.log('\nMigration Summary:');
  console.log(`  Component types configured: ${Object.keys(components).length}`);
  for (const [type, cfg] of Object.entries(components)) {
    const providers = Object.keys(cfg.providers);
    console.log(`  - ${type}: ${cfg.default} (${providers.join(', ')})`);
  }

  if (!dryRun) {
    console.log('\nNext steps:');
    console.log('  1. Review the generated configuration file');
    console.log('  2. Add component config to your flowmind.config.json');
    console.log('  3. Skills will now use the component registry for service access');
  }
}

migrate().catch(console.error);
