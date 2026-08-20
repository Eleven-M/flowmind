const MIN_COLUMNS = 60;
const MIN_ROWS = 16;
const STACKED_MODE_COLUMNS = 128;
const DEFAULT_SIDEBAR_WIDTH = 32;
const MIN_SIDEBAR_WIDTH = 24;
const MAX_SIDEBAR_WIDTH = 40;
const MIN_CHAT_WIDTH = 28;

function normalizeDimension(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
}

function getTuiLayout(columns, rows) {
  const safeColumns = normalizeDimension(columns);
  const safeRows = normalizeDimension(rows);
  const tooSmall = safeColumns < MIN_COLUMNS || safeRows < MIN_ROWS;
  const stacked = !tooSmall && (safeColumns < STACKED_MODE_COLUMNS || safeRows < 24);

  if (tooSmall) {
    return {
      columns: safeColumns,
      rows: safeRows,
      tooSmall: true,
      stacked: true,
      sidebarWidth: Math.min(DEFAULT_SIDEBAR_WIDTH, safeColumns),
      chatWidth: Math.max(0, safeColumns - DEFAULT_SIDEBAR_WIDTH - 2)
    };
  }

  if (stacked) {
    return {
      columns: safeColumns,
      rows: safeRows,
      tooSmall: false,
      stacked: true,
      sidebarWidth: safeColumns,
      chatWidth: safeColumns
    };
  }

  const sidebarWidth = clamp(
    Math.round(safeColumns * 0.28),
    MIN_SIDEBAR_WIDTH,
    Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, safeColumns - MIN_CHAT_WIDTH - 2))
  );
  const chatWidth = Math.max(MIN_CHAT_WIDTH, safeColumns - sidebarWidth - 2);

  return {
    columns: safeColumns,
    rows: safeRows,
    tooSmall: false,
    stacked: false,
    sidebarWidth,
    chatWidth
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  DEFAULT_SIDEBAR_WIDTH,
  MAX_SIDEBAR_WIDTH,
  MIN_CHAT_WIDTH,
  MIN_COLUMNS,
  MIN_ROWS,
  MIN_SIDEBAR_WIDTH,
  STACKED_MODE_COLUMNS,
  getTuiLayout,
  normalizeDimension
};
