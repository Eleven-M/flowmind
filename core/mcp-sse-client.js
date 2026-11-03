/**
 * Minimal MCP client for servers that only expose the legacy SSE transport
 * (GET /sse -> endpoint event -> POST /message?sessionId=...).
 * Aliyun DMS MCP is the primary example. Plain streamable-HTTP servers keep
 * using callMcpTool from mcp-http-client via callMcpToolForServer.
 */

const { callMcpTool } = require('./mcp-http-client');

const DEFAULT_CONNECT_TIMEOUT_MS = 15000;
const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

class McpSseClient {
  constructor({ url, headers = {}, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS, requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, clientInfo = { name: 'flowmind', version: '1.0.0' } } = {}) {
    if (!url) {
      const error = new Error('MCP SSE transport URL is required');
      error.code = 'MCP_TRANSPORT_MISSING';
      throw error;
    }
    this.url = url;
    this.headers = headers;
    this.connectTimeoutMs = connectTimeoutMs;
    this.requestTimeoutMs = requestTimeoutMs;
    this.clientInfo = clientInfo;
    this.sessionUrl = null;
    this.controller = null;
    this.pending = new Map();
    this.nextId = 0;
    this.initialized = false;
    this.closed = false;
    this.fatalError = null;
  }

  async connect() {
    if (this.sessionUrl) return this.sessionUrl;
    if (this.closed || this.fatalError) throw this.fatalError || new Error('MCP SSE client is closed');

    // SSE gateways rate-limit new sessions (HTTP 429); retry with backoff.
    const maxAttempts = 3;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      if (attempt > 0) await sleep(2000 * attempt + Math.random() * 500);
      try {
        return await this.connectOnce();
      } catch (error) {
        if (attempt === maxAttempts - 1 || !/HTTP 429|HTTP 5\d\d/.test(error.message || '')) {
          throw error;
        }
      }
    }
  }

  async connectOnce() {
    this.controller = new AbortController();
    const connectTimer = setTimeout(() => {
      this.fail(new Error(`MCP SSE connect timed out for ${this.url} after ${this.connectTimeoutMs}ms`));
    }, this.connectTimeoutMs);

    try {
      const response = await fetch(this.url, {
        method: 'GET',
        headers: { Accept: 'text/event-stream', ...this.headers },
        signal: this.controller.signal
      });
      if (!response.ok || !response.body) {
        throw new Error(`MCP SSE connect failed for ${this.url}: HTTP ${response.status}`);
      }
      const endpoint = await new Promise((resolve, reject) => {
        this.endpointResolve = resolve;
        this.endpointReject = reject;
        this.pump(response.body);
      });
      this.sessionUrl = endpoint;
      return this.sessionUrl;
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      clearTimeout(connectTimer);
      this.endpointResolve = null;
      this.endpointReject = null;
    }
  }

  async ensureInitialized() {
    if (this.initialized) return;
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: this.clientInfo
    });
    await this.notify('notifications/initialized', {});
    this.initialized = true;
  }

  async callTool(tool, args = {}) {
    await this.connect();
    await this.ensureInitialized();
    const message = await this.request('tools/call', { name: tool, arguments: args });
    return message.result;
  }

  async request(method, params) {
    const id = ++this.nextId;
    const payload = { jsonrpc: '2.0', id, method, params };

    const waiter = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, timer: null });
    });
    this.pending.get(id).timer = setTimeout(() => {
      const pending = this.pending.get(id);
      if (pending && this.pending.delete(id)) {
        pending.reject(new Error(`MCP SSE request timed out for ${method} after ${this.requestTimeoutMs}ms`));
      }
    }, this.requestTimeoutMs);

    const postText = await this.post(payload, method);
    const direct = parseJsonRpcResponse(postText, id);
    if (direct) {
      this.resolvePending(id, direct);
    }

    const message = await waiter;
    if (message.error) {
      const error = new Error(message.error.message || `MCP request failed for ${method}`);
      error.code = message.error.code || 'MCP_TOOL_CALL_FAILED';
      throw error;
    }
    return message;
  }

  async notify(method, params) {
    await this.post({ jsonrpc: '2.0', method, params }, method);
  }

  async post(payload, method) {
    try {
      const postResponse = await fetch(this.sessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.headers },
        body: JSON.stringify(payload)
      });
      if (!postResponse.ok) {
        throw new Error(`MCP SSE post failed for ${method}: HTTP ${postResponse.status}`);
      }
      return await postResponse.text().catch(() => '');
    } catch (error) {
      const id = payload.id;
      if (id !== undefined) this.rejectPending(id, error);
      throw error;
    }
  }

  async close() {
    this.closed = true;
    this.fail(new Error('MCP SSE client closed'));
  }

  fail(error) {
    this.fatalError = this.fatalError || error;
    if (this.endpointReject) this.endpointReject(error);
    for (const [, entry] of this.pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    if (this.controller) {
      try {
        const outcome = this.controller.abort();
        if (outcome && typeof outcome.catch === 'function') outcome.catch(() => {});
      } catch (_error) {
        // Abort is best-effort cleanup.
      }
    }
  }

  resolvePending(id, message) {
    const entry = this.pending.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(message);
  }

  rejectPending(id, error) {
    const entry = this.pending.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.reject(error);
  }

  pump(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const consume = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let boundary = findEventBoundary(buffer);
          while (boundary.index >= 0) {
            const chunk = buffer.slice(0, boundary.index);
            buffer = buffer.slice(boundary.index + boundary.length);
            this.handleEventChunk(chunk);
            boundary = findEventBoundary(buffer);
          }
        }
      } catch (readError) {
        if (!this.closed) this.fail(readError);
      }
      if (!this.closed && !this.sessionUrl && this.endpointReject) {
        this.fail(new Error('MCP SSE stream closed before endpoint event was received'));
      }
    };
    consume();
  }

  handleEventChunk(chunk) {
    const event = parseSseEvent(chunk);
    if (!event) return;
    if (event.name === 'endpoint' && event.data && !this.sessionUrl) {
      const resolved = new URL(event.data, this.url).toString();
      if (this.endpointResolve) this.endpointResolve(resolved);
      return;
    }
    const message = safeJsonParse(event.data);
    if (message && Number.isInteger(message.id) && this.pending.has(message.id)) {
      this.resolvePending(message.id, message);
    }
  }
}

