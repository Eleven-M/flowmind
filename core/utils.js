/**
 * Shared utility functions
 */

const path = require('path');
const os = require('os');

/**
 * Expand ~ in file paths to home directory
 */
function expandPath(filePath) {
  if (filePath.startsWith('~')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || os.homedir(), filePath.slice(1));
  }
  return filePath;
}

function detectManagedCliHost(env = process.env) {
  if (env.FLOWMIND_ALLOW_NESTED_TUI === '1') {
    return null;
  }

  if (env.CODEX_THREAD_ID || env.CODEX_MANAGED_PACKAGE_ROOT || env.OPENAI_CODEX === '1') {
    return {
      id: 'codex',
      name: 'Codex CLI'
    };
  }

  if (env.CLAUDECODE === '1' || env.CLAUDE_CODE === '1' || env.CLAUDECODE_ENTRYPOINT) {
    return {
      id: 'claude-code',
      name: 'Claude Code'
    };
  }

  return null;
}

function shouldUseAsciiUi(env = process.env) {
  if (env.FLOWMIND_FORCE_UNICODE_UI === '1') {
    return false;
  }

  if (env.FLOWMIND_ASCII_UI === '1') {
    return true;
  }

  return env.TERM_PROGRAM === 'Apple_Terminal';
}

function shouldProxyInkStdin(stdin = process.stdin) {
  return !stdin || stdin.isTTY !== true || typeof stdin.setRawMode !== 'function';
}

function getNestedTuiGuardMessage(host) {
  const hostName = host?.name || 'this host CLI';
  return [
    `${hostName} already controls raw stdin and the fullscreen terminal surface.`,
    'Launching FlowMind TUI/Dashboard inside it can terminate the outer session as soon as input is captured.',
    'Use `flowmind-codex` for JSON-based integration, or run `flowmind tui` in a standalone terminal.',
    'Set `FLOWMIND_ALLOW_NESTED_TUI=1` only if you explicitly want to bypass this safeguard.'
  ].join(' ');
}

module.exports = {
  expandPath,
  detectManagedCliHost,
  shouldUseAsciiUi,
  shouldProxyInkStdin,
  getNestedTuiGuardMessage
};
