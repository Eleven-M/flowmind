const React = require('react');
const { Box, useApp, useInput } = require('ink');
const ActivityFeed = require('./components/ActivityFeed.jsx');
const StatsRow = require('./components/StatsRow.jsx');
const DragonPanel = require('./components/DragonPanel.jsx');
const McpStatusBar = require('./components/McpStatusBar.jsx');

function DashboardApp({ flowmind, eventBus }) {
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  return (
    React.createElement(Box, { flexDirection: 'column', width: '100%', height: '100%' },
      React.createElement(Box, { flexDirection: 'row', flexGrow: 1 },
        React.createElement(ActivityFeed, { eventBus: eventBus }),
        React.createElement(Box, { flexDirection: 'column', width: '60%', flexGrow: 1 },
          React.createElement(StatsRow, { flowmind: flowmind }),
          React.createElement(DragonPanel, { flowmind: flowmind })
        )
      ),
      React.createElement(McpStatusBar, { eventBus: eventBus })
    )
  );
}

module.exports = DashboardApp;