/**
 * Call one MCP tool on a server described by { url, type, headers }.
 * Routes SSE-type servers through McpSseClient and everything else through
 * the plain JSON-RPC POST client.
 */
async function callMcpToolForServer(serverConfig = {}, tool, args = {}, options = {}) {
  const type = String(serverConfig.type || '').toLowerCase();
  const isSse = type === 'sse' || (!type && /\/sse\/?(\?.*)?$/.test(serverConfig.url || ''));
  if (!isSse) {
    return callMcpTool({
      url: serverConfig.url,
      headers: serverConfig.headers || {},
      tool,
      args,
      timeoutMs: options.requestTimeoutMs,
      serverName: options.serverName || 'mcp',
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay
    });
  }

  const client = new McpSseClient({
    url: serverConfig.url,
    headers: serverConfig.headers || {},
    requestTimeoutMs: options.requestTimeoutMs
  });
  try {
    return await client.callTool(tool, args);
  } finally {
    await client.close().catch(() => {});
  }
}

function findEventBoundary(buffer) {
  const unix = buffer.indexOf('\n\n');
  const windows = buffer.indexOf('\r\n\r\n');
  if (unix < 0 && windows < 0) return { index: -1, length: 0 };
  if (windows >= 0 && (unix < 0 || windows < unix)) return { index: windows, length: 4 };
  return { index: unix, length: 2 };
}

function parseSseEvent(chunk) {
  const lines = chunk.split(/\r?\n/);
  let name = 'message';
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
  }
  if (dataLines.length === 0 && name === 'message') return null;
  return { name, data: dataLines.join('\n') };
}

function parseJsonRpcResponse(text, id) {
  const payload = safeJsonParse(text);
  if (!payload || payload.jsonrpc !== '2.0' || payload.id !== id) return null;
  return payload;
}

function safeJsonParse(text) {
  if (!text || typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  McpSseClient,
  callMcpToolForServer
};
