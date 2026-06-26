const React = require('react');
const { Box, Text, useInput } = require('ink');
const TextInput = require('ink-text-input').default || require('ink-text-input');
const Spinner = require('ink-spinner').default || require('ink-spinner');

function ChatPanel({ onSubmit, isProcessing, onExit }) {
  const [input, setInput] = React.useState('');
  const [history, setHistory] = React.useState([]);
  const [cmdHistory, setCmdHistory] = React.useState([]);
  const [historyIndex, setHistoryIndex] = React.useState(-1);
  const [savedInput, setSavedInput] = React.useState('');
  const mountedRef = React.useRef(true);

  React.useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Handle Up/Down arrow for command history
  useInput((ch, key) => {
    if (isProcessing) return;

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
    if (!value.trim()) return;
    setHistory(prev => [...prev, { role: 'user', text: value }]);
    // Add to command history (deduplicate consecutive)
    if (cmdHistory.length === 0 || cmdHistory[cmdHistory.length - 1] !== value) {
      setCmdHistory(prev => [...prev, value]);
    }
    setHistoryIndex(-1);
    setSavedInput('');
    setInput('');
    if (value.toLowerCase() === 'exit' || value.toLowerCase() === 'quit') {
      if (onExit) onExit();
      return;
    }
    try {
      onSubmit(value, (response) => {
        if (mountedRef.current) {
          setHistory(prev => [...prev, { role: 'flowmind', text: response }]);
        }
      });
    } catch (e) {
      if (mountedRef.current) {
        setHistory(prev => [...prev, { role: 'flowmind', text: 'Error: ' + e.message }]);
      }
    }
  };

  const displayHistory = history.slice(-20);

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'green', paddingX: 1 },
      React.createElement(Text, { bold: true, color: 'green' }, 'Command Input'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1, minHeight: 6 },
        displayHistory.length === 0 && React.createElement(Text, { color: 'gray' }, 'Type a command to get started. Type "exit" to quit.'),
        displayHistory.map((msg, i) =>
          React.createElement(Box, { key: i, flexDirection: 'column' },
            msg.role === 'user'
              ? React.createElement(Text, null,
                  React.createElement(Text, { color: 'green', bold: true }, '> '),
                  React.createElement(Text, { color: 'white' }, msg.text)
                )
              : React.createElement(Text, null,
                  React.createElement(Text, { color: 'cyan', bold: true }, '< '),
                  React.createElement(Text, { color: 'cyan' }, msg.text)
                )
          )
        )
      ),
      React.createElement(Box, { marginTop: 1 },
        isProcessing
          ? React.createElement(Text, { color: 'yellow' },
              React.createElement(Spinner, { type: 'dots' }),
              ' Processing...'
            )
          : React.createElement(Box, null,
              React.createElement(Text, { color: 'green', bold: true }, '> '),
              React.createElement(TextInput, { value: input, onChange: setInput, onSubmit: handleSubmit })
            )
      )
    )
  );
}

module.exports = ChatPanel;
