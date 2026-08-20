/**
 * Minimal JSON-RPC MCP HTTP client.
 * Sends tools/call requests to an MCP gateway over HTTP.
 */

async function callMcpTool({
  url,
  headers = {},
  tool,
  args = {},
  timeoutMs = 60000,
  serverName = 'mcp',
  maxRetries = 2,
  retryDelay = 1000
}) {
  if (!url) {
    throw createMcpBindingError({
      serverName,
      tool,
      args,
      reason: `MCP transport URL not configured for ${serverName}`,
      headers
    });
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const outcome = await attemptRequest({ url, headers, tool, args, timeoutMs, serverName });

    if (outcome.ok) {
      return outcome.result;
    }

    if (!outcome.retryable || attempt === maxRetries) {
      throw outcome.error;
    }

    const jitter = Math.random() * 0.3 * retryDelay;
    const delay = retryDelay * Math.pow(2, attempt) + jitter;
    await sleep(delay);
  }
}

async function attemptRequest({ url, headers, tool, args, timeoutMs, serverName }) {
  const requestId = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'flowmind',
        ...headers
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: requestId,
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args
        }
      }),
      signal: controller.signal
    });
  } catch (fetchError) {
    clearTimeout(timeout);
    if (fetchError?.name === 'AbortError') {
      return {
        ok: false,
        retryable: true,
        error: withCode(
          new Error(`MCP request timed out for ${serverName} after ${timeoutMs}ms`),
          'MCP_TIMEOUT'
        )
      };
    }
    // TypeError from fetch represents network failure (DNS, connection refused, etc.)
    return {
      ok: false,
      retryable: true,
      error: withCode(
        new Error(`MCP network error for ${serverName}: ${fetchError.message || fetchError}`),
        'MCP_NETWORK_ERROR'
      )
    };
  }

  clearTimeout(timeout);

  const text = await response.text().catch((parseError) => {
    return null;
  });

  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (parseError) {
      return {
        ok: false,
        retryable: false,
        error: withCode(
          new Error(`Invalid MCP response from ${serverName}: ${text.slice(0, 200)}`),
          'MCP_PARSE_ERROR'
        )
      };
    }
  }

  if (!response.ok) {
    const status = response.status;
    const errorMessage = payload?.error?.message || payload?.message || response.statusText;
    const isRetryable = status === 429 || status >= 500;
    const code = status === 429 ? 'MCP_RATE_LIMIT' : status >= 500 ? 'MCP_HTTP_5XX' : 'MCP_HTTP_4XX';
    return {
      ok: false,
      retryable: isRetryable,
      error: withCode(
        new Error(`MCP request failed for ${serverName} (HTTP ${status}): ${errorMessage}`),
        code
      )
    };
  }

  if (payload?.error) {
    const error = new Error(payload.error.message || `MCP tool call failed for ${serverName}`);
    error.code = payload.error.code || 'MCP_TOOL_CALL_FAILED';
    if (/not configured|missing|required|bind|binding/i.test(error.message)) {
      error.bindingHint = buildMcpBindingHint({
        serverName,
        tool,
        args,
        headers,
        reason: error.message
      });
    }
    return { ok: false, retryable: false, error };
  }

  return { ok: true, result: payload?.result ?? payload ?? null };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withCode(error, code) {
  error.code = code;
  return error;
}

function createMcpBindingError({ serverName, tool, args, reason, headers = {} }) {
  const error = new Error(reason || `MCP transport URL not configured for ${serverName}`);
  error.code = 'MCP_TRANSPORT_MISSING';
  error.bindingHint = buildMcpBindingHint({
    serverName,
    tool,
    args,
    headers,
    reason: error.message
  });
  return error;
}

function buildMcpBindingHint({ serverName, tool, args = {}, headers = {}, reason = '' }) {
  const headerKeys = Object.keys(headers || {});
  const missing = ['endpoint'];
  if (!headerKeys.length) {
    missing.push('headers');
  }

  return {
    kind: 'mcp-binding',
    serverName,
    tool: tool || null,
    missing,
    message: reason
      ? `MCP 连接未配置：${reason}。请先完成绑定。`
      : `MCP 连接未配置：${serverName}。请先完成绑定。`,
    suggestedCommand: `flowmind "绑定资源 mcp=${serverName}${tool ? ` tool=${tool}` : ''}"`,
    fields: {
      endpoint: args.endpoint || null,
      headers: headerKeys
    }
  };
}

module.exports = {
  callMcpTool,
  buildMcpBindingHint,
  createMcpBindingError
};
