const React = require('react');
const { Box, Text, useApp, useInput } = require('ink');
const ActivityFeed = require('./components/ActivityFeed.jsx');
const StatsRow = require('./components/StatsRow.jsx');
const DragonPanel = require('./components/DragonPanel.jsx');
const McpStatusBar = require('./components/McpStatusBar.jsx');
const ResultHighlights = require('./components/ResultHighlights.jsx');
const RecentTasks = require('./components/RecentTasks.jsx');
const { getTuiLayout, MIN_COLUMNS, MIN_ROWS } = require('../tui/layout');

class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return React.createElement(
        Box,
        { flexDirection: 'column', borderStyle: 'single', borderColor: 'red', paddingX: 1, paddingY: 1 },
        React.createElement(Text, { bold: true, color: 'red' }, 'Dashboard render error'),
        React.createElement(Text, { color: 'gray' }, this.state.error.message || 'Unknown render failure'),
        React.createElement(Text, { color: 'gray' }, 'Resize the terminal or restart FlowMind.')
      );
    }
    return this.props.children;
  }
}

function DashboardApp({ flowmind, eventBus, asciiMode = false }) {
  const { exit } = useApp();
  const [terminalSize, setTerminalSize] = React.useState(() => ({
    columns: Number(process.stdout?.columns) || 0,
    rows: Number(process.stdout?.rows) || 0
  }));

  React.useEffect(() => {
    let rafId = null;

    const updateSize = () => {
      const nextSize = {
        columns: Number(process.stdout?.columns) || 0,
        rows: Number(process.stdout?.rows) || 0
      };

      setTerminalSize((prev) => {
        if (prev.columns === nextSize.columns && prev.rows === nextSize.rows) {
          return prev;
        }
        return nextSize;
      });
    };

    const scheduleUpdate = () => {
      if (rafId) {
        clearTimeout(rafId);
      }
      rafId = setTimeout(updateSize, 16);
    };

    scheduleUpdate();
    process.stdout?.on?.('resize', scheduleUpdate);

    return () => {
      if (rafId) {
        clearTimeout(rafId);
      }
      process.stdout?.removeListener?.('resize', scheduleUpdate);
    };
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  const layout = getTuiLayout(terminalSize.columns, terminalSize.rows);

  if (layout.tooSmall) {
    return (
      React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'red', paddingX: 1, paddingY: 1 },
        React.createElement(Text, { bold: true, color: 'red' }, 'Terminal too small'),
        React.createElement(Text, { color: 'gray' }, `Need at least ${MIN_COLUMNS}x${MIN_ROWS}. Current size: ${layout.columns}x${layout.rows}.`),
        React.createElement(Text, { color: 'gray' }, 'Resize the terminal to keep the dashboard stable.')
      )
    );
  }

  return (
    React.createElement(DashboardErrorBoundary, null,
      React.createElement(Box, { flexDirection: 'column', width: '100%', height: '100%' },
        React.createElement(Box, { flexDirection: layout.columns < 120 ? 'column' : 'row', flexGrow: 1 },
          React.createElement(ActivityFeed, { eventBus: eventBus, asciiMode: asciiMode, width: layout.columns, compact: layout.columns < 120 }),
          React.createElement(Box, { flexDirection: 'column', width: layout.columns < 120 ? '100%' : '60%', flexGrow: 1 },
            React.createElement(StatsRow, { flowmind: flowmind, asciiMode: asciiMode, width: layout.columns, compact: layout.columns < 120 }),
            React.createElement(ResultHighlights, { flowmind: flowmind, eventBus: eventBus, asciiMode: asciiMode, width: layout.columns, compact: layout.columns < 120 }),
            React.createElement(RecentTasks, { eventBus: eventBus, asciiMode: asciiMode, width: layout.columns, compact: layout.columns < 120 }),
            React.createElement(DragonPanel, { flowmind: flowmind, asciiMode: asciiMode, width: layout.columns, compact: layout.columns < 120 })
          )
        ),
        React.createElement(McpStatusBar, { eventBus: eventBus, asciiMode: asciiMode, width: layout.columns, compact: layout.columns < 120 })
      )
    )
  );
}

module.exports = DashboardApp;
