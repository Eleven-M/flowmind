const { getTuiLayout, MIN_COLUMNS, MIN_ROWS } = require('../tui/layout');

describe('dashboard layout', () => {
  test('uses the same minimum terminal guard as the TUI', () => {
    const layout = getTuiLayout(MIN_COLUMNS, MIN_ROWS - 1);

    expect(layout.tooSmall).toBe(true);
  });

  test('keeps wide terminals in horizontal mode', () => {
    const layout = getTuiLayout(160, 40);

    expect(layout.tooSmall).toBe(false);
    expect(layout.sidebarWidth).toBeGreaterThan(0);
    expect(layout.chatWidth).toBeGreaterThan(0);
  });
});
