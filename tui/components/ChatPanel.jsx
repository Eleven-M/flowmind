const React = require('react');
const { Box, Text, useInput } = require('ink');
const TextInput = require('ink-text-input').default || require('ink-text-input');
const Spinner = require('ink-spinner').default || require('ink-spinner');
const { getBorderStyle, isExitCommand, sanitizeTerminalText } = require('../ui');

const MAX_MESSAGE_LINES = 6;
const MAX_STRUCTURED_MESSAGE_LINES = 20;
const MAX_MESSAGE_LINE_LENGTH = 120;

function ChatPanel({ messages, onSubmit, isProcessing, onExit, focused, asciiMode = false, width = 0, promptText = null, dense = false }) {
  const [input, setInput] = React.useState('');
  const [cmdHistory, setCmdHistory] = React.useState([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [savedInput, setSavedInput] = React.useState('');
  const isCompact = dense || width < 72;

  // Handle Up/Down arrow for command history (only when focused)
  useInput((ch, key) => {
    if (!focused || isProcessing) return;

    if (key.upArrow && cmdHistory.length > 0) {
      const newIndex = historyIndex === -1
        ? cmdHistory.length - 1
        : Math.max(0, historyIndex - 1);
      if (historyIndex === -1) setSavedInput(input);
      setHistoryIndex(newIndex);
      setInput(cmdHistory[newIndex]);
    } else if (key.downArrow) {
      if (historyIndex === -1) return;
      const newIndex = historyIndex + 1;
      if (newIndex >= cmdHistory.length) {
        setHistoryIndex(-1);
        setInput(savedInput);
      } else {
        setHistoryIndex(newIndex);
        setInput(cmdHistory[newIndex]);
      }
    }
  });

  const handleSubmit = (value) => {
    const normalized = value.trim();
    if (!normalized || isProcessing) return;
    // Add to command history (deduplicate consecutive)
    if (cmdHistory.length === 0 || cmdHistory[cmdHistory.length - 1] !== normalized) {
      setCmdHistory(prev => [...prev, normalized]);
    }
    setHistoryIndex(-1);
    setSavedInput('');
    setInput('');
    if (isExitCommand(normalized)) {
      if (onExit) onExit();
      return;
    }
    onSubmit(normalized);
  };

  const displayMessages = messages.slice(-(isCompact ? 5 : 10));

  const renderBody = (text, message) => {
    const raw = asciiMode ? sanitizeTerminalText(text) : String(text ?? '');
    return truncatePanelText(raw, getMessageLineLimit(message));
  };

  const renderMeta = (message) => {
    const metaParts = buildMessageMetaParts(message);

    if (metaParts.length === 0) return null;

    const displayMeta = asciiMode
      ? metaParts.map((part) => sanitizeTerminalText(part)).join(' | ')
      : metaParts.join(' | ');

    return React.createElement(
      Text,
      { color: 'gray' },
      displayMeta
    );
  };

  const renderMessage = (message) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';
    const accentColor = isUser ? 'green' : (isSystem ? 'yellow' : 'cyan');
    const bodyColor = isUser ? 'white' : (isSystem ? 'yellow' : 'cyan');
    const label = isUser ? 'You' : (isSystem ? 'FlowMind Guide' : 'FlowMind');
    const displayLabel = asciiMode ? sanitizeTerminalText(label) : label;
    const displayText = asciiMode ? sanitizeTerminalText(message.text) : message.text;

    return React.createElement(
      Box,
      { key: message.id, flexDirection: 'column', marginBottom: 1 },
      React.createElement(Text, { color: accentColor, bold: true }, displayLabel),
      renderMeta(message),
      React.createElement(Text, { color: bodyColor }, renderBody(displayText, message))
    );
  };

  return (
    React.createElement(Box, { flexDirection: 'column', flexGrow: 1, borderStyle: getBorderStyle(asciiMode), borderColor: focused ? 'green' : 'gray', paddingX: 1 },
      React.createElement(Text, { bold: true, color: focused ? 'green' : 'gray' }, focused ? 'Chat [Focused]' : 'Chat'),
      React.createElement(Text, { color: 'gray' }, isCompact ? 'Compact mode.' : 'Conversation stays here.'),
      promptText && React.createElement(Text, { color: 'yellow' }, asciiMode ? sanitizeTerminalText(promptText) : promptText),
      React.createElement(Box, { flexDirection: 'column', flexGrow: 1, marginTop: 1, overflow: 'hidden' },
        displayMessages.length === 0 && React.createElement(Box, { flexDirection: 'column' },
          React.createElement(Text, { color: 'gray' }, 'Describe the task.'),
          !isCompact && React.createElement(Text, { color: 'gray' }, 'History is trimmed to keep the view stable.'),
          React.createElement(Text, { color: 'gray' }, 'Type `exit` or `/exit` to quit, or press Ctrl+C.')
        ),
        displayMessages.map(renderMessage)
      ),
      React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: focused ? 'green' : 'gray', paddingX: 1, marginTop: 1 },
        React.createElement(Text, { color: 'gray' }, isCompact ? 'Enter send | Tab switch | Ctrl+C' : 'Enter send  Up/Down history  Tab switch  Ctrl+C'),
        isProcessing
          ? React.createElement(Text, { color: 'yellow' },
              React.createElement(Spinner, { type: 'dots' }),
              ' Working...'
            )
          : React.createElement(Box, null,
              React.createElement(Text, { color: focused ? 'green' : 'gray', bold: true }, '> '),
              React.createElement(TextInput, {
                value: input,
                onChange: setInput,
                onSubmit: handleSubmit,
                focus: focused,
                showCursor: focused,
                placeholder: focused
                  ? (isCompact ? 'Ask FlowMind...' : 'Ask FlowMind to do something...')
                  : 'Press Tab to focus input'
              })
            )
      )
    )
  );
}

