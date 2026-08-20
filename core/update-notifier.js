const { execFile, execSync } = require('child_process');
const { promisify } = require('util');

function compareVersions(currentVersion, latestVersion) {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(latestVersion);

  for (let index = 0; index < 3; index += 1) {
    if (latest[index] > current[index]) return -1;
    if (latest[index] < current[index]) return 1;
  }

  return 0;
}

function parseVersion(version) {
  return String(version || '0.0.0')
    .split('.')
    .slice(0, 3)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function getLatestVersion(packageName = 'flowmind') {
  return execSync(`npm view ${packageName} version`, { encoding: 'utf-8' }).trim();
}

async function getLatestVersionAsync(packageName = 'flowmind') {
  const run = promisify(execFile);
  const result = await run('npm', ['view', packageName, 'version'], {
    encoding: 'utf-8',
    timeout: 2500,
    maxBuffer: 1024 * 64
  });
  return String(result).trim();
}

function isGlobalInstall(packageJsonPath, packageName = 'flowmind') {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    return String(packageJsonPath || '').startsWith(globalRoot) || String(packageJsonPath || '').includes(`${globalRoot}/${packageName}`);
  } catch {
    return false;
  }
}

function buildInstallCommand({ packageName = 'flowmind', version, globalInstall = false }) {
  if (!version) {
    return globalInstall ? `npm install -g ${packageName}@latest` : `npm install ${packageName}@latest`;
  }

  return globalInstall
    ? `npm install -g ${packageName}@${version}`
    : `npm install ${packageName}@${version}`;
}

function getUpdateStatus({
  packageName = 'flowmind',
  currentVersion = '0.0.0',
  packageJsonPath = ''
} = {}) {
  const latestVersion = getLatestVersion(packageName);
  const comparison = compareVersions(currentVersion, latestVersion);
  const globalInstall = isGlobalInstall(packageJsonPath, packageName);

  return {
    packageName,
    currentVersion,
    latestVersion,
    comparison,
    globalInstall,
    installCommand: buildInstallCommand({
      packageName,
      version: latestVersion,
      globalInstall
    })
  };
}

async function getUpdateStatusAsync({
  packageName = 'flowmind',
  currentVersion = '0.0.0',
  packageJsonPath = ''
} = {}) {
  const [latestVersion, globalInstall] = await Promise.all([
    getLatestVersionAsync(packageName),
    isGlobalInstallAsync(packageJsonPath, packageName)
  ]);
  const comparison = compareVersions(currentVersion, latestVersion);

  return {
    packageName,
    currentVersion,
    latestVersion,
    comparison,
    globalInstall,
    installCommand: buildInstallCommand({
      packageName,
      version: latestVersion,
      globalInstall
    })
  };
}

async function isGlobalInstallAsync(packageJsonPath, packageName = 'flowmind') {
  try {
    const run = promisify(execFile);
    const result = await run('npm', ['root', '-g'], {
      encoding: 'utf-8',
      timeout: 2500,
      maxBuffer: 1024 * 16
    });
    const globalRoot = String(result).trim();
    return String(packageJsonPath || '').startsWith(globalRoot) || String(packageJsonPath || '').includes(`${globalRoot}/${packageName}`);
  } catch {
    return false;
  }
}

module.exports = {
  buildInstallCommand,
  compareVersions,
  getLatestVersion,
  getLatestVersionAsync,
  getUpdateStatus,
  getUpdateStatusAsync,
  isGlobalInstall
};
