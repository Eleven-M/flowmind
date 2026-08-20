const { createSkillError } = require('./result-contract');

const RETRYABLE_ERROR_CODES = new Set([
  'MCP_TIMEOUT',
  'MCP_NETWORK_ERROR',
  'MCP_RATE_LIMIT',
  'MCP_HTTP_5XX'
]);

/**
 * Determine whether an error is transient and safe to retry.
 */
function isRetryableError(error) {
  if (!error) return false;
  if (typeof error.code === 'string' && RETRYABLE_ERROR_CODES.has(error.code)) {
    return true;
  }
  // Fetch TypeError represents a network-level failure.
  if (error instanceof TypeError) return true;
  return false;
}

function defaultRetryHints(error) {
  if (isRetryableError(error)) {
    return [
      'The request failed due to a transient network or server issue.',
      'Retry after a short wait or verify the target service is reachable.'
    ];
  }
  return [];
}

/**
 * Wrap an async operation (typically an entire user-action branch) so that
 * failures from MCP calls or filesystem reads produce a structured skill
 * error instead of an unhandled rejection.
 */
async function wrapSkillCall(skillName, input, operation, options = {}) {
  try {
    return await operation();
  } catch (error) {
    return createSkillError(skillName, `${options.action || 'Operation'} failed: ${error.message || error}`, {
      input,
      kind: options.kind || 'external-error',
      retryable: options.retryable ?? isRetryableError(error),
      data: {
        ...(options.data || {}),
        error: error.message || String(error),
        errorCode: error.code || null,
        ...(error.bindingHint ? { bindingHint: error.bindingHint } : {})
      },
      retryHints: options.retryHints || defaultRetryHints(error)
    });
  }
}

module.exports = {
  wrapSkillCall,
  isRetryableError,
  defaultRetryHints
};
