const { McpSseClient, callMcpToolForServer } = require('../core/mcp-sse-client');

describe('mcp-sse-client', () => {
  test('connects over SSE, posts JSON-RPC to the session endpoint, and reads the streamed response', async () => {
    const originalFetch = global.fetch;
    const encoder = new TextEncoder();
    const postedUrls = [];
    let controller;

    const stream = new ReadableStream({
      start(c) {
        controller = c;
        controller.enqueue(encoder.encode('event: endpoint\ndata: /message?sessionId=s-1\n\n'));
      }
    });

    global.fetch = jest.fn().mockImplementation(async (url, options = {}) => {
      if ((options.method || 'GET').toUpperCase() === 'POST') {
        postedUrls.push(String(url));
        const body = JSON.parse(options.body);
        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify({
          jsonrpc: '2.0',
          id: body.id,
          result: { content: [{ type: 'text', text: '| ID |\n| --- |\n| 1 |' }] }
        })}\n\n`));
        return { ok: true, status: 202, text: async () => '' };
      }
      return { ok: true, status: 200, body: stream, text: async () => '' };
    });

    try {
      const client = new McpSseClient({ url: 'https://dms.example.com/sse', headers: { Authorization: 'Bearer t' } });
      const result = await client.callTool('executeScript', { database_id: '1', script: 'SELECT 1' });
      expect(result.content[0].text).toContain('| ID |');
      expect(postedUrls[0]).toBe('https://dms.example.com/message?sessionId=s-1');
      const postedBodies = global.fetch.mock.calls
        .map(([, options]) => options?.body)
        .filter(Boolean);
      expect(postedBodies.some((body) => body.includes('"initialize"'))).toBe(true);
      expect(postedBodies.some((body) => body.includes('"notifications/initialized"'))).toBe(true);
      await client.close();
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('uses the plain JSON-RPC client for http-type servers', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ jsonrpc: '2.0', id: 1, result: { ok: true } })
    });
    try {
      const result = await callMcpToolForServer(
        { url: 'https://gateway.example.com/mcp', type: 'http', headers: { mcp_token: 't' } },
        'queryLogs',
        { project: 'p' }
      );
      expect(result).toEqual({ ok: true });
      const [, options] = global.fetch.mock.calls[0];
      expect(options.body).toContain('"queryLogs"');
      expect(options.headers.mcp_token).toBe('t');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
