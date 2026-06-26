const React = require('react');
const { Box, Text } = require('ink');

function McpStatusBar({ eventBus }) {
  const [toolCount, setToolCount] = React.useState(0);
  const [lastCall, setLastCall] = React.useState(null);
  const [serverState, setServerState] = React.useState('running');

  React.useEffect(() => {
    if (!eventBus) return;
    const handler = (data) => {
      setToolCount(prev => prev + 1);
      setLastCall(data.timestamp || new Date().toISOString());
    };
    eventBus.on('mcp:tool_called', handler);
    return () => { eventBus.removeListener('mcp:tool_called', handler); };
  }, [eventBus]);

  const formatTime = (ts) => ts ? new Date(ts).toTimeString().substring(0, 8) : 'none';

  return (
    React.createElement(Box, { borderStyle: 'single', borderColor: 'gray', paddingX: 1, justifyContent: 'space-between' },
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
        React.createElement(Text, { color: 'gray' }, 'Last call: '),
        React.createElement(Text, { color: 'white' }, formatTime(lastCall))
      )
    )
  );
}

module.exports = McpStatusBar;
