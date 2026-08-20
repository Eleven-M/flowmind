const { buildSkillAvailability, findGitRepository } = require('../core/skill-availability');

describe('skill availability', () => {
  test('classifies local, MCP-bound, Git-bound, missing, and disabled skills', () => {
    const adapters = {
      logService: createAdapter('aliyun-sls', 'sls-logs', 'https://mcp.example.com/logs'),
      workflow: createAdapter('auto-flow', 'auto-flow', null)
    };
    const configValues = {
      'skillConfig.skills': { disabled: { enabled: false }, 'log-audit': { enabled: true } },
      resources: { sls: { enabled: true } },
      mcpServers: { 'sls-logs': { url: 'https://mcp.example.com/logs' } }
    };
    const result = buildSkillAvailability({
      skills: [
        skill('local-analysis'),
        skill('log-audit', ['logService']),
        skill('auto-flow', ['workflow']),
        skill('git-review', [], ['git']),
        skill('disabled')
      ],
      components: { getAdapter: (type) => adapters[type] || null },
      config: { initialized: true, get: (key, fallback) => configValues[key] ?? fallback },
      cwd: '/tmp/not-a-repo',
      git: { installed: true, repositoryRoot: null }
    });

    expect(result.summary).toEqual(expect.objectContaining({
      total: 5,
      ready: 2,
      needsBinding: 1,
      needsGit: 1,
      disabled: 1
    }));
    expect(result.mcp).toEqual(expect.objectContaining({ required: 2, ready: 1 }));
    expect(findSkill(result, 'local-analysis').status).toBe('ready');
    expect(findSkill(result, 'log-audit')).toEqual(expect.objectContaining({
      status: 'ready',
      configured: true
    }));
    expect(findSkill(result, 'auto-flow')).toEqual(expect.objectContaining({
      status: 'needs-binding',
      missingBindings: ['workflow']
    }));
    expect(findSkill(result, 'git-review').status).toBe('needs-git');
    expect(findSkill(result, 'disabled').status).toBe('disabled');
  });

  test('recognizes the current repository and exposes FlowMind runtime status', async () => {
    const FlowMind = require('../core');
    const flowmind = new FlowMind({ ai: { providers: {}, defaultProvider: null } });
    await flowmind.init();

    const result = flowmind.getSkillAvailability({ cwd: process.cwd(), git: { installed: true } });

    expect(findGitRepository(process.cwd())).toBe(process.cwd());
    expect(result.git).toEqual(expect.objectContaining({ ready: true, repository: true }));
    expect(result.skills).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'git-review', status: 'ready' }),
      expect.objectContaining({ name: 'auto-flow', status: expect.stringMatching(/ready|needs-binding/) })
    ]));
  });
});

function createAdapter(providerName, mcpServer, url) {
  return {
    providerName,
    mcpServer,
    getStatus: () => ({ enabled: true, initialized: true }),
    getTransportConfig: () => ({ url }),
    callMcpTool: () => undefined
  };
}

function skill(name, componentDependencies = [], runtimeDependencies = []) {
  return {
    name,
    componentDependencies,
    runtimeDependencies,
    definition: { metadata: { category: 'test' } }
  };
}

function findSkill(result, name) {
  return result.skills.find((entry) => entry.name === name);
}
