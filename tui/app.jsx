const React = require('react');
const { Box, Text, useApp, useInput } = require('ink');
const Sidebar = require('./components/Sidebar.jsx');
const ChatPanel = require('./components/ChatPanel.jsx');
const ResultPanel = require('./components/ResultPanel.jsx');
const StatusBar = require('./components/StatusBar.jsx');

function App({ flowmind }) {
  const [results, setResults] = React.useState([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const mountedRef = React.useRef(true);
  const { exit } = useApp();

  React.useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
  });

  const handleCommand = React.useCallback(async (input, addResponse) => {
    setIsProcessing(true);
    try {
      const result = await flowmind.process(input);
      if (!mountedRef.current) return;
      if (result.type === 'result') {
        const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        addResponse(text.substring(0, 200) + (text.length > 200 ? '...' : ''));
      } else if (result.type === 'learning') {
        addResponse(result.message || 'Learning recorded');
      } else if (result.type === 'error') {
        addResponse('Error: ' + result.message);
      }
      setResults(prev => [...prev, result]);
    } catch (e) {
      if (mountedRef.current) addResponse('Error: ' + e.message);
    } finally {
      if (mountedRef.current) setIsProcessing(false);
    }
  }, [flowmind]);

  const handleSkillSelect = React.useCallback((skill) => {
    try {
      setResults(prev => [...prev, {
        type: 'result',
        data: { name: skill.name, description: skill.definition?.description || 'No description', category: skill.category || 'general', path: skill.path },
        metadata: { skill: skill.name }
      }]);
    } catch (e) {
      // ignore skill select errors
    }
  }, []);

  return (
    React.createElement(Box, { flexDirection: 'column', width: '100%', height: '100%' },
      React.createElement(Box, { flexDirection: 'row', flexGrow: 1 },
        React.createElement(Sidebar, { flowmind: flowmind, width: 30, onSkillSelect: handleSkillSelect }),
        React.createElement(Box, { flexDirection: 'column', width: '70%', flexGrow: 1 },
          React.createElement(ChatPanel, { onSubmit: handleCommand, isProcessing: isProcessing, onExit: exit }),
          React.createElement(ResultPanel, { results: results })
        )
      ),
      React.createElement(StatusBar, { flowmind: flowmind })
    )
  );
}

module.exports = App;
