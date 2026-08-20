const fs = require('fs-extra');
const path = require('path');
const {
  buildAiConfig,
  buildBaseConfig,
  buildComponentConfig,
  buildResourceConfig,
  buildSkillConfig,
  getMcpResourcesForSkills,
  normalizeResourceKeys
} = require('./init-scaffold');

const SECTION_ALIASES = Object.freeze({
  ai: 'ai',
  model: 'ai',
  llm: 'ai',
  resources: 'resources',
  resource: 'resources',
  mcp: 'resources',
  components: 'resources',
  component: 'resources',
  skills: 'skills',
  skill: 'skills'
});

async function loadConfigPackage(filePath) {
  const absolutePath = path.resolve(filePath);
  const ext = path.extname(absolutePath).toLowerCase();

  if (!(await fs.pathExists(absolutePath))) {
    throw new Error(`Config package not found: ${filePath}`);
  }

  if (ext === '.json') {
    return normalizePackage(await fs.readJson(absolutePath), absolutePath);
  }

  if (ext === '.md' || ext === '.markdown' || ext === '.txt') {
    const content = await fs.readFile(absolutePath, 'utf8');
    return normalizePackage(parseMarkdownConfigPackage(content), absolutePath);
  }

  throw new Error(`Unsupported config package type: ${ext || 'unknown'}`);
}

function parseMarkdownConfigPackage(content) {
  const fencedPackages = parseFencedJsonPackages(content);
  if (fencedPackages.length > 0) {
    return mergePackages(fencedPackages);
  }

  const result = {};
  let section = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const heading = rawLine.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) {
      section = normalizeSectionName(heading[1]);
      continue;
    }

    const pair = parseKeyValueLine(rawLine);
    if (!pair) continue;

    const targetSection = normalizeSectionName(pair.key) || section;
    if (targetSection && targetSection !== section && !pair.key.includes('.')) {
      appendValue(result, targetSection, pair.value);
      continue;
    }

    if (section) {
      setSectionValue(result, section, pair.key, pair.value);
    }
  }

  return result;
}

function parseFencedJsonPackages(content) {
  const packages = [];
  const blockPattern = /^```(?:json|flowmind-config)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gim;
  let match;
  while ((match = blockPattern.exec(content)) !== null) {
    const body = match[1].trim();
    if (!body.startsWith('{')) continue;
    try {
      packages.push(JSON.parse(body));
    } catch {
      // Ignore non-package JSON snippets and keep parsing plain markdown.
    }
  }
  return packages;
}

function mergePackages(packages) {
  return packages.reduce((merged, item) => deepMerge(merged, item), {});
}

function normalizePackage(input = {}, sourcePath = null) {
  const selectedSkills = arrayFrom(input.skills || input.skillConfig?.skills);
  const resourcesFromSkills = getMcpResourcesForSkills(selectedSkills);
  const selectedResources = normalizeResourceKeys([
    ...arrayFrom(input.resources),
    ...arrayFrom(input.components),
    ...resourcesFromSkills
  ]);

  const resourceDetails = normalizeResourceDetails(
    normalizeDetails(input.resourceDetails || input.resourceConfig || input.resources)
  );
  const skillDetails = normalizeDetails(input.skillDetails || input.skillConfig || input.skills);
  const ai = normalizeAi(input.ai || input.model || input.llm);

  return {
    sourcePath,
    ai,
    selectedResources,
    selectedResourceDetails: resourceDetails,
    selectedMcpSkills: selectedSkills,
    selectedSkillDetails: skillDetails
  };
}

function buildConfigPackageArtifacts(pkg, configDir) {
  const artifacts = {
    config: null,
    aiConfig: null,
    resourceConfig: buildResourceConfig(pkg.selectedResources, pkg.selectedResourceDetails),
    componentConfig: buildComponentConfig(pkg.selectedResources, pkg.selectedResourceDetails),
    skillConfig: buildSkillConfig(pkg.selectedMcpSkills, pkg.selectedSkillDetails)
  };

  if (pkg.ai?.provider) {
    artifacts.aiConfig = buildAiConfig(pkg.ai.provider, pkg.ai);
  }

  if (configDir) {
    artifacts.config = buildBaseConfig(configDir);
  }

  return artifacts;
}

function normalizeAi(ai) {
  if (!ai) return null;
  if (typeof ai === 'string') {
    return { provider: ai };
  }
  return {
    provider: ai.provider || ai.defaultProvider || ai.name || null,
    model: ai.model || ai.defaultModel || null,
    baseUrl: ai.baseUrl || ai.baseURL || ai.endpoint || null,
    apiKey: ai.apiKey || ai.token || null,
    secretKey: ai.secretKey || null
  };
}

function normalizeDetails(value) {
  if (!value || Array.isArray(value)) return {};
  if (value.skills && typeof value.skills === 'object') return value.skills;
  if (value.resources && typeof value.resources === 'object') return value.resources;
  return value;
}

function normalizeResourceDetails(details = {}) {
  const normalized = { ...details };
  for (const key of ['database', 'redis', 'yapi', 'yuque', 'governance']) {
    if (!normalized[key] || typeof normalized[key] !== 'object') continue;
    const item = { ...normalized[key] };
    item.config = {
      ...(item.config || {})
    };
    for (const field of [
      'defaultSourceId',
      'defaultDatabaseId',
      'defaultSchema',
      'defaultKeyPrefix',
      'defaultLabelName',
      'defaultProjectId',
      'defaultCategoryId',
      'defaultNamespace',
      'defaultSlugPrefix',
      'region',
      'project',
      'engine'
    ]) {
      if (Object.prototype.hasOwnProperty.call(item, field)) {
        item.config[field] = item[field];
        delete item[field];
      }
    }
    normalized[key] = item;
  }
  return normalized;
}

function normalizeSectionName(name) {
  const normalized = String(name || '')
    .trim()
    .replace(/[:：].*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '');
  return SECTION_ALIASES[normalized] || null;
}

function parseKeyValueLine(rawLine) {
  const line = rawLine.trim().replace(/^[-*]\s+/, '');
  if (!line || line.startsWith('#')) return null;
  const match = line.match(/^([^:=：]+?)\s*(?:[:=：])\s*(.+)$/);
  if (!match) return null;
  return {
    key: match[1].trim(),
    value: parseValue(match[2].trim())
  };
}

function parseValue(value) {
  const unquoted = value.replace(/^["']|["']$/g, '');
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(unquoted)) return Number(unquoted);
  if (unquoted.includes(',')) {
    return unquoted.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return unquoted;
}

function appendValue(result, section, value) {
  result[section] = [...arrayFrom(result[section]), ...arrayFrom(value)];
}

function setSectionValue(result, section, key, value) {
  if (!result[section] || Array.isArray(result[section])) {
    result[section] = {};
  }
  setNested(result[section], key, value);
}

function setNested(target, key, value) {
  const keys = String(key).split('.').map((item) => item.trim()).filter(Boolean);
  let cursor = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (!cursor[keys[index]] || typeof cursor[keys[index]] !== 'object') {
      cursor[keys[index]] = {};
    }
    cursor = cursor[keys[index]];
  }
  cursor[keys[keys.length - 1]] = value;
}

function arrayFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'object') return Object.keys(value);
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

module.exports = {
  buildConfigPackageArtifacts,
  loadConfigPackage,
  parseMarkdownConfigPackage
};
