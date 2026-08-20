const crypto = require('crypto');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const { writePrivateJson } = require('./secure-files');
const { DEFAULT_HOST, DEFAULT_PORT } = require('./browser-automation-bridge');

const SKILL_NAME = 'service-management-log-analysis';

async function prepareServiceManagementBrowserSetup(options = {}) {
  const flowmindHome = options.flowmindHome || process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE;
  if (!flowmindHome) {
    throw new Error('FLOWMIND_HOME or HOME is required');
  }

  const configDir = path.join(flowmindHome, '.flowmind');
  const skillConfigPath = path.join(configDir, 'skill-config.json');
  const existingConfig = await readJsonIfExists(skillConfigPath, { skills: {} });
  const existingSkill = existingConfig.skills?.[SKILL_NAME] || {};
  const existingBridge = existingSkill.browserBridge || {};
  const bridgeUrl = options.bridgeUrl || existingBridge.url || `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;
  const token = options.token || existingBridge.token || createToken();
  const targets = buildTargets(options, existingSkill.targets || {});
  const origin = options.origin || inferOriginPattern(targets) || 'https://your-service-management-host/*';

  const nextConfig = {
    ...existingConfig,
    skills: {
      ...(existingConfig.skills || {}),
      [SKILL_NAME]: {
        ...existingSkill,
        defaultTarget: existingSkill.defaultTarget || 'merchantBackendLog',
        queryMode: existingSkill.queryMode || 'api-first',
        browserBridge: {
          ...existingBridge,
          enabled: true,
          url: bridgeUrl,
          token
        },
        targets
      }
    }
  };

  await writePrivateJson(skillConfigPath, nextConfig);

  const extensionPath = path.join(__dirname, '..', 'browser-extension', 'service-management-log');
  const result = {
    ok: true,
    configPath: skillConfigPath,
    bridgeUrl,
    token,
    extensionPath,
    allowedOrigin: origin,
    chromeExtensionsUrl: 'chrome://extensions/',
    loginUrls: Object.values(targets)
      .map((target) => target.url)
      .filter(Boolean),
    nextSteps: [
      'Run `flowmind browser-bridge` and keep it running.',
      'Open chrome://extensions/, enable Developer mode, and load the unpacked extension directory.',
      'Open the extension options, paste the bridge URL/token, grant the allowed origin, and enable polling.',
      'Open one configured login URL in the same Chrome profile and sign in manually.'
    ]
  };

  if (options.openChrome) {
    openChromeSetupPages(result);
  }

  return result;
}

async function readBrowserBridgeConfig(options = {}) {
  const flowmindHome = options.flowmindHome || process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE;
  if (!flowmindHome) return {};
  const config = await readJsonIfExists(path.join(flowmindHome, '.flowmind', 'skill-config.json'), {});
  return config.skills?.[SKILL_NAME]?.browserBridge || {};
}

async function saveServiceManagementApiBinding(binding = {}, options = {}) {
  const flowmindHome = options.flowmindHome || process.env.FLOWMIND_HOME || process.env.HOME || process.env.USERPROFILE;
  if (!flowmindHome) {
    throw new Error('FLOWMIND_HOME or HOME is required');
  }

  const targetKey = binding.target || options.target || 'merchantBackendLog';
  const configDir = path.join(flowmindHome, '.flowmind');
  const skillConfigPath = path.join(configDir, 'skill-config.json');
  const existingConfig = await readJsonIfExists(skillConfigPath, { skills: {} });
  const existingSkill = existingConfig.skills?.[SKILL_NAME] || {};
  const existingTargets = existingSkill.targets || {};
  const existingTarget = existingTargets[targetKey] || {};
  const api = binding.api || {};

  if (!api.url) {
    throw new Error('Captured binding did not include an API URL');
  }

  const nextTarget = {
    ...existingTarget,
    api: {
      ...(existingTarget.api || {}),
      url: api.url,
      method: api.method || 'GET',
      credentials: api.credentials || 'include',
      ...(api.bodyTemplate ? { bodyTemplate: api.bodyTemplate } : {}),
      parameterMap: {
        ...((existingTarget.api || {}).parameterMap || {}),
        ...(api.parameterMap || {})
      },
      responsePath: {
        ...((existingTarget.api || {}).responsePath || {}),
        ...(api.responsePath || {})
      },
      fieldMap: {
        ...((existingTarget.api || {}).fieldMap || {}),
        ...(api.fieldMap || {})
      }
    }
  };

  const nextConfig = {
    ...existingConfig,
    skills: {
      ...(existingConfig.skills || {}),
      [SKILL_NAME]: {
        ...existingSkill,
        defaultTarget: existingSkill.defaultTarget || targetKey,
        queryMode: existingSkill.queryMode || 'api-first',
        targets: {
          ...existingTargets,
          [targetKey]: nextTarget
        }
      }
    }
  };

  await writePrivateJson(skillConfigPath, nextConfig);

  return {
    ok: true,
    configPath: skillConfigPath,
    target: targetKey,
    hasApiUrl: true,
    parameterMapKeys: Object.keys(nextTarget.api.parameterMap || {}),
    responsePathKeys: Object.keys(nextTarget.api.responsePath || {}),
    fieldMapKeys: Object.keys(nextTarget.api.fieldMap || {})
  };
}

function buildTargets(options = {}, existingTargets = {}) {
  const targets = { ...existingTargets };
  if (options.merchantUrl) {
    targets.merchantBackendLog = {
      ...(targets.merchantBackendLog || {}),
      label: '商户后台日志',
      url: options.merchantUrl
    };
  }
  if (options.adminUrl) {
    targets.adminService = {
      ...(targets.adminService || {}),
      label: '管理后台服务',
      url: options.adminUrl
    };
  }
  return targets;
}

function inferOriginPattern(targets = {}) {
  for (const target of Object.values(targets)) {
    if (!target?.url) continue;
    try {
      return `${new URL(target.url).origin}/*`;
    } catch {
      // Ignore invalid local config and let the user fix it.
    }
  }
  return null;
}

function openChromeSetupPages(result) {
  if (process.platform !== 'darwin') return;
  spawn('open', ['-a', 'Google Chrome', result.chromeExtensionsUrl], {
    detached: true,
    stdio: 'ignore'
  }).unref();
  for (const url of result.loginUrls) {
    spawn('open', ['-a', 'Google Chrome', url], {
      detached: true,
      stdio: 'ignore'
    }).unref();
  }
}

async function readJsonIfExists(filePath, fallback) {
  return (await fs.pathExists(filePath)) ? fs.readJson(filePath) : fallback;
}

function createToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  prepareServiceManagementBrowserSetup,
  readBrowserBridgeConfig,
  saveServiceManagementApiBinding,
  inferOriginPattern,
  SKILL_NAME
};
