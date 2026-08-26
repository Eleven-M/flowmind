const fs = require('fs-extra');
const path = require('path');
const { getFlowMindHome: resolveFlowMindHome } = require('./runtime-home');

const ENV_PATTERNS = Object.freeze([
  { env: 'prod', pattern: /\bprod\b|生产/iu },
  { env: 'gray', pattern: /\bgray\b|灰度/iu },
  { env: 'uat', pattern: /\buat\b|预发/iu },
  { env: 'test', pattern: /\btest\b|测试/iu },
  { env: 'dev', pattern: /\bdev\b|开发/iu }
]);

const DEFAULT_SCORE_LIMIT = 5;

let cachedSignature = null;
let cachedContext = null;

function getFlowMindHome() {
  return resolveFlowMindHome();
}

function getSourceDir(options = {}) {
  if (options.sourceDir) {
    return options.sourceDir;
  }
  const flowmindHome = options.flowmindHome || getFlowMindHome();
  return path.join(flowmindHome, '.flowmind', 'source');
}

async function readJsonIfExists(filePath, fallback) {
  if (!(await fs.pathExists(filePath))) {
    return fallback;
  }
  return fs.readJson(filePath);
}

async function buildSignature(sourceDir) {
  const files = [
    'RESOURCE_INDEX.md',
    'project-db-configs.json',
    'project-git-map.json'
  ];
  const entries = [];
  for (const fileName of files) {
    const filePath = path.join(sourceDir, fileName);
    try {
      const stat = await fs.stat(filePath);
      entries.push(`${fileName}:${stat.size}:${stat.mtimeMs}`);
    } catch (error) {
      entries.push(`${fileName}:missing`);
    }
  }
  return entries.join('|');
}

function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseResourceIndex(markdown = '') {
  const lines = String(markdown).split(/\r?\n/);
  const entries = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('### ')) {
      current = {
        title: line.slice(4).trim(),
        path: null,
        aliases: [],
        domains: [],
        modules: [],
        tags: [],
        note: null
      };
      entries.push(current);
      continue;
    }

    if (!current || !line.startsWith('- ')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex < 0) continue;

    const key = line.slice(2, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === 'path') current.path = value;
    if (key === 'aliases') current.aliases = parseList(value);
    if (key === 'domains') current.domains = parseList(value);
    if (key === 'modules') current.modules = parseList(value);
    if (key === 'tags') current.tags = parseList(value);
    if (key === 'note') current.note = value;
  }

  return entries;
}

function extractKeywords(input) {
  return (String(input || '').match(/[\u4e00-\u9fa5A-Za-z0-9._-]+/g) || [])
    .map((item) => item.toLowerCase());
}

function detectEnvironment(input) {
  const normalized = String(input || '').toLowerCase();
  const matched = ENV_PATTERNS.find(({ pattern }) => pattern.test(normalized));
  return matched ? matched.env : null;
}

function normalizeProjectService(service = {}) {
  return {
    ...service,
    databaseId: service.databaseId || service.dmsDatabaseId || null,
    sourceId: service.sourceId || null
  };
}

function buildProjectCatalog(projectConfigs = {}, gitMap = {}, resourceIndex = []) {
  const catalog = new Map();
  const serverProjects = gitMap.serverProjects || {};
  const mobileProjects = gitMap.mobileProjects || {};

  const ensureProject = (projectName) => {
    if (!projectName) return null;
    if (!catalog.has(projectName)) {
      catalog.set(projectName, {
        name: projectName,
        config: projectConfigs[projectName] || null,
        git: serverProjects[projectName] || mobileProjects[projectName] || null,
        resourceEntries: []
      });
    }
    return catalog.get(projectName);
  };

  for (const projectName of Object.keys(projectConfigs)) {
    ensureProject(projectName);
  }

  for (const projectName of Object.keys(serverProjects)) {
    ensureProject(projectName);
  }

  for (const projectName of Object.keys(mobileProjects)) {
    ensureProject(projectName);
  }

  for (const entry of resourceIndex) {
    for (const moduleName of entry.modules || []) {
      const project = ensureProject(moduleName);
      if (project) {
        project.resourceEntries.push(entry);
      }
    }
  }

  return Array.from(catalog.values());
}

function scoreMatch(normalizedInput, value, score, reason) {
  if (!value) return null;
  const normalizedValue = String(value).toLowerCase();
  if (!normalizedValue) return null;
  if (!normalizedInput.includes(normalizedValue)) return null;
  return { score, reason, match: value };
}

