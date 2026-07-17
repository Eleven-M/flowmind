const { detectManagedCliHost, shouldProxyInkStdin, getNestedTuiGuardMessage, shouldUseAsciiUi } = require('../core/utils');
const { isExitCommand } = require('../tui/ui');

describe('managed CLI host detection', () => {
  test('detects Codex-managed environments', () => {
    expect(detectManagedCliHost({
      CODEX_THREAD_ID: 'thread-1'
    })).toEqual({
      id: 'codex',
      name: 'Codex CLI'
    });
  });

  test('detects Claude Code environments', () => {
    expect(detectManagedCliHost({
      CLAUDECODE: '1'
    })).toEqual({
      id: 'claude-code',
      name: 'Claude Code'
    });
  });

  test('allows explicit override for nested TUI', () => {
    expect(detectManagedCliHost({
      CODEX_THREAD_ID: 'thread-1',
      FLOWMIND_ALLOW_NESTED_TUI: '1'
    })).toBeNull();
  });

  test('renders a guard message that points to flowmind-codex', () => {
    expect(getNestedTuiGuardMessage({
      name: 'Codex CLI'
    })).toMatch(/flowmind-codex/);
  });

  test('does not proxy real TTY stdin for Ink', () => {
    expect(shouldProxyInkStdin({
      isTTY: true,
      setRawMode() {}
    })).toBe(false);
  });

  test('proxies non-TTY stdin for Ink compatibility', () => {
    expect(shouldProxyInkStdin({
      isTTY: false
    })).toBe(true);
  });

  test('defaults to ascii ui inside Apple Terminal', () => {
    expect(shouldUseAsciiUi({
      TERM_PROGRAM: 'Apple_Terminal'
    })).toBe(true);
  });

  test('allows forcing unicode ui explicitly', () => {
    expect(shouldUseAsciiUi({
      TERM_PROGRAM: 'Apple_Terminal',
      FLOWMIND_FORCE_UNICODE_UI: '1'
    })).toBe(false);
  });

  test('accepts slash exit commands in tui', () => {
    expect(isExitCommand('/exit')).toBe(true);
    expect(isExitCommand('/quit')).toBe(true);
    expect(isExitCommand(':quit')).toBe(true);
  });
});