function buildMessageMetaParts(message) {
  const metaParts = [];
  const skill = message?.metadata?.skill || '';
  const label = message?.metadata?.label || humanizeSkillLabel(skill);

  if (label) metaParts.push(label);
  if (message?.metadata?.duration) metaParts.push(message.metadata.duration + 'ms');
  if (message?.metadata?.scene) metaParts.push('场景: ' + message.metadata.scene);
  if (message?.metadata?.aiProvider) {
    metaParts.push(`模型: ${message.metadata.aiProvider}${message.metadata.aiModel ? ` / ${message.metadata.aiModel}` : ''}`);
  }

  return metaParts;
}

function humanizeSkillLabel(skill) {
  const labels = {
    'ai-status': 'AI 状态',
    'ai-fallback': 'AI 回复'
  };

  return labels[skill] || skill || '';
}

function getMessageLineLimit(message) {
  const skill = message?.metadata?.skill;
  const structuredSkillSet = new Set([
    'log-audit',
    'change-impact-review',
    'data-risk-audit',
    'report-insights',
    'build-report',
    'test-report',
    'coverage-report',
    'knowledge-ops'
  ]);

  if (structuredSkillSet.has(skill)) {
    if (message?.metadata?.expanded) {
      return 1000;
    }
    return MAX_STRUCTURED_MESSAGE_LINES;
  }

  return MAX_MESSAGE_LINES;
}

function truncatePanelText(text, maxLines = MAX_MESSAGE_LINES) {
  const lines = String(text ?? '').split(/\r?\n/);
  const limitedLines = lines.slice(0, maxLines).map((line) => {
    if (line.length <= MAX_MESSAGE_LINE_LENGTH) {
      return line;
    }
    return line.slice(0, MAX_MESSAGE_LINE_LENGTH - 1) + '…';
  });

  if (lines.length > maxLines) {
    limitedLines.push('… truncated ' + (lines.length - maxLines) + ' line(s)');
  }

  return limitedLines.join('\n');
}

module.exports = ChatPanel;
module.exports.truncatePanelText = truncatePanelText;
module.exports.getMessageLineLimit = getMessageLineLimit;
module.exports.buildMessageMetaParts = buildMessageMetaParts;
