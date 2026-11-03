const {
  ONTOLOGY_INVENTORY_SCHEMA_VERSION,
  RESULT_CONTRACT_VERSION,
  buildOntologyDoctorChecks,
  buildOntologyInventory,
  validateOntologyInventory
} = require('../core/ontology-inventory');
const { createSkillResult, createSkillError } = require('../core/result-contract');

function createFixture() {
  const adapter = {
    providerName: 'aliyun-sls',
    mcpServer: 'sls-logs',
    getStatus() {
      return { enabled: true, initialized: true };
    }
  };
  const components = {
    getAdapter(type) {
      return type === 'logService' ? adapter : null;
    },
    getActiveProvider(type) {
      return type === 'logService' ? 'aliyun-sls' : null;
    },
    getProviders(type) {
      return type === 'logService'
        ? [{ name: 'aliyun-sls', active: true, enabled: true, mcpServer: 'sls-logs' }]
        : [];
    }
  };
  const config = {
    get(key, defaultValue = {}) {
      const values = {
        'mcpServers': {
          'sls-logs': {
            command: 'npx'
          }
        },
        'resources': {
          sls: {
            enabled: true,
            mcpServer: 'sls-logs',
            defaultEnv: 'uat',
            envConfig: {
              uat: {
                endpoint: 'https://logs.example.com',
                token: 'should-not-export'
              }
            },
            config: {
              defaultProject: 'internal-only'
            }
          }
        },
        'skillConfig.skills': {
          'log-audit': {
            enabled: true
          }
        }
      };
      return values[key] ?? defaultValue;
    }
  };
  const skills = [
    {
      name: 'log-audit',
      description: 'Audit logs',
      category: 'monitoring',
      version: '1.0.0',
      path: '/tmp/log-audit',
      componentDependencies: ['logService'],
      runtimeDependencies: [],
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' }
    },
    {
      name: 'offline-design-analysis',
      description: 'Offline analysis',
      category: 'analysis',
      path: '/tmp/offline-design-analysis',
      componentDependencies: [],
      runtimeDependencies: []
    }
  ];

  return { components, config, skills };
}

describe('ontology P0 inventory', () => {
  test('builds a stable skill, component, resource, and contract inventory', () => {
    const fixture = createFixture();
    const inventory = buildOntologyInventory({
      skills: fixture.skills,
      config: fixture.config,
      components: fixture.components,
      entityStore: {
        entities: [
          { type: 'service', name: 'order-service' },
          { type: 'trace', name: 'trace-1' }
        ]
      }
    });

    expect(inventory.schemaVersion).toBe(ONTOLOGY_INVENTORY_SCHEMA_VERSION);
    expect(inventory.contractVersion).toBe(RESULT_CONTRACT_VERSION);
    expect(inventory.summary.skills.total).toBe(2);
    expect(inventory.summary.skills.ready).toBe(2);
    expect(inventory.summary.components.available).toBe(1);
    expect(inventory.summary.resources.configured).toBe(1);
    expect(inventory.summary.entities.total).toBe(2);

    const logSkill = inventory.skills.find((skill) => skill.name === 'log-audit');
    expect(logSkill).toEqual(expect.objectContaining({
      status: 'ready',
      available: true,
      contract: {
        version: RESULT_CONTRACT_VERSION,
        hasInputSchema: true,
        hasOutputSchema: true
      }
    }));

    const logComponent = inventory.components.find((component) => component.type === 'logService');
    expect(logComponent).toEqual(expect.objectContaining({
      activeProvider: 'aliyun-sls',
      mcpServer: 'sls-logs',
      available: true
    }));
    expect(logComponent.capabilities).toContain('queryLogs');

    const sls = inventory.resources.find((resource) => resource.name === 'sls');
    expect(sls).toEqual(expect.objectContaining({
      componentType: 'logService',
      componentTypes: ['logService'],
      enabled: true,
      configured: true
    }));
    expect(sls.environments).toEqual(['uat']);
    expect(sls.configKeys).toEqual(['defaultProject']);

    const serialized = JSON.stringify(inventory);
    expect(serialized).not.toContain('should-not-export');
    expect(serialized).not.toContain('https://logs.example.com');
    expect(serialized).not.toContain('/tmp/log-audit');
  });

  test('validates inventory structure and reports missing skill schemas as warnings', () => {
    const fixture = createFixture();
    const inventory = buildOntologyInventory({
      skills: fixture.skills,
      config: fixture.config,
      components: fixture.components
    });
    const validation = validateOntologyInventory(inventory);

    expect(validation.valid).toBe(true);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          path: '$.skills[1].contract'
        })
      ])
    );
  });

  test('rejects duplicate and structurally invalid inventory entries', () => {
    const validation = validateOntologyInventory({
      schemaVersion: ONTOLOGY_INVENTORY_SCHEMA_VERSION,
      contractVersion: RESULT_CONTRACT_VERSION,
      skills: [
        { name: 'duplicate', status: 'ready', contract: { version: RESULT_CONTRACT_VERSION } },
        { name: 'duplicate', status: 'ready', contract: { version: RESULT_CONTRACT_VERSION } }
      ],
      components: [
        { type: 'unknown', capabilities: [] }
      ],
      resources: [],
      mcpServers: []
    });

    expect(validation.valid).toBe(false);
    expect(validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', path: '$.skills[1].name' }),
        expect.objectContaining({ severity: 'error', path: '$.components[0].type' }),
        expect.objectContaining({ severity: 'error', path: '$.components[0].capabilities' })
      ])
    );
  });

  test('builds doctor checks without exposing resource values', async () => {
    const fixture = createFixture();
    const flowmind = {
      skills: {
        getAll: () => fixture.skills
      },
      config: fixture.config,
      components: fixture.components,
      entityMemory: {
        initialized: true,
        store: {
          entities: [{ type: 'service', name: 'order-service' }]
        }
      }
    };

    const checks = await buildOntologyDoctorChecks(flowmind);
    expect(checks.map((check) => check.name)).toEqual([
      'Ontology Inventory',
      'Skill Contracts',
      'Component Capabilities',
      'Resource Bindings',
      'Entity Store'
    ]);
    expect(checks[0].status).toBe('ok');
    expect(JSON.stringify(checks)).not.toContain('should-not-export');
  });

  test('adds a version to unified result and error contracts', () => {
    const result = createSkillResult('log-audit', 'ok', { data: { value: 1 } });
    const error = createSkillError('log-audit', 'failed', { code: 'TEST' });

    expect(result.contractVersion).toBe(RESULT_CONTRACT_VERSION);
    expect(error.contractVersion).toBe(RESULT_CONTRACT_VERSION);
    expect(error.data).toEqual(expect.objectContaining({ code: 'TEST' }));
  });
});
