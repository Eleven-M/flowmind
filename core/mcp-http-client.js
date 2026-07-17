/**
 * Minimal JSON-RPC MCP HTTP client.
 * Sends tools/call requests to an MCP gateway over HTTP.
 */

async function callMcpTool({ url, headers = {}, tool, args = {}, timeoutMs = 60000, serverName = 'mcp' }) {
  if (!url) {
    throw createMcpBindingError({
      serverName,
      tool,
      args,
      reason: `MCP transport URL not configured for ${serverName}`,
      headers
    });
  }

  const requestId = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
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

    const text = await response.text();
    let payload = null;

    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Invalid MCP response from ${serverName}: ${text.slice(0, 200)}`);
      }
    }

    if (!response.ok) {
      const errorMessage = payload?.error?.message || payload?.message || response.statusText;
      throw new Error(`MCP request failed for ${serverName}: ${errorMessage}`);
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
      throw error;
    }

    return payload?.result ?? payload ?? null;
  } finally {
    clearTimeout(timeout);
  }
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
