const fs = require('fs-extra');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DEFAULT_PORT } = require('./browser-automation-bridge');

const SERVICE_LABEL = 'com.flowmind.browser-bridge';

function getLaunchAgentsDir(options = {}) {
  return options.launchAgentsDir || path.join(options.homeDir || os.homedir(), 'Library', 'LaunchAgents');
}

function getPlistPath(options = {}) {
  return path.join(getLaunchAgentsDir(options), `${SERVICE_LABEL}.plist`);
}

function buildServicePlist(options = {}) {
  const nodePath = options.nodePath || process.execPath;
  const flowmindBin = options.flowmindBin || path.join(__dirname, '..', 'bin', 'flowmind.js');
  const flowmindHome = options.flowmindHome || process.env.FLOWMIND_HOME || os.homedir();
  const logDir = options.logDir || path.join(flowmindHome, '.flowmind', 'logs');
  const host = options.host || '127.0.0.1';
  const port = String(options.port || DEFAULT_PORT);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(SERVICE_LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(nodePath)}</string>
    <string>${escapeXml(flowmindBin)}</string>
    <string>browser-bridge</string>
    <string>--host</string>
    <string>${escapeXml(host)}</string>
    <string>--port</string>
    <string>${escapeXml(port)}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>FLOWMIND_HOME</key>
    <string>${escapeXml(flowmindHome)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapeXml(path.join(logDir, 'browser-bridge.out.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(path.join(logDir, 'browser-bridge.err.log'))}</string>
</dict>
</plist>
`;
}

async function installBrowserBridgeService(options = {}) {
  assertMacos(options);
  const plistPath = getPlistPath(options);
  const flowmindHome = options.flowmindHome || process.env.FLOWMIND_HOME || os.homedir();
  await fs.ensureDir(path.dirname(plistPath));
  await fs.ensureDir(path.join(flowmindHome, '.flowmind', 'logs'));
  await fs.writeFile(plistPath, buildServicePlist(options), 'utf8');
  await bootstrapService(plistPath, options);
  return buildResult('installed', plistPath, options);
}

async function startBrowserBridgeService(options = {}) {
  assertMacos(options);
  const plistPath = getPlistPath(options);
  if (!(await fs.pathExists(plistPath))) {
    throw new Error('Browser bridge service is not installed. Run `flowmind browser-service install` first.');
  }
  await bootstrapService(plistPath, options);
  return buildResult('started', plistPath, options);
}

async function stopBrowserBridgeService(options = {}) {
  assertMacos(options);
  const plistPath = getPlistPath(options);
  await bootoutService(plistPath, options);
  return buildResult('stopped', plistPath, options);
}

async function uninstallBrowserBridgeService(options = {}) {
  assertMacos(options);
  const plistPath = getPlistPath(options);
  await bootoutService(plistPath, { ...options, ignoreFailure: true });
  await fs.remove(plistPath);
  return buildResult('uninstalled', plistPath, options);
}

async function getBrowserBridgeServiceStatus(options = {}) {
  assertMacos(options);
  const plistPath = getPlistPath(options);
  const installed = await fs.pathExists(plistPath);
  const print = runLaunchctl(['print', guiDomain()], { ...options, allowFailure: true });
  const registered = print.stdout.includes(SERVICE_LABEL);
  const state = extractServiceState(print.stdout);
  const health = options.dryRun
    ? { ok: null, error: null }
    : await checkBridgeHealth({
        host: options.host || '127.0.0.1',
        port: Number(options.port || DEFAULT_PORT),
        timeoutMs: 1500
      });
  return {
    ok: true,
    action: 'status',
    label: SERVICE_LABEL,
    installed,
    registered,
    running: health.ok === true,
    state,
    responsive: health.ok,
    healthError: health.error,
    bridge: health.body || null,
    plistPath,
    domain: guiDomain(),
    port: Number(options.port || DEFAULT_PORT)
  };
}

async function bootstrapService(plistPath, options = {}) {
  await bootoutService(plistPath, { ...options, ignoreFailure: true });
  runLaunchctl(['bootstrap', guiDomain(), plistPath], options);
  runLaunchctl(['kickstart', '-k', `${guiDomain()}/${SERVICE_LABEL}`], { ...options, allowFailure: true });
}

async function bootoutService(plistPath, options = {}) {
  const result = runLaunchctl(['bootout', guiDomain(), plistPath], { ...options, allowFailure: true });
  if (!options.ignoreFailure && result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to stop browser bridge service');
  }
}

function runLaunchctl(args, options = {}) {
  if (options.dryRun) {
    return { status: 0, stdout: '', stderr: '', args };
  }
  const result = spawnSync('launchctl', args, { encoding: 'utf8' });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(result.stderr || result.stdout || `launchctl ${args[0]} failed`);
  }
  return result;
}

function buildResult(action, plistPath, options = {}) {
  return {
    ok: true,
    action,
    label: SERVICE_LABEL,
    plistPath,
    domain: guiDomain(),
    port: Number(options.port || DEFAULT_PORT),
    dryRun: Boolean(options.dryRun)
  };
}

function guiDomain() {
  return `gui/${process.getuid ? process.getuid() : os.userInfo().uid}`;
}

function extractServiceState(output = '') {
  const match = String(output).match(/state = ([^\n]+)/);
  return match ? match[1].trim() : null;
}

function checkBridgeHealth(options = {}) {
  return new Promise((resolve) => {
    const req = http.get({
      host: options.host || '127.0.0.1',
      port: Number(options.port || DEFAULT_PORT),
      path: '/health',
      timeout: Number(options.timeoutMs || 1500)
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve({ ok: false, error: `HTTP ${res.statusCode}` });
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve({
            ok: parsed.ok === true,
            error: parsed.ok === true ? null : parsed.error || 'Bridge health check failed',
            body: parsed
          });
        } catch (_error) {
          resolve({ ok: false, error: 'Bridge health response is not JSON' });
        }
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'Bridge health check timed out' });
    });
    req.on('error', (error) => {
      resolve({ ok: false, error: error.message });
    });
  });
}

function assertMacos(options = {}) {
  if ((options.platform || process.platform) === 'darwin') return;
  throw new Error('browser-service currently supports macOS launchctl only.');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

module.exports = {
  SERVICE_LABEL,
  buildServicePlist,
  getPlistPath,
  checkBridgeHealth,
  installBrowserBridgeService,
  startBrowserBridgeService,
  stopBrowserBridgeService,
  uninstallBrowserBridgeService,
  getBrowserBridgeServiceStatus
};
