const React = require('react');
const { Box, Text } = require('ink');

const EVENT_COLORS = {
  'skill:executed': 'green',
  'honor:awarded': 'yellow',
  'learning:recorded': 'cyan',
  'mcp:tool_called': 'magenta',
  'process:start': 'blue',
  'process:complete': 'green',
  'process:error': 'red',
};

function formatTime(timestamp) {
  if (!timestamp) return '??:??';
  return new Date(timestamp).toTimeString().substring(0, 8);
}

function formatEvent(event) {
  switch (event.type) {
    case 'skill:executed':
      return 'skill:' + (event.data?.name || '?') + ' ' + (event.data?.success ? '\u2713' : '\u2717');
    case 'honor:awarded':
      return 'honor +' + (event.data?.points || 0) + ' (' + (event.data?.description || '') + ')';
    case 'learning:recorded':
      return 'learning:' + (event.data?.type || '?') + ' ' + (event.data?.skill || '');
    case 'mcp:tool_called':
      return 'MCP:' + (event.data?.tool || '?') + ' ' + (event.data?.success ? '\u2713' : '\u2717') + ' ' + (event.data?.duration || 0) + 'ms';
    case 'process:start':
      return 'process: ' + (event.data?.input?.substring(0, 30) || '?') + '...';
    case 'process:complete':
      return 'done:' + (event.data?.skill || '?') + ' ' + (event.data?.duration || 0) + 'ms';
    case 'process:error':
      return 'error: ' + (event.data?.error?.substring(0, 40) || '?');
    default:
      return event.type || 'unknown';
  }
}

function ActivityFeed({ eventBus }) {
  const [events, setEvents] = React.useState([]);

  React.useEffect(() => {
    if (!eventBus) return;

    const handler = (eventType) => (data) => {
      setEvents(prev => {
        const next = [...prev, { type: eventType, data, timestamp: data.timestamp || new Date().toISOString() }];
        if (next.length > 100) next.shift();
        return next;
      });
    };

    const eventTypes = ['skill:executed', 'honor:awarded', 'learning:recorded', 'mcp:tool_called', 'process:start', 'process:complete', 'process:error'];
    const handlers = eventTypes.map(type => {
      const h = handler(type);
      eventBus.on(type, h);
      return { type, handler: h };
    });

    return () => {
      for (const { type, handler: h } of handlers) {
        eventBus.removeListener(type, h);
      }
    };
  }, [eventBus]);

  const displayEvents = events.slice(-30);

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'green', paddingX: 1, width: '40%' },
      React.createElement(Text, { bold: true, color: 'green' }, 'Activity Feed'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1, overflow: 'hidden' },
        displayEvents.length === 0 && React.createElement(Text, { color: 'gray' }, 'Waiting for events...'),
        displayEvents.map((event, i) =>
          React.createElement(Text, { key: i },
            React.createElement(Text, { color: 'gray' }, formatTime(event.timestamp) + ' '),
            React.createElement(Text, { color: EVENT_COLORS[event.type] || 'white' }, formatEvent(event))
          )
        )
      )
    )
  );
}

module.exports = ActivityFeed;
