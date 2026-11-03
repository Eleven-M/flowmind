/**
 * FlowMind Ontology Inventory (P0)
 *
 * This module intentionally stays read-only. It turns the existing skill,
 * component, resource, and result-contract registries into a stable inventory
 * that can be consumed by CLI, MCP, tests, and future ontology tooling.
 *
 * Resource values are deliberately omitted: this is a structural inventory,
 * not a credential or endpoint export.
 */

const { ComponentType, ComponentTypeMeta } = require('./component-types');
const { buildSkillAvailability, resolveComponentStatus } = require('./skill-availability');

const ONTOLOGY_INVENTORY_SCHEMA_VERSION = '0.1';
const RESULT_CONTRACT_VERSION = '1.1';

const RESOURCE_COMPONENT_TYPES = Object.freeze({
  sls: ComponentType.LOG_SERVICE,
  database: ComponentType.DATABASE_MANAGER,
  redis: ComponentType.REDIS_MONITOR,
  yapi: ComponentType.API_DOC,
  yuque: ComponentType.KNOWLEDGE_BASE,
  workflow: ComponentType.WORKFLOW,
  report: ComponentType.REPORT,
  governance: ComponentType.SERVICE_GOVERNANCE
});

const RESOURCE_COMPONENT_TYPE_SETS = Object.freeze({
  [ComponentType.LOG_SERVICE]: [ComponentType.LOG_SERVICE],
  [ComponentType.DATABASE_MANAGER]: [ComponentType.DATABASE_MANAGER, ComponentType.DATABASE_QUERY],
  [ComponentType.REDIS_MONITOR]: [ComponentType.REDIS_MONITOR],
  [ComponentType.API_DOC]: [ComponentType.API_DOC],
  [ComponentType.KNOWLEDGE_BASE]: [ComponentType.KNOWLEDGE_BASE],
  [ComponentType.WORKFLOW]: [ComponentType.WORKFLOW],
  [ComponentType.REPORT]: [ComponentType.REPORT],
  [ComponentType.SERVICE_GOVERNANCE]: [ComponentType.SERVICE_GOVERNANCE]
});

