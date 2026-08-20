const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function buildSkillAvailability({ skills = [], components = null, config = null, cwd = process.cwd(), git = {} } = {}) {
  const gitStatus = resolveGitStatus(cwd, git);
  const skillConfig = config?.get?.('skillConfig.skills', {}) || {};
  const resources = config?.get?.('resources', {}) || {};
  const mcpServers = config?.get?.('mcpServers', {}) || {};
  const componentCache = new Map();
  const entries = skills.map((skill) => buildSkillEntry({
    skill,
    components,
    skillConfig,
    gitStatus,
    componentCache
  }));
  const requiredComponents = [...componentCache.values()];

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      total: entries.length,
      ready: entries.filter((entry) => entry.available).length,
      needsBinding: entries.filter((entry) => entry.status === 'needs-binding').length,
      needsGit: entries.filter((entry) => entry.status === 'needs-git').length,
      disabled: entries.filter((entry) => entry.status === 'disabled').length,
      configured: entries.filter((entry) => entry.configured).length
    },
    mcp: {
      required: requiredComponents.length,
      ready: requiredComponents.filter((component) => component.available).length,
      components: requiredComponents
    },
    git: gitStatus,
    config: {
      loaded: !!config?.initialized,
      skillEntries: Object.keys(skillConfig).length,
      resourceEntries: Object.keys(resources).filter((key) => resources[key]?.enabled !== false).length,
      mcpServers: Object.keys(mcpServers).length
    },
    skills: entries
  };
}

function buildSkillEntry({ skill, components, skillConfig, gitStatus, componentCache }) {
  const name = skill.name;
  const dependencies = getComponentDependencies(skill);
  const runtimeDependencies = getRuntimeDependencies(skill);
  const explicitConfig = Object.prototype.hasOwnProperty.call(skillConfig, name);
  const disabled = explicitConfig && skillConfig[name]?.enabled === false;
  const componentStates = dependencies.map((dependency) => {
    if (!componentCache.has(dependency)) {
      componentCache.set(dependency, resolveComponentStatus(components, dependency));
    }
    return componentCache.get(dependency);
  });
  const missingBindings = componentStates.filter((component) => !component.available);
  const needsGit = runtimeDependencies.includes('git') && !gitStatus.ready;
  const status = resolveSkillStatus({ disabled, missingBindings, needsGit });

  return {
    name,
    category: skill.definition?.category || skill.definition?.metadata?.category || 'general',
    status,
    available: status === 'ready',
    configured: explicitConfig || (dependencies.length > 0 && missingBindings.length === 0),
    componentDependencies: dependencies,
    runtimeDependencies,
    missingBindings: missingBindings.map((component) => component.type),
    missingGit: needsGit,
    hint: buildAvailabilityHint(status, missingBindings, gitStatus)
  };
}

function resolveComponentStatus(components, type) {
  const adapter = components?.getAdapter?.(type) || null;
  const status = adapter?.getStatus?.() || {};
  const transport = adapter?.getTransportConfig?.() || {};
  const usesMcpTransport = typeof adapter?.callMcpTool === 'function';
  const transportConfigured = !usesMcpTransport || !!(
    transport.url || transport.endpoint || transport.baseUrl
  );
  const available = !!adapter && status.enabled !== false && status.initialized !== false && transportConfigured;

  return {
    type,
    provider: adapter?.providerName || null,
    mcpServer: adapter?.mcpServer || null,
    configured: !!adapter,
    initialized: !!adapter && status.initialized !== false,
    transportConfigured,
    available,
    reason: available
      ? null
      : (!adapter ? 'component-not-configured' : (!transportConfigured ? 'mcp-transport-not-configured' : 'component-unavailable'))
  };
}

function resolveSkillStatus({ disabled, missingBindings, needsGit }) {
  if (disabled) return 'disabled';
  if (missingBindings.length > 0) return 'needs-binding';
  if (needsGit) return 'needs-git';
  return 'ready';
}

function buildAvailabilityHint(status, missingBindings, gitStatus) {
  if (status === 'disabled') return 'Enable this skill in skill-config.json.';
  if (status === 'needs-binding') {
    return `Bind ${missingBindings.map((component) => component.type).join(', ')} before use.`;
  }
  if (status === 'needs-git') {
    return gitStatus.installed ? 'Open FlowMind inside a Git repository.' : 'Install Git and open a repository.';
  }
  return null;
}

function getComponentDependencies(skill) {
  const dependencies = skill.componentDependencies || skill.definition?.componentDependencies || [];
  return Array.isArray(dependencies) ? [...new Set(dependencies.filter(Boolean))] : [];
}

function getRuntimeDependencies(skill) {
  const dependencies = skill.runtimeDependencies || skill.definition?.runtimeDependencies || [];
  return Array.isArray(dependencies) ? [...new Set(dependencies.filter(Boolean))] : [];
}

function resolveGitStatus(cwd, overrides = {}) {
  const installed = overrides.installed ?? detectGitInstalled();
  const repositoryRoot = overrides.repositoryRoot === undefined
    ? findGitRepository(cwd)
    : overrides.repositoryRoot;
  return {
    installed: !!installed,
    repository: !!repositoryRoot,
    repositoryRoot: repositoryRoot || null,
    ready: !!installed && !!repositoryRoot
  };
}

function detectGitInstalled() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 2000 });
  return !result.error && result.status === 0;
}

function findGitRepository(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

module.exports = {
  buildSkillAvailability,
  findGitRepository,
  resolveComponentStatus,
  resolveGitStatus
};