function scoreProjectCandidate(project, normalizedInput, keywords = []) {
  let score = 0;
  const reasons = [];

  const directMatches = [
    scoreMatch(normalizedInput, project.name, 18, 'project-name'),
    scoreMatch(normalizedInput, stripEnvPrefix(project.name), 14, 'project-name-base'),
    scoreMatch(normalizedInput, project.git?.description, 6, 'git-description')
  ].filter(Boolean);

  for (const match of directMatches) {
    score += match.score;
    reasons.push(match);
  }

  for (const entry of project.resourceEntries || []) {
    const entryMatches = [
      scoreMatch(normalizedInput, entry.title, 8, 'resource-title'),
      ...entry.aliases.map((value) => scoreMatch(normalizedInput, value, 8, 'resource-alias')),
      ...entry.modules.map((value) => scoreMatch(normalizedInput, value, 10, 'resource-module')),
      ...entry.domains.map((value) => scoreMatch(normalizedInput, value, 3, 'resource-domain')),
      ...entry.tags.map((value) => scoreMatch(normalizedInput, value, 2, 'resource-tag'))
    ].filter(Boolean);

    for (const match of entryMatches) {
      score += match.score;
      reasons.push({ ...match, entry: entry.title });
    }
  }

  const description = String(project.git?.description || '').toLowerCase();
  if (description) {
    for (const keyword of keywords) {
      if (keyword.length < 2) continue;
      if (description.includes(keyword)) {
        score += 1;
        reasons.push({ score: 1, reason: 'git-description-keyword', match: keyword });
      }
    }
  }

  return {
    name: project.name,
    score,
    reasons,
    config: project.config,
    git: project.git,
    resourceEntries: project.resourceEntries || []
  };
}

function stripEnvPrefix(projectName) {
  return String(projectName || '').replace(/^(?:test|dev|uat|gray|prod)-/i, '');
}

async function loadSourceContext(options = {}) {
  const sourceDir = getSourceDir(options);
  const signature = await buildSignature(sourceDir);

  if (cachedContext && cachedSignature === `${sourceDir}:${signature}`) {
    return cachedContext;
  }

  const [projectDbConfigs, projectGitMap, resourceIndexContent] = await Promise.all([
    readJsonIfExists(path.join(sourceDir, 'project-db-configs.json'), { configs: {} }),
    readJsonIfExists(path.join(sourceDir, 'project-git-map.json'), { serverProjects: {}, mobileProjects: {} }),
    fs.pathExists(path.join(sourceDir, 'RESOURCE_INDEX.md'))
      ? fs.readFile(path.join(sourceDir, 'RESOURCE_INDEX.md'), 'utf8')
      : Promise.resolve('')
  ]);

  const resourceIndex = parseResourceIndex(resourceIndexContent);
  const projectConfigs = projectDbConfigs.configs || {};
  const projectCatalog = buildProjectCatalog(projectConfigs, projectGitMap, resourceIndex);

  cachedContext = {
    sourceDir,
    projectConfigs,
    projectGitMap,
    resourceIndex,
    projectCatalog
  };
  cachedSignature = `${sourceDir}:${signature}`;
  return cachedContext;
}

async function inferSourceContext(input, options = {}) {
  const sourceContext = await loadSourceContext(options);
  const normalizedInput = String(input || '').toLowerCase();
  const keywords = extractKeywords(input);
  const explicitEnv = detectEnvironment(input);
  const candidates = sourceContext.projectCatalog
    .map((project) => scoreProjectCandidate(project, normalizedInput, keywords))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);

  const topCandidates = candidates.slice(0, options.limit || DEFAULT_SCORE_LIMIT);
  const selected = topCandidates[0] || null;

  if (!selected) {
    return {
      matched: false,
      sourceDir: sourceContext.sourceDir,
      environment: explicitEnv,
      candidates: []
    };
  }

  const config = selected.config || {};
  const mysql = config.services?.mysql ? normalizeProjectService(config.services.mysql) : null;
  const redis = config.services?.redis ? normalizeProjectService(config.services.redis) : null;
  const environment = explicitEnv
    || config.environment
    || mysql?.envType
    || redis?.envType
    || null;

  return {
    matched: true,
    sourceDir: sourceContext.sourceDir,
    project: selected.name,
    environment,
    gitProject: selected.git || null,
    database: mysql,
    redis,
    cacheKeys: config.cacheKeys || {},
    config,
    matchedEntries: selected.resourceEntries.slice(0, 3).map((entry) => ({
      title: entry.title,
      aliases: entry.aliases,
      modules: entry.modules,
      tags: entry.tags
    })),
    candidates: topCandidates.map((candidate) => ({
      project: candidate.name,
      score: candidate.score,
      reasons: candidate.reasons.slice(0, 8)
    }))
  };
}

module.exports = {
  detectEnvironment,
  getSourceDir,
  inferSourceContext,
  loadSourceContext,
  parseResourceIndex
};
