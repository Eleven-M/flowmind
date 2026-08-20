const React = require('react');
const { Box, Text } = require('ink');
const { LEVEL_NAMES, getBorderStyle, getStatusDot } = require('../ui');

function StatusBar({ flowmind, focusPanel, asciiMode = false, width = 0 }) {
  const [aiStatus, setAiStatus] = React.useState(null);
  const [componentStatus, setComponentStatus] = React.useState(null);
  const [honorData, setHonorData] = React.useState(null);
  const isCompact = width < 100;

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
  const aiModel = aiStatus?.defaultModel || 'auto';
  const aiOk = aiStatus?.health || (aiStatus?.initialized ? 'ready' : 'off');
  const componentCount = componentStatus ? Object.keys(componentStatus).length : 0;
  const activeCount = componentStatus ? Object.values(componentStatus).filter(c => c.active).length : 0;
  const level = honorData?.level || 0;
  const points = honorData?.points || 0;
  const statusText = [
    `AI ${aiName}/${aiModel} ${aiOk}${getStatusDot(aiOk === 'ready', asciiMode)}`,
    `Comp ${activeCount}/${componentCount}`,
    `Honor ${LEVEL_NAMES[level]} (${points} pts)`,
    `Focus ${focusPanel || 'chat'}`
  ];

  return (
    React.createElement(Box, { flexDirection: 'column', borderStyle: getBorderStyle(asciiMode), borderColor: 'gray', paddingX: 1 },
      React.createElement(Text, null,
        React.createElement(Text, { color: 'gray' }, statusText.join('  |  '))
      ),
      React.createElement(Text, { color: 'gray' }, isCompact ? 'Enter send | Tab switch | Ctrl+C' : 'Enter send | Tab switch | Ctrl+C | /exit')
    )
  );
}

module.exports = StatusBar;
