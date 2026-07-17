const { getTuiLayout, MIN_COLUMNS, MIN_ROWS } = require('../tui/layout');

describe('tui layout', () => {
  test('flags a terminal as too small when it drops below the minimum size', () => {
    const layout = getTuiLayout(MIN_COLUMNS - 1, MIN_ROWS);

    expect(layout.tooSmall).toBe(true);
    expect(layout.columns).toBe(MIN_COLUMNS - 1);
    expect(layout.rows).toBe(MIN_ROWS);
  });

  test('uses stacked mode for medium widths to keep the TUI compact', () => {
    const layout = getTuiLayout(120, 32);

    expect(layout.tooSmall).toBe(false);
    expect(layout.stacked).toBe(true);
    expect(layout.sidebarWidth).toBe(120);
    expect(layout.chatWidth).toBe(120);
  });

  test('keeps 80x24 terminals in stacked mode instead of blocking startup', () => {
    const layout = getTuiLayout(80, 24);

    expect(layout.tooSmall).toBe(false);
    expect(layout.stacked).toBe(true);
  });

  test('clamps sidebar width and preserves a usable chat width in wide mode', () => {
    const layout = getTuiLayout(140, 40);

    expect(layout.tooSmall).toBe(false);
    expect(layout.stacked).toBe(false);
    expect(layout.sidebarWidth).toBeGreaterThanOrEqual(24);
    expect(layout.sidebarWidth).toBeLessThanOrEqual(40);
    expect(layout.chatWidth).toBeGreaterThanOrEqual(28);
  });
});
