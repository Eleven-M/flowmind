const { callMcpTool } = require('../core/mcp-http-client');

describe('callMcpTool retry logic', () => {
  const baseArgs = {
    url: 'https://mcp.example.com/call',
    tool: 'testTool',
    args: { foo: 'bar' },
    serverName: 'test-server',
    maxRetries: 2,
    retryDelay: 1
  };

  beforeEach(() => {
    jest.spyOn(global, 'fetch');
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function okResponse(body) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => JSON.stringify(body)
    };
  }

  function errorResponse(status, body) {
    return {
      ok: false,
      status,
      statusText: 'Error',
      text: async () => (body ? JSON.stringify(body) : '')
    };
  }

  test('returns result on first success without retry', async () => {
    fetch.mockResolvedValueOnce(okResponse({ result: { data: 'ok' } }));

    const result = await callMcpTool(baseArgs);
    expect(result).toEqual({ data: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('retries on HTTP 500 then succeeds', async () => {
    fetch
      .mockResolvedValueOnce(errorResponse(500, { error: { message: 'boom' } }))
      .mockResolvedValueOnce(okResponse({ result: { data: 'ok' } }));

    const result = await callMcpTool(baseArgs);
    expect(result).toEqual({ data: 'ok' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('retries on HTTP 429 then succeeds', async () => {
    fetch
      .mockResolvedValueOnce(errorResponse(429, { error: { message: 'slow down' } }))
      .mockResolvedValueOnce(okResponse({ result: { recovered: true } }));

    const result = await callMcpTool(baseArgs);
    expect(result).toEqual({ recovered: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('retries on network TypeError then succeeds', async () => {
    fetch
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse({ result: { ok: true } }));

    const result = await callMcpTool(baseArgs);
    expect(result).toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('throws after exhausting retries on persistent 5xx', async () => {
    fetch.mockResolvedValue(errorResponse(503, { message: 'down' }));

    await expect(callMcpTool(baseArgs)).rejects.toThrow(/HTTP 503/);
    // maxRetries=2 => attempt 0,1,2 = 3 total calls
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('does NOT retry on HTTP 4xx (non-429)', async () => {
    fetch.mockResolvedValueOnce(errorResponse(400, { error: { message: 'bad request' } }));

    await expect(callMcpTool(baseArgs)).rejects.toThrow(/HTTP 400/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry on MCP payload error', async () => {
    fetch.mockResolvedValueOnce(okResponse({ error: { code: -32000, message: 'tool error' } }));

    await expect(callMcpTool(baseArgs)).rejects.toThrow('tool error');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('error has MCP_HTTP_5XX code on 5xx failure', async () => {
    fetch.mockResolvedValue(errorResponse(503, { message: 'down' }));

    await expect(callMcpTool(baseArgs)).rejects.toMatchObject({
      code: 'MCP_HTTP_5XX'
    });
  });

  test('error has MCP_RATE_LIMIT code on 429 failure', async () => {
    fetch.mockResolvedValue(errorResponse(429, { message: 'slow down' }));

    await expect(callMcpTool(baseArgs)).rejects.toMatchObject({
      code: 'MCP_RATE_LIMIT'
    });
  });

  test('error has MCP_NETWORK_ERROR code on TypeError', async () => {
    fetch.mockRejectedValue(new TypeError('connect ECONNREFUSED'));

    await expect(callMcpTool(baseArgs)).rejects.toMatchObject({
      code: 'MCP_NETWORK_ERROR'
    });
  });

  test('error has MCP_HTTP_4XX code on 4xx failure and does not retry', async () => {
    fetch.mockResolvedValueOnce(errorResponse(403, { message: 'forbidden' }));

    await expect(callMcpTool(baseArgs)).rejects.toMatchObject({
      code: 'MCP_HTTP_4XX'
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('throws on missing URL immediately without fetch', async () => {
    await expect(
      callMcpTool({ url: null, tool: 'x', serverName: 'no-url' })
    ).rejects.toMatchObject({
      code: 'MCP_TRANSPORT_MISSING'
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('respects maxRetries=0 (no retries)', async () => {
    fetch.mockResolvedValue(errorResponse(500, { message: 'down' }));

    await expect(callMcpTool({ ...baseArgs, maxRetries: 0 })).rejects.toThrow(/HTTP 500/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('passes retry config through from adapter transport', async () => {
    const McpAdapter = require('../core/adapters/mcp-adapter');
    const adapter = new McpAdapter('test', {
      transport: {
        url: 'https://mcp.example.com/call',
        maxRetries: 0,
        retryDelay: 5
      }
    });

    fetch.mockResolvedValue(errorResponse(500, { message: 'down' }));

    await expect(adapter.callTool('tool', {})).rejects.toThrow(/HTTP 500/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
