const React = require('react');
const { Box, Text } = require('ink');
const { getBorderStyle } = require('../../tui/ui');
const { unwrapResultPayload } = require('../../tui/format-result');

function ResultHighlights({ flowmind, eventBus, asciiMode = false, width = 0, compact = false }) {
  const [summary, setSummary] = React.useState(null);
  const isCompact = compact || width < 120;

  React.useEffect(() => {
    const refresh = () => {
      try {
        setSummary(getLatestConversationSummary(flowmind));
      } catch {
        setSummary(null);
      }
    };

    refresh();
    if (!eventBus) {
      return undefined;
    }

    eventBus.on('process:complete', refresh);
    eventBus.on('process:error', refresh);

    return () => {
      eventBus.removeListener('process:complete', refresh);
      eventBus.removeListener('process:error', refresh);
    };
  }, [flowmind, eventBus]);

  const actionLimit = isCompact ? 2 : 3;

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'magenta', paddingX: 1, marginTop: 1 },
      React.createElement(Text, { bold: true, color: 'magenta' }, 'Latest Result'),
      !summary && React.createElement(Text, { color: 'gray' }, isCompact ? 'Waiting...' : 'Waiting for a completed result...'),
      summary && React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
        React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'Skill: '),
          React.createElement(Text, { color: 'white' }, summary.skill || 'unknown')
        ),
        summary.time && React.createElement(Text, null,
          React.createElement(Text, { color: 'gray' }, 'Time: '),
          React.createElement(Text, { color: 'white' }, summary.time)
        ),
        summary.message && React.createElement(Text, { color: 'cyan' }, truncateLine(summary.message, isCompact ? 72 : 120)),
        summary.statusLine && React.createElement(Text, { color: 'gray' }, truncateLine(summary.statusLine, isCompact ? 72 : 120)),
        renderHintSection('Retry', summary.retryHints, 'yellow', actionLimit),
        renderBindingSection(summary.bindingHint, actionLimit),
        renderActionSection('Follow-ups', summary.automationCandidates, 'green', actionLimit),
        renderActionSection('Next', summary.nextActions, 'blue', actionLimit)
      )
    )
  );
}

function renderHintSection(title, items, color, limit) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { color, bold: true }, title),
    items.slice(0, limit).map((item, index) =>
      React.createElement(Text, { key: `${title}-${index}`, color: 'gray' }, `${index + 1}. ${truncateLine(String(item), 100)}`)
    ),
    items.length > limit && React.createElement(Text, { color: 'gray' }, `... +${items.length - limit} more`)
  );
}

function renderBindingSection(bindingHint, limit) {
  if (!bindingHint || typeof bindingHint !== 'object') {
    return null;
  }

  const lines = [];
  if (bindingHint.message) {
    lines.push(bindingHint.message);
  }
  if (bindingHint.suggestedCommand) {
    lines.push(`cmd: ${bindingHint.suggestedCommand}`);
  }

  if (lines.length === 0) {
    return null;
  }

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { color: 'red', bold: true }, 'Binding'),
    lines.slice(0, limit).map((line, index) =>
      React.createElement(Text, { key: `binding-${index}`, color: 'gray' }, truncateLine(line, 100))
    )
  );
}

function renderActionSection(title, items, color, limit) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  return React.createElement(Box, { flexDirection: 'column', marginTop: 1 },
    React.createElement(Text, { color, bold: true }, title),
    items.slice(0, limit).map((item, index) =>
      React.createElement(Text, { key: `${title}-${index}`, color: 'gray' }, formatActionLine(index, item))
    ),
    items.length > limit && React.createElement(Text, { color: 'gray' }, `... +${items.length - limit} more`)
  );
}

function formatActionLine(index, item) {
  if (!item || typeof item !== 'object') {
    return `${index + 1}. ${String(item)}`;
  }

  const label = item.skill || item.name || item.action || `action-${index + 1}`;
  const detail = item.reason || item.suggestedInput || '';
  const configured = item.configured === true ? ' [ok]' : item.configured === false ? ' [bind]' : '';
  return truncateLine(`${index + 1}. ${label}${configured}${detail ? ` - ${detail}` : ''}`, 100);
}

function truncateLine(text, maxLength) {
  const value = String(text || '');
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function getLatestConversationSummary(flowmind) {
  const history = typeof flowmind?.getConversationHistory === 'function'
    ? flowmind.getConversationHistory()
    : Array.isArray(flowmind?.conversationHistory)
      ? flowmind.conversationHistory
      : [];

  const latestEntry = Array.isArray(history) && history.length > 0
    ? history[history.length - 1]
    : null;

  return summarizeConversationEntry(latestEntry);
}

function summarizeConversationEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const payload = unwrapResultPayload(entry.output || null);
  const data = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data
    : {};
  const summary = {
    skill: payload?.skill || entry.skill || entry.output?.metadata?.skill || 'unknown',
    time: formatTime(entry.timestamp || payload?.timestamp || null),
    message: payload?.message || entry.output?.message || null,
    statusLine: buildStatusLine(data),
    retryHints: Array.isArray(data.retryHints) ? data.retryHints : [],
    automationCandidates: Array.isArray(data.automationCandidates) ? data.automationCandidates : [],
    nextActions: Array.isArray(data.nextActions) ? data.nextActions : [],
    bindingHint: data.bindingHint || null
  };

  if (!summary.message && !summary.statusLine && summary.retryHints.length === 0
    && summary.automationCandidates.length === 0 && summary.nextActions.length === 0 && !summary.bindingHint) {
    return null;
  }

  return summary;
}

function buildStatusLine(data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const parts = [];
  if (data.action) {
    parts.push(`action=${data.action}`);
  }
  if (data.risk?.level) {
    parts.push(`risk=${data.risk.level}`);
  }
  if (data.summary?.failed !== undefined) {
    parts.push(`failed=${data.summary.failed}`);
  }
  if (data.summary?.succeeded !== undefined) {
    parts.push(`succeeded=${data.summary.succeeded}`);
  }
  if (data.deposition?.namespace) {
    parts.push(`namespace=${data.deposition.namespace}`);
  }
  if (data.slug) {
    parts.push(`slug=${data.slug}`);
  }

  return parts.length > 0 ? parts.join(' | ') : null;
}

function formatTime(timestamp) {
  if (!timestamp) return null;
  return new Date(timestamp).toTimeString().substring(0, 8);
}

module.exports = ResultHighlights;
module.exports.getLatestConversationSummary = getLatestConversationSummary;
module.exports.summarizeConversationEntry = summarizeConversationEntry;
