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

/**
 * Local learning/RAG/resource material that must never ship in the npm
 * package. Patterns are matched against the npm pack file list (paths
 * relative to the package root).
 */
const LOCAL_DATA_PATTERNS = [
  { name: 'flowmind home directory', pattern: /(^|\/)\.flowmind(-[^/]+)?\// },
  { name: 'learning data', pattern: /(^|\/)learning\// },
  {
    name: 'learning store file',
    pattern: /(^|\/)(entities|resource-bindings|skill-bindings|scene-mappings|stats)\.json$/
  },
  { name: 'synced source material', pattern: /(^|\/)source\// },
  { name: 'sdd-agent records', pattern: /(^|\/)sdd-records\// },
  {
    name: 'AI model artifact directory',
    pattern:
      /(^|\/)(models?|model-cache|model-cache-dir|checkpoints?|weights?|\.ollama|\.huggingface|\.cache\/huggingface|\.cache\/torch|\.cache\/modelscope|\.cache\/lm-studio|\.lmstudio|\.localai)\//
  },
  { name: 'AI model weight file', pattern: /(^|\/).+\.(?:gguf|ggml|safetensors|ckpt|pt|pth|onnx)$/i },
  {
    name: 'internal resource index',
    pattern:
      /(^|\/)(RESOURCE_INDEX\.md|project-git-map\.json|project-db-configs\.json|feign-link-map\.json|auto-flow-apis\.md|auto-flow-pipeline-map\.json)$/
  },
  { name: 'flowmind export bundle', pattern: /(^|\/)flowmind-(learnings|scenes|learning-bundle)[^/]*\.json$/ },
  { name: 'env file', pattern: /(^|\/)\.env(\.|$)/ },
  { name: 'npm config with credentials', pattern: /(^|\/)\.npmrc$/ },
  { name: 'local skill marker', pattern: /(^|\/)skills\/[^/]+\/\.local\.json$/ }
];

function scanPackedFilesForLocalData(packedFiles) {
  const findings = [];
  for (const filePath of packedFiles || []) {
    const normalized = String(filePath).replace(/^\.\//, '');
    for (const rule of LOCAL_DATA_PATTERNS) {
      if (rule.pattern.test(normalized)) {
        findings.push({ file: normalized, issue: rule.name });
        break;
      }
    }
  }
  return findings;
}

/**
 * Skills and shipped code must stay generic: company/project-level names,
 * business field names, and real credentials belong in local resources
 * (skillConfig / bindings / source material), never in the distribution.
 */
const COMPANY_MARKER_PATTERNS = [
  { name: 'hardcoded local path', pattern: /(?:^|[\s'"`(=])\/(?:Users|home)\// },
  { name: 'hardcoded webhook token', pattern: /access_token=[A-Za-z0-9_]{16,}/ }
];

const DEFAULT_COMPANY_MARKER_ALLOWLIST = Object.freeze([]);
const LOCAL_GUARD_RULES_FILENAME = '.flowmind-release-patterns.local.json';

const SHIPPED_SOURCE_DIRS = [
  'bin',
  'core',
  'browser-extension',
  'mcp',
  'skills',
  'tui',
  'dashboard',
  'scripts',
  'config',
  'docs',
  'releases'
];

function normalizeMarkerRules(rules) {
  if (Array.isArray(rules)) {
    return { patterns: rules, allowlist: DEFAULT_COMPANY_MARKER_ALLOWLIST };
  }
  if (rules && Array.isArray(rules.patterns)) {
    return {
      patterns: rules.patterns,
      allowlist: Array.isArray(rules.allowlist) ? rules.allowlist : DEFAULT_COMPANY_MARKER_ALLOWLIST
    };
  }
  return { patterns: COMPANY_MARKER_PATTERNS, allowlist: DEFAULT_COMPANY_MARKER_ALLOWLIST };
}

async function loadCompanyMarkerRules(rootDir) {
  const candidates = [
    path.join(rootDir, LOCAL_GUARD_RULES_FILENAME),
    path.join(process.env.FLOWMIND_HOME || path.join(require('os').homedir(), '.flowmind'), LOCAL_GUARD_RULES_FILENAME)
  ];
  for (const filePath of candidates) {
    try {
      const raw = await fs.readJson(filePath);
      const patterns = (raw.companyMarkers || []).map((rule) => ({
        name: String(rule.name),
        pattern: new RegExp(rule.patternSource, rule.flags || '')
      }));
      return {
        patterns: [...COMPANY_MARKER_PATTERNS, ...patterns],
        allowlist: Array.isArray(raw.allowlist) ? raw.allowlist : DEFAULT_COMPANY_MARKER_ALLOWLIST
      };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { patterns: COMPANY_MARKER_PATTERNS, allowlist: DEFAULT_COMPANY_MARKER_ALLOWLIST };
}

function stripAllowlistedMarkers(content, allowlist = DEFAULT_COMPANY_MARKER_ALLOWLIST) {
  let stripped = content;
  for (const marker of allowlist) {
    stripped = stripped.split(marker).join('');
  }
  return stripped;
}

function scanContentForCompanyMarkers(content, relativePath, markerRules = null) {
  const findings = [];
  const rules = normalizeMarkerRules(markerRules);
  const stripped = stripAllowlistedMarkers(String(content || ''), rules.allowlist);
  for (const rule of rules.patterns) {
    const match = stripped.match(rule.pattern);
    if (match) {
      findings.push({ file: relativePath, issue: rule.name, sample: match[0] });
    }
  }
  return findings;
}

async function collectTextFiles(rootDir, relativeDirs = []) {
  const files = [];
  for (const relativeDir of relativeDirs) {
    const fullDir = path.join(rootDir, relativeDir);
    if (!(await fs.pathExists(fullDir))) continue;
    const entries = await fs.readdir(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);
      const fullPath = path.join(rootDir, relativePath);
      if (entry.isDirectory()) {
        files.push(...(await collectTextFiles(rootDir, [relativePath])));
      } else if (/\.(?:js|jsx|ts|md|json|ya?ml|html|css|mjs|cjs)$/i.test(entry.name)) {
        const stat = await fs.stat(fullPath).catch(() => null);
        if (stat && stat.size <= 512 * 1024) {
          files.push({ fullPath, relativePath });
        }
      }
    }
  }
  return files;
}

async function scanShippedSourceForCompanyMarkers(
  rootDir,
  dirs = SHIPPED_SOURCE_DIRS,
  allowedFiles = null,
  markerRules = null
) {
  const findings = [];
  const rules = normalizeMarkerRules(markerRules);
  const allowed = allowedFiles
    ? new Set(
        (Array.isArray(allowedFiles) ? allowedFiles : [...allowedFiles]).map((filePath) =>
          path.normalize(String(filePath).replace(/^\.\//, ''))
        )
      )
    : null;
  const files = await collectTextFiles(rootDir, dirs);
  for (const { fullPath, relativePath } of files) {
    const normalizedPath = path.normalize(relativePath);
    if (allowed && !allowed.has(normalizedPath)) continue;
    // This module defines the detector patterns themselves; skip the
    // signature file, exactly like an antivirus scanner does.
    if (relativePath === path.join('core', 'release-check.js')) continue;
    const content = await readIfExists(fullPath);
    if (!content) continue;
    findings.push(...scanContentForCompanyMarkers(content, relativePath, rules));
  }
  return findings;
}

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

async function collectFilesForSecretScan(rootDir, relativeDirs = []) {
  const files = [];
  for (const relativeDir of relativeDirs) {
    const fullDir = path.join(rootDir, relativeDir);
    if (!(await fs.pathExists(fullDir))) continue;
    const entries = await fs.readdir(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(fullDir, entry.name);
      if (entry.isDirectory()) {
        const nestedRelative = path.join(relativeDir, entry.name);
        files.push(...(await collectFilesForSecretScan(rootDir, [nestedRelative])));
      } else if (/\.(?:md|json|ya?ml)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }
  return files;
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
  const os = require('os');
  const tmpBase = process.env.FLOWMIND_NPM_TMP || os.tmpdir();
  const npmCache = process.env.FLOWMIND_NPM_CACHE || path.join(tmpBase, 'flowmind-npm-cache');
  const npmHome = process.env.FLOWMIND_NPM_HOME || path.join(tmpBase, 'flowmind-npm-home');
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
    path.join(rootDir, 'SECURITY.md'),
    path.join(rootDir, 'SUPPORT.md'),
    releasePath,
    path.join(rootDir, 'package.json'),
    ...(await collectFilesForSecretScan(rootDir, ['docs', 'config']))
  ];
  // Also scan the actual package payload for secrets (bounded by size).
  if (packedFiles.ok) {
    for (const packedPath of packedFiles.files) {
      if (!/\.(?:md|json|ya?ml|txt|js|jsx|cjs|mjs)$/i.test(packedPath)) continue;
      const fullPath = path.join(rootDir, packedPath);
      const stat = await fs.stat(fullPath).catch(() => null);
      if (!stat || stat.size > 512 * 1024) continue;
      secretTargets.push(fullPath);
    }
  }
  const secretFindings = [];
  const secretScanned = new Set();
  for (const filePath of secretTargets) {
    if (secretScanned.has(filePath)) continue;
    secretScanned.add(filePath);
    secretFindings.push(...(await scanFileForSecrets(filePath)));
  }

  const localDataFindings = packedFiles.ok ? scanPackedFilesForLocalData(packedFiles.files) : [];
  const markerRules = await loadCompanyMarkerRules(rootDir);
  const companyMarkerFindings = await scanShippedSourceForCompanyMarkers(
    rootDir,
    SHIPPED_SOURCE_DIRS,
    packedFiles.ok ? packedFiles.files : [],
    markerRules
  );

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
      key: 'local-data-scan',
      status: localDataFindings.length === 0 ? 'ok' : 'error',
      message:
        localDataFindings.length === 0
          ? 'No local learning/resource data in the npm package'
          : `Local data must not ship: ${localDataFindings.map((item) => `${item.file} (${item.issue})`).join(', ')}`
    },
    {
      key: 'generic-skill-scan',
      status: companyMarkerFindings.length === 0 ? 'ok' : 'error',
      message:
        companyMarkerFindings.length === 0
          ? 'Shipped skills/code stay generic (no company/project markers)'
          : `Company markers must move to local resources: ${companyMarkerFindings
              .map((item) => `${item.file} (${item.issue}: ${item.sample})`)
              .join(', ')}`
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
  collectPackedFiles,
  loadCompanyMarkerRules,
  scanPackedFilesForLocalData,
  scanContentForCompanyMarkers,
  scanShippedSourceForCompanyMarkers,
  SECRET_PATTERNS,
  LOCAL_DATA_PATTERNS,
  COMPANY_MARKER_PATTERNS,
  LOCAL_GUARD_RULES_FILENAME
};
