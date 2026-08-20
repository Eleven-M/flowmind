const React = require('react');
const { Box, Text } = require('ink');

function ResultPanel({ results }) {
  const displayResults = results.slice(-30);

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: 'single', borderColor: 'yellow', paddingX: 1, flexGrow: 1 },
      React.createElement(Text, { bold: true, color: 'yellow' }, 'Results'),
      React.createElement(Box, { flexDirection: 'column', marginTop: 1, overflow: 'hidden' },
        displayResults.length === 0 && React.createElement(Text, { color: 'gray' }, 'No results yet. Execute a command to see output here.'),
        displayResults.map((result, i) =>
          React.createElement(Box, { key: i, flexDirection: 'column', marginBottom: 1 },
            result.type === 'result' && React.createElement(React.Fragment, null,
              result.metadata?.skill && React.createElement(Text, null,
                React.createElement(Text, { color: 'gray' }, 'Skill: '),
                React.createElement(Text, { color: 'green' }, result.metadata.skill),
                result.metadata?.duration && React.createElement(Text, { color: 'gray' }, ' (' + result.metadata.duration + 'ms)')
              ),
              React.createElement(Text, { color: 'white' },
                typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
              )
            ),
            result.type === 'learning' && React.createElement(Text, { color: 'cyan' }, result.message),
            result.type === 'error' && React.createElement(Text, { color: 'red' }, 'Error: ' + result.message)
          )
        )
      )
    )
  );
}

module.exports = ResultPanel;
