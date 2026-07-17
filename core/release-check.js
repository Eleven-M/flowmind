const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const packageJson = require('../package.json');

const execFileAsync = promisify(execFile);

const SECRET_PATTERNS = [
  { name: 'npm token', pattern: /npm_[A-Za-z0-9]{20,}/ },
  { name: 'generic bearer token', pattern: /Bearer\s+[A-Za-z0-9._-]{24,}/i },
  { name: 'private key', pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ }
];

async function readIfExists(filePath) {
  if (!(await fs.pathExists(filePath))) return null;
  return fs.readFile(filePath, 'utf-8');
}

async function scanFileForSecrets(filePath) {
  const content = await readIfExists(filePath);
  if (!content) return [];
  return SECRET_PATTERNS.filter((rule) => rule.pattern.test(content)).map((rule) => ({
    file: filePath,
    issue: rule.name
  }));
}

async function collectPackageFiles(rootDir) {
  const files = packageJson.files || [];
  const results = [];
  for (const entry of files) {
    const fullPath = path.join(rootDir, entry);
    results.push({
      path: entry,
      exists: await fs.pathExists(fullPath)
    });
  }
  return results;
}

function buildNpmEnv() {
  const npmCache = process.env.FLOWMIND_NPM_CACHE || path.join('/private/tmp', 'flowmind-npm-cache');
  const npmHome = process.env.FLOWMIND_NPM_HOME || path.join('/private/tmp', 'flowmind-npm-home');
  const npmUserConfig = path.join(npmHome, '.npmrc');
  fs.ensureDirSync(npmHome);
  fs.writeFileSync(npmUserConfig, `cache=${npmCache}\nlogs-dir=${path.join(npmHome, '_logs')}\n`, 'utf-8');
  return {
    ...process.env,
    HOME: npmHome,
    npm_config_cache: npmCache,
    NPM_CONFIG_CACHE: npmCache,
    npm_config_userconfig: npmUserConfig,
    NPM_CONFIG_USERCONFIG: npmUserConfig
  };
}

async function collectPackedFiles(rootDir) {
  try {
    const npmEnv = buildNpmEnv();
    const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json', '--cache', npmEnv.npm_config_cache], {
      cwd: rootDir,
      env: npmEnv,
      maxBuffer: 1024 * 1024 * 8
    });
    const payload = JSON.parse(stdout);
    const first = Array.isArray(payload) ? payload[0] : null;
    return {
      ok: true,
      files: Array.isArray(first?.files) ? first.files.map((file) => file.path) : []
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      files: []
    };
  }
}

async function runPublint(rootDir) {
  const previousCache = process.env.npm_config_cache;
  const previousUpperCache = process.env.NPM_CONFIG_CACHE;
  const previousHome = process.env.HOME;
  const previousUserConfig = process.env.npm_config_userconfig;
  const previousUpperUserConfig = process.env.NPM_CONFIG_USERCONFIG;
  const npmEnv = buildNpmEnv();
  process.env.HOME = npmEnv.HOME;
  process.env.npm_config_cache = npmEnv.npm_config_cache;
  process.env.NPM_CONFIG_CACHE = npmEnv.NPM_CONFIG_CACHE;
  process.env.npm_config_userconfig = npmEnv.npm_config_userconfig;
  process.env.NPM_CONFIG_USERCONFIG = npmEnv.NPM_CONFIG_USERCONFIG;
  try {
    const { publint } = require('publint');
    const result = await publint({ pkgDir: rootDir });
    return {
      ok: !Array.isArray(result.messages) || result.messages.length === 0,
      messages: result.messages || []
    };
  } catch (error) {
    return {
      ok: false,
      messages: [{ type: 'error', message: error.message }]
    };
  } finally {
    if (previousCache === undefined) {
      delete process.env.npm_config_cache;
    } else {
      process.env.npm_config_cache = previousCache;
    }
    if (previousUpperCache === undefined) {
      delete process.env.NPM_CONFIG_CACHE;
    } else {
      process.env.NPM_CONFIG_CACHE = previousUpperCache;
    }
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserConfig === undefined) {
      delete process.env.npm_config_userconfig;
    } else {
      process.env.npm_config_userconfig = previousUserConfig;
    }
    if (previousUpperUserConfig === undefined) {
      delete process.env.NPM_CONFIG_USERCONFIG;
    } else {
      process.env.NPM_CONFIG_USERCONFIG = previousUpperUserConfig;
    }
  }
}

async function runReleaseCheck(options = {}) {
  const rootDir = options.rootDir || path.resolve(__dirname, '..');
  const version = options.version || packageJson.version;
  const changelogPath = path.join(rootDir, 'CHANGELOG.md');
  const releasePath = path.join(rootDir, 'releases', `v${version}.md`);
  const changelog = await readIfExists(changelogPath);
  const releaseNotes = await readIfExists(releasePath);
  const packageFiles = await collectPackageFiles(rootDir);
  const packedFiles = options.skipExternalPackageChecks
    ? { ok: true, files: ['skipped-by-test'] }
    : await collectPackedFiles(rootDir);
  const publintResult = options.skipExternalPackageChecks ? { ok: true, messages: [] } : await runPublint(rootDir);
  const missingPackageFiles = packageFiles.filter((item) => !item.exists);

  const secretTargets = [
    changelogPath,
    path.join(rootDir, 'README.md'),
    path.join(rootDir, 'README_CN.md'),
    releasePath,
    path.join(rootDir, 'package.json')
  ];
  const secretFindings = [];
  for (const filePath of secretTargets) {
    secretFindings.push(...(await scanFileForSecrets(filePath)));
  }

  const checks = [
    {
      key: 'changelog-version',
      status: changelog && changelog.includes(`[${version}]`) ? 'ok' : 'error',
      message: `CHANGELOG.md contains [${version}]`
    },
    {
      key: 'release-notes',
      status: releaseNotes ? 'ok' : 'error',
      message: `releases/v${version}.md exists`
    },
    {
      key: 'package-files',
      status: missingPackageFiles.length === 0 ? 'ok' : 'error',
      message:
        missingPackageFiles.length === 0
          ? 'package.json files entries exist'
          : `Missing package file entries: ${missingPackageFiles.map((item) => item.path).join(', ')}`
    },
    {
      key: 'packlist',
      status: packedFiles.ok && packedFiles.files.length > 0 ? 'ok' : 'error',
      message: packedFiles.ok
        ? `npm pack dry-run includes ${packedFiles.files.length} file(s)`
        : `npm pack dry-run failed: ${packedFiles.error}`
    },
    {
      key: 'publint',
      status: publintResult.ok ? 'ok' : 'error',
      message: publintResult.ok
        ? 'publint package checks passed'
        : `publint reported ${publintResult.messages.length} issue(s)`
    },
    {
      key: 'secret-scan',
      status: secretFindings.length === 0 ? 'ok' : 'error',
      message:
        secretFindings.length === 0
          ? 'No obvious release-document secrets found'
          : `Potential secrets found: ${secretFindings.map((item) => `${path.relative(rootDir, item.file)} (${item.issue})`).join(', ')}`
    }
  ];

  const errors = checks.filter((check) => check.status === 'error').length;
  return {
    package: packageJson.name,
    version,
    generatedAt: new Date().toISOString(),
    ok: errors === 0,
    summary: {
      ok: checks.length - errors,
      errors
    },
    checks,
    packageFiles,
    packedFiles: packedFiles.files,
    publintMessages: publintResult.messages,
    releaseNotesPath: path.relative(rootDir, releasePath)
  };
}

module.exports = {
  runReleaseCheck,
  SECRET_PATTERNS
};