const SKILL_STATUSES = Object.freeze([
  'ready',
  'needs-binding',
  'needs-git',
  'disabled'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function describeMcpTransport(server) {
  if (!isPlainObject(server)) {
    return { type: null, configured: false };
  }
  if (server.command) {
    return { type: 'stdio', configured: true };
  }
  if (server.url || server.endpoint || server.baseUrl || server.serverUrl) {
    return { type: 'remote', configured: true };
  }
  return { type: 'unknown', configured: false };
}

function buildComponentInventory(components = null) {
  return Object.values(ComponentType).map((type) => {
    const meta = ComponentTypeMeta[type] || {};
    const adapter = components?.getAdapter?.(type) || null;
    const status = resolveComponentStatus(components, type);
    const providers = (components?.getProviders?.(type) || []).map((provider) => ({
      name: provider.name,
      active: provider.active === true,
      enabled: provider.enabled !== false,
      mcpServer: provider.mcpServer || null
    }));

    return {
      type,
      name: meta.name || type,
      description: meta.description || null,
      capabilities: [...(meta.requiredCapabilities || [])],
      activeProvider: status.provider || components?.getActiveProvider?.(type) || null,
      mcpServer: status.mcpServer || null,
      configured: status.configured,
      initialized: status.initialized,
      transportConfigured: status.transportConfigured,
      available: status.available,
      providers
    };
  });
}

function buildMcpServerInventory(config = null) {
  const servers = config?.get?.('mcpServers', {}) || {};
  return Object.entries(servers).map(([name, server]) => {
    const transport = describeMcpTransport(server);
    return {
      name,
      transportType: transport.type,
      configured: transport.configured
    };
  });
}

function buildResourceInventory(config = null) {
  const resources = config?.get?.('resources', {}) || {};
  return Object.entries(resources).map(([name, resource]) => {
    const normalized = isPlainObject(resource) ? resource : {};
    const aliases = normalized.mcpServers || {};
    const configKeys = isPlainObject(normalized.config) ? Object.keys(normalized.config) : [];
    const environmentConfig = isPlainObject(normalized.envConfig) ? normalized.envConfig : {};

    return {
      name,
      componentType: RESOURCE_COMPONENT_TYPES[name] || null,
      componentTypes: RESOURCE_COMPONENT_TYPE_SETS[RESOURCE_COMPONENT_TYPES[name]] || [],
      enabled: normalized.enabled !== false,
      provider: normalized.provider || null,
      mcpServer: normalized.mcpServer || null,
      mcpServers: Object.values(aliases).filter(Boolean),
      defaultEnv: normalized.defaultEnv || null,
      environments: Object.keys(environmentConfig),
      configKeys,
      configured: !!(normalized.mcpServer
        || Object.values(aliases).some(Boolean)
        || (configKeys.length > 0))
    };
  });
}

function buildSkillInventory({ skills = [], config = null, components = null } = {}) {
  const skillConfig = config?.get?.('skillConfig.skills', {}) || {};
  const availability = buildSkillAvailability({
    skills,
    components,
    config
  });
  const availabilityByName = new Map(availability.skills.map((entry) => [entry.name, entry]));

  return skills.map((skill) => {
    const name = skill?.name;
    const availabilityEntry = availabilityByName.get(name) || {};
    const definition = skill?.definition || {};
    const hasInputSchema = isPlainObject(skill.inputSchema) || isPlainObject(definition.inputSchema);
    const hasOutputSchema = isPlainObject(skill.outputSchema) || isPlainObject(definition.outputSchema);

    return {
      name,
      description: definition.description || null,
      category: definition.category || definition.metadata?.category || 'general',
      version: definition.version || definition.metadata?.version || null,
      componentDependencies: [...(skill.componentDependencies || definition.componentDependencies || [])],
      runtimeDependencies: [...(skill.runtimeDependencies || definition.runtimeDependencies || [])],
      status: SKILL_STATUSES.includes(availabilityEntry.status) ? availabilityEntry.status : 'unknown',
      available: availabilityEntry.available === true,
      configured: availabilityEntry.configured === true,
      missingBindings: [...(availabilityEntry.missingBindings || [])],
      enabled: skillConfig[name]?.enabled !== false,
      contract: {
        version: definition.contractVersion || skill.contractVersion || RESULT_CONTRACT_VERSION,
        hasInputSchema,
        hasOutputSchema
      }
    };
  });
}

function buildOntologyInventory({
  skills = [],
  config = null,
  components = null,
  entityStore = null
} = {}) {
  const skillEntries = buildSkillInventory({ skills, config, components });
  const componentEntries = buildComponentInventory(components);
  const resourceEntries = buildResourceInventory(config);
  const mcpServerEntries = buildMcpServerInventory(config);
  const entities = Array.isArray(entityStore?.entities) ? entityStore.entities : [];

  return {
    schemaVersion: ONTOLOGY_INVENTORY_SCHEMA_VERSION,
    contractVersion: RESULT_CONTRACT_VERSION,
    generatedAt: new Date().toISOString(),
    summary: {
      skills: {
        total: skillEntries.length,
        ready: skillEntries.filter((skill) => skill.available).length,
        withInputSchema: skillEntries.filter((skill) => skill.contract.hasInputSchema).length,
        withOutputSchema: skillEntries.filter((skill) => skill.contract.hasOutputSchema).length
      },
      components: {
        total: componentEntries.length,
        available: componentEntries.filter((component) => component.available).length,
        withCapabilities: componentEntries.filter((component) => component.capabilities.length > 0).length
      },
      resources: {
        total: resourceEntries.length,
        enabled: resourceEntries.filter((resource) => resource.enabled).length,
        configured: resourceEntries.filter((resource) => resource.configured).length
      },
      mcpServers: {
        total: mcpServerEntries.length,
        configured: mcpServerEntries.filter((server) => server.configured).length
      },
      entities: {
        total: entities.length,
        types: [...new Set(entities.map((entity) => entity.type).filter(Boolean))]
      }
    },
    skills: skillEntries,
    components: componentEntries,
    resources: resourceEntries,
    mcpServers: mcpServerEntries,
    entities: {
      total: entities.length,
      types: [...new Set(entities.map((entity) => entity.type).filter(Boolean))]
    }
  };
}

function validateOntologyInventory(inventory) {
  const issues = [];
  const push = (severity, path, message) => issues.push({ severity, path, message });

  if (!isPlainObject(inventory)) {
    push('error', '$', 'Inventory must be an object');
    return { valid: false, issues };
  }
  if (inventory.schemaVersion !== ONTOLOGY_INVENTORY_SCHEMA_VERSION) {
    push('error', '$.schemaVersion', `Expected ${ONTOLOGY_INVENTORY_SCHEMA_VERSION}`);
  }
  if (typeof inventory.contractVersion !== 'string' || !inventory.contractVersion) {
    push('error', '$.contractVersion', 'Expected a non-empty result contract version');
  }
  if (!Array.isArray(inventory.skills)) {
    push('error', '$.skills', 'Expected an array');
  } else {
    const names = new Set();
    inventory.skills.forEach((skill, index) => {
      const path = `$.skills[${index}]`;
      if (!skill?.name) {
        push('error', `${path}.name`, 'Skill name is required');
        return;
      }
      if (names.has(skill.name)) {
        push('error', `${path}.name`, `Duplicate skill name: ${skill.name}`);
      }
      names.add(skill.name);
      if (!SKILL_STATUSES.includes(skill.status)) {
        push('error', `${path}.status`, `Invalid skill status: ${skill.status}`);
      }
      if (!isPlainObject(skill.contract) || !skill.contract.version) {
        push('error', `${path}.contract.version`, 'Result contract version is required');
      }
      if (!skill.contract?.hasInputSchema || !skill.contract?.hasOutputSchema) {
        push('warning', `${path}.contract`, 'Input/output schema is not declared');
      }
    });
  }

  if (!Array.isArray(inventory.components)) {
    push('error', '$.components', 'Expected an array');
  } else {
    inventory.components.forEach((component, index) => {
      const path = `$.components[${index}]`;
      if (!ComponentTypeMeta[component?.type]) {
        push('error', `${path}.type`, `Unknown component type: ${component?.type}`);
      }
      if (!Array.isArray(component?.capabilities) || component.capabilities.length === 0) {
        push('error', `${path}.capabilities`, 'Component capabilities are required');
      }
    });
  }

  if (!Array.isArray(inventory.resources)) {
    push('error', '$.resources', 'Expected an array');
  } else {
    const names = new Set();
    inventory.resources.forEach((resource, index) => {
      const path = `$.resources[${index}]`;
      if (!resource?.name) {
        push('error', `${path}.name`, 'Resource name is required');
        return;
      }
      if (names.has(resource.name)) {
        push('error', `${path}.name`, `Duplicate resource name: ${resource.name}`);
      }
      names.add(resource.name);
    });
  }

  if (!Array.isArray(inventory.mcpServers)) {
    push('error', '$.mcpServers', 'Expected an array');
  }

  return {
    valid: !issues.some((issue) => issue.severity === 'error'),
    issues
  };
}

async function buildOntologyDoctorChecks(flowmind) {
  const checks = [];
  let inventory;

  try {
    inventory = buildOntologyInventory({
      skills: flowmind.skills.getAll(),
      config: flowmind.config,
      components: flowmind.components,
      entityStore: flowmind.entityMemory?.store || null
    });
    const validation = validateOntologyInventory(inventory);
    const errors = validation.issues.filter((issue) => issue.severity === 'error');
    const warnings = validation.issues.filter((issue) => issue.severity === 'warning');
    checks.push({
      name: 'Ontology Inventory',
      status: errors.length > 0 ? 'error' : 'ok',
      message: errors.length > 0
        ? `${errors.length} schema issue(s)`
        : `v${inventory.schemaVersion}; ${warnings.length} contract warning(s)`
    });
  } catch (error) {
    checks.push({
      name: 'Ontology Inventory',
      status: 'error',
      message: error.message
    });
    return checks;
  }

  const schemaCoverage = inventory.summary.skills;
  checks.push({
    name: 'Skill Contracts',
    status: 'ok',
    message: `${inventory.contractVersion}; schema coverage ${schemaCoverage.withInputSchema}/${schemaCoverage.total} input, ${schemaCoverage.withOutputSchema}/${schemaCoverage.total} output`
  });

  checks.push({
    name: 'Component Capabilities',
    status: inventory.summary.components.withCapabilities === inventory.summary.components.total
      ? 'ok'
      : 'warning',
    message: `${inventory.summary.components.withCapabilities}/${inventory.summary.components.total} declared; ${inventory.summary.components.available} available`
  });

  const needsBinding = inventory.skills.filter((skill) => skill.status === 'needs-binding').length;
  checks.push({
    name: 'Resource Bindings',
    status: needsBinding > 0 ? 'warning' : 'ok',
    message: `${inventory.summary.resources.configured}/${inventory.summary.resources.total} resources configured; ${needsBinding} skill(s) need binding`
  });

  checks.push({
    name: 'Entity Store',
    status: flowmind.entityMemory?.initialized ? 'ok' : 'warning',
    message: flowmind.entityMemory?.initialized
      ? `${inventory.entities.total} observed entit(y/ies); types: ${inventory.entities.types.join(', ') || 'none'}`
      : 'Entity memory is not initialized'
  });

  return checks;
}

module.exports = {
  ONTOLOGY_INVENTORY_SCHEMA_VERSION,
  RESULT_CONTRACT_VERSION,
  RESOURCE_COMPONENT_TYPES,
  SKILL_STATUSES,
  buildOntologyInventory,
  buildSkillInventory,
  buildComponentInventory,
  buildResourceInventory,
  buildMcpServerInventory,
  buildOntologyDoctorChecks,
  validateOntologyInventory
};
