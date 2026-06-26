const React = require('react');
const { Box, Text } = require('ink');

const LEVEL_NAMES = ['Egg', 'Hatchling', 'Juvenile', 'Adult', 'Elder', 'Ascended'];

function StatusBar({ flowmind }) {
  const [aiStatus, setAiStatus] = React.useState(null);
  const [componentStatus, setComponentStatus] = React.useState(null);
  const [honorData, setHonorData] = React.useState(null);

  React.useEffect(() => {
    if (flowmind) {
      try {
        setAiStatus(flowmind.getAIStatus());
        setComponentStatus(flowmind.getComponentStatus());
        setHonorData(flowmind.getHonorData());
      } catch (e) { /* Non-blocking */ }
    }
  }, [flowmind]);

  const aiName = aiStatus?.defaultProvider || 'none';
  const aiOk = aiStatus?.initialized || false;
  const componentCount = componentStatus ? Object.keys(componentStatus).length : 0;
  const activeCount = componentStatus ? Object.values(componentStatus).filter(c => c.active).length : 0;
  const level = honorData?.level || 0;
  const points = honorData?.points || 0;

  return (
    React.createElement(Box, { borderStyle: 'single', borderColor: 'gray', paddingX: 1, justifyContent: 'space-between' },
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'AI: '),
        React.createElement(Text, { color: aiOk ? 'green' : 'red' }, aiName),
        React.createElement(Text, { color: aiOk ? 'green' : 'red' }, aiOk ? ' \u25CF' : ' \u25CB')
      ),
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Components: '),
        React.createElement(Text, { color: 'white' }, activeCount + '/' + componentCount),
        React.createElement(Text, { color: 'green' }, ' active')
      ),
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, 'Honor: '),
        React.createElement(Text, { color: 'yellow' }, LEVEL_NAMES[level]),
        React.createElement(Text, { color: 'gray' }, ' (' + points + ' pts)')
      )
    )
  );
}

module.exports = StatusBar;
