const React = require('react');
const { Box, Text } = require('ink');
const { getBorderStyle } = require('../../tui/ui');

function McpStatusBar({ eventBus, asciiMode = false, width = 0, compact = false }) {
  const [toolCount, setToolCount] = React.useState(0);
  const [taskUpdateCount, setTaskUpdateCount] = React.useState(0);
  const [lastCall, setLastCall] = React.useState(null);
  const [lastTaskUpdate, setLastTaskUpdate] = React.useState(null);
  const [serverState, setServerState] = React.useState('running');
  const isCompact = compact || width < 120;

  React.useEffect(() => {
    if (!eventBus) return;
    const toolHandler = (data) => {
      setToolCount(prev => prev + 1);
      setLastCall(data.timestamp || new Date().toISOString());
    };
    const taskHandler = (data) => {
      setTaskUpdateCount(prev => prev + 1);
      setLastTaskUpdate(data);
    };
    eventBus.on('mcp:tool_called', toolHandler);
    eventBus.on('mcp:task_updated', taskHandler);
    return () => {
      eventBus.removeListener('mcp:tool_called', toolHandler);
      eventBus.removeListener('mcp:task_updated', taskHandler);
    };
  }, [eventBus]);

  const formatTime = (ts) => ts ? new Date(ts).toTimeString().substring(0, 8) : 'none';
  const taskSummary = formatTaskProgressSummary(lastTaskUpdate);

  if (isCompact) {
    return (
      React.createElement(Box, { borderStyle: getBorderStyle(asciiMode), borderColor: 'gray', paddingX: 1, flexDirection: 'column' },
        React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'MCP: '),
          React.createElement(Text, { color: 'green' }, serverState),
          React.createElement(Text, { color: 'gray' }, ' | Tools: '),
          React.createElement(Text, { color: 'white' }, '' + toolCount),
          React.createElement(Text, { color: 'gray' }, ' | Tasks: '),
          React.createElement(Text, { color: 'white' }, '' + taskUpdateCount)
        ),
        React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'Last: '),
          React.createElement(Text, { color: 'white' }, formatTime(lastCall))
        ),
        taskSummary && React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'Task: '),
          React.createElement(Text, { color: 'white' }, taskSummary)
        )
      )
    );
  }

  return (
    React.createElement(Box, { borderStyle: getBorderStyle(asciiMode), borderColor: 'gray', paddingX: 1, justifyContent: 'space-between' },
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'MCP Server: '),
        React.createElement(Text, { color: 'green' }, serverState)
      ),
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Port: '),
        React.createElement(Text, { color: 'white' }, 'stdin/stdout')
      ),
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Tool calls: '),
        React.createElement(Text, { color: 'white' }, '' + toolCount)
      ),
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Task updates: '),
        React.createElement(Text, { color: 'white' }, '' + taskUpdateCount)
      ),
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Last call: '),
        React.createElement(Text, { color: 'white' }, formatTime(lastCall))
      ),
      taskSummary && React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Task: '),
        React.createElement(Text, { color: 'white' }, taskSummary)
      )
    )
  );
}

function formatTaskProgressSummary(update) {
  if (!update || typeof update !== 'object') {
    return null;
  }

  const pieces = [];
  if (update.taskId) {
    pieces.push(update.taskId);
  }
  if (update.status) {
    pieces.push(update.status);
  }
  if (update.progress?.stage) {
    pieces.push(update.progress.stage);
  }
  if (Number.isFinite(update.progress?.percent)) {
    pieces.push(`${update.progress.percent}%`);
  }

  return pieces.length > 0 ? pieces.join(' ') : null;
}

module.exports = McpStatusBar;
module.exports.formatTaskProgressSummary = formatTaskProgressSummary;
