const React = require('react');
const { Box, Text } = require('ink');
const { getBorderStyle, getCheckMark } = require('../../tui/ui');

const EVENT_COLORS = {
  'skill:executed': 'green',
  'honor:awarded': 'yellow',
  'learning:recorded': 'cyan',
  'mcp:tool_called': 'magenta',
  'mcp:task_updated': 'blue',
  'process:start': 'blue',
  'process:complete': 'green',
  'process:error': 'red',
};

function formatTime(timestamp) {
  if (!timestamp) return '??:??';
  return new Date(timestamp).toTimeString().substring(0, 8);
}

function formatEvent(event, asciiMode) {
  switch (event.type) {
    case 'skill:executed':
      return 'skill:' + (event.data?.name || '?') + ' ' + getCheckMark(event.data?.success, asciiMode);
    case 'honor:awarded':
      return 'honor +' + (event.data?.points || 0) + ' (' + (event.data?.description || '') + ')';
    case 'learning:recorded':
      return 'learning:' + (event.data?.type || '?') + ' ' + (event.data?.skill || '');
    case 'mcp:tool_called':
      return 'MCP:' + (event.data?.tool || '?') + ' ' + getCheckMark(event.data?.success, asciiMode) + ' ' + (event.data?.duration || 0) + 'ms';
    case 'mcp:task_updated':
      return 'task:' + (event.data?.taskId || '?')
        + ' ' + (event.data?.status || 'running')
        + (event.data?.progress?.stage ? ' ' + event.data.progress.stage : '')
        + (Number.isFinite(event.data?.progress?.percent) ? ` ${event.data.progress.percent}%` : '');
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

function ActivityFeed({ eventBus, asciiMode = false, width = 0, compact = false }) {
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

    const eventTypes = ['skill:executed', 'honor:awarded', 'learning:recorded', 'mcp:tool_called', 'mcp:task_updated', 'process:start', 'process:complete', 'process:error'];
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

  const displayEvents = events.slice(-(compact ? 12 : 30));
  const feedWidth = compact ? '100%' : '40%';

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'green', paddingX: 1, width: feedWidth },
      React.createElement(Text, { bold: true, color: 'green' }, 'Activity Feed'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1, overflow: 'hidden' },
        displayEvents.length === 0 && React.createElement(Text, { color: 'gray' }, compact ? 'Waiting...' : 'Waiting for events...'),
        displayEvents.map((event, i) =>
          React.createElement(Text, { key: i },
            React.createElement(Text, { color: 'gray' }, formatTime(event.timestamp) + ' '),
            React.createElement(Text, { color: EVENT_COLORS[event.type] || 'white' }, formatEvent(event, asciiMode))
          )
        )
      )
    )
  );
}

module.exports = ActivityFeed;
module.exports.formatEvent = formatEvent;
