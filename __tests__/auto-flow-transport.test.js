/**
 * Regression tests for workflow client transport resolution.
 *
 * Covers legacy configurations migrated from pre-2.2.0 installs where the
 * workflow provider is named "friday-flow" (MCP server "friday-auto-flow")
 * and the binding stores the URL under connection.transport instead of a
 * top-level connection.url.
 */

jest.mock('../core/mcp-http-client', () => ({
  callMcpTool: jest.fn().mockResolvedValue({
    content: [{ type: 'text', text: JSON.stringify({ status: 'ok', list: [] }) }]
  })
}));

const autoFlow = require('../skills/auto-flow');
const { callMcpTool } = require('../core/mcp-http-client');
const ComponentRegistry = require('../core/component-registry');

function buildContext({ connection, mcpServers = {} }) {
  return {
    onProgress: jest.fn(),
    resourceBinding: {
      componentType: 'workflow',
      provider: 'friday-flow',
      mcpServer: 'friday-auto-flow',
      connection
    },
    flowmind: {
      config: {
        get: (key, fallback) => (key === 'mcpServers' ? mcpServers : fallback)
      }
    }
  };
}

beforeEach(() => {
  callMcpTool.mockClear();
});

describe('auto-flow workflow transport resolution (legacy friday-* naming)', () => {
  test('uses URL and headers from nested connection.transport', async () => {
    const context = buildContext({
      connection: {
        transport: {
          url: 'https://gateway.example.com/auto/flow/mcp',
          type: 'http',
          headers: { mcp_token: 'nested-token' }
        }
      }
    });

    const result = await autoFlow.execute('列出 uat-retail-manager 的流程', context);

    expect(result.data.action).toBe('list');
    expect(result.data.provider).toBe('friday-flow');
    expect(callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://gateway.example.com/auto/flow/mcp',
        headers: expect.objectContaining({ mcp_token: 'nested-token' })
      })
    );
  });

  test('falls back to mcpServers transport registered for binding.mcpServer', async () => {
    const context = buildContext({
      connection: { skill: 'auto-flow' },
      mcpServers: {
        'friday-auto-flow': {
          url: 'https://gateway.example.com/auto/flow/mcp',
          type: 'http',
          headers: { mcp_token: 'registry-token' }
        }
      }
    });

    const result = await autoFlow.execute('列出 uat-retail-manager 的流程', context);

    expect(result.data.action).toBe('list');
    expect(callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://gateway.example.com/auto/flow/mcp',
        headers: expect.objectContaining({ mcp_token: 'registry-token' })
      })
    );
  });

  test('still prefers inline connection.url with bearer token', async () => {
    const context = buildContext({
      connection: {
        url: 'https://direct.example.com/mcp',
        token: 'direct-token'
      },
      mcpServers: {
        'friday-auto-flow': {
          url: 'https://gateway.example.com/auto/flow/mcp',
          headers: { mcp_token: 'registry-token' }
        }
      }
    });

    const result = await autoFlow.execute('列出 uat-retail-manager 的流程', context);

    expect(result.data.action).toBe('list');
    expect(callMcpTool).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://direct.example.com/mcp',
        headers: expect.objectContaining({
          Authorization: 'Bearer direct-token',
          mcp_token: 'registry-token'
        })
      })
    );
  });

  test('reports missing workflow service when no transport source resolves', async () => {
    const context = buildContext({
      connection: { skill: 'auto-flow' },
      mcpServers: {}
    });

    const result = await autoFlow.execute('部署 uat-retail-manager', context);

    expect(result.success).toBe(false);
    expect(result.type).toBe('error');
    expect(result.message).toContain('Workflow service not configured');
    expect(callMcpTool).not.toHaveBeenCalled();
  });
});

describe('ComponentRegistry legacy friday-flow provider', () => {
  test('treats default auto-flow provider as friday-auto-flow transport alias', async () => {
    const registry = new ComponentRegistry({
      get: (key, fallback) => {
        if (key === 'components') {
          return {
            workflow: {
              default: 'auto-flow',
              providers: {
                'auto-flow': {
                  enabled: true,
                  mcpServer: 'auto-flow'
                }
              }
            }
          };
        }
        if (key === 'mcpServers') {
          return {
            'friday-auto-flow': {
              url: 'https://gateway.example.com/auto/flow/mcp',
              type: 'http',
              headers: { mcp_token: 'registry-token' }
            }
          };
        }
        return fallback;
      }
    });

    await registry.init();

    const adapter = registry.getAdapter('workflow');
    expect(adapter).toBeTruthy();
    expect(adapter.providerName).toBe('auto-flow');
    expect(adapter.getTransportConfig().url).toBe('https://gateway.example.com/auto/flow/mcp');
  });

  test('registers adapter for friday-flow and resolves transport via mcpServers', async () => {
    const registry = new ComponentRegistry({
      get: (key, fallback) => {
        if (key === 'components') {
          return {
            workflow: {
              default: 'friday-flow',
              providers: {
                'friday-flow': {
                  enabled: true,
                  mcpServer: 'friday-auto-flow'
                }
              }
            }
          };
        }
        if (key === 'mcpServers') {
          return {
            'friday-auto-flow': {
              url: 'https://gateway.example.com/auto/flow/mcp',
              type: 'http',
              headers: { mcp_token: 'registry-token' }
            }
          };
        }
        return fallback;
      }
    });

    await registry.init();

    const adapter = registry.getAdapter('workflow');
    expect(adapter).toBeTruthy();
    expect(adapter.providerName).toBe('auto-flow');

    const transport = adapter.getTransportConfig();
    expect(transport.url).toBe('https://gateway.example.com/auto/flow/mcp');
    expect(transport.headers).toEqual(expect.objectContaining({ mcp_token: 'registry-token' }));
  });

  test('registers adapter for friday-flow with inline provider transport', async () => {
    const registry = new ComponentRegistry({
      get: (key, fallback) => {
        if (key === 'components') {
          return {
            workflow: {
              default: 'friday-flow',
              providers: {
                'friday-flow': {
                  enabled: true,
                  mcpServer: 'friday-auto-flow',
                  transport: {
                    url: 'https://inline.example.com/auto/flow/mcp',
                    headers: { mcp_token: 'inline-token' }
                  }
                }
              }
            }
          };
        }
        return fallback;
      }
    });

    await registry.init();

    const adapter = registry.getAdapter('workflow');
    expect(adapter).toBeTruthy();

    const transport = adapter.getTransportConfig();
    expect(transport.url).toBe('https://inline.example.com/auto/flow/mcp');
    expect(transport.headers).toEqual(expect.objectContaining({ mcp_token: 'inline-token' }));
  });
});
