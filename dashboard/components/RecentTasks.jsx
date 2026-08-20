const React = require('react');
const { Box, Text } = require('ink');
const { getBorderStyle } = require('../../tui/ui');

function RecentTasks({ eventBus, asciiMode = false, width = 0, compact = false }) {
  const [tasks, setTasks] = React.useState([]);
  const isCompact = compact || width < 120;
  const limit = isCompact ? 3 : 5;

  React.useEffect(() => {
    if (!eventBus) {
      return undefined;
    }

    const taskMap = new Map();
    const handler = (update) => {
      const nextTasks = buildRecentTasksFromUpdates(taskMap, update, limit);
      setTasks(nextTasks);
    };

    eventBus.on('mcp:task_updated', handler);
    return () => {
      eventBus.removeListener('mcp:task_updated', handler);
    };
  }, [eventBus, limit]);

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'blue', paddingX: 1, marginTop: 1 },
      React.createElement(Text, { bold: true, color: 'blue' }, 'Recent Tasks'),
      tasks.length === 0 && React.createElement(Text, { color: 'gray' }, isCompact ? 'Waiting...' : 'Waiting for async task updates...'),
      tasks.length > 0 && React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        tasks.map((task) => (
          React.createElement(Box, { key: task.taskId, flexDirection: 'column', marginBottom: 1 },
            React.createElement(Text, { color: task.status === 'failed' ? 'red' : task.status === 'succeeded' ? 'green' : 'white' }, formatTaskHeadline(task)),
            React.createElement(Text, { color: 'gray' }, truncateLine(formatTaskDetails(task), isCompact ? 72 : 110))
          )
        ))
      )
    )
  );
}

function buildRecentTasksFromUpdates(taskMap, update, limit = 5) {
  if (!update || typeof update !== 'object' || !update.taskId) {
    return Array.from(taskMap.values()).slice(0, limit);
  }

  const previous = taskMap.get(update.taskId) || {};
  const next = {
    taskId: update.taskId,
    tool: update.tool || previous.tool || null,
    status: update.status || previous.status || 'running',
    stage: update.progress?.stage || previous.stage || null,
    percent: Number.isFinite(update.progress?.percent) ? update.progress.percent : previous.percent,
    message: update.progress?.message || previous.message || null,
    timestamp: update.timestamp || previous.timestamp || new Date().toISOString()
  };

  taskMap.set(update.taskId, next);

  return Array.from(taskMap.values())
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))
    .slice(0, limit);
}

function formatTaskHeadline(task) {
  const parts = [task.taskId || '?'];
  if (task.status) {
    parts.push(task.status);
  }
  if (task.stage) {
    parts.push(task.stage);
  }
  if (Number.isFinite(task.percent)) {
    parts.push(`${task.percent}%`);
  }
  return parts.join(' | ');
}

function formatTaskDetails(task) {
  const details = [];
  if (task.tool) {
    details.push(`tool=${task.tool}`);
  }
  if (task.message) {
    details.push(task.message);
  }
  return details.join(' | ');
}

function truncateLine(text, maxLength) {
  const value = String(text || '');
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

module.exports = RecentTasks;
module.exports.buildRecentTasksFromUpdates = buildRecentTasksFromUpdates;
module.exports.formatTaskHeadline = formatTaskHeadline;
module.exports.formatTaskDetails = formatTaskDetails;
