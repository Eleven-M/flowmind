const React = require('react');
const { Box, Text, useApp, useInput } = require('ink');
const Sidebar = require('./components/Sidebar.jsx');
const ChatPanel = require('./components/ChatPanel.jsx');
const ResultPanel = require('./components/ResultPanel.jsx');
const StatusBar = require('./components/StatusBar.jsx');

function App({ flowmind }) {
  const [results, setResults] = React.useState([]);
  const [isProcessing, setIsProcessing] = React.useState(false);
  const [focusPanel, setFocusPanel] = React.useState('chat'); // 'chat' | 'sidebar'
  const mountedRef = React.useRef(true);
  const { exit } = useApp();

  React.useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // Ctrl+C always exits; Tab switches focus between panels
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit();
    if (key.tab) {
      setFocusPanel(prev => prev === 'chat' ? 'sidebar' : 'chat');
    }
  });

  const handleCommand = React.useCallback(async (input, addResponse) => {
    if (!mountedRef.current) return;
    setIsProcessing(true);
    try {
      const result = await flowmind.process(input);
      if (!mountedRef.current) return;
      if (result.type === 'result') {
        const text = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
        addResponse(text);
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
    if (!mountedRef.current) return;
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
        React.createElement(Sidebar, { flowmind: flowmind, width: 30, onSkillSelect: handleSkillSelect, focused: focusPanel === 'sidebar' }),
        React.createElement(Box, { flexDirection: 'column', width: '70%', flexGrow: 1 },
          React.createElement(ChatPanel, { onSubmit: handleCommand, isProcessing: isProcessing, onExit: exit, focused: focusPanel === 'chat' }),
          React.createElement(ResultPanel, { results: results })
        )
      ),
      React.createElement(StatusBar, { flowmind: flowmind, focusPanel: focusPanel })
    )
  );
}

module.exports = App;
