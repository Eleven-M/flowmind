const React = require('react');
const { Box, Text } = require('ink');
const TextInput = require('ink-text-input');
const Spinner = require('ink-spinner');

function ChatPanel({ onSubmit, isProcessing }) {
  const [input, setInput] = React.useState('');
  const [history, setHistory] = React.useState([]);

  const handleSubmit = (value) => {
    if (!value.trim()) return;
    setHistory(prev => [...prev, { role: 'user', text: value }]);
    setInput('');
    if (value.toLowerCase() === 'exit' || value.toLowerCase() === 'quit') process.exit(0);
    onSubmit(value, (response) => {
      setHistory(prev => [...prev, { role: 'flowmind', text: response }]);
    });
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
